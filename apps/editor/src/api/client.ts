/** Thin fetch wrapper over the dev content-api (same-origin via Vite proxy / nginx). */
import type { CollectionIndex, CollectionName, FieldIssue, Manifest } from "@ggd/shared/content";

const BASE = "/content-api";

export class ApiValidationError extends Error {
  constructor(readonly issues: FieldIssue[]) {
    super("validation failed");
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    ...init,
  });
  if (res.status === 422) {
    const body = (await res.json()) as { errors?: FieldIssue[] };
    throw new ApiValidationError(body.errors ?? []);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${init?.method ?? "GET"} ${url} -> ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export interface WriteResult {
  id: string;
  hash: string;
  collectionHash: string;
  contentVersion: string;
}

export const api = {
  manifest: () => request<Manifest>(`${BASE}/manifest`),
  index: (collection: CollectionName) =>
    request<CollectionIndex>(`${BASE}/${collection}/_index`),
  doc: <T = unknown>(collection: CollectionName, id: string) =>
    request<T>(`${BASE}/${collection}/${id}`),
  put: (collection: CollectionName, id: string, doc: unknown) =>
    request<WriteResult>(`${BASE}/${collection}/${id}`, {
      method: "PUT",
      body: JSON.stringify(doc),
    }),
  create: (collection: CollectionName, id: string, doc: unknown) =>
    request<WriteResult>(`${BASE}/${collection}/${id}`, {
      method: "POST",
      body: JSON.stringify(doc),
    }),
  remove: (collection: CollectionName, id: string) =>
    request<{ id: string; deleted: boolean }>(`${BASE}/${collection}/${id}`, {
      method: "DELETE",
    }),
  validate: (collection: CollectionName, id: string, doc: unknown) =>
    request<{ ok: boolean; hash: string }>(`${BASE}/${collection}/${id}/validate`, {
      method: "POST",
      body: JSON.stringify(doc),
    }),
  /**
   * Write a binary asset (base64) to content/<contentPath>. Used by the AI-icon
   * Accept flow to store the generated PNG under assets/icons/<kind>/<id>.png.
   * `contentPath` must be under "assets/".
   */
  putAsset: (contentPath: string, base64: string) =>
    request<{ path: string; bytes: number }>(`${BASE}/${contentPath}`, {
      method: "PUT",
      body: JSON.stringify({ base64 }),
    }),
};
