// This file is the ONLY way consultant-side code may read submitted bids.
// For now it refuses everything (fail closed); the sealed-bid feature replaces the body.

import type { BidVersion, Principal } from "@freight-desk/shared";
import type { AppDeps } from "../deps.ts";
import { AppError } from "../errors.ts";

export async function readSubmittedBids(
  _deps: AppDeps,
  _principal: Principal,
  _tenderId: string,
): Promise<BidVersion[]> {
  throw new AppError(
    "BID_SEALED",
    "Offers are sealed until the tender is opened.",
  );
}
