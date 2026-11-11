// This file builds the carrier-safe view of a tender, including that carrier's own offer status.
// It reads only the signed-in carrier's own offer files, never another company's.

import type {
  CarrierSubmission,
  CarrierTender,
  Tender,
} from "@freight-desk/shared";
import { currentPointerSchema } from "@freight-desk/shared";
import type { AppDeps } from "../deps.ts";
import { currentPointerFile, draftFile } from "../storage/paths.ts";

async function submissionOf(
  deps: AppDeps,
  tenderId: string,
  companyId: string,
): Promise<CarrierSubmission> {
  const pointer = await deps.store.readJson(
    currentPointerFile(tenderId, companyId),
  );
  if (pointer) {
    const { versionNumber, submittedAtUtc } = currentPointerSchema.parse(
      pointer.data,
    );
    return { state: "submitted", versionNumber, submittedAtUtc };
  }
  const draft = await deps.store.readJson(draftFile(tenderId, companyId));
  return { state: draft ? "draft" : "none" };
}

export async function toCarrierTender(
  deps: AppDeps,
  tender: Tender,
  companyId: string,
): Promise<CarrierTender> {
  return {
    id: tender.id,
    name: tender.name,
    customerReference: tender.customerReference,
    status: tender.status,
    deadlineUtc: tender.deadlineUtc,
    customerTimeZone: tender.customerTimeZone,
    currency: tender.currency,
    vatTreatment: tender.vatTreatment,
    submission: await submissionOf(deps, tender.id, companyId),
  };
}
