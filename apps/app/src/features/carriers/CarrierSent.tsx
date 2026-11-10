import type { ReactElement } from "react";
import { Link } from "react-router";
import type { Locale } from "../../i18n";
import { getCopy } from "../../i18n";

export function CarrierSent({ locale }: { locale: Locale }): ReactElement {
  const copy = getCopy(locale);

  return (
    <div className="sent-screen">
      <div className="sent-check" aria-hidden="true">
        ✓
      </div>
      <section className="sent-copy">
        <h1>{copy.sentTitle}</h1>
        <p>{copy.sentSubtitle}</p>
        <small>{copy.sentEnglish}</small>
      </section>
      <div className="sent-actions">
        <Link className="button button-primary" to="/carriers">
          {copy.editPriceList}
        </Link>
        <Link className="button button-secondary" to="/compare">
          {copy.logOut}
        </Link>
      </div>
      <div className="security-banner">
        <span className="lock-icon" aria-hidden="true">
          ▣
        </span>
        <span>{copy.carrierSecurity}</span>
      </div>
      <div className="demo-link">
        <span>
          <b>DESIGN-DEMO.</b>{" "}
          {locale === "da"
            ? "Se, hvad administratoren ser."
            : "See what the administrator sees."}
        </span>
        <Link className="button button-gold" to="/admin/inbox">
          {copy.seeAdmin}
        </Link>
      </div>
    </div>
  );
}
