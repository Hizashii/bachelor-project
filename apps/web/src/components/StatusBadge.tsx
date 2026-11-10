// This file renders the small status labels shared by tables and cards.

type StatusBadgeProps = {
  children: string;
  tone?: "green" | "blue" | "grey" | "amber";
};

export function StatusBadge({ children, tone = "grey" }: StatusBadgeProps) {
  return <span className={`status-badge status-badge-${tone}`}>{children}</span>;
}
