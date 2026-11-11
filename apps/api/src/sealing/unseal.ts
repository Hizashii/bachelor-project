// This file lets the master open bids of a running tender early, with a written reason.
// The reason lives in the marker file under the tender folder; the audit line holds ids only.

import type { Principal } from "@freight-desk/shared";
import { z } from "zod";
import type { AppDeps } from "../deps.ts";
import { AppError } from "../errors.ts";
import { tenderFolder } from "../storage/paths.ts";
import { loadTender } from "../tenders/repository.ts";

const markerSchema = z
  .object({
    tenderId: z.string(),
    unsealedByUserId: z.string(),
    unsealedAtUtc: z.string(),
    reason: z.string(),
  })
  .strict();

const markerFile = (tenderId: string) =>
  `${tenderFolder(tenderId)}/unsealed.json`;

export async function isUnsealed(
  deps: AppDeps,
  tenderId: string,
): Promise<boolean> {
  return (await deps.store.readJson(markerFile(tenderId))) !== null;
}

export async function unsealTender(
  deps: AppDeps,
  principal: Principal,
  tenderId: string,
  reason: string,
): Promise<void> {
  const tender = await loadTender(deps.store, tenderId);
  if (!tender) throw new AppError("NOT_FOUND", "That tender was not found.");
  if (tender.data.status !== "open") {
    throw new AppError("INVALID_STATE", "Only an open tender needs unsealing.");
  }
  if (await isUnsealed(deps, tenderId)) return;
  const marker = markerSchema.parse({
    tenderId,
    unsealedByUserId: principal.userId,
    unsealedAtUtc: deps.clock.now().toISOString(),
    reason,
  });
  await deps.store.writeJson(markerFile(tenderId), marker, null);
  await deps.audit.record({
    actor: principal.userId,
    role: principal.role,
    action: "bid.unseal",
    thing: tenderId,
    result: "ok",
  });
}
