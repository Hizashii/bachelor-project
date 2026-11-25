// Browser tests for upload, carrier tariffs and comparison against the test server.
// All files are generated here from synthetic rows.

import { expect, type Page, test } from "@playwright/test";

const shipmentsCsv = [
  "Forsendelsesnr;Fra postnr;Til postnr;Vægt (kg)",
  "S-1;8300;2680;250",
  "S-2;8300;2700;abc",
  "S-1;8300;2680;100",
].join("\n");

const PASSWORD = "correct horse battery staple";

async function logIn(page: Page, email: string) {
  await page.goto("/login");
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/auth/login") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Log in" }).click();
  expect((await loginResponse).ok()).toBe(true);
  await expect(page.getByRole("button", { name: "Log ud" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await logIn(page, "staff@example.test");
});

test("public homepage shows an honest empty comparison preview", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Log ud" }).click();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await page.goto("/");

  await expect(page.getByText("Strukturel visning")).toBeVisible();
  await expect(
    page.getByText("Ingen live tilbud vises på forsiden."),
  ).toBeVisible();
  await expect(page.getByText("Transportør A")).toHaveCount(0);
  await expect(page.getByText("1.240.000 DKK/year")).toHaveCount(0);
});

test("staff lands on the empty tender workspace", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/tenders$/);
  await expect(
    page.getByRole("heading", { name: "Udbud og tilbud" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Der er ingen udbud endnu" }),
  ).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/tenders$/);
  await expect(
    page.getByRole("heading", { name: "Der er ingen udbud endnu" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Udbud", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Overblik")).toHaveCount(0);
  await expect(page.getByText("Fakturakontrol")).toHaveCount(0);
  await expect(page.getByText("Prisberegner")).toHaveCount(0);
});

test("staff creates, refreshes and edits a tender draft", async ({ page }) => {
  await page.goto("/tenders");
  await page.getByRole("link", { name: "Opret udbud" }).click();
  await page.getByLabel("Navn på udbud").fill("Jylland 2027");
  await page.getByLabel("Kundereference").fill("SA-2027-01");
  await page.getByLabel("Visningstidszone").fill("Europe/Copenhagen");
  await page.getByLabel("Valuta").selectOption("DKK");
  await page.getByRole("button", { name: "Gem kladde" }).click();

  await expect(page).toHaveURL(/\/tenders\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("heading", { name: "Jylland 2027" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Jylland 2027" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Rediger kladde" }).click();
  await page.getByLabel("Navn på udbud").fill("Jylland 2027 opdateret");
  await page.getByRole("button", { name: "Gem kladde" }).click();
  await expect(
    page.getByRole("heading", { name: "Jylland 2027 opdateret" }),
  ).toBeVisible();
});

test("workspace stays usable at desktop, tablet and mobile widths", async ({
  page,
}) => {
  const routes = ["/tenders", "/upload", "/compare", "/files", "/carriers"];
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      const width = await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      );
      expect(width, `${route} overflows at ${viewport.width}px`).toBe(true);
    }
  }

  await page.keyboard.press("Tab");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName))
    .not.toBe("BODY");
});

test("carrier sees invited tenders and cannot open staff tools", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Log ud" }).click();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await logIn(page, "dana@bluefjord.test");
  await page.goto("/");

  await expect(page).toHaveURL(/\/tenders$/);
  await expect(
    page.getByRole("heading", { name: "Inviterede udbud", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Du har ingen inviterede udbud" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Upload" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sammenlign" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Filer" })).toHaveCount(0);

  await page.goto("/compare");
  await expect(page).toHaveURL(/\/tenders$/);

  await page.goto("/files");
  await expect(page).toHaveURL(/\/tenders$/);
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

  await page
    .getByRole("button", { name: "Gem i virksomhedens lagring" })
    .click();
  await expect(page.getByText("Gemt i virksomhedens lagring.")).toBeVisible();
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
    page.getByText("Kladden er gemt i virksomhedens lagring."),
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
  await page.getByRole("button", { name: "Log ud" }).click();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await logIn(page, "dana@bluefjord.test");
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

test("transporters keeps the staff navigation available", async ({ page }) => {
  await page.goto("/carriers");

  await expect(page.getByRole("link", { name: "Upload" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sammenlign" })).toBeVisible();
  await page.getByRole("link", { name: "Filer" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Forsendelsesfiler i virksomhedens lagring",
    }),
  ).toBeVisible();
});

test("compare: shows the calculated price and marks reliability as not available", async ({
  page,
}) => {
  await page.goto("/compare");
  await page.getByLabel("Fra postnummer").fill("8300");
  await page.getByLabel("Til postnummer").fill("2680");
  await page.getByLabel("Vægt (kg)").fill("250");
  await page.getByRole("button", { name: "Sammenlign priser" }).click();

  await expect(page.getByText("Blue Fjord", { exact: true })).toBeVisible();
  await expect(page.getByText("500,00 DKK").first()).toBeVisible();
  await expect(page.getByText("Ikke tilgængelig").first()).toBeVisible();
  await expect(page.getByText(/%/)).toHaveCount(0);
});
