// What a signed-in user may do with freight workflows (file imports, tariffs, prices).
// Carriers work only on their own company's tariffs. Consultancy staff may do everything
// the workflows offer. Anything not listed is denied.

import type { UserRole } from "./types.ts";

// Who is calling, taken from the session and never from a request body.
export type AccessContext = {
  userId: string;
  organisationId: string;
  role: UserRole;
};

export type FreightAction =
  | "import:upload"
  | "import:read"
  | "tariff:edit"
  | "tariff:submit"
  | "tariff:approve"
  | "tariff:read"
  | "price:calculate"
  | "tender:read"
  | "tender:create"
  | "tender:edit"
  | "tender:bid";

export type ResourceRef = {
  organisationId: string;
  invitedCarrierCompanyIds?: readonly string[];
};

export interface PermissionChecker {
  can(
    context: AccessContext,
    action: FreightAction,
    resource: ResourceRef,
  ): boolean;
}

const CARRIER_ACTIONS: readonly FreightAction[] = [
  "tariff:edit",
  "tariff:submit",
  "tariff:read",
  "tender:read",
  "tender:bid",
];

export const permissions: PermissionChecker = {
  can(context, action, resource) {
    if (!context.organisationId) return false;
    if (context.role === "carrier") {
      if (action === "tender:read") {
        return (
          resource.invitedCarrierCompanyIds?.includes(context.organisationId) ??
          false
        );
      }
      return (
        context.organisationId === resource.organisationId &&
        CARRIER_ACTIONS.includes(action)
      );
    }
    return true;
  },
};
