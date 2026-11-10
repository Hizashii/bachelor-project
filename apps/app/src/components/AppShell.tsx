import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router";
import type { SafeUserProfile } from "../auth/auth";
import type { Locale } from "../i18n";
import { getCopy } from "../i18n";

type AppShellProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  user: SafeUserProfile;
  onLogout: () => Promise<void>;
  children: ReactNode;
};

export function AppShell({
  locale,
  onLocaleChange,
  user,
  onLogout,
  children,
}: AppShellProps) {
  const copy = getCopy(locale);
  const isCarrierPortal = useLocation().pathname === "/carriers";
  const homePath = user.role === "carrier" ? "/carriers" : "/compare";

  return (
    <div className="app-shell">
      <header className={`topbar ${isCarrierPortal ? "portal-topbar" : ""}`}>
        <NavLink className="brand" to={homePath} aria-label="Freight Desk home">
          Slinkert &amp; Aarøe
        </NavLink>
        {isCarrierPortal ? (
          <span className="portal-title">{copy.portalTitle}</span>
        ) : (
          <PrimaryNav copy={copy} role={user.role} />
        )}
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
        <div className="session-label">
          <span>
            {copy.loggedInAs} {user.displayName} · {user.role}
          </span>
          <button
            className="session-link"
            type="button"
            onClick={() => void onLogout()}
          >
            {copy.logOut}
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

function PrimaryNav({
  copy,
  role,
}: {
  copy: ReturnType<typeof getCopy>;
  role: SafeUserProfile["role"];
}) {
  return (
    <nav className="primary-nav" aria-label="Primary navigation">
      <span className="nav-link nav-link-muted">{copy.overview}</span>
      <span className="nav-link nav-link-muted">{copy.upload}</span>
      {role !== "carrier" ? (
        <NavLink className="nav-link" to="/compare">
          {copy.compare}
        </NavLink>
      ) : null}
      <span className="nav-link nav-link-muted">{copy.invoices}</span>
      <span className="nav-link nav-link-muted">{copy.calculator}</span>
      <NavLink className="nav-link" to="/carriers">
        {copy.carriers}
      </NavLink>
    </nav>
  );
}
