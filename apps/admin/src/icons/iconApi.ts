/**
 * iconApi — the typed client for `/icon-api`, the loopback icon-generation
 * daemon (`tools/icon-gen/local/daemon.py` on 127.0.0.1:8789, proxied by the
 * admin vite server). Task #186.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * An entity with no icon renders as a GlyphTile LETTER TILE (「鐵」「疾」「B」),
 * which is the project's single most-repeated defect —「根本不知道哪招是哪招」—
 * wearing a different hat. #110 made card icons mandatory on the draft screen
 * for exactly this reason. So every document the console CREATES without art
 * makes that complaint worse, and the fix belongs at the create seam rather
 * than in a batch run somebody has to remember to start.
 *
 * ── WHAT ACTUALLY STOPS A LAN DEVICE ────────────────────────────────────────
 * Not this file. Authorisation is by REACHABILITY, the identical model
 * `apps/content-api/src/guard.ts` documents for the content editor and
 * `voiceApi.ts` documents for the voice daemon:
 *
 *   1. the admin vite dev server binds 127.0.0.1 and REFUSES to start with a
 *      non-loopback --host (src/dev/loopbackOnly.ts), so the `/icon-api` proxy
 *      has no front door a LAN device can knock on;
 *   2. the daemon itself refuses to bind anything but loopback and re-checks
 *      the socket peer plus Origin on every mutating verb.
 *
 * This module is layer zero: a courtesy to the operator, never a lock.
 *
 * ── THE DEV GATE ────────────────────────────────────────────────────────────
 * `ENABLED` is `import.meta.env.DEV`, read through the repo's proven guarded
 * shape (the try/catch is load-bearing: plain-node vitest has no
 * `import.meta.env` and every writer must be inert there rather than throw).
 * ContentPage is reached only through an `import.meta.env.DEV`-guarded dynamic
 * import, so a production admin build does not contain this code path at all —
 * which is also the answer to "what happens on the family host": generation is
 * an AUTHORING-time act on the owner's Mac (the checkpoint is 2 GB and
 * gitignored, and ggd.adms.ai has no GPU). The host consumes committed WebPs.
 *
 * ── DEGRADED MODE IS EXPLICIT, NEVER SILENT ─────────────────────────────────
 * Three distinct states, and the UI must be able to tell them apart:
 *   off       not a dev build — the feature is absent, and says so;
 *   readonly  dev build, daemon unreachable → art is PENDING and the page
 *             prints the one command that starts the service;
 *   live      daemon answered and reports a usable device.
 * A daemon that answers with `stub:true` (no torch / no MPS) is NOT live: it
 * would produce nothing real, so we refuse rather than queue work that cannot
 * finish. Silence is the pathology this repo has been digging out of.
 */

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

export const ICON_BASE = "/icon-api";

export const OFF_MESSAGE =
  "自動產圖只存在於本機開發版本（此版本未內含）。請用 pnpm dev:all 後開 http://127.0.0.1:60721/admin/";
export const NO_DAEMON_MESSAGE =
  "產圖服務未啟動，新內容會先用文字方塊代替。啟動方式：" +
  "tools/icon-gen/.venv/bin/python tools/icon-gen/local/daemon.py --warm";
export const NO_ENGINE_MESSAGE =
  "產圖服務有回應，但這台機器沒有可用的算圖裝置（torch/MPS），所以不會產圖 —— " +
  "圖示維持待補，不會塞一張假圖進去。";

/** Collections this console can ask for art. `loot-tables` has no icon convention. */
export type IconCollection = "champions" | "abilities" | "items" | "augments";

const ICONABLE = new Set<string>(["champions", "abilities", "items", "augments"]);

/** Does this collection have art at all? Cheap, local, no network. */
export function isIconable(collection: string): collection is IconCollection {
  return ICONABLE.has(collection);
}

/**
 * ⭐ 2026-08-18 起**每一個集合都寫 `icon` 欄位** —— owner 授權替 `augment@1` 補上
 * 那一格（「順便補完其他沒有圖示的寶具跟固有能力」）。
 *
 * ⚠️ 在那之前 augments 是唯一的例外：schema 是 `.strict()` 且沒有 `icon`，於是
 * 91 張固有能力的圖示**畫好了卻沒有任何文件指得到它**，卡片是靠
 * `ui/panels/resolveChoice.ts` **按 id 組路徑**才畫得出來的。那條慣例還在（退居備援，
 * 因為欄位是 `.optional()`），但**主來源是欄位**。
 *
 * ⛔ 這個函式現在恆為 true，而它**留著不刪**：UI 用它說「這一次存檔產生了什麼形狀」，
 * 而下一個真的需要「只出圖不寫欄位」的集合（例如產物型的集合）會在這裡宣告，
 * ⛔ 不是在三個地方各寫一次 if。
 */
export function writesIconField(_collection: IconCollection): boolean {
  return true;
}

// ---------------------------------------------------------------- transport --

export type IconFetch = typeof fetch;

let fetchImpl: IconFetch | null = null;

/** Tests inject a fetch here; the browser's is used otherwise. */
export function setIconFetch(fn: IconFetch | null): void {
  fetchImpl = fn;
}

function doFetch(url: string, init?: RequestInit): Promise<Response> {
  return (fetchImpl ?? fetch)(url, init);
}

export interface IconResult<T> {
  readonly ok: boolean;
  readonly data: T | null;
  readonly error: string | null;
  /** the daemon's machine-readable refusal code, when it gave one */
  readonly reason: SkipReason | null;
  readonly status: number;
}

function fail<T>(error: string, status = 0, reason: SkipReason | null = null): IconResult<T> {
  return { ok: false, data: null, error, reason, status };
}

const OFF = <T,>(): IconResult<T> => fail<T>(OFF_MESSAGE, 0, null);

const REASONS = [
  "ok",
  "blocked",
  "author-art",
  "already-done",
  "no-icons",
  "no-doc",
  "bad-id",
  "no-engine",
  "blank",
  "error",
] as const;
export type SkipReason = (typeof REASONS)[number];

function asReason(v: unknown): SkipReason | null {
  return typeof v === "string" && (REASONS as readonly string[]).includes(v)
    ? (v as SkipReason)
    : null;
}

function errorOf(body: unknown, status: number, url: string): string {
  const msg = (body as { error?: unknown } | null)?.error;
  if (typeof msg === "string" && msg !== "") return msg;
  if (status === 404) return `${url} → 404（${NO_DAEMON_MESSAGE}）`;
  return `${url} → HTTP ${status}`;
}

async function request<T>(
  path: string,
  init: RequestInit,
  parse: (body: unknown) => T | null,
): Promise<IconResult<T>> {
  const url = `${ICON_BASE}${path}`;
  try {
    const res = await doFetch(url, init);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      return {
        ok: false,
        data: null,
        error: errorOf(body, res.status, url),
        reason: asReason((body as { reason?: unknown } | null)?.reason),
        status: res.status,
      };
    }
    const data = parse(body);
    if (data === null) {
      return fail<T>(`${url} → 回傳的內容無法解析`, res.status);
    }
    return { ok: true, data, error: null, reason: null, status: res.status };
  } catch (e) {
    return fail<T>(e instanceof Error ? e.message : String(e));
  }
}

// -------------------------------------------------------------------- model --

export interface IconEngine {
  readonly name: string;
  readonly device: string;
  readonly warm: boolean;
  readonly method: string;
  readonly ok: boolean;
  readonly reason: string;
}

export interface IconHealth {
  readonly ok: boolean;
  /** TRUE ⇒ this service could not produce real art. Paints the page banner. */
  readonly stub: boolean;
  readonly engine: IconEngine;
  readonly method: string;
  /** how many ids the committed icon-plan holds behind a human decision */
  readonly blocked: number;
  readonly queue: Readonly<Record<string, number>>;
}

export type JobState = "queued" | "running" | "done" | "failed" | "cancelled" | "skipped";

export interface IconJob {
  readonly id: string;
  readonly collection: string;
  readonly docId: string;
  readonly state: JobState;
  readonly reason: SkipReason | "";
  readonly message: string;
  readonly iconPath: string | null;
  readonly fieldWritten: boolean;
  readonly signal: string;
  readonly elapsedMs: number;
  readonly error: string | null;
}

export interface JobLists {
  readonly active: readonly IconJob[];
  readonly recent: readonly IconJob[];
}

export interface Preflight {
  readonly eligible: boolean;
  readonly reason: SkipReason;
  readonly message: string;
  readonly iconPath: string | null;
}

const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function parseHealth(body: unknown): IconHealth | null {
  if (body === null || typeof body !== "object") return null;
  const d = body as Record<string, unknown>;
  const e = (d["engine"] ?? {}) as Record<string, unknown>;
  return {
    ok: d["ok"] === true,
    // ABSENT ⇒ STUB. The safe default for "is this real output?" is NO.
    stub: d["stub"] === undefined ? true : d["stub"] === true,
    engine: {
      name: str(e["name"], "?"),
      device: str(e["device"], "?"),
      warm: e["warm"] === true,
      method: str(e["method"]),
      ok: e["ok"] === true,
      reason: str(e["reason"]),
    },
    method: str(d["method"]),
    blocked: num(d["blocked"]),
    queue: (d["queue"] ?? {}) as Record<string, number>,
  };
}

function parseJob(body: unknown): IconJob | null {
  if (body === null || typeof body !== "object") return null;
  const d = body as Record<string, unknown>;
  const id = str(d["id"]);
  if (id === "") return null;
  const state = str(d["state"]);
  return {
    id,
    collection: str(d["collection"]),
    docId: str(d["docId"]),
    state: (["queued", "running", "done", "failed", "cancelled", "skipped"].includes(state)
      ? state
      : "failed") as JobState,
    reason: asReason(d["reason"]) ?? "",
    message: str(d["message"]),
    iconPath: typeof d["iconPath"] === "string" ? d["iconPath"] : null,
    fieldWritten: d["fieldWritten"] === true,
    signal: str(d["signal"]),
    elapsedMs: num(d["elapsedMs"]),
    error: typeof d["error"] === "string" ? d["error"] : null,
  };
}

function parseJobs(body: unknown): JobLists | null {
  if (body === null || typeof body !== "object") return null;
  const d = body as Record<string, unknown>;
  const list = (v: unknown): IconJob[] =>
    Array.isArray(v)
      ? v.flatMap((j) => {
          const p = parseJob(j);
          return p === null ? [] : [p];
        })
      : [];
  return { active: list(d["active"]), recent: list(d["recent"]) };
}

function parsePreflight(body: unknown): Preflight | null {
  if (body === null || typeof body !== "object") return null;
  const d = body as Record<string, unknown>;
  return {
    eligible: d["eligible"] === true,
    reason: asReason(d["reason"]) ?? "error",
    message: str(d["message"]),
    iconPath: typeof d["iconPath"] === "string" ? d["iconPath"] : null,
  };
}

// -------------------------------------------------------------------- reads --

/** The honesty check. `stub:true` paints the whole strip's warning. */
export function health(): Promise<IconResult<IconHealth>> {
  if (!ENABLED) return Promise.resolve(OFF<IconHealth>());
  return request("/health", { method: "GET", cache: "no-store" }, parseHealth);
}

export function jobs(): Promise<IconResult<JobLists>> {
  if (!ENABLED) return Promise.resolve(OFF<JobLists>());
  return request("/jobs", { method: "GET", cache: "no-store" }, parseJobs);
}

/** "Would you draw this?" — so the UI can offer 補圖 only where it can work. */
export function preflight(
  collection: string,
  id: string,
): Promise<IconResult<Preflight>> {
  if (!ENABLED) return Promise.resolve(OFF<Preflight>());
  return request(
    `/preflight/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
    { method: "GET", cache: "no-store" },
    parsePreflight,
  );
}

// ------------------------------------------------------------------- writes --

export interface EnqueueBody {
  readonly collection: string;
  readonly id: string;
  /** re-draw over OUR OWN previous generation. Never over author/w3x art —
   *  the daemon refuses that with `author-art` regardless of this flag. */
  readonly force?: boolean;
}

/**
 * Ask for one icon. NON-BLOCKING BY CONTRACT: this resolves as soon as the job
 * is queued (202), never when the image exists. Callers on the create path must
 * NOT await it before reporting the save — creating a document is instant and
 * the art arrives after.
 *
 * A refusal (409) is a normal outcome, not a transport error: `reason` carries
 * `blocked` / `author-art` / `already-done` and the UI shows that sentence.
 */
export function enqueue(body: EnqueueBody): Promise<IconResult<IconJob>> {
  if (!ENABLED) return Promise.resolve(OFF<IconJob>());
  if (!isIconable(body.collection)) {
    return Promise.resolve(
      fail<IconJob>(`${body.collection} 沒有圖示慣例，不產圖。`, 0, "no-icons"),
    );
  }
  return request(
    "/jobs",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    (b) => parseJob((b as { job?: unknown } | null)?.job),
  );
}

export function cancelJob(jobId: string): Promise<IconResult<Record<string, unknown>>> {
  if (!ENABLED) return Promise.resolve(OFF());
  return request(`/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" }, (b) =>
    b !== null && typeof b === "object" ? (b as Record<string, unknown>) : {},
  );
}

// ------------------------------------------------------------------- handle --

/** What the page may do, given the gate and what the daemon said. */
export type IconServiceMode = "live" | "readonly" | "off";

export function serviceMode(h: IconHealth | null): IconServiceMode {
  if (!ENABLED) return "off";
  if (h === null) return "readonly";
  // A daemon that answered but cannot render is NOT live. Queueing work there
  // would spin forever; saying so is the whole point of the health call.
  return h.ok && !h.stub ? "live" : "readonly";
}

/** The sentence the strip shows for a given mode. Never blank. */
export function modeMessage(mode: IconServiceMode, h: IconHealth | null): string {
  if (mode === "off") return OFF_MESSAGE;
  if (mode === "live") {
    const e = h?.engine;
    const dev = e === undefined ? "" : `（${e.device}${e.warm ? "・已載入" : "・首張較慢"}）`;
    return `產圖服務運作中${dev}，新內容會自動補圖。`;
  }
  if (h !== null && h.stub) {
    return h.engine.reason === "" ? NO_ENGINE_MESSAGE : `${NO_ENGINE_MESSAGE}（${h.engine.reason}）`;
  }
  return NO_DAEMON_MESSAGE;
}

/** One line per finished job, for the strip. Refusals read as facts, not errors. */
export function jobLine(job: IconJob): { text: string; tone: "ok" | "warn" | "err" } {
  const who = `${job.docId}`;
  switch (job.state) {
    case "queued":
      return { text: `${who}：排隊中…`, tone: "warn" };
    case "running":
      return { text: `${who}：產圖中…`, tone: "warn" };
    case "done":
      return {
        text: `${who}：${job.message === "" ? "已產圖" : job.message}（${(job.elapsedMs / 1000).toFixed(1)}s）`,
        tone: "ok",
      };
    case "cancelled":
      return { text: `${who}：已取消。`, tone: "warn" };
    case "skipped":
      return { text: `${who}：沒產圖 —— ${job.message}`, tone: "warn" };
    default:
      return { text: `${who}：產圖失敗 —— ${job.message || job.error || "未知錯誤"}`, tone: "err" };
  }
}

export interface IconApi {
  /** false ⇒ the UI must not render any 產圖 affordance at all */
  readonly enabled: boolean;
  readonly offMessage: string;
  readonly noDaemonMessage: string;
  readonly health: typeof health;
  readonly jobs: typeof jobs;
  readonly preflight: typeof preflight;
  readonly enqueue: typeof enqueue;
  readonly cancel: typeof cancelJob;
}

export function createIconApi(): IconApi {
  return {
    enabled: ENABLED,
    offMessage: OFF_MESSAGE,
    noDaemonMessage: NO_DAEMON_MESSAGE,
    health,
    jobs,
    preflight,
    enqueue,
    cancel: cancelJob,
  };
}
