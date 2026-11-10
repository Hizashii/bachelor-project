import { z } from "zod";

export const userRoles = ["carrier", "consultant", "master"] as const;
export const userRoleSchema = z.enum(userRoles);
export type UserRole = (typeof userRoles)[number];

export const trustedDirectoryUserSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  tenantId: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  role: userRoleSchema,
  companyId: z.string().min(1).nullable(),
  active: z.boolean().default(true),
});

export type TrustedDirectoryUser = z.infer<typeof trustedDirectoryUserSchema>;

export type ExternalIdentity = {
  subject: string;
  tenantId: string;
  email: string;
  displayName: string;
  mfaVerified: boolean;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  companyId: string | null;
  mfaVerified: boolean;
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
