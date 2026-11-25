// When the server says the session is gone (401 on an API call), go back to the login page.
// The startup check on /api/me is expected to say 401 for visitors, so it is left alone.

const LOGIN_PATH = "/login";

function isApiCall(input: RequestInfo | URL): boolean {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const path = new URL(url, window.location.origin).pathname;
  return path.startsWith("/api/") && path !== "/api/me";
}

export function redirectOnExpiredSession(): void {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await original(input, init);
    if (
      response.status === 401 &&
      isApiCall(input) &&
      window.location.pathname !== LOGIN_PATH
    ) {
      window.location.assign(LOGIN_PATH);
    }
    return response;
  };
}
