import { describe, expect, it } from "vitest";
import { canAcceptOffer, canEditOffer, offerStates, tenderStatuses } from "./index.ts";

describe("shared lifecycle rules", () => {
  it("exposes the tender and offer states used by the foundation", () => {
    expect(tenderStatuses).toEqual(["draft", "open", "closed", "awarded", "archived"]);
    expect(offerStates).toEqual(["draft", "submitted", "superseded", "withdrawn"]);
  });

  it("only permits edits on draft offers", () => {
    expect(canEditOffer("draft")).toBe(true);
    expect(canEditOffer("submitted")).toBe(false);
    expect(canEditOffer("superseded")).toBe(false);
    expect(canEditOffer("withdrawn")).toBe(false);
  });

  it("only accepts offers while an open tender is within its deadline", () => {
    expect(canAcceptOffer("open", false)).toBe(true);
    expect(canAcceptOffer("open", true)).toBe(false);
    expect(canAcceptOffer("closed", false)).toBe(false);
  });
});
