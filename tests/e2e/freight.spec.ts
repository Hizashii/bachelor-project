// Browser tests for upload, carrier tariffs and comparison against the test server.
// All files are generated here from synthetic rows.

import { expect, type Page, test } from "@playwright/test";
import ExcelJS from "exceljs";

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

test("public homepage shows labelled sample numbers", async ({ page }) => {
  await page.getByRole("button", { name: "Log ud" }).click();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await page.goto("/");

  await expect(page.getByText("Eksempelvisning")).toBeVisible();
  await expect(
    page.getByText("Eksempeldata · ikke rigtige tilbud"),
  ).toBeVisible();
  await expect(page.getByText("1.172.500 DKK").first()).toBeVisible();

  await page.getByRole("tab", { name: "Grundlag" }).click();
  await expect(page.getByText("12.400")).toBeVisible();
  await page.getByRole("tab", { name: "Tilbud" }).click();
  await expect(page.getByText("Modtaget 14.03")).toBeVisible();
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

async function createOpenTender(page: Page, name: string): Promise<string> {
  await page.goto("/tenders/new");
  await page.getByLabel("Navn på udbud").fill(name);
  await page.getByLabel("Kundereference").fill("SA-LIFE-01");
  await page.getByLabel("Visningstidszone").fill("Europe/Copenhagen");
  await page.getByLabel("Valuta").selectOption("DKK");
  await page.getByRole("button", { name: "Gem kladde" }).click();
  await expect(page).toHaveURL(/\/tenders\/[0-9a-f-]+$/);
  const tenderId = page.url().split("/").pop() ?? "";
  await page.getByLabel("Blue Fjord").check();
  await page.getByLabel("Second Haul").check();
  await page.getByRole("button", { name: "Gem ændringer" }).click();
  await expect(page.getByText("Ændringer gemt")).toBeVisible();
  await page.getByRole("button", { name: "Åbn udbud" }).click();
  await expect(page.getByRole("button", { name: "Luk udbud" })).toBeVisible();
  return tenderId;
}

const FIXTURES = new URL(
  "./../fixtures/express/",
  import.meta.url,
).pathname.replace(/^\/([A-Z]:)/, "$1");

async function submitBid(page: Page, fileName: string) {
  await page
    .getByLabel("Upload Excel")
    .setInputFiles(decodeURIComponent(FIXTURES) + fileName);
  await page.getByRole("button", { name: "Send til godkendelse" }).click();
}

async function saveBasis(page: Page, country: string, shipments: string) {
  await page.getByLabel("Land").selectOption(country);
  await page.getByLabel(`${country} 0-1 kg Antal forsendelser`).fill(shipments);
  await page.getByRole("button", { name: "Gem grundlag" }).click();
  await expect(page.getByText("Grundlag gemt.")).toBeVisible();
}

async function signInAs(page: Page, email: string) {
  await page.getByRole("button", { name: "Log ud" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await logIn(page, email);
}

test("tender lifecycle: carriers upload real workbooks, staff compare and export", async ({
  page,
}) => {
  await createOpenTender(page, "Lifecycle bid 2027");

  await signInAs(page, "dana@bluefjord.test");
  await page.getByRole("link", { name: "Lifecycle bid 2027" }).click();
  await submitBid(page, "invalid-missing-price.xlsx");
  await expect(page.getByText(/DK-DE.*0-1 kg/)).toBeVisible();
  await submitBid(page, "carrier-north-valid.xlsx");
  await expect(page.getByText("Sendt til godkendelse.")).toBeVisible();

  await signInAs(page, "erik@secondhaul.test");
  await page.getByRole("link", { name: "Lifecycle bid 2027" }).click();
  await submitBid(page, "invalid-wrong-sheets.xlsx");
  await expect(page.getByText(/No DK country sheets/)).toBeVisible();
  await submitBid(page, "carrier-south-valid.xlsx");
  await expect(page.getByText("Sendt til godkendelse.")).toBeVisible();

  await signInAs(page, "staff@example.test");
  await page.getByRole("link", { name: "Lifecycle bid 2027" }).click();
  await saveBasis(page, "DE", "100");
  await page.getByRole("button", { name: "Luk udbud" }).click();
  await page.getByRole("button", { name: "Sammenlign", exact: true }).click();
  const results = page.locator(".comparison-table").first();
  const north = results.getByRole("row", { name: /Test Carrier North/ });
  await expect(north).toContainText("5500.00 DKK");
  await expect(north).toContainText("Billigst");
  await expect(
    results.getByRole("row", { name: /Test Carrier South/ }),
  ).toContainText("5525.00 DKK");

  const pickup = page.getByRole("region", { name: "Prisoversigt" });
  await expect(pickup.getByRole("row", { name: /^0-1 kg/ })).toContainText(
    "21.00",
  );

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download resultat Excel" }).click();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await (await download).path());
  expect(workbook.worksheets[0]?.getCell("A2").value).toBe(
    "Test Carrier North",
  );
  expect(workbook.getWorksheet("Per country")?.getCell("A2").value).toBe("DE");

  await north.getByRole("button", { name: "Tildel" }).click();
  await expect(page.getByText("Udbuddet er tildelt.")).toBeVisible();
  await expect(north).toContainText("Tildelt");

  await signInAs(page, "dana@bluefjord.test");
  await page.getByRole("link", { name: "Lifecycle bid 2027" }).click();
  await expect(page.getByText(/Tillykke|tildelt en anden/)).toBeVisible();
});

test("tender workspace: staff saves a price and it survives a reload", async ({
  page,
}) => {
  await createOpenTender(page, "Lifecycle workspace 2027");
  await page.getByRole("link", { name: "Tilbudsskabelon" }).click();
  await page.getByRole("tab", { name: "Express price workbook" }).click();
  await page.getByRole("tab", { name: /^DK-BE/ }).click();
  await page.getByRole("textbox", { name: /DK-BE/ }).first().fill("12,5");
  await page.getByRole("button", { name: "Gem ændringer" }).click();
  await expect(page.getByText("Kladde gemt")).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: "Express price workbook" }).click();
  await page.getByRole("tab", { name: /^DK-BE/ }).click();
  await expect(
    page.getByRole("textbox", { name: /DK-BE/ }).first(),
  ).toHaveValue("12,5");
});

const NAV_BY_ROLE: [string, string, string[]][] = [
  [
    "staff",
    "staff@example.test",
    ["/tenders", "/upload", "/files", "/compare", "/carriers"],
  ],
  ["carrier", "dana@bluefjord.test", ["/tenders", "/carriers"]],
];

for (const [role, email, routes] of NAV_BY_ROLE) {
  test(`${role}: sign in from the homepage button and open every page`, async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Log ud" }).click();
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await page.goto("/");
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 500) problems.push(response.url());
    });

    await page.getByRole("link", { name: "Log ind" }).first().click();
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/tenders$/);

    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("main h1").first()).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${route}$`));
    }
    expect(problems).toEqual([]);
  });
}

test("a wrong password shows an error and stays on the login page", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Log ud" }).click();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await page.getByLabel("E-mail").fill("staff@example.test");
  await page.getByLabel("Password").fill("not the password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("signing out returns to the login page and blocks the app", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Log ud" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/tenders");
  await expect(page.getByLabel("E-mail")).toBeVisible();
});

test("carriers fill the express workbook in the app and staff compare the result", async ({
  page,
}) => {
  await createOpenTender(page, "Online pricing 2027");

  await signInAs(page, "dana@bluefjord.test");
  await page.getByRole("link", { name: "Online pricing 2027" }).click();
  await page.getByRole("link", { name: "Tilbudsskabelon" }).click();
  await expect(
    page.getByRole("tab", { name: "Express price workbook" }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Customer bidding workbook" }),
  ).toHaveCount(0);

  await page.getByRole("tab", { name: /^DK-DE/ }).click();
  await page.getByLabel("Leverandørnavn").fill("Blue Fjord Online");
  const cells = page.getByRole("textbox", { name: /^DK-DE / });
  for (const cell of await cells.all()) await cell.fill("10");
  await page.getByRole("button", { name: "Gem ændringer" }).click();
  await expect(page.getByText("Kladde gemt")).toBeVisible();
  await page.getByRole("button", { name: "Send til godkendelse" }).click();
  await expect(page.getByText("Sendt til godkendelse.")).toBeVisible();

  await signInAs(page, "staff@example.test");
  await page.getByRole("link", { name: "Online pricing 2027" }).click();
  await saveBasis(page, "DE", "100");
  await page.getByRole("button", { name: "Luk udbud" }).click();
  await page.getByRole("button", { name: "Sammenlign", exact: true }).click();
  await expect(
    page
      .locator(".comparison-table")
      .first()
      .getByRole("row", { name: /Blue Fjord Online/ }),
  ).toContainText("1000.00 DKK");
});

test("staff see a carrier's bid arrive without reloading, with no prices", async ({
  page,
  browser,
}) => {
  await createOpenTender(page, "Live status 2027");
  const status = page.getByRole("region", { name: "Tilbudsstatus" });
  await expect(status.getByText("Ikke afsendt endnu")).toHaveCount(2);

  const carrierPage = await (await browser.newContext()).newPage();
  await carrierPage.goto("/login");
  await carrierPage.getByLabel("E-mail").fill("dana@bluefjord.test");
  await carrierPage.getByLabel("Password").fill(PASSWORD);
  await carrierPage.getByRole("button", { name: "Log in" }).click();
  await carrierPage.getByRole("link", { name: "Live status 2027" }).click();
  await submitBid(carrierPage, "carrier-north-valid.xlsx");
  await expect(carrierPage.getByText("Sendt til godkendelse.")).toBeVisible();
  await expect(carrierPage.getByText("Dit tilbud: Afsendt v1")).toBeVisible();

  await expect(status.getByText(/Afsendt v1/)).toBeVisible({ timeout: 15_000 });
  await expect(status.getByText("Ikke afsendt endnu")).toHaveCount(1);
  await expect(page.getByText("5500.00")).toHaveCount(0);
});

test("an expired session sends the user back to the login page", async ({
  page,
}) => {
  const nav = page.getByRole("navigation", { name: "Primær navigation" });
  await nav.getByRole("link", { name: "Filer" }).waitFor();
  await page.context().clearCookies();
  await nav.getByRole("link", { name: "Filer" }).click();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("a signed-out visitor to a deep link gets the login page, then the page", async ({
  browser,
}) => {
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/tenders/new");
  await expect(visitor.getByLabel("E-mail")).toBeVisible();
  await visitor.getByLabel("E-mail").fill("staff@example.test");
  await visitor.getByLabel("Password").fill(PASSWORD);
  await visitor.getByRole("button", { name: "Log in" }).click();
  await expect(visitor.getByLabel("Navn på udbud")).toBeVisible();
});

test("an administrator adds a carrier and invites a user who can then sign in", async ({
  page,
}) => {
  await page.getByRole("link", { name: "Brugere" }).click();
  await page.getByLabel("Firmanavn").fill("New Haul ApS");
  await page.getByRole("button", { name: "Tilføj transportør" }).click();
  await expect(page.locator("li", { hasText: "New Haul ApS" })).toBeVisible();

  await page.getByLabel("E-mail", { exact: true }).fill("kim@newhaul.test");
  await page.getByLabel("Navn", { exact: true }).fill("Kim Haul");
  await page.locator("select").last().selectOption({ label: "New Haul ApS" });
  await page.getByRole("button", { name: "Inviter bruger" }).click();
  const link = await page.getByLabel("Engangslink").last().inputValue();
  expect(link).toContain("/accept-invitation?token=");

  await page.getByRole("button", { name: "Log ud" }).click();
  const url = new URL(link);
  await page.goto(url.pathname + url.search);
  await page.getByLabel("New password").fill("a-Long-Enough-Passphrase-1");
  await page
    .getByLabel("Repeat the password")
    .fill("a-Long-Enough-Passphrase-1");
  await page.getByRole("button", { name: "Save password" }).click();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("kim@newhaul.test");
  await page.getByLabel("Password").fill("a-Long-Enough-Passphrase-1");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/tenders$/);
  await expect(page.getByRole("link", { name: "Brugere" })).toHaveCount(0);
});

test("only an administrator can open the user screen", async ({ page }) => {
  await signInAs(page, "dana@bluefjord.test");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/tenders$/);
});

test("staff import a shipment basis from the express workbook", async ({
  page,
}) => {
  await createOpenTender(page, "Basis import 2027");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("DK-SE");
  sheet.getCell("B14").value = "0-1 kg";
  sheet.getCell("E14").value = 250;
  sheet.getCell("J14").value = 0.25;
  const file = Buffer.from(await workbook.xlsx.writeBuffer());
  await page.locator('input[type="file"][hidden]').setInputFiles({
    name: "volumes.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: file,
  });
  await expect(page.getByText(/Grundlag hentet fra Excel/)).toBeVisible();
  await page.getByLabel("Land").selectOption("SE");
  await expect(page.getByLabel("SE 0-1 kg Antal forsendelser")).toHaveValue(
    "250",
  );
  await expect(page.getByLabel("SE 0-1 kg % Economy")).toHaveValue("25");
});
