// This file answers one question: may this role do this action? Unknown means no.
// Company, invitation, deadline and sealed-bid checks happen next to the data, not here.

import type { Principal, UserRole } from "@freight-desk/shared";

const CONSULTANT_UP: UserRole[] = ["consultant", "master"];

export const ACTION_ROLES = {
  "tender:manage": CONSULTANT_UP,
  "tender:read_invited": ["carrier"],
  "tender:read_all": CONSULTANT_UP,
  "invitation:manage": CONSULTANT_UP,
  "bid:edit_own": ["carrier"],
  "bid:read_own": ["carrier"],
  "bid:read_opened": CONSULTANT_UP,
  "bid:unseal": ["master"],
  "comparison:read": CONSULTANT_UP,
  "award:manage": CONSULTANT_UP,
  "award:read_own": ["carrier"],
  "export:create": CONSULTANT_UP,
  "audit:read": ["master"],
  "job:run": ["master"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Action = keyof typeof ACTION_ROLES;

export function can(principal: Principal | null, action: Action): boolean {
  if (!principal) return false;
  const roles: readonly UserRole[] | undefined = ACTION_ROLES[action];
  if (!roles?.includes(principal.role)) return false;
  // A carrier without a company is always refused.
  return principal.role !== "carrier" || principal.carrierCompanyId !== null;
}
