// This file provides the product header, demo indicator and user controls.

type TopHeaderProps = {
  onMenuOpen: () => void;
};

export function TopHeader({ onMenuOpen }: TopHeaderProps) {
  return (
    <header className="top-header">
      <button
        className="menu-button"
        type="button"
        onClick={onMenuOpen}
        aria-label="Open navigation"
      >
        <span />
        <span />
        <span />
      </button>
      <div className="breadcrumbs">
        <span>Workspace</span>
        <span className="breadcrumb-divider">/</span>
        <strong>Overview</strong>
      </div>
      <div className="header-actions">
        <span className="demo-pill">
          <span className="demo-dot" /> Demo data
        </span>
        <button className="icon-button" type="button" aria-label="Notifications">
          <span className="notification-icon" aria-hidden="true">
            ♧
          </span>
          <span className="notification-dot" />
        </button>
        <div className="user-menu">
          <span className="user-avatar">JK</span>
          <span className="user-details">
            <strong>Julia K.</strong>
            <small>Consultant</small>
          </span>
          <span className="chevron" aria-hidden="true">
            ⌄
          </span>
        </div>
      </div>
    </header>
  );
}
