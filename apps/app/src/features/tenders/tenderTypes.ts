import type { Tender, TenderDraftInput } from "@freight-desk/shared";

export type TenderRecord = {
  tender: Tender;
  etag: string;
  fileId: string;
};

export type TenderDraftValues = Pick<
  TenderDraftInput,
  "name" | "customerReference" | "displayTimeZone" | "currency" | "deadlineUtc"
>;

export const emptyTenderDraft: TenderDraftValues = {
  name: "",
  customerReference: "",
  displayTimeZone: "",
  currency: "",
  deadlineUtc: null,
};

export function draftInputOf(values: TenderDraftValues): TenderDraftInput {
  return {
    ...values,
    vatTreatment: null,
    vatRateBasisPoints: null,
    zonePolicy: null,
    evaluation: null,
    shipmentTemplate: null,
    carrierRateTemplate: null,
    shipmentBasis: null,
  };
}
