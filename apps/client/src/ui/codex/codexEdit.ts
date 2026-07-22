/**
 * codexEdit — the ONLY module in the codex that writes, and the client half of
 * task #96's two-layer authorisation.
 *
 * LAYER A, and what "gated" means here. `ENABLED` is `import.meta.env.DEV`, read
 * through the repo's proven guarded shape (render/views/blizzardOverlay.ts):
 * vite substitutes the flag statically, so in a real `vite build` this collapses
 * to `false`, rollup dead-folds every guard, and — because CodexPage only ever
 * reaches this module through an `import.meta.env.DEV`-guarded dynamic import —
 * the chunk is never emitted at all. The write path is ABSENT from a production
 * build, not merely hidden. `codexEditGate.test.ts` asserts both halves, and its
 * opt-in build test runs a real `vite build` and greps the output.
 *
 * The try/catch is not decoration: this file is also imported by plain-node
 * vitest, where `import.meta.env` does not exist, and every exported writer must
 * be inert there rather than throwing.
 *
 * LAYER B is the server, and it is the real access control: apps/content-api
 * refuses any mutating request that did not arrive from a loopback peer with a
 * local dev Origin (see apps/content-api/src/guard.ts). Nothing in this file is
 * trusted by it. A client-side check is a courtesy to the user, never a lock.
 *
 * WHERE THE ROUTE EXISTS. Every URL below is SAME-ORIGIN `/content-api`, so
 * this module works from whichever dev server proxies it — and only those do.
 * The game client's own dev server deliberately does NOT: it is the one server
 * published to the LAN (`client-lan`, --host 0.0.0.0), and a proxy hop there
 * would launder a phone's address into a loopback peer. Content editing is
 * served from the loopback-pinned admin console (127.0.0.1:60721) and the
 * docker dev edge. Opened anywhere else, `probeContentApi` returns false and
 * the panel says so instead of failing at save time.
 *
 * UNDO. This repo has no version control (task #65) and has already lost files
 * once. Every save here is preceded by a server dry-run validate, and the server
 * snapshots the bytes it is about to overwrite; `listBackups`/`restoreBackup`
 * expose that history so a bad edit is recoverable from the same panel that
 * made it.
 */
import {
  collectionOf,
  docUrl,
  manifestUrl,
  type CodexCollection,
  type WritePlanStep,
} from "./codexEditModel";
import type { CodexKind } from "@ggd/shared/codex/codexTypes";

/** Vite dev flag, guarded so plain node (vitest) never throws. */
function isDevBuild(): boolean {
  try {
    return Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
}

/** Dead-folds to `false` in a production build; every writer below checks it. */
const ENABLED = isDevBuild();

export interface EditIssue {
  readonly path: string;
  readonly message: string;
  readonly code: string;
}

export interface WroteDoc {
  readonly collection: CodexCollection;
  readonly id: string;
  readonly reason: WritePlanStep["reason"];
  /** undo snapshot the server took before overwriting (null = nothing existed) */
  readonly backup: string | null;
}

export interface SaveOutcome {
  readonly ok: boolean;
  /** per-field schema issues from the SHARED zod schemas the game loader uses */
  readonly issues: readonly EditIssue[];
  /** transport / permission / server failure, already human-readable */
  readonly error: string | null;
  readonly written: readonly WroteDoc[];
  readonly contentVersion: string | null;
}

export interface BackupEntry {
  readonly file: string;
  readonly at: number;
  readonly bytes: number;
}

const OFF: SaveOutcome = {
  ok: false,
  issues: [],
  error: "編輯功能只在本機開發版本存在（此版本未內含）",
  written: [],
  contentVersion: null,
};

// ---------------------------------------------------------------------------

interface RawResponse {
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

type EditFetch = (url: string, init: RequestInit) => Promise<RawResponse>;

function defaultFetch(url: string, init: RequestInit): Promise<RawResponse> {
  return fetch(url, init);
}

function issuesOf(body: unknown): EditIssue[] {
  const errs = (body as { errors?: unknown } | null)?.errors;
  if (!Array.isArray(errs)) return [];
  return errs.flatMap((e) => {
    const r = e as { path?: unknown; message?: unknown; code?: unknown };
    return typeof r?.message === "string"
      ? [
          {
            path: typeof r.path === "string" ? r.path : "",
            message: r.message,
            code: typeof r.code === "string" ? r.code : "invalid",
          },
        ]
      : [];
  });
}

function errorOf(body: unknown, status: number, url: string): string {
  const msg = (body as { error?: unknown } | null)?.error;
  if (typeof msg === "string" && msg !== "") return msg;
  return `${url} → HTTP ${status}`;
}

interface Attempt {
  status: number;
  body: unknown;
}

async function send(fetchFn: EditFetch, url: string, method: string, body?: unknown): Promise<Attempt> {
  const res = await fetchFn(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
}

export interface CodexEditOptions {
  /** injected by tests; the browser fetch otherwise */
  fetchFn?: EditFetch;
}

// ---------------------------------------------------------------------------
// the write surface — EVERY export below short-circuits on ENABLED
// ---------------------------------------------------------------------------

/** Is the dev content-api actually up? (false when the gate is off.) */
export async function probeContentApi(opts: CodexEditOptions = {}): Promise<boolean> {
  if (!ENABLED) return false;
  try {
    const res = await (opts.fetchFn ?? defaultFetch)(manifestUrl(), { method: "GET" });
    return res.status === 200;
  } catch {
    return false;
  }
}

/** Server dry-run: the shared zod schemas, no write. Empty = the doc is valid. */
export async function validateDoc(
  kind: CodexKind,
  id: string,
  doc: Record<string, unknown>,
  opts: CodexEditOptions = {},
): Promise<{ ok: boolean; issues: EditIssue[]; error: string | null }> {
  if (!ENABLED) return { ok: false, issues: [], error: OFF.error };
  const url = docUrl(collectionOf(kind), id, "validate");
  try {
    const res = await send(opts.fetchFn ?? defaultFetch, url, "POST", doc);
    if (res.status === 200) return { ok: true, issues: [], error: null };
    if (res.status === 422) return { ok: false, issues: issuesOf(res.body), error: null };
    return { ok: false, issues: [], error: errorOf(res.body, res.status, url) };
  } catch (e) {
    return { ok: false, issues: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Save a write plan. Validates EVERY step first (so a doomed second write can
 * never leave the mirror half-applied), then writes them in order. A failure
 * after the first write is reported loudly WITH the undo snapshot names — a
 * silent desync between an ability and its embedded twin is exactly the bug
 * this editor must not create.
 */
export async function saveDocs(
  steps: readonly WritePlanStep[],
  opts: CodexEditOptions = {},
): Promise<SaveOutcome> {
  if (!ENABLED) return OFF;
  const fetchFn = opts.fetchFn ?? defaultFetch;
  const issues: EditIssue[] = [];
  for (const step of steps) {
    const url = docUrl(step.collection, step.id, "validate");
    try {
      const res = await send(fetchFn, url, "POST", step.doc);
      if (res.status === 422) issues.push(...issuesOf(res.body));
      else if (res.status !== 200) {
        return { ...OFF, error: errorOf(res.body, res.status, url) };
      }
    } catch (e) {
      return { ...OFF, error: e instanceof Error ? e.message : String(e) };
    }
  }
  if (issues.length > 0) return { ok: false, issues, error: null, written: [], contentVersion: null };

  const written: WroteDoc[] = [];
  let contentVersion: string | null = null;
  for (const step of steps) {
    const url = docUrl(step.collection, step.id);
    try {
      const res = await send(fetchFn, url, "PUT", step.doc);
      if (res.status !== 200 && res.status !== 201) {
        return {
          ok: false,
          issues: issuesOf(res.body),
          error: errorOf(res.body, res.status, url),
          written,
          contentVersion,
        };
      }
      const body = res.body as { contentVersion?: unknown; backup?: unknown } | null;
      contentVersion = typeof body?.contentVersion === "string" ? body.contentVersion : contentVersion;
      written.push({
        collection: step.collection,
        id: step.id,
        reason: step.reason,
        backup: typeof body?.backup === "string" ? body.backup : null,
      });
    } catch (e) {
      return {
        ok: false,
        issues: [],
        error: e instanceof Error ? e.message : String(e),
        written,
        contentVersion,
      };
    }
  }
  return { ok: true, issues: [], error: null, written, contentVersion };
}

/** Undo history for one document, newest first. */
export async function listBackups(
  collection: CodexCollection,
  id: string,
  opts: CodexEditOptions = {},
): Promise<BackupEntry[]> {
  if (!ENABLED) return [];
  try {
    const res = await send(opts.fetchFn ?? defaultFetch, docUrl(collection, id, "backups"), "GET");
    const entries = (res.body as { entries?: unknown } | null)?.entries;
    if (!Array.isArray(entries)) return [];
    return entries.flatMap((e) => {
      const r = e as { file?: unknown; at?: unknown; bytes?: unknown };
      return typeof r?.file === "string"
        ? [{ file: r.file, at: typeof r.at === "number" ? r.at : 0, bytes: typeof r.bytes === "number" ? r.bytes : 0 }]
        : [];
    });
  } catch {
    return [];
  }
}

/** Put a snapshot back. Omit `file` to undo the most recent save. */
export async function restoreBackup(
  collection: CodexCollection,
  id: string,
  file?: string,
  opts: CodexEditOptions = {},
): Promise<{ ok: boolean; restored: string | null; error: string | null }> {
  if (!ENABLED) return { ok: false, restored: null, error: OFF.error };
  const url = docUrl(collection, id, "restore");
  try {
    const res = await send(opts.fetchFn ?? defaultFetch, url, "POST", file === undefined ? {} : { file });
    if (res.status !== 200) return { ok: false, restored: null, error: errorOf(res.body, res.status, url) };
    const restored = (res.body as { restored?: unknown } | null)?.restored;
    return { ok: true, restored: typeof restored === "string" ? restored : null, error: null };
  } catch (e) {
    return { ok: false, restored: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------

export interface CodexEditApi {
  /** false ⇒ the UI must not render any editing affordance */
  readonly enabled: boolean;
  readonly probe: typeof probeContentApi;
  readonly validate: typeof validateDoc;
  readonly save: typeof saveDocs;
  readonly backups: typeof listBackups;
  readonly restore: typeof restoreBackup;
}

/**
 * The handle CodexPage holds. Constructed only from an
 * `import.meta.env.DEV`-guarded dynamic import, and still reports `enabled`
 * from the module gate so any other caller gets an inert object.
 */
export function createCodexEdit(): CodexEditApi {
  return {
    enabled: ENABLED,
    probe: probeContentApi,
    validate: validateDoc,
    save: saveDocs,
    backups: listBackups,
    restore: restoreBackup,
  };
}
