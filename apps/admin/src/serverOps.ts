/**
 * 系統運維 (server ops) — pure, node-testable logic behind the admin page that
 * tunes the operational SERVER numbers: the concurrent-match ceiling and the
 * snapshot broadcast rate.
 *
 * It is the sibling of ../combatEnv.ts, on purpose. Same document shape, same
 * PUT-replace semantics, same "a save applies from the next match" story for
 * anything the game-server snapshots at match creation.
 *
 * ONE DIFFERENCE, AND IT IS THE POINT. This page does NOT declare the bounds.
 * combatEnv.ts mirrors MIN_FACTOR / MAX_FACTOR from the platform in TypeScript,
 * which is a second copy that can drift; here the platform SERVES a descriptor
 * per knob — default, min, max, integer, unit, safety class, zh-Hant label,
 * note and 何時生效 line — and the page renders whatever it is given. The
 * validator and the UI therefore cannot disagree about what is legal, and a
 * knob added on the server shows up here with no edit at all.
 *
 * Form state holds RAW STRINGS so a half-typed "3" or an empty box is
 * representable and can be reported as a field error instead of being coerced
 * into something the operator never asked for.
 */

// ---------------------------------------------------------------- types -----

/** Safety class, as served by the platform. */
export type OpsSafety = "live" | "nextMatch" | "restart" | "never";

/** One writable knob, described entirely by the server. */
export interface OpsDescriptor {
  key: string;
  default: number;
  min: number;
  max: number;
  integer: boolean;
  unit: string;
  safety: OpsSafety;
  zhLabel: string;
  zhNote: string;
  zhApplies: string;
  env: string;
  where: string;
}

/** One read-only operational number: visible, explained, not editable. */
export interface OpsInfoItem {
  key: string;
  zhLabel: string;
  value: string;
  safety: OpsSafety;
  zhHow: string;
  zhWhy: string;
  where: string;
}

/** The stored table. */
export interface OpsDoc {
  version: number;
  updatedAt: string;
  values: Record<string, number>;
}

/** Everything GET /admin/server-ops returns. */
export interface OpsPayload {
  doc: OpsDoc;
  /**
   * false when NO operator has ever saved. The page must say 「尚未設定」
   * rather than implying somebody chose these numbers — the same distinction
   * the platform keeps on the wire so an unconfigured platform cannot overwrite
   * a deploy's own configuration.
   */
  stored: boolean;
  defaults: Record<string, number>;
  descriptors: OpsDescriptor[];
  info: OpsInfoItem[];
  /** The interpolation delay shipped clients compile with (the coupled rule). */
  clientInterpDelayMs: number;
}

/** An empty payload — what the page shows before the GET resolves. */
export function emptyOpsPayload(): OpsPayload {
  return {
    doc: { version: 1, updatedAt: "", values: {} },
    stored: false,
    defaults: {},
    descriptors: [],
    info: [],
    clientInterpDelayMs: 0,
  };
}

// --------------------------------------------------------------- parsing ----

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function safety(v: unknown): OpsSafety {
  return v === "live" || v === "nextMatch" || v === "restart" || v === "never" ? v : "never";
}

/**
 * Tolerant parser for whatever the platform returns. Unknown shapes degrade to
 * an empty payload; a descriptor missing a field gets a harmless default. The
 * page never dies on a partial response — it just renders fewer rows.
 */
export function normalizeOpsPayload(raw: unknown): OpsPayload {
  if (raw === null || typeof raw !== "object") return emptyOpsPayload();
  const o = raw as Record<string, unknown>;

  const rawDoc = (o["doc"] && typeof o["doc"] === "object" ? o["doc"] : {}) as Record<string, unknown>;
  const rawValues = (
    rawDoc["values"] && typeof rawDoc["values"] === "object" ? rawDoc["values"] : {}
  ) as Record<string, unknown>;
  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawValues)) {
    if (typeof v === "number" && Number.isFinite(v)) values[k] = v;
  }

  const defaults: Record<string, number> = {};
  const rawDefaults = (
    o["defaults"] && typeof o["defaults"] === "object" ? o["defaults"] : {}
  ) as Record<string, unknown>;
  for (const [k, v] of Object.entries(rawDefaults)) {
    if (typeof v === "number" && Number.isFinite(v)) defaults[k] = v;
  }

  const descriptors: OpsDescriptor[] = (Array.isArray(o["descriptors"]) ? o["descriptors"] : [])
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
    .map((d) => ({
      key: str(d["key"]),
      default: num(d["default"]),
      min: num(d["min"]),
      max: num(d["max"]),
      integer: d["integer"] === true,
      unit: str(d["unit"]),
      safety: safety(d["safety"]),
      zhLabel: str(d["zhLabel"], str(d["key"])),
      zhNote: str(d["zhNote"]),
      zhApplies: str(d["zhApplies"]),
      env: str(d["env"]),
      where: str(d["where"]),
    }))
    .filter((d) => d.key !== "");

  const info: OpsInfoItem[] = (Array.isArray(o["info"]) ? o["info"] : [])
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
    .map((d) => ({
      key: str(d["key"]),
      zhLabel: str(d["zhLabel"], str(d["key"])),
      value: str(d["value"]),
      safety: safety(d["safety"]),
      zhHow: str(d["zhHow"]),
      zhWhy: str(d["zhWhy"]),
      where: str(d["where"]),
    }))
    .filter((d) => d.key !== "");

  return {
    doc: {
      version: num(rawDoc["version"], 1),
      updatedAt: str(rawDoc["updatedAt"]),
      values,
    },
    stored: o["stored"] === true,
    defaults,
    descriptors,
    info,
    clientInterpDelayMs: num(o["clientInterpDelayMs"]),
  };
}

// ---------------------------------------------------------------- labels ----

/** zh-Hant badge text for a safety class. */
export const SAFETY_LABEL: Record<OpsSafety, string> = {
  live: "立即生效",
  nextMatch: "下一場生效",
  restart: "需重啟",
  never: "不可從後台變更",
};

/** Badge colour role per safety class (the page maps these to theme colours). */
export const SAFETY_TONE: Record<OpsSafety, "ok" | "warn" | "dim"> = {
  live: "ok",
  nextMatch: "warn",
  restart: "dim",
  never: "dim",
};

// ------------------------------------------------------------------ form ----

/** Editable form state: one raw input string per writable key. */
export type OpsForm = Record<string, string>;

/** Render a value for an input box: 50 → "50", 29.97 → "29.97". */
export function formatValue(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(Number(n.toFixed(4)));
}

/** Seed the form from a payload (stored value, else the compiled default). */
export function formFromPayload(p: OpsPayload): OpsForm {
  const form: OpsForm = {};
  for (const d of p.descriptors) {
    const v = p.doc.values[d.key];
    form[d.key] = formatValue(typeof v === "number" ? v : d.default);
  }
  return form;
}

/** Set one field (returns a new form — the page holds it in useState). */
export function setField(form: OpsForm, key: string, value: string): OpsForm {
  return { ...form, [key]: value };
}

/** Per-row 重設: put a single key back to its compiled default. */
export function resetField(form: OpsForm, d: OpsDescriptor): OpsForm {
  return { ...form, [d.key]: formatValue(d.default) };
}

/** Global 全部重設: every knob back to its compiled default. */
export function resetAll(p: OpsPayload): OpsForm {
  const form: OpsForm = {};
  for (const d of p.descriptors) form[d.key] = formatValue(d.default);
  return form;
}

// ------------------------------------------------------------ validation ----

/** Parse an input box: null when it is not a finite number. */
export function parseValue(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Field-level validation against the SERVER'S descriptor, so the message an
 * operator reads before saving is the same rule the platform will enforce.
 * Returns a zh-Hant message or "" when valid.
 *
 * This is a convenience, NOT the safety layer: the platform re-validates every
 * key on PUT and rejects with a 400 naming the bound. A console that forgot a
 * rule cannot widen anything.
 */
export function validateField(d: OpsDescriptor, text: string): string {
  const t = text.trim();
  if (t === "") return "請輸入數值";
  const n = Number(t);
  if (!Number.isFinite(n)) return "必須是數字";
  if (d.integer && !Number.isInteger(n)) return "必須是整數";
  if (n < d.min || n > d.max) return `必須介於 ${d.min} 與 ${d.max} 之間`;
  return "";
}

export type OpsErrors = Record<string, string>;

/** Validate every field; only failing keys appear in the result. */
export function validateForm(p: OpsPayload, form: OpsForm): OpsErrors {
  const errs: OpsErrors = {};
  for (const d of p.descriptors) {
    const e = validateField(d, form[d.key] ?? "");
    if (e) errs[d.key] = e;
  }
  return errs;
}

/** True when nothing blocks the Save button. */
export function formValid(p: OpsPayload, form: OpsForm): boolean {
  return Object.keys(validateForm(p, form)).length === 0;
}

/**
 * The COUPLED rule, mirrored for pre-flight feedback: the interpolation buffer
 * freezes instead of extrapolating, so a client needs two snapshot intervals of
 * cushion, and every shipped client compiles a fixed interpolation delay. A
 * snapshot rate the fleet cannot absorb is REJECTED by the platform — this only
 * lets the page say so before the round-trip. Returns "" when fine.
 */
export function coupledSnapshotWarning(p: OpsPayload, form: OpsForm): string {
  const hz = parseValue(form["snapshotHz"] ?? "");
  if (hz === null || hz <= 0 || p.clientInterpDelayMs <= 0) return "";
  const needed = Math.floor((2 * 1000) / hz);
  if (needed <= p.clientInterpDelayMs) return "";
  return (
    `快照頻率 ${hz} Hz 需要客戶端至少 ${needed} ms 的插值延遲（兩個快照間隔），` +
    `但目前版本的客戶端編譯值是 ${p.clientInterpDelayMs} ms。` +
    `只調降頻率會讓所有玩家的畫面卡頓，平台會直接拒絕這次儲存。`
  );
}

/** The derived, READ-ONLY line shown under 快照頻率 — the coupling made visible. */
export function interpFloorLine(form: OpsForm): string {
  const hz = parseValue(form["snapshotHz"] ?? "");
  if (hz === null || hz <= 0) return "";
  return `客戶端插值下限 = 2 × (1000 / ${hz}) = ${Math.floor((2 * 1000) / hz)} ms`;
}

// --------------------------------------------------------------- summary ----

/** Keys whose (valid) value differs from what the server has stored. */
export function changedKeys(p: OpsPayload, form: OpsForm): string[] {
  return p.descriptors
    .filter((d) => {
      const n = parseValue(form[d.key] ?? "");
      if (n === null) return true; // an empty/garbage box IS an edit (and an error)
      const saved = p.doc.values[d.key];
      return n !== (typeof saved === "number" ? saved : d.default);
    })
    .map((d) => d.key);
}

/** True when the form has edits the server has not stored yet. */
export function isDirty(p: OpsPayload, form: OpsForm): boolean {
  return changedKeys(p, form).length > 0;
}

/** Keys currently tuned away from the compiled default. */
export function nonDefaultKeys(p: OpsPayload, form: OpsForm): string[] {
  return p.descriptors
    .filter((d) => {
      const n = parseValue(form[d.key] ?? "");
      return n !== null && n !== d.default;
    })
    .map((d) => d.key);
}

/**
 * THE THREE STATES an operator has to be able to tell apart, per knob:
 *
 *   editing   what is in the box right now (unsaved)
 *   saved     what the platform has stored (or the compiled default when
 *             `stored` is false — and we say which)
 *   effect    what is ACTUALLY RUNNING
 *
 * `effect` is the interesting one, and it is not the same as `saved`:
 *   - a live knob (maxRooms) is in force at the next create attempt, i.e.
 *     within the game-server's short cache TTL;
 *   - a next-match knob (snapshotHz) is in force for matches that START from
 *     now on, while every match ALREADY RUNNING keeps the value it was created
 *     with. The console genuinely does not know those values — they are frozen
 *     inside each room — and saying so is more honest than printing a number
 *     that is only true for future matches.
 */
export interface OpsEffect {
  editing: string;
  saved: string;
  savedIsDefault: boolean;
  /** zh-Hant sentence describing what is in effect right now. */
  effect: string;
}

export function effectFor(p: OpsPayload, form: OpsForm, d: OpsDescriptor): OpsEffect {
  const savedRaw = p.doc.values[d.key];
  const saved = typeof savedRaw === "number" ? savedRaw : d.default;
  const editing = form[d.key] ?? "";
  const parsed = parseValue(editing);
  const dirty = parsed === null || parsed !== saved;
  const pending = dirty ? `（尚未儲存的 ${editing || "—"} 還沒有任何效果）` : "";

  let effect: string;
  if (!p.stored) {
    // NOTHING HAS EVER BEEN SAVED, so the platform has NO OPINION — and the
    // console genuinely does not know what the shard is running. The
    // game-server merges the served table over its OWN compiled defaults per
    // key, and an empty table means its own value stands: whatever
    // GGD_MAX_ROOMS / GGD_SNAPSHOT_HZ say in that deploy's environment, which
    // may not be this number at all. Printing 「目前生效：50」 here would be a
    // confident claim about a value we cannot see — the same class of lie as
    // showing a next-match knob as though it were live, and the one an
    // operator would discover only by wondering why the shard behaves
    // differently from the page.
    effect =
      `尚未設定：平台不提供任何值，遊戲伺服器使用它自己的內建／環境變數設定` +
      `（${d.env} 或內建預設 ${formatValue(d.default)}${d.unit}）${pending}`;
  } else if (d.safety === "live") {
    effect = dirty
      ? `目前生效：${formatValue(saved)}${d.unit}${pending}`
      : `目前生效：${formatValue(saved)}${d.unit}（遊戲伺服器最多 5 秒內套用）`;
  } else if (d.safety === "nextMatch") {
    effect = dirty
      ? `下一場對戰將使用：${formatValue(saved)}${d.unit}${pending}`
      : `下一場對戰使用：${formatValue(saved)}${d.unit}；進行中的對戰維持各自開始時的設定`;
  } else {
    effect = `${formatValue(saved)}${d.unit}`;
  }

  return {
    editing,
    saved: formatValue(saved),
    savedIsDefault: !p.stored || saved === d.default,
    effect,
  };
}

/**
 * True when the platform's advertised range admits exactly one value — the knob
 * is visible and explained but not actually adjustable right now.
 *
 * This is a real state, not a bug: snapshotHz's floor is derived from the
 * interpolation delay the shipped clients compile with, and at 66 ms the only
 * rate the fleet can absorb is 30 Hz. Rendering an editable box that rejects
 * every value but the one already in it is worse than saying so.
 */
export function isLocked(d: OpsDescriptor): boolean {
  return d.min === d.max;
}

/** The sentence shown in place of an input for a locked knob. */
export function lockedNote(d: OpsDescriptor): string {
  return `目前只能是 ${formatValue(d.min)}${d.unit}——可調範圍被其他已編譯的數值限制住了，見下方說明`;
}

// ------------------------------------------------------------------ save ----

/** The PUT body: ALWAYS the complete table (PUT-replace semantics). */
export interface OpsSave {
  values: Record<string, number>;
}

/**
 * Build the save payload. The platform treats the body as the complete desired
 * state (an omitted key resets to the compiled default), so we always send every
 * key explicitly — what the operator sees is exactly what gets stored. Invalid
 * fields fall back to the compiled default, but the page gates Save on
 * `formValid`, so that branch is only a safety net.
 */
export function toSavePayload(p: OpsPayload, form: OpsForm): OpsSave {
  const values: Record<string, number> = {};
  for (const d of p.descriptors) {
    const n = parseValue(form[d.key] ?? "");
    values[d.key] = n === null ? d.default : n;
  }
  return { values };
}

/**
 * The note the page must show next to Save. Kept here (not inlined in JSX) so
 * the wording is asserted by a unit test — mixed safety classes on one page are
 * exactly where an operator gets a wrong idea about when a change lands.
 */
export const APPLY_NOTE =
  "儲存後：同時對戰上限立即生效（不影響進行中對戰）；快照頻率下一場對戰生效";

/** The one sentence that must appear when the cap is lowered below the live count. */
export const DRAINING_NOTE =
  "調低同時對戰上限不會結束任何進行中的對戰：超出的部分會「排空」——只是不再開新場，等舊場自然打完";

/** zh-Hant text for a failed save, surfacing the platform's 400 message. */
export function saveErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `儲存失敗：${msg}`;
}

/** zh-Hant text for a failed load. */
export function loadErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `讀取系統運維設定失敗：${msg}`;
}
