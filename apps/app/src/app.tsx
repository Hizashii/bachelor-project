import { type ReactElement, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
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
import { UploadScreen } from "./features/upload/UploadScreen";
import type { Locale } from "./i18n";

export function App(): ReactElement {
  const auth = useAuth();
  const [locale, setLocale] = useState<Locale>("da");

  if (auth.status === "loading") {
    return (
      <div className="auth-loading-screen">Loading your secure workspace…</div>
    );
  }
  if (auth.status === "error") {
    return (
      <div className="auth-loading-screen">
        {auth.error ?? "Authentication is unavailable."}
      </div>
    );
  }
  if (!auth.user) return signedOutScreen(window.location.pathname);

  return (
    <AppShell
      locale={locale}
      onLocaleChange={setLocale}
      user={auth.user}
      onLogout={auth.logout}
    >
      <Routes>
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
        <Route path="/files" element={<FileManagement locale={locale} />} />
        <Route path="*" element={<Navigate to="/compare" replace />} />
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
    <Navigate to="/carriers" replace />
  );
}

function signedOutScreen(path: string): ReactElement {
  if (path === "/accept-invitation") return <AcceptInvitationScreen />;
  if (path === "/reset-password") return <ResetPasswordScreen />;
  return <LoginScreen />;
}
