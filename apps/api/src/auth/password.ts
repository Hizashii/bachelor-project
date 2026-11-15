// Password hashing (Argon2id, the library's default cost) and the password rules.
// Not for sessions or lockout: see service.ts.

import { hash, verify } from "@node-rs/argon2";

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export function passwordProblem(
  password: string,
  email: string,
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `The password can be at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  const name = email.split("@")[0]?.toLowerCase() ?? "";
  if (name.length >= 4 && password.toLowerCase().includes(name)) {
    return "The password must not contain your e-mail name.";
  }
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Checking a password against this takes as long as a real check, so an unknown e-mail
// address cannot be told apart from a wrong password by timing.
let decoyHash: Promise<string> | null = null;
export async function spendCheckTime(password: string): Promise<void> {
  decoyHash ??= hash("decoy-password-for-timing-only");
  await verifyPassword(await decoyHash, password);
}
