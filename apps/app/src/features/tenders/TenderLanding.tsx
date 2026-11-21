// Role-aware tender landing state. It does not create or fetch tender data.

import { NavLink } from "react-router";
import type { UserRole } from "../../auth/auth";
import type { Locale } from "../../i18n";
import { getCopy } from "../../i18n";

type TenderLandingProps = { locale: Locale; role: UserRole };

export function TenderLanding({ locale, role }: TenderLandingProps) {
  const copy = getCopy(locale);
  const carrier = role === "carrier";

  return (
    <div className="screen tenders-screen">
      <section className="page-heading">
        <p className="eyebrow">{copy.tendersEyebrow}</p>
        <h1>{carrier ? copy.invitedTendersTitle : copy.tendersTitle}</h1>
        <p className="lede">
          {carrier ? copy.invitedTendersSubtitle : copy.tendersSubtitle}
        </p>
      </section>
      <EmptyTenderState copy={copy} carrier={carrier} />
      {!carrier ? <SupportingTools copy={copy} /> : null}
    </div>
  );
}

function EmptyTenderState({
  copy,
  carrier,
}: {
  copy: ReturnType<typeof getCopy>;
  carrier: boolean;
}) {
  return (
    <section className="tender-empty-state" aria-labelledby="tenders-empty-title">
      <span className="empty-state-marker" aria-hidden="true" />
      <div>
        <p className="eyebrow">{copy.tendersEmptyEyebrow}</p>
        <h2 id="tenders-empty-title">
          {carrier ? copy.invitedTendersEmptyTitle : copy.tendersEmptyTitle}
        </h2>
        <p>
          {carrier ? copy.invitedTendersEmptyText : copy.tendersEmptyText}
        </p>
      </div>
    </section>
  );
}

function SupportingTools({ copy }: { copy: ReturnType<typeof getCopy> }) {
  return (
    <section className="tender-support" aria-labelledby="tender-support-title">
      <div>
        <p className="eyebrow">{copy.tenderSupportEyebrow}</p>
        <h2 id="tender-support-title">{copy.tenderSupportTitle}</h2>
        <p>{copy.tenderSupportText}</p>
      </div>
      <nav className="tender-support-links" aria-label={copy.tenderSupportTitle}>
        <NavLink className="button button-secondary" to="/upload">
          {copy.upload}
        </NavLink>
        <NavLink className="button button-secondary" to="/compare">
          {copy.compare}
        </NavLink>
        <NavLink className="button button-secondary" to="/files">
          {copy.files}
        </NavLink>
      </nav>
    </section>
  );
}
