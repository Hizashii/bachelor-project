import { readFile } from "node:fs/promises";
import type { RoadPriceList } from "@freight-desk/shared";
import { readZip, writeZip, type ZipEntry } from "./zip.ts";

export type RoadExport = {
  data: Uint8Array;
  contentType: string;
  filename: string;
};

const workbookSheets = {
  totalCost: "xl/worksheets/sheet1.xml",
  prices: "xl/worksheets/sheet2.xml",
  zones: "xl/worksheets/sheet4.xml",
};

export async function createRoadExport(
  templatePath: string,
  submissions: readonly RoadPriceList[],
): Promise<RoadExport> {
  const template = await readFile(templatePath);
  if (submissions.length === 1) {
    return {
      data: createWorkbook(template, submissions[0]),
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: workbookFilename(submissions[0]),
    };
  }

  const workbooks = submissions.map((submission) => ({
    name: workbookFilename(submission),
    data: createWorkbook(template, submission),
  }));
  const archive = writeZip(workbooks);
  return {
    data: archive,
    contentType: "application/zip",
    filename: "Prisskabeloner - Road - DK-DK - alle transportører.zip",
  };
}

function createWorkbook(
  template: Uint8Array,
  submission: RoadPriceList,
): Uint8Array {
  const entries = readZip(template).map((entry) => ({ ...entry }));
  updateXml(entries, workbookSheets.totalCost, (xml) =>
    setString(xml, "C7", submission.carrierName),
  );
  updateXml(entries, workbookSheets.prices, (xml) =>
    updatePriceSheet(xml, submission),
  );
  updateXml(entries, workbookSheets.zones, (xml) =>
    updateZoneSheet(xml, submission),
  );
  return writeZip(entries);
}

function updatePriceSheet(xml: string, submission: RoadPriceList): string {
  let result = setString(xml, "C7", submission.carrierName);
  for (let row = 15; row <= 28; row += 1) {
    const band = submission.priceBands[row - 15];
    result = band
      ? setNumber(result, `B${row}`, band.from)
      : clearCell(result, `B${row}`);
    result =
      band && band.to !== null
        ? setNumber(result, `C${row}`, band.to)
        : clearCell(result, `C${row}`);
    result = band
      ? setString(result, `D${row}`, unitLabel(submission.unit))
      : clearCell(result, `D${row}`);
    for (let zone = 0; zone < 13; zone += 1) {
      const value = band?.values[zone];
      result = setPrice(result, `${columnName(5 + zone)}${row}`, value);
    }
  }
  return result;
}

function updateZoneSheet(xml: string, submission: RoadPriceList): string {
  let result = xml;
  for (let row = 2; row <= 26; row += 1) {
    const zone = submission.zones[row - 2];
    result = zone
      ? setNumber(result, `A${row}`, Number(zone.from))
      : clearCell(result, `A${row}`);
    result =
      zone && zone.to !== ""
        ? setNumber(result, `B${row}`, Number(zone.to))
        : clearCell(result, `B${row}`);
    result = zone
      ? setString(result, `C${row}`, `Zone ${row - 1}`)
      : clearCell(result, `C${row}`);
  }
  return result;
}

function updateXml(
  entries: ZipEntry[],
  name: string,
  update: (xml: string) => string,
): void {
  const entry = entries.find((item) => item.name === name);
  if (!entry) throw new Error(`The configured workbook has no ${name} sheet.`);
  entry.data = new TextEncoder().encode(
    update(new TextDecoder().decode(entry.data)),
  );
}

function setPrice(
  xml: string,
  reference: string,
  value: string | undefined,
): string {
  const parsed = parsePrice(value);
  return parsed === null
    ? clearCell(xml, reference)
    : setNumber(xml, reference, parsed);
}

function parsePrice(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function unitLabel(unit: RoadPriceList["unit"]): string {
  if (unit === "KG") return "Per 100kg";
  if (unit === "CBM") return "Per CBM";
  if (unit === "LDM") return "Per LDM";
  return "Per pallet";
}

function workbookFilename(submission: RoadPriceList): string {
  return `Prisskabelon - Road - DK-DK - ${safeFilename(submission.carrierName)}.xlsx`;
}

function safeFilename(value: string): string {
  return value.replace(/[<>:"/\\|?*]/g, "-").trim() || "Transportør";
}

function columnName(number: number): string {
  let value = number;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function setNumber(xml: string, reference: string, value: number): string {
  return replaceCell(xml, reference, `<v>${value}</v>`, null);
}

function setString(xml: string, reference: string, value: string): string {
  const escaped = escapeXml(value);
  return replaceCell(xml, reference, `<is><t>${escaped}</t></is>`, "inlineStr");
}

function clearCell(xml: string, reference: string): string {
  return replaceCell(xml, reference, "", null);
}

function replaceCell(
  xml: string,
  reference: string,
  content: string,
  cellType: "inlineStr" | null,
): string {
  const escapedReference = reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<c(?=[^>]*\\br="${escapedReference}"(?:\\s|>))([^>]*)\\/>|<c(?=[^>]*\\br="${escapedReference}"(?:\\s|>))([^>]*)>([\\s\\S]*?)<\\/c>`,
  );
  return xml.replace(
    pattern,
    (_match, selfAttributes: string, openAttributes: string) => {
      const attributes = (openAttributes ?? selfAttributes)
        .replace(/\s+t="[^"]*"/, "")
        .replace(/\/$/, "");
      const type = cellType ? ` t="${cellType}"` : "";
      return `<c${attributes}${type}>${content}</c>`;
    },
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
