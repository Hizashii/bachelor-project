import { z } from "zod";
import type {
  AuthenticatedUser,
  ExternalIdentity,
  TrustedDirectoryUser,
} from "./types.ts";
import { trustedDirectoryUserSchema } from "./types.ts";

export const carrierCompanyIds = [
  "carrier-blue-fjord",
  "carrier-northstar",
] as const;
const carrierCompanyIdSet = new Set<string>(carrierCompanyIds);

export const mockIdentityKeys = ["carrier", "consultant", "master"] as const;
export type MockIdentityKey = (typeof mockIdentityKeys)[number];

export const mockIdentityOptions = [
  {
    key: "carrier",
    label: "Carrier demo",
    email: "carrier.user@demo.freightdesk.test",
  },
  {
    key: "consultant",
    label: "Consultant demo",
    email: "consultant.user@demo.freightdesk.test",
  },
  {
    key: "master",
    label: "Master demo",
    email: "master.user@demo.freightdesk.test",
  },
] as const;

const mockDirectoryUsers: TrustedDirectoryUser[] = [
  {
    id: "user-carrier-demo",
    subject: "mock-subject-carrier",
    tenantId: "mock-tenant",
    email: "carrier.user@demo.freightdesk.test",
    displayName: "Carrier Demo User",
    role: "carrier",
    companyId: "carrier-blue-fjord",
    active: true,
  },
  {
    id: "user-consultant-demo",
    subject: "mock-subject-consultant",
    tenantId: "mock-tenant",
    email: "consultant.user@demo.freightdesk.test",
    displayName: "Consultant Demo User",
    role: "consultant",
    companyId: null,
    active: true,
  },
  {
    id: "user-master-demo",
    subject: "mock-subject-master",
    tenantId: "mock-tenant",
    email: "master.user@demo.freightdesk.test",
    displayName: "Master Demo User",
    role: "master",
    companyId: null,
    active: true,
  },
];

export interface UserDirectory {
  findByExternalIdentity(
    identity: Pick<ExternalIdentity, "subject" | "tenantId">,
  ): Promise<TrustedDirectoryUser | null>;
  findById(id: string): Promise<TrustedDirectoryUser | null>;
}

export class InMemoryUserDirectory implements UserDirectory {
  private readonly usersById: ReadonlyMap<string, TrustedDirectoryUser>;

  public constructor(
    users: readonly TrustedDirectoryUser[] = mockDirectoryUsers,
  ) {
    const validatedUsers = users.map((user) =>
      trustedDirectoryUserSchema.parse(user),
    );
    for (const user of validatedUsers) {
      if (
        user.role === "carrier" &&
        (!user.companyId || !carrierCompanyIdSet.has(user.companyId))
      ) {
        throw new Error(
          `Carrier user ${user.id} must reference a validated carrier company.`,
        );
      }
      if (user.role !== "carrier" && user.companyId !== null) {
        throw new Error(
          `Non-carrier user ${user.id} cannot reference a carrier company.`,
        );
      }
    }

    this.usersById = new Map(validatedUsers.map((user) => [user.id, user]));
  }

  public async findByExternalIdentity(
    identity: Pick<ExternalIdentity, "subject" | "tenantId">,
  ): Promise<TrustedDirectoryUser | null> {
    return (
      [...this.usersById.values()].find(
        (user) =>
          user.subject === identity.subject &&
          user.tenantId === identity.tenantId,
      ) ?? null
    );
  }

  public async findById(id: string): Promise<TrustedDirectoryUser | null> {
    return this.usersById.get(id) ?? null;
  }
}

const directoryArraySchema = z.array(trustedDirectoryUserSchema);

export function createUserDirectory(
  serializedUsers?: string,
): InMemoryUserDirectory {
  if (!serializedUsers) return new InMemoryUserDirectory();

  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedUsers);
  } catch {
    throw new Error("AUTHORIZED_USERS_JSON must contain valid JSON.");
  }

  return new InMemoryUserDirectory(directoryArraySchema.parse(parsed));
}

export function mockExternalIdentity(key: MockIdentityKey): ExternalIdentity {
  const directoryUser = mockDirectoryUsers.find((user) => user.role === key);
  if (!directoryUser) throw new Error(`No mock identity exists for ${key}.`);

  return {
    subject: directoryUser.subject,
    tenantId: directoryUser.tenantId,
    email: directoryUser.email,
    displayName: directoryUser.displayName,
    mfaVerified: true,
  };
}

export function toAuthenticatedUser(
  user: TrustedDirectoryUser,
  mfaVerified: boolean,
): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    companyId: user.companyId,
    mfaVerified,
  };
}
