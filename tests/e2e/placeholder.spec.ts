import { expect, test } from "@playwright/test";

test("a consultant can compare and select a carrier", async ({ page }) => {
  await page.goto("/compare");

  await expect(
    page.getByRole("heading", { name: "Hvem skal køre denne forsendelse?" }),
  ).toBeVisible();
  await expect(page.getByText("Transportør A", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Se sandsynlighed" }).click();
  await expect(page.getByRole("status")).toContainText("148");

  await page.getByRole("button", { name: "Vælg" }).first().click();
  await expect(
    page.getByText("Transportør A er valgt til denne forsendelse.", {
      exact: true,
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "EN" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Which carrier should take this shipment?",
    }),
  ).toBeVisible();
});

test("a carrier can edit zones, prices and save the portal draft", async ({
  page,
}) => {
  await page.goto("/carriers");

  await expect(
    page.getByRole("heading", { name: "Læg dine zoner og priser ind" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Pr. palle" }).click();
  await expect(page.getByRole("button", { name: "Pr. palle" })).toHaveClass(
    /active/,
  );

  await page.getByLabel("Fra (2 cifre) 1").fill("70");
  await expect(page.getByText("Tjek zonerne", { exact: false })).toBeVisible();
  await page.getByLabel("Fra (2 cifre) 1").fill("00");
  await expect(
    page.getByText("Alle forsendelser har fået en zone", { exact: false }),
  ).toBeVisible();

  await page.getByRole("button", { name: "+ Tilføj række" }).click();
  await expect(page.getByLabel("Zone 9")).toBeVisible();

  await page.getByLabel("1 til 50 Zone 1").fill("125,00");
  await page.locator("#carrier-excel").setInputFiles({
    name: "transportor-priser.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("sample"),
  });
  await expect(
    page.getByText("Uploadet fil: transportor-priser.xlsx"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Gem ændringer" }).click();
  await expect(
    page.getByText("Ændringer gemt", { exact: false }),
  ).toBeVisible();
});
