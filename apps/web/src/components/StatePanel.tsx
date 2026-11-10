// This file provides consistent loading, empty and error states for every page.

type StatePanelProps = {
  title: string;
  description: string;
  tone?: "loading" | "empty" | "error";
  actionLabel?: string;
  onAction?: () => void;
};

export function StatePanel({
  title,
  description,
  tone = "empty",
  actionLabel,
  onAction,
}: StatePanelProps) {
  return (
    <div
      className={`state-panel state-panel-${tone}`}
      role={tone === "error" ? "alert" : undefined}
    >
      <div className="state-panel-mark" aria-hidden="true">
        {tone === "loading" ? "···" : tone === "error" ? "!" : "–"}
      </div>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
        {actionLabel && onAction ? (
          <button className="button button-secondary" type="button" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
