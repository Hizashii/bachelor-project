// Compares the submitted carrier bids on the saved shipment basis, shows the totals per
// country, lets staff award the winner, and exports the result. The API does the pricing.

import { useState } from "react";
import {
  ApiError,
  apiFetch,
  downloadFile,
  postJson,
  saveBlob,
} from "../../api/client";
import type { Locale } from "../../i18n";
import { getCopy } from "../../i18n";
import { BidPricesPanel } from "./BidPricesPanel";
import type { TenderRecord } from "./tenderTypes";

type Copy = ReturnType<typeof getCopy>;

type Candidate = {
  bidVersionId: string;
  carrierCompanyId: string;
  vendorName: string | null;
  result: {
    totalMinor: number;
    lines: { countryCode: string; totalMinor: number }[];
  } | null;
  error: string | null;
};

type Comparison = { currency: string; candidates: Candidate[] };

type Props = {
  locale: Locale;
  record: TenderRecord;
  onChanged: (record: TenderRecord) => void;
};

const money = (minor: number) => (minor / 100).toFixed(2);

export function TenderComparison({ locale, record, onChanged }: Props) {
  const copy = getCopy(locale);
  const tenderId = record.tender.id;
  const [result, setResult] = useState<Comparison>();
  const [message, setMessage] = useState("");
  const fail = (error: unknown) =>
    setMessage(error instanceof ApiError ? error.message : copy.requestFailed);

  async function compare() {
    try {
      setResult(
        await apiFetch<Comparison>(`/api/tenders/${tenderId}/compare-basis`),
      );
      setMessage("");
    } catch (error) {
      fail(error);
    }
  }

  async function exportResult(format: "xlsx" | "pdf") {
    try {
      const blob = await downloadFile(
        `/api/tenders/${tenderId}/export.${format}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      saveBlob(blob, `tender-${tenderId}-comparison.${format}`);
    } catch (error) {
      fail(error);
    }
  }

  async function award(carrierCompanyId: string, reason: string) {
    try {
      onChanged(
        await postJson<TenderRecord>(`/api/tenders/${tenderId}/award`, {
          carrierCompanyId,
          reason,
          ifMatch: record.etag,
        }),
      );
      setMessage(copy.awardDone);
    } catch (error) {
      fail(error);
    }
  }

  return (
    <section
      aria-labelledby="tender-comparison-title"
      className="comparison-panel"
    >
      <h3 id="tender-comparison-title">{copy.compare}</h3>
      <div className="comparison-actions">
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
      {result ? (
        <ResultTable
          copy={copy}
          result={result}
          record={record}
          onAward={award}
        />
      ) : null}
      {result ? <BidPricesPanel locale={locale} tenderId={tenderId} /> : null}
    </section>
  );
}

function ResultTable({
  copy,
  result,
  record,
  onAward,
}: {
  copy: Copy;
  result: Comparison;
  record: TenderRecord;
  onAward: (carrierCompanyId: string, reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  if (result.candidates.length === 0) return <p>{copy.noBids}</p>;
  const lowest = result.candidates.find((item) => item.result)?.bidVersionId;
  const countries = [
    ...new Set(
      result.candidates.flatMap((item) =>
        (item.result?.lines ?? []).map((line) => line.countryCode),
      ),
    ),
  ].sort();
  const { status, awardedCarrierCompanyId } = record.tender;
  return (
    <>
      <table className="comparison-table">
        <thead>
          <tr>
            <th>{copy.carrier}</th>
            {countries.map((code) => (
              <th key={code}>{code}</th>
            ))}
            <th>{copy.total}</th>
            <th />
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
                {item.carrierCompanyId === awardedCarrierCompanyId
                  ? ` · ${copy.awardedTo}`
                  : ""}
              </td>
              {countries.map((code) => (
                <td key={code}>{countryTotal(item, code)}</td>
              ))}
              <td>
                {item.result
                  ? `${money(item.result.totalMinor)} ${result.currency}`
                  : item.error}
              </td>
              <td>
                {status === "closed" && item.result ? (
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => onAward(item.carrierCompanyId, reason)}
                  >
                    {copy.award}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {status === "closed" ? (
        <label>
          {copy.awardReason}
          <input
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      ) : null}
    </>
  );
}

function countryTotal(item: Candidate, code: string): string {
  const lines = (item.result?.lines ?? []).filter(
    (line) => line.countryCode === code,
  );
  return lines.length === 0
    ? "–"
    : money(lines.reduce((total, line) => total + line.totalMinor, 0));
}
