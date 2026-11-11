// This file checks the deadline is shown in the tender's own time zone with its offset.
import { describe, expect, it } from "vitest";
import { formatDeadline } from "./format";

describe("formatDeadline", () => {
  it("shows Copenhagen winter time with a +1 offset", () => {
    const text = formatDeadline(
      "2027-02-01T11:00:00Z",
      "Europe/Copenhagen",
      "en",
    );
    expect(text).toContain("12:00");
    expect(text).toContain("+1");
  });
});
