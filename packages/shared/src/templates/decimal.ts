export type DecimalLocale = "da" | "en";

export type ParsedDecimal =
  | { ok: true; value: number; normalized: string }
  | { ok: false; reason: "empty" | "invalid" };

/** Parse the two separators used by the DA and EN workspaces without changing the editor text. */
export function parseDecimalInput(
  raw: string,
  locale: DecimalLocale = "en",
): ParsedDecimal {
  const input = raw.trim();
  if (input === "") return { ok: false, reason: "empty" };
  if (!/^[+-]?[0-9][0-9 .,]*$/.test(input)) {
    return { ok: false, reason: "invalid" };
  }

  const unsigned = input.replace(/^[+-]/, "");
  const sign = input.startsWith("-") ? "-" : "";
  const hasComma = unsigned.includes(",");
  const hasDot = unsigned.includes(".");
  let normalizedBody: string;

  if (hasComma && hasDot) {
    const decimalSeparator =
      unsigned.lastIndexOf(",") > unsigned.lastIndexOf(".") ? "," : ".";
    const groupingSeparator = decimalSeparator === "," ? "." : ",";
    normalizedBody = unsigned
      .replaceAll(" ", "")
      .replaceAll(groupingSeparator, "")
      .replace(decimalSeparator, ".");
  } else if (hasComma || hasDot) {
    const separator = hasComma ? "," : ".";
    const pieces = unsigned.split(separator);
    const isLocaleDecimal =
      (locale === "da" && separator === ",") ||
      (locale === "en" && separator === ".");
    if (isLocaleDecimal) {
      if (pieces.length > 2) return { ok: false, reason: "invalid" };
      normalizedBody = unsigned.replace(separator, ".");
    } else {
      const validGrouping =
        pieces.length > 1 &&
        pieces[0].length > 0 &&
        pieces.slice(1).every((piece) => piece.length === 3);
      normalizedBody = validGrouping
        ? unsigned.replaceAll(separator, "")
        : unsigned.replace(separator, ".");
    }
  } else {
    normalizedBody = unsigned.replaceAll(" ", "");
  }

  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(normalizedBody)) {
    return { ok: false, reason: "invalid" };
  }
  const normalized = `${sign}${normalizedBody}`;
  const value = Number(normalized);
  return Number.isFinite(value)
    ? { ok: true, value, normalized }
    : { ok: false, reason: "invalid" };
}
