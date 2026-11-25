// Attaches S&A's registered price workbooks to a tender and records who is invited.
// Staff trigger it when they invite carriers or open the tender, so carriers can
// always fill in the workbook in the app.

import { apiFetch } from "../../api/client";

type RegistryItem = {
  id: string;
  kind: "customer-bidding" | "express-price";
  version: string;
  source: { sha256: string };
};

function bindingOf(items: RegistryItem[], kind: RegistryItem["kind"]) {
  const item = items.find((entry) => entry.kind === kind);
  if (!item) throw new Error(`Template ${kind} is not registered.`);
  return {
    templateId: item.id,
    templateVersion: item.version,
    sourceSha256: item.source.sha256,
  };
}

export async function bindTemplates(
  tenderId: string,
  invitedCarrierIds: string[],
): Promise<void> {
  const { items } = await apiFetch<{ items: RegistryItem[] }>(
    "/api/documents/templates",
  );
  await apiFetch(`/api/tenders/${tenderId}/template-config`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      biddingTemplate: bindingOf(items, "customer-bidding"),
      expressPriceTemplate: bindingOf(items, "express-price"),
      invitedCarrierIds,
    }),
  });
}
