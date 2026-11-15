// Reads the table of contents of an xlsx (a zip file) before it is opened, and refuses
// files that would expand far beyond their size on disk (zip bombs).
// Not for reading cell values: see readRows.ts.

import { open, stat } from "node:fs/promises";
import { importLimits } from "./limits.ts";

const END_RECORD_SIGNATURE = 0x06054b50;
const CENTRAL_ENTRY_SIGNATURE = 0x02014b50;
const END_RECORD_MIN_LENGTH = 22;
const MAX_COMMENT_LENGTH = 0xffff;
const CENTRAL_ENTRY_FIXED_LENGTH = 46;
const MAX_EXPANSION_RATIO = 200;

export class ZipTooLargeError extends Error {}

export async function uncompressedSize(path: string): Promise<number> {
  const { size } = await stat(path);
  const handle = await open(path, "r");
  try {
    const tailLength = Math.min(
      size,
      END_RECORD_MIN_LENGTH + MAX_COMMENT_LENGTH,
    );
    const tail = Buffer.alloc(tailLength);
    await handle.read(tail, 0, tailLength, size - tailLength);
    const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (end < 0 || tail.readUInt32LE(end) !== END_RECORD_SIGNATURE) {
      throw new ZipTooLargeError("The Excel file could not be read.");
    }
    const entryCount = tail.readUInt16LE(end + 10);
    const directorySize = tail.readUInt32LE(end + 12);
    const directory = Buffer.alloc(directorySize);
    await handle.read(directory, 0, directorySize, tail.readUInt32LE(end + 16));
    return sumEntries(directory, entryCount);
  } finally {
    await handle.close();
  }
}

function sumEntries(directory: Buffer, entryCount: number): number {
  let offset = 0;
  let total = 0;
  for (let i = 0; i < entryCount; i += 1) {
    if (directory.readUInt32LE(offset) !== CENTRAL_ENTRY_SIGNATURE) break;
    total += directory.readUInt32LE(offset + 24);
    const names = directory.readUInt16LE(offset + 28);
    const extra = directory.readUInt16LE(offset + 30);
    const comment = directory.readUInt16LE(offset + 32);
    offset += CENTRAL_ENTRY_FIXED_LENGTH + names + extra + comment;
  }
  return total;
}

export async function assertSafeXlsx(path: string): Promise<number> {
  const total = await uncompressedSize(path).catch(() => {
    throw new ZipTooLargeError("The Excel file could not be read.");
  });
  const { size } = await stat(path);
  if (
    total > importLimits.maxUncompressedBytes ||
    total > size * MAX_EXPANSION_RATIO
  ) {
    throw new ZipTooLargeError("The Excel file is too large when opened.");
  }
  return total;
}
