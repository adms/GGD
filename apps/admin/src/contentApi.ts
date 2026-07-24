/**
 * contentApi — the ONLY module in the admin console that writes to content/,
 * and the client half of task #102's authorisation. It is #96's proven shape,
 * re-homed rather than rewritten: same gate, same undo-first save order, same
 * "validate everything before writing anything" rule.
 *
 * ── WHAT ACTUALLY STOPS A LAN DEVICE ────────────────────────────────────────
 * Not this file. Authorisation is by REACHABILITY:
 *
 *   1. the admin vite dev server binds 127.0.0.1 and REFUSES to start with a
 *      non-loopback --host (src/dev/loopbackOnly.ts), so the `/content-api`
 *      proxy has no front door a LAN device can knock on;
 *   2. the content-api itself binds loopback only (index.ts) and re-checks the
 *      socket peer on every mutating verb (guard.ts), ignoring every forwarded
 *      header by construction.
 *
 * This module is layer zero: a courtesy to the user, never a lock. Its job is
 * to make the UI honest — to not offer a save button in a build where saving
 * cannot work.
 *
 * ── THE DEV GATE ─────────────────────────────────────────────────────────────
 * `ENABLED` is `import.meta.env.DEV`, read through the repo's proven guarded
 * shape. Vite substitutes the flag statically, rollup dead-folds every guard,
 * and — because App.tsx only reaches the page through an
 * `import.meta.env.DEV`-guarded dynamic import — the chunk is never emitted at
 * all. The editor is ABSENT from a production admin build, not hidden.
 * The try/catch is load-bearing: this file is also imported by plain-node
 * vitest, where `import.meta.env` does not exist, and every writer must be
 * inert there rather than throwing.
 *
 * ── NO VERSION CONTROL (task #65) ────────────────────────────────────────────
 * This repo has no VCS and has already lost irreplaceable files once. So a save
 * here is never a bare PUT:
 *   • every step is dry-run VALIDATED first, so a doomed second write can never
 *     leave the ability/champion mirror half-applied;
 *   • the server snapshots the bytes it is about to destroy BEFORE destroying
 *     them, and returns the snapshot name, which `backups`/`restore` expose;
 *   • the caller is expected to show the user a diff and make them confirm —
 *     see ContentPage's two-step 確認寫入 flow.
 *
 * ── contentVersion (cv_…) ────────────────────────────────────────────────────
 * Content is hashed into a `contentVersion` that client and server COMPARE. A
 * write changes it, so a match already in flight is now running older content
 * than the disk. Every write result carries the NEW cv_ back so the UI can say
 * so out loud instead of letting a silent desync happen.
 */
import {
  docUrl,
  manifestUrl,
  writePlan,
  type EditCollection,
  type WritePlanStep,
} from "@ggd/shared/content/editModel";

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
  readonly collection: EditCollection;
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

const OFF_MESSAGE =
  "內容編輯只存在於本機開發版本（此版本未內含）。請用 pnpm dev:all 後開 http://127.0.0.1:60721/admin/";

const OFF: SaveOutcome = {
  ok: false,
  issues: [],
  error: OFF_MESSAGE,
  written: [],
  contentVersion: null,
};

// ---------------------------------------------------------------------------

interface RawResponse {
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type EditFetch = (url: string, init: RequestInit) => Promise<RawResponse>;

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
  if (status === 404) {
    return `${url} → 404（content-api 沒在跑？請執行 pnpm --filter @ggd/content-api dev）`;
  }
  return `${url} → HTTP ${status}`;
}

interface Attempt {
  status: number;
  body: unknown;
}

async function send(
  fetchFn: EditFetch,
  url: string,
  method: string,
  body?: unknown,
): Promise<Attempt> {
  // The content-type header may only be sent WITH a body. Fastify rejects
  // `content-type: application/json` on a bodyless request with 400
  // FST_ERR_CTP_EMPTY_JSON_BODY — which is exactly what silently broke the
  // 刪除 button (DELETE takes no body), so task #70 rule 3's 「移除一個三選一
  // 強化」 answered 「Bad Request」 for every document the console ever created.
  const res = await fetchFn(url, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
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

export interface ContentApiOptions {
  /** injected by tests; the browser fetch otherwise */
  fetchFn?: EditFetch;
}

// ---------------------------------------------------------------------------
// the surface — EVERY export below short-circuits on ENABLED
// ---------------------------------------------------------------------------

/** Is the dev content-api actually up? (false when the gate is off.) */
export async function probeContentApi(opts: ContentApiOptions = {}): Promise<boolean> {
  if (!ENABLED) return false;
  try {
    const res = await (opts.fetchFn ?? defaultFetch)(manifestUrl(), { method: "GET" });
    return res.status === 200;
  } catch {
    return false;
  }
}

/** The live contentVersion the content-api reports (null when unavailable). */
export async function currentContentVersion(opts: ContentApiOptions = {}): Promise<string | null> {
  if (!ENABLED) return null;
  try {
    const res = await send(opts.fetchFn ?? defaultFetch, manifestUrl(), "GET");
    const cv = (res.body as { contentVersion?: unknown } | null)?.contentVersion;
    return typeof cv === "string" ? cv : null;
  } catch {
    return null;
  }
}

/**
 * Read ONE document straight from the content-api rather than the cached
 * `/content` static mount, so the editor always drafts from the bytes actually
 * on disk. Editing a stale copy is how an editor silently reverts someone
 * else's change.
 */
export async function fetchDoc(
  collection: EditCollection,
  id: string,
  opts: ContentApiOptions = {},
): Promise<{ doc: Record<string, unknown> | null; error: string | null }> {
  if (!ENABLED) return { doc: null, error: OFF_MESSAGE };
  const url = docUrl(collection, id);
  try {
    const res = await send(opts.fetchFn ?? defaultFetch, url, "GET");
    if (res.status !== 200) return { doc: null, error: errorOf(res.body, res.status, url) };
    if (typeof res.body !== "object" || res.body === null || Array.isArray(res.body)) {
      return { doc: null, error: `${url} → 回傳的不是 JSON 物件` };
    }
    return { doc: res.body as Record<string, unknown>, error: null };
  } catch (e) {
    return { doc: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Server dry-run: the shared zod schemas, no write. Empty = the doc is valid. */
export async function validateDoc(
  collection: EditCollection,
  id: string,
  doc: Record<string, unknown>,
  opts: ContentApiOptions = {},
): Promise<{ ok: boolean; issues: EditIssue[]; error: string | null }> {
  if (!ENABLED) return { ok: false, issues: [], error: OFF_MESSAGE };
  const url = docUrl(collection, id, "validate");
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
 * never leave the ability/champion mirror half-applied), then writes them in
 * order. A failure after the first write is reported loudly WITH the undo
 * snapshot names — a silent desync between an ability and its embedded twin is
 * exactly the bug this editor must not create.
 */
export async function saveDocs(
  steps: readonly WritePlanStep[],
  opts: ContentApiOptions = {},
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
  if (issues.length > 0) {
    return { ok: false, issues, error: null, written: [], contentVersion: null };
  }

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
      contentVersion =
        typeof body?.contentVersion === "string" ? body.contentVersion : contentVersion;
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
  collection: EditCollection,
  id: string,
  opts: ContentApiOptions = {},
): Promise<BackupEntry[]> {
  if (!ENABLED) return [];
  try {
    const res = await send(opts.fetchFn ?? defaultFetch, docUrl(collection, id, "backups"), "GET");
    const entries = (res.body as { entries?: unknown } | null)?.entries;
    if (!Array.isArray(entries)) return [];
    return entries.flatMap((e) => {
      const r = e as { file?: unknown; at?: unknown; bytes?: unknown };
      return typeof r?.file === "string"
        ? [
            {
              file: r.file,
              at: typeof r.at === "number" ? r.at : 0,
              bytes: typeof r.bytes === "number" ? r.bytes : 0,
            },
          ]
        : [];
    });
  } catch {
    return [];
  }
}

/** Put a snapshot back. Omit `file` to undo the most recent save. */
export async function restoreBackup(
  collection: EditCollection,
  id: string,
  file?: string,
  opts: ContentApiOptions = {},
): Promise<{
  ok: boolean;
  restored: string | null;
  contentVersion: string | null;
  error: string | null;
}> {
  if (!ENABLED) return { ok: false, restored: null, contentVersion: null, error: OFF_MESSAGE };
  const url = docUrl(collection, id, "restore");
  try {
    const res = await send(
      opts.fetchFn ?? defaultFetch,
      url,
      "POST",
      file === undefined ? {} : { file },
    );
    if (res.status !== 200) {
      return {
        ok: false,
        restored: null,
        contentVersion: null,
        error: errorOf(res.body, res.status, url),
      };
    }
    const body = res.body as { restored?: unknown; contentVersion?: unknown } | null;
    return {
      ok: true,
      restored: typeof body?.restored === "string" ? body.restored : null,
      contentVersion: typeof body?.contentVersion === "string" ? body.contentVersion : null,
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      restored: null,
      contentVersion: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export interface CreateOutcome {
  readonly ok: boolean;
  readonly issues: readonly EditIssue[];
  readonly error: string | null;
  readonly contentVersion: string | null;
}

/**
 * CREATE a brand-new document (task #70 rule 3 — the owner must be able to ADD
 * a 三選一 augment / draft-pool entry from the console, not only re-tune the
 * fixed set). POSTs to the create verb (201), which refuses to clobber an
 * existing id. Validated first with the same shared schema the game loader uses,
 * so a malformed skeleton never reaches disk.
 */
export async function createDoc(
  collection: EditCollection,
  id: string,
  doc: Record<string, unknown>,
  opts: ContentApiOptions = {},
): Promise<CreateOutcome> {
  if (!ENABLED) return { ok: false, issues: [], error: OFF_MESSAGE, contentVersion: null };
  const fetchFn = opts.fetchFn ?? defaultFetch;
  const vurl = docUrl(collection, id, "validate");
  try {
    const v = await send(fetchFn, vurl, "POST", doc);
    if (v.status === 422) return { ok: false, issues: issuesOf(v.body), error: null, contentVersion: null };
    if (v.status !== 200) return { ok: false, issues: [], error: errorOf(v.body, v.status, vurl), contentVersion: null };
    const url = docUrl(collection, id);
    const res = await send(fetchFn, url, "POST", doc);
    if (res.status !== 201 && res.status !== 200) {
      return { ok: false, issues: issuesOf(res.body), error: errorOf(res.body, res.status, url), contentVersion: null };
    }
    const cv = (res.body as { contentVersion?: unknown } | null)?.contentVersion;
    return { ok: true, issues: [], error: null, contentVersion: typeof cv === "string" ? cv : null };
  } catch (e) {
    return { ok: false, issues: [], error: e instanceof Error ? e.message : String(e), contentVersion: null };
  }
}

/**
 * DELETE a document (task #70 rule 3 — REMOVE a 三選一 augment / pool from the
 * draft entirely). The content-api snapshots the bytes before unlinking, so
 * `restore` can bring it back — this is a recoverable delete, not a shred.
 */
export async function deleteDoc(
  collection: EditCollection,
  id: string,
  opts: ContentApiOptions = {},
): Promise<{ ok: boolean; error: string | null; contentVersion: string | null; backup: string | null }> {
  if (!ENABLED) return { ok: false, error: OFF_MESSAGE, contentVersion: null, backup: null };
  const url = docUrl(collection, id);
  try {
    const res = await send(opts.fetchFn ?? defaultFetch, url, "DELETE");
    if (res.status !== 200) {
      return { ok: false, error: errorOf(res.body, res.status, url), contentVersion: null, backup: null };
    }
    const body = res.body as { contentVersion?: unknown; backup?: unknown } | null;
    return {
      ok: true,
      error: null,
      contentVersion: typeof body?.contentVersion === "string" ? body.contentVersion : null,
      backup: typeof body?.backup === "string" ? body.backup : null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), contentVersion: null, backup: null };
  }
}

// ---------------------------------------------------------------------------

export interface ContentEditApi {
  /** false ⇒ the UI must not render any editing affordance */
  readonly enabled: boolean;
  readonly offMessage: string;
  readonly probe: typeof probeContentApi;
  readonly contentVersion: typeof currentContentVersion;
  readonly fetchDoc: typeof fetchDoc;
  readonly validate: typeof validateDoc;
  readonly save: typeof saveDocs;
  readonly backups: typeof listBackups;
  readonly restore: typeof restoreBackup;
  readonly plan: typeof writePlan;
  readonly create: typeof createDoc;
  readonly remove: typeof deleteDoc;
}

/**
 * The handle ContentPage holds. Constructed only from an
 * `import.meta.env.DEV`-guarded dynamic import, and still reports `enabled`
 * from the module gate so any other caller gets an inert object.
 */
export function createContentEditApi(): ContentEditApi {
  return {
    enabled: ENABLED,
    offMessage: OFF_MESSAGE,
    probe: probeContentApi,
    contentVersion: currentContentVersion,
    fetchDoc,
    validate: validateDoc,
    save: saveDocs,
    backups: listBackups,
    restore: restoreBackup,
    plan: writePlan,
    create: createDoc,
    remove: deleteDoc,
  };
}
