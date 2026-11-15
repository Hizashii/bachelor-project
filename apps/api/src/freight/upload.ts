// Receives one uploaded file as a raw request body and writes it to a temporary folder,
// stopping as soon as it grows past the size limit.
// Not for reading the file: see imports/importService.ts.

import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { importLimits } from "../imports/limits.ts";
import {
  createWorkspace,
  removeWorkspace,
  type Workspace,
} from "../imports/tempFiles.ts";

export class UploadTooLargeError extends Error {}

function sizeLimit(maxBytes: number): Transform {
  let received = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      received += chunk.length;
      if (received > maxBytes) done(new UploadTooLargeError());
      else done(null, chunk);
    },
  });
}

export async function receiveUpload(
  body: NodeJS.ReadableStream | Buffer,
): Promise<{ workspace: Workspace; path: string }> {
  const workspace = await createWorkspace();
  const path = join(workspace.dir, "upload.tmp");
  try {
    await pipeline(
      Buffer.isBuffer(body) ? Readable.from([body]) : body,
      sizeLimit(importLimits.maxFileBytes),
      createWriteStream(path),
    );
    return { workspace, path };
  } catch (error) {
    await removeWorkspace(workspace);
    throw error;
  }
}
