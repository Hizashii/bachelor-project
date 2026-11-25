import { type ReactElement, useState } from "react";
import { Navigate, Route, Routes, useParams } from "react-router";
import {
  AcceptInvitationScreen,
  LoginScreen,
  ResetPasswordScreen,
} from "./auth/AuthScreens";
import { type UserRole, useAuth } from "./auth/auth";
import { AppShell } from "./components/AppShell";
import { CarrierPortal } from "./features/carriers/CarrierPortal";
import { CompareOffers } from "./features/compare/CompareOffers";
import { FileManagement } from "./features/files/FileManagement";
import { TenderForm } from "./features/tenders/TenderForm";
import { TenderLanding } from "./features/tenders/TenderLanding";
import { TenderOverview } from "./features/tenders/TenderOverview";
import { TenderWorkspace } from "./features/tenders/TenderWorkspace";
import { UploadScreen } from "./features/upload/UploadScreen";
import type { Locale } from "./i18n";
import { PublicLanding } from "./PublicLanding";

export function App(): ReactElement {
  const auth = useAuth();
  const [locale, setLocale] = useState<Locale>("da");
  const path = window.location.pathname;
  const isPublicEntry = ![
    "/login",
    "/accept-invitation",
    "/reset-password",
  ].includes(path);

  if (isPublicEntry && auth.status !== "authenticated" && !auth.user) {
    return <PublicLanding locale={locale} onLocaleChange={setLocale} />;
  }

  if (auth.status === "loading") {
    return (
      <div className="auth-loading-screen">Loading your secure workspace…</div>
    );
  }
  if (auth.status === "error") {
    if (path === "/login") return <LoginScreen />;
    return (
      <div className="auth-loading-screen">
        {auth.error ?? "Authentication is unavailable."}
      </div>
    );
  }
  if (!auth.user) return signedOutScreen(path, locale, setLocale);

  return (
    <AppShell
      locale={locale}
      onLocaleChange={setLocale}
      user={auth.user}
      onLogout={auth.logout}
    >
      <Routes>
        <Route
          path="/tenders"
          element={<TenderLanding locale={locale} role={auth.user.role} />}
        />
        <Route
          path="/tenders/new"
          element={
            <RoleRoute
              userRole={auth.user.role}
              allowedRoles={["consultant", "master"]}
            >
              <TenderForm locale={locale} />
            </RoleRoute>
          }
        />
        <Route
          path="/tenders/:id/edit"
          element={
            <RoleRoute
              userRole={auth.user.role}
              allowedRoles={["consultant", "master"]}
            >
              <TenderEditRoute locale={locale} />
            </RoleRoute>
          }
        />
        <Route
          path="/tenders/:id"
          element={<TenderOverview locale={locale} role={auth.user.role} />}
        />
        <Route
          path="/compare"
          element={
            <RoleRoute
              userRole={auth.user.role}
              allowedRoles={["consultant", "master"]}
            >
              <CompareOffers locale={locale} />
            </RoleRoute>
          }
        />
        <Route
          path="/upload"
          element={
            <RoleRoute
              userRole={auth.user.role}
              allowedRoles={["consultant", "master"]}
            >
              <UploadScreen locale={locale} />
            </RoleRoute>
          }
        />
        <Route path="/carriers" element={<CarrierPortal locale={locale} />} />
        <Route
          path="/files"
          element={
            <RoleRoute
              userRole={auth.user.role}
              allowedRoles={["consultant", "master"]}
            >
              <FileManagement locale={locale} />
            </RoleRoute>
          }
        />
        <Route
          path="/tenders/:id/workspace"
          element={<TenderWorkspace locale={locale} />}
        />
        <Route path="*" element={<Navigate to="/tenders" replace />} />
      </Routes>
    </AppShell>
  );
}

function RoleRoute({
  userRole,
  allowedRoles,
  children,
}: {
  userRole: UserRole;
  allowedRoles: readonly UserRole[];
  children: ReactElement;
}) {
  return allowedRoles.includes(userRole) ? (
    children
  ) : (
    <Navigate to="/tenders" replace />
  );
}

function TenderEditRoute({ locale }: { locale: Locale }) {
  const { id } = useParams();
  return <TenderForm locale={locale} tenderId={id} />;
}

function signedOutScreen(
  path: string,
  locale: Locale,
  onLocaleChange: (locale: Locale) => void,
): ReactElement {
  if (path === "/accept-invitation") return <AcceptInvitationScreen />;
  if (path === "/reset-password") return <ResetPasswordScreen />;
  if (path === "/login") return <LoginScreen />;
  return <PublicLanding locale={locale} onLocaleChange={onLocaleChange} />;
}
