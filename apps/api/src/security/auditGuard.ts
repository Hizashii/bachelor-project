// This file wraps a FileStore so nothing can change or move an audit file. Only appendLine works there.
// The product server wraps its store with this at startup.

import { AppError } from "../errors.ts";
import type { FileStore } from "../storage/types.ts";

const AUDIT_PREFIX = "audit/";

function refuse(path: string): void {
  if (path.startsWith(AUDIT_PREFIX)) {
    throw new AppError("FORBIDDEN", "The audit log can only be added to.");
  }
}

export function protectAudit(store: FileStore): FileStore {
  return {
    readJson: (path) => store.readJson(path),
    readBytes: (path) => store.readBytes(path),
    list: (directory) => store.list(directory),
    appendLine: (path, line) => store.appendLine(path, line),
    writeJson: async (path, data, ifMatch) => {
      refuse(path);
      return store.writeJson(path, data, ifMatch);
    },
    writeBytes: async (path, bytes, ifMatch) => {
      refuse(path);
      return store.writeBytes(path, bytes, ifMatch);
    },
    move: async (from, to) => {
      refuse(from);
      refuse(to);
      return store.move(from, to);
    },
  };
}
