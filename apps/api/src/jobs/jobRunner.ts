// Runs long jobs in the background with a limit on how many run at once.
// Keeps state, progress, cancel and retry. Jobs are visible only to their own organisation.
// Not for job content: the work function is supplied by the feature (for example imports).

import { randomUUID } from "node:crypto";
import type { AccessContext } from "../contracts/access.ts";

export type JobState =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type JobView<Result> = {
  id: string;
  state: JobState;
  progress: number;
  attempts: number;
  error: string | null;
  result: Result | null;
};

export type JobWork<Result> = (
  signal: AbortSignal,
  reportProgress: (value: number) => void,
) => Promise<Result>;

type JobRecord<Result> = JobView<Result> & {
  organisationId: string;
  key: string;
  work: JobWork<Result>;
  controller: AbortController;
};

export type JobRunnerOptions = {
  maxConcurrent: number;
  maxAttempts: number;
  // Turns an error into text safe to show a user. Unknown errors become a generic message.
  describeError: (error: unknown) => string;
  isCancellation: (error: unknown) => boolean;
};

const ACTIVE_STATES: readonly JobState[] = ["pending", "processing"];

export class JobRunner<Result> {
  private readonly jobs = new Map<string, JobRecord<Result>>();
  private readonly queue: string[] = [];
  private running = 0;

  private readonly options: JobRunnerOptions;

  constructor(options: JobRunnerOptions) {
    this.options = options;
  }

  // Submitting the same key again while the job is active returns the running job.
  submit(
    context: AccessContext,
    key: string,
    work: JobWork<Result>,
  ): JobView<Result> {
    const active = [...this.jobs.values()].find(
      (job) =>
        job.key === key &&
        job.organisationId === context.organisationId &&
        ACTIVE_STATES.includes(job.state),
    );
    if (active) return view(active);
    const job: JobRecord<Result> = {
      id: randomUUID(),
      state: "pending",
      progress: 0,
      attempts: 0,
      error: null,
      result: null,
      organisationId: context.organisationId,
      key,
      work,
      controller: new AbortController(),
    };
    this.jobs.set(job.id, job);
    this.enqueue(job);
    return view(job);
  }

  get(context: AccessContext, id: string): JobView<Result> | null {
    const job = this.owned(context, id);
    return job ? view(job) : null;
  }

  cancel(context: AccessContext, id: string): JobView<Result> | null {
    const job = this.owned(context, id);
    if (!job) return null;
    if (job.state === "pending") {
      this.queue.splice(this.queue.indexOf(id), 1);
      job.state = "cancelled";
    } else if (job.state === "processing") {
      job.controller.abort();
    }
    return view(job);
  }

  retry(context: AccessContext, id: string): JobView<Result> | null {
    const job = this.owned(context, id);
    if (!job) return null;
    if (job.state === "failed" && job.attempts < this.options.maxAttempts) {
      job.state = "pending";
      job.error = null;
      job.progress = 0;
      job.controller = new AbortController();
      this.enqueue(job);
    }
    return view(job);
  }

  private owned(context: AccessContext, id: string): JobRecord<Result> | null {
    const job = this.jobs.get(id);
    return job && job.organisationId === context.organisationId ? job : null;
  }

  private enqueue(job: JobRecord<Result>): void {
    this.queue.push(job.id);
    this.startNext();
  }

  private startNext(): void {
    while (this.running < this.options.maxConcurrent && this.queue.length > 0) {
      const job = this.jobs.get(this.queue.shift() ?? "");
      if (!job) continue;
      this.running += 1;
      void this.execute(job).finally(() => {
        this.running -= 1;
        this.startNext();
      });
    }
  }

  private async execute(job: JobRecord<Result>): Promise<void> {
    job.state = "processing";
    job.attempts += 1;
    try {
      job.result = await job.work(job.controller.signal, (value) => {
        job.progress = value;
      });
      job.state = "completed";
    } catch (error) {
      const cancelled = this.options.isCancellation(error);
      job.state = cancelled ? "cancelled" : "failed";
      job.error = cancelled ? null : this.options.describeError(error);
    }
  }
}

function view<Result>(job: JobRecord<Result>): JobView<Result> {
  return {
    id: job.id,
    state: job.state,
    progress: job.progress,
    attempts: job.attempts,
    error: job.error,
    result: job.result,
  };
}
