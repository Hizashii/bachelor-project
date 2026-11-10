// This file renders one dashboard metric with its supporting label.

type StatCardProps = {
  label: string;
  value: string | number;
  detail: string;
  accent?: "blue" | "green" | "amber";
};

export function StatCard({ label, value, detail, accent = "blue" }: StatCardProps) {
  return (
    <article className={`stat-card stat-card-${accent}`}>
      <div className="stat-card-topline">
        <span className="stat-label">{label}</span>
        <span className="stat-indicator" aria-hidden="true" />
      </div>
      <strong>{value}</strong>
      <span className="stat-detail">{detail}</span>
    </article>
  );
}
