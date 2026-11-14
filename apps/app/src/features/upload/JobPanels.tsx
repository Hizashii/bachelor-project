import type { Copy } from "../../i18n";
import type { JobView } from "./types";
import type { SaveState } from "./useImportJob";

export function ProgressPanel({
  copy,
  job,
  onCancel,
}: {
  copy: Copy;
  job: JobView;
  onCancel: () => void;
}) {
  return (
    <section className="white-card upload-panel" role="status">
      <h2>{copy.processingTitle}</h2>
      <p>
        {job.progress.toLocaleString("da-DK")} {copy.rowsDone}
      </p>
      <button
        className="button button-secondary"
        type="button"
        onClick={onCancel}
      >
        {copy.cancel}
      </button>
    </section>
  );
}

export function FailedPanel({
  copy,
  job,
  onRetry,
}: {
  copy: Copy;
  job: JobView;
  onRetry: () => void;
}) {
  return (
    <section className="white-card upload-panel" role="alert">
      <h2>{job.error ?? copy.saveFailed}</h2>
      <button
        className="button button-secondary"
        type="button"
        onClick={onRetry}
      >
        {copy.retry}
      </button>
    </section>
  );
}

type ResultPanelProps = {
  copy: Copy;
  job: JobView;
  saveState: SaveState;
  onSave: () => void;
  onDownload: () => void;
};

export function ResultPanel({
  copy,
  job,
  saveState,
  onSave,
  onDownload,
}: ResultPanelProps) {
  const result = job.result;
  if (!result) return null;
  const counts = result.issueCounts;
  const issues: [string, number][] = [
    [copy.issueMissing, counts.missing],
    [copy.issueInvalid, counts.invalid],
    [copy.issueDuplicate, counts.duplicate],
    [copy.issueInconsistent, counts.inconsistent],
  ];
  return (
    <section className="white-card upload-panel">
      <h2>{copy.doneTitle}</h2>
      <dl className="upload-stats">
        <div>
          <dt>{copy.rowsTotal}</dt>
          <dd>{result.rowsRead.toLocaleString("da-DK")}</dd>
        </div>
        <div>
          <dt>{copy.rowsOk}</dt>
          <dd>{result.rowsClean.toLocaleString("da-DK")}</dd>
        </div>
        <div>
          <dt>{copy.rowsBad}</dt>
          <dd>{result.rowsWithIssues.toLocaleString("da-DK")}</dd>
        </div>
      </dl>
      <ul className="upload-issues">
        {issues
          .filter(([, count]) => count > 0)
          .map(([label, count]) => (
            <li key={label}>
              {label}: {count.toLocaleString("da-DK")}
            </li>
          ))}
      </ul>
      <div className="upload-actions">
        <div>
          <button
            className="button button-primary"
            type="button"
            disabled={saveState === "saving"}
            onClick={onSave}
          >
            {saveState === "saving" ? copy.savingNow : copy.saveToCloud}
          </button>
          <small>{copy.saveToCloudHint}</small>
        </div>
        <div>
          <button
            className="button button-secondary"
            type="button"
            onClick={onDownload}
          >
            {copy.downloadResult}
          </button>
          <small>{copy.downloadHint}</small>
        </div>
      </div>
      {saveState === "saved" ? (
        <p className="saved-message" role="status">
          ✓ {copy.savedToCloud}
        </p>
      ) : null}
      {saveState === "failed" ? (
        <p className="upload-error" role="alert">
          {copy.saveFailed}
        </p>
      ) : null}
    </section>
  );
}
