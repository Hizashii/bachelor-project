// Controls the working part of a tender: invitations, bids, comparison and exports.
// It keeps calculations on the API and only displays the returned result.

import { useEffect, useState } from "react";
import { apiFetch, downloadFile, postJson } from "../../api/client";
import type { UserRole } from "../../auth/auth";
import type { Locale } from "../../i18n";
import { getCopy } from "../../i18n";
import { TemplateBindingPanel } from "./TemplateBindingPanel";
import type { TenderRecord } from "./tenderTypes";

const BASIS_POINTS_PER_PERCENT = 100;

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
    } catch {
      setMessage(copy.requestFailed);
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
        {copy.downloadResult}
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
            {copy.open}
          </button>
        ) : null}
        {record.tender.status === "open" ? (
          <button
            className="button button-primary"
            type="button"
            disabled={busy}
            onClick={() => void transition("close")}
          >
            {copy.closed}
          </button>
        ) : null}
        {record.tender.status === "closed" ? (
          <ComparisonPanel locale={locale} tenderId={record.tender.id} />
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

function ComparisonPanel({
  locale,
  tenderId,
}: {
  locale: Locale;
  tenderId: string;
}) {
  const copy = getCopy(locale);
  const [countryCode, setCountryCode] = useState("DE");
  const [weightKg, setWeightKg] = useState("1");
  const [count, setCount] = useState("1");
  const [economyPercent, setEconomyPercent] = useState("50");
  const [result, setResult] = useState<ComparisonResponse>();
  const [message, setMessage] = useState("");

  async function compare() {
    const shipments = [
      {
        countryCode: countryCode.trim().toUpperCase(),
        weightKg: Number(weightKg),
        numberOfShipments: Number(count),
        economyShareBasisPoints:
          Number(economyPercent) * BASIS_POINTS_PER_PERCENT,
      },
    ];
    try {
      setResult(
        await postJson<ComparisonResponse>(`/api/tenders/${tenderId}/compare`, {
          shipments,
        }),
      );
      setMessage("");
    } catch {
      setMessage(copy.requestFailed);
    }
  }

  async function exportResult(format: "xlsx" | "pdf") {
    const shipments = [
      {
        countryCode: countryCode.trim().toUpperCase(),
        weightKg: Number(weightKg),
        numberOfShipments: Number(count),
        economyShareBasisPoints:
          Number(economyPercent) * BASIS_POINTS_PER_PERCENT,
      },
    ];
    const blob = await downloadFile(
      `/api/tenders/${tenderId}/export.${format}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shipments }),
      },
    );
    saveBlob(blob, `tender-${tenderId}-comparison.${format}`);
  }

  return (
    <section aria-labelledby="tender-comparison-title">
      <h3 id="tender-comparison-title">{copy.compare}</h3>
      <label>
        {copy.destinationPostcode}
        <input
          value={countryCode}
          onChange={(event) => setCountryCode(event.target.value)}
        />
      </label>
      <label>
        {copy.calcWeight}
        <input
          type="number"
          min="0.01"
          value={weightKg}
          onChange={(event) => setWeightKg(event.target.value)}
        />
      </label>
      <label>
        {copy.shipmentTitle}
        <input
          type="number"
          min="1"
          value={count}
          onChange={(event) => setCount(event.target.value)}
        />
      </label>
      <label>
        {copy.pricesStep}
        <input
          type="number"
          min="0"
          max="100"
          value={economyPercent}
          onChange={(event) => setEconomyPercent(event.target.value)}
        />
      </label>
      <button
        className="button button-secondary"
        type="button"
        onClick={() => void compare()}
      >
        {copy.compare}
      </button>
      <button
        className="button button-secondary"
        type="button"
        onClick={() => void exportResult("xlsx")}
      >
        {copy.downloadResult} Excel
      </button>
      <button
        className="button button-secondary"
        type="button"
        onClick={() => void exportResult("pdf")}
      >
        {copy.downloadResult} PDF
      </button>
      {message ? <p role="alert">{message}</p> : null}
      {result?.candidates.map((candidate) => (
        <p key={candidate.bidVersionId}>
          {candidate.vendorName ?? candidate.carrierCompanyId}:{" "}
          {candidate.result
            ? `${(candidate.result.totalMinor / 100).toFixed(2)} ${result.currency}`
            : candidate.error}
        </p>
      ))}
    </section>
  );
}

type ComparisonResponse = {
  currency: string;
  candidates: {
    carrierCompanyId: string;
    bidVersionId: string;
    vendorName: string | null;
    result: { totalMinor: number } | null;
    error: string | null;
  }[];
};

async function downloadTemplate(tenderId: string) {
  const blob = await downloadFile(`/api/tenders/${tenderId}/bid-template`);
  saveBlob(blob, `tender-${tenderId}-price-template.xlsx`);
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
