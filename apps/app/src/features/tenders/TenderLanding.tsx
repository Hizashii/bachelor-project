import type { TenderStatus } from "@freight-desk/shared";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router";
import { apiFetch } from "../../api/client";
import type { UserRole } from "../../auth/auth";
import {
  EmptyState,
  PageHeader,
  StatusBadge,
  TableFrame,
} from "../../components/OperationalUI";
import type { Locale } from "../../i18n";
import { getCopy } from "../../i18n";
import type { TenderRecord } from "./tenderTypes";
import "../operational.css";

type TenderLandingProps = { locale: Locale; role: UserRole };
const PAGE_SIZE = 20;
type TenderListResponse = {
  items: TenderRecord[];
  total: number;
  nextCursor: number | null;
};

export function TenderLanding({ locale, role }: TenderLandingProps) {
  const copy = getCopy(locale);
  const carrier = role === "carrier";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<TenderStatus | "">("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [submittedStatus, setSubmittedStatus] = useState<TenderStatus | "">("");
  const [cursor, setCursor] = useState<number>();
  const [page, setPage] = useState<TenderListResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (submittedQuery) params.set("q", submittedQuery);
    if (submittedStatus) params.set("status", submittedStatus);
    if (cursor !== undefined) params.set("cursor", String(cursor));
    try {
      setPage(await apiFetch<TenderListResponse>(`/api/tenders?${params}`));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [cursor, submittedQuery, submittedStatus]);

  useEffect(() => void load(), [load]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedQuery(query.trim());
    setSubmittedStatus(status);
    setCursor(undefined);
  }

  const action = carrier ? null : (
    <NavLink className="button button-primary" to="/tenders/new">
      {copy.newTender}
    </NavLink>
  );
  return (
    <div className="screen tenders-screen">
      <PageHeader
        title={carrier ? copy.invitedTendersTitle : copy.tendersTitle}
        description={
          carrier ? copy.invitedTendersSubtitle : copy.tendersSubtitle
        }
        action={action}
      />
      {!carrier || page?.total ? (
        <SearchBar
          copy={copy}
          query={query}
          status={status}
          setQuery={setQuery}
          setStatus={setStatus}
          onSubmit={search}
        />
      ) : null}
      {loading ? (
        <p className="tender-loading" aria-live="polite">
          {copy.tenderLoading}
        </p>
      ) : null}
      {error ? (
        <div className="tender-message error" role="alert">
          <span>{copy.tenderLoadError}</span>
          <button
            className="text-link"
            type="button"
            onClick={() => void load()}
          >
            {copy.refresh}
          </button>
        </div>
      ) : null}
      {!loading && !error && page?.items.length === 0 ? (
        <EmptyTender
          copy={copy}
          carrier={carrier}
          filtered={Boolean(submittedQuery || submittedStatus)}
        />
      ) : null}
      {!loading && !error && page?.items.length ? (
        <TenderTable
          copy={copy}
          page={page}
          locale={locale}
          cursor={cursor}
          setCursor={setCursor}
        />
      ) : null}
      {!carrier ? <SupportingTools copy={copy} /> : null}
    </div>
  );
}

function SearchBar({
  copy,
  query,
  status,
  setQuery,
  setStatus,
  onSubmit,
}: {
  copy: ReturnType<typeof getCopy>;
  query: string;
  status: TenderStatus | "";
  setQuery: (value: string) => void;
  setStatus: (value: TenderStatus | "") => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="tender-list-toolbar" onSubmit={onSubmit}>
      <label htmlFor="tender-search">{copy.tenderSearch}</label>
      <input
        id="tender-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <label htmlFor="tender-status">{copy.tenderStatusFilter}</label>
      <select
        id="tender-status"
        value={status}
        onChange={(event) => setStatus(event.target.value as TenderStatus | "")}
      >
        <option value="">{copy.allTenderStatuses}</option>
        <option value="draft">{copy.draft}</option>
        <option value="open">{copy.open}</option>
        <option value="closed">{copy.closed}</option>
        <option value="awarded">{copy.awarded}</option>
        <option value="archived">{copy.archived}</option>
      </select>
      <button className="button button-secondary" type="submit">
        {copy.tenderSearch}
      </button>
    </form>
  );
}

function EmptyTender({
  copy,
  carrier,
  filtered,
}: {
  copy: ReturnType<typeof getCopy>;
  carrier: boolean;
  filtered: boolean;
}) {
  return (
    <EmptyState
      title={
        filtered
          ? copy.noTendersFound
          : carrier
            ? copy.invitedTendersEmptyTitle
            : copy.tendersEmptyTitle
      }
      description={
        filtered
          ? copy.noTendersFound
          : carrier
            ? copy.invitedTendersEmptyText
            : copy.tendersEmptyText
      }
      labelledBy="tenders-empty-title"
    />
  );
}

function TenderTable({
  copy,
  page,
  locale,
  cursor,
  setCursor,
}: {
  copy: ReturnType<typeof getCopy>;
  page: TenderListResponse;
  locale: Locale;
  cursor: number | undefined;
  setCursor: (value: number | undefined) => void;
}) {
  return (
    <div className="tender-list">
      <TableFrame ariaLabel={copy.tenders}>
        <table className="tender-table">
          <thead>
            <tr>
              <th>{copy.tenderName}</th>
              <th>{copy.customerReference}</th>
              <th>{copy.status}</th>
              <th>{copy.deadline}</th>
              <th>{copy.currency}</th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((record) => (
              <tr key={record.tender.id}>
                <td>
                  <NavLink
                    className="tender-table-link"
                    to={`/tenders/${record.tender.id}`}
                  >
                    {record.tender.name}
                  </NavLink>
                </td>
                <td>{record.tender.customerReference}</td>
                <td>
                  <StatusBadge
                    tone={
                      record.tender.status === "draft" ? "warning" : "neutral"
                    }
                  >
                    {statusLabel(record.tender.status, copy)}
                  </StatusBadge>
                </td>
                <td>
                  {formatDeadline(
                    record.tender.deadlineUtc,
                    record.tender.displayTimeZone,
                    locale,
                  )}
                </td>
                <td className="numeric-cell">{record.tender.currency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableFrame>
      <div className="tender-pagination">
        <span>
          {page.total} {copy.tenderResults}
        </span>
        <div>
          <button
            className="button button-secondary"
            type="button"
            disabled={cursor === undefined}
            onClick={() =>
              setCursor(
                cursor === undefined
                  ? undefined
                  : Math.max(0, cursor - PAGE_SIZE),
              )
            }
          >
            {copy.previousPage}
          </button>
          <button
            className="button button-secondary"
            type="button"
            disabled={page.nextCursor === null}
            onClick={() => setCursor(page.nextCursor ?? undefined)}
          >
            {copy.nextPage}
          </button>
        </div>
      </div>
    </div>
  );
}

function statusLabel(status: TenderStatus, copy: ReturnType<typeof getCopy>) {
  return status === "draft"
    ? copy.draft
    : status === "open"
      ? copy.open
      : status === "closed"
        ? copy.closed
        : status === "awarded"
          ? copy.awarded
          : copy.archived;
}

function formatDeadline(
  value: string | null,
  timeZone: string,
  locale: Locale,
) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(locale === "da" ? "da-DK" : "en-GB", {
    dateStyle: "medium",
    timeZone,
  }).format(new Date(value));
}

function SupportingTools({ copy }: { copy: ReturnType<typeof getCopy> }) {
  return (
    <section className="tender-support" aria-labelledby="tender-support-title">
      <div>
        <h2 id="tender-support-title">{copy.tenderSupportTitle}</h2>
        <p>{copy.tenderSupportText}</p>
      </div>
      <nav
        className="tender-support-links"
        aria-label={copy.tenderSupportTitle}
      >
        <NavLink className="button button-secondary" to="/upload">
          {copy.upload}
        </NavLink>
        <NavLink className="button button-secondary" to="/compare">
          {copy.compare}
        </NavLink>
        <NavLink className="button button-secondary" to="/files">
          {copy.files}
        </NavLink>
      </nav>
    </section>
  );
}
