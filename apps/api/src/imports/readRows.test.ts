// Tests for reading CSV and XLSX uploads. Files are generated here from synthetic rows.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CsvParser } from "./csv.ts";
import { detectFileKind, readRows, UnreadableFileError } from "./readRows.ts";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "reader-test-"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

async function collect(path: string) {
  const kind = await detectFileKind(path);
  const rows = [];
  for await (const row of readRows(path, { kind })) rows.push(row);
  return rows;
}

describe("CsvParser", () => {
  it("handles quotes, doubled quotes and line breaks inside fields", () => {
    const parser = new CsvParser(";");
    const rows = [
      ...parser.push('a;"b;1";"say ""hi"""\r\n"x\ny";2\n'),
      ...parser.end(),
    ];
    expect(rows).toEqual([
      ["a", "b;1", 'say "hi"'],
      ["x\ny", "2"],
    ]);
  });
});

describe("readRows", () => {
  it("reads a semicolon CSV saved in Windows-1252", async () => {
    const path = join(dir, "latin.csv");
    await writeFile(path, Buffer.from("Ref;Vægt\nS-1;2,5\n", "latin1"));
    expect(await collect(path)).toEqual([
      ["Ref", "Vægt"],
      ["S-1", "2,5"],
    ]);
  });

  it("reads an XLSX file and uses stored formula results", async () => {
    const path = join(dir, "book.xlsx");
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Data");
    sheet.addRow(["Ref", "Weight"]);
    sheet.addRow(["S-1", { formula: "1+1", result: 2 }]);
    await book.xlsx.writeFile(path);
    expect(await collect(path)).toEqual([
      ["Ref", "Weight"],
      ["S-1", 2],
    ]);
  });

  it("rejects a corrupted XLSX", async () => {
    const path = join(dir, "broken.xlsx");
    await writeFile(path, Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]));
    await expect(collect(path)).rejects.toBeInstanceOf(UnreadableFileError);
  });

  it("rejects binary files and empty files", async () => {
    const binary = join(dir, "x.csv");
    await writeFile(binary, Buffer.from([1, 0, 2, 0]));
    await expect(detectFileKind(binary)).rejects.toBeInstanceOf(
      UnreadableFileError,
    );
    const empty = join(dir, "empty.csv");
    await writeFile(empty, "");
    await expect(detectFileKind(empty)).rejects.toBeInstanceOf(
      UnreadableFileError,
    );
  });
});
