// Waits until a condition becomes true, so tests do not depend on fixed sleeps.

const POLL_MS = 10;
const TIMEOUT_MS = 5000;

export async function waitFor(
  check: () => boolean | Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("Timed out waiting.");
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}
