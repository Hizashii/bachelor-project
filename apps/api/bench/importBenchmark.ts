// Measures time and peak memory of the shipment cleaning pipeline on synthetic files.
// Run: node --experimental-strip-types apps/api/bench/importBenchmark.ts 1000 10000 100000
// Not part of the test suite: it writes large temporary files.

import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { suggestMapping } from "@freight-desk/shared";
import { processShipments } from "../src/imports/processShipments.ts";
import { type OutputFormat, openSink } from "../src/imports/sinks.ts";

const HEADERS = [
  "Forsendelsesnr",
  "Fra postnr",
  "Til postnr",
  "Vægt (kg)",
  "Antal paller",
  "Fragtpris",
];
const BYTES_PER_MEGABYTE = 1024 * 1024;
const SAMPLE_INTERVAL_MS = 50;

async function generate(path: string, format: OutputFormat, rows: number) {
  const sink = openSink(path, format);
  await sink.write(HEADERS);
  for (let i = 1; i <= rows; i += 1) {
    await sink.write([
      `S-${i}`,
      "8300",
      "2680",
      `${1000 + (i % 500)},5`,
      (i % 20) + 1,
      `${2000 + (i % 300)},50`,
    ]);
  }
  await sink.close();
}

async function run(format: OutputFormat, rows: number, dir: string) {
  const inputPath = join(dir, `in-${rows}.${format}`);
  const outputPath = join(dir, `out-${rows}.xlsx`);
  await generate(inputPath, format, rows);
  const { mapping } = suggestMapping(HEADERS);
  let peak = process.memoryUsage().rss;
  const timer = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, SAMPLE_INTERVAL_MS);
  const started = performance.now();
  const summary = await processShipments({
    inputPath,
    outputPath,
    format: "xlsx",
    read: { kind: format },
    mapping,
    signal: new AbortController().signal,
    onProgress: () => undefined,
  });
  clearInterval(timer);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const mb = (peak / BYTES_PER_MEGABYTE).toFixed(0);
  const { size } = await stat(outputPath);
  const correct = summary.rowsRead === rows && summary.rowsWithIssues === 0;
  console.log(
    `${format} ${rows} rows: ${seconds}s, peak RSS ${mb} MB, output ${(size / BYTES_PER_MEGABYTE).toFixed(1)} MB, correct=${correct}`,
  );
}

const dir = await mkdtemp(join(tmpdir(), "import-bench-"));
const sizes = process.argv.slice(2).map(Number);
for (const rows of sizes) {
  for (const format of ["csv", "xlsx"] as const) await run(format, rows, dir);
}
await rm(dir, { recursive: true, force: true });
