import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { csrfHeader } from "../api/client";

export type UserRole = "carrier" | "consultant" | "master";

export type SafeUserProfile = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  companyId: string | null;
  storageMode: "local" | "sharepoint";
};

type AuthState = {
  status: "loading" | "authenticated" | "unauthenticated" | "error";
  user: SafeUserProfile | null;
  error: string | null;
};

type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Sign-in, invitation and reset requests happen before there is a session, so they
// carry no CSRF token. The server checks their Origin instead.
export async function postPublic(
  path: string,
  body: Record<string, string>,
): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new Error(
      typeof payload.message === "string"
        ? payload.message
        : "Something went wrong. Please try again.",
    );
  }
  return payload;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
    error: null,
  });

  useEffect(() => {
    let active = true;
    void fetch("/api/me", { credentials: "same-origin" })
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
      login: async (email, password) => {
        const body = await postPublic("/auth/login", { email, password });
        setState({
          status: "authenticated",
          user: body.user as SafeUserProfile,
          error: null,
        });
      },
      logout: async () => {
        const response = await fetch("/auth/logout", {
          method: "POST",
          credentials: "same-origin",
          headers: await csrfHeader(),
        });
        if (!response.ok) throw new Error("Sign out failed. Please try again.");
        window.location.assign("/login");
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
