// This file lets the master read the audit log, one day at a time, a page at a time.
// It only reads. Nothing here can edit or delete an audit line.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { type AuditEvent, auditEventSchema } from "../audit/audit.ts";
import type { AppDeps } from "../deps.ts";
import { parseInput } from "../http/validate.ts";
import { auditFile } from "../storage/paths.ts";

const DEFAULT_PAGE = 100;
const MAX_PAGE = 200;

const querySchema = z.object({
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE).default(DEFAULT_PAGE),
});

type Page = {
  day: string | null;
  days: string[];
  events: AuditEvent[];
  nextOffset: number | null;
};

function parseLines(text: string): AuditEvent[] {
  const events: AuditEvent[] = [];
  for (const line of text.split("\n")) {
    if (line === "") continue;
    try {
      const parsed = auditEventSchema.safeParse(JSON.parse(line));
      if (parsed.success) events.push(parsed.data);
    } catch {
      // A damaged line is skipped here; the integrity job reports it.
    }
  }
  return events;
}

export async function readAuditPage(
  deps: AppDeps,
  query: unknown,
): Promise<Page> {
  const { day: asked, offset, limit } = parseInput(querySchema, query);
  const files = await deps.store.list("audit");
  const days = files
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => f.slice(0, -6))
    .sort();
  const day = asked ?? days[days.length - 1] ?? null;
  if (!day) return { day, days, events: [], nextOffset: null };
  const file = await deps.store.readBytes(auditFile(day));
  const all = file ? parseLines(new TextDecoder().decode(file.data)) : [];
  const events = all.slice(offset, offset + limit);
  const next = offset + limit;
  return { day, days, events, nextOffset: next < all.length ? next : null };
}

export function registerAuditRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get("/api/audit", { config: { action: "audit:read" } }, async (request) =>
    readAuditPage(deps, request.query),
  );
}
