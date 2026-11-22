// Administrator routes for carrier companies and user accounts. Master role only.
// Nothing here deletes data: companies and users are suspended or reactivated.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AccountError, type Accounts } from "../db/accounts.ts";
import type { CredentialStore } from "../db/credentials.ts";
import { INVITATION_HOURS, RESET_HOURS } from "./service.ts";
import { userRoleSchema } from "./types.ts";

const idParams = z.object({ id: z.string().uuid() });
const newCarrier = z
  .object({
    legalName: z.string().trim().min(1).max(200),
    displayName: z.string().trim().min(1).max(200),
  })
  .strict();
const newUser = z
  .object({
    email: z.string().trim().email().max(320),
    displayName: z.string().trim().min(1).max(200),
    role: userRoleSchema,
    carrierId: z.string().uuid().optional(),
  })
  .strict();
const carrierStatus = z
  .object({ status: z.enum(["active", "suspended", "archived"]) })
  .strict();
const userStatus = z
  .object({ status: z.enum(["active", "suspended"]) })
  .strict();

export type AdminRoutesOptions = {
  accounts: Accounts;
  credentials: CredentialStore;
  appOrigin: string;
};

export function registerAdminRoutes(
  app: FastifyInstance,
  options: AdminRoutesOptions,
): void {
  const { accounts, credentials, appOrigin } = options;
  const existingUser = async (params: unknown) => {
    const { id } = idParams.parse(params);
    if (!(await credentials.findById(id)))
      throw new AccountError("User not found.");
    return { id };
  };
  const linkTo = (path: string, token: string) =>
    new URL(`${path}?token=${token}`, appOrigin).toString();

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AccountError) {
      return reply.code(409).send({ message: error.message });
    }
    throw error;
  });

  app.get("/api/admin/carriers", () => accounts.listCarriers());
  app.post("/api/admin/carriers", async (request, reply) => {
    const body = newCarrier.parse(request.body);
    const created = await accounts.createCarrier(
      body.legalName,
      body.displayName,
    );
    return reply.code(201).send(created);
  });
  app.patch("/api/admin/carriers/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    await accounts.setCarrierStatus(
      id,
      carrierStatus.parse(request.body).status,
    );
    return { ok: true };
  });

  app.get("/api/admin/users", () => accounts.listUsers());
  app.post("/api/admin/users", async (request, reply) => {
    const created = await accounts.createUser(newUser.parse(request.body));
    const token = await credentials.issueLink(
      created.id,
      "invitation",
      INVITATION_HOURS,
    );
    return reply.code(201).send({
      ...created,
      invitationLink: linkTo("/accept-invitation", token),
    });
  });
  app.patch("/api/admin/users/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    await accounts.setUserStatus(
      id,
      userStatus.parse(request.body).status,
      request.auth?.user.id,
    );
    return { ok: true };
  });

  // Links are shown once and are not sent by e-mail: the administrator passes them on.
  app.post("/api/admin/users/:id/invitation", async (request) => {
    const { id } = await existingUser(request.params);
    const token = await credentials.issueLink(
      id,
      "invitation",
      INVITATION_HOURS,
    );
    return {
      link: linkTo("/accept-invitation", token),
      validHours: INVITATION_HOURS,
    };
  });
  app.post("/api/admin/users/:id/password-reset", async (request) => {
    const { id } = await existingUser(request.params);
    const token = await credentials.issueLink(
      id,
      "password_reset",
      RESET_HOURS,
    );
    return { link: linkTo("/reset-password", token), validHours: RESET_HOURS };
  });
}
