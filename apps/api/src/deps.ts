// This file lists everything a route may use. Routes get these, they never create their own.

import type { AuditLog } from "./audit/audit.ts";
import type { Clock, IdMaker } from "./clock.ts";
import type { Mailer } from "./mail.ts";
import type { FileStore } from "./storage/types.ts";

export type AppConfig = {
  sessionSecret: string;
  // Allows POST /auth/dev-login. Must be false outside local development and tests.
  devLogin: boolean;
};

export type AppDeps = {
  store: FileStore;
  audit: AuditLog;
  clock: Clock;
  ids: IdMaker;
  mailer: Mailer;
  config: AppConfig;
};
