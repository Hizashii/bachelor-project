// This file loads and saves a carrier's offer draft (draft.json) with ETag protection.
// It does not check the deadline or the invitation; callers do that first.

import { type StoredBid, storedBidSchema } from "@freight-desk/shared";
import { draftFile } from "../storage/paths.ts";
import type { FileStore, Versioned } from "../storage/types.ts";

export async function loadDraft(
  store: FileStore,
  tenderId: string,
  companyId: string,
): Promise<Versioned<StoredBid> | null> {
  const file = await store.readJson(draftFile(tenderId, companyId));
  if (!file) return null;
  return { data: storedBidSchema.parse(file.data), etag: file.etag };
}

// ifMatch null creates the first draft; an ETag updates it only if nobody else changed it.
export async function saveDraft(
  store: FileStore,
  bid: StoredBid,
  ifMatch: string | null,
): Promise<{ etag: string }> {
  const checked = storedBidSchema.parse(bid);
  const path = draftFile(checked.tenderId, checked.carrierCompanyId);
  return store.writeJson(path, checked, ifMatch);
}
