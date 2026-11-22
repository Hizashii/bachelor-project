// Tariff versions over time: who may move a tariff to which status, how a new version
// is made from a published one, and which version prices a shipment on a given date.
// Published versions are never edited. Old versions stay for invoice checks.
// Not for storage: see apps/api/src/tariffs.

import type { UserRole } from "../types/business.ts";
import type { Tariff, TariffStatus } from "./tariff.ts";

type Transition = { from: TariffStatus; to: TariffStatus; roles: UserRole[] };

// Carriers prepare and submit their own tariffs. Consultancy staff approve and activate.
const TRANSITIONS: readonly Transition[] = [
  {
    from: "draft",
    to: "submitted",
    roles: ["carrier", "consultant", "master"],
  },
  { from: "submitted", to: "draft", roles: ["consultant", "master"] },
  { from: "submitted", to: "approved", roles: ["consultant", "master"] },
  { from: "approved", to: "active", roles: ["consultant", "master"] },
  { from: "active", to: "superseded", roles: ["consultant", "master"] },
  { from: "superseded", to: "archived", roles: ["master"] },
  { from: "draft", to: "archived", roles: ["carrier", "consultant", "master"] },
];

export class TariffTransitionError extends Error {}

export function canTransition(
  from: TariffStatus,
  to: TariffStatus,
  role: UserRole,
): boolean {
  return TRANSITIONS.some(
    (t) => t.from === from && t.to === to && t.roles.includes(role),
  );
}

export function isEditable(tariff: Tariff): boolean {
  return tariff.status === "draft";
}

export function transition(
  tariff: Tariff,
  to: TariffStatus,
  role: UserRole,
  userId: string,
  now: string,
): Tariff {
  if (!canTransition(tariff.status, to, role)) {
    throw new TariffTransitionError(
      `Cannot move from ${tariff.status} to ${to}.`,
    );
  }
  return {
    ...tariff,
    status: to,
    submittedAt: to === "submitted" ? now : tariff.submittedAt,
    approvedAt: to === "approved" ? now : tariff.approvedAt,
    approvedBy: to === "approved" ? userId : tariff.approvedBy,
  };
}

// A published version is copied into a new draft; the old version is left untouched.
export function startNextVersion(
  published: Tariff,
  latestVersion: number,
  userId: string,
  now: string,
): Tariff {
  return {
    ...published,
    version: latestVersion + 1,
    status: "draft",
    createdAt: now,
    createdBy: userId,
    submittedAt: null,
    approvedAt: null,
    approvedBy: null,
  };
}

// Activating a version supersedes the version that was active for the same tariff.
export function activate(
  approved: Tariff,
  versions: readonly Tariff[],
  role: UserRole,
  userId: string,
  now: string,
): Tariff[] {
  const activated = transition(approved, "active", role, userId, now);
  const superseded = versions
    .filter((v) => v.tariffId === approved.tariffId && v.status === "active")
    .map((v) => transition(v, "superseded", role, userId, now));
  return [activated, ...superseded];
}

// Active and superseded versions price shipments, so old invoices can be re-checked.
export function selectVersion(
  versions: readonly Tariff[],
  date: string,
): Tariff | null {
  const candidates = versions.filter(
    (v) =>
      (v.status === "active" || v.status === "superseded") &&
      v.effectiveFrom <= date &&
      (v.effectiveTo === null || date <= v.effectiveTo),
  );
  const [best] = candidates.sort((a, b) => b.version - a.version);
  return best ?? null;
}
