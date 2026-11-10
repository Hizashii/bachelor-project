import { expect, test } from "@playwright/test";

test("a consultant can compare and select a carrier", async ({ page }) => {
  await page.route("**/api/feedback", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "sent" }),
    }),
  );
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

  await page.getByRole("button", { name: "Svar" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByLabel("Skriv en kort besked om tilbuddet eller næste skridt.")
    .fill("Kan I bekræfte levering tirsdag?");
  await page.getByRole("button", { name: "Send svar" }).click();
  await expect(
    page.getByText("Svar sendt til transportøren.", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "EN" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Which carrier should take this shipment?",
    }),
  ).toBeVisible();
});

test("a carrier can choose a road unit and submit a price list", async ({
  page,
}) => {
  await page.goto("/carriers");

  await expect(
    page.getByRole("heading", { name: "Læg dine zoner og priser ind" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Pr. palle (PLL)" }).click();
  await expect(
    page.getByRole("button", { name: "Pr. palle (PLL)" }),
  ).toHaveClass(/active/);

  await page.getByLabel("Fra (2 cifre) 1").fill("70");
  await expect(page.getByText("Tjek zonerne", { exact: false })).toBeVisible();
  await page.getByLabel("Fra (2 cifre) 1").fill("00");

  await page.getByRole("button", { name: "+ Tilføj række" }).click();
  await expect(page.getByLabel("Zone 9")).toBeVisible();
  await page.getByRole("button", { name: "Send prisliste" }).click();

  await expect(
    page.getByRole("heading", { name: "Tak. Din prisliste er sendt" }),
  ).toBeVisible();
});

test("an administrator sees submitted road price lists", async ({ page }) => {
  await page.goto("/admin/inbox");

  await expect(
    page.getByRole("heading", { name: "Indsendte prislister" }),
  ).toBeVisible();
  await expect(page.getByText("Transportør A", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download Excel" }).first(),
  ).toBeVisible();
});
