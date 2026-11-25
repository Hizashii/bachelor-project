// Reads S&A's registered Excel templates exactly as stored in the repository.
// The file hash must match the registry, so a changed template is never served by accident.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { findTemplateVersion } from "@freight-desk/shared";

const TEMPLATE_DIRECTORY = fileURLToPath(
  new URL("../../../../database/excel/", import.meta.url),
);
const REGISTERED_VERSION = "1.0.0";

export type TemplateKind = "customer-bidding" | "express-price";

export class TemplateFileError extends Error {}

export async function readTemplateFile(kind: TemplateKind): Promise<Buffer> {
  const template = findTemplateVersion(kind, REGISTERED_VERSION);
  if (!template) throw new TemplateFileError(`Template ${kind} is unknown.`);
  const bytes = await readFile(TEMPLATE_DIRECTORY + template.source.fileName);
  const hash = createHash("sha256").update(bytes).digest("hex").toUpperCase();
  if (hash !== template.source.sha256) {
    throw new TemplateFileError(
      `The ${kind} workbook does not match the registered version.`,
    );
  }
  return bytes;
}
