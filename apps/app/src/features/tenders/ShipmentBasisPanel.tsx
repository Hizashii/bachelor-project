// Staff enter how many shipments go to each country and weight band, and the economy share.
// It mirrors columns E and J of the express workbook; the compare screen prices bids on it.

import { verifiedTemplateView } from "@freight-desk/shared";
import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "../../api/client";
import type { Locale } from "../../i18n";
import { getCopy } from "../../i18n";

const BASIS_POINTS_PER_PERCENT = 100;
const DEFAULT_PERCENT = "50";

const SHEETS = verifiedTemplateView("express-price").sheets.filter((sheet) =>
  sheet.name.startsWith("DK-"),
);
const COUNTRIES = SHEETS.map((sheet) => sheet.name.slice(3));
const LABELS = (SHEETS[0]?.sections[0]?.rows ?? [])
  .filter((row) => row.kind === "matrix")
  .map((row) => row.label);

type RowState = { shipments: string; percent: string };
type Grid = Record<string, Record<string, RowState>>;
type Country = {
  countryCode: string;
  rows: {
    label: string;
    numberOfShipments: number;
    economyShareBasisPoints: number;
  }[];
};
type Saved = { revision: number; countries: Country[] } | null;

function toGrid(countries: Country[]): Grid {
  const grid: Grid = {};
  for (const country of countries) {
    grid[country.countryCode] = {};
    for (const row of country.rows) {
      grid[country.countryCode][row.label] = {
        shipments: String(row.numberOfShipments),
        percent: String(row.economyShareBasisPoints / BASIS_POINTS_PER_PERCENT),
      };
    }
  }
  return grid;
}

function toCountries(grid: Grid): Country[] {
  return Object.entries(grid).map(([countryCode, rows]) => ({
    countryCode,
    rows: Object.entries(rows)
      .filter(([, row]) => Number(row.shipments) > 0)
      .map(([label, row]) => ({
        label,
        numberOfShipments: Number(row.shipments),
        economyShareBasisPoints: Math.round(
          Number(row.percent || DEFAULT_PERCENT) * BASIS_POINTS_PER_PERCENT,
        ),
      })),
  }));
}

export function ShipmentBasisPanel({
  locale,
  tenderId,
}: {
  locale: Locale;
  tenderId: string;
}) {
  const copy = getCopy(locale);
  const [grid, setGrid] = useState<Grid>({});
  const [revision, setRevision] = useState(0);
  const [country, setCountry] = useState(COUNTRIES[0] ?? "DE");
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void apiFetch<{ basis: Saved }>(`/api/tenders/${tenderId}/basis`)
      .then(({ basis }) => {
        setGrid(toGrid(basis?.countries ?? []));
        setRevision(basis?.revision ?? 0);
        setLoaded(true);
      })
      .catch(() => setMessage(copy.requestFailed));
  }, [tenderId, copy.requestFailed]);

  function edit(label: string, key: keyof RowState, value: string) {
    const rows = grid[country] ?? {};
    const current = rows[label] ?? { shipments: "", percent: DEFAULT_PERCENT };
    setGrid({
      ...grid,
      [country]: { ...rows, [label]: { ...current, [key]: value } },
    });
    setMessage("");
  }

  async function save() {
    try {
      const saved = await apiFetch<{ revision: number }>(
        `/api/tenders/${tenderId}/basis`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ countries: toCountries(grid), revision }),
        },
      );
      setRevision(saved.revision);
      setMessage(copy.basisSaved);
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : copy.requestFailed,
      );
    }
  }

  async function importFile(file: File) {
    try {
      const { countries } = await apiFetch<{ countries: Country[] }>(
        `/api/tenders/${tenderId}/basis/import`,
        {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body: file,
        },
      );
      setGrid(toGrid(countries));
      setMessage(copy.basisImported);
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : copy.requestFailed,
      );
    }
  }

  const filled = toCountries(grid).filter((item) => item.rows.length > 0);
  return (
    <section
      className="white-card tender-workflow-card"
      aria-labelledby="basis-title"
    >
      <h2 id="basis-title">{copy.basisTitle}</h2>
      <p>
        {filled.length} {copy.basisCountries}
      </p>
      <div className="comparison-actions">
        <label>
          {copy.country}
          <select
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          >
            {COUNTRIES.map((code) => (
              <option key={code}>{code}</option>
            ))}
          </select>
        </label>
        <label className="button button-secondary">
          {copy.importBasis}
          <input
            type="file"
            accept=".xlsx"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
            }}
          />
        </label>
      </div>
      <BasisTable
        disabled={!loaded}
        copy={copy}
        country={country}
        rows={grid[country] ?? {}}
        onEdit={edit}
      />
      <button
        className="button button-primary"
        type="button"
        disabled={!loaded}
        onClick={() => void save()}
      >
        {copy.saveBasis}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

function BasisTable({
  disabled,
  copy,
  country,
  rows,
  onEdit,
}: {
  disabled: boolean;
  copy: ReturnType<typeof getCopy>;
  country: string;
  rows: Record<string, RowState>;
  onEdit: (label: string, key: keyof RowState, value: string) => void;
}) {
  return (
    <table className="comparison-table">
      <thead>
        <tr>
          <th>{copy.weightBand}</th>
          <th>{copy.basisShipments}</th>
          <th>{copy.economyShare}</th>
        </tr>
      </thead>
      <tbody>
        {LABELS.map((label) => (
          <tr key={label}>
            <td>{label}</td>
            <td>
              <input
                aria-label={`${country} ${label} ${copy.basisShipments}`}
                disabled={disabled}
                inputMode="numeric"
                value={rows[label]?.shipments ?? ""}
                onChange={(event) =>
                  onEdit(label, "shipments", event.target.value)
                }
              />
            </td>
            <td>
              <input
                aria-label={`${country} ${label} ${copy.economyShare}`}
                disabled={disabled}
                inputMode="decimal"
                value={rows[label]?.percent ?? DEFAULT_PERCENT}
                onChange={(event) =>
                  onEdit(label, "percent", event.target.value)
                }
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
