// This file renders settings as a static shell until identity and persistence are connected.

import { PageHeader } from "../components/PageHeader.tsx";

export function SettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Workspace / Settings"
        title="Settings"
        description="Manage your workspace preferences and access configuration."
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <button className="settings-nav-item is-active" type="button">
            General
          </button>
          <button className="settings-nav-item" type="button">
            Notifications
          </button>
          <button className="settings-nav-item" type="button">
            Team access
          </button>
          <button className="settings-nav-item" type="button">
            Templates
          </button>
        </nav>
        <section className="panel settings-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">General preferences</p>
              <h2>Workspace details</h2>
            </div>
          </div>
          <div className="settings-form">
            <label>
              Workspace name
              <input value="S&A Logistics" readOnly />
            </label>
            <label>
              Default currency
              <select defaultValue="DKK">
                <option>DKK — Danish krone</option>
                <option>EUR — Euro</option>
              </select>
            </label>
            <label>
              Display time zone
              <select defaultValue="Europe/Copenhagen">
                <option>Europe/Copenhagen</option>
                <option>Europe/Stockholm</option>
              </select>
            </label>
            <div className="settings-divider" />
            <div className="settings-row">
              <div>
                <strong>Demo data mode</strong>
                <p>Fixture data is shown while the product is not connected to customer files.</p>
              </div>
              <span className="toggle is-on" aria-label="Demo data mode enabled">
                <span />
              </span>
            </div>
            <button className="button button-primary settings-save" type="button">
              Save changes
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
