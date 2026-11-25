// Writes ready-made carrier test workbooks to tests/fixtures/express.
// Run with: npm run fixtures:excel

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  type CarrierPrices,
  fillExpressTemplate,
  type WorkbookFault,
} from "../testing/expressWorkbooks.ts";

const OUTPUT = fileURLToPath(
  new URL("../../../../tests/fixtures/express/", import.meta.url),
);

const CARRIERS: [string, CarrierPrices][] = [
  [
    "carrier-north-valid.xlsx",
    {
      vendorName: "Test Carrier North",
      economyFrom: 42,
      expressFrom: 68,
      bandStep: 3.5,
      feeAmount: 150,
    },
  ],
  [
    "carrier-south-valid.xlsx",
    {
      vendorName: "Test Carrier South",
      economyFrom: 39.5,
      expressFrom: 71,
      bandStep: 4,
      feeAmount: 120,
    },
  ],
  [
    "carrier-east-valid.xlsx",
    {
      vendorName: "Test Carrier East",
      economyFrom: 45,
      expressFrom: 64,
      bandStep: 3,
      feeAmount: 175,
    },
  ],
];

const FAULTS: [string, WorkbookFault][] = [
  [
    "invalid-missing-price.xlsx",
    { kind: "missing-price", sheet: "DK-DE", row: 14 },
  ],
  ["invalid-text-price.xlsx", { kind: "text-price", sheet: "DK-SE", row: 20 }],
  ["invalid-wrong-sheets.xlsx", { kind: "wrong-sheet-names" }],
];

async function main(): Promise<void> {
  await mkdir(OUTPUT, { recursive: true });
  for (const [name, prices] of CARRIERS) {
    await writeFile(OUTPUT + name, await fillExpressTemplate(prices));
  }
  const [, base] = CARRIERS[0];
  for (const [name, fault] of FAULTS) {
    await writeFile(OUTPUT + name, await fillExpressTemplate(base, fault));
  }
  console.log(
    `Wrote ${CARRIERS.length + FAULTS.length} workbooks to ${OUTPUT}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
