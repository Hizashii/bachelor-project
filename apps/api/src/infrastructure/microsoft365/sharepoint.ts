export type SharePointScope = Readonly<{
  organizationId: string;
  tenantId: string;
  siteId: string;
  driveId: string;
}>;

export type SharePointDocumentReference = {
  organizationId: string;
  itemId: string;
  path: string;
};

export type SharePointUpload = {
  organizationId: string;
  fileName: string;
  contentType: string;
  byteLength: number;
  sha256: string;
  content: AsyncIterable<Uint8Array>;
  dispose: () => Promise<void>;
};

export type SharePointDocumentStoreOperations = {
  readonly scope: SharePointScope;
  put(upload: SharePointUpload): Promise<SharePointDocumentReference>;
  read(
    reference: SharePointDocumentReference,
  ): Promise<AsyncIterable<Uint8Array>>;
  remove(reference: SharePointDocumentReference): Promise<void>;
};

export interface SharePointDocumentStore
  extends SharePointDocumentStoreOperations {
  readonly scope: SharePointScope;
}

export class SharePointScopeError extends Error {
  constructor() {
    super("The SharePoint document is outside the configured scope.");
    this.name = "SharePointScopeError";
  }
}

export function isReferenceInScope(
  scope: SharePointScope,
  reference: SharePointDocumentReference,
): boolean {
  const normalizedPath = reference.path.replaceAll("\\", "/");
  const pathSegments = normalizedPath.split("/");
  return (
    reference.organizationId === scope.organizationId &&
    reference.itemId.trim() !== "" &&
    normalizedPath !== "" &&
    !normalizedPath.startsWith("/") &&
    !pathSegments.includes(".") &&
    !pathSegments.includes("..") &&
    !pathSegments.includes("")
  );
}

export function assertReferenceInScope(
  scope: SharePointScope,
  reference: SharePointDocumentReference,
): void {
  if (!isReferenceInScope(scope, reference)) throw new SharePointScopeError();
}

export function createScopedSharePointDocumentStore(
  scope: SharePointScope,
  operations: SharePointDocumentStoreOperations,
): SharePointDocumentStore {
  if (!sameScope(scope, operations.scope)) throw new SharePointScopeError();

  return {
    scope,
    put: async (upload) => {
      if (upload.organizationId !== scope.organizationId) {
        throw new SharePointScopeError();
      }
      const reference = await operations.put(upload);
      assertReferenceInScope(scope, reference);
      return reference;
    },
    read: (reference) => {
      assertReferenceInScope(scope, reference);
      return operations.read(reference);
    },
    remove: (reference) => {
      assertReferenceInScope(scope, reference);
      return operations.remove(reference);
    },
  };
}

function sameScope(left: SharePointScope, right: SharePointScope): boolean {
  return (
    left.organizationId === right.organizationId &&
    left.tenantId === right.tenantId &&
    left.siteId === right.siteId &&
    left.driveId === right.driveId
  );
}
