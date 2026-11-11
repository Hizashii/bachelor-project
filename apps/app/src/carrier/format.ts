// This file formats dates for the carrier screens in the tender's own time zone, with the offset.
import type { Locale } from "../i18n";

const LOCALE_TAG: Record<Locale, string> = { da: "da-DK", en: "en-GB" };

export function formatDeadline(
  utc: string,
  timeZone: string,
  locale: Locale,
): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    dateStyle: "long",
    timeStyle: "short",
    timeZone,
    timeZoneName: "shortOffset",
  }).format(new Date(utc));
}

export function formatDay(utc: string, timeZone: string, locale: Locale) {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    dateStyle: "medium",
    timeZone,
  }).format(new Date(utc));
}
