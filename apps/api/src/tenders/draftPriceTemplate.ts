// Turns a carrier's saved workspace draft into the same price model an uploaded workbook gives.
// A country the carrier left completely empty is not priced; a half-filled country is an error.

import {
  type PriceTemplate,
  parseDecimalInput,
  parseMinorUnits,
  verifiedTemplateView,
  type WorkbookSection,
  type WorkbookSheet,
} from "@freight-desk/shared";
import {
  PriceTemplateWorkbookError,
  parseBandBounds,
} from "./priceTemplateExcel.ts";

type Values = Record<string, string | null>;
type Country = PriceTemplate["countries"][number];

const TEMPLATE = "express-price";
const MAX_REPORTED_PROBLEMS = 5;

export function draftToPriceTemplate(
  values: Values,
  fallbackVendorName: string,
): PriceTemplate {
  const problems: string[] = [];
  const countries: Country[] = [];
  for (const sheet of countrySheets()) {
    const country = readCountry(sheet, values, problems);
    if (country) countries.push(country);
  }
  if (problems.length > 0) {
    throw new PriceTemplateWorkbookError(
      problems.slice(0, MAX_REPORTED_PROBLEMS).join(" "),
    );
  }
  if (countries.length === 0) {
    throw new PriceTemplateWorkbookError(
      "Fill in prices for at least one country.",
    );
  }
  return {
    vendorName: vendorName(values) ?? fallbackVendorName,
    currency: "DKK",
    countries,
  };
}

function countrySheets(): WorkbookSheet[] {
  return verifiedTemplateView(TEMPLATE).sheets.filter((sheet) =>
    sheet.name.startsWith("DK-"),
  );
}

function cell(sheet: WorkbookSheet, address: string): string {
  return `${TEMPLATE}|${sheet.name}|${address}`;
}

type Amount =
  | { kind: "empty" }
  | { kind: "ok"; minor: number }
  | { kind: "bad"; reason: string };

// "1,500" is 1.5 in Danish and 1500 in English, so a price that reads two ways is refused.
function amount(raw: string | null | undefined): Amount {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return { kind: "empty" };
  }
  const [da, en] = [parseDecimalInput(raw, "da"), parseDecimalInput(raw, "en")];
  if (!da.ok && !en.ok) return { kind: "bad", reason: "is not a number" };
  if (da.ok && en.ok && da.value !== en.value) {
    return {
      kind: "bad",
      reason: "can be read two ways; write it like 1500.00",
    };
  }
  const parsed = da.ok ? da : en;
  const minor = parsed.ok ? parseMinorUnits(parsed.normalized) : null;
  return minor === null
    ? { kind: "bad", reason: "is not a valid price" }
    : { kind: "ok", minor };
}

function price(
  sheet: WorkbookSheet,
  values: Values,
  address: string,
  where: string,
  problems: string[],
): number | null {
  const raw = values[cell(sheet, address)];
  const result = amount(raw);
  if (result.kind === "ok") return result.minor;
  if (result.kind === "bad") {
    problems.push(`${sheet.name}: "${raw}" for ${where} ${result.reason}.`);
  } else {
    problems.push(`${sheet.name}: price missing for ${where}.`);
  }
  return null;
}

function vendorName(values: Values): string | null {
  for (const sheet of countrySheets()) {
    const name = values[cell(sheet, "C7")]?.trim();
    if (name) return name;
  }
  return null;
}

function readCountry(
  sheet: WorkbookSheet,
  values: Values,
  problems: string[],
): Country | null {
  const bandSection = sheet.sections.find(
    (section) => section.key === "parcel-cost",
  );
  if (!bandSection) return null;
  const rows = bandSection.rows.filter((row) => row.kind === "matrix");
  const entered = rows.some((row) =>
    ["C", "D"].some(
      (column) =>
        amount(values[cell(sheet, `${column}${row.sourceRow}`)]).kind !==
        "empty",
    ),
  );
  if (!entered) return null;
  const bands = rows.map((row) => ({
    label: row.label,
    ...parseBandBounds(row.label),
    economyMinor:
      price(sheet, values, `C${row.sourceRow}`, row.label, problems) ?? 0,
    expressMinor:
      price(sheet, values, `D${row.sourceRow}`, row.label, problems) ?? 0,
  }));
  return {
    countryCode: sheet.name.slice(3),
    bands,
    additionalFees: readFees(sheet, values, problems),
  };
}

function readFees(
  sheet: WorkbookSheet,
  values: Values,
  problems: string[],
): Country["additionalFees"] {
  const section: WorkbookSection | undefined = sheet.sections.find(
    (item) => item.key === "additional-fees",
  );
  const fees: Country["additionalFees"] = [];
  for (const row of section?.rows ?? []) {
    const raw = values[cell(sheet, `E${row.sourceRow}`)];
    const result = amount(raw);
    if (result.kind === "ok")
      fees.push({ name: row.label, amountMinor: result.minor });
    if (result.kind === "bad") {
      problems.push(
        `${sheet.name}: "${raw}" for ${row.label} ${result.reason}.`,
      );
    }
  }
  return fees;
}
