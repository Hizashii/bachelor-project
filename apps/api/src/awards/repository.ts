// This file reads and writes the award record and its history under tenders/<t>/award/.
// Every change adds a new numbered file in history/ (create-only). Nothing is ever deleted.
// It does not decide who may change an award; the service does.

import { type AwardRecord, awardRecordSchema } from "@freight-desk/shared";
import { z } from "zod";
import type { AppDeps } from "../deps.ts";
import { AppError } from "../errors.ts";
import { awardFile, awardFolder } from "../storage/paths.ts";
import type { Versioned } from "../storage/types.ts";
import { loadTender } from "../tenders/repository.ts";

const HISTORY_DIGITS = 4;

export const awardEventSchema = z.enum([
  "decided",
  "confirmed",
  "cancelled",
  "note_added",
  "archived",
]);
export type AwardEvent = z.infer<typeof awardEventSchema>;

export const historyEntrySchema = z
  .object({
    sequence: z.number().int().positive(),
    event: awardEventSchema,
    atUtc: z.string(),
    byUserId: z.string().min(1),
    record: awardRecordSchema,
  })
  .strict();
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

const historyFolder = (tenderId: string) => `${awardFolder(tenderId)}/history`;

export async function loadAward(
  deps: AppDeps,
  tenderId: string,
): Promise<Versioned<AwardRecord> | null> {
  const file = await deps.store.readJson(awardFile(tenderId));
  if (!file) return null;
  return { data: awardRecordSchema.parse(file.data), etag: file.etag };
}

export async function saveAward(
  deps: AppDeps,
  record: AwardRecord,
  ifMatch: string | null,
  event: AwardEvent,
  byUserId: string,
): Promise<{ etag: string }> {
  const checked = awardRecordSchema.parse(record);
  const saved = await deps.store.writeJson(
    awardFile(checked.tenderId),
    checked,
    ifMatch,
  );
  await appendHistory(deps, checked, event, byUserId);
  return saved;
}

async function appendHistory(
  deps: AppDeps,
  record: AwardRecord,
  event: AwardEvent,
  byUserId: string,
): Promise<void> {
  const folder = historyFolder(record.tenderId);
  const sequence = (await deps.store.list(folder)).length + 1;
  const entry: HistoryEntry = {
    sequence,
    event,
    atUtc: deps.clock.now().toISOString(),
    byUserId,
    record,
  };
  const name = String(sequence).padStart(HISTORY_DIGITS, "0");
  await deps.store.writeJson(`${folder}/${name}.json`, entry, null);
}

export async function loadHistory(
  deps: AppDeps,
  tenderId: string,
): Promise<HistoryEntry[]> {
  const folder = historyFolder(tenderId);
  const names = await deps.store.list(folder);
  const entries: HistoryEntry[] = [];
  for (const name of names) {
    const file = await deps.store.readJson(`${folder}/${name}`);
    if (file) entries.push(historyEntrySchema.parse(file.data));
  }
  return entries;
}

// Used by the export feature. A decision that is not confirmed yet, or was cancelled, is "not found".
export async function loadConfirmedAward(
  deps: AppDeps,
  tenderId: string,
): Promise<AwardRecord> {
  const [award, tender] = await Promise.all([
    loadAward(deps, tenderId),
    loadTender(deps.store, tenderId),
  ]);
  const settled = ["awarded", "archived"].includes(tender?.data.status ?? "");
  if (award?.data.decision !== "confirmed" || !settled) {
    throw new AppError("NOT_FOUND", "There is no confirmed award.");
  }
  return award.data;
}
