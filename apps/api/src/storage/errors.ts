export type StorageErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid_request"
  | "retention_blocked"
  | "throttled"
  | "cloud_unavailable";

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly statusCode: number;
  readonly retryAfterSeconds: number | null;

  constructor(
    code: StorageErrorCode,
    message: string,
    options?: { retryAfterSeconds?: number; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "StorageError";
    this.code = code;
    this.statusCode = statusFor(code);
    this.retryAfterSeconds = options?.retryAfterSeconds ?? null;
  }
}

function statusFor(code: StorageErrorCode): number {
  switch (code) {
    case "unauthenticated":
      return 401;
    case "forbidden":
    case "retention_blocked":
      return 403;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "invalid_request":
      return 400;
    case "throttled":
      return 429;
    case "cloud_unavailable":
      return 503;
  }
}

export function graphError(
  status: number,
  code: string | undefined,
  message: string,
  retryAfterSeconds?: number,
): StorageError {
  if (status === 401) {
    return new StorageError(
      "cloud_unavailable",
      "Microsoft 365 authentication is unavailable.",
    );
  }
  if (status === 403) {
    return new StorageError(
      "forbidden",
      "Microsoft 365 denied access to the approved SharePoint site.",
    );
  }
  if (status === 404) {
    return new StorageError(
      "not_found",
      "The requested cloud file was not found.",
    );
  }
  if (status === 409 || code === "nameAlreadyExists") {
    return new StorageError(
      "conflict",
      "A file or folder with that name already exists.",
    );
  }
  if (status === 429) {
    return new StorageError(
      "throttled",
      "Microsoft 365 is temporarily throttling storage requests.",
      { retryAfterSeconds },
    );
  }
  return new StorageError(
    "cloud_unavailable",
    "Microsoft 365 storage is temporarily unavailable.",
    { cause: message },
  );
}
