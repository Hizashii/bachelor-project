// This file provides the fallback state for unknown product routes.

import { StatePanel } from "../components/StatePanel.tsx";

export function NotFoundPage() {
  return (
    <StatePanel
      title="Page not found"
      description="The page you requested is not part of this workspace."
      actionLabel="Back to dashboard"
      onAction={() => {
        window.location.href = "/";
      }}
    />
  );
}
