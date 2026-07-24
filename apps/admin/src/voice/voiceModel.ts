/**
 * voiceModel — the pure half of 角色語音生成.
 *
 * Every rule the page is not allowed to get wrong lives here, as a function
 * over plain data, so it can be tested without React, a browser or a daemon:
 *
 *   • the line state machine and its LEGAL transitions;
 *   • `canApproveLine` — the rule that A STUB CLIP CAN NEVER BE APPROVED. The
 *     daemon 409s it too (belt and braces), but the button must be disabled
 *     with the reason spelled out rather than offering an action that fails;
 *   • `canGenerateLine` — the three preconditions the daemon enforces
 *     (reference clip present + hash-verified, script non-empty, licence
 *     recorded for a non-repo reference), pre-flighted so the page can say WHY
 *     a button is dead instead of just dimming it;
 *   • the counts arithmetic, including `countsPartitionOk` — the #97/#102 house
 *     rule that a page which cannot verify its own numbers must say so loudly
 *     rather than render a convincing total.
 *
 * STUB HONESTY. `stub` is a distinct state, never folded into `generated`, and
 * it is excluded from every "已完成" figure computed here. Four independent
 * layers carry it (path infix, record flag, response header, UI chip); this
 * module owns the two that are arithmetic.
 *
 * Pure: no fetch, no React, no clock (times are passed in).
 */
import type { LineSpec } from "./categories";

// ------------------------------------------------------------------ states --

export type LineState =
  | "noText"
  | "pending"
  | "generating"
  | "generated"
  | "stub"
  | "approved"
  | "rejected"
  | "failed";

/** Display order for the state filter — worst-blocking first. */
export const LINE_STATES: readonly LineState[] = [
  "noText",
  "pending",
  "generating",
  "generated",
  "stub",
  "approved",
  "rejected",
  "failed",
];

export const STATE_LABEL: Readonly<Record<LineState, string>> = {
  noText: "待撰稿",
  pending: "待生成",
  generating: "生成中",
  generated: "待驗收",
  stub: "STUB 假音",
  approved: "已驗收",
  rejected: "已退回",
  failed: "生成失敗",
};

/**
 * The ONLY legal transitions. `stub → approved` is absent on purpose and is
 * pinned by a test: it is the single edge that would let a fake clip be
 * accepted as real output.
 */
export const LEGAL_TRANSITIONS: Readonly<Record<LineState, readonly LineState[]>> = {
  noText: ["pending"],
  pending: ["generating", "noText"],
  generating: ["generated", "stub", "failed"],
  generated: ["approved", "rejected", "pending"],
  stub: ["pending", "generating", "rejected"],
  approved: ["pending"],
  rejected: ["pending"],
  failed: ["pending", "noText"],
};

export function canTransition(from: LineState, to: LineState): boolean {
  return (LEGAL_TRANSITIONS[from] ?? []).includes(to);
}

/** States that count as real, accepted output. Deliberately just one. */
export function isDone(state: LineState): boolean {
  return state === "approved";
}

/** True for anything a fake clip produced. Never "generated". */
export function isStubState(state: LineState): boolean {
  return state === "stub";
}

/**
 * A stub take is marked in the FILENAME as well as the record. `promote` must
 * refuse any path carrying the infix, so the page refuses to offer it.
 */
export function isStubPath(path: string): boolean {
  return path.includes(".stub.");
}

// ------------------------------------------------------------------- shapes --

export interface TakeRecord {
  readonly take: number;
  readonly engine: string;
  readonly stub: boolean;
  readonly seconds: number | null;
  readonly at: number;
  readonly error: string | null;
}

export interface CurrentClip {
  readonly take: number;
  readonly engine: string;
  readonly engineVersion: string;
  readonly stub: boolean;
  readonly bytes: number | null;
  readonly seconds: number | null;
  readonly lufs: number | null;
  readonly hash: string;
  readonly at: number;
}

export interface ReviewRecord {
  readonly decision: "approved" | "rejected";
  readonly note: string;
  readonly at: number;
}

export interface LineRecord {
  readonly lineId: string;
  readonly categoryId: string;
  readonly variant: string | null;
  /** null ⇒ 待撰稿; generation is BLOCKED until a script exists */
  readonly text: string | null;
  readonly textSource: "authored" | "ai" | "imported" | null;
  readonly lang: string;
  readonly state: LineState;
  readonly current: CurrentClip | null;
  readonly takes: readonly TakeRecord[];
  readonly review: ReviewRecord | null;
  readonly lastError: string | null;
  /** skill-name lines only — so the writer can see what they are naming */
  readonly abilityId: string | null;
  readonly abilityName: string | null;
}

export interface ReferenceRecord {
  readonly sha256: string;
  readonly seconds: number;
  readonly sampleRate: number;
  readonly source: string;
  readonly sourceKind: "repo" | "upload" | "external";
  readonly licence: string;
  readonly licenceUrl: string;
  readonly note: string;
  readonly addedAt: number;
}

export interface ChampionStatus {
  readonly championId: string;
  readonly lang: string;
  readonly gender: string;
  readonly reference: ReferenceRecord | null;
  readonly lines: Readonly<Record<string, LineRecord>>;
}

export interface LineCounts {
  readonly total: number;
  readonly approved: number;
  readonly generated: number;
  readonly stub: number;
  readonly pending: number;
  readonly generating: number;
  readonly rejected: number;
  readonly failed: number;
  readonly noText: number;
}

export interface RosterEntry {
  readonly championId: string;
  readonly name: string;
  readonly hasReference: boolean;
  readonly referenceSha256: string | null;
  readonly lang: string;
  readonly gender: string;
  readonly counts: LineCounts;
  readonly updatedAt: number;
}

export interface VoiceRoster {
  readonly categoryCount: number;
  readonly lineCount: number;
  readonly generatedAt: number;
  readonly engine: { readonly name: string; readonly version: string; readonly stub: boolean };
  readonly champions: readonly RosterEntry[];
}

export type JobKind = "voice" | "script";
export type JobScope = "line" | "champion" | "roster";
export type JobState = "queued" | "running" | "done" | "failed" | "cancelled";

export interface Job {
  readonly jobId: string;
  readonly kind: JobKind;
  readonly scope: JobScope;
  readonly state: JobState;
  readonly total: number;
  readonly done: number;
  readonly ok: number;
  readonly failed: number;
  readonly skipped: number;
  readonly stub: number;
  readonly current: { readonly championId: string; readonly lineId: string } | null;
  readonly startedAt: number;
  readonly finishedAt: number | null;
  readonly etaMs: number | null;
  readonly errors: readonly { championId: string; lineId: string; message: string }[];
}

// ------------------------------------------------------------------- counts --

export const EMPTY_COUNTS: LineCounts = {
  total: 0,
  approved: 0,
  generated: 0,
  stub: 0,
  pending: 0,
  generating: 0,
  rejected: 0,
  failed: 0,
  noText: 0,
};

const COUNT_KEY: Readonly<Record<LineState, keyof LineCounts>> = {
  approved: "approved",
  generated: "generated",
  stub: "stub",
  pending: "pending",
  generating: "generating",
  rejected: "rejected",
  failed: "failed",
  noText: "noText",
};

/**
 * Counts for one champion, computed from its lines against the EXPECTED line
 * list. A line the schema expects but the status file has never heard of counts
 * as `noText` — absence is 待撰稿, not a silently smaller denominator.
 */
export function countsFor(lines: readonly LineSpec[], status: ChampionStatus | null): LineCounts {
  const out: Record<string, number> = { ...EMPTY_COUNTS, total: lines.length };
  for (const spec of lines) {
    const rec = status?.lines[spec.lineId];
    const key = COUNT_KEY[rec?.state ?? "noText"];
    out[key] = (out[key] ?? 0) + 1;
  }
  return out as unknown as LineCounts;
}

/** Sum of every partition bucket. Must equal `total`. */
export function partitionSum(c: LineCounts): number {
  return (
    c.approved + c.generated + c.stub + c.pending + c.generating + c.rejected + c.failed + c.noText
  );
}

/**
 * The self-check. A page that cannot verify its own arithmetic must not pretend
 * (#97 / #102 house rule) — the caller renders a loud banner when this is false
 * rather than showing a total that does not add up.
 */
export function countsPartitionOk(c: LineCounts): boolean {
  return partitionSum(c) === c.total;
}

export function addCounts(a: LineCounts, b: LineCounts): LineCounts {
  return {
    total: a.total + b.total,
    approved: a.approved + b.approved,
    generated: a.generated + b.generated,
    stub: a.stub + b.stub,
    pending: a.pending + b.pending,
    generating: a.generating + b.generating,
    rejected: a.rejected + b.rejected,
    failed: a.failed + b.failed,
    noText: a.noText + b.noText,
  };
}

export function rosterTotals(roster: VoiceRoster | null): LineCounts {
  if (roster === null) return EMPTY_COUNTS;
  return roster.champions.reduce((acc, c) => addCounts(acc, c.counts), EMPTY_COUNTS);
}

/** Every champion whose counts do not partition — named, so it is fixable. */
export function inconsistentChampions(roster: VoiceRoster | null): string[] {
  if (roster === null) return [];
  return roster.champions.filter((c) => !countsPartitionOk(c.counts)).map((c) => c.championId);
}

// ----------------------------------------------------------------- progress --

export interface Progress {
  /** accepted output — approved only. STUB IS NEVER IN HERE. */
  readonly done: number;
  readonly total: number;
  /** 0–100 */
  readonly percent: number;
  /** generated but not yet reviewed */
  readonly awaitingReview: number;
  /** fake clips standing in for real output */
  readonly stub: number;
  /** cannot even be attempted yet: no script */
  readonly blocked: number;
  /** queued or in flight or knocked back */
  readonly outstanding: number;
}

export function progressOf(c: LineCounts): Progress {
  const total = Math.max(0, c.total);
  return {
    done: c.approved,
    total,
    percent: total === 0 ? 0 : (c.approved / total) * 100,
    awaitingReview: c.generated,
    stub: c.stub,
    blocked: c.noText,
    outstanding: c.pending + c.generating + c.rejected + c.failed,
  };
}

// -------------------------------------------------------------------- gates --

export interface Gate {
  readonly ok: boolean;
  /** empty when ok; otherwise the exact reason, in the operator's language */
  readonly reason: string;
}

const OK_GATE: Gate = { ok: true, reason: "" };

/**
 * Precondition 1 + 3: a hash-verified reference clip, with a licence recorded
 * whenever it did not come out of this repo.
 *
 * The licence check is not bureaucracy — the repo already ships a
 * mandatory-attribution regime (task #13), and an unlicensed reference clip is
 * a copyright liability baked into every line the champion ever speaks.
 */
export function referenceGate(ref: ReferenceRecord | null): Gate {
  if (ref === null) return { ok: false, reason: "沒有參考音：請先設定這名角色的參考語音（3–15 秒）。" };
  if (ref.sha256 === "") return { ok: false, reason: "參考音沒有雜湊值，無法確認檔案與紀錄一致。" };
  if (ref.sourceKind !== "repo" && ref.licence.trim() === "") {
    return { ok: false, reason: "外部來源的參考音必須填授權（licence），否則不得用於生成。" };
  }
  return OK_GATE;
}

/** Precondition 2, plus the reference gate. Mirrors the daemon's 422. */
export function canGenerateLine(ref: ReferenceRecord | null, line: LineRecord | null): Gate {
  const r = referenceGate(ref);
  if (!r.ok) return r;
  if (line === null || line.text === null || line.text.trim() === "") {
    return { ok: false, reason: "還沒有文稿：先寫好這一句要說什麼，才能生成。" };
  }
  if (line.state === "generating") return { ok: false, reason: "這一句正在生成中。" };
  return OK_GATE;
}

/**
 * THE STUB RULE. A stub clip can never be approved — not by this button, not by
 * any other code path. The daemon 409s it as well; this is the layer that makes
 * the UI honest instead of merely unsuccessful.
 */
export function canApproveLine(line: LineRecord | null): Gate {
  if (line === null) return { ok: false, reason: "沒有這一句的紀錄。" };
  if (line.state === "stub" || line.current?.stub === true) {
    return { ok: false, reason: "這是 STUB 假音，不能驗收 —— 等真的語音引擎產出後再驗收。" };
  }
  if (line.current === null) return { ok: false, reason: "還沒有可驗收的音檔。" };
  if (line.state === "approved") return { ok: false, reason: "已經驗收過了。" };
  if (!canTransition(line.state, "approved")) {
    return { ok: false, reason: `目前狀態「${STATE_LABEL[line.state]}」不能直接驗收。` };
  }
  return OK_GATE;
}

/** A take may be promoted only when it is not a stub. */
export function canPromoteTake(take: TakeRecord | null): Gate {
  if (take === null) return { ok: false, reason: "沒有這個 take。" };
  if (take.stub || take.engine === "stub") {
    return { ok: false, reason: "STUB 假音不能被採用為正式音檔。" };
  }
  if (take.error !== null && take.error !== "") return { ok: false, reason: take.error };
  return OK_GATE;
}

/**
 * Roster-wide enqueue never fails wholesale on a missing reference or script —
 * it reports per-line skips. This is the number the page shows next to the
 * 一鍵生成 button so the owner knows what the run will NOT do before starting.
 */
export function rosterSkipEstimate(roster: VoiceRoster | null): {
  noReference: number;
  noText: number;
  championsWithoutReference: string[];
} {
  if (roster === null) return { noReference: 0, noText: 0, championsWithoutReference: [] };
  let noReference = 0;
  let noText = 0;
  const without: string[] = [];
  for (const c of roster.champions) {
    if (!c.hasReference) {
      noReference += c.counts.total;
      without.push(c.championId);
    }
    noText += c.counts.noText;
  }
  return { noReference, noText, championsWithoutReference: without };
}

// ---------------------------------------------------------------------- eta --

/** `1分23秒` / `2小時05分` / `—`. Never a bare millisecond count. */
export function formatEta(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分 ${String(s % 60).padStart(2, "0")} 秒`;
  return `${Math.floor(m / 60)} 小時 ${String(m % 60).padStart(2, "0")} 分`;
}

/**
 * ETA from observed throughput, not from a guess. Returns the daemon's own
 * `etaMs` when it published one; otherwise extrapolates from elapsed/done,
 * which is only meaningful once something has actually finished.
 */
export function etaMsOf(job: Job, now: number): number | null {
  if (job.state !== "running" && job.state !== "queued") return null;
  if (job.etaMs !== null && Number.isFinite(job.etaMs)) return job.etaMs;
  if (job.done <= 0 || job.startedAt <= 0) return null;
  const elapsed = now - job.startedAt;
  if (elapsed <= 0) return null;
  const remaining = Math.max(0, job.total - job.done);
  return (elapsed / job.done) * remaining;
}

export function jobPercent(job: Job): number {
  if (job.total <= 0) return 0;
  return Math.min(100, (job.done / job.total) * 100);
}

export function isJobActive(job: Job): boolean {
  return job.state === "queued" || job.state === "running";
}

// ------------------------------------------------------------------ parsing --

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function num(v: unknown, fallback: number): number {
  return numOrNull(v) ?? fallback;
}
function bool(v: unknown): boolean {
  return v === true;
}

function asState(v: unknown): LineState {
  const s = str(v);
  return (LINE_STATES as readonly string[]).includes(s) ? (s as LineState) : "noText";
}

export function parseCounts(raw: unknown): LineCounts {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    total: num(c["total"], 0),
    approved: num(c["approved"], 0),
    generated: num(c["generated"], 0),
    stub: num(c["stub"], 0),
    pending: num(c["pending"], 0),
    generating: num(c["generating"], 0),
    rejected: num(c["rejected"], 0),
    failed: num(c["failed"], 0),
    noText: num(c["noText"], 0),
  };
}

export function parseReference(raw: unknown): ReferenceRecord | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kindRaw = str(r["sourceKind"], "repo");
  const sourceKind: ReferenceRecord["sourceKind"] =
    kindRaw === "upload" || kindRaw === "external" ? kindRaw : "repo";
  return {
    sha256: str(r["sha256"]),
    seconds: num(r["seconds"], 0),
    sampleRate: num(r["sampleRate"], 0),
    source: str(r["source"]),
    sourceKind,
    licence: str(r["licence"]),
    licenceUrl: str(r["licenceUrl"]),
    note: str(r["note"]),
    addedAt: num(r["addedAt"], 0),
  };
}

function parseTake(raw: unknown): TakeRecord | null {
  if (raw === null || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const take = numOrNull(t["take"]);
  if (take === null) return null;
  const engine = str(t["engine"], "?");
  return {
    take,
    engine,
    // a take is a stub if EITHER signal says so — the flags are independent
    // layers and a disagreement must resolve to "fake", never to "real"
    stub: bool(t["stub"]) || engine === "stub",
    seconds: numOrNull(t["seconds"]),
    at: num(t["at"], 0),
    error: typeof t["error"] === "string" ? t["error"] : null,
  };
}

export function parseLine(lineId: string, raw: unknown): LineRecord {
  const l = (raw ?? {}) as Record<string, unknown>;
  const current = ((): CurrentClip | null => {
    const c = l["current"];
    if (c === null || typeof c !== "object") return null;
    const o = c as Record<string, unknown>;
    const engine = str(o["engine"], "?");
    return {
      take: num(o["take"], 0),
      engine,
      engineVersion: str(o["engineVersion"]),
      stub: bool(o["stub"]) || engine === "stub",
      bytes: numOrNull(o["bytes"]),
      seconds: numOrNull(o["seconds"]),
      lufs: numOrNull(o["lufs"]),
      hash: str(o["hash"]),
      at: num(o["at"], 0),
    };
  })();
  const takes = Array.isArray(l["takes"])
    ? (l["takes"] as unknown[]).flatMap((t) => {
        const p = parseTake(t);
        return p === null ? [] : [p];
      })
    : [];
  const review = ((): ReviewRecord | null => {
    const r = l["review"];
    if (r === null || typeof r !== "object") return null;
    const o = r as Record<string, unknown>;
    const d = str(o["decision"]);
    if (d !== "approved" && d !== "rejected") return null;
    return { decision: d, note: str(o["note"]), at: num(o["at"], 0) };
  })();
  const srcRaw = str(l["textSource"]);
  const textSource: LineRecord["textSource"] =
    srcRaw === "authored" || srcRaw === "ai" || srcRaw === "imported" ? srcRaw : null;
  let state = asState(l["state"]);
  // The record is the second stub layer. If the clip says stub but the state
  // says generated, the STATE is the one that is wrong — correct it downward.
  if (current?.stub === true && state === "generated") state = "stub";
  return {
    lineId,
    categoryId: str(l["categoryId"], lineId.split(".")[0] ?? lineId),
    variant: typeof l["variant"] === "string" ? l["variant"] : (lineId.split(".")[1] ?? null),
    text: typeof l["text"] === "string" && l["text"] !== "" ? l["text"] : null,
    textSource,
    lang: str(l["lang"]),
    state,
    current,
    takes,
    review,
    lastError: typeof l["lastError"] === "string" ? l["lastError"] : null,
    abilityId: typeof l["abilityId"] === "string" ? l["abilityId"] : null,
    abilityName: typeof l["abilityName"] === "string" ? l["abilityName"] : null,
  };
}

export function parseChampionStatus(raw: unknown): ChampionStatus | null {
  if (raw === null || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const championId = str(d["championId"]);
  if (championId === "") return null;
  const rawLines = (d["lines"] ?? {}) as Record<string, unknown>;
  const lines: Record<string, LineRecord> = {};
  for (const [id, v] of Object.entries(rawLines)) lines[id] = parseLine(id, v);
  return {
    championId,
    lang: str(d["lang"]),
    gender: str(d["gender"]),
    reference: parseReference(d["reference"]),
    lines,
  };
}

export function parseRoster(raw: unknown): VoiceRoster | null {
  if (raw === null || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const list = d["champions"];
  if (!Array.isArray(list)) return null;
  const engineRaw = (d["engine"] ?? {}) as Record<string, unknown>;
  return {
    categoryCount: num(d["categoryCount"], 0),
    lineCount: num(d["lineCount"], 0),
    generatedAt: num(d["generatedAt"], 0),
    engine: {
      name: str(engineRaw["name"], "?"),
      version: str(engineRaw["version"]),
      // unknown engine ⇒ assume STUB. The safe default for "is this real
      // output?" is NO.
      stub: engineRaw["stub"] === undefined ? true : bool(engineRaw["stub"]),
    },
    champions: list.flatMap((c) => {
      if (c === null || typeof c !== "object") return [];
      const e = c as Record<string, unknown>;
      const championId = str(e["championId"]);
      if (championId === "") return [];
      return [
        {
          championId,
          name: str(e["name"], championId),
          hasReference: bool(e["hasReference"]),
          referenceSha256: typeof e["referenceSha256"] === "string" ? e["referenceSha256"] : null,
          lang: str(e["lang"]),
          gender: str(e["gender"]),
          counts: parseCounts(e["counts"]),
          updatedAt: num(e["updatedAt"], 0),
        },
      ];
    }),
  };
}

export function parseJob(raw: unknown): Job | null {
  if (raw === null || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const jobId = str(d["jobId"]);
  if (jobId === "") return null;
  const stateRaw = str(d["state"], "queued");
  const state: JobState = (["queued", "running", "done", "failed", "cancelled"] as string[]).includes(
    stateRaw,
  )
    ? (stateRaw as JobState)
    : "queued";
  const current = ((): Job["current"] => {
    const c = d["current"];
    if (c === null || typeof c !== "object") return null;
    const o = c as Record<string, unknown>;
    return { championId: str(o["championId"]), lineId: str(o["lineId"]) };
  })();
  return {
    jobId,
    kind: str(d["kind"], "voice") === "script" ? "script" : "voice",
    scope: (["line", "champion", "roster"] as string[]).includes(str(d["scope"]))
      ? (str(d["scope"]) as JobScope)
      : "roster",
    state,
    total: num(d["total"], 0),
    done: num(d["done"], 0),
    ok: num(d["ok"], 0),
    failed: num(d["failed"], 0),
    skipped: num(d["skipped"], 0),
    stub: num(d["stub"], 0),
    current,
    startedAt: num(d["startedAt"], 0),
    finishedAt: numOrNull(d["finishedAt"]),
    etaMs: numOrNull(d["etaMs"]),
    errors: Array.isArray(d["errors"])
      ? (d["errors"] as unknown[]).flatMap((e) => {
          if (e === null || typeof e !== "object") return [];
          const o = e as Record<string, unknown>;
          return [
            {
              championId: str(o["championId"]),
              lineId: str(o["lineId"]),
              message: str(o["message"], "?"),
            },
          ];
        })
      : [],
  };
}

// --------------------------------------------------------------- filtering ---

export type StateFilter = LineState | "all" | "needsWork";

/** 需處理 = everything that is neither accepted output nor in flight. */
export function needsWork(state: LineState): boolean {
  return state === "noText" || state === "pending" || state === "rejected" || state === "failed" || state === "stub";
}

export function matchesFilter(state: LineState, filter: StateFilter): boolean {
  if (filter === "all") return true;
  if (filter === "needsWork") return needsWork(state);
  return state === filter;
}

export interface FlatLine {
  readonly championId: string;
  readonly championName: string;
  readonly spec: LineSpec;
  readonly record: LineRecord | null;
  readonly state: LineState;
}

/**
 * The flat cross-roster view, built ONLY from champions already loaded — this
 * function never implies a fetch. At 2,208 rows the caller windows it; see
 * `windowSlice`.
 */
export function flattenLoaded(
  roster: VoiceRoster | null,
  lines: readonly LineSpec[],
  loaded: ReadonlyMap<string, ChampionStatus>,
  filter: StateFilter,
): FlatLine[] {
  if (roster === null) return [];
  const out: FlatLine[] = [];
  for (const champ of roster.champions) {
    const status = loaded.get(champ.championId);
    if (status === undefined) continue;
    for (const spec of lines) {
      const record = status.lines[spec.lineId] ?? null;
      const state = record?.state ?? "noText";
      if (!matchesFilter(state, filter)) continue;
      out.push({
        championId: champ.championId,
        championName: champ.name,
        spec,
        record,
        state,
      });
    }
  }
  return out;
}

/**
 * Fixed-height windowing maths. Returns the slice to render plus the spacer
 * heights above and below, so a 2,208-row list costs ~30 DOM nodes.
 */
export interface WindowSlice {
  readonly start: number;
  readonly end: number;
  readonly padTop: number;
  readonly padBottom: number;
}

export function windowSlice(
  count: number,
  rowHeight: number,
  scrollTop: number,
  viewportHeight: number,
  overscan = 6,
): WindowSlice {
  if (count <= 0 || rowHeight <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visible = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const start = Math.min(first, Math.max(0, count - 1));
  const end = Math.min(count, start + visible);
  return {
    start,
    end,
    padTop: start * rowHeight,
    padBottom: Math.max(0, (count - end) * rowHeight),
  };
}
