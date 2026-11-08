import type { RoadPriceList } from "@freight-desk/shared";
import { type ReactElement, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell";
import { type CarrierSubmission, submittedCarriers } from "./data";
import { AdminInbox } from "./features/admin/AdminInbox";
import { CarrierPortal } from "./features/carriers/CarrierPortal";
import { CarrierSent } from "./features/carriers/CarrierSent";
import { CompareOffers } from "./features/compare/CompareOffers";
import type { Locale } from "./i18n";

export function App(): ReactElement {
  const [locale, setLocale] = useState<Locale>("da");
  const [submissions, setSubmissions] =
    useState<CarrierSubmission[]>(submittedCarriers);

  function addSubmission(submission: RoadPriceList) {
    setSubmissions((current) => [
      {
        ...submission,
        carrierName: "Transportør A",
        status: "new",
        hasZoneWarning: false,
      },
      ...current,
    ]);
  }

  function markDownloaded(id: string) {
    setSubmissions((current) =>
      current.map((submission) =>
        submission.id === id
          ? { ...submission, status: "downloaded" }
          : submission,
      ),
    );
  }

  return (
    <AppShell locale={locale} onLocaleChange={setLocale}>
      <Routes>
        <Route path="/compare" element={<CompareOffers locale={locale} />} />
        <Route
          path="/carriers"
          element={<CarrierPortal locale={locale} onSubmit={addSubmission} />}
        />
        <Route
          path="/carriers/sent"
          element={<CarrierSent locale={locale} />}
        />
        <Route
          path="/admin/inbox"
          element={
            <AdminInbox
              locale={locale}
              submissions={submissions}
              onDownload={markDownloaded}
              onDownloadAll={() => {
                submissions.forEach((submission) => {
                  markDownloaded(submission.id);
                });
              }}
            />
          }
        />
        <Route path="*" element={<Navigate to="/compare" replace />} />
      </Routes>
    </AppShell>
  );
}
