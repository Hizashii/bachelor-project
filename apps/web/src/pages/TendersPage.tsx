// This file renders the tender list using fictional demo workspace data.

import { useQuery } from "@tanstack/react-query";
import { loadWorkspaceDemo } from "../demo/data.ts";
import { PageHeader } from "../components/PageHeader.tsx";
import { StatePanel } from "../components/StatePanel.tsx";
import { StatusBadge } from "../components/StatusBadge.tsx";

export function TendersPage() {
  const workspace = useQuery({ queryKey: ["workspace-demo"], queryFn: loadWorkspaceDemo });

  if (workspace.isPending)
    return (
      <StatePanel
        tone="loading"
        title="Loading tenders"
        description="Preparing the demo tender list."
      />
    );
  if (workspace.isError)
    return (
      <StatePanel
        tone="error"
        title="Tenders unavailable"
        description="The demo tender list could not be loaded."
        actionLabel="Try again"
        onAction={() => void workspace.refetch()}
      />
    );

  return (
    <>
      <PageHeader
        eyebrow="Workspace / Tenders"
        title="Tenders"
        description="Prepare, track and compare freight tenders in one place."
        actions={
          <button className="button button-primary" type="button">
            Create tender <span aria-hidden="true">+</span>
          </button>
        }
      />
      <div className="toolbar">
        <div className="filter-tabs">
          <button className="filter-tab is-active" type="button">
            All tenders <span>12</span>
          </button>
          <button className="filter-tab" type="button">
            Open <span>8</span>
          </button>
          <button className="filter-tab" type="button">
            Drafts <span>3</span>
          </button>
          <button className="filter-tab" type="button">
            Closed <span>1</span>
          </button>
        </div>
        <button className="button button-secondary" type="button">
          <span aria-hidden="true">≡</span> Filters
        </button>
      </div>
      <section className="panel table-panel">
        <div className="table-meta">
          <span>
            Showing <strong>{workspace.data.tenders.length} demo tenders</strong>
          </span>
          <span className="table-note">
            <span className="demo-dot" /> Demo workspace
          </span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Tender</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Responses</th>
                <th>Deadline</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {workspace.data.tenders.map((tender) => (
                <tr key={tender.id}>
                  <td>
                    <div className="table-title">
                      <span className="tender-leading-icon" aria-hidden="true">
                        ↗
                      </span>
                      <strong>{tender.name}</strong>
                    </div>
                  </td>
                  <td>{tender.customer}</td>
                  <td>
                    <StatusBadge
                      tone={
                        tender.status === "Open"
                          ? "green"
                          : tender.status === "Draft"
                            ? "amber"
                            : "grey"
                      }
                    >
                      {tender.status}
                    </StatusBadge>
                  </td>
                  <td>{tender.responses}</td>
                  <td>{tender.deadline}</td>
                  <td>
                    <button
                      className="row-menu"
                      type="button"
                      aria-label={`More options for ${tender.name}`}
                    >
                      •••
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
