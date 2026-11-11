// Builds the stored draft from what a carrier typed. The server fills in who, which tender,
// which version and when; the carrier only supplies the offer content.
// It does not check the deadline or access; routes do that first.

import {
  currentPointerSchema,
  type Principal,
  type StoredBid,
  storedBidSchema,
} from "@freight-desk/shared";
import type { AppDeps } from "../deps.ts";
import { currentPointerFile } from "../storage/paths.ts";

export const offerContentSchema = storedBidSchema.pick({
  rates: true,
  surcharges: true,
  serviceCoverage: true,
  zones: true,
  notes: true,
});

export type OfferContent = ReturnType<typeof offerContentSchema.parse>;

export const EMPTY_CONTENT: OfferContent = {
  rates: [],
  surcharges: [],
  serviceCoverage: { countryCodes: [], zoneIds: [], notes: "" },
  zones: [],
  notes: {
    serviceDescription: "",
    supportedUnits: [],
    minimumChargeMinor: null,
  },
};

// The next version number is one above the submitted version, or 1 when none exists.
async function nextVersion(
  deps: AppDeps,
  tenderId: string,
  companyId: string,
): Promise<{ number: number; supersedes: string | null }> {
  const file = await deps.store.readJson(
    currentPointerFile(tenderId, companyId),
  );
  if (!file) return { number: 1, supersedes: null };
  const pointer = currentPointerSchema.parse(file.data);
  return {
    number: pointer.versionNumber + 1,
    supersedes: pointer.bidVersionId,
  };
}

export async function buildDraft(
  deps: AppDeps,
  principal: Principal,
  tenderId: string,
  content: OfferContent,
  existing: StoredBid | null,
): Promise<StoredBid> {
  const companyId = principal.carrierCompanyId as string;
  const next = await nextVersion(deps, tenderId, companyId);
  return {
    id: existing?.id ?? deps.ids.newId(),
    tenderId,
    carrierCompanyId: companyId,
    createdByUserId: existing?.createdByUserId ?? principal.userId,
    versionNumber: next.number,
    state: "draft",
    submittedAtUtc: null,
    withdrawnAtUtc: null,
    sourceTemplate: existing?.sourceTemplate ?? null,
    createdAtUtc: existing?.createdAtUtc ?? deps.clock.now().toISOString(),
    supersedesVersionId: next.supersedes,
    ...content,
  };
}
