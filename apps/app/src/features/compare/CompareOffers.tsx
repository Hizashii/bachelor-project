import { formatMoney } from "@freight-desk/shared";
import { useState } from "react";
import { PageHeader } from "../../components/OperationalUI";
import type { Copy, Locale } from "../../i18n";
import { getCopy } from "../../i18n";
import { cheapestTotal, OfferTable } from "./OfferTable";
import { ShipmentForm } from "./ShipmentForm";
import { useComparison } from "./useComparison";
import "../operational.css";

type CompareOffersProps = { locale: Locale };

export function CompareOffers({ locale }: CompareOffersProps) {
  const copy = getCopy(locale);
  const comparison = useComparison();
  const [selected, setSelected] = useState<string | null>(null);
  const cheapest = cheapestTotal(comparison.lines);
  const selectedName = comparison.lines.find(
    (line) => line.carrier.organisationId === selected,
  )?.carrier.name;

  return (
    <div className="screen compare-screen">
      <PageHeader
        title={copy.compareTitle}
        description={copy.compareSubtitle}
      />
      <ShipmentForm
        copy={copy}
        busy={comparison.busy}
        onCompare={comparison.compare}
      />
      {comparison.error ? (
        <p className="upload-error" role="alert">
          {comparison.error}
        </p>
      ) : null}
      {comparison.lines.length > 0 ? (
        <>
          <Recommendation
            copy={copy}
            lines={comparison.lines}
            cheapest={cheapest}
          />
          <OfferTable
            copy={copy}
            lines={comparison.lines}
            selected={selected}
            onSelect={setSelected}
          />
          {selectedName ? (
            <div className="selection-notice" role="status">
              <strong>
                {copy.selectedNote.replace("{carrier}", selectedName)}
              </strong>
            </div>
          ) : null}
        </>
      ) : null}
      <ComparisonNotes copy={copy} />
    </div>
  );
}

function Recommendation({
  copy,
  lines,
  cheapest,
}: {
  copy: Copy;
  lines: ReturnType<typeof useComparison>["lines"];
  cheapest: number | null;
}) {
  const best = lines.find(
    (line) =>
      line.price.status === "priced" && line.price.totalMinor === cheapest,
  );
  if (best?.price.status !== "priced") {
    return (
      <section className="recommendation-card">
        <h2>{copy.noPricedOffers}</h2>
      </section>
    );
  }
  return (
    <section className="recommendation-card">
      <div>
        <h2>
          {copy.cheapestOffer
            .replace("{carrier}", best.carrier.name)
            .replace(
              "{price}",
              formatMoney(best.price.totalMinor, best.price.currency),
            )}
        </h2>
      </div>
    </section>
  );
}

function ComparisonNotes({ copy }: { copy: Copy }) {
  return (
    <div className="comparison-notes">
      <section className="white-card calculation-card">
        <h3>{copy.calculationTitle}</h3>
        <p>{copy.calculationText}</p>
      </section>
    </div>
  );
}
