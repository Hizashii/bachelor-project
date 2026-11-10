import { useState } from "react";
import type { CarrierSubmission } from "../../data";
import type { Copy, Locale } from "../../i18n";
import { getCopy } from "../../i18n";
import { downloadRoadWorkbook } from "./export";

type AdminInboxProps = {
  locale: Locale;
  submissions: readonly CarrierSubmission[];
  onDownload: (id: string) => void;
  onDownloadAll: () => void;
};

export function AdminInbox({
  locale,
  submissions,
  onDownload,
  onDownloadAll,
}: AdminInboxProps) {
  const copy = getCopy(locale);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function downloadOne(submission: CarrierSubmission) {
    setBusy(submission.id);
    setError(false);
    try {
      await downloadRoadWorkbook([submission]);
      onDownload(submission.id);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  async function downloadAll() {
    setBusy("all");
    setError(false);
    try {
      await downloadRoadWorkbook(submissions);
      onDownloadAll();
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-screen">
      <div className="admin-heading">
        <section>
          <h1>{copy.adminTitle}</h1>
          <p>{copy.adminSubtitle}</p>
          <small>
            Road · {submissions.length}{" "}
            {locale === "da" ? "transportører" : "carriers"}
          </small>
        </section>
        <button
          className="button button-secondary"
          type="button"
          onClick={downloadAll}
        >
          {copy.downloadAll}
        </button>
      </div>
      {error ? (
        <p className="form-error">
          {locale === "da"
            ? "Download kunne ikke oprettes. Prøv igen."
            : "The download could not be created. Try again."}
        </p>
      ) : null}
      <div className="submission-list">
        {submissions.map((submission) => (
          <SubmissionRow
            key={submission.id}
            copy={copy}
            submission={submission}
            busy={busy === submission.id}
            onDownload={() => downloadOne(submission)}
          />
        ))}
      </div>
      <p className="template-note">
        {copy.templateNote}{" "}
        <b>Prisskabelon - Road - DK-DK - [Transportør].xlsx</b>
      </p>
      <div className="security-banner admin-security">
        <span className="lock-icon" aria-hidden="true">
          ▣
        </span>
        <span>{copy.adminSecurity}</span>
      </div>
      <div className="sample-card admin-sample">{copy.sampleAdmin}</div>
    </div>
  );
}

function SubmissionRow({
  copy,
  submission,
  busy,
  onDownload,
}: {
  key?: string;
  copy: Copy;
  submission: CarrierSubmission;
  busy: boolean;
  onDownload: () => void;
}) {
  const method = getMethod(copy, submission.unit);
  const downloaded = submission.status === "downloaded";

  return (
    <article className={`submission-row ${downloaded ? "is-downloaded" : ""}`}>
      <div className="submission-info">
        <strong>{submission.carrierName}</strong>
        <span>
          {copy.sent} {formatSentDate(submission.submittedAt)} · {method}
        </span>
        {submission.hasZoneWarning ? (
          <b className="zone-warning">! {copy.zoneWarning}</b>
        ) : null}
      </div>
      <strong className={downloaded ? "status-downloaded" : "status-new"}>
        {downloaded ? copy.statusDownloaded : copy.statusNew}
      </strong>
      <button
        className="button button-download"
        type="button"
        disabled={busy}
        onClick={onDownload}
      >
        {busy ? "…" : downloaded ? copy.downloadAgain : copy.downloadExcel}
      </button>
    </article>
  );
}

function getMethod(copy: Copy, unit: CarrierSubmission["unit"]): string {
  if (unit === "KG") return copy.kg;
  if (unit === "CBM") return copy.cbm;
  if (unit === "LDM") return copy.ldm;
  return copy.pll;
}

function formatSentDate(value: string): string {
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}
