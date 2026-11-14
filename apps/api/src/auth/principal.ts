// Turns the signed-in user into what the other layers need: the access context that
// owns their data and the SharePoint principal that says which folders they may use.

import { destinationKey, type Principal } from "../storage/types.ts";
import type { AccessContext } from "./permissions.ts";
import type { AuthenticatedUser } from "./types.ts";

// Consultancy staff belong to Slinkert & Aarøe itself; carriers belong to their company.
export const CONSULTANCY_ORGANISATION_ID = "slinkert-aaroe";

export function accessContextOf(user: AuthenticatedUser): AccessContext {
  const organisationId =
    user.role === "carrier"
      ? (user.companyId ?? "")
      : CONSULTANCY_ORGANISATION_ID;
  return { userId: user.id, organisationId, role: user.role };
}

// Staff may use every folder; a carrier only its own tariff folder and carrier imports.
function allowedDestinations(context: AccessContext): string[] {
  if (context.role !== "carrier") return ["*"];
  return [
    destinationKey({ kind: "inbound-carrier-imports" }),
    destinationKey({
      kind: "carrier-tariffs",
      carrierId: context.organisationId,
    }),
  ];
}

export function principalOf(context: AccessContext): Principal | null {
  if (!context.organisationId) return null;
  const staff = context.role !== "carrier";
  return {
    userId: context.userId,
    organizationId: context.organisationId,
    allowedDestinationKeys: allowedDestinations(context),
    permissions: {
      readFiles: true,
      readOrganisationFiles: staff,
      uploadFiles: true,
      deleteFiles: staff,
      deleteOrganisationFiles: context.role === "master",
    },
  };
}

// Freight workflows (imports, tariffs) store every file as Slinkert & Aarøe's own data, so
// staff can read what carriers submit. Who may touch which carrier's data is decided by
// the PermissionChecker before storage is called, not by this principal.
export function workflowPrincipalOf(context: AccessContext): Principal {
  return {
    userId: context.userId,
    organizationId: CONSULTANCY_ORGANISATION_ID,
    allowedDestinationKeys: ["*"],
    permissions: {
      readFiles: true,
      readOrganisationFiles: true,
      uploadFiles: true,
      deleteFiles: false,
      deleteOrganisationFiles: false,
    },
  };
}
