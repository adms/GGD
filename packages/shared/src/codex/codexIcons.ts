/**
 * codexIcons — hashes the actual ICON BYTES so the codex can report the
 * mis-assigned art (task #71 broken-data report).
 *
 * WHY BYTES AND NOT PATHS. The w3x icon extraction mis-assigned images: several
 * groups of entries ship BYTE-IDENTICAL PNGs at different paths (曹操孟德 wears
 * 皮卡丘's portrait). Nothing in the docs records that — the only evidence is
 * the file content — so the only honest detector is a content hash. 113 PNGs
 * exist on disk in total, so the scan is one short HTTP burst.
 *
 * IT RUNS AFTER, AND NEVER BLOCKS, THE BROWSE PATH: the page renders from the
 * JSON load, then this fills the duplicate-icon group in. The user asked for the
 * broken-data report to be supplementary reference material at the bottom of
 * the page, and this keeps it exactly that — a background pass, not a gate.
 *
 * ⚠️ A shared portrait is a MISSING/MIS-ASSIGNED-ART fact and says NOTHING
 * about champion identity — that is the hero 編號 and lives in
 * `@ggd/shared/content/championIdentity` (task #55, the 黑化Saber bug). Never
 * feed this hash back into a "same hero?" decision.
 */

export interface IconFetchResponse {
  ok: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface HashIconsOptions {
  /** injected for tests; defaults to the global fetch */
  fetchFn?: (url: string) => Promise<IconFetchResponse>;
  /** injected for tests; defaults to SHA-256 via WebCrypto */
  digest?: (bytes: Uint8Array) => Promise<string>;
  /** content mount (default "/content") */
  base?: string;
  /** parallel in-flight image requests (default 12) */
  concurrency?: number;
}

export interface IconHashes {
  /** content-relative icon path → hex content hash */
  readonly hashes: ReadonlyMap<string, string>;
  /** declared icon paths that could not be fetched (404 / network) */
  readonly failed: readonly string[];
}

export const EMPTY_ICON_HASHES: IconHashes = { hashes: new Map(), failed: [] };

/** SHA-256 → lowercase hex, via WebCrypto (present in browsers and Node ≥18). */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // copy into a plain ArrayBuffer — digest()'s BufferSource excludes the
  // SharedArrayBuffer-backed view type the DOM lib infers here
  const source = new Uint8Array(bytes).buffer as ArrayBuffer;
  const buf = await crypto.subtle.digest("SHA-256", source);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hash every distinct icon path. Never rejects: an unfetchable icon lands in
 * `failed` (which is itself worth reporting — a doc that DECLARES an icon the
 * server cannot serve is a different defect from one that declares none).
 */
export async function hashIcons(
  paths: readonly string[],
  opts: HashIconsOptions = {},
): Promise<IconHashes> {
  const fetchFn = opts.fetchFn ?? ((url: string) => fetch(url));
  const digest = opts.digest ?? sha256Hex;
  const base = opts.base ?? "/content";
  const distinct = [...new Set(paths)].sort();
  const hashes = new Map<string, string>();
  const failed: string[] = [];

  let next = 0;
  const workers = Math.max(1, Math.min(opts.concurrency ?? 12, Math.max(1, distinct.length)));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const i = next++;
        if (i >= distinct.length) return;
        const path = distinct[i] as string;
        try {
          const res = await fetchFn(`${base}/${path}`);
          if (!res.ok) {
            failed.push(path);
            continue;
          }
          hashes.set(path, await digest(new Uint8Array(await res.arrayBuffer())));
        } catch {
          failed.push(path);
        }
      }
    }),
  );
  return { hashes, failed: failed.sort() };
}

/**
 * Group icon paths that share the same bytes. Only groups of 2+ come back,
 * ordered by path so the report is stable between runs.
 */
export function duplicateIconGroups(hashes: ReadonlyMap<string, string>): Map<string, string[]> {
  const byHash = new Map<string, string[]>();
  for (const [path, hash] of hashes) {
    const list = byHash.get(hash) ?? [];
    list.push(path);
    byHash.set(hash, list);
  }
  const out = new Map<string, string[]>();
  for (const [hash, paths] of byHash) {
    if (paths.length > 1) out.set(hash, [...paths].sort());
  }
  return out;
}
