// This file contains small, framework-free lifecycle rules shared by the app and API.

export const tenderStatuses = ["draft", "open", "closed", "awarded", "archived"] as const;

export type TenderStatus = (typeof tenderStatuses)[number];

export const offerStates = ["draft", "submitted", "superseded", "withdrawn"] as const;

export type OfferState = (typeof offerStates)[number];

export function canEditOffer(state: OfferState): boolean {
  return state === "draft";
}

export function canAcceptOffer(tenderStatus: TenderStatus, deadlinePassed: boolean): boolean {
  return tenderStatus === "open" && !deadlinePassed;
}
