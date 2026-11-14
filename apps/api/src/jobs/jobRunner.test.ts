// Tests for job states, concurrency limit, duplicate prevention, cancel, retry and isolation.

import { describe, expect, it } from "vitest";
import type { AccessContext } from "../auth/permissions.ts";
import { JobRunner } from "./jobRunner.ts";

const org1: AccessContext = {
  userId: "u1",
  organisationId: "org-1",
  role: "consultant",
};
const org2: AccessContext = { ...org1, organisationId: "org-2" };

class Cancelled extends Error {}

function makeRunner(maxConcurrent = 1) {
  return new JobRunner<string>({
    maxConcurrent,
    maxAttempts: 2,
    describeError: () => "Processing failed.",
    isCancellation: (error) => error instanceof Cancelled,
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
const never = () => new Promise<string>(() => undefined);

describe("JobRunner", () => {
  it("completes a job and exposes its result", async () => {
    const runner = makeRunner();
    const job = runner.submit(org1, "a", async () => "done");
    await settle();
    expect(runner.get(org1, job.id)).toMatchObject({
      state: "completed",
      result: "done",
    });
  });

  it("queues work beyond the concurrency limit", async () => {
    const runner = makeRunner(1);
    let release: () => void = () => undefined;
    runner.submit(
      org1,
      "a",
      () =>
        new Promise<string>((resolve) => {
          release = () => resolve("x");
        }),
    );
    const second = runner.submit(org1, "b", async () => "y");
    await settle();
    expect(runner.get(org1, second.id)?.state).toBe("pending");
    release();
    await settle();
    expect(runner.get(org1, second.id)?.state).toBe("completed");
  });

  it("returns the running job for a repeated key", () => {
    const runner = makeRunner();
    const first = runner.submit(org1, "same", never);
    expect(runner.submit(org1, "same", async () => "z").id).toBe(first.id);
  });

  it("cancels a processing job through its signal", async () => {
    const runner = makeRunner();
    const job = runner.submit(
      org1,
      "a",
      (signal) =>
        new Promise<string>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Cancelled()));
        }),
    );
    await settle();
    runner.cancel(org1, job.id);
    await settle();
    expect(runner.get(org1, job.id)?.state).toBe("cancelled");
  });

  it("retries a failed job until the attempt limit", async () => {
    const runner = makeRunner();
    const job = runner.submit(org1, "a", async () => {
      throw new Error("boom");
    });
    await settle();
    expect(runner.get(org1, job.id)).toMatchObject({
      state: "failed",
      error: "Processing failed.",
    });
    runner.retry(org1, job.id);
    await settle();
    runner.retry(org1, job.id);
    await settle();
    expect(runner.get(org1, job.id)).toMatchObject({
      state: "failed",
      attempts: 2,
    });
  });

  it("hides jobs from other organisations", () => {
    const runner = makeRunner();
    const job = runner.submit(org1, "a", never);
    expect(runner.get(org2, job.id)).toBeNull();
    expect(runner.cancel(org2, job.id)).toBeNull();
  });
});
