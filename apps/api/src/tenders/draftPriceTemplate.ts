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

function minor(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  const parsed = [
    parseDecimalInput(raw, "da"),
    parseDecimalInput(raw, "en"),
  ].find((result) => result.ok);
  return parsed?.ok ? parseMinorUnits(parsed.normalized) : null;
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
        minor(values[cell(sheet, `${column}${row.sourceRow}`)]) !== null,
    ),
  );
  if (!entered) return null;
  const bands = rows.map((row) => {
    const economyMinor = minor(values[cell(sheet, `C${row.sourceRow}`)]);
    const expressMinor = minor(values[cell(sheet, `D${row.sourceRow}`)]);
    if (economyMinor === null || expressMinor === null) {
      problems.push(`${sheet.name}: price missing for ${row.label}.`);
    }
    const bounds = parseBandBounds(row.label);
    return {
      label: row.label,
      ...bounds,
      economyMinor: economyMinor ?? 0,
      expressMinor: expressMinor ?? 0,
    };
  });
  return {
    countryCode: sheet.name.slice(3),
    bands,
    additionalFees: readFees(sheet, values),
  };
}

function readFees(
  sheet: WorkbookSheet,
  values: Values,
): Country["additionalFees"] {
  const section: WorkbookSection | undefined = sheet.sections.find(
    (item) => item.key === "additional-fees",
  );
  const fees: Country["additionalFees"] = [];
  for (const row of section?.rows ?? []) {
    const amountMinor = minor(values[cell(sheet, `E${row.sourceRow}`)]);
    if (amountMinor !== null) fees.push({ name: row.label, amountMinor });
  }
  return fees;
}
