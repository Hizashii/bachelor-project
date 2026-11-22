import type { ReactNode } from "react";
import "./operational.css";

type PageHeaderProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p className="lede">{description}</p>
      </div>
      {action ? <div className="page-header-action">{action}</div> : null}
    </header>
  );
}

type EmptyStateProps = {
  title: string;
  description: string;
  children?: ReactNode;
  labelledBy?: string;
};

export function EmptyState({
  title,
  description,
  children,
  labelledBy,
}: EmptyStateProps) {
  return (
    <section className="empty-state" aria-labelledby={labelledBy}>
      <div>
        <h2 id={labelledBy}>{title}</h2>
        <p>{description}</p>
      </div>
      {children ? <div className="empty-state-actions">{children}</div> : null}
    </section>
  );
}

export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

export function ActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`action-bar ${className ?? ""}`.trim()}>{children}</div>
  );
}

export function TableFrame({
  children,
  labelledBy,
  ariaLabel,
}: {
  children: ReactNode;
  labelledBy?: string;
  ariaLabel?: string;
}) {
  return (
    <section
      className="table-frame"
      aria-labelledby={labelledBy}
      aria-label={ariaLabel}
    >
      {children}
    </section>
  );
}
