import { formatMoney, type PriceFailure } from "@freight-desk/shared";
import type { Copy } from "../../i18n";
import type { CarrierPrice, ComparableCarrier } from "./compareApi";
import type { DeliveryReliability } from "./reliability";

export type OfferLine = {
  carrier: ComparableCarrier;
  price: CarrierPrice["result"];
  reliability: DeliveryReliability | null;
};

const failureText: Record<PriceFailure, keyof Copy> = {
  outside_dates: "calcOutside_dates",
  missing_postcode: "calcMissing_postcode",
  origin_not_covered: "calcOrigin_not_covered",
  no_zone: "calcNo_zone",
  missing_quantity: "calcMissing_quantity",
  restriction_exceeded: "calcRestriction_exceeded",
  no_bracket: "calcNo_bracket",
  missing_rate: "calcMissing_rate",
};

export function cheapestTotal(lines: readonly OfferLine[]): number | null {
  const totals = lines.flatMap((line) =>
    line.price.status === "priced" ? [line.price.totalMinor] : [],
  );
  return totals.length > 0 ? Math.min(...totals) : null;
}

function priceText(copy: Copy, price: OfferLine["price"]): string {
  if (price.status === "priced")
    return formatMoney(price.totalMinor, price.currency);
  if (price.status === "unpriced")
    return copy[failureText[price.reason]] as string;
  return price.status === "no_tariff" ? copy.noActiveTariff : copy.noAccess;
}

type OfferTableProps = {
  copy: Copy;
  lines: OfferLine[];
  selected: string | null;
  onSelect: (organisationId: string) => void;
};

export function OfferTable({
  copy,
  lines,
  selected,
  onSelect,
}: OfferTableProps) {
  const cheapest = cheapestTotal(lines);
  return (
    <section className="offer-table-wrap" aria-label="Carrier offers">
      <div className="offer-table-header offer-row">
        <span>{copy.carrier}</span>
        <span>{copy.price}</span>
        <span>{copy.delivery}</span>
        <span>{copy.onTime}</span>
        <span className="sr-only">{copy.choose}</span>
      </div>
      {lines.map((line) => {
        const priced = line.price.status === "priced";
        const isCheapest =
          line.price.status === "priced" && line.price.totalMinor === cheapest;
        const isSelected = selected === line.carrier.organisationId;
        return (
          <div
            className={`offer-row ${isSelected ? "selected-row" : ""}`}
            key={line.carrier.organisationId}
          >
            <div className="carrier-name">
              <strong>{line.carrier.name}</strong>
              {isCheapest ? (
                <span className="badge badge-teal">{copy.cheapest}</span>
              ) : null}
            </div>
            <div className="price-cell">
              <strong>{priceText(copy, line.price)}</strong>
            </div>
            <span>{copy.notAvailable}</span>
            <span>
              {line.reliability
                ? `${line.reliability.onTimePercent} % (${line.reliability.sampleSize})`
                : copy.notAvailable}
            </span>
            <button
              className={`button ${isSelected ? "button-selected" : "button-secondary"}`}
              type="button"
              disabled={!priced}
              onClick={() => onSelect(line.carrier.organisationId)}
            >
              {isSelected ? copy.selected : copy.choose}
            </button>
          </div>
        );
      })}
    </section>
  );
}
