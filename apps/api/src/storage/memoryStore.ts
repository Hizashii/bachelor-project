// This file is a fake file library for tests. It mimics the ETag and create-only rules of Graph.
// It is not used in production.

import { AppError } from "../errors.ts";
import type { FileStore, Versioned } from "./types.ts";

type Entry = { bytes: Uint8Array; etag: string };

export class MemoryStore implements FileStore {
  private readonly files = new Map<string, Entry>();
  private counter = 0;

  async readJson(path: string): Promise<Versioned<unknown> | null> {
    const entry = this.files.get(path);
    if (!entry) return null;
    const text = new TextDecoder().decode(entry.bytes);
    return { data: JSON.parse(text), etag: entry.etag };
  }

  async writeJson(path: string, data: unknown, ifMatch: string | null) {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    return this.writeBytes(path, bytes, ifMatch);
  }

  async readBytes(path: string): Promise<Versioned<Uint8Array> | null> {
    const entry = this.files.get(path);
    return entry ? { data: entry.bytes, etag: entry.etag } : null;
  }

  async writeBytes(path: string, bytes: Uint8Array, ifMatch: string | null) {
    const existing = this.files.get(path);
    if (ifMatch === null && existing) {
      throw new AppError("CONFLICT", "That file already exists.");
    }
    if (ifMatch !== null && existing?.etag !== ifMatch) {
      throw new AppError("PRECONDITION_FAILED", "The file changed. Reload it.");
    }
    return { etag: this.save(path, bytes) };
  }

  async list(directory: string): Promise<string[]> {
    const prefix = directory.endsWith("/") ? directory : `${directory}/`;
    const names = new Set<string>();
    for (const path of this.files.keys()) {
      if (path.startsWith(prefix)) {
        names.add(path.slice(prefix.length).split("/")[0] ?? "");
      }
    }
    return [...names].filter((name) => name !== "").sort();
  }

  async appendLine(path: string, line: string): Promise<void> {
    const existing = this.files.get(path);
    const old = existing ? new TextDecoder().decode(existing.bytes) : "";
    this.save(path, new TextEncoder().encode(`${old}${line}\n`));
  }

  async move(from: string, to: string): Promise<void> {
    const entry = this.files.get(from);
    if (!entry) throw new AppError("NOT_FOUND", "That file was not found.");
    if (this.files.has(to)) {
      throw new AppError("CONFLICT", "That file already exists.");
    }
    this.files.set(to, entry);
    this.files.delete(from);
  }

  private save(path: string, bytes: Uint8Array): string {
    this.counter += 1;
    const etag = `etag-${this.counter}`;
    this.files.set(path, { bytes, etag });
    return etag;
  }
}
