// Lets staff attach the registered price workbooks to a tender.

import { useState } from "react";
import { apiFetch } from "../../api/client";
import type { Locale } from "../../i18n";
import { getCopy } from "../../i18n";

type RegistryItem = {
  id: string;
  kind: "customer-bidding" | "express-price";
  version: string;
  source: { sha256: string };
};

type Props = { locale: Locale; tenderId: string; invitedCarrierIds: string[] };

export function TemplateBindingPanel({
  locale,
  tenderId,
  invitedCarrierIds,
}: Props) {
  const copy = getCopy(locale);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function bind() {
    setBusy(true);
    try {
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
      setMessage(copy.templatesBound);
    } catch {
      setMessage(copy.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="white-card tender-workflow-card"
      aria-labelledby="tender-bind-title"
    >
      <h2 id="tender-bind-title">{copy.tenderTemplateTab}</h2>
      <p>{copy.bindTemplatesDetail}</p>
      <button
        className="button button-secondary"
        type="button"
        disabled={busy}
        onClick={() => void bind()}
      >
        {copy.bindTemplates}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

function bindingOf(items: RegistryItem[], kind: RegistryItem["kind"]) {
  const item = items.find((entry) => entry.kind === kind);
  if (!item) throw new Error(`Template ${kind} is not registered.`);
  return {
    templateId: item.id,
    templateVersion: item.version,
    sourceSha256: item.source.sha256,
  };
}
