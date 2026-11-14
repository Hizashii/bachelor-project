import { useCallback, useEffect, useState } from "react";
import type { Copy, Locale } from "../../i18n";
import { getCopy } from "../../i18n";

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "";
const DESTINATION = "inbound/shipments";

type StoredFile = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  ownerId: string;
  organizationId: string;
  uploadedAt: string;
  modifiedAt: string;
  processingStatus: "pending" | "processing" | "processed" | "failed";
  versionId: string;
};

type FileManagementProps = { locale: Locale };
type FileInputChange = { currentTarget: HTMLInputElement };

export function FileManagement({ locale }: FileManagementProps) {
  const copy = getCopy(locale);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<StoredFile | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_ORIGIN}/api/files?folder=${encodeURIComponent(DESTINATION)}`,
        { credentials: "include" },
      );
      const payload = await readPayload(response);
      if (!response.ok) {
        throw new FileApiError(
          response.status,
          payload.message as string | undefined,
        );
      }
      setFiles((payload.items ?? []) as StoredFile[]);
    } catch (caught) {
      setError(toUserMessage(caught, copy));
    } finally {
      setLoading(false);
    }
  }, [copy]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  async function uploadSelectedFile() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const initiated = await requestJson("/api/uploads/initiate", {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
          destination: { kind: "inbound-shipments" },
        }),
      });
      const upload = initiated as { uploadId: string; chunkSize: number };
      let offset = 0;
      while (offset < file.size) {
        const end = Math.min(offset + upload.chunkSize, file.size);
        const response = await fetch(
          `${API_ORIGIN}/api/uploads/${encodeURIComponent(upload.uploadId)}`,
          {
            method: "PUT",
            credentials: "include",
            headers: {
              "Content-Range": `bytes ${offset}-${end - 1}/${file.size}`,
              "Content-Type": "application/octet-stream",
            },
            body: file.slice(offset, end),
          },
        );
        const result = await readPayload(response);
        if (!response.ok) {
          throw new FileApiError(
            response.status,
            result.message as string | undefined,
          );
        }
        offset = end;
        if (result.file)
          setFiles((current) => [result.file as StoredFile, ...current]);
      }
      setFile(null);
      setMessage(copy.fileSaved);
      await loadFiles();
    } catch (caught) {
      setError(toUserMessage(caught, copy));
    } finally {
      setBusy(false);
    }
  }

  async function download(fileToDownload: StoredFile) {
    setError(null);
    try {
      const response = await fetch(
        `${API_ORIGIN}/api/files/${encodeURIComponent(fileToDownload.id)}/download`,
        { credentials: "include" },
      );
      if (!response.ok) {
        const payload = await readPayload(response);
        throw new FileApiError(
          response.status,
          payload.message as string | undefined,
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileToDownload.name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(toUserMessage(caught, copy));
    }
  }

  async function remove(fileToRemove: StoredFile) {
    if (!window.confirm(copy.confirmRemove)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_ORIGIN}/api/files/${encodeURIComponent(fileToRemove.id)}`,
        { method: "DELETE", credentials: "include" },
      );
      const payload = await readPayload(response);
      if (!response.ok) {
        throw new FileApiError(
          response.status,
          payload.message as string | undefined,
        );
      }
      setFiles((current) =>
        current.filter((item) => item.id !== fileToRemove.id),
      );
      if (selectedFile?.id === fileToRemove.id) setSelectedFile(null);
      setMessage(copy.fileRemoved);
    } catch (caught) {
      setError(toUserMessage(caught, copy));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen files-screen">
      <section className="page-heading">
        <p className="eyebrow">{copy.filesEyebrow}</p>
        <h1>{copy.filesTitle}</h1>
        <p className="lede">{copy.filesSubtitle}</p>
      </section>

      <section className="cloud-upload white-card">
        <div>
          <p className="field-label">{copy.companyCloud}</p>
          <h2>{copy.saveToCompanyCloud}</h2>
          <p>{file ? file.name : copy.fileSelectionDetail}</p>
        </div>
        <div className="cloud-upload-actions">
          <label className="button button-secondary" htmlFor="freight-file">
            {copy.selectFile}
          </label>
          <input
            id="freight-file"
            className="file-input"
            type="file"
            onChange={(event: FileInputChange) =>
              setFile(event.currentTarget.files?.[0] ?? null)
            }
          />
          <button
            className="button button-primary"
            type="button"
            disabled={!file || busy}
            onClick={() => void uploadSelectedFile()}
          >
            {busy ? copy.working : copy.saveToCloud}
          </button>
        </div>
      </section>

      {message ? <div className="file-message success">✓ {message}</div> : null}
      {error ? (
        <div className="file-message error" role="alert">
          {error}
        </div>
      ) : null}

      <section
        className="file-list-card white-card"
        aria-label={copy.filesTitle}
      >
        <div className="file-list-heading">
          <div>
            <p className="field-label">{copy.companyCloud}</p>
            <h2>{copy.shipmentFiles}</h2>
          </div>
          <button
            className="text-link"
            type="button"
            onClick={() => void loadFiles()}
          >
            {copy.refresh}
          </button>
        </div>
        {loading ? <p className="file-empty">{copy.loading}</p> : null}
        {!loading && files.length === 0 ? (
          <p className="file-empty">{copy.noFiles}</p>
        ) : null}
        {!loading && files.length > 0 ? (
          <div className="file-table-wrap">
            <div className="file-table file-table-header">
              <span>{copy.fileName}</span>
              <span>{copy.fileType}</span>
              <span>{copy.owner}</span>
              <span>{copy.uploadDate}</span>
              <span>{copy.status}</span>
              <span>{copy.actions}</span>
            </div>
            {files.map((item) => (
              <div className="file-table" key={item.id}>
                <strong>{item.name}</strong>
                <span>{item.contentType}</span>
                <span>{item.ownerId}</span>
                <span>
                  {new Intl.DateTimeFormat(
                    locale === "da" ? "da-DK" : "en-GB",
                  ).format(new Date(item.uploadedAt))}
                </span>
                <span className="file-status">
                  {statusLabel(item.processingStatus, copy)}
                </span>
                <span className="file-actions">
                  <button type="button" onClick={() => void download(item)}>
                    {copy.download}
                  </button>
                  <button type="button" onClick={() => setSelectedFile(item)}>
                    {copy.details}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(item)}
                    disabled={busy}
                  >
                    {copy.remove}
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {selectedFile ? (
        <section className="file-details white-card" aria-label={copy.details}>
          <div className="file-list-heading">
            <div>
              <p className="field-label">{copy.details}</p>
              <h2>{selectedFile.name}</h2>
            </div>
            <button
              className="text-link"
              type="button"
              onClick={() => setSelectedFile(null)}
            >
              {copy.close}
            </button>
          </div>
          <dl className="file-metadata">
            <div>
              <dt>{copy.owner}</dt>
              <dd>{selectedFile.ownerId}</dd>
            </div>
            <div>
              <dt>{copy.organisation}</dt>
              <dd>{selectedFile.organizationId}</dd>
            </div>
            <div>
              <dt>{copy.fileType}</dt>
              <dd>{selectedFile.contentType}</dd>
            </div>
            <div>
              <dt>{copy.version}</dt>
              <dd>{selectedFile.versionId}</dd>
            </div>
            <div>
              <dt>{copy.status}</dt>
              <dd>{statusLabel(selectedFile.processingStatus, copy)}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}

class FileApiError extends Error {
  constructor(
    readonly status: number,
    message?: string,
  ) {
    super(message);
  }
}

async function requestJson(
  path: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    credentials: "include",
  });
  const payload = await readPayload(response);
  if (!response.ok)
    throw new FileApiError(
      response.status,
      payload.message as string | undefined,
    );
  return payload;
}

async function readPayload(
  response: Response,
): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text };
  }
}

function toUserMessage(error: unknown, copy: Copy): string {
  if (!(error instanceof FileApiError)) return copy.cloudUnavailable;
  if (error.status === 401) return copy.signInRequired;
  if (error.status === 403) return copy.permissionDenied;
  if (error.status === 404) return copy.fileMissing;
  if (error.status === 409) return copy.filenameConflict;
  if (error.status === 429 || error.status >= 500) return copy.cloudUnavailable;
  return error.message || copy.requestFailed;
}

function statusLabel(
  status: StoredFile["processingStatus"],
  copy: Copy,
): string {
  if (status === "processed") return copy.processed;
  if (status === "processing") return copy.processing;
  if (status === "failed") return copy.failed;
  return copy.pending;
}
