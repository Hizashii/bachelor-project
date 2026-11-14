// Contracts the processing and tariff code relies on but does not implement.
// The sign-in work provides AccessContext and PermissionChecker; the SharePoint work
// provides FileStore. Code here only ever talks to these interfaces.

import type { UserRole } from "@freight-desk/shared";

// Who is calling. Always taken from the signed-in session, never from the request body.
export type AccessContext = {
  userId: string;
  organisationId: string;
  role: UserRole;
};

export type ImportAction =
  | "import:upload"
  | "import:read"
  | "tariff:edit"
  | "tariff:submit"
  | "tariff:approve"
  | "tariff:read"
  | "price:calculate";

export type ResourceRef = { organisationId: string };

export interface PermissionChecker {
  can(
    context: AccessContext,
    action: ImportAction,
    resource: ResourceRef,
  ): boolean;
}
