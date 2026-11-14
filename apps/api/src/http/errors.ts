export type ApiErrorCode =
  | "bad_request"
  | "configuration_error"
  | "internal_error"
  | "not_found"
  | "payload_too_large";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;

  constructor(code: ApiErrorCode, statusCode: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

type ApiErrorBody = {
  error: ApiErrorCode;
  message?: string;
};

export type SerializedApiError = {
  statusCode: number;
  body: ApiErrorBody;
};

function frameworkStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) {
    return undefined;
  }

  const statusCode = error.statusCode;
  return typeof statusCode === "number" ? statusCode : undefined;
}

export function serializeApiError(error: unknown): SerializedApiError {
  if (error instanceof ApiError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: error.code,
        ...(error.statusCode < 500 ? { message: error.message } : {}),
      },
    };
  }

  const statusCode = frameworkStatusCode(error);
  if (statusCode === 400) {
    return {
      statusCode,
      body: { error: "bad_request", message: "The request is invalid." },
    };
  }
  if (statusCode === 404) {
    return {
      statusCode,
      body: {
        error: "not_found",
        message: "The requested resource was not found.",
      },
    };
  }
  if (statusCode === 413) {
    return {
      statusCode,
      body: {
        error: "payload_too_large",
        message: "The request payload is too large.",
      },
    };
  }

  return {
    statusCode: 500,
    body: { error: "internal_error" },
  };
}
