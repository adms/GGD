/**
 * voiceApi — the typed client for `/voice-api`, the loopback voice-generation
 * daemon (`tools/voice-gen/src/serve.mjs` on 127.0.0.1:8788, proxied by the
 * admin vite server).
 *
 * ── WHAT ACTUALLY STOPS A LAN DEVICE ────────────────────────────────────────
 * Not this file. Authorisation is by REACHABILITY, the identical model
 * `apps/content-api/src/guard.ts` documents for the content editor:
 *
 *   1. the admin vite dev server binds 127.0.0.1 and REFUSES to start with a
 *      non-loopback --host (src/dev/loopbackOnly.ts), so the `/voice-api`
 *      proxy has no front door a LAN device can knock on;
 *   2. the daemon itself binds loopback only and re-checks the socket peer on
 *      every mutating verb, ignoring forwarded headers by construction.
 *
 * This module is layer zero: a courtesy to the operator, never a lock. Its job
 * is to keep the UI honest — never to offer a button that cannot work.
 *
 * ── THE DEV GATE ────────────────────────────────────────────────────────────
 * `ENABLED` is `import.meta.env.DEV`, read through the repo's proven guarded
 * shape (the try/catch is load-bearing: plain-node vitest has no
 * `import.meta.env` and every writer must be inert there rather than throw).
 * App.tsx reaches the page only through an `import.meta.env.DEV`-guarded
 * dynamic import, so a production admin build does not merely hide 角色語音生成,
 * it does not CONTAIN it.
 *
 * ── DEGRADED MODE IS EXPLICIT ───────────────────────────────────────────────
 * With no daemon on 8788 the page still renders: it reads the last published
 * `ROSTER.json` straight off the content mount, marks itself 唯讀, and states
 * how to start the service. It never shows a generate button that cannot work.
 */
import {
  parseChampionStatus,
  parseJob,
  parseRoster,
  type ChampionStatus,
  type Job,
  type VoiceRoster,
} from "./voiceModel";
import { isSafeLineId, parseCategorySchema, type CategorySchema } from "./categories";

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

export const VOICE_BASE = "/voice-api";
/** The published rollup, readable even when the daemon is down. */
export const ROSTER_FALLBACK_URL = "/content/assets/audio/voices/lines/ROSTER.json";

export const OFF_MESSAGE =
  "語音生成只存在於本機開發版本（此版本未內含）。請用 pnpm dev:all 後開 http://127.0.0.1:60721/admin/";
export const NO_DAEMON_MESSAGE =
  "語音服務未啟動（node tools/voice-gen/src/serve.mjs）—— 本頁為唯讀，只顯示上次發布的 ROSTER.json。";

/** How the page may behave right now. */
export type ServiceMode = "live" | "readonly" | "off";

export interface EngineInfo {
  readonly name: string;
  readonly version: string;
  readonly device: string;
  readonly warm: boolean;
}

export interface VoiceHealth {
  readonly ok: boolean;
  /** TRUE ⇒ every clip this service produces is a fake. Paints the page banner. */
  readonly stub: boolean;
  readonly engine: EngineInfo;
  readonly refsDir: string;
  readonly linesDir: string;
  readonly categoriesSha256: string | null;
  readonly roster: { readonly champions: number; readonly lines: number };
}

export interface ApiIssue {
  readonly path: string;
  readonly message: string;
  readonly code: string;
}

export interface ApiResult<T> {
  readonly ok: boolean;
  readonly data: T | null;
  readonly error: string | null;
  readonly issues: readonly ApiIssue[];
  readonly status: number;
  /** the `x-voice-engine` header — "stub" means the response came from a fake */
  readonly engineHeader: string | null;
}

function fail<T>(error: string, status = 0): ApiResult<T> {
  return { ok: false, data: null, error, issues: [], status, engineHeader: null };
}

const OFF = <T,>(): ApiResult<T> => fail<T>(OFF_MESSAGE, 0);

// ---------------------------------------------------------------- transport --

export type VoiceFetch = typeof fetch;

let fetchImpl: VoiceFetch | null = null;

/** Tests inject a fetch here; the browser's is used otherwise. */
export function setVoiceFetch(fn: VoiceFetch | null): void {
  fetchImpl = fn;
}

function doFetch(url: string, init?: RequestInit): Promise<Response> {
  return (fetchImpl ?? fetch)(url, init);
}

function issuesOf(body: unknown): ApiIssue[] {
  const list = (body as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(list)) return [];
  return list.flatMap((e) => {
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
  if (status === 404) return `${url} → 404（語音服務沒在跑？請執行 node tools/voice-gen/src/serve.mjs）`;
  return `${url} → HTTP ${status}`;
}

async function request<T>(
  path: string,
  init: RequestInit,
  parse: (body: unknown) => T | null,
): Promise<ApiResult<T>> {
  const url = `${VOICE_BASE}${path}`;
  try {
    const res = await doFetch(url, init);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const engineHeader = res.headers?.get?.("x-voice-engine") ?? null;
    if (!res.ok) {
      return {
        ok: false,
        data: null,
        error: errorOf(body, res.status, url),
        issues: issuesOf(body),
        status: res.status,
        engineHeader,
      };
    }
    const data = parse(body);
    if (data === null) {
      return {
        ok: false,
        data: null,
        error: `${url} → 回傳的內容無法解析`,
        issues: [],
        status: res.status,
        engineHeader,
      };
    }
    return { ok: true, data, error: null, issues: [], status: res.status, engineHeader };
  } catch (e) {
    return fail<T>(e instanceof Error ? e.message : String(e));
  }
}

function get<T>(path: string, parse: (body: unknown) => T | null): Promise<ApiResult<T>> {
  return request(path, { method: "GET", cache: "no-store" }, parse);
}

function mutate<T>(
  path: string,
  method: string,
  body: unknown,
  parse: (b: unknown) => T | null,
): Promise<ApiResult<T>> {
  if (!ENABLED) return Promise.resolve(OFF<T>());
  return request(
    path,
    {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    parse,
  );
}

const asAny = (b: unknown): Record<string, unknown> | null =>
  b !== null && typeof b === "object" ? (b as Record<string, unknown>) : {};

// -------------------------------------------------------------------- reads --

function parseHealth(body: unknown): VoiceHealth | null {
  if (body === null || typeof body !== "object") return null;
  const d = body as Record<string, unknown>;
  const e = (d["engine"] ?? {}) as Record<string, unknown>;
  const r = (d["roster"] ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    ok: d["ok"] === true,
    // ABSENT ⇒ STUB. The safe default for "is this real output?" is NO.
    stub: d["stub"] === undefined ? true : d["stub"] === true,
    engine: {
      name: typeof e["name"] === "string" ? e["name"] : "?",
      version: typeof e["version"] === "string" ? e["version"] : "",
      device: typeof e["device"] === "string" ? e["device"] : "",
      warm: e["warm"] === true,
    },
    refsDir: typeof d["refsDir"] === "string" ? d["refsDir"] : "",
    linesDir: typeof d["linesDir"] === "string" ? d["linesDir"] : "",
    categoriesSha256: typeof d["categoriesSha256"] === "string" ? d["categoriesSha256"] : null,
    roster: { champions: num(r["champions"]), lines: num(r["lines"]) },
  };
}

/** The honesty check. `stub:true` paints the whole page's warning banner. */
export function health(): Promise<ApiResult<VoiceHealth>> {
  if (!ENABLED) return Promise.resolve(OFF<VoiceHealth>());
  return get("/health", parseHealth);
}

/**
 * The category schema the DAEMON is using, so the page and the generator
 * provably agree on the same bytes. Falls back to the content mount, then to
 * the bundled snapshot — and the caller shows which one it got.
 */
export async function categories(sha256: string | null): Promise<CategorySchema | null> {
  if (ENABLED) {
    const viaDaemon = await get("/categories", (b) => parseCategorySchema(b, sha256));
    if (viaDaemon.ok && viaDaemon.data !== null) return viaDaemon.data;
  }
  try {
    const res = await doFetch("/content/assets/audio/voices/lines/CATEGORIES.json", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return parseCategorySchema(await res.json(), sha256);
  } catch {
    return null;
  }
}

/** THE OVERVIEW'S ONLY LOAD — one ~6 KB rollup, never 2,208 clips. */
export function roster(): Promise<ApiResult<VoiceRoster>> {
  if (!ENABLED) return Promise.resolve(OFF<VoiceRoster>());
  return get("/roster", parseRoster);
}

/**
 * Degraded read: the last rollup the CLI published, straight off the content
 * mount. Used when the daemon is unreachable so the page still shows the
 * owner where he got to — read-only, and labelled as such.
 */
export async function publishedRoster(): Promise<VoiceRoster | null> {
  try {
    const res = await doFetch(ROSTER_FALLBACK_URL, { cache: "no-store" });
    if (!res.ok) return null;
    return parseRoster(await res.json());
  } catch {
    return null;
  }
}

/** THE LAZY UNIT — one fetch per opened champion, ~46 lines. */
export function champion(championId: string): Promise<ApiResult<ChampionStatus>> {
  if (!ENABLED) return Promise.resolve(OFF<ChampionStatus>());
  return get(`/champions/${encodeURIComponent(championId)}`, parseChampionStatus);
}

export interface RefCandidate {
  readonly path: string;
  readonly label: string;
  readonly seconds: number;
  readonly sha256: string;
  readonly source: string;
}

export function referenceCandidates(championId: string): Promise<ApiResult<RefCandidate[]>> {
  if (!ENABLED) return Promise.resolve(OFF<RefCandidate[]>());
  return get(`/champions/${encodeURIComponent(championId)}/reference/candidates`, (b) => {
    if (!Array.isArray(b)) return null;
    return b.flatMap((x) => {
      if (x === null || typeof x !== "object") return [];
      const o = x as Record<string, unknown>;
      const path = typeof o["path"] === "string" ? o["path"] : "";
      if (path === "") return [];
      return [
        {
          path,
          label: typeof o["label"] === "string" ? o["label"] : path,
          seconds: typeof o["seconds"] === "number" ? o["seconds"] : 0,
          sha256: typeof o["sha256"] === "string" ? o["sha256"] : "",
          source: typeof o["source"] === "string" ? o["source"] : "",
        },
      ];
    });
  });
}

export interface JobLists {
  readonly active: readonly Job[];
  readonly recent: readonly Job[];
}

function parseJobs(body: unknown): JobLists | null {
  if (body === null || typeof body !== "object") return null;
  const d = body as Record<string, unknown>;
  const list = (v: unknown): Job[] =>
    Array.isArray(v)
      ? v.flatMap((j) => {
          const p = parseJob(j);
          return p === null ? [] : [p];
        })
      : [];
  return { active: list(d["active"]), recent: list(d["recent"]) };
}

export function jobs(): Promise<ApiResult<JobLists>> {
  if (!ENABLED) return Promise.resolve(OFF<JobLists>());
  return get("/jobs", parseJobs);
}

// --------------------------------------------------------------------- urls --

/**
 * Clip bytes. `<audio preload="none">` is pointed at this ON PLAY — never
 * eagerly, and never 46 at once (see useVoiceGen's single shared player).
 * Returns null for an unsafe lineId rather than building a path that could
 * escape the champion directory.
 */
export function clipUrl(championId: string, lineId: string, take?: number): string | null {
  if (!isSafeLineId(lineId)) return null;
  const q = take === undefined ? "" : `?take=${encodeURIComponent(String(take))}`;
  return `${VOICE_BASE}/clip/${encodeURIComponent(championId)}/${encodeURIComponent(lineId)}${q}`;
}

export function referenceUrl(championId: string): string {
  return `${VOICE_BASE}/reference/${encodeURIComponent(championId)}`;
}

export function eventsUrl(): string {
  return `${VOICE_BASE}/events`;
}

// ------------------------------------------------------------------- writes --
// EVERY function below short-circuits on ENABLED before touching the network.

export interface TextEdit {
  readonly text: string | null;
  readonly lang?: string;
  readonly textSource: "authored" | "ai" | "imported";
}

/** Set (or clear, with `text:null`) one line's script. */
export function setLineText(
  championId: string,
  lineId: string,
  edit: TextEdit,
): Promise<ApiResult<Record<string, unknown>>> {
  if (!ENABLED) return Promise.resolve(OFF());
  if (!isSafeLineId(lineId)) return Promise.resolve(fail(`不合法的 lineId：${lineId}`));
  return mutate(
    `/lines/${encodeURIComponent(championId)}/${encodeURIComponent(lineId)}/text`,
    "POST",
    edit,
    asAny,
  );
}

export interface EnqueueBody {
  readonly kind: "voice" | "script";
  readonly scope: "line" | "champion" | "roster";
  readonly championId?: string;
  readonly lineIds?: readonly string[];
  readonly categoryIds?: readonly string[];
  readonly force?: boolean;
  readonly concurrency?: number;
  readonly onlyMissing?: boolean;
}

export function enqueue(body: EnqueueBody): Promise<ApiResult<{ jobId: string }>> {
  if (!ENABLED) return Promise.resolve(OFF<{ jobId: string }>());
  return mutate("/jobs", "POST", body, (b) => {
    const id = (b as { jobId?: unknown } | null)?.jobId;
    return typeof id === "string" && id !== "" ? { jobId: id } : null;
  });
}

export function cancelJob(jobId: string): Promise<ApiResult<Record<string, unknown>>> {
  if (!ENABLED) return Promise.resolve(OFF());
  return mutate(`/jobs/${encodeURIComponent(jobId)}`, "DELETE", undefined, asAny);
}

/**
 * Adopt a take as the current clip. The daemon 409s a stub; the page also
 * refuses to offer the button (voiceModel.canPromoteTake) — two layers, because
 * this is the operation that would write a fake into `<lineId>.mp3`.
 */
export function promoteTake(
  championId: string,
  lineId: string,
  take: number,
): Promise<ApiResult<Record<string, unknown>>> {
  if (!ENABLED) return Promise.resolve(OFF());
  if (!isSafeLineId(lineId)) return Promise.resolve(fail(`不合法的 lineId：${lineId}`));
  return mutate(
    `/lines/${encodeURIComponent(championId)}/${encodeURIComponent(lineId)}/promote`,
    "POST",
    { take },
    asAny,
  );
}

/** 驗收 / 退回. The daemon 409s `approved` on a stub — see canApproveLine. */
export function reviewLine(
  championId: string,
  lineId: string,
  decision: "approved" | "rejected",
  note = "",
): Promise<ApiResult<Record<string, unknown>>> {
  if (!ENABLED) return Promise.resolve(OFF());
  if (!isSafeLineId(lineId)) return Promise.resolve(fail(`不合法的 lineId：${lineId}`));
  return mutate(
    `/lines/${encodeURIComponent(championId)}/${encodeURIComponent(lineId)}/review`,
    "POST",
    { decision, note },
    asAny,
  );
}

export interface SelectReferenceBody {
  readonly path: string;
  readonly trim?: readonly [number, number];
}

export function selectReference(
  championId: string,
  body: SelectReferenceBody,
): Promise<ApiResult<Record<string, unknown>>> {
  if (!ENABLED) return Promise.resolve(OFF());
  return mutate(
    `/champions/${encodeURIComponent(championId)}/reference/select`,
    "POST",
    body,
    asAny,
  );
}

export interface UploadReferenceBody {
  readonly base64: string;
  readonly filename: string;
  readonly sourceKind: "upload" | "external";
  /** REQUIRED and non-empty for upload/external — the daemon 422s an empty one */
  readonly licence: string;
  readonly licenceUrl?: string;
  readonly source?: string;
  readonly note?: string;
  readonly trim?: readonly [number, number];
}

export function uploadReference(
  championId: string,
  body: UploadReferenceBody,
): Promise<ApiResult<Record<string, unknown>>> {
  if (!ENABLED) return Promise.resolve(OFF());
  if (body.licence.trim() === "") {
    return Promise.resolve(fail("外部來源的參考音必須填授權（licence）。"));
  }
  return mutate(`/champions/${encodeURIComponent(championId)}/reference`, "PUT", body, asAny);
}

export function deleteReference(championId: string): Promise<ApiResult<Record<string, unknown>>> {
  if (!ENABLED) return Promise.resolve(OFF());
  return mutate(`/champions/${encodeURIComponent(championId)}/reference`, "DELETE", undefined, asAny);
}

// ------------------------------------------------------------------- handle --

export interface VoiceApi {
  /** false ⇒ the UI must not render any generating affordance at all */
  readonly enabled: boolean;
  readonly offMessage: string;
  readonly noDaemonMessage: string;
}

export const VOICE_API: VoiceApi = {
  enabled: ENABLED,
  offMessage: OFF_MESSAGE,
  noDaemonMessage: NO_DAEMON_MESSAGE,
};

/** What the page may do, given the gate and whether the daemon answered. */
export function serviceMode(daemonUp: boolean): ServiceMode {
  if (!ENABLED) return "off";
  return daemonUp ? "live" : "readonly";
}
