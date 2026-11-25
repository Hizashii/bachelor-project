// Builds the freight services once, all on top of the same SharePoint storage.

import { permissions } from "../auth/permissions.ts";
import { ImportService } from "../imports/importService.ts";
import { ImportLibrary } from "../imports/library.ts";
import { Documents } from "../storage/documents.ts";
import type { StorageAdapter } from "../storage/types.ts";
import { BidService } from "../tenders/bidService.ts";
import { PricingService } from "../tariffs/pricing.ts";
import { TariffService } from "../tariffs/service.ts";
import { TenderService } from "../tenders/service.ts";
import type { FreightDependencies } from "./routes.ts";

export function createFreightServices(
  storage: StorageAdapter,
  listCarriers: FreightDependencies["listCarriers"],
): FreightDependencies {
  const documents = new Documents(storage);
  const imports = new ImportService({ documents, permissions });
  const tariffs = new TariffService({ documents, permissions });
  const tenders = new TenderService({ documents, permissions });
  const bids = new BidService({ documents, permissions, tenders });
  return {
    listCarriers,
    imports,
    library: new ImportLibrary(imports, documents),
    tariffs,
    tenders,
    bids,
    pricing: new PricingService({ tariffs, permissions }),
  };
}
