// This file answers: may a carrier still change or send an offer for this tender?
// It reads the stored UTC deadline and the server clock, never a browser time.
// An open tender found past its deadline is closed here first, so no job has to run in time.

import type { Tender } from "@freight-desk/shared";
import type { AppDeps } from "../deps.ts";
import { AppError } from "../errors.ts";
import { loadTender } from "../tenders/repository.ts";
import { closeTender, isPastDeadline, SYSTEM_ACTOR } from "./closing.ts";

export async function assertTenderAcceptsBids(
  deps: AppDeps,
  tenderId: string,
): Promise<Tender> {
  const file = await loadTender(deps.store, tenderId);
  if (!file) throw new AppError("NOT_FOUND", "That tender was not found.");
  const tender = file.data;
  if (tender.status !== "open") {
    throw new AppError(
      "TENDER_NOT_OPEN",
      "This tender is not open for offers.",
    );
  }
  if (isPastDeadline(deps, tender)) {
    await closeTender(deps, tenderId, SYSTEM_ACTOR);
    throw new AppError("DEADLINE_PASSED", "The deadline has passed.");
  }
  return tender;
}
