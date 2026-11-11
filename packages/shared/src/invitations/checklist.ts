// This file holds the publication checklist as one pure function. It decides nothing about
// storage or mail; the API feeds it the tender and what it knows about invited carriers.

import type { Tender } from "../types/business.ts";

export type ChecklistKey =
  | "name"
  | "reference"
  | "deadline"
  | "currency"
  | "templates"
  | "carriers";

export type ChecklistItem = { key: ChecklistKey; ok: boolean };

export type ChecklistInput = {
  tender: Tender;
  now: Date;
  // How many invited carriers have a contact email on file.
  reachableCarriers: number;
};

const templateOk = (template: Tender["shipmentTemplate"], kind: string) =>
  template.kind === kind && template.status === "active";

export function publicationChecklist(input: ChecklistInput): ChecklistItem[] {
  const { tender, now, reachableCarriers } = input;
  const deadline = Date.parse(tender.deadlineUtc);
  return [
    { key: "name", ok: tender.name.trim() !== "" },
    { key: "reference", ok: tender.customerReference.trim() !== "" },
    { key: "deadline", ok: deadline > now.getTime() },
    { key: "currency", ok: /^[A-Z]{3}$/.test(tender.currency) },
    {
      key: "templates",
      ok:
        templateOk(tender.shipmentTemplate, "shipment") &&
        templateOk(tender.carrierRateTemplate, "carrier_rate"),
    },
    { key: "carriers", ok: reachableCarriers > 0 },
  ];
}

export const missingItems = (items: ChecklistItem[]): ChecklistKey[] =>
  items.filter((item) => !item.ok).map((item) => item.key);
