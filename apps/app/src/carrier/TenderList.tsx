// This screen lists the tenders the carrier is invited to, with an Active / Closed filter.
import type { CarrierTender } from "@freight-desk/shared";
import { type ReactElement, useCallback, useState } from "react";
import { Link } from "react-router";
import type { Locale } from "../i18n";
import { fetchTenders, useLoad } from "./api";
import "./carrier.css";
import { formatDeadline } from "./format";
import { offerSummary } from "./offerSummary";
import { carrierText } from "./text";

type Filter = "active" | "closed";
const FILTERS: Filter[] = ["active", "closed"];

function Row(props: { tender: CarrierTender; locale: Locale }): ReactElement {
  const { tender, locale } = props;
  const copy = carrierText[locale];
  return (
    <li className="carrier-card">
      <div>
        <h2 className="carrier-card-title">{tender.name}</h2>
        <p className="carrier-muted">
          {copy.deadline}:{" "}
          {formatDeadline(tender.deadlineUtc, tender.customerTimeZone, locale)}
        </p>
        <p className="carrier-muted">{offerSummary(tender, locale)}</p>
      </div>
      <Link
        className="button button-secondary"
        to={`/carrier/tenders/${tender.id}`}
      >
        {copy.open}
      </Link>
    </li>
  );
}

export function TenderList({ locale }: { locale: Locale }): ReactElement {
  const copy = carrierText[locale];
  const [filter, setFilter] = useState<Filter>("active");
  const load = useCallback(() => fetchTenders(filter), [filter]);
  const { state, retry } = useLoad(load);
  return (
    <section className="screen carrier-screen">
      <h1>{copy.title}</h1>
      <p>{copy.intro}</p>
      <fieldset className="carrier-filter">
        <legend className="sr-only">{copy.filterLabel}</legend>
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            className={
              filter === value
                ? "button button-selected"
                : "button button-secondary"
            }
            onClick={() => setFilter(value)}
          >
            {copy[value]}
          </button>
        ))}
      </fieldset>
      <div aria-live="polite">
        {state.kind === "loading" && <p>{copy.loading}</p>}
        {state.kind === "error" && (
          <p role="alert">
            {copy.error}{" "}
            <button
              type="button"
              className="button button-secondary"
              onClick={retry}
            >
              {copy.retry}
            </button>
          </p>
        )}
        {state.kind === "ready" && state.data.length === 0 && (
          <p>{filter === "active" ? copy.emptyActive : copy.emptyClosed}</p>
        )}
        {state.kind === "ready" && (
          <ul className="carrier-list">
            {state.data.map((tender) => (
              <Row key={tender.id} tender={tender} locale={locale} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
