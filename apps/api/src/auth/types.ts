import { z } from "zod";

export const userRoles = ["carrier", "consultant", "master"] as const;
export const userRoleSchema = z.enum(userRoles);
export type UserRole = (typeof userRoles)[number];

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  // The carrier company for carriers; null for consultancy staff.
  companyId: string | null;
};

export type SessionRecord = {
  userId: string;
  createdAt: number;
  expiresAt: number;
  csrfToken: string;
};

export type RequestAuth = {
  user: AuthenticatedUser;
  session: SessionRecord;
};

declare module "fastify" {
  interface FastifyRequest {
    auth?: RequestAuth;
  }
}
