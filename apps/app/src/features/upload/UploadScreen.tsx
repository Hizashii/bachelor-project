import type { ReactElement } from "react";
import { type Copy, getCopy, type Locale } from "../../i18n";
import { FailedPanel, ProgressPanel, ResultPanel } from "./JobPanels";
import { MappingTable } from "./MappingTable";
import { useImportJob } from "./useImportJob";
import { useImportSession } from "./useImportSession";

type FileEvent = { currentTarget: { files: FileList | null } };
type DropEvent = {
  preventDefault: () => void;
  dataTransfer: { files: FileList };
};

const PREVIEW_ROWS_SHOWN = 8;

export function UploadScreen({ locale }: { locale: Locale }): ReactElement {
  const copy = getCopy(locale);
  const session = useImportSession();
  const flow = useImportJob(session.sessionId, session.mapping);
  const state = flow.job?.state;
  const processing = state === "pending" || state === "processing";

  return (
    <div className="screen upload-screen">
      <section className="page-heading">
        <h1>{copy.uploadHeading}</h1>
        <p className="lede">{copy.uploadIntro}</p>
      </section>
      {session.error || flow.error ? (
        <p className="upload-error" role="alert">
          {session.error ?? flow.error}
        </p>
      ) : null}
      {session.inspection ? null : (
        <FileChooser copy={copy} busy={session.busy} onFile={session.open} />
      )}
      {session.inspection ? null : (
        <DraftList copy={copy} library={session.library} />
      )}
      {session.inspection && !flow.job ? (
        <MappingStep copy={copy} session={session} flow={flow} />
      ) : null}
      {processing && flow.job ? (
        <ProgressPanel copy={copy} job={flow.job} onCancel={flow.cancel} />
      ) : null}
      {state === "failed" && flow.job ? (
        <FailedPanel copy={copy} job={flow.job} onRetry={flow.retry} />
      ) : null}
      {state === "completed" && flow.job ? (
        <ResultPanel
          copy={copy}
          job={flow.job}
          saveState={flow.saveState}
          onSave={flow.save}
          onDownload={flow.download}
        />
      ) : null}
      {session.inspection ? (
        <button className="text-link" type="button" onClick={session.startOver}>
          {copy.startOver}
        </button>
      ) : null}
    </div>
  );
}

function FileChooser({
  copy,
  busy,
  onFile,
}: {
  copy: Copy;
  busy: boolean;
  onFile: (file: File) => void;
}) {
  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };
  return (
    <fieldset
      className="upload-drop white-card"
      onDragOver={(event: DropEvent) => event.preventDefault()}
      onDrop={(event: DropEvent) => {
        event.preventDefault();
        pick(event.dataTransfer.files);
      }}
    >
      <legend className="sr-only">{copy.chooseFile}</legend>
      <label className="button button-primary" htmlFor="shipment-file">
        {busy ? copy.uploading : copy.chooseFile}
      </label>
      <input
        id="shipment-file"
        className="file-input"
        type="file"
        accept=".xlsx,.csv"
        onChange={(event: FileEvent) => pick(event.currentTarget.files)}
      />
      <span>{copy.dropHint}</span>
    </fieldset>
  );
}

type StepProps = {
  copy: Copy;
  session: ReturnType<typeof useImportSession>;
  flow: ReturnType<typeof useImportJob>;
};

function MappingStep({ copy, session, flow }: StepProps) {
  const { inspection, mapping } = session;
  if (!inspection) return null;
  const missing = inspection.missingRequired.filter(
    (field) => mapping[field] === undefined,
  );
  const bad =
    session.sample?.filter((row) => row.issues.length > 0).length ?? 0;
  return (
    <section className="upload-step">
      <h2>{copy.mappingTitle}</h2>
      <p>{copy.mappingHint}</p>
      {session.known ? (
        <p role="status">
          {copy.knownSetup
            .replace("{name}", session.known.name)
            .replace("{version}", String(session.known.version))}
        </p>
      ) : null}
      <MappingTable
        copy={copy}
        inspection={inspection}
        mapping={mapping}
        onChange={session.setMapping}
      />
      {missing.length > 0 ? (
        <p className="upload-error" role="alert">
          {copy.requiredMissing}{" "}
          {missing.map((field) => copy.fieldNames[field]).join(", ")}
        </p>
      ) : null}
      <h3>{copy.previewTitle}</h3>
      <div className="upload-preview white-card">
        {inspection.previewRows
          .slice(0, PREVIEW_ROWS_SHOWN)
          .map((row, index) => (
            <div
              className="upload-preview-row"
              // biome-ignore lint/suspicious/noArrayIndexKey: preview rows are read-only and have no id
              key={index}
            >
              {inspection.headers.map((header, column) => (
                <span
                  className="upload-preview-cell"
                  // biome-ignore lint/suspicious/noArrayIndexKey: columns have no other id
                  key={column}
                  title={header}
                >
                  {String(row[column] ?? "")}
                </span>
              ))}
            </div>
          ))}
      </div>
      <div className="upload-actions">
        <button
          className="button button-secondary"
          type="button"
          disabled={missing.length > 0 || session.busy}
          onClick={session.checkSample}
        >
          {copy.checkSample}
        </button>
        <label>
          {copy.fileFormat}{" "}
          <select
            value={flow.format}
            onChange={(event: { currentTarget: HTMLSelectElement }) =>
              flow.setFormat(
                event.currentTarget.value === "csv" ? "csv" : "xlsx",
              )
            }
          >
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV</option>
          </select>
        </label>
        <button
          className="button button-primary"
          type="button"
          disabled={missing.length > 0 || flow.busy}
          onClick={flow.start}
        >
          {copy.startProcessing}
        </button>
      </div>
      <div className="upload-actions">
        <button
          className="button button-secondary"
          type="button"
          disabled={session.library.draftState === "saving"}
          onClick={() => session.library.saveDraft(flow.format)}
        >
          {copy.saveDraft}
        </button>
        <button
          className="button button-secondary"
          type="button"
          disabled={session.busy}
          onClick={session.library.remember}
        >
          {copy.rememberSetup}
        </button>
      </div>
      {session.library.draftState === "saved" ? (
        <p className="saved-message" role="status">
          ✓ {copy.draftSaved}
        </p>
      ) : null}
      {session.library.draftState === "failed" ? (
        <p className="upload-error" role="alert">
          {copy.draftSaveFailed}
        </p>
      ) : null}
      {session.library.remembered ? (
        <p className="saved-message" role="status">
          ✓ {copy.setupRemembered}
        </p>
      ) : null}
      {session.sample ? (
        <p role="status">
          {copy.sampleResult
            .replace("{bad}", String(bad))
            .replace("{total}", String(session.sample.length))}
        </p>
      ) : null}
    </section>
  );
}

type DraftListProps = {
  copy: Copy;
  library: ReturnType<typeof useImportSession>["library"];
};

function DraftList({ copy, library }: DraftListProps) {
  if (library.drafts.length === 0) return null;
  return (
    <section className="upload-step">
      <h2>{copy.openDrafts}</h2>
      <div className="white-card upload-panel">
        {library.drafts.map((draft) => (
          <div className="upload-actions" key={draft.draftId}>
            <span>
              {draft.originalName} ·{" "}
              {new Date(draft.savedAt).toLocaleString("da-DK")}
            </span>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => library.reopen(draft.draftId)}
            >
              {copy.openDraft}
            </button>
            <button
              className="text-link"
              type="button"
              onClick={() => library.discardDraft(draft.draftId)}
            >
              {copy.discardDraft}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
