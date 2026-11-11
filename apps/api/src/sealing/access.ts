// This file is the ONLY way consultant-side code may read submitted bids.
// Bids stay sealed until the tender is closed, or the master unseals it with a reason.
// Carriers never use this; they read their own offer through their own endpoints.

import {
  currentPointerSchema,
  type Principal,
  type StoredBid,
  storedBidSchema,
} from "@freight-desk/shared";
import type { AppDeps } from "../deps.ts";
import { AppError } from "../errors.ts";
import { currentPointerFile, versionFile } from "../storage/paths.ts";
import { loadInvitations, loadTender } from "../tenders/repository.ts";
import { closeTender, isPastDeadline, SYSTEM_ACTOR } from "./closing.ts";
import { isUnsealed } from "./unseal.ts";

const LIVE_INVITATION_STATES = ["invited", "accepted"];
const OPENED_STATUSES = ["closed", "awarded", "archived"];

async function liveCompanyIds(
  deps: AppDeps,
  tenderId: string,
): Promise<string[]> {
  const file = await loadInvitations(deps.store, tenderId);
  const live = (file?.data ?? []).filter((invitation) =>
    LIVE_INVITATION_STATES.includes(invitation.state),
  );
  return [...new Set(live.map((invitation) => invitation.carrierCompanyId))];
}

async function effectiveBid(
  deps: AppDeps,
  tenderId: string,
  companyId: string,
): Promise<StoredBid | null> {
  const pointer = await deps.store.readJson(
    currentPointerFile(tenderId, companyId),
  );
  if (!pointer) return null;
  const { versionNumber } = currentPointerSchema.parse(pointer.data);
  const file = await deps.store.readJson(
    versionFile(tenderId, companyId, versionNumber),
  );
  if (!file) return null;
  const bid = storedBidSchema.parse(file.data);
  return bid.withdrawnAtUtc === null ? bid : null;
}

async function effectiveBids(
  deps: AppDeps,
  tenderId: string,
): Promise<StoredBid[]> {
  const bids: StoredBid[] = [];
  for (const companyId of await liveCompanyIds(deps, tenderId)) {
    const bid = await effectiveBid(deps, tenderId, companyId);
    if (bid) bids.push(bid);
  }
  return bids;
}

// Tells whether the bids of this tender may be shown. Closes an overdue tender on the way.
export async function bidsAreOpen(
  deps: AppDeps,
  tenderId: string,
): Promise<boolean> {
  const file = await loadTender(deps.store, tenderId);
  if (!file) throw new AppError("NOT_FOUND", "That tender was not found.");
  let { status } = file.data;
  if (status === "open" && isPastDeadline(deps, file.data)) {
    status = (await closeTender(deps, tenderId, SYSTEM_ACTOR)).status;
  }
  return OPENED_STATUSES.includes(status) || (await isUnsealed(deps, tenderId));
}

// Counts only. Safe before opening because they return no bid content.
export async function countSubmittedBids(
  deps: AppDeps,
  tenderId: string,
): Promise<number> {
  return (await effectiveBids(deps, tenderId)).length;
}

export async function countInvited(
  deps: AppDeps,
  tenderId: string,
): Promise<number> {
  return (await liveCompanyIds(deps, tenderId)).length;
}

export async function readSubmittedBids(
  deps: AppDeps,
  principal: Principal,
  tenderId: string,
): Promise<StoredBid[]> {
  if (principal.role === "carrier") {
    throw new AppError("FORBIDDEN", "You cannot do that.");
  }
  const who = {
    actor: principal.userId,
    role: principal.role,
    thing: tenderId,
    action: "bid.read",
  };
  if (!(await bidsAreOpen(deps, tenderId))) {
    await deps.audit.record({ ...who, result: "denied" });
    throw new AppError(
      "BID_SEALED",
      "Offers are sealed until the deadline has passed.",
    );
  }
  await deps.audit.record({ ...who, result: "ok" });
  return effectiveBids(deps, tenderId);
}
