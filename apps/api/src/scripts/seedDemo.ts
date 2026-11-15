import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PricingMethod, Tariff } from "@freight-desk/shared";
import ExcelJS from "exceljs";
import { hashPassword } from "../auth/password.ts";
import { type AccessContext, permissions } from "../auth/permissions.ts";
import {
  CONSULTANCY_ORGANISATION_ID,
  workflowPrincipalOf,
} from "../auth/principal.ts";
import { loadApiEnvironment } from "../config/env.ts";
import { Accounts } from "../db/accounts.ts";
import { CredentialStore } from "../db/credentials.ts";
import { applyMigrations } from "../db/migrate.ts";
import { createDatabase, verifyDatabase } from "../db/pool.ts";
import { Documents } from "../storage/documents.ts";
import {
  LocalStorageAdapter,
  resolveLocalStorageRoot,
} from "../storage/localStorage.ts";
import type { StorageDestination } from "../storage/types.ts";
import { TariffService } from "../tariffs/service.ts";

const DEMO_PASSWORDS = {
  staff: "Demo-Staff-2026!",
  northline: "Demo-Northline-2026!",
  sydfragt: "Demo-Sydfragt-2026!",
  baltic: "Demo-Baltic-2026!",
} as const;

const DEMO_WORKBOOK = "[DEMO DATASET] sample-shipments.xlsx";
const DEMO_INVOICE = "[DEMO DATASET] sample-invoice.json";
const masterContext = (userId: string): AccessContext => ({
  userId,
  organisationId: CONSULTANCY_ORGANISATION_ID,
  role: "master",
});

type DemoUser = {
  email: string;
  displayName: string;
  password: string;
  role: "master" | "carrier";
  carrierId?: string;
};

async function ensureCarrier(
  accounts: Accounts,
  displayName: string,
): Promise<string> {
  const found = (await accounts.listCarriers()).find(
    (carrier) => carrier.displayName === displayName,
  );
  return (
    found?.id ?? (await accounts.createCarrier(displayName, displayName)).id
  );
}

async function ensureUser(
  accounts: Accounts,
  credentials: CredentialStore,
  input: DemoUser,
): Promise<string> {
  const existing = (await accounts.listUsers()).find(
    (user) => user.email.toLowerCase() === input.email.toLowerCase(),
  );
  if (existing) return existing.id;
  const created = await accounts.createUser({
    email: input.email,
    displayName: input.displayName,
    role: input.role,
    carrierId: input.carrierId,
  });
  await credentials.setPassword(created.id, await hashPassword(input.password));
  return created.id;
}

function makeTariff(
  tariffId: string,
  carrierOrganisationId: string,
  method: PricingMethod,
  zones: Tariff["zones"],
  brackets: Tariff["brackets"],
  amounts: number[],
  userId: string,
): Tariff {
  const now = new Date().toISOString();
  return {
    tariffId,
    version: 1,
    carrierOrganisationId,
    status: "draft",
    currency: "DKK",
    method,
    postcodeLength: 2,
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
    zones,
    brackets,
    rates: zones.flatMap((zone, zoneIndex) =>
      brackets.map((_, bracketIndex) => ({
        zoneId: zone.id,
        bracketIndex,
        amountMinor:
          amounts[zoneIndex * brackets.length + bracketIndex] ?? null,
      })),
    ),
    quantityStep: null,
    minimumChargeMinor: null,
    roundingStepMinor: 1,
    discounts: [],
    surcharges: [],
    restrictions: {
      maxWeightKg: null,
      maxPallets: null,
      maxLoadingMeters: null,
      maxCubicMeters: null,
      originRanges: [],
    },
    sourceFile: "[DEMO DATASET] seed",
    createdAt: now,
    createdBy: userId,
    submittedAt: null,
    approvedAt: null,
    approvedBy: null,
  };
}

async function ensureActiveTariff(
  tariffs: TariffService,
  context: AccessContext,
  tariff: Tariff,
): Promise<void> {
  const versions = await tariffs.listVersions(
    context,
    tariff.carrierOrganisationId,
    tariff.tariffId,
  );
  if (versions.some((version) => version.status === "active")) return;
  const current = versions.find((version) =>
    ["draft", "submitted", "approved"].includes(version.status),
  );
  const saved = current
    ? { tariff: current }
    : await tariffs.saveDraft(context, tariff);
  if (saved.tariff.status === "draft") {
    await tariffs.submit(context, saved.tariff);
  }
  const submitted = await tariffs.get(
    context,
    tariff.carrierOrganisationId,
    tariff.tariffId,
    tariff.version,
  );
  if (!submitted)
    throw new Error(`Demo tariff ${tariff.tariffId} was not saved.`);
  const approved =
    submitted.tariff.status === "submitted"
      ? await tariffs.approve(context, submitted.tariff)
      : submitted.tariff;
  if (approved.status === "approved")
    await tariffs.activateVersion(context, approved);
}

async function writeDemoWorkbook(path: string): Promise<void> {
  try {
    await access(path);
    return;
  } catch {
    await mkdir(dirname(path), { recursive: true });
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("DEMO DATASET - Shipments");
  sheet.addRow([
    "Reference",
    "Origin postcode",
    "Destination postcode",
    "Collection date",
    "Weight kg",
    "Pallets",
    "Packages",
  ]);
  sheet.addRows([
    ["DEMO-1001", "2100", "8000", "2026-11-16", 420, 2, 12],
    ["DEMO-1002", "2600", "8200", "2026-11-17", 900, 4, 28],
    ["DEMO-1003", "5000", "2650", "2026-11-18", 180, 1, 6],
    ["DEMO-1004", "8000", "2900", "2026-11-19", 65, 1, 3],
  ]);
  await workbook.xlsx.writeFile(path);
}

async function uploadIfMissing(
  documents: Documents,
  storage: LocalStorageAdapter,
  context: AccessContext,
  destination: StorageDestination,
  name: string,
  path: string,
  contentType: string,
): Promise<void> {
  const files = await storage.listFiles(workflowPrincipalOf(context), {
    destination,
    cursor: undefined,
    pageSize: 100,
  });
  if (files.items.some((file) => file.name === name)) return;
  await documents.putFile(context, destination, name, path, contentType);
}

async function seed(): Promise<void> {
  const environment = loadApiEnvironment();
  if (environment.STORAGE_MODE !== "local") {
    throw new Error("The demo dataset requires STORAGE_MODE=local.");
  }
  const database = createDatabase(environment.DATABASE_URL);
  try {
    await applyMigrations(database);
    await verifyDatabase(database);
    const accounts = new Accounts(database);
    const credentials = new CredentialStore(database);
    const carrierIds = {
      northline: await ensureCarrier(accounts, "DEMO Northline Transport ApS"),
      sydfragt: await ensureCarrier(accounts, "DEMO Sydfragt Logistics ApS"),
      baltic: await ensureCarrier(accounts, "DEMO Baltic Road Cargo ApS"),
    };
    const staffId = await ensureUser(accounts, credentials, {
      email: "demo.staff@freight.local",
      displayName: "DEMO S&A Operations",
      password: DEMO_PASSWORDS.staff,
      role: "master",
    });
    await ensureUser(accounts, credentials, {
      email: "demo.northline@freight.local",
      displayName: "DEMO Northline Pricing",
      password: DEMO_PASSWORDS.northline,
      role: "carrier",
      carrierId: carrierIds.northline,
    });
    await ensureUser(accounts, credentials, {
      email: "demo.sydfragt@freight.local",
      displayName: "DEMO Sydfragt Pricing",
      password: DEMO_PASSWORDS.sydfragt,
      role: "carrier",
      carrierId: carrierIds.sydfragt,
    });
    await ensureUser(accounts, credentials, {
      email: "demo.baltic@freight.local",
      displayName: "DEMO Baltic Pricing",
      password: DEMO_PASSWORDS.baltic,
      role: "carrier",
      carrierId: carrierIds.baltic,
    });
    const context = masterContext(staffId);
    const storage = new LocalStorageAdapter(
      resolveLocalStorageRoot(environment.LOCAL_STORAGE_DIR),
    );
    await storage.ensureInitialFolders();
    const documents = new Documents(storage);
    const tariffs = new TariffService({ documents, permissions });
    await ensureActiveTariff(
      tariffs,
      context,
      makeTariff(
        "demo-northline",
        carrierIds.northline,
        "per_100kg",
        [
          {
            id: "copenhagen",
            name: "DEMO Copenhagen",
            ranges: [{ from: "10", to: "29" }],
          },
          {
            id: "jutland",
            name: "DEMO Jutland",
            ranges: [{ from: "80", to: "89" }],
          },
        ],
        [
          { from: 0, to: 500 },
          { from: 500, to: null },
        ],
        [12500, 17500, 14500, 20500],
        staffId,
      ),
    );
    await ensureActiveTariff(
      tariffs,
      context,
      makeTariff(
        "demo-sydfragt",
        carrierIds.sydfragt,
        "per_shipment",
        [
          {
            id: "copenhagen",
            name: "DEMO Copenhagen",
            ranges: [{ from: "10", to: "29" }],
          },
          {
            id: "jutland",
            name: "DEMO Jutland",
            ranges: [{ from: "80", to: "89" }],
          },
        ],
        [{ from: 0, to: null }],
        [9900, 11900],
        staffId,
      ),
    );
    await ensureActiveTariff(
      tariffs,
      context,
      makeTariff(
        "demo-baltic",
        carrierIds.baltic,
        "per_pallet",
        [
          {
            id: "copenhagen",
            name: "DEMO Copenhagen",
            ranges: [{ from: "10", to: "29" }],
          },
          {
            id: "jutland",
            name: "DEMO Jutland",
            ranges: [{ from: "80", to: "89" }],
          },
        ],
        [
          { from: 0, to: 2 },
          { from: 2, to: null },
        ],
        [8500, 14000, 9500, 15500],
        staffId,
      ),
    );
    const demoDirectory = join(process.cwd(), "data", "demo");
    const workbookPath = join(demoDirectory, DEMO_WORKBOOK);
    await writeDemoWorkbook(workbookPath);
    await uploadIfMissing(
      documents,
      storage,
      context,
      { kind: "inbound-shipments" },
      DEMO_WORKBOOK,
      workbookPath,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const invoicePath = join(demoDirectory, DEMO_INVOICE);
    await mkdir(demoDirectory, { recursive: true });
    const invoice = {
      label: "DEMO DATASET",
      invoiceNumber: "DEMO-INV-1001",
      carrier: "DEMO Northline Transport ApS",
      amountMinor: 125000,
      currency: "DKK",
      status: "sample",
    };
    await writeFile(invoicePath, JSON.stringify(invoice, null, 2), "utf8");
    await uploadIfMissing(
      documents,
      storage,
      context,
      { kind: "inbound-invoices" },
      DEMO_INVOICE,
      invoicePath,
      "application/json",
    );
    console.log("DEMO DATASET ready.");
    console.log(
      `Staff login: demo.staff@freight.local / ${DEMO_PASSWORDS.staff}`,
    );
    console.log(
      `Carrier logins: demo.northline@freight.local / ${DEMO_PASSWORDS.northline}`,
    );
    console.log(`Demo workbook: ${workbookPath}`);
  } finally {
    await database.end();
  }
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
