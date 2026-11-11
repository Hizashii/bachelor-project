// This file calls the carrier tender API from the browser. It never sends a company id; the server knows it.
import {
  carrierTenderListSchema,
  carrierTenderSchema,
} from "@freight-desk/shared";
import { useEffect, useState } from "react";

export class NotFoundError extends Error {}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (response.status === 404) throw new NotFoundError();
  if (!response.ok) throw new Error("request failed");
  return response.json();
}

export const fetchTenders = async (status: "active" | "closed") =>
  carrierTenderListSchema.parse(
    await getJson(`/api/carrier/tenders?status=${status}`),
  ).tenders;

export const fetchTender = async (id: string) =>
  carrierTenderSchema.parse(
    await getJson(`/api/carrier/tenders/${encodeURIComponent(id)}`),
  );

export type Loaded<T> =
  | { kind: "loading" }
  | { kind: "error"; notFound: boolean }
  | { kind: "ready"; data: T };

function settle<T>(
  load: () => Promise<T>,
  apply: (next: Loaded<T>) => unknown,
) {
  apply({ kind: "loading" });
  load().then(
    (data) => apply({ kind: "ready", data }),
    (error) =>
      apply({ kind: "error", notFound: error instanceof NotFoundError }),
  );
}

// `load` must be stable (wrap it in useCallback) or it reloads on every render.
export function useLoad<T>(load: () => Promise<T>) {
  const [state, setState] = useState<Loaded<T>>({ kind: "loading" });
  useEffect(() => {
    let current = true;
    settle(load, (next) => current && setState(next));
    return () => {
      current = false;
    };
  }, [load]);
  const retry = () => settle(load, setState);
  return { state, retry };
}
