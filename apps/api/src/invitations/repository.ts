// This file reads and writes the invitation delivery results and company contact emails.
// Paths are built here from the storage helpers; ids are checked there.

import {
  type CarrierCompany,
  type CompanyContact,
  carrierCompanySchema,
  companyContactSchema,
  type InvitationDelivery,
  invitationDeliverySchema,
} from "@freight-desk/shared";
import { z } from "zod";
import { checkedId, companyFile, tenderFolder } from "../storage/paths.ts";
import type { FileStore, Versioned } from "../storage/types.ts";

const COMPANIES_FOLDER = "companies";
const COMPANY_FILE_NAME = /^[0-9a-f-]{36}\.json$/;

const deliveryFile = (tenderId: string) =>
  `${tenderFolder(tenderId)}/invitation-delivery.json`;
const contactsFile = (companyId: string) =>
  `${COMPANIES_FOLDER}/${checkedId(companyId)}.contacts.json`;

const deliveryListSchema = z.array(invitationDeliverySchema);

export async function loadDeliveries(
  store: FileStore,
  tenderId: string,
): Promise<Versioned<InvitationDelivery[]> | null> {
  const file = await store.readJson(deliveryFile(tenderId));
  if (!file) return null;
  return { data: deliveryListSchema.parse(file.data), etag: file.etag };
}

export function saveDeliveries(
  store: FileStore,
  tenderId: string,
  deliveries: InvitationDelivery[],
  ifMatch: string | null,
): Promise<{ etag: string }> {
  const checked = deliveryListSchema.parse(deliveries);
  return store.writeJson(deliveryFile(tenderId), checked, ifMatch);
}

export async function loadContact(
  store: FileStore,
  companyId: string,
): Promise<CompanyContact | null> {
  const file = await store.readJson(contactsFile(companyId));
  return file ? companyContactSchema.parse(file.data) : null;
}

export async function loadCompany(
  store: FileStore,
  companyId: string,
): Promise<CarrierCompany | null> {
  const file = await store.readJson(companyFile(companyId));
  return file ? carrierCompanySchema.parse(file.data) : null;
}

export async function listCompanies(
  store: FileStore,
): Promise<CarrierCompany[]> {
  const names = await store.list(COMPANIES_FOLDER);
  const ids = names
    .filter((name) => COMPANY_FILE_NAME.test(name))
    .map((name) => name.slice(0, -".json".length));
  const companies = await Promise.all(ids.map((id) => loadCompany(store, id)));
  return companies.filter((company) => company !== null);
}
