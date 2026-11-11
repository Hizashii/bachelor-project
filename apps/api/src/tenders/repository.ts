// This file reads and writes tender.json and invitations.json with ETag protection.
// Other features use these helpers instead of touching the paths themselves.

import {
  type Invitation,
  invitationSchema,
  type Tender,
  tenderSchema,
} from "@freight-desk/shared";
import { z } from "zod";
import { invitationsFile, tenderFile } from "../storage/paths.ts";
import type { FileStore, Versioned } from "../storage/types.ts";

export async function loadTender(
  store: FileStore,
  tenderId: string,
): Promise<Versioned<Tender> | null> {
  const file = await store.readJson(tenderFile(tenderId));
  if (!file) return null;
  return { data: tenderSchema.parse(file.data), etag: file.etag };
}

export async function saveTender(
  store: FileStore,
  tender: Tender,
  ifMatch: string | null,
): Promise<{ etag: string }> {
  return store.writeJson(
    tenderFile(tender.id),
    tenderSchema.parse(tender),
    ifMatch,
  );
}

export async function loadInvitations(
  store: FileStore,
  tenderId: string,
): Promise<Versioned<Invitation[]> | null> {
  const file = await store.readJson(invitationsFile(tenderId));
  if (!file) return null;
  return { data: z.array(invitationSchema).parse(file.data), etag: file.etag };
}

export async function saveInvitations(
  store: FileStore,
  tenderId: string,
  invitations: Invitation[],
  ifMatch: string | null,
): Promise<{ etag: string }> {
  const checked = z.array(invitationSchema).parse(invitations);
  return store.writeJson(invitationsFile(tenderId), checked, ifMatch);
}
