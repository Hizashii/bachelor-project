// This file turns the carrier's own offer state into one plain sentence.
import type { CarrierTender } from "@freight-desk/shared";
import type { Locale } from "../i18n";
import { formatDay } from "./format";
import { carrierText } from "./text";

export function offerSummary(tender: CarrierTender, locale: Locale): string {
  const copy = carrierText[locale];
  const { submission } = tender;
  if (submission.state === "none") return copy.offerNone;
  if (submission.state === "draft") return copy.offerDraft;
  return copy.offerSubmitted
    .replace("{version}", String(submission.versionNumber))
    .replace(
      "{date}",
      formatDay(submission.submittedAtUtc, tender.customerTimeZone, locale),
    );
}
