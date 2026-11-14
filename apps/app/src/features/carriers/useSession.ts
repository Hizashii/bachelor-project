// Asks the server who is signed in. The sign-in layer provides GET /api/session and
// returns { userId, organisationId, role }. Nothing about the user is kept in the browser.

import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client";

export type SessionInfo = {
  userId: string;
  organisationId: string;
  role: "carrier" | "consultant" | "master";
};

export function useSession(): SessionInfo | null {
  const [session, setSession] = useState<SessionInfo | null>(null);
  useEffect(() => {
    apiFetch<SessionInfo>("/api/session").then(setSession, () =>
      setSession(null),
    );
  }, []);
  return session;
}
