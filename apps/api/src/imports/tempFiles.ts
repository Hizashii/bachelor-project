// Temporary files for uploads and results, plus expiring download links.
// Everything here is deleted after the retention time. Nothing here is a backup.
// Not for durable storage: see storage/documents.ts.

import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AccessContext } from "../auth/permissions.ts";
import { importLimits } from "./limits.ts";

const ROOT = join(tmpdir(), "freight-desk-imports");
const TOKEN_BYTES = 32;
const MS_PER_MINUTE = 60_000;
const PRIVATE_FOLDER_MODE = 0o700;

export type Workspace = { id: string; dir: string };

type DownloadEntry = {
  path: string;
  fileName: string;
  organisationId: string;
  expiresAt: number;
};

const downloads = new Map<string, DownloadEntry>();

export async function createWorkspace(): Promise<Workspace> {
  const id = randomUUID();
  const dir = join(ROOT, id);
  await mkdir(dir, { recursive: true, mode: PRIVATE_FOLDER_MODE });
  return { id, dir };
}

export async function removeWorkspace(workspace: Workspace): Promise<void> {
  await rm(workspace.dir, { recursive: true, force: true });
}

export function createDownloadToken(
  context: AccessContext,
  path: string,
  fileName: string,
  now = Date.now(),
): string {
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  downloads.set(token, {
    path,
    fileName,
    organisationId: context.organisationId,
    expiresAt: now + importLimits.retentionMinutes * MS_PER_MINUTE,
  });
  return token;
}

// An unknown, expired or foreign token all look the same to the caller.
export function resolveDownload(
  context: AccessContext,
  token: string,
  now = Date.now(),
): { path: string; fileName: string } | null {
  const entry = downloads.get(token);
  if (!entry || entry.expiresAt <= now) return null;
  if (entry.organisationId !== context.organisationId) return null;
  return { path: entry.path, fileName: entry.fileName };
}

// Removes expired links and every workspace folder older than the retention time.
export async function sweepExpired(now = Date.now()): Promise<number> {
  for (const [token, entry] of downloads) {
    if (entry.expiresAt <= now) downloads.delete(token);
  }
  const maxAge = importLimits.retentionMinutes * MS_PER_MINUTE;
  const folders = await readdir(ROOT).catch(() => [] as string[]);
  let removed = 0;
  for (const folder of folders) {
    const path = join(ROOT, folder);
    const info = await stat(path).catch(() => null);
    if (!info || now - info.mtimeMs < maxAge) continue;
    await rm(path, { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}
