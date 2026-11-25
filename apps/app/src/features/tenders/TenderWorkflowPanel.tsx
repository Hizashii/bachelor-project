// Controls the working part of a tender: invitations, bids, comparison and exports.
// It keeps calculations on the API and only displays the returned result.

import { useEffect, useState } from "react";
import {
  ApiError,
  apiFetch,
  downloadFile,
  postJson,
  saveBlob,
} from "../../api/client";
import type { UserRole } from "../../auth/auth";
import type { Locale } from "../../i18n";
import { getCopy } from "../../i18n";
import { TemplateBindingPanel } from "./TemplateBindingPanel";
import { TenderComparison } from "./TenderComparison";
import type { TenderRecord } from "./tenderTypes";

type Props = {
  locale: Locale;
  role: UserRole;
  record: TenderRecord;
  onChanged: (record: TenderRecord) => void;
};

export function TenderWorkflowPanel({
  locale,
  role,
  record,
  onChanged,
}: Props) {
  if (role === "carrier") {
    return (
      <CarrierBidPanel
        locale={locale}
        tenderId={record.tender.id}
        status={record.tender.status}
      />
    );
  }
  return (
    <StaffWorkflowPanel locale={locale} record={record} onChanged={onChanged} />
  );
}

function CarrierBidPanel({
  locale,
  tenderId,
  status,
}: {
  locale: Locale;
  tenderId: string;
  status: TenderRecord["tender"]["status"];
}) {
  const copy = getCopy(locale);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  if (status !== "open") return null;

  async function submitBid() {
    if (!file) {
      setMessage(copy.ratesMissing);
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/tenders/${tenderId}/bids`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: file,
      });
      setMessage(copy.submittedOk);
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : copy.requestFailed,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="white-card tender-workflow-card"
      aria-labelledby="tender-bid-title"
    >
      <h2 id="tender-bid-title">{copy.uploadExisting}</h2>
      <p>{copy.uploadExistingDetail}</p>
      <button
        className="button button-secondary"
        type="button"
        onClick={() => void downloadTemplate(tenderId)}
      >
        {copy.downloadTemplate}
      </button>
      <input
        aria-label={copy.uploadExcel}
        type="file"
        accept=".xlsx"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <button
        className="button button-primary"
        type="button"
        disabled={busy}
        onClick={() => void submitBid()}
      >
        {busy ? copy.working : copy.submitForApproval}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

function StaffWorkflowPanel({
  locale,
  record,
  onChanged,
}: {
  locale: Locale;
  record: TenderRecord;
  onChanged: (record: TenderRecord) => void;
}) {
  const copy = getCopy(locale);
  const [busy, setBusy] = useState(false);
  const [carriers, setCarriers] = useState<CarrierOption[]>([]);
  const [selected, setSelected] = useState<string[]>(
    record.tender.invitedCarrierCompanyIds,
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (record.tender.status === "closed" || record.tender.status === "awarded")
      return;
    void apiFetch<CarrierOption[]>("/api/tender-carriers")
      .then(setCarriers)
      .catch(() => undefined);
  }, [record.tender.status]);

  async function transition(action: "open" | "close") {
    setBusy(true);
    try {
      const next = await postJson<TenderRecord>(
        `/api/tenders/${record.tender.id}/${action}`,
        {
          ifMatch: record.etag,
        },
      );
      onChanged(next);
    } catch {
      setMessage(copy.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  async function invite() {
    if (selected.length === 0) return;
    setBusy(true);
    try {
      const next = await postJson<TenderRecord>(
        `/api/tenders/${record.tender.id}/invitations`,
        {
          carrierCompanyIds: selected,
          ifMatch: record.etag,
        },
      );
      onChanged(next);
      setMessage(copy.saved);
    } catch {
      setMessage(copy.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section
        className="white-card tender-workflow-card"
        aria-labelledby="tender-workflow-title"
      >
        <h2 id="tender-workflow-title">{copy.tenders}</h2>
        {record.tender.status === "draft" ? (
          <button
            className="button button-primary"
            type="button"
            disabled={busy}
            onClick={() => void transition("open")}
          >
            {copy.openTender}
          </button>
        ) : null}
        {record.tender.status === "open" ? (
          <button
            className="button button-primary"
            type="button"
            disabled={busy}
            onClick={() => void transition("close")}
          >
            {copy.closeTender}
          </button>
        ) : null}
        {record.tender.status === "closed" ? (
          <TenderComparison locale={locale} tenderId={record.tender.id} />
        ) : null}
        {message ? <p role="status">{message}</p> : null}
      </section>
      {record.tender.status === "draft" || record.tender.status === "open" ? (
        <TemplateBindingPanel
          locale={locale}
          tenderId={record.tender.id}
          invitedCarrierIds={record.tender.invitedCarrierCompanyIds}
        />
      ) : null}
      {record.tender.status === "draft" || record.tender.status === "open" ? (
        <InvitationPanel
          copy={copy}
          carriers={carriers}
          selected={selected}
          setSelected={setSelected}
          onInvite={invite}
          busy={busy}
        />
      ) : null}
    </>
  );
}

type CarrierOption = { organisationId: string; name: string };
type Copy = ReturnType<typeof getCopy>;

function InvitationPanel({
  copy,
  carriers,
  selected,
  setSelected,
  onInvite,
  busy,
}: {
  copy: Copy;
  carriers: CarrierOption[];
  selected: string[];
  setSelected: (value: string[]) => void;
  onInvite: () => void;
  busy: boolean;
}) {
  return (
    <section
      className="white-card tender-workflow-card"
      aria-labelledby="tender-carriers-title"
    >
      <h2 id="tender-carriers-title">{copy.carriers}</h2>
      {carriers.map((carrier) => (
        <label key={carrier.organisationId}>
          <input
            type="checkbox"
            checked={selected.includes(carrier.organisationId)}
            onChange={(event) =>
              setSelected(
                event.target.checked
                  ? [...selected, carrier.organisationId]
                  : selected.filter((id) => id !== carrier.organisationId),
              )
            }
          />
          {carrier.name}
        </label>
      ))}
      <button
        className="button button-secondary"
        type="button"
        disabled={busy || carriers.length === 0}
        onClick={onInvite}
      >
        {copy.saveChanges}
      </button>
    </section>
  );
}

async function downloadTemplate(tenderId: string) {
  const blob = await downloadFile(`/api/tenders/${tenderId}/bid-template`);
  saveBlob(blob, `tender-${tenderId}-price-template.xlsx`);
}
