import type { FastifyRequest } from "fastify";
import { type Principal, principalSchema } from "./storage/types.ts";

type AuthenticatedRequest = FastifyRequest & { principal?: Principal };

export type PrincipalResolver = (
  request: FastifyRequest,
) => Promise<Principal | null>;

export function requestPrincipalResolver(
  request: FastifyRequest,
): Promise<Principal | null> {
  const candidate = (request as AuthenticatedRequest).principal;
  const parsed = principalSchema.safeParse(candidate);
  return Promise.resolve(parsed.success ? parsed.data : null);
}
