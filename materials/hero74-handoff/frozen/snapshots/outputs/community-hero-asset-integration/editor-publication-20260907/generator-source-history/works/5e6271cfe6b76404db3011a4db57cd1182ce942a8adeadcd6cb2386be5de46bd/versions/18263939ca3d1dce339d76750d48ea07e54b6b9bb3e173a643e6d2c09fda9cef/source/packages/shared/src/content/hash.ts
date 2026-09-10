/**
 * Content-addressing — PURE functions of content (no wall clock, no fs).
 *
 *   object hash     = sha256(safeStableStringify(doc))            → 12 hex
 *   collection hash = sha256(stableStringify(sorted [{id,hash}])) → 12 hex
 *   contentVersion  = "cv_" + sha256(stableStringify({col: hash})) → "cv_" + 12 hex
 *
 * Stable stringify sorts object keys, so hashes are independent of key order.
 * Clients never hash — they only READ hashes (to build `?h=` cache-busting URLs).
 */
import stringify from "safe-stable-stringify";
import { sha256Hex } from "./sha256";

export const HASH_HEX_LEN = 12;

/** Deterministic JSON: keys sorted at every depth. Throws on undefined roots. */
export function stableStringify(value: unknown): string {
  const s = stringify(value);
  if (s === undefined) throw new Error("stableStringify: value serialized to undefined");
  return s;
}

/** 12-hex content hash of a single document object. */
export function hashDoc(doc: unknown): string {
  return sha256Hex(stableStringify(doc)).slice(0, HASH_HEX_LEN);
}

/** 12-hex hash of a collection, derived purely from its members' {id, hash}. */
export function hashCollection(entries: readonly { id: string; hash: string }[]): string {
  const sorted = entries
    .map(({ id, hash }) => ({ id, hash }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sha256Hex(stableStringify(sorted)).slice(0, HASH_HEX_LEN);
}

/** `cv_<12 hex>` — a pure function of every collection hash (thus of all content). */
export function contentVersion(collectionHashes: Record<string, string>): string {
  return "cv_" + sha256Hex(stableStringify(collectionHashes)).slice(0, HASH_HEX_LEN);
}
