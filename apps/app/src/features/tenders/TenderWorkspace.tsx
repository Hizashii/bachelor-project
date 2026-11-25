import type {
  TemplateVersion,
  TemplateVersionBinding,
  WorkbookCellKind,
  WorkbookSheet,
} from "@freight-desk/shared";
import { parseDecimalInput, verifiedTemplateView } from "@freight-desk/shared";
import { useCallback, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { csrfHeader } from "../../api/client";
import type { Locale } from "../../i18n";
import { getCopy } from "../../i18n";
import { WorkbookTable } from "./WorkbookTable";

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "";
type TemplateKind = "customer-bidding" | "express-price";

type ConfiguredTemplate = {
  binding: TemplateVersionBinding;
  template: TemplateVersion;
};

type TemplateResponse = {
  tenderId: string;
  configured: boolean;
  nextStep: string | null;
  items: ConfiguredTemplate[];
};

type DraftResponse = {
  tenderId: string;
  template: TemplateVersion | null;
  revision: number;
  values: Record<string, string | null>;
  etag: string;
};

type Notice =
  | { kind: "saved"; text: string }
  | { kind: "unsaved"; text: string }
  | { kind: "error"; text: string }
  | { kind: "conflict"; text: string }
  | null;

export function TenderWorkspace({ locale }: { locale: Locale }) {
  const copy = getCopy(locale);
  const id = useLocation().pathname.match(/^\/tenders\/([^/]+)/)?.[1];
  const [response, setResponse] = useState<TemplateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState<TemplateKind | null>(null);

  const loadTemplates = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await request<TemplateResponse>(
        `/api/tenders/${encodeURIComponent(id)}/templates`,
      );
      setResponse(result);
      setActiveKind((current) =>
        current && result.items.some((item) => item.template.kind === current)
          ? current
          : (result.items[0]?.template.kind ?? null),
      );
    } catch (error) {
      setLoadError(errorMessage(error, copy));
      setResponse(null);
    } finally {
      setLoading(false);
    }
  }, [copy, id]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  if (loading) {
    return (
      <p className="screen tender-workspace-status">
        {copy.tenderWorkspaceLoading}
      </p>
    );
  }
  if (loadError) {
    return (
      <div className="screen tender-workspace-status">
        <div className="file-message error" role="alert">
          {loadError}
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void loadTemplates()}
        >
          {copy.refresh}
        </button>
      </div>
    );
  }
  if (!response?.configured || response.items.length === 0) {
    return (
      <div className="screen tender-workspace-screen">
        <WorkspaceHeader tenderId={id ?? ""} locale={locale} />
        <section
          className="template-empty-card white-card"
          aria-labelledby="template-not-configured-title"
        >
          <p className="eyebrow">{copy.tenderTemplateTab}</p>
          <h2 id="template-not-configured-title">
            {copy.templateNotConfigured}
          </h2>
          <p>{copy.templateNotConfiguredDetail}</p>
          <p className="tender-next-step">
            <strong>{copy.nextStep}:</strong>{" "}
            {response?.nextStep ?? copy.templateNotConfiguredNextStep}
          </p>
        </section>
      </div>
    );
  }

  const selected =
    response.items.find((item) => item.template.kind === activeKind) ??
    response.items[0];
  return (
    <div className="screen tender-workspace-screen">
      <WorkspaceHeader tenderId={id ?? ""} locale={locale} />
      <div
        className="tender-template-tabs"
        role="tablist"
        aria-label={copy.tenderTemplateTab}
      >
        {response.items.map((item) => (
          <button
            aria-selected={item.template.kind === selected.template.kind}
            className={
              item.template.kind === selected.template.kind
                ? "tender-template-tab active"
                : "tender-template-tab"
            }
            key={`${item.template.id}@${item.template.version}`}
            role="tab"
            type="button"
            onClick={() => setActiveKind(item.template.kind)}
          >
            {item.template.title}
          </button>
        ))}
      </div>
      <TenderTemplateEditor
        item={selected}
        locale={locale}
        tenderId={id ?? ""}
      />
    </div>
  );
}

function WorkspaceHeader({
  tenderId,
  locale,
}: {
  tenderId: string;
  locale: Locale;
}) {
  const copy = getCopy(locale);
  return (
    <header className="tender-workspace-heading">
      <div>
        <p className="eyebrow">{copy.tenderWorkspaceEyebrow}</p>
        <h1>{copy.tenderWorkspaceTitle}</h1>
        <p className="lede">
          {copy.tenderWorkspaceTender}: {tenderId}
        </p>
      </div>
      <NavLink className="button button-secondary" to="/files">
        {copy.documentsTab}
      </NavLink>
    </header>
  );
}

function TenderTemplateEditor({
  item,
  locale,
  tenderId,
}: {
  item: ConfiguredTemplate;
  locale: Locale;
  tenderId: string;
}) {
  const copy = getCopy(locale);
  const view = verifiedTemplateView(item.template.kind);
  const [sheetName, setSheetName] = useState(view.sheets[0]?.name ?? "");
  const [values, setValues] = useState<Record<string, string | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const loadDraft = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const result = await request<DraftResponse>(
        `/api/tenders/${encodeURIComponent(tenderId)}/bid-draft?templateId=${encodeURIComponent(item.template.kind)}`,
      );
      setValues(result.values ?? {});
      setRevision(result.revision);
      setErrors({});
      setDirty(false);
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error, copy) });
    } finally {
      setLoading(false);
    }
  }, [copy, item.template.kind, tenderId]);

  useEffect(() => {
    setSheetName(view.sheets[0]?.name ?? "");
    void loadDraft();
  }, [loadDraft, view.sheets]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const sheet =
    view.sheets.find((candidate) => candidate.name === sheetName) ??
    view.sheets[0];

  function changeValue(cellId: string, value: string) {
    setValues((current) => ({ ...current, [cellId]: value }));
    setErrors((current) => removeError(current, cellId));
    setDirty(true);
    setNotice({ kind: "unsaved", text: copy.tenderUnsaved });
  }

  function blurValue(cellId: string, kind: WorkbookCellKind) {
    if (!isDecimalKind(kind)) return;
    const value = values[cellId] ?? "";
    if (value.trim() === "") return;
    const da = parseDecimalInput(value, "da");
    const en = parseDecimalInput(value, "en");
    if (!da.ok && !en.ok) {
      setErrors((current) => ({
        ...current,
        [cellId]: copy.tenderInvalidDecimal,
      }));
      return;
    }
    setErrors((current) => removeError(current, cellId));
  }

  function validateAll(): boolean {
    const nextErrors: Record<string, string> = {};
    for (const [cellId, value] of Object.entries(values)) {
      if (!value || value.trim() === "") continue;
      const kind = kindForCell(view.sheets, cellId);
      if (!kind || !isDecimalKind(kind)) continue;
      if (
        !parseDecimalInput(value, "da").ok &&
        !parseDecimalInput(value, "en").ok
      ) {
        nextErrors[cellId] = copy.tenderInvalidDecimal;
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function save() {
    if (!validateAll()) {
      setNotice({ kind: "error", text: copy.tenderFixErrors });
      return;
    }
    setNotice(null);
    try {
      const result = await request<DraftResponse>(
        `/api/tenders/${encodeURIComponent(tenderId)}/bid-draft`,
        "PUT",
        {
          templateId: item.template.kind,
          templateVersion: item.template.version,
          sourceSha256: item.template.source.sha256,
          expectedRevision: revision,
          values,
        },
      );
      setRevision(result.revision);
      setDirty(false);
      setNotice({ kind: "saved", text: copy.tenderSaved });
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      setNotice(
        status === 409
          ? { kind: "conflict", text: copy.tenderConflict }
          : { kind: "error", text: errorMessage(error, copy) },
      );
    }
  }

  if (loading || !sheet)
    return <p className="tender-workspace-status">{copy.tenderDraftLoading}</p>;

  return (
    <section className="tender-editor" aria-label={item.template.title}>
      <div className="tender-editor-heading">
        <div>
          <p className="field-label">v{item.template.version}</p>
          <h2>{item.template.title}</h2>
        </div>
        <span className="tender-draft-scope">{copy.tenderDraftPrivate}</span>
      </div>
      <div
        className="tender-sheet-tabs"
        role="tablist"
        aria-label={copy.templateSheets}
      >
        {view.sheets.map((candidate) => (
          <button
            aria-selected={candidate.name === sheet.name}
            className={
              candidate.name === sheet.name
                ? "tender-sheet-tab active"
                : "tender-sheet-tab"
            }
            key={candidate.name}
            role="tab"
            type="button"
            onClick={() => setSheetName(candidate.name)}
          >
            <span>{candidate.name}</span>
            <small>{candidate.role}</small>
          </button>
        ))}
      </div>
      {item.template.kind === "express-price" && sheet.name !== "Total cost" ? (
        <VendorInput
          sheet={sheet}
          value={values[cellId(item.template.kind, sheet, "C7")] ?? ""}
          error={errors[cellId(item.template.kind, sheet, "C7")]}
          onChange={(value) =>
            changeValue(cellId(item.template.kind, sheet, "C7"), value)
          }
          onBlur={() => undefined}
          copy={copy}
        />
      ) : null}
      <WorkbookTable
        templateId={item.template.kind}
        sheet={sheet}
        values={values}
        errors={errors}
        onChange={changeValue}
        onBlur={blurValue}
      />
      <div className="tender-editor-footer">
        <div className="tender-editor-notices" aria-live="polite">
          {notice ? (
            <span className={`tender-notice ${notice.kind}`}>
              {notice.text}
            </span>
          ) : null}
          <span className="tender-no-submit">
            {copy.tenderSubmitUnavailable}
          </span>
        </div>
        <div className="tender-editor-actions">
          {notice?.kind === "conflict" ? (
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void loadDraft()}
            >
              {copy.tenderReloadLatest}
            </button>
          ) : null}
          <button
            className="button button-primary"
            disabled={!dirty || Object.keys(errors).length > 0}
            type="button"
            onClick={() => void save()}
          >
            {copy.saveChanges}
          </button>
        </div>
      </div>
    </section>
  );
}

function VendorInput({
  sheet,
  value,
  error,
  onChange,
  onBlur,
  copy,
}: {
  sheet: WorkbookSheet;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  copy: ReturnType<typeof getCopy>;
}) {
  return (
    <div className="tender-vendor-field">
      <label htmlFor={`vendor-${sheet.name}`}>{copy.tenderVendorName}</label>
      <input
        aria-invalid={error ? true : undefined}
        id={`vendor-${sheet.name}`}
        value={value}
        onBlur={onBlur}
        onChange={(event: { currentTarget: HTMLInputElement }) =>
          onChange(event.currentTarget.value)
        }
      />
      {error ? (
        <span className="workbook-cell-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function cellId(templateId: string, sheet: WorkbookSheet, address: string) {
  return `${templateId}|${sheet.name}|${address}`;
}

function kindForCell(
  sheets: WorkbookSheet[],
  key: string,
): WorkbookCellKind | null {
  const parts = key.split("|");
  if (parts.length !== 3) return null;
  const sheet = sheets.find((candidate) => candidate.name === parts[1]);
  if (!sheet) return null;
  if (parts[2] === "C7" || parts[2] === "D7") return "editable-text";
  const match = /^([A-Z]+)(\d+)$/.exec(parts[2]);
  if (!match) return null;
  const sourceColumn = match[1];
  const sourceRow = Number(match[2]);
  for (const section of sheet.sections) {
    const row = section.rows.find(
      (candidate) => candidate.sourceRow === sourceRow,
    );
    const column = section.columns.find(
      (candidate) => candidate.sourceColumn === sourceColumn,
    );
    if (row && column)
      return row.kind === "total" && column.kind.startsWith("editable")
        ? "formula"
        : column.kind;
  }
  return null;
}

function isDecimalKind(kind: WorkbookCellKind) {
  return kind === "editable-decimal" || kind === "editable-currency";
}

function removeError(errors: Record<string, string>, key: string) {
  const next = { ...errors };
  delete next[key];
  return next;
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    credentials: "include",
    headers: {
      ...(method === "GET" ? {} : await csrfHeader()),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    method,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload.message === "string"
        ? payload.message
        : "The request could not be completed.";
    throw new ApiError(response.status, message);
  }
  return payload as T;
}

function errorMessage(error: unknown, copy: ReturnType<typeof getCopy>) {
  if (error instanceof ApiError) {
    if (error.status === 401) return copy.tenderSignInRequired;
    if (error.status === 403) return copy.tenderPermissionDenied;
    return error.message;
  }
  return copy.requestFailed;
}
