// This file renders the overview screen using fictional demo workspace data.

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { loadWorkspaceDemo } from "../demo/data.ts";
import { PageHeader } from "../components/PageHeader.tsx";
import { StatePanel } from "../components/StatePanel.tsx";
import { StatCard } from "../components/StatCard.tsx";
import { StatusBadge } from "../components/StatusBadge.tsx";

export function DashboardPage() {
  const workspace = useQuery({ queryKey: ["workspace-demo"], queryFn: loadWorkspaceDemo });

  if (workspace.isPending) {
    return (
      <StatePanel
        tone="loading"
        title="Loading workspace"
        description="Preparing your demo overview."
      />
    );
  }

  if (workspace.isError) {
    return (
      <StatePanel
        tone="error"
        title="Workspace unavailable"
        description="The demo workspace could not be loaded."
        actionLabel="Try again"
        onAction={() => void workspace.refetch()}
      />
    );
  }

  const { stats, tenders } = workspace.data;
  return (
    <>
      <PageHeader
        eyebrow="Tuesday, 10 November 2026"
        title="Good morning, Julia"
        description="Here is what is happening across your freight tenders."
        actions={
          <Link className="button button-primary" to="/tenders">
            Create tender <span aria-hidden="true">+</span>
          </Link>
        }
      />

      <div className="demo-notice">
        <span className="demo-notice-icon" aria-hidden="true">
          i
        </span>
        <span>
          <strong>You are viewing demo data.</strong> This workspace is disconnected from customer
          files and production services.
        </span>
      </div>

      <section className="stat-grid" aria-label="Workspace summary">
        <StatCard
          label="Active tenders"
          value={stats.activeTenders}
          detail="3 need attention this week"
        />
        <StatCard
          label="Invited carriers"
          value={stats.invitedCarriers}
          detail="Across your active tenders"
          accent="green"
        />
        <StatCard
          label="Response rate"
          value={`${stats.responseRate}%`}
          detail="Up 6% from last month"
          accent="amber"
        />
        <StatCard
          label="Savings opportunity"
          value={stats.savingsOpportunity}
          detail="Based on current comparisons"
        />
      </section>

      <section className="dashboard-grid">
        <div className="panel panel-large">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Your pipeline</p>
              <h2>Recent tenders</h2>
            </div>
            <Link className="text-link" to="/tenders">
              View all <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className="tender-list">
            {tenders.slice(0, 3).map((tender) => (
              <Link className="tender-row" key={tender.id} to="/tenders">
                <span className="tender-leading-icon" aria-hidden="true">
                  ↗
                </span>
                <span className="tender-row-main">
                  <strong>{tender.name}</strong>
                  <small>{tender.customer}</small>
                </span>
                <span className="tender-row-meta">
                  <small>Responses</small>
                  <strong>{tender.responses}</strong>
                </span>
                <span className="tender-row-meta">
                  <small>Deadline</small>
                  <strong>{tender.deadline}</strong>
                </span>
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
                <span className="row-arrow" aria-hidden="true">
                  ›
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Latest updates</p>
              <h2>Activity</h2>
            </div>
            <button className="more-button" type="button" aria-label="More activity options">
              •••
            </button>
          </div>
          <div className="activity-list">
            <ActivityDot
              color="green"
              title="Carrier response received"
              detail="Blue Fjord Transport · Nordic Road Network"
              time="18 min ago"
            />
            <ActivityDot
              color="blue"
              title="Tender invitation sent"
              detail="Benelux Parcel Flow · 9 carriers"
              time="2 hours ago"
            />
            <ActivityDot
              color="amber"
              title="Deadline approaching"
              detail="Nordic Road Network · 5 days remaining"
              time="Yesterday"
            />
            <ActivityDot
              color="grey"
              title="New company added"
              detail="Harborline Logistics"
              time="Yesterday"
            />
          </div>
        </div>
      </section>
    </>
  );
}

function ActivityDot({
  color,
  title,
  detail,
  time,
}: {
  color: string;
  title: string;
  detail: string;
  time: string;
}) {
  return (
    <div className="activity-item">
      <span className={`activity-dot activity-dot-${color}`} />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <time>{time}</time>
    </div>
  );
}
