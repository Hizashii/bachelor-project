import type { Tender } from "@freight-desk/shared";
import { useEffect, useState } from "react";
import { NavLink, useParams } from "react-router";
import { apiFetch } from "../../api/client";
import type { UserRole } from "../../auth/auth";
import {
  ActionBar,
  PageHeader,
  StatusBadge,
} from "../../components/OperationalUI";
import type { Locale } from "../../i18n";
import { getCopy } from "../../i18n";
import type { TenderRecord } from "./tenderTypes";

export function TenderOverview({
  locale,
  role,
}: {
  locale: Locale;
  role: UserRole;
}) {
  const copy = getCopy(locale);
  const { id } = useParams();
  const [record, setRecord] = useState<TenderRecord>();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    void apiFetch<TenderRecord>(`/api/tenders/${id}`)
      .then(setRecord)
      .catch(() => setError(true));
  }, [id]);

  if (error)
    return (
      <div className="screen">
        <div className="tender-message error" role="alert">
          {copy.tenderLoadError}
        </div>
        <NavLink className="button button-secondary" to="/tenders">
          {copy.backToTenders}
        </NavLink>
      </div>
    );
  if (!record)
    return <p className="screen tender-loading">{copy.tenderLoading}</p>;

  const tender = record.tender;
  return (
    <div className="screen tender-overview-screen">
      <PageHeader
        title={tender.name}
        description={tender.customerReference}
        action={
          role === "carrier" ? null : (
            <NavLink
              className="button button-primary"
              to={`/tenders/${tender.id}/edit`}
            >
              {copy.editTender}
            </NavLink>
          )
        }
      />
      <div className="tender-detail-header">
        <StatusBadge tone="warning">{statusLabel(tender, copy)}</StatusBadge>
        <span>{copy.tenderDraftNotice}</span>
      </div>
      <nav className="tender-tabs" aria-label={copy.tenderOverview}>
        <span className="tender-tab active">{copy.tenderOverview}</span>
      </nav>
      <section
        className="white-card tender-overview-card"
        aria-labelledby="tender-readiness-title"
      >
        <div className="tender-overview-heading">
          <div>
            <h2 id="tender-readiness-title">{copy.tenderReadiness}</h2>
            <p>{copy.tenderDraftNotice}</p>
          </div>
          <StatusBadge
            tone={
              readiness(tender, copy).every((item) => item.complete)
                ? "success"
                : "warning"
            }
          >
            {readiness(tender, copy).every((item) => item.complete)
              ? copy.ready
              : copy.incomplete}
          </StatusBadge>
        </div>
        <ul className="readiness-list">
          {readiness(tender, copy).map((item) => (
            <li
              className={
                item.complete ? "readiness-item complete" : "readiness-item"
              }
              key={item.label}
            >
              <span aria-hidden="true">{item.complete ? "+" : "-"}</span>
              <span>{item.label}</span>
              <strong>{item.complete ? copy.ready : copy.incomplete}</strong>
            </li>
          ))}
        </ul>
      </section>
      <section
        className="white-card tender-facts"
        aria-label={copy.tenderOverview}
      >
        <Fact label={copy.customerReference} value={tender.customerReference} />
        <Fact label={copy.displayTimeZone} value={tender.displayTimeZone} />
        <Fact label={copy.currency} value={tender.currency} />
        <Fact
          label={copy.deadline}
          value={
            tender.deadlineUtc
              ? new Date(tender.deadlineUtc).toLocaleString(
                  locale === "da" ? "da-DK" : "en-GB",
                  { timeZone: tender.displayTimeZone },
                )
              : "-"
          }
        />
      </section>
      <ActionBar>
        <NavLink className="button button-secondary" to="/tenders">
          {copy.backToTenders}
        </NavLink>
      </ActionBar>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function statusLabel(tender: Tender, copy: ReturnType<typeof getCopy>): string {
  return tender.status === "draft"
    ? copy.draft
    : tender.status === "open"
      ? copy.open
      : tender.status === "closed"
        ? copy.closed
        : tender.status === "awarded"
          ? copy.awarded
          : copy.archived;
}

function readiness(tender: Tender, labels: ReturnType<typeof getCopy>) {
  return [
    { label: labels.readinessName, complete: Boolean(tender.name) },
    {
      label: labels.readinessReference,
      complete: Boolean(tender.customerReference),
    },
    {
      label: labels.readinessTimeZone,
      complete: Boolean(tender.displayTimeZone),
    },
    { label: labels.readinessCurrency, complete: Boolean(tender.currency) },
    { label: labels.readinessDeadline, complete: tender.deadlineUtc !== null },
    {
      label: labels.readinessShipmentBasis,
      complete: tender.shipmentBasis !== null,
    },
    {
      label: labels.readinessTemplates,
      complete:
        tender.shipmentTemplate !== null && tender.carrierRateTemplate !== null,
    },
    { label: labels.readinessEvaluation, complete: tender.evaluation !== null },
    {
      label: labels.readinessCommercial,
      complete:
        tender.vatTreatment !== null &&
        tender.vatRateBasisPoints !== null &&
        tender.zonePolicy !== null,
    },
  ];
}
