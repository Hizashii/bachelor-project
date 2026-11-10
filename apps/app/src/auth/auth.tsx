import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type UserRole = "carrier" | "consultant" | "master";

export type SafeUserProfile = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  companyId: string | null;
  mfaVerified: boolean;
};

type AuthConfig = {
  mode: "mock" | "entra";
  mockIdentities: readonly { key: string; label: string; email: string }[];
};

type AuthState = {
  status: "loading" | "authenticated" | "unauthenticated" | "error";
  user: SafeUserProfile | null;
  error: string | null;
};

type AuthContextValue = AuthState & {
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
    error: null,
  });

  useEffect(() => {
    let active = true;
    void fetch("/api/me", { credentials: "include" })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok)
          throw new Error("The signed-in profile could not be loaded.");
        const body = (await response.json()) as { user: SafeUserProfile };
        return body.user;
      })
      .then((user) => {
        if (!active) return;
        setState({
          status: user ? "authenticated" : "unauthenticated",
          user,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          status: "error",
          user: null,
          error:
            error instanceof Error
              ? error.message
              : "Authentication is unavailable.",
        });
      });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      logout: async () => {
        const csrfResponse = await fetch("/api/csrf", {
          credentials: "include",
        });
        if (!csrfResponse.ok)
          throw new Error("The security token could not be loaded.");
        const { token } = (await csrfResponse.json()) as { token: string };
        const response = await fetch("/auth/logout", {
          method: "POST",
          credentials: "include",
          headers: { "x-csrf-token": token },
        });
        if (!response.ok) throw new Error("Sign out failed. Please try again.");
        const body = (await response.json()) as { redirectTo?: string };
        setState({ status: "unauthenticated", user: null, error: null });
        if (
          body.redirectTo &&
          body.redirectTo !== `${window.location.origin}/login`
        ) {
          window.location.assign(body.redirectTo);
        } else {
          window.location.assign("/login");
        }
      },
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext<AuthContextValue | null>(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}

export function LoginScreen() {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const signInError = params.get("error");
    if (signInError === "mfa_required") {
      setError(
        "Microsoft Entra MFA is required before Freight Desk can create a session.",
      );
    } else if (signInError) {
      setError("Sign-in could not be completed. Please try again.");
    }

    void fetch("/api/auth/config")
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Authentication configuration is unavailable.");
        return (await response.json()) as AuthConfig;
      })
      .then(setConfig)
      .catch(() => setError("Authentication configuration is unavailable."));
  }, []);

  return (
    <main className="auth-screen">
      <section className="login-card" aria-labelledby="login-title">
        <p className="eyebrow">Freight Desk</p>
        <h1 id="login-title">Sign in to your workspace</h1>
        <p className="auth-lede">
          Access is managed by Microsoft Entra ID. Your role and carrier company
          are provisioned by Freight Desk administrators.
        </p>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        {config?.mode === "entra" ? (
          <a className="button button-primary auth-submit" href="/auth/login">
            Continue with Microsoft
          </a>
        ) : null}
        {config?.mode === "mock" ? (
          <section className="mock-login" aria-labelledby="mock-login-title">
            <p className="mock-login-label" id="mock-login-title">
              Local development identities
            </p>
            <p className="mock-login-note">
              These fictional accounts are available only in AUTH_MODE=mock.
            </p>
            {config.mockIdentities.map((identity) => (
              <a
                className="mock-identity"
                href={`/auth/mock/login?identity=${encodeURIComponent(identity.key)}`}
                key={identity.key}
              >
                <span>
                  <strong>{identity.label}</strong>
                  <small>{identity.email}</small>
                </span>
                <span aria-hidden="true">→</span>
              </a>
            ))}
          </section>
        ) : null}
        {!config && !error ? (
          <p className="auth-loading">Loading sign-in options…</p>
        ) : null}
      </section>
    </main>
  );
}
