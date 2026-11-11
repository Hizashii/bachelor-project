// This file sends invitation emails and records one delivery result per invitation.
// A retry reuses the same idempotency key; a deliberate resend gets a new one.

import type {
  Invitation,
  InvitationDelivery,
  Principal,
} from "@freight-desk/shared";
import type { AppDeps } from "../deps.ts";
import { loadInvitations } from "../tenders/repository.ts";
import { appBaseUrl, buildInvitationMail, idempotencyKey } from "./message.ts";
import { loadContact, loadDeliveries, saveDeliveries } from "./repository.ts";

export type SendWho = (delivery: InvitationDelivery) => boolean;

const NO_CONTACT = "NO_CONTACT";
const MAIL_ERROR = "MAIL_ERROR";

const kindOf = (delivery: InvitationDelivery) =>
  delivery.resends === 0 ? "invite" : `resend-${delivery.resends}`;

export const newDelivery = (invitationId: string): InvitationDelivery => ({
  invitationId,
  status: "pending",
  attempts: 0,
  resends: 0,
  lastErrorCode: null,
  lastAttemptAtUtc: null,
  deliveredAtUtc: null,
});

async function attempt(
  deps: AppDeps,
  invitation: Invitation,
  delivery: InvitationDelivery,
): Promise<InvitationDelivery> {
  const nowIso = deps.clock.now().toISOString();
  const base = {
    ...delivery,
    attempts: delivery.attempts + 1,
    lastAttemptAtUtc: nowIso,
  };
  const contact = await loadContact(deps.store, invitation.carrierCompanyId);
  if (!contact) return { ...base, status: "failed", lastErrorCode: NO_CONTACT };
  try {
    const result = await deps.mailer.send(
      buildInvitationMail({
        tenderId: invitation.tenderId,
        to: contact.inviteEmail,
        key: idempotencyKey(
          invitation.tenderId,
          invitation.id,
          kindOf(delivery),
        ),
        baseUrl: appBaseUrl(),
      }),
    );
    return {
      ...base,
      status: result.status,
      lastErrorCode: null,
      deliveredAtUtc: nowIso,
    };
  } catch {
    return { ...base, status: "failed", lastErrorCode: MAIL_ERROR };
  }
}

// Sends to every live invitation whose delivery matches `who`, then saves the results once.
export async function deliverInvitations(
  deps: AppDeps,
  tenderId: string,
  principal: Principal,
  who: SendWho,
): Promise<InvitationDelivery[]> {
  const invitations = (await loadInvitations(deps.store, tenderId))?.data ?? [];
  const stored = await loadDeliveries(deps.store, tenderId);
  const byId = new Map(stored?.data.map((d) => [d.invitationId, d]));
  const results: InvitationDelivery[] = [];
  for (const invitation of invitations) {
    const current = byId.get(invitation.id) ?? newDelivery(invitation.id);
    const live = invitation.state === "invited";
    const next =
      live && who(current) ? await attempt(deps, invitation, current) : current;
    if (next !== current) await recordAttempt(deps, tenderId, principal, next);
    results.push(next);
  }
  await saveDeliveries(deps.store, tenderId, results, stored?.etag ?? null);
  return results;
}

function recordAttempt(
  deps: AppDeps,
  tenderId: string,
  principal: Principal,
  delivery: InvitationDelivery,
): Promise<void> {
  return deps.audit.record({
    actor: principal.userId,
    role: principal.role,
    action: `invitation.${delivery.status}`,
    thing: `${tenderId}/${delivery.invitationId}`,
    result: delivery.status === "failed" ? "failed" : "ok",
  });
}
