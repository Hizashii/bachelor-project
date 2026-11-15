// Tests for password hashing and the password rules. No database needed.

import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "./password.ts";

describe("passwords", () => {
  it("hashes with Argon2id, never stores the password, and checks it back", async () => {
    const hashed = await hashPassword("a long enough passphrase");
    expect(hashed).toMatch(/^\$argon2id\$/);
    expect(hashed).not.toContain("passphrase");
    expect(await verifyPassword(hashed, "a long enough passphrase")).toBe(true);
    expect(await verifyPassword(hashed, "another passphrase here")).toBe(false);
    expect(await verifyPassword("not a hash", "anything")).toBe(false);
  });

  it("gives two different hashes for the same password", async () => {
    expect(await hashPassword("same passphrase 1")).not.toBe(
      await hashPassword("same passphrase 1"),
    );
  });

  it("asks for a long password that does not repeat the e-mail name", () => {
    expect(passwordProblem("short", "a@b.test")).toMatch(/at least/);
    expect(passwordProblem("x".repeat(200), "a@b.test")).toMatch(/at most/);
    expect(passwordProblem("danaDana-secret-1", "dana@bluefjord.test")).toMatch(
      /e-mail/,
    );
    expect(
      passwordProblem("a perfectly fine phrase", "dana@bluefjord.test"),
    ).toBeNull();
  });
});
