// This file writes the append-only audit log. One line per important action.
// Lines hold ids and event names only, never prices, shipment contents, tokens or personal data.

import { z } from "zod";
import type { Clock } from "../clock.ts";
import { auditFile } from "../storage/paths.ts";
import type { FileStore } from "../storage/types.ts";

export const auditEventSchema = z
  .object({
    atUtc: z.string().datetime({ offset: true }),
    actor: z.string().min(1),
    role: z.enum(["carrier", "consultant", "master", "system"]),
    action: z.string().min(1),
    thing: z.string(),
    result: z.enum(["ok", "denied", "failed"]),
  })
  .strict();

export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditInput = Omit<AuditEvent, "atUtc">;

export class AuditLog {
  constructor(
    private readonly store: FileStore,
    private readonly clock: Clock,
  ) {}

  async record(input: AuditInput): Promise<void> {
    const now = this.clock.now();
    const event = auditEventSchema.parse({
      ...input,
      atUtc: now.toISOString(),
    });
    await this.store.appendLine(
      auditFile(now.toISOString().slice(0, 10)),
      JSON.stringify(event),
    );
  }
}
