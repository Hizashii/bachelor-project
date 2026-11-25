// Compares the submitted carrier bids for a closed tender and exports the result.
// The API does the pricing; this screen collects the shipment lines and shows the totals.

import { verifiedTemplateView } from "@freight-desk/shared";
import { useState } from "react";
import { downloadFile, postJson, saveBlob } from "../../api/client";
import type { Locale } from "../../i18n";
import { getCopy } from "../../i18n";

const BASIS_POINTS_PER_PERCENT = 100;
const COUNTRY_CODES = verifiedTemplateView("express-price")
  .sheets.map((sheet) => sheet.name)
  .filter((name) => name.startsWith("DK-"))
  .map((name) => name.slice(3));

type Copy = ReturnType<typeof getCopy>;

type Line = {
  id: string;
  countryCode: string;
  weightKg: string;
  count: string;
  economyPercent: string;
};

type Comparison = {
  currency: string;
  candidates: {
    bidVersionId: string;
    carrierCompanyId: string;
    vendorName: string | null;
    result: { totalMinor: number } | null;
    error: string | null;
  }[];
};

const newLine = (): Line => ({
  id: crypto.randomUUID(),
  countryCode: COUNTRY_CODES[0] ?? "DE",
  weightKg: "1",
  count: "100",
  economyPercent: "50",
});

function toShipments(lines: Line[]) {
  return lines.map((line) => ({
    countryCode: line.countryCode,
    weightKg: Number(line.weightKg),
    numberOfShipments: Number(line.count),
    economyShareBasisPoints:
      Number(line.economyPercent) * BASIS_POINTS_PER_PERCENT,
  }));
}

export function TenderComparison({
  locale,
  tenderId,
}: {
  locale: Locale;
  tenderId: string;
}) {
  const copy = getCopy(locale);
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [result, setResult] = useState<Comparison>();
  const [message, setMessage] = useState("");

  async function compare() {
    try {
      const shipments = toShipments(lines);
      setResult(
        await postJson<Comparison>(`/api/tenders/${tenderId}/compare`, {
          shipments,
        }),
      );
      setMessage("");
    } catch {
      setMessage(copy.requestFailed);
    }
  }

  async function exportResult(format: "xlsx" | "pdf") {
    try {
      await download(format);
    } catch {
      setMessage(copy.requestFailed);
    }
  }

  async function download(format: "xlsx" | "pdf") {
    const blob = await downloadFile(
      `/api/tenders/${tenderId}/export.${format}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shipments: toShipments(lines) }),
      },
    );
    saveBlob(blob, `tender-${tenderId}-comparison.${format}`);
  }

  return (
    <section
      aria-labelledby="tender-comparison-title"
      className="comparison-panel"
    >
      <h3 id="tender-comparison-title">{copy.compare}</h3>
      <Lines copy={copy} lines={lines} onChange={setLines} />
      <div className="comparison-actions">
        <button
          className="button button-secondary"
          type="button"
          onClick={() => setLines([...lines, newLine()])}
        >
          {copy.addLine}
        </button>
        <button
          className="button button-primary"
          type="button"
          onClick={() => void compare()}
        >
          {copy.compare}
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void exportResult("xlsx")}
        >
          {copy.downloadResult} Excel
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void exportResult("pdf")}
        >
          {copy.downloadResult} PDF
        </button>
      </div>
      {message ? <p role="alert">{message}</p> : null}
      {result ? <ResultTable copy={copy} result={result} /> : null}
    </section>
  );
}

function Lines({
  copy,
  lines,
  onChange,
}: {
  copy: Copy;
  lines: Line[];
  onChange: (lines: Line[]) => void;
}) {
  return lines.map((line, index) => (
    <LineRow
      copy={copy}
      key={line.id}
      line={line}
      onChange={(next) =>
        onChange(lines.map((l, i) => (i === index ? next : l)))
      }
      onRemove={
        lines.length > 1
          ? () => onChange(lines.filter((_, i) => i !== index))
          : undefined
      }
    />
  ));
}

function LineRow({
  copy,
  line,
  onChange,
  onRemove,
}: {
  copy: Copy;
  line: Line;
  onChange: (line: Line) => void;
  onRemove?: () => void;
}) {
  const field = (key: keyof Line) => ({
    value: line[key],
    onChange: (event: { target: { value: string } }) =>
      onChange({ ...line, [key]: event.target.value }),
  });
  return (
    <div className="comparison-line">
      <label>
        {copy.country}
        <select {...field("countryCode")}>
          {COUNTRY_CODES.map((code) => (
            <option key={code}>{code}</option>
          ))}
        </select>
      </label>
      <label>
        {copy.calcWeight}
        <input type="number" min="0.01" step="any" {...field("weightKg")} />
      </label>
      <label>
        {copy.shipmentTitle}
        <input type="number" min="1" {...field("count")} />
      </label>
      <label>
        {copy.economyShare}
        <input type="number" min="0" max="100" {...field("economyPercent")} />
      </label>
      {onRemove ? (
        <button
          className="button button-secondary"
          type="button"
          onClick={onRemove}
        >
          {copy.removeRow}
        </button>
      ) : null}
    </div>
  );
}

function ResultTable({ copy, result }: { copy: Copy; result: Comparison }) {
  if (result.candidates.length === 0) return <p>{copy.noBids}</p>;
  const lowest = result.candidates.find((item) => item.result)?.bidVersionId;
  return (
    <table className="comparison-table">
      <thead>
        <tr>
          <th>{copy.carrier}</th>
          <th>{copy.total}</th>
        </tr>
      </thead>
      <tbody>
        {result.candidates.map((item) => (
          <tr
            key={item.bidVersionId}
            className={item.bidVersionId === lowest ? "comparison-best" : ""}
          >
            <td>
              {item.vendorName ?? item.carrierCompanyId}
              {item.bidVersionId === lowest ? ` · ${copy.cheapest}` : ""}
            </td>
            <td>
              {item.result
                ? `${(item.result.totalMinor / 100).toFixed(2)} ${result.currency}`
                : item.error}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
