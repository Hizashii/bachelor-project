// This file defines the one error type the server throws for expected problems.
// Messages must be friendly and must never contain prices, tokens or other people's data.

import { API_ERROR_STATUS, type ApiErrorCode } from "@freight-desk/shared";

export type ErrorDetail = { path: string; message: string };

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly details: ErrorDetail[] | undefined;

  constructor(code: ApiErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);
    this.code = code;
    this.details = details;
  }

  get statusCode(): number {
    return API_ERROR_STATUS[this.code];
  }
}
