// This file decides who may see a tender at all. Carriers must hold a live invitation;
// anyone else gets "not found", so a rival cannot learn that a tender exists.

import type { Principal, Tender } from "@freight-desk/shared";
import type { AppDeps } from "../deps.ts";
import { AppError } from "../errors.ts";
import { loadInvitations, loadTender } from "./repository.ts";

const NOT_FOUND = () => new AppError("NOT_FOUND", "That tender was not found.");
const LIVE_INVITATION_STATES = ["invited", "accepted"];

export async function isCarrierInvited(
  deps: AppDeps,
  tenderId: string,
  companyId: string,
): Promise<boolean> {
  const file = await loadInvitations(deps.store, tenderId);
  return (file?.data ?? []).some(
    (invitation) =>
      invitation.carrierCompanyId === companyId &&
      LIVE_INVITATION_STATES.includes(invitation.state),
  );
}

// Returns the tender if this person may see it. Carriers also need draft tenders hidden.
export async function loadVisibleTender(
  deps: AppDeps,
  principal: Principal,
  tenderId: string,
): Promise<Tender> {
  const tender = await loadTender(deps.store, tenderId);
  if (!tender) throw NOT_FOUND();
  if (principal.role !== "carrier") return tender.data;
  const companyId = principal.carrierCompanyId;
  if (!companyId || tender.data.status === "draft") throw NOT_FOUND();
  if (!(await isCarrierInvited(deps, tenderId, companyId))) throw NOT_FOUND();
  return tender.data;
}
