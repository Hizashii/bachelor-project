// This file manages which carrier companies a draft tender invites.
// Picking carriers writes invitations.json only; nobody is emailed until the tender is published.

import type { Invitation, Principal } from "@freight-desk/shared";
import type { AppDeps } from "../deps.ts";
import { AppError } from "../errors.ts";
import { assertDraft, requireTender } from "../tenders/draft.ts";
import { loadInvitations, saveInvitations } from "../tenders/repository.ts";
import { loadCompany, loadContact } from "./repository.ts";

async function assertActiveCompanies(deps: AppDeps, ids: string[]) {
  for (const id of ids) {
    const company = await loadCompany(deps.store, id);
    if (company?.status !== "active") {
      throw new AppError("VALIDATION_FAILED", "Pick active carriers only.", [
        { path: "companyIds", message: "Carrier not available." },
      ]);
    }
  }
}

export async function setInvitedCarriers(
  deps: AppDeps,
  principal: Principal,
  tenderId: string,
  companyIds: string[],
): Promise<Invitation[]> {
  assertDraft((await requireTender(deps, tenderId)).data);
  const ids = [...new Set(companyIds)];
  await assertActiveCompanies(deps, ids);
  const stored = await loadInvitations(deps.store, tenderId);
  const kept = new Map(stored?.data.map((i) => [i.carrierCompanyId, i]));
  const now = deps.clock.now().toISOString();
  const next: Invitation[] = ids.map(
    (carrierCompanyId) =>
      kept.get(carrierCompanyId) ?? {
        id: deps.ids.newId(),
        tenderId,
        carrierCompanyId,
        invitedByUserId: principal.userId,
        state: "invited",
        invitedAtUtc: now,
        respondedAtUtc: null,
      },
  );
  await saveInvitations(deps.store, tenderId, next, stored?.etag ?? null);
  return next;
}

// Counts live invitations whose company has a contact email on file.
export async function countReachable(
  deps: AppDeps,
  tenderId: string,
): Promise<number> {
  const invitations = (await loadInvitations(deps.store, tenderId))?.data ?? [];
  const live = invitations.filter((i) => i.state === "invited");
  const contacts = await Promise.all(
    live.map((i) => loadContact(deps.store, i.carrierCompanyId)),
  );
  return contacts.filter((contact) => contact !== null).length;
}
