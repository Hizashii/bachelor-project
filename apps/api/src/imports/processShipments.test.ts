// Tests for the whole cleaning pipeline: mapping, issue counting, output and cancel.

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inspectFile } from "./inspect.ts";
import {
  CancelledError,
  MappingError,
  type ProcessInput,
  processShipments,
} from "./processShipments.ts";

let dir: string;
const csv = [
  "Titel;Forsendelsesnr;Fra postnr;Til postnr;Vægt (kg);Tom kolonne",
  "Ordreliste;;;;;",
  "x;S-1;8300;2680;1.200,5;",
  "x;S-2;8300;2700;abc;",
  "x;S-1;8300;2680;10;",
  "x;=CMD();8300;2680;10;",
].join("\n");

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "process-test-"));
  await writeFile(join(dir, "in.csv"), csv);
});
afterAll(() => rm(dir, { recursive: true, force: true }));

async function setup(
  overrides: Partial<ProcessInput> = {},
): Promise<ProcessInput> {
  const read = { kind: "csv" as const };
  const { mapping } = await inspectFile(join(dir, "in.csv"), read);
  return {
    inputPath: join(dir, "in.csv"),
    outputPath: join(dir, "out.csv"),
    format: "csv",
    read,
    mapping,
    signal: new AbortController().signal,
    onProgress: () => undefined,
    ...overrides,
  };
}

describe("processShipments", () => {
  it("finds the header row and maps the columns", async () => {
    const result = await inspectFile(join(dir, "in.csv"), { kind: "csv" });
    expect(result.headerRow).toBe(1);
    expect(result.missingRequired).toEqual([]);
  });

  it("counts issues, flags duplicates and writes only mapped columns", async () => {
    const summary = await processShipments(await setup());
    expect(summary.rowsRead).toBe(5);
    expect(summary.issueCounts.duplicate).toBe(1);
    expect(summary.issueCounts.invalid).toBe(1);
    const output = await readFile(join(dir, "out.csv"), "utf8");
    expect(output).toContain("1200.5");
    expect(output).not.toContain("Tom kolonne");
    expect(output).toContain("'=CMD()");
  });

  it("refuses to start when a required column is not mapped", async () => {
    const input = await setup({ mapping: { reference: 1 } });
    await expect(processShipments(input)).rejects.toBeInstanceOf(MappingError);
  });

  it("stops when cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const input = await setup({ signal: controller.signal });
    await expect(processShipments(input)).rejects.toBeInstanceOf(
      CancelledError,
    );
  });
});
