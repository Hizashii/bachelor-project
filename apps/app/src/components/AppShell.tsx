import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router";
import type { Locale } from "../i18n";
import { getCopy } from "../i18n";

type AppShellProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  children?: ReactNode;
};

export function AppShell({ locale, onLocaleChange, children }: AppShellProps) {
  const copy = getCopy(locale);
  const pathname = useLocation().pathname;
  const isCarrier = pathname.startsWith("/carriers");
  const isAdmin = pathname === "/admin/inbox";

  return (
    <div className="app-shell">
      <header className={`topbar ${isCarrier ? "portal-topbar" : ""}`}>
        <NavLink className="brand" to="/compare" aria-label="Freight Desk home">
          Slinkert &amp; Aarøe
        </NavLink>
        {isCarrier ? (
          <span className="portal-title">{copy.portalTitle}</span>
        ) : isAdmin ? (
          <span className="admin-badge">{copy.adminBadge}</span>
        ) : (
          <PrimaryNav copy={copy} />
        )}
        <LanguageSwitch copy={copy} locale={locale} onChange={onLocaleChange} />
        {isCarrier ? (
          <div className="session-label">
            <span>{copy.loggedInAs} Transportør A</span>
            <button className="session-link" type="button">
              {copy.logOut}
            </button>
          </div>
        ) : null}
      </header>
      <main>{children}</main>
    </div>
  );
}

function LanguageSwitch({
  copy,
  locale,
  onChange,
}: {
  copy: ReturnType<typeof getCopy>;
  locale: Locale;
  onChange: (locale: Locale) => void;
}) {
  return (
    <fieldset className="language-switch">
      <legend className="sr-only">{copy.language}</legend>
      <button
        className={locale === "da" ? "language active" : "language"}
        type="button"
        onClick={() => onChange("da")}
      >
        DA
      </button>
      <button
        className={locale === "en" ? "language active" : "language"}
        type="button"
        onClick={() => onChange("en")}
      >
        EN
      </button>
    </fieldset>
  );
}

function PrimaryNav({ copy }: { copy: ReturnType<typeof getCopy> }) {
  return (
    <nav className="primary-nav" aria-label="Primary navigation">
      <span className="nav-link nav-link-muted">{copy.overview}</span>
      <span className="nav-link nav-link-muted">{copy.upload}</span>
      <NavLink className="nav-link" to="/compare">
        {copy.compare}
      </NavLink>
      <span className="nav-link nav-link-muted">{copy.invoices}</span>
      <span className="nav-link nav-link-muted">{copy.calculator}</span>
      <NavLink className="nav-link" to="/carriers">
        {copy.carriers}
      </NavLink>
      <NavLink className="nav-link" to="/admin/inbox">
        {copy.adminPrices}
      </NavLink>
    </nav>
  );
}
