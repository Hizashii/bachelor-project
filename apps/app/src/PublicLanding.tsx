import { NavLink } from "react-router";
import type { Locale } from "./i18n";
import { getCopy } from "./i18n";

type PublicLandingProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  authUnavailable?: boolean;
};

export function PublicLanding({
  locale,
  onLocaleChange,
  authUnavailable = false,
}: PublicLandingProps) {
  const copy = getCopy(locale);
  return (
    <div className="public-site">
      <PublicHeader
        copy={copy}
        locale={locale}
        onLocaleChange={onLocaleChange}
      />
      <main>
        <section className="public-hero">
          <div className="public-hero-copy">
            <h1>{copy.publicTitle}</h1>
            <p className="public-lede">{copy.publicSubtitle}</p>
            <div className="public-actions">
              <NavLink className="button public-button-primary" to="/login">
                {copy.publicSignIn}
              </NavLink>
              <span>{copy.publicAudience}</span>
            </div>
            {authUnavailable ? (
              <p className="public-service-note" role="status">
                {copy.publicAuthUnavailable}
              </p>
            ) : null}
          </div>
          <WorkspacePreview copy={copy} />
        </section>
        <section
          className="public-capabilities"
          aria-label={copy.publicWorkspacePreview}
        >
          <Capability
            title={copy.publicTenders}
            text={copy.publicTendersText}
          />
          <Capability
            title={copy.publicCompare}
            text={copy.publicCompareText}
          />
          <Capability title={copy.publicFiles} text={copy.publicFilesText} />
        </section>
      </main>
      <footer className="public-footer">
        <span>Freight Desk</span>
        <span>{copy.publicAudience}</span>
      </footer>
    </div>
  );
}

function PublicHeader({
  copy,
  locale,
  onLocaleChange,
}: {
  copy: ReturnType<typeof getCopy>;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  return (
    <header className="public-header">
      <NavLink className="public-brand" to="/" aria-label="Freight Desk home">
        <span>Freight Desk</span>
        <small>Slinkert &amp; Aarøe</small>
      </NavLink>
      <div className="public-header-actions">
        <fieldset className="language-switch public-language">
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
        <NavLink className="public-sign-in" to="/login">
          {copy.publicSignIn}
        </NavLink>
      </div>
    </header>
  );
}

function WorkspacePreview({ copy }: { copy: ReturnType<typeof getCopy> }) {
  return (
    <div className="public-preview">
      <div className="public-preview-topline">
        <span>Freight Desk</span>
        <span>{copy.publicWorkspacePreview}</span>
      </div>
      <div className="public-preview-body">
        <div className="public-preview-nav">
          <span className="selected">{copy.publicTenders}</span>
          <span>{copy.publicCompare}</span>
          <span>{copy.publicFiles}</span>
        </div>
        <div className="public-preview-panel">
          <div className="public-preview-heading">
            <div>
              <span className="public-preview-label">
                {copy.publicWorkspacePreview}
              </span>
              <h2>{copy.publicTenders}</h2>
            </div>
            <span className="public-preview-line" />
          </div>
          <div className="public-empty-preview">
            <span className="public-empty-mark">FD</span>
            <strong>{copy.publicPreviewEmpty}</strong>
            <p>{copy.publicPreviewEmptyText}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Capability({ title, text }: { title: string; text: string }) {
  return (
    <article className="public-capability">
      <span className="public-capability-rule" aria-hidden="true" />
      <h2>{title}</h2>
      <p>{text}</p>
    </article>
  );
}
