import { describe, expect, it } from "vitest";
import { ApiError, serializeApiError } from "./errors.ts";

describe("API error serialization", () => {
  it("returns a stable public response for expected errors", () => {
    expect(
      serializeApiError(
        new ApiError("bad_request", 400, "The input is invalid."),
      ),
    ).toEqual({
      statusCode: 400,
      body: { error: "bad_request", message: "The input is invalid." },
    });
  });

  it("does not expose unexpected error details", () => {
    expect(serializeApiError(new Error("database password leaked"))).toEqual({
      statusCode: 500,
      body: { error: "internal_error" },
    });
  });

  it("normalizes framework status errors without exposing their message", () => {
    expect(
      serializeApiError({ statusCode: 404, message: "route internals" }),
    ).toEqual({
      statusCode: 404,
      body: {
        error: "not_found",
        message: "The requested resource was not found.",
      },
    });
  });
});
