// This screen shows one tender to an invited carrier: deadline, instructions and own offer status.
import { type ReactElement, useCallback } from "react";
import { Link, useParams } from "react-router";
import type { Locale } from "../i18n";
import { fetchTender, useLoad } from "./api";
import "./carrier.css";
import { formatDeadline } from "./format";
import { offerSummary } from "./offerSummary";
import { carrierText } from "./text";

export function TenderDetail({ locale }: { locale: Locale }): ReactElement {
  const copy = carrierText[locale];
  const { tenderId = "" } = useParams();
  const load = useCallback(() => fetchTender(tenderId), [tenderId]);
  const { state, retry } = useLoad(load);
  const back = (
    <Link className="carrier-back" to="/carrier/tenders">
      {copy.back}
    </Link>
  );
  if (state.kind === "loading") return <p className="screen">{copy.loading}</p>;
  if (state.kind === "error") {
    return (
      <section className="screen carrier-screen">
        {back}
        <p role="alert">{state.notFound ? copy.notFound : copy.error}</p>
        {!state.notFound && (
          <button
            type="button"
            className="button button-secondary"
            onClick={retry}
          >
            {copy.retry}
          </button>
        )}
      </section>
    );
  }
  const tender = state.data;
  return (
    <section className="screen carrier-screen">
      {back}
      <h1>{tender.name}</h1>
      <dl className="carrier-facts">
        <dt>{copy.status}</dt>
        <dd>{copy.tenderStatus[tender.status]}</dd>
        <dt>{copy.deadline}</dt>
        <dd>
          {formatDeadline(tender.deadlineUtc, tender.customerTimeZone, locale)}
        </dd>
        <dt>{copy.reference}</dt>
        <dd>{tender.customerReference}</dd>
        <dt>{copy.currency}</dt>
        <dd>{tender.currency}</dd>
        <dt>{copy.vat}</dt>
        <dd>{copy.vatValues[tender.vatTreatment]}</dd>
      </dl>
      <h2>{copy.yourOffer}</h2>
      <p>{offerSummary(tender, locale)}</p>
      <h2>{copy.howTitle}</h2>
      <ol>
        {copy.how.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  );
}
