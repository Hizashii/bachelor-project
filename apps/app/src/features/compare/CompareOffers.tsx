import { useState } from "react";
import type { CarrierOffer } from "../../data";
import { carrierOffers, formatDkk, shipment } from "../../data";
import type { Copy, Locale } from "../../i18n";
import { getCopy } from "../../i18n";

type CompareOffersProps = {
  locale: Locale;
};

export function CompareOffers({ locale }: CompareOffersProps) {
  const copy = getCopy(locale);
  const [selectedCarrier, setSelectedCarrier] = useState<string | null>(null);
  const [showProbability, setShowProbability] = useState(false);

  return (
    <div className="screen compare-screen">
      <section className="page-heading">
        <p className="eyebrow">{copy.compareEyebrow}</p>
        <h1>{copy.compareTitle}</h1>
        <p className="lede">{copy.compareSubtitle}</p>
      </section>
      <ShipmentSummary copy={copy} />
      <Recommendation
        copy={copy}
        onProbability={() => setShowProbability((value) => !value)}
      />
      {showProbability ? <ProbabilityNote locale={locale} /> : null}
      <OfferTable
        copy={copy}
        selectedCarrier={selectedCarrier}
        onSelect={setSelectedCarrier}
      />
      {selectedCarrier ? (
        <SelectionNotice copy={copy} carrier={selectedCarrier} />
      ) : null}
      <ComparisonNotes copy={copy} />
    </div>
  );
}

function ShipmentSummary({ copy }: { copy: Copy }) {
  return (
    <section className="shipment-summary" aria-label="Shipment details">
      <div>
        <span className="field-label">{copy.from}</span>
        <strong>{shipment.origin}</strong>
      </div>
      <span className="route-arrow" aria-hidden="true">
        →
      </span>
      <div>
        <span className="field-label">{copy.to}</span>
        <strong>{shipment.destination}</strong>
      </div>
      <div className="goods-detail">
        <span className="field-label">{copy.goods}</span>
        <strong>{shipment.goods}</strong>
      </div>
    </section>
  );
}

function Recommendation({
  copy,
  onProbability,
}: {
  copy: Copy;
  onProbability: () => void;
}) {
  return (
    <section className="recommendation-card">
      <div>
        <p className="eyebrow eyebrow-light">{copy.recommendation}</p>
        <h2>{copy.recommendedReason}</h2>
      </div>
      <button
        className="button button-outline-light"
        type="button"
        onClick={onProbability}
      >
        {copy.seeProbability}
      </button>
    </section>
  );
}

function ProbabilityNote({ locale }: { locale: Locale }) {
  const text =
    locale === "da"
      ? "Beregningen bygger på 148 sammenlignelige forsendelser fra de seneste 12 måneder."
      : "The estimate uses 148 comparable shipments from the last 12 months.";

  return (
    <div className="inline-note" role="status">
      <span className="note-mark">i</span>
      <span>{text}</span>
    </div>
  );
}

type OfferTableProps = {
  copy: Copy;
  selectedCarrier: string | null;
  onSelect: (carrier: string) => void;
};

function OfferTable({ copy, selectedCarrier, onSelect }: OfferTableProps) {
  return (
    <section className="offer-table-wrap" aria-label="Carrier offers">
      <div className="offer-table-header offer-row">
        <span>{copy.carrier}</span>
        <span>{copy.price}</span>
        <span>{copy.delivery}</span>
        <span>{copy.onTime}</span>
        <span>{copy.invoiceAccuracy}</span>
        <span className="sr-only">{copy.choose}</span>
      </div>
      {carrierOffers.map((offer) => (
        <OfferRow
          key={offer.name}
          copy={copy}
          offer={offer}
          isSelected={selectedCarrier === offer.name}
          onSelect={() => onSelect(offer.name)}
        />
      ))}
    </section>
  );
}

type OfferRowProps = {
  key?: string;
  copy: Copy;
  offer: CarrierOffer;
  isSelected: boolean;
  onSelect: () => void;
};

function OfferRow({ copy, offer, isSelected, onSelect }: OfferRowProps) {
  const cheapest =
    offer.price === Math.min(...carrierOffers.map((item) => item.price));
  const recommended = offer.name === carrierOffers[0].name;
  const days = offer.deliveryDays === 1 ? copy.day : copy.days;

  return (
    <div
      className={`offer-row ${recommended ? "recommended-row" : ""} ${isSelected ? "selected-row" : ""}`}
    >
      <div className="carrier-name">
        <strong>{offer.name}</strong>
        <span className="row-badges">
          {recommended ? (
            <span className="badge badge-gold">{copy.recommended}</span>
          ) : null}
          {cheapest ? (
            <span className="badge badge-teal">{copy.cheapest}</span>
          ) : null}
        </span>
      </div>
      <div className="price-cell">
        <strong>{formatDkk(offer.price)}</strong>
        <span className="price-meta">
          {cheapest
            ? copy.cheapest
            : `+${formatDkk(offer.price - 1940)} ${copy.priceDelta}`}
        </span>
        <span
          className="price-bar"
          style={{ width: `${(offer.price / 2350) * 100}%` }}
        />
      </div>
      <span>
        {offer.deliveryDays} {days}
      </span>
      <strong>{offer.onTimeRate} %</strong>
      <span>{offer.invoiceAccuracy} %</span>
      <button
        className={`button ${isSelected ? "button-selected" : "button-secondary"}`}
        type="button"
        onClick={onSelect}
      >
        {isSelected ? copy.selected : copy.choose}
      </button>
    </div>
  );
}

function SelectionNotice({ copy, carrier }: { copy: Copy; carrier: string }) {
  const title =
    carrier === "Transportør A"
      ? copy.selectionSaved
      : `${carrier} ${copy.selected.toLowerCase()}.`;

  return (
    <div className="selection-notice" role="status">
      <span className="check-mark" aria-hidden="true">
        ✓
      </span>
      <div>
        <strong>{title}</strong>
        <span>{copy.selectionSavedDetail}</span>
      </div>
    </div>
  );
}

function ComparisonNotes({ copy }: { copy: Copy }) {
  return (
    <div className="comparison-notes">
      <section className="white-card calculation-card">
        <h3>{copy.calculationTitle}</h3>
        <p>{copy.calculationText}</p>
        <button className="text-link" type="button">
          {copy.viewCalculation} →
        </button>
      </section>
      <section className="sample-card">
        <p className="eyebrow">{copy.sampleTitle}</p>
        <p>{copy.sampleText}</p>
      </section>
    </div>
  );
}
