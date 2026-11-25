// Side by side prices of every carrier for one country, including the pickup column.
// Pickup is shown for review only; the workbook's own total does not include it.

import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client";
import type { Locale } from "../../i18n";
import { getCopy } from "../../i18n";

type Band = {
  label: string;
  economyMinor: number;
  expressMinor: number;
  pickupMinor?: number | null;
};

type Bid = {
  id: string;
  carrierCompanyId: string;
  priceTemplate: {
    vendorName: string;
    countries: { countryCode: string; bands: Band[] }[];
  } | null;
};

const money = (minor: number | null | undefined) =>
  minor === null || minor === undefined ? "–" : (minor / 100).toFixed(2);

export function BidPricesPanel({
  locale,
  tenderId,
}: {
  locale: Locale;
  tenderId: string;
}) {
  const copy = getCopy(locale);
  const [bids, setBids] = useState<Bid[]>([]);
  const [country, setCountry] = useState("");

  useEffect(() => {
    void apiFetch<Bid[]>(`/api/tenders/${tenderId}/bids`)
      .then((loaded) => {
        setBids(loaded);
        const first = loaded[0]?.priceTemplate?.countries[0]?.countryCode;
        setCountry((current) => current || first || "");
      })
      .catch(() => undefined);
  }, [tenderId]);

  const codes = [
    ...new Set(
      bids.flatMap((bid) =>
        (bid.priceTemplate?.countries ?? []).map((item) => item.countryCode),
      ),
    ),
  ].sort();
  const labels = bids[0]?.priceTemplate?.countries
    .find((item) => item.countryCode === country)
    ?.bands.map((band) => band.label);

  return (
    <section aria-labelledby="bid-prices-title" className="comparison-panel">
      <h3 id="bid-prices-title">{copy.priceOverview}</h3>
      <label>
        {copy.country}
        <select
          value={country}
          onChange={(event) => setCountry(event.target.value)}
        >
          {codes.map((code) => (
            <option key={code}>{code}</option>
          ))}
        </select>
      </label>
      <table className="comparison-table">
        <thead>
          <tr>
            <th>{copy.weightBand}</th>
            {bids.map((bid) => (
              <th key={bid.id} colSpan={3}>
                {bid.priceTemplate?.vendorName ?? bid.carrierCompanyId}
              </th>
            ))}
          </tr>
          <tr>
            <th />
            {bids.flatMap((bid) =>
              ["Economy", "Express", "Pickup"].map((name) => (
                <th key={`${bid.id}-${name}`}>{name}</th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {(labels ?? []).map((label) => (
            <tr key={label}>
              <td>{label}</td>
              {bids.flatMap((bid) => {
                const band = bid.priceTemplate?.countries
                  .find((item) => item.countryCode === country)
                  ?.bands.find((item) => item.label === label);
                return [
                  <td key={`${bid.id}-e`}>{money(band?.economyMinor)}</td>,
                  <td key={`${bid.id}-x`}>{money(band?.expressMinor)}</td>,
                  <td key={`${bid.id}-p`}>{money(band?.pickupMinor)}</td>,
                ];
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <small>{copy.pickupNote}</small>
    </section>
  );
}
