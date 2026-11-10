// Turns the signed-in user into what the other layers need: the SharePoint principal
// (what files the user may touch) and the organisation that owns their data.

import { destinationKey, type Principal } from "../storage/types.ts";
import type { AuthenticatedUser } from "./types.ts";

// Consultancy staff belong to Slinkert & Aarøe itself; carriers belong to their company.
export const CONSULTANCY_ORGANISATION_ID = "slinkert-aaroe";

export function organisationOf(user: AuthenticatedUser): string {
  return user.role === "carrier"
    ? (user.companyId ?? "")
    : CONSULTANCY_ORGANISATION_ID;
}

// Staff may use every folder; a carrier only its own tariff folder and carrier imports.
function allowedDestinations(user: AuthenticatedUser): string[] {
  if (user.role !== "carrier") return ["*"];
  return [
    destinationKey({ kind: "inbound-carrier-imports" }),
    destinationKey({
      kind: "carrier-tariffs",
      carrierId: user.companyId ?? "",
    }),
  ];
}

export function principalOf(user: AuthenticatedUser): Principal | null {
  const organizationId = organisationOf(user);
  if (!organizationId) return null;
  const staff = user.role !== "carrier";
  return {
    userId: user.id,
    organizationId,
    allowedDestinationKeys: allowedDestinations(user),
    permissions: {
      readFiles: true,
      readOrganisationFiles: staff,
      uploadFiles: true,
      deleteFiles: staff,
      deleteOrganisationFiles: user.role === "master",
    },
  };
}
