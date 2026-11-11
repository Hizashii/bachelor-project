// This file moves a tender from open to closed. Closing twice is harmless and logs once.
// closeOverdueTenders is what the timed job calls; the manual close endpoint uses closeTender.

import type { Tender } from "@freight-desk/shared";
import type { AppDeps } from "../deps.ts";
import { AppError } from "../errors.ts";
import { loadTender, saveTender } from "../tenders/repository.ts";

export type CloseActor = {
  userId: string;
  role: "consultant" | "master" | "system";
};

export const SYSTEM_ACTOR: CloseActor = { userId: "system", role: "system" };

export function isPastDeadline(deps: AppDeps, tender: Tender): boolean {
  return deps.clock.now().getTime() >= Date.parse(tender.deadlineUtc);
}

export async function closeTender(
  deps: AppDeps,
  tenderId: string,
  actor: CloseActor,
): Promise<Tender> {
  const file = await loadTender(deps.store, tenderId);
  if (!file) throw new AppError("NOT_FOUND", "That tender was not found.");
  const { data: tender } = file;
  if (tender.status === "closed") return tender;
  if (tender.status !== "open") {
    throw new AppError("INVALID_STATE", "Only an open tender can be closed.");
  }
  const nowIso = deps.clock.now().toISOString();
  const closed: Tender = {
    ...tender,
    status: "closed",
    closedAtUtc: nowIso,
    updatedAtUtc: nowIso,
  };
  try {
    await saveTender(deps.store, closed, file.etag);
  } catch (error) {
    if (error instanceof AppError && error.code === "PRECONDITION_FAILED") {
      return closeTender(deps, tenderId, actor);
    }
    throw error;
  }
  await deps.audit.record({
    actor: actor.userId,
    role: actor.role,
    action: "tender.close",
    thing: tenderId,
    result: "ok",
  });
  return closed;
}

// Closes every open tender whose deadline has passed. Returns the ids it closed.
export async function closeOverdueTenders(deps: AppDeps): Promise<string[]> {
  const closedIds: string[] = [];
  for (const tenderId of await deps.store.list("tenders")) {
    const file = await loadTender(deps.store, tenderId);
    if (file?.data.status !== "open" || !isPastDeadline(deps, file.data)) {
      continue;
    }
    await closeTender(deps, tenderId, SYSTEM_ACTOR);
    closedIds.push(tenderId);
  }
  return closedIds;
}
