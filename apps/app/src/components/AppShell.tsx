import type { ReactNode } from "react";
import { NavLink } from "react-router";
import type { Locale } from "../i18n";
import { getCopy } from "../i18n";

type AppShellProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  children: ReactNode;
};

export function AppShell({ locale, onLocaleChange, children }: AppShellProps) {
  const copy = getCopy(locale);

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink className="brand" to="/compare" aria-label="Freight Desk home">
          Slinkert &amp; Aarøe
        </NavLink>
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
        </nav>
        <fieldset className="language-switch">
          <legend className="sr-only">{copy.language}</legend>
          <button
            className={locale === "da" ? "language active" : "language"}
            type="button"
            onClick={() => onLocaleChange("da")}
          >
            DA
          </button>
          <button
            className={locale === "en" ? "language active" : "language"}
            type="button"
            onClick={() => onLocaleChange("en")}
          >
            EN
          </button>
        </fieldset>
      </header>
      <main>{children}</main>
    </div>
  );
}
