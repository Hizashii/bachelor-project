// In-memory stand-ins for the FileStore and PermissionChecker contracts.
// Used by automated tests only; never wired into the running server.

import type {
  AccessContext,
  ImportAction,
  PermissionChecker,
  ResourceRef,
} from "../contracts/access.ts";
import {
  type FileStore,
  StorageConflictError,
  type StoredFile,
} from "../contracts/fileStore.ts";

export function createMemoryStore(): FileStore & {
  files: Map<string, { value: unknown; etag: number }>;
} {
  const files = new Map<string, { value: unknown; etag: number }>();
  const stored = (path: string, etag: number): StoredFile => ({
    path,
    etag: String(etag),
    sizeBytes: 1,
  });
  return {
    files,
    async putJson(_context, path, value, ifMatch) {
      const existing = files.get(path);
      if (
        ifMatch !== undefined &&
        existing &&
        String(existing.etag) !== ifMatch
      ) {
        throw new StorageConflictError();
      }
      const etag = (existing?.etag ?? 0) + 1;
      files.set(path, { value: structuredClone(value), etag });
      return stored(path, etag);
    },
    async getJson(_context, path) {
      const file = files.get(path);
      return file
        ? { value: structuredClone(file.value), etag: String(file.etag) }
        : null;
    },
    async list(_context, folder) {
      return [...files.entries()]
        .filter(([path]) => path.startsWith(`${folder}/`))
        .map(([path, file]) => stored(path, file.etag));
    },
    async putFile(_context, path) {
      return stored(path, 1);
    },
    async getFile() {},
  };
}

// Carriers touch only their own organisation and cannot approve. Consultancy staff may do
// everything. The real checker is supplied by the sign-in work.
export const rolePermissions: PermissionChecker = {
  can(context: AccessContext, action: ImportAction, resource: ResourceRef) {
    if (context.role === "carrier") {
      const own = context.organisationId === resource.organisationId;
      return (
        own &&
        [
          "tariff:edit",
          "tariff:submit",
          "tariff:read",
          "import:upload",
          "import:read",
        ].includes(action)
      );
    }
    return true;
  },
};
