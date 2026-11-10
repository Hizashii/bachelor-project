// This file contains the primary navigation and its responsive mobile behavior.

import { NavLink } from "react-router";

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

const links = [
  { label: "Dashboard", path: "/", icon: "⌂" },
  { label: "Tenders", path: "/tenders", icon: "↗" },
  { label: "Companies", path: "/companies", icon: "◌" },
  { label: "Settings", path: "/settings", icon: "⚙" },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <>
      <div className={`sidebar-backdrop ${isOpen ? "is-visible" : ""}`} onClick={onClose} />
      <aside className={`sidebar ${isOpen ? "is-open" : ""}`}>
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            FD
          </div>
          <div>
            <span className="brand-name">Freight Desk</span>
            <span className="brand-caption">Tender workspace</span>
          </div>
          <button
            className="sidebar-close"
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
          >
            ×
          </button>
        </div>

        <div className="workspace-switcher">
          <span className="workspace-avatar">SA</span>
          <span>
            <strong>S&A Logistics</strong>
            <small>Consultancy workspace</small>
          </span>
          <span className="chevron" aria-hidden="true">
            ⌄
          </span>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          <span className="nav-section-label">Workspace</span>
          {links.map((link) => (
            <NavLink
              className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""}`}
              end={link.path === "/"}
              key={link.path}
              onClick={onClose}
              to={link.path}
            >
              <span className="nav-icon" aria-hidden="true">
                {link.icon}
              </span>
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="help-card">
            <span className="help-icon" aria-hidden="true">
              ?
            </span>
            <div>
              <strong>Need a hand?</strong>
              <span>Visit the help centre</span>
            </div>
            <span className="arrow" aria-hidden="true">
              ↗
            </span>
          </div>
          <p className="sidebar-version">Freight Desk · Demo workspace</p>
        </div>
      </aside>
    </>
  );
}
