import { useState } from "react";
import type { CarrierOffer } from "../../data";
import { carrierOffers, formatDkk, shipment } from "../../data";
import type { Copy, Locale } from "../../i18n";
import { getCopy } from "../../i18n";

export function CompareOffers({ locale }: { locale: Locale }) {
  const copy = getCopy(locale);
  const [selectedCarrier, setSelectedCarrier] = useState<string | null>(null);
  const [showProbability, setShowProbability] = useState(false);
  const [feedbackCarrier, setFeedbackCarrier] = useState<CarrierOffer | null>(
    null,
  );
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackSentCarrier, setFeedbackSentCarrier] =
    useState<CarrierOffer | null>(null);
  const [feedbackSendingCarrier, setFeedbackSendingCarrier] = useState<
    string | null
  >(null);
  const [feedbackError, setFeedbackError] = useState<
    "required" | "send" | null
  >(null);

  function openFeedback(carrier: CarrierOffer) {
    setFeedbackCarrier(carrier);
    setFeedbackMessage("");
    setFeedbackError(null);
  }

  function closeFeedback() {
    setFeedbackCarrier(null);
    setFeedbackMessage("");
    setFeedbackError(null);
  }

  async function sendFeedback() {
    if (!feedbackCarrier || !feedbackMessage.trim()) {
      setFeedbackError("required");
      return;
    }

    const carrier = feedbackCarrier;
    setFeedbackError(null);
    setFeedbackSendingCarrier(carrier.id);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carrierId: carrier.id,
          carrierName: carrier.name,
          message: feedbackMessage.trim(),
        }),
      });
      if (!response.ok) {
        throw new Error("Feedback was not sent.");
      }
      setFeedbackSentCarrier(carrier);
      closeFeedback();
    } catch {
      setFeedbackError("send");
    } finally {
      setFeedbackSendingCarrier(null);
    }
  }

  return (
    <div className="screen compare-screen">
      <section className="page-heading">
        <p className="eyebrow">{copy.compareEyebrow}</p>
        <h1>{copy.compareTitle}</h1>
        <p className="lede">{copy.compareSubtitle}</p>
      </section>
      <ShipmentSummary copy={copy} />
      <section className="recommendation-card">
        <div>
          <p className="eyebrow eyebrow-light">{copy.recommendation}</p>
          <h2>{copy.recommendedReason}</h2>
        </div>
        <button
          className="button button-outline-light"
          type="button"
          onClick={() => setShowProbability((value) => !value)}
        >
          {copy.seeProbability}
        </button>
      </section>
      {showProbability ? <ProbabilityNote locale={locale} /> : null}
      <OfferTable
        copy={copy}
        selectedCarrier={selectedCarrier}
        onSelect={setSelectedCarrier}
        onAnswer={openFeedback}
        feedbackSentCarrier={feedbackSentCarrier?.id ?? null}
        feedbackSendingCarrier={feedbackSendingCarrier}
      />
      {selectedCarrier ? (
        <SelectionNotice copy={copy} carrier={selectedCarrier} />
      ) : null}
      {feedbackSentCarrier ? (
        <FeedbackNotice copy={copy} carrier={feedbackSentCarrier.name} />
      ) : null}
      <ComparisonNotes copy={copy} />
      {feedbackCarrier ? (
        <FeedbackDialog
          copy={copy}
          carrierId={feedbackCarrier.id}
          carrier={feedbackCarrier.name}
          message={feedbackMessage}
          errorMessage={
            feedbackError === "required"
              ? copy.feedbackRequired
              : feedbackError === "send"
                ? copy.feedbackFailed
                : null
          }
          isSending={feedbackSendingCarrier === feedbackCarrier.id}
          onChange={setFeedbackMessage}
          onCancel={closeFeedback}
          onSubmit={sendFeedback}
        />
      ) : null}
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

function OfferTable({
  copy,
  selectedCarrier,
  onSelect,
  onAnswer,
  feedbackSentCarrier,
  feedbackSendingCarrier,
}: {
  copy: Copy;
  selectedCarrier: string | null;
  onSelect: (carrier: string) => void;
  onAnswer: (carrier: CarrierOffer) => void;
  feedbackSentCarrier: string | null;
  feedbackSendingCarrier: string | null;
}) {
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
          onAnswer={() => onAnswer(offer)}
          feedbackSent={feedbackSentCarrier === offer.id}
          feedbackSending={feedbackSendingCarrier === offer.id}
        />
      ))}
    </section>
  );
}

function OfferRow({
  copy,
  offer,
  isSelected,
  onSelect,
  onAnswer,
  feedbackSent,
  feedbackSending,
}: {
  key?: string;
  copy: Copy;
  offer: CarrierOffer;
  isSelected: boolean;
  onSelect: () => void;
  onAnswer: () => void;
  feedbackSent: boolean;
  feedbackSending: boolean;
}) {
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
      <fieldset className="offer-actions" aria-label={copy.offerActions}>
        <button
          className={`button ${isSelected ? "button-selected" : "button-secondary"}`}
          type="button"
          onClick={onSelect}
        >
          {isSelected ? copy.selected : copy.choose}
        </button>
        <button
          className="button button-feedback"
          type="button"
          onClick={onAnswer}
          disabled={feedbackSending}
        >
          {feedbackSending
            ? copy.feedbackSending
            : feedbackSent
              ? copy.feedbackSentButton
              : copy.answer}
        </button>
      </fieldset>
    </div>
  );
}

function FeedbackNotice({ copy, carrier }: { copy: Copy; carrier: string }) {
  return (
    <div className="feedback-notice" role="status">
      <span className="check-mark" aria-hidden="true">
        ✓
      </span>
      <div>
        <strong>{copy.feedbackSent}</strong>
        <span>
          {carrier} · {copy.feedbackSentDetail}
        </span>
      </div>
    </div>
  );
}

function FeedbackDialog({
  copy,
  carrierId,
  carrier,
  message,
  errorMessage,
  isSending,
  onChange,
  onCancel,
  onSubmit,
}: {
  copy: Copy;
  carrierId: string;
  carrier: string;
  message: string;
  errorMessage: string | null;
  isSending: boolean;
  onChange: (message: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="feedback-backdrop">
      <section
        className="feedback-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
      >
        <p className="eyebrow">{copy.answer}</p>
        <h2 id="feedback-title">{copy.feedbackTitle}</h2>
        <p>{carrier}</p>
        <label htmlFor={`carrier-feedback-${carrierId}`}>
          {copy.feedbackPrompt}
        </label>
        <textarea
          id={`carrier-feedback-${carrierId}`}
          value={message}
          placeholder={copy.feedbackPlaceholder}
          onChange={(event: { currentTarget: HTMLTextAreaElement }) =>
            onChange(event.currentTarget.value)
          }
        />
        {errorMessage ? (
          <p className="form-error" id="feedback-error">
            {errorMessage}
          </p>
        ) : null}
        <div className="feedback-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={onCancel}
            disabled={isSending}
          >
            {copy.feedbackCancel}
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={onSubmit}
            disabled={isSending}
            aria-describedby={errorMessage ? "feedback-error" : undefined}
          >
            {isSending ? copy.feedbackSending : copy.feedbackSend}
          </button>
        </div>
      </section>
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
