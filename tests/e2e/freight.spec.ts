// Browser tests for upload, carrier tariffs and comparison against the test server.
// All files are generated here from synthetic rows.

import { expect, test } from "@playwright/test";

const shipmentsCsv = [
  "Forsendelsesnr;Fra postnr;Til postnr;Vægt (kg)",
  "S-1;8300;2680;250",
  "S-2;8300;2700;abc",
  "S-1;8300;2680;100",
].join("\n");

test.beforeEach(async ({ page }) => {
  await page.goto("/auth/mock/login?identity=master");
});

test("upload: map columns, process, see issues and download", async ({
  page,
}) => {
  await page.goto("/upload");
  await page.locator("#shipment-file").setInputFiles({
    name: "shipments.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(shipmentsCsv),
  });

  await expect(
    page.getByRole("heading", { name: "Er kolonnerne rigtige?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tjek eksempel" }).click();
  await expect(
    page.getByText("I eksemplet er 2 af 3 rækker ikke i orden."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Behandl hele filen" }).click();
  await expect(
    page.getByRole("heading", { name: "Filen er behandlet" }),
  ).toBeVisible();
  await expect(page.getByText("Dublet: 1")).toBeVisible();
  await expect(page.getByText("Ugyldig: 1")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download resultat" }).click();
  expect((await download).suggestedFilename()).toBe("shipments-processed.xlsx");

  await page.getByRole("button", { name: "Gem i Microsoft 365" }).click();
  await expect(page.getByText("Gemt i Microsoft 365.")).toBeVisible();
});

test("upload: draft is saved and can be reopened", async ({ page }) => {
  await page.goto("/upload");
  await page.locator("#shipment-file").setInputFiles({
    name: "draft.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(shipmentsCsv),
  });
  await page.getByRole("button", { name: "Gem kladde" }).click();
  await expect(
    page.getByText("Kladden er gemt i Microsoft 365."),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Gemte kladder" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Åbn" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Er kolonnerne rigtige?" }),
  ).toBeVisible();
});

test("carrier portal: import rate sheet, check zones, price a sample, save draft", async ({
  page,
}) => {
  await page.goto("/auth/mock/login?identity=carrier");
  await page.goto("/carriers");
  const sheet = [
    "Pris pr. 100 kg;Zone A (00-26);Zone B (30-36)",
    "0-100;200,50;300",
    "100+;150;250",
    "",
  ].join("\n");
  await page.locator("#carrier-excel").setInputFiles({
    name: "rates.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(sheet),
  });
  await expect(page.getByText("Uploadet fil: rates.csv")).toBeVisible();
  await expect(page.getByLabel("0–100 Zone A")).toHaveValue("200,50");

  await page.getByLabel("Til postnummer").fill("3100");
  await page.getByLabel("Fra postnummer").fill("8300");
  await page.getByLabel("Vægt (kg)").nth(0).fill("50");
  await expect(
    page.getByRole("status").filter({ hasText: "I alt" }),
  ).toContainText("150,00 DKK");

  await page.getByLabel("Fra (postnr.) 2").fill("20");
  await expect(page.getByText("Tjek zonerne")).toBeVisible();
  await page.getByLabel("Fra (postnr.) 2").fill("30");

  await expect(page.getByText("Ændringer er ikke gemt endnu.")).toBeVisible();
  await page.getByRole("button", { name: "Gem kladde" }).click();
  await expect(page.getByText("Ændringer gemt")).toBeVisible();
});

test("compare: shows the calculated price and marks reliability as not available", async ({
  page,
}) => {
  await page.goto("/compare");
  await page.getByLabel("Fra postnummer").fill("8300");
  await page.getByLabel("Til postnummer").fill("2680");
  await page.getByLabel("Vægt (kg)").fill("250");
  await page.getByRole("button", { name: "Sammenlign priser" }).click();

  await expect(
    page.getByText("carrier-blue-fjord", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("500,00 DKK").first()).toBeVisible();
  await expect(page.getByText("Ikke tilgængelig").first()).toBeVisible();
  await expect(page.getByText(/%/)).toHaveCount(0);
});
