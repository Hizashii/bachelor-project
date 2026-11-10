// This file renders the carrier company directory using fictional demo data.

import { useQuery } from "@tanstack/react-query";
import { loadWorkspaceDemo } from "../demo/data.ts";
import { PageHeader } from "../components/PageHeader.tsx";
import { StatePanel } from "../components/StatePanel.tsx";
import { StatusBadge } from "../components/StatusBadge.tsx";

export function CompaniesPage() {
  const workspace = useQuery({ queryKey: ["workspace-demo"], queryFn: loadWorkspaceDemo });
  if (workspace.isPending)
    return (
      <StatePanel
        tone="loading"
        title="Loading companies"
        description="Preparing the demo company directory."
      />
    );
  if (workspace.isError)
    return (
      <StatePanel
        tone="error"
        title="Companies unavailable"
        description="The demo company directory could not be loaded."
        actionLabel="Try again"
        onAction={() => void workspace.refetch()}
      />
    );

  return (
    <>
      <PageHeader
        eyebrow="Workspace / Companies"
        title="Companies"
        description="Keep your carrier network organized and ready for the next tender."
        actions={
          <button className="button button-primary" type="button">
            Add company <span aria-hidden="true">+</span>
          </button>
        }
      />
      <div className="company-summary">
        <div>
          <strong>{workspace.data.companies.length}</strong>
          <span>demo carrier companies</span>
        </div>
        <div>
          <strong>4</strong>
          <span>countries covered</span>
        </div>
        <div>
          <strong>48</strong>
          <span>active invitations</span>
        </div>
      </div>
      <section className="company-grid">
        {workspace.data.companies.map((company) => (
          <article className="company-card" key={company.id}>
            <div className="company-card-top">
              <span className="company-logo">
                {company.name
                  .split(" ")
                  .map((word) => word[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <StatusBadge tone={company.status === "Active" ? "green" : "amber"}>
                {company.status}
              </StatusBadge>
            </div>
            <h2>{company.name}</h2>
            <p>{company.country}</p>
            <div className="company-card-footer">
              <span>
                <small>Tenders</small>
                <strong>{company.tenders}</strong>
              </span>
              <span>
                <small>Coverage</small>
                <strong>{company.coverage}</strong>
              </span>
              <button
                className="row-menu"
                type="button"
                aria-label={`More options for ${company.name}`}
              >
                •••
              </button>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
