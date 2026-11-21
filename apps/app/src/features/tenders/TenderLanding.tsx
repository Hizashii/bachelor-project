// Role-aware tender landing state. It does not create or fetch tender data.

import { NavLink } from "react-router";
import type { UserRole } from "../../auth/auth";
import { EmptyState, PageHeader } from "../../components/OperationalUI";
import type { Locale } from "../../i18n";
import { getCopy } from "../../i18n";
import "../operational.css";

type TenderLandingProps = { locale: Locale; role: UserRole };

export function TenderLanding({ locale, role }: TenderLandingProps) {
  const copy = getCopy(locale);
  const carrier = role === "carrier";

  return (
    <div className="screen tenders-screen">
      <PageHeader
        title={carrier ? copy.invitedTendersTitle : copy.tendersTitle}
        description={
          carrier ? copy.invitedTendersSubtitle : copy.tendersSubtitle
        }
      />
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
    <EmptyState
      title={carrier ? copy.invitedTendersEmptyTitle : copy.tendersEmptyTitle}
      description={
        carrier ? copy.invitedTendersEmptyText : copy.tendersEmptyText
      }
      labelledBy="tenders-empty-title"
    />
  );
}

function SupportingTools({ copy }: { copy: ReturnType<typeof getCopy> }) {
  return (
    <section className="tender-support" aria-labelledby="tender-support-title">
      <div>
        <h2 id="tender-support-title">{copy.tenderSupportTitle}</h2>
        <p>{copy.tenderSupportText}</p>
      </div>
      <nav
        className="tender-support-links"
        aria-label={copy.tenderSupportTitle}
      >
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
