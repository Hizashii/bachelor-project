import type { TemplateVersion } from "@freight-desk/shared";
import { useCallback, useEffect, useState } from "react";
import type { Copy, Locale } from "../../i18n";
import { getCopy } from "../../i18n";

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "";

type TemplateSummary = Pick<
  TemplateVersion,
  | "id"
  | "kind"
  | "version"
  | "title"
  | "mappingStatus"
  | "immutable"
  | "source"
  | "blankContract"
> & { worksheetCount: number };

type TemplateApiError = { status: number; message?: string };

type TemplateRegistryPanelProps = { locale: Locale };

export function TemplateRegistryPanel({ locale }: TemplateRegistryPanelProps) {
  const copy = getCopy(locale);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selected, setSelected] = useState<TemplateVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<TemplateApiError | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_ORIGIN}/api/documents/templates`, {
        credentials: "include",
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        throw { status: response.status, message: payload.message as string };
      }
      const items = (payload.items ?? []) as TemplateSummary[];
      setTemplates(items);
      setSelected(null);
    } catch (caught) {
      setError(toTemplateError(caught));
      setTemplates([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  async function showTemplate(template: TemplateSummary) {
    setError(null);
    try {
      const response = await fetch(
        `${API_ORIGIN}/api/documents/templates/${encodeURIComponent(template.id)}/versions/${encodeURIComponent(template.version)}`,
        { credentials: "include" },
      );
      const payload = await readPayload(response);
      if (!response.ok) {
        throw { status: response.status, message: payload.message as string };
      }
      setSelected(payload as TemplateVersion);
    } catch (caught) {
      setError(toTemplateError(caught));
    }
  }

  return (
    <section
      className="template-registry-screen"
      aria-label={copy.templatesTitle}
    >
      <section className="page-heading">
        <p className="eyebrow">{copy.templatesEyebrow}</p>
        <h1>{copy.templatesTitle}</h1>
        <p className="lede">{copy.templatesSubtitle}</p>
      </section>

      {loading ? (
        <p className="template-empty">{copy.templateLoading}</p>
      ) : null}
      {!loading && error ? <TemplateError error={error} copy={copy} /> : null}
      {!loading && !error && templates.length === 0 ? (
        <section className="template-empty-card white-card">
          <p className="eyebrow">{copy.templateNotConfigured}</p>
          <h2>{copy.templateNotConfigured}</h2>
          <p>{copy.templateNotConfiguredDetail}</p>
        </section>
      ) : null}
      {!loading && !error && templates.length > 0 ? (
        <div className="template-layout">
          <section
            className="template-list white-card"
            aria-label={copy.templatesTitle}
          >
            <div className="file-list-heading">
              <div>
                <p className="field-label">{copy.templateConfigured}</p>
                <h2>{copy.tenderTemplateTab}</h2>
              </div>
              <button
                className="text-link"
                type="button"
                onClick={() => void loadTemplates()}
              >
                {copy.templateRefresh}
              </button>
            </div>
            {templates.map((template) => (
              <button
                className={`template-list-item${selected?.id === template.id ? " active" : ""}`}
                key={`${template.id}@${template.version}`}
                type="button"
                onClick={() => void showTemplate(template)}
              >
                <span>
                  <strong>{template.title}</strong>
                  <small>{template.kind}</small>
                </span>
                <span className="template-list-version">
                  v{template.version}
                </span>
              </button>
            ))}
          </section>

          {selected ? (
            <TemplateDetails template={selected} copy={copy} />
          ) : (
            <section className="template-empty-card white-card">
              <p className="eyebrow">{copy.templateStructure}</p>
              <h2>{copy.tenderTemplateTab}</h2>
              <p>{copy.templateNotConfiguredDetail}</p>
            </section>
          )}
        </div>
      ) : null}
    </section>
  );
}

function TemplateDetails({
  template,
  copy,
}: {
  template: TemplateVersion;
  copy: Copy;
}) {
  return (
    <section className="template-details white-card">
      <div className="file-list-heading">
        <div>
          <p className="field-label">{copy.templateStructure}</p>
          <h2>{template.title}</h2>
        </div>
        <span className="template-status-badge">
          {statusLabel(template, copy)}
        </span>
      </div>
      <dl className="template-metadata">
        <div>
          <dt>{copy.templateVersion}</dt>
          <dd>v{template.version}</dd>
        </div>
        <div>
          <dt>{copy.templateKind}</dt>
          <dd>{template.kind}</dd>
        </div>
        <div>
          <dt>{copy.templateSheets}</dt>
          <dd>{template.sheets.length}</dd>
        </div>
        <div>
          <dt>{copy.templateFields}</dt>
          <dd>{template.fields.length}</dd>
        </div>
        <div>
          <dt>{copy.templateSource}</dt>
          <dd className="template-reference">
            {template.source.immutableFileReference}
          </dd>
        </div>
      </dl>
      <div className="template-contract-note">
        <strong>{copy.templateBlankContract}</strong>
        <span className="template-contract-note-secondary">
          {copy.templateNoCommercialInputs}
        </span>
      </div>
      <div className="template-sheet-list">
        {template.sheets.map((sheet) => (
          <div className="template-sheet-row" key={sheet.name}>
            <div>
              <strong>{sheet.name}</strong>
              <span className="template-sheet-subline">{sheet.role}</span>
            </div>
            <span className="template-sheet-meta">{sheet.dimension}</span>
            <span className="template-sheet-meta">
              {sheet.formulaCount} formulas
            </span>
          </div>
        ))}
      </div>
      <div className="template-review-notes">
        <p className="field-label">{copy.templateReviewNotes}</p>
        <ul>
          {template.reviewNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function statusLabel(template: TemplateVersion, copy: Copy): string {
  return template.mappingStatus === "verified"
    ? copy.templateConfigured
    : copy.templateUnverified;
}

function TemplateError({
  error,
  copy,
}: {
  error: TemplateApiError;
  copy: Copy;
}) {
  if (error.status === 401) {
    return (
      <div className="file-message error" role="alert">
        {copy.templateSignInRequired}
      </div>
    );
  }
  if (error.status === 403) {
    return (
      <div className="file-message error" role="alert">
        {copy.templatePermissionDenied}
      </div>
    );
  }
  return (
    <div className="file-message error" role="alert">
      {error.message ?? copy.templateNotConfigured}
    </div>
  );
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

function toTemplateError(error: unknown): TemplateApiError {
  if (typeof error === "object" && error !== null && "status" in error) {
    const candidate = error as { status?: unknown; message?: unknown };
    return {
      status: typeof candidate.status === "number" ? candidate.status : 500,
      message:
        typeof candidate.message === "string" ? candidate.message : undefined,
    };
  }
  return { status: 500 };
}
