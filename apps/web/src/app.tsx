// This file defines the web application's routes and shared shell.

import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell.tsx";
import { CompaniesPage } from "./pages/CompaniesPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { TendersPage } from "./pages/TendersPage.tsx";

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/tenders" element={<TendersPage />} />
        <Route path="/companies" element={<CompaniesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </AppShell>
  );
}
