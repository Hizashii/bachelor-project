import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router";
import { ApiError, apiFetch } from "../../api/client";
import { ActionBar, Field, PageHeader } from "../../components/OperationalUI";
import type { Locale } from "../../i18n";
import { getCopy } from "../../i18n";
import {
  draftInputOf,
  emptyTenderDraft,
  type TenderDraftValues,
  type TenderRecord,
} from "./tenderTypes";

type TenderFormProps = { locale: Locale; tenderId?: string };
type FieldErrors = Partial<Record<keyof TenderDraftValues, string>>;

export function TenderForm({ locale, tenderId }: TenderFormProps) {
  const copy = getCopy(locale);
  const navigate = useNavigate();
  const editing = Boolean(tenderId);
  const [values, setValues] = useState(emptyTenderDraft);
  const [etag, setEtag] = useState<string>();
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (tenderId)
      void loadTender(
        tenderId,
        setValues,
        setEtag,
        setError,
        setLoading,
        copy.tenderLoadError,
      );
  }, [tenderId, copy.tenderLoadError]);

  function update<K extends keyof TenderDraftValues>(
    key: K,
    value: TenderDraftValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setError(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validate(values, locale);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    setError(undefined);
    try {
      const body = JSON.stringify({
        draft: draftInputOf(values),
        ...(etag ? { ifMatch: etag } : {}),
      });
      const result = editing
        ? await apiFetch<TenderRecord>(`/api/tenders/${tenderId}/draft`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body,
          })
        : await apiFetch<TenderRecord>("/api/tenders", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
          });
      navigate(`/tenders/${result.tender.id}`);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 409
          ? copy.tenderConflict
          : copy.tenderSaveError,
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return <p className="screen tender-loading">{copy.tenderLoading}</p>;

  return (
    <div className="screen tender-form-screen">
      <PageHeader
        title={editing ? copy.editTender : copy.newTender}
        description={copy.newTenderDescription}
        action={
          <NavLink
            className="button button-secondary"
            to={tenderId ? `/tenders/${tenderId}` : "/tenders"}
          >
            {copy.backToTenders}
          </NavLink>
        }
      />
      {error ? (
        <div className="tender-message error" role="alert">
          <span>{error}</span>
          {editing && error === copy.tenderConflict ? (
            <button
              className="text-link"
              type="button"
              onClick={() =>
                void loadTender(
                  tenderId,
                  setValues,
                  setEtag,
                  setError,
                  setLoading,
                  copy.tenderLoadError,
                )
              }
            >
              {copy.reloadTender}
            </button>
          ) : null}
        </div>
      ) : null}
      <form className="white-card tender-form" onSubmit={submit} noValidate>
        <div className="tender-form-grid">
          <TenderField
            id="tender-name"
            label={copy.tenderName}
            value={values.name}
            error={fieldErrors.name}
            onChange={(value) => update("name", value)}
          />
          <TenderField
            id="customer-reference"
            label={copy.customerReference}
            value={values.customerReference}
            error={fieldErrors.customerReference}
            onChange={(value) => update("customerReference", value)}
          />
          <TenderField
            id="display-time-zone"
            label={copy.displayTimeZone}
            value={values.displayTimeZone}
            error={fieldErrors.displayTimeZone}
            onChange={(value) => update("displayTimeZone", value)}
            placeholder="Europe/Copenhagen"
          />
          <Field label={copy.currency} htmlFor="tender-currency">
            <select
              id="tender-currency"
              value={values.currency}
              aria-invalid={Boolean(fieldErrors.currency)}
              aria-describedby={
                fieldErrors.currency ? "tender-currency-error" : undefined
              }
              onChange={(event) => update("currency", event.target.value)}
            >
              <option value="">{copy.chooseCurrency}</option>
              {["DKK", "EUR", "SEK", "NOK", "GBP", "USD"].map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
            {fieldErrors.currency ? (
              <span className="field-error" id="tender-currency-error">
                {fieldErrors.currency}
              </span>
            ) : null}
          </Field>
          <Field
            label={`${copy.deadline} (${copy.optional})`}
            htmlFor="tender-deadline"
          >
            <input
              id="tender-deadline"
              type="datetime-local"
              value={dateInputOf(values.deadlineUtc)}
              onChange={(event) =>
                update("deadlineUtc", dateUtcOf(event.target.value))
              }
            />
          </Field>
        </div>
        <p className="inline-note">{copy.tenderUnassignedNotice}</p>
        <ActionBar>
          <button
            className="button button-primary"
            type="submit"
            disabled={saving}
          >
            {saving ? copy.savingTender : copy.saveTenderDraft}
          </button>
        </ActionBar>
      </form>
    </div>
  );
}

function TenderField({
  id,
  label,
  value,
  error,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <span className="field-error" id={errorId}>
          {error}
        </span>
      ) : null}
    </Field>
  );
}

function validate(values: TenderDraftValues, locale: Locale): FieldErrors {
  const required = locale === "da" ? "Udfyld feltet." : "Complete this field.";
  return {
    ...(values.name.trim() ? {} : { name: required }),
    ...(values.customerReference.trim() ? {} : { customerReference: required }),
    ...(values.displayTimeZone.trim() ? {} : { displayTimeZone: required }),
    ...(values.currency
      ? {}
      : {
          currency: locale === "da" ? "Vælg en valuta." : "Choose a currency.",
        }),
  };
}

function dateInputOf(value: string | null | undefined): string {
  return value ? value.slice(0, 16) : "";
}

function dateUtcOf(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

async function loadTender(
  id: string | undefined,
  setValues: (value: TenderDraftValues) => void,
  setEtag: (value: string) => void,
  setError: (value: string | undefined) => void,
  setLoading: (value: boolean) => void,
  loadError: string,
) {
  if (!id) return;
  setLoading(true);
  try {
    const result = await apiFetch<TenderRecord>(`/api/tenders/${id}`);
    setValues({
      name: result.tender.name,
      customerReference: result.tender.customerReference,
      displayTimeZone: result.tender.displayTimeZone,
      currency: result.tender.currency,
      deadlineUtc: result.tender.deadlineUtc,
    });
    setEtag(result.etag);
    setError(undefined);
  } catch {
    setError(loadError);
  } finally {
    setLoading(false);
  }
}
