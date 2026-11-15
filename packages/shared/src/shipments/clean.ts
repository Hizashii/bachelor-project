// Turns messy spreadsheet cells into clean values: numbers, dates, postcodes, money.
// Danish notation (1.234,50) is the default; ambiguous input is read the Danish way.
// Not for deciding whether a value is acceptable: see validate.ts.

export type RawCell = string | number | boolean | Date | null | undefined;

const KG_PER_GRAM = 0.001;
const KG_PER_TONNE = 1000;
const MINOR_DIGITS = 2;
const THOUSANDS_GROUP_LENGTH = 3;
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;

export function cellText(cell: RawCell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString();
  return String(cell).trim();
}

// Returns plain "1234.5" text so money can be shifted without float arithmetic.
export function parseDecimalText(cell: RawCell): string | null {
  if (typeof cell === "number") {
    return Number.isFinite(cell) ? String(cell) : null;
  }
  const text = cellText(cell).replace(/[\s ]/g, "");
  if (!/^-?[\d.,]+$/.test(text)) return null;
  const decimal = normaliseSeparators(text);
  return decimal !== null && Number.isFinite(Number(decimal)) ? decimal : null;
}

export function parseDecimal(cell: RawCell): number | null {
  const text = parseDecimalText(cell);
  return text === null ? null : Number(text);
}

function normaliseSeparators(text: string): string | null {
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalMark = lastDot > lastComma ? "." : ",";
    const thousandsMark = decimalMark === "." ? "," : ".";
    return text.split(thousandsMark).join("").replace(decimalMark, ".");
  }
  if (lastComma >= 0) return singleMark(text, ",");
  if (lastDot >= 0) return singleMark(text, ".");
  return text;
}

// "2.400" is a thousands mark in Danish notation; "2,400" is a decimal.
function singleMark(text: string, mark: "," | "."): string | null {
  const parts = text.split(mark);
  const groupsOfThree = parts.slice(1).every((part) => {
    return part.length === THOUSANDS_GROUP_LENGTH;
  });
  if (mark === "." && groupsOfThree) return parts.join("");
  if (parts.length > 2) return null;
  return `${parts[0]}.${parts[1]}`;
}

// Money is kept as whole øre: the digits are shifted as text, never multiplied.
// A third decimal digit of 5 or more rounds the amount up.
export function parseMinorUnits(cell: RawCell): number | null {
  const text = parseDecimalText(cell);
  if (text === null || text.startsWith("-")) return null;
  const [whole = "0", fraction = ""] = text.split(".");
  const padded = fraction.padEnd(MINOR_DIGITS + 1, "0");
  const minor = Number(whole + padded.slice(0, MINOR_DIGITS));
  return Number(padded[MINOR_DIGITS]) >= 5 ? minor + 1 : minor;
}

export function weightFactorFromHeader(header: string): number {
  const unit = /\(\s*(kg|g|t|tons?|tonnes?)\s*\)|\b(tons?|tonnes?)\b/i.exec(
    header,
  );
  const word = (unit?.[1] ?? unit?.[2] ?? "kg").toLowerCase();
  if (word === "g") return KG_PER_GRAM;
  return word.startsWith("t") ? KG_PER_TONNE : 1;
}

export function normalisePostcode(cell: RawCell): string | null {
  const text = cellText(cell)
    .replace(/^(dk|de|se|no)[\s-]*/i, "")
    .replace(/\s/g, "");
  return /^\d{4,5}$/.test(text) ? text : null;
}

// Dates without a time zone stay local wall-clock time: "2026-03-05T14:30".
export function parseDateTime(cell: RawCell): string | null {
  if (cell instanceof Date) {
    return Number.isNaN(cell.getTime()) ? null : cell.toISOString();
  }
  const text = cellText(cell);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2}))?/.exec(
    text,
  );
  if (iso) return buildDate(iso[1], iso[2], iso[3], iso[4], iso[5]);
  const danish =
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2})[:.](\d{2}))?$/.exec(
      text,
    );
  if (danish)
    return buildDate(danish[3], danish[2], danish[1], danish[4], danish[5]);
  return null;
}

function buildDate(
  year = "",
  month = "",
  day = "",
  hour = "0",
  minute = "0",
): string | null {
  const [y, mo, d, h, mi] = [year, month, day, hour, minute].map(Number);
  const date = new Date(
    Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0),
  );
  const exact =
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === (mo ?? 1) - 1 &&
    date.getUTCDate() === d &&
    (h ?? 0) < HOURS_PER_DAY &&
    (mi ?? 0) < MINUTES_PER_HOUR;
  return exact ? date.toISOString().slice(0, 16) : null;
}
