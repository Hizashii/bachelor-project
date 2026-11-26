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
import { BidStatusPanel } from "./BidStatusPanel";
import { bindTemplates } from "./bindTemplates";
import { ShipmentBasisPanel } from "./ShipmentBasisPanel";
import { TenderComparison } from "./TenderComparison";
import type { TenderRecord } from "./tenderTypes";
import { useBidStatus } from "./useBidStatus";

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

  const { status: bids } = useBidStatus(tenderId, status === "open");
  if (status === "closed" || status === "awarded") {
    return <CarrierOutcome locale={locale} tenderId={tenderId} />;
  }
  if (status !== "open") return null;
  const mine = bids[0];

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
      <p className={mine ? "bid-sent" : "bid-waiting"}>
        {copy.yourBid}:{" "}
        {mine
          ? `${copy.bidSubmitted} v${mine.versionNumber}`
          : copy.bidNotSubmitted}
      </p>
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
    void apiFetch<CarrierOption[]>("/api/tender-carriers")
      .then(setCarriers)
      .catch(() => undefined);
  }, []);

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
      if (action === "open") {
        await bindTemplates(
          record.tender.id,
          next.tender.invitedCarrierCompanyIds,
        ).catch(() => setMessage(copy.templatesNotAttached));
      }
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
      await bindTemplates(record.tender.id, selected).catch(() =>
        setMessage(copy.templatesNotAttached),
      );
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
        {record.tender.status === "closed" ||
        record.tender.status === "awarded" ? (
          <TenderComparison
            locale={locale}
            record={record}
            onChanged={onChanged}
          />
        ) : null}
        {message ? <p role="status">{message}</p> : null}
      </section>
      {record.tender.status === "open" || record.tender.status === "closed" ? (
        <ShipmentBasisPanel locale={locale} tenderId={record.tender.id} />
      ) : null}
      {record.tender.status === "open" || record.tender.status === "closed" ? (
        <BidStatusPanel
          locale={locale}
          record={record}
          carrierNames={Object.fromEntries(
            carriers.map((carrier) => [carrier.organisationId, carrier.name]),
          )}
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
      <button
        className="button button-secondary"
        type="button"
        onClick={() => setSelected(carriers.map((c) => c.organisationId))}
      >
        {copy.selectAllCarriers}
      </button>
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

// A carrier learns only its own result: won, not won, or still waiting. Never other prices.
function CarrierOutcome({
  locale,
  tenderId,
}: {
  locale: Locale;
  tenderId: string;
}) {
  const copy = getCopy(locale);
  const [won, setWon] = useState<boolean | null>(null);
  useEffect(() => {
    void apiFetch<{ won: boolean | null }>(`/api/tenders/${tenderId}/outcome`)
      .then((outcome) => setWon(outcome.won))
      .catch(() => undefined);
  }, [tenderId]);
  const text =
    won === null
      ? copy.outcomeClosed
      : won
        ? copy.outcomeWon
        : copy.outcomeLost;
  return (
    <section
      className="white-card tender-workflow-card"
      aria-label={copy.yourBid}
    >
      <h2>{copy.yourBid}</h2>
      <p role="status" className={won ? "bid-sent" : "bid-waiting"}>
        {text}
      </p>
    </section>
  );
}
