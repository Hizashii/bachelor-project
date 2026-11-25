// Creates one open demo tender with both price workbooks bound and example prices saved,
// so the tender workspace shows numbers instead of empty tables.

import {
  findTemplateVersion,
  type TemplateVersionBinding,
  verifiedTemplateView,
  type WorkbookSheet,
} from "@freight-desk/shared";
import type { AccessContext } from "../auth/permissions.ts";
import { tenderDraftPrincipalOf } from "../auth/principal.ts";
import type { AuthenticatedUser } from "../auth/types.ts";
import type { Documents } from "../storage/documents.ts";
import { PrincipalDocuments } from "../storage/principalDocuments.ts";
import type { StorageAdapter } from "../storage/types.ts";
import { TenderDraftService } from "../tenders/drafts.ts";
import type { TenderService } from "../tenders/service.ts";

const DEMO_TENDER_NAME = "DEMO Express price tender";
const FILLED_SHEETS = 2;
const BASE_PRICE = 40;

type TemplateId = "customer-bidding" | "express-price";

type DemoCarrier = { userId: string; companyId: string; priceStep: number };

export async function seedDemoTender(deps: {
  storage: StorageAdapter;
  documents: Documents;
  tenders: TenderService;
  staff: AccessContext;
  carriers: DemoCarrier[];
}): Promise<void> {
  const { tenders, staff, carriers } = deps;
  const companyIds = carriers.map((carrier) => carrier.companyId);
  const existing = await tenders.list(staff, {
    query: DEMO_TENDER_NAME,
    limit: 1,
  });
  let saved = existing.items[0];
  if (!saved) {
    saved = await tenders.create(staff, {
      name: DEMO_TENDER_NAME,
      customerReference: "DEMO-2026-01",
      displayTimeZone: "Europe/Copenhagen",
      currency: "DKK",
    });
    saved = await tenders.invite(
      staff,
      saved.tender.id,
      companyIds,
      saved.etag,
    );
    await tenders.open(staff, saved.tender.id, saved.etag);
  }
  const drafts = new TenderDraftService(new PrincipalDocuments(deps.storage));
  const tenderId = saved.tender.id;
  const staffUser = demoUser(staff.userId, "master", null);
  await configureOnce(drafts, staffUser, tenderId, companyIds);
  await saveExamplePrices(drafts, tenderId, staffUser, "express-price", 0);
  for (const carrier of carriers) {
    const user = demoUser(carrier.userId, "carrier", carrier.companyId);
    await saveExamplePrices(
      drafts,
      tenderId,
      user,
      "customer-bidding",
      carrier.priceStep,
    );
  }
}

async function configureOnce(
  drafts: TenderDraftService,
  staffUser: AuthenticatedUser,
  tenderId: string,
  invitedCarrierIds: string[],
): Promise<void> {
  const principal = tenderDraftPrincipalOf(staffUser);
  if ((await drafts.getTemplates(principal, tenderId)).configured) return;
  await drafts.configure(principal, tenderId, {
    biddingTemplate: bindingOf("customer-bidding"),
    expressPriceTemplate: bindingOf("express-price"),
    invitedCarrierIds,
  });
}

async function saveExamplePrices(
  drafts: TenderDraftService,
  tenderId: string,
  user: AuthenticatedUser,
  templateId: TemplateId,
  priceStep: number,
): Promise<void> {
  const principal = tenderDraftPrincipalOf(user);
  const current = await drafts.getDraft(principal, tenderId, templateId);
  if (current.revision > 0) return;
  const binding = bindingOf(templateId);
  await drafts.saveDraftForTender(principal, tenderId, {
    templateId,
    templateVersion: binding.templateVersion,
    sourceSha256: binding.sourceSha256,
    expectedRevision: 0,
    values: examplePrices(templateId, priceStep),
  });
}

function examplePrices(
  templateId: TemplateId,
  priceStep: number,
): Record<string, string> {
  const values: Record<string, string> = {};
  const sheets = verifiedTemplateView(templateId).sheets;
  for (const sheet of sheets.slice(0, FILLED_SHEETS)) {
    fillSheet(values, templateId, sheet, priceStep);
  }
  return values;
}

function fillSheet(
  values: Record<string, string>,
  templateId: TemplateId,
  sheet: WorkbookSheet,
  priceStep: number,
): void {
  for (const section of sheet.sections) {
    for (const column of section.columns) {
      if (
        column.kind !== "editable-decimal" &&
        column.kind !== "editable-currency"
      )
        continue;
      const rows = section.rows.filter(
        (row) => !row.kind || row.kind === "matrix",
      );
      rows.forEach((row, index) => {
        const cell = `${column.sourceColumn ?? column.key}${row.sourceRow}`;
        values[`${templateId}|${sheet.name}|${cell}`] = String(
          BASE_PRICE + priceStep + index * 2,
        );
      });
    }
  }
}

function bindingOf(id: TemplateId): TemplateVersionBinding {
  const template = findTemplateVersion(id, "1.0.0");
  if (!template) throw new Error(`The ${id} template is not registered.`);
  return {
    templateId: template.id,
    templateVersion: template.version,
    sourceSha256: template.source.sha256,
  };
}

function demoUser(
  id: string,
  role: AuthenticatedUser["role"],
  companyId: string | null,
): AuthenticatedUser {
  return { id, email: "", displayName: "", role, companyId };
}
