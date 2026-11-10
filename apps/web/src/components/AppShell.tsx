// This file composes the responsive shell shared by every authenticated screen.

import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar.tsx";
import { TopHeader } from "./TopHeader.tsx";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="app-main">
        <TopHeader onMenuOpen={() => setSidebarOpen(true)} />
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
