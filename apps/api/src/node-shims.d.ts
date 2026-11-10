declare module "node:fs/promises" {
  export function readFile(path: string): Promise<Uint8Array>;
}

declare module "node:zlib" {
  export function deflateRawSync(data: Uint8Array): Uint8Array;
  export function inflateRawSync(data: Uint8Array): Uint8Array;
}

declare const process: {
  env: Record<string, string | undefined>;
};

declare function fetch(
  input: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  },
): Promise<{ ok: boolean; status: number }>;
