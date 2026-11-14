import { describe, expect, it } from "vitest";
import {
  assertReferenceInScope,
  createScopedSharePointDocumentStore,
  isReferenceInScope,
  type SharePointDocumentReference,
  type SharePointScope,
} from "./sharepoint.ts";

const scope: SharePointScope = {
  organizationId: "consultancy-blue-fjord",
  tenantId: "tenant-fictional",
  siteId: "site-freight-desk",
  driveId: "drive-freight-data",
};

describe("SharePoint scope", () => {
  it("accepts references belonging to the configured organisation", () => {
    const reference: SharePointDocumentReference = {
      organizationId: "consultancy-blue-fjord",
      itemId: "item-001",
      path: "tenders/northern-denmark.xlsx",
    };

    expect(isReferenceInScope(scope, reference)).toBe(true);
  });

  it("rejects references belonging to another organisation", () => {
    const reference: SharePointDocumentReference = {
      organizationId: "consultancy-northstar",
      itemId: "item-002",
      path: "tenders/other-customer.xlsx",
    };

    expect(isReferenceInScope(scope, reference)).toBe(false);
  });

  it("rejects a path that escapes the SharePoint document scope", () => {
    const reference: SharePointDocumentReference = {
      organizationId: "consultancy-blue-fjord",
      itemId: "item-003",
      path: "tenders/../other-customer.xlsx",
    };

    expect(() => assertReferenceInScope(scope, reference)).toThrow(
      /outside the configured scope/,
    );
  });

  it("enforces the scope before delegating reads", async () => {
    let reads = 0;
    let writes = 0;
    const store = createScopedSharePointDocumentStore(scope, {
      scope,
      put: async () => {
        writes += 1;
        return {
          organizationId: scope.organizationId,
          itemId: "item-004",
          path: "tenders/valid.xlsx",
        };
      },
      read: async () => {
        reads += 1;
        return (async function* () {})();
      },
      remove: async () => undefined,
    });

    expect(() =>
      store.read({
        organizationId: "consultancy-northstar",
        itemId: "item-005",
        path: "tenders/other.xlsx",
      }),
    ).toThrow(/outside the configured scope/);
    expect(reads).toBe(0);

    await expect(
      store.put({
        organizationId: "consultancy-northstar",
        fileName: "other.xlsx",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        byteLength: 1,
        sha256: "a".repeat(64),
        content: (async function* () {})(),
        dispose: async () => undefined,
      }),
    ).rejects.toThrow(/outside the configured scope/);
    expect(writes).toBe(0);
  });

  it("rejects an adapter configured for a different SharePoint location", () => {
    expect(() =>
      createScopedSharePointDocumentStore(scope, {
        scope: { ...scope, driveId: "drive-other-customer" },
        put: async () => ({
          organizationId: scope.organizationId,
          itemId: "item-006",
          path: "tenders/valid.xlsx",
        }),
        read: async () => (async function* () {})(),
        remove: async () => undefined,
      }),
    ).toThrow(/outside the configured scope/);
  });

  it("rejects empty or ambiguous document paths", () => {
    for (const path of ["", ".", "tenders//rates.xlsx"]) {
      expect(() =>
        assertReferenceInScope(scope, {
          organizationId: scope.organizationId,
          itemId: "item-007",
          path,
        }),
      ).toThrow(/outside the configured scope/);
    }
  });
});
