// Stores sealed carrier submissions as append-only tender documents.
// It does not reveal bids while a tender is still open.

import { randomUUID } from "node:crypto";
import {
  type BidVersion,
  bidVersionSchema,
  calculatePriceTemplate,
  type PriceTemplate,
  type PriceTemplateCalculation,
  type PriceTemplateShipment,
  type Tender,
} from "@freight-desk/shared";
import type { AccessContext, PermissionChecker } from "../auth/permissions.ts";
import type { Documents } from "../storage/documents.ts";
import {
  type PriceTemplateWorkbookInput,
  parsePriceTemplateWorkbook,
} from "./priceTemplateExcel.ts";
import type { SavedTender, TenderService } from "./service.ts";

export class BidAccessError extends Error {}
export class BidStateError extends Error {}

type Dependencies = {
  documents: Documents;
  permissions: PermissionChecker;
  tenders: TenderService;
};

type StoredBid = { bid: BidVersion; fileId: string };

export type TenderComparisonCandidate = {
  carrierCompanyId: string;
  bidVersionId: string;
  vendorName: string | null;
  result: PriceTemplateCalculation | null;
  error: string | null;
};

// Who has bid and when. It never carries prices, so it is safe while bids are sealed.
export type BidStatus = {
  carrierCompanyId: string;
  versionNumber: number;
  submittedAtUtc: string | null;
};

export type TenderComparison = {
  tenderId: string;
  currency: string;
  candidates: TenderComparisonCandidate[];
};

const BID_PREFIX = "bid-";
const BID_PATTERN = /^bid-([0-9a-f-]{36})-v(\d+)\.json$/i;

export class BidService {
  private readonly deps: Dependencies;

  constructor(deps: Dependencies) {
    this.deps = deps;
  }

  async submit(
    context: AccessContext,
    tenderId: string,
    workbook: PriceTemplateWorkbookInput,
  ): Promise<BidVersion> {
    // Check who is asking and whether bidding is open before reading the upload.
    this.allowBid(context);
    assertOpen((await this.deps.tenders.get(context, tenderId)).tender);
    const template = await parsePriceTemplateWorkbook(
      workbook,
      context.organisationId,
    );
    return this.submitTemplate(context, tenderId, template);
  }

  async submitTemplate(
    context: AccessContext,
    tenderId: string,
    template: PriceTemplate,
  ): Promise<BidVersion> {
    this.allowBid(context);
    const savedTender = await this.deps.tenders.get(context, tenderId);
    assertOpen(savedTender.tender);
    const latest = await this.latestForCarrier(context, tenderId);
    const bid = buildBid(
      context,
      savedTender,
      template,
      latest[0]?.bid ?? null,
    );
    await this.deps.documents.putJson(
      context,
      { kind: "tender", tenderId },
      `bid-${context.organisationId}-v${bid.versionNumber}.json`,
      bid,
    );
    return bid;
  }

  async status(context: AccessContext, tenderId: string): Promise<BidStatus[]> {
    await this.deps.tenders.get(context, tenderId);
    const bids =
      context.role === "carrier"
        ? (await this.latestForCarrier(context, tenderId)).map(
            (item) => item.bid,
          )
        : await this.readBids(context, tenderId);
    const latest = new Map<string, BidVersion>();
    for (const bid of bids) {
      const current = latest.get(bid.carrierCompanyId);
      if (!current || bid.versionNumber > current.versionNumber) {
        latest.set(bid.carrierCompanyId, bid);
      }
    }
    return [...latest.values()].map((bid) => ({
      carrierCompanyId: bid.carrierCompanyId,
      versionNumber: bid.versionNumber,
      submittedAtUtc: bid.submittedAtUtc,
    }));
  }

  async listSubmitted(
    context: AccessContext,
    tenderId: string,
  ): Promise<BidVersion[]> {
    const savedTender = await this.deps.tenders.get(context, tenderId);
    if (context.role === "carrier")
      throw new BidAccessError("Bids are sealed.");
    if (savedTender.tender.status === "open") {
      throw new BidStateError("Bids stay sealed until the tender is closed.");
    }
    const bids = await this.readBids(context, tenderId);
    const latest = new Map<string, BidVersion>();
    for (const bid of bids) {
      const current = latest.get(bid.carrierCompanyId);
      if (!current || bid.versionNumber > current.versionNumber) {
        latest.set(bid.carrierCompanyId, bid);
      }
    }
    return [...latest.values()];
  }

  async compare(
    context: AccessContext,
    tenderId: string,
    shipments: readonly PriceTemplateShipment[],
  ): Promise<TenderComparison> {
    const savedTender = await this.deps.tenders.get(context, tenderId);
    if (savedTender.tender.status === "open") {
      throw new BidStateError("Close the tender before comparing bids.");
    }
    const bids = await this.listSubmitted(context, tenderId);
    const candidates = bids.map((bid) =>
      compareBid(bid, shipments, savedTender.tender.currency),
    );
    candidates.sort(compareCandidates);
    return { tenderId, currency: savedTender.tender.currency, candidates };
  }

  private async latestForCarrier(
    context: AccessContext,
    tenderId: string,
  ): Promise<StoredBid[]> {
    const files = await this.deps.documents.list(
      context,
      { kind: "tender", tenderId },
      `bid-${context.organisationId}-v`,
    );
    const bids = await Promise.all(
      files.map(async (file) => ({
        bid: bidVersionSchema.parse(
          await this.deps.documents.readJson(context, file.id),
        ),
        fileId: file.id,
      })),
    );
    return bids.sort(
      (left, right) => right.bid.versionNumber - left.bid.versionNumber,
    );
  }

  private async readBids(
    context: AccessContext,
    tenderId: string,
  ): Promise<BidVersion[]> {
    const files = await this.deps.documents.list(
      context,
      { kind: "tender", tenderId },
      BID_PREFIX,
    );
    const bids: BidVersion[] = [];
    for (const file of files) {
      if (!BID_PATTERN.test(file.name)) continue;
      bids.push(
        bidVersionSchema.parse(
          await this.deps.documents.readJson(context, file.id),
        ),
      );
    }
    return bids;
  }

  private allowBid(context: AccessContext): void {
    if (
      context.role !== "carrier" ||
      !this.deps.permissions.can(context, "tender:bid", {
        organisationId: context.organisationId,
      })
    ) {
      throw new BidAccessError("Only an invited carrier can submit a bid.");
    }
  }
}

function assertOpen(tender: Tender): void {
  if (tender.status !== "open") {
    throw new BidStateError(
      "Bids can only be submitted while the tender is open.",
    );
  }
  if (tender.deadlineUtc && Date.parse(tender.deadlineUtc) <= Date.now()) {
    throw new BidStateError("The tender deadline has passed.");
  }
}

function buildBid(
  context: AccessContext,
  savedTender: SavedTender,
  priceTemplate: PriceTemplate,
  previous: BidVersion | null,
): BidVersion {
  const versionNumber = (previous?.versionNumber ?? 0) + 1;
  return bidVersionSchema.parse({
    id: randomUUID(),
    tenderId: savedTender.tender.id,
    carrierCompanyId: context.organisationId,
    createdByUserId: context.userId,
    versionNumber,
    state: "submitted",
    rates: [],
    surcharges: [],
    serviceCoverage: {
      countryCodes: priceTemplate.countries.map(
        (country) => country.countryCode,
      ),
      zoneIds: [],
      notes: "Express price template",
    },
    createdAtUtc: new Date().toISOString(),
    submittedAtUtc: new Date().toISOString(),
    supersedesVersionId: previous?.id ?? null,
    withdrawnAtUtc: null,
    sourceTemplate: savedTender.tender.carrierRateTemplate,
    priceTemplate,
  });
}

function compareBid(
  bid: BidVersion,
  shipments: readonly PriceTemplateShipment[],
  currency: string,
): TenderComparisonCandidate {
  const template = bid.priceTemplate;
  if (!template) return unpricedBid(bid, "The bid has no price template.");
  if (template.currency !== currency) {
    return unpricedBid(bid, "The bid uses a different currency.");
  }
  try {
    return {
      carrierCompanyId: bid.carrierCompanyId,
      bidVersionId: bid.id,
      vendorName: template.vendorName,
      result: calculatePriceTemplate(template, shipments),
      error: null,
    };
  } catch (error) {
    return unpricedBid(bid, errorMessage(error));
  }
}

function unpricedBid(
  bid: BidVersion,
  error: string,
): TenderComparisonCandidate {
  return {
    carrierCompanyId: bid.carrierCompanyId,
    bidVersionId: bid.id,
    vendorName: bid.priceTemplate?.vendorName ?? null,
    result: null,
    error,
  };
}

function compareCandidates(
  left: TenderComparisonCandidate,
  right: TenderComparisonCandidate,
): number {
  if (!left.result && !right.result) {
    return left.carrierCompanyId.localeCompare(right.carrierCompanyId);
  }
  if (!left.result) return 1;
  if (!right.result) return -1;
  return left.result.totalMinor - right.result.totalMinor;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The bid could not be calculated.";
}
