// This file builds every file path in the data library. Nothing else may glue paths together.
// Ids are checked so a request can never reach another folder.
//
// tenders/<t>/tender.json                      the tender
// tenders/<t>/invitations.json                 invitations (array)
// tenders/<t>/shipments.xlsx                   customer shipments
// tenders/<t>/bids/<c>/draft.json              the carrier's current draft (a bid version, state "draft")
// tenders/<t>/bids/<c>/v<n>.json               submitted version, written once, never changed
// tenders/<t>/bids/<c>/current.json            pointer to the effective version
// tenders/<t>/bids/<c>/original/<name>         original uploaded file
// tenders/<t>/award/award.json                 award record
// tenders/<t>/award/exports/<id>.xlsx|.json    exported workbook and its snapshot
// audit/<yyyy-mm-dd>.jsonl                     append-only audit log

import { entityIdSchema } from "@freight-desk/shared";
import { AppError } from "../errors.ts";

export function checkedId(value: string): string {
  if (!entityIdSchema.safeParse(value).success) {
    throw new AppError("NOT_FOUND", "That item was not found.");
  }
  return value;
}

function checkedVersion(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new AppError("NOT_FOUND", "That item was not found.");
  }
  return value;
}

export const tenderFolder = (tenderId: string) =>
  `tenders/${checkedId(tenderId)}`;
export const tenderFile = (tenderId: string) =>
  `${tenderFolder(tenderId)}/tender.json`;
export const invitationsFile = (tenderId: string) =>
  `${tenderFolder(tenderId)}/invitations.json`;
export const shipmentsFile = (tenderId: string) =>
  `${tenderFolder(tenderId)}/shipments.xlsx`;
export const bidsFolder = (tenderId: string) =>
  `${tenderFolder(tenderId)}/bids`;
export const carrierBidFolder = (tenderId: string, companyId: string) =>
  `${bidsFolder(tenderId)}/${checkedId(companyId)}`;
export const draftFile = (tenderId: string, companyId: string) =>
  `${carrierBidFolder(tenderId, companyId)}/draft.json`;
export const versionFile = (
  tenderId: string,
  companyId: string,
  version: number,
) =>
  `${carrierBidFolder(tenderId, companyId)}/v${checkedVersion(version)}.json`;
export const currentPointerFile = (tenderId: string, companyId: string) =>
  `${carrierBidFolder(tenderId, companyId)}/current.json`;
export const originalFolder = (tenderId: string, companyId: string) =>
  `${carrierBidFolder(tenderId, companyId)}/original`;
export const awardFolder = (tenderId: string) =>
  `${tenderFolder(tenderId)}/award`;
export const awardFile = (tenderId: string) =>
  `${awardFolder(tenderId)}/award.json`;
export const exportsFolder = (tenderId: string) =>
  `${awardFolder(tenderId)}/exports`;
export const companyFile = (companyId: string) =>
  `companies/${checkedId(companyId)}.json`;
export const templatesFolder = "templates";
export const archiveFolder = "archive";

export function auditFile(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Bad audit day");
  return `audit/${day}.jsonl`;
}
