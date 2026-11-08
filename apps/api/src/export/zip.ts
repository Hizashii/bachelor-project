import { deflateRawSync, inflateRawSync } from "node:zlib";

export type ZipEntry = {
  name: string;
  data: Uint8Array;
};

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export function readZip(archive: Uint8Array): ZipEntry[] {
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  );
  const directoryOffset = findDirectoryOffset(view);
  const count = view.getUint16(directoryOffset + 10, true);
  const entries: ZipEntry[] = [];
  let cursor = view.getUint32(directoryOffset + 16, true);

  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error("The workbook archive is invalid.");
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = readName(archive, cursor + 46, nameLength, flags);
    entries.push({
      name,
      data: readEntryData(archive, localOffset, method, compressedSize),
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function writeZip(entries: readonly ZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = textEncoder.encode(entry.name);
    const compressed = entry.name.endsWith("/")
      ? entry.data
      : deflateRawSync(entry.data);
    const method = entry.name.endsWith("/") ? 0 : 8;
    const crc = crc32(entry.data);
    const local = createLocalHeader(
      name,
      method,
      crc,
      compressed.length,
      entry.data.length,
    );
    localParts.push(local, compressed);
    centralParts.push(
      createCentralHeader(
        name,
        method,
        crc,
        compressed.length,
        entry.data.length,
        offset,
      ),
    );
    offset += local.length + compressed.length;
  }

  const central = concat(centralParts);
  const local = concat(localParts);
  return concat([
    local,
    central,
    createEndRecord(entries.length, central.length, local.length),
  ]);
}

function findDirectoryOffset(view: DataView): number {
  for (let offset = view.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("The workbook archive has no central directory.");
}

function readName(
  archive: Uint8Array,
  offset: number,
  length: number,
  flags: number,
): string {
  const bytes = archive.slice(offset, offset + length);
  if ((flags & 0x800) === 0) return String.fromCharCode(...bytes);
  return textDecoder.decode(bytes);
}

function readEntryData(
  archive: Uint8Array,
  localOffset: number,
  method: number,
  compressedSize: number,
): Uint8Array {
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  );
  const nameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  const start = localOffset + 30 + nameLength + extraLength;
  const compressed = archive.slice(start, start + compressedSize);
  if (method === 0) return compressed;
  if (method === 8) return inflateRawSync(compressed);
  throw new Error("The workbook uses an unsupported compression method.");
}

function createLocalHeader(
  name: Uint8Array,
  method: number,
  crc: number,
  compressedSize: number,
  size: number,
): Uint8Array {
  const header = new Uint8Array(30 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x800, true);
  view.setUint16(8, method, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, compressedSize, true);
  view.setUint32(22, size, true);
  view.setUint16(26, name.length, true);
  header.set(name, 30);
  return header;
}

function createCentralHeader(
  name: Uint8Array,
  method: number,
  crc: number,
  compressedSize: number,
  size: number,
  offset: number,
): Uint8Array {
  const header = new Uint8Array(46 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x800, true);
  view.setUint16(10, method, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, compressedSize, true);
  view.setUint32(24, size, true);
  view.setUint16(28, name.length, true);
  view.setUint16(42, 0, true);
  view.setUint32(42, offset, true);
  header.set(name, 46);
  return header;
}

function createEndRecord(
  count: number,
  centralSize: number,
  centralOffset: number,
): Uint8Array {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  return record;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
