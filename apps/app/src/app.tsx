import { type ReactElement, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell";
import { CarrierPortal } from "./features/carriers/CarrierPortal";
import { CompareOffers } from "./features/compare/CompareOffers";
import type { Locale } from "./i18n";

export function App(): ReactElement {
  const [locale, setLocale] = useState<Locale>("da");

  return (
    <AppShell locale={locale} onLocaleChange={setLocale}>
      <Routes>
        <Route path="/compare" element={<CompareOffers locale={locale} />} />
        <Route path="/carriers" element={<CarrierPortal locale={locale} />} />
        <Route path="*" element={<Navigate to="/compare" replace />} />
      </Routes>
    </AppShell>
  );
}
