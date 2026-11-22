import { type ReactElement, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell";
import { CarrierPortal } from "./features/carriers/CarrierPortal";
import { CompareOffers } from "./features/compare/CompareOffers";
import { FileManagement } from "./features/files/FileManagement";
import { TenderWorkspace } from "./features/tenders/TenderWorkspace";
import type { Locale } from "./i18n";

export function App(): ReactElement {
  const [locale, setLocale] = useState<Locale>("da");

  return (
    <AppShell locale={locale} onLocaleChange={setLocale}>
      <Routes>
        <Route path="/compare" element={<CompareOffers locale={locale} />} />
        <Route path="/carriers" element={<CarrierPortal locale={locale} />} />
        <Route path="/files" element={<FileManagement locale={locale} />} />
        <Route
          path="/tenders/:id"
          element={<TenderWorkspace locale={locale} />}
        />
        <Route path="*" element={<Navigate to="/compare" replace />} />
      </Routes>
    </AppShell>
  );
}
