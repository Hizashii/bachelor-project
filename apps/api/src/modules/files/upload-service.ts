import { createReadStream, type ReadStream } from "node:fs";
import { type FileHandle, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApiError } from "../../http/errors.ts";
import type { SharePointUpload } from "../../infrastructure/microsoft365/sharepoint.ts";
import {
  type UploadMetadata,
  validateUploadMetadata,
} from "./upload-policy.ts";
import { createBoundedUpload, verifyUploadDigest } from "./upload-stream.ts";

export type UploadSource = {
  organizationId: string;
  metadata: UploadMetadata;
  chunks: AsyncIterable<Uint8Array>;
};

export async function stageUpload(
  source: UploadSource,
  maxBytes: number,
): Promise<SharePointUpload> {
  const metadata = validateUploadMetadata(source.metadata, maxBytes);
  const bounded = createBoundedUpload(source.chunks, maxBytes);
  const directory = await mkdtemp(join(tmpdir(), "freight-desk-upload-"));
  const filePath = join(directory, "payload.bin");
  let file: FileHandle | undefined;

  try {
    file = await open(filePath, "wx");
    for await (const chunk of bounded.stream) await file.write(chunk);
    await file.close();
    file = undefined;

    const sha256 = bounded.sha256();
    if (!sha256) throw new Error("Upload checksum was not completed.");
    if (
      metadata.declaredByteLength !== undefined &&
      metadata.declaredByteLength !== bounded.byteLength()
    ) {
      throw new ApiError(
        "bad_request",
        400,
        "The declared upload size does not match the content.",
      );
    }
    verifyUploadDigest(metadata.sha256, sha256);

    const content = createReadStream(filePath);
    let disposed = false;
    return {
      organizationId: source.organizationId,
      fileName: metadata.fileName,
      contentType: metadata.contentType,
      byteLength: bounded.byteLength(),
      sha256,
      content,
      dispose: async () => {
        if (disposed) return;
        disposed = true;
        await closeReadStream(content);
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await file?.close().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function closeReadStream(stream: ReadStream): Promise<void> {
  if (stream.closed) return;

  await new Promise<void>((resolve) => {
    const finish = () => {
      stream.removeListener("close", finish);
      stream.removeListener("error", finish);
      resolve();
    };
    stream.once("close", finish);
    stream.once("error", finish);
    stream.destroy();
  });
}
