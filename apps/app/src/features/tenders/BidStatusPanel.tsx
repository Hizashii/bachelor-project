// Shows staff which invited carriers have sent a bid, updating on its own.
// Only who and when are shown; prices stay sealed until the tender closes.

import type { Locale } from "../../i18n";
import { getCopy } from "../../i18n";
import type { TenderRecord } from "./tenderTypes";
import { useBidStatus } from "./useBidStatus";

type Props = {
  locale: Locale;
  record: TenderRecord;
  carrierNames: Record<string, string>;
};

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

function remaining(
  deadlineUtc: string,
  copy: ReturnType<typeof getCopy>,
): string {
  const minutes = Math.floor(
    (Date.parse(deadlineUtc) - Date.now()) / MS_PER_MINUTE,
  );
  if (minutes < 0) return copy.deadlinePassed;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  return `${hours} ${copy.hoursShort} ${minutes % MINUTES_PER_HOUR} ${copy.minutesShort}`;
}

export function BidStatusPanel({ locale, record, carrierNames }: Props) {
  const copy = getCopy(locale);
  const { status, updatedAt } = useBidStatus(record.tender.id, true);
  const deadline = record.tender.deadlineUtc;
  const time = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString(locale) : "";

  return (
    <section
      className="white-card tender-workflow-card"
      aria-labelledby="bid-status-title"
    >
      <h2 id="bid-status-title">{copy.bidStatusTitle}</h2>
      {deadline ? (
        <p>
          {copy.deadline}: {new Date(deadline).toLocaleString(locale)}
          {` · ${remaining(deadline, copy)}`}
        </p>
      ) : null}
      <ul className="bid-status-list">
        {record.tender.invitedCarrierCompanyIds.map((id) => {
          const bid = status.find((item) => item.carrierCompanyId === id);
          return (
            <li key={id}>
              <span>{carrierNames[id] ?? id}</span>
              <span className={bid ? "bid-sent" : "bid-waiting"}>
                {bid
                  ? `${copy.bidSubmitted} v${bid.versionNumber} · ${time(bid.submittedAtUtc)}`
                  : copy.bidNotSubmitted}
              </span>
            </li>
          );
        })}
      </ul>
      {updatedAt ? (
        <small>
          {copy.bidUpdated} {updatedAt.toLocaleTimeString(locale)}
        </small>
      ) : null}
    </section>
  );
}
