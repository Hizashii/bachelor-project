import { timingSafeEqual } from "node:crypto";
import type { FastifyRequest, preHandlerHookHandler } from "fastify";
import type { ApiEnvironment } from "../config/env.ts";
import { AuthError, type AuthService } from "./service.ts";
import type { UserRole } from "./types.ts";

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

export type TenderResource = {
  invitedCarrierCompanyIds: readonly string[];
};

export type OfferResource = {
  carrierCompanyId: string;
};

export function canAccessCompany(
  user: { role: UserRole; companyId: string | null },
  companyId: string,
): boolean {
  return user.role !== "carrier" || user.companyId === companyId;
}

export function canAccessTender(
  user: { role: UserRole; companyId: string | null },
  tender: TenderResource,
): boolean {
  return (
    user.role !== "carrier" ||
    (user.companyId !== null &&
      tender.invitedCarrierCompanyIds.includes(user.companyId))
  );
}

export function canAccessOffer(
  user: { role: UserRole; companyId: string | null },
  offer: OfferResource,
): boolean {
  return user.role !== "carrier" || user.companyId === offer.carrierCompanyId;
}

export function requireAuth(authService: AuthService): preHandlerHookHandler {
  return async (request, reply) => {
    const cookieValue = request.cookies[authService.sessionCookieName];
    const auth = await authService.authenticate(cookieValue);
    if (!auth) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
    request.auth = auth;
  };
}

export function requireRole(
  ...roles: readonly UserRole[]
): preHandlerHookHandler {
  return async (request, _reply) => {
    if (!request.auth)
      throw new AuthError(
        "unauthenticated",
        "Authentication is required.",
        401,
      );
    if (!roles.includes(request.auth.user.role)) {
      throw new AuthError(
        "forbidden",
        "The signed-in user is not allowed to access this resource.",
        403,
      );
    }
  };
}

export function requireCompanyAccess(
  paramName = "companyId",
): preHandlerHookHandler {
  return async (request) => {
    if (!request.auth)
      throw new AuthError(
        "unauthenticated",
        "Authentication is required.",
        401,
      );
    const params = request.params as Record<string, string>;
    const companyId = params[paramName];
    if (!companyId || !canAccessCompany(request.auth.user, companyId)) {
      throw new AuthError(
        "forbidden",
        "The signed-in user cannot access this company.",
        403,
      );
    }
  };
}

function assertCsrf(request: FastifyRequest, environment: ApiEnvironment) {
  if (!request.auth)
    throw new AuthError("unauthenticated", "Authentication is required.", 401);

  const origin = request.headers.origin;
  const csrfHeader = request.headers["x-csrf-token"];
  const csrfToken = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
  const expected = request.auth.session.csrfToken;
  if (
    origin !== new URL(environment.APP_ORIGIN).origin ||
    !csrfToken ||
    !constantTimeEqual(csrfToken, expected)
  ) {
    throw new AuthError(
      "csrf_failed",
      "The request failed CSRF validation.",
      403,
    );
  }
}

export function requireCsrf(
  environment: ApiEnvironment,
): preHandlerHookHandler {
  return async (request) => assertCsrf(request, environment);
}

// For route groups with both reads and writes: only requests that change data are checked.
export function requireCsrfOnWrites(
  environment: ApiEnvironment,
): preHandlerHookHandler {
  return async (request) => {
    if (SAFE_METHODS.includes(request.method)) return;
    assertCsrf(request, environment);
  };
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
