// One small helper for calling the Freight Desk server from the browser.
// Sign-in is a server cookie, so nothing secret is ever read or stored here.

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let csrfToken: Promise<string> | null = null;

// Requests that change data carry the session's CSRF token, fetched once.
export function csrfHeader(): Promise<Record<string, string>> {
  csrfToken ??= fetch("/api/csrf", { credentials: "same-origin" })
    .then((response) => response.json())
    .then((body: { token: string }) => body.token);
  return csrfToken.then((token) => ({ "x-csrf-token": token }));
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const changes = (init.method ?? "GET") !== "GET";
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { ...(changes ? await csrfHeader() : {}), ...init.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new ApiError(
      response.status,
      body?.message ?? "Something went wrong.",
    );
  }
  return (await response.json()) as T;
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function downloadFile(
  path: string,
  init: RequestInit = {},
): Promise<Blob> {
  const changes = (init.method ?? "GET") !== "GET";
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { ...(changes ? await csrfHeader() : {}), ...init.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new ApiError(
      response.status,
      body?.message ?? "Something went wrong.",
    );
  }
  return response.blob();
}

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
