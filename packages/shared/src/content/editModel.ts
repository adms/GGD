/**
 * editModel — the PURE half of the content editor, shared by every view that
 * edits `content/` (task #96 authored it inside the client codex; task #102
 * re-homed it here so the admin console reuses the SAME logic instead of
 * growing a second, subtly-different copy).
 *
 * Everything here is plain data manipulation over the raw document on disk, so
 * all of it is unit-testable in a plain node env. NOTHING here talks to the
 * network and nothing here decides whether editing is ALLOWED — authorisation
 * is `apps/content-api/src/guard.ts` (loopback peer, read off the socket), and
 * reachability is the vite bind address. A pure function is never a lock.
 *
 * THE MIRROR RULE — the trap this file exists to close. Every Q/W/E/R ability
 * is stored TWICE: standalone at `content/abilities/<id>.json` AND embedded in
 * its champion under `abilities[<slot>]`. The SIM reads the EMBEDDED copy
 * (sim/content/registry.ts registers `def.abilities[slot]`), so an editor that
 * saved only the standalone doc would look like it worked and change nothing
 * in game. `writePlan()` turns one ability edit into the pair of writes that
 * keeps the two copies identical. (An EX ability is referenced by `exAbility`
 * and has no embedded twin, so it mirrors nowhere — also handled here.)
 *
 * Empty input means ABSENT, not empty: clearing a field removes the key rather
 * than writing `""`/`null`, because the shared Zod schemas spell "no value" as
 * an absent optional key. Whether that is legal for a given field is not
 * guessed here — the server dry-run validates with the very schemas the game
 * loader uses, and its FieldIssues are what the UI shows.
 */

/**
 * The content collections an editor browses.
 *
 * `augments` are the 3-choose-1 DRAFT abilities (能力抽卡). The owner asked for
 * them to be editable SEPARATELY from champion abilities (task #70 rule 3:
 * 「隨機三選一的技能應該也要在後台單獨被編輯，因為他不是角色預設技能」) — they
 * are power-ups a player drafts mid-match, not any champion's Q/W/E/R, so they
 * are their own collection with no champion mirror (see `writePlan`). The
 * content-api already validates/saves them (they are in the shared COLLECTIONS
 * registry); this only surfaces them in the console.
 */
/**
 * `vfx` (特效管理, task #205) and `arenas` (場景物件管理) join the editable set.
 * Both were ALREADY in the shared COLLECTIONS registry (zVfxCollectionDoc /
 * zArenaDoc) and both already have `content/<c>/_index.json`, so the content-api
 * validates and writes them today — this only surfaces them in the console. Like
 * `abilities` (and unlike a champion Q/W/E/R), neither mirrors anywhere, so
 * `writePlan` needs no change: each yields a single {reason:"edit"} step.
 */
/**
 * `models` (task #229's 鑄形工坊) joins the editable set. Like `vfx` / `arenas`
 * it was ALREADY in the shared COLLECTIONS registry (`zModelDoc`) and already
 * has `content/models/_index.json`, so the content-api has always validated and
 * written it — this only surfaces it to the console, which is what the voxel
 * studio needs to save the `model@1` document it authors. It mirrors NOWHERE
 * (only a Q/W/E/R ability has an embedded twin), so `writePlan` is unchanged
 * and a model edit is a single {reason:"edit"} step.
 */
export type EditCollection =
  | "items"
  | "champions"
  | "abilities"
  | "augments"
  | "loot-tables"
  | "vfx"
  | "arenas"
  | "models";

export const EDIT_COLLECTIONS: readonly EditCollection[] = [
  "champions",
  "abilities",
  "items",
  "augments",
  "loot-tables",
  "vfx",
  "arenas",
  "models",
];

export function isEditCollection(v: unknown): v is EditCollection {
  return (
    v === "items" ||
    v === "champions" ||
    v === "abilities" ||
    v === "augments" ||
    v === "loot-tables" ||
    v === "vfx" ||
    v === "arenas" ||
    v === "models"
  );
}

/** Dev content-api mount (same-origin: the admin vite dev server proxies it). */
export const EDIT_BASE = "/content-api";

/** URL for one document, optionally a sub-route ("validate" / "backups" / "restore"). */
export function docUrl(collection: EditCollection, id: string, sub?: string): string {
  const base = `${EDIT_BASE}/${collection}/${encodeURIComponent(id)}`;
  return sub === undefined ? base : `${base}/${sub}`;
}

/** The content-api's manifest route — the cheapest "is the editor backend up?" probe. */
export function manifestUrl(): string {
  return `${EDIT_BASE}/manifest`;
}

// ---------------------------------------------------------------------------
// field kinds
// ---------------------------------------------------------------------------

export type FieldKind =
  | "text"
  | "multiline"
  | "number"
  | "integer"
  | "boolean"
  | "stringList"
  | "numberList"
  /**
   * A whole JSON value in one box — for a field whose shape is a nested array
   * or object that no flat input can express (`ability.vfxLayers`, #205).
   *
   * ⚠️ It is NOT "the raw-JSON escape hatch with a label". The escape hatch
   * edits the DOCUMENT; this edits ONE field, so a typo cannot damage the rest
   * of the doc — and, like every other kind, an empty box means REMOVE THE KEY
   * (`undefined`), which is how the Zod schemas spell absence. Writing `[]`
   * instead would be a different fact: 「這支技能明確要求零層」.
   */
  | "json";

export interface ParseOk {
  readonly ok: true;
  /** `undefined` means REMOVE the key (the schemas spell absence that way). */
  readonly value: unknown;
}
export interface ParseFail {
  readonly ok: false;
  readonly error: string;
}
export type ParseResult = ParseOk | ParseFail;

/** Render a stored value into the string an <input> shows. */
export function formatField(kind: FieldKind, value: unknown): string {
  if (value === undefined || value === null) return "";
  switch (kind) {
    case "boolean":
      return value === true ? "true" : "false";
    case "stringList":
      return Array.isArray(value) ? value.filter((v) => typeof v === "string").join(", ") : "";
    case "numberList":
      return Array.isArray(value)
        ? value.filter((v) => typeof v === "number").map((v) => String(v)).join(", ")
        : "";
    case "number":
    case "integer":
      return typeof value === "number" ? String(value) : String(value);
    case "json":
      // PRETTY, not compact: a 3-layer `vfxLayers` on one line is unreadable
      // and unreviewable, which is how a wrong key gets typed and shipped.
      return JSON.stringify(value, null, 2);
    default:
      return typeof value === "string" ? value : JSON.stringify(value);
  }
}

const LIST_SPLIT = /[,\n]/;

/** Parse what the user typed back into a JSON value (or an error to show). */
export function parseField(kind: FieldKind, raw: string): ParseResult {
  const trimmed = kind === "multiline" ? raw : raw.trim();
  if (trimmed === "") return { ok: true, value: undefined };
  switch (kind) {
    case "text":
    case "multiline":
      return { ok: true, value: trimmed };
    case "json": {
      try {
        return { ok: true, value: JSON.parse(trimmed) as unknown };
      } catch (e) {
        return { ok: false, error: `JSON 解析失敗：${(e as Error).message}` };
      }
    }
    case "boolean": {
      const v = trimmed.toLowerCase();
      if (v === "true" || v === "1" || v === "yes") return { ok: true, value: true };
      if (v === "false" || v === "0" || v === "no") return { ok: true, value: false };
      return { ok: false, error: "請填 true 或 false" };
    }
    case "number":
    case "integer": {
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return { ok: false, error: `「${trimmed}」不是數字` };
      if (kind === "integer" && !Number.isInteger(n)) return { ok: false, error: "必須是整數" };
      return { ok: true, value: n };
    }
    case "stringList": {
      const parts = trimmed.split(LIST_SPLIT).map((s) => s.trim()).filter((s) => s !== "");
      return { ok: true, value: parts };
    }
    case "numberList": {
      const parts = trimmed.split(LIST_SPLIT).map((s) => s.trim()).filter((s) => s !== "");
      const out: number[] = [];
      for (const p of parts) {
        const n = Number(p);
        if (!Number.isFinite(n)) return { ok: false, error: `「${p}」不是數字` };
        out.push(n);
      }
      return { ok: true, value: out };
    }
    default:
      return { ok: false, error: "unsupported field" };
  }
}

// ---------------------------------------------------------------------------
// immutable path access
// ---------------------------------------------------------------------------

type Json = Record<string, unknown> | unknown[];

const isIndex = (s: string): boolean => /^\d+$/.test(s);

function container(v: unknown): Json | null {
  return typeof v === "object" && v !== null ? (v as Json) : null;
}

/** Read `doc` at a dot path ("baseStats.hp", "cooldown.0"); undefined if absent. */
export function getAt(doc: unknown, path: string): unknown {
  let cur: unknown = doc;
  for (const seg of path.split(".")) {
    const c = container(cur);
    if (c === null) return undefined;
    cur = Array.isArray(c) ? (isIndex(seg) ? c[Number(seg)] : undefined) : c[seg];
  }
  return cur;
}

/**
 * Copy `doc` with `path` set to `value`, or with the key REMOVED when `value`
 * is undefined. Missing intermediate containers are created (object, or array
 * when the next segment is an index). The input is never mutated.
 */
export function setAt<T extends Record<string, unknown>>(doc: T, path: string, value: unknown): T {
  const segs = path.split(".").filter((s) => s !== "");
  if (segs.length === 0) return doc;
  return setIn(doc, segs, value) as T;
}

function setIn(node: unknown, segs: string[], value: unknown): unknown {
  const [seg, ...rest] = segs as [string, ...string[]];
  const asArray = Array.isArray(node) || (container(node) === null && isIndex(seg));
  if (asArray) {
    const src = Array.isArray(node) ? node : [];
    const idx = isIndex(seg) ? Number(seg) : -1;
    if (idx < 0) return src;
    const out = src.slice();
    if (rest.length === 0) {
      if (value === undefined) out.splice(idx, 1);
      else out[idx] = value;
    } else {
      out[idx] = setIn(out[idx], rest, value);
    }
    return out;
  }
  const src = (container(node) as Record<string, unknown> | null) ?? {};
  const out: Record<string, unknown> = { ...src };
  if (rest.length === 0) {
    if (value === undefined) delete out[seg];
    else out[seg] = value;
  } else {
    out[seg] = setIn(out[seg], rest, value);
  }
  return out;
}

/** Apply a whole edit map (path → value) to a document, in stable key order. */
export function applyEdits<T extends Record<string, unknown>>(
  doc: T,
  edits: Readonly<Record<string, unknown>>,
): T {
  let out = doc;
  for (const path of Object.keys(edits).sort()) out = setAt(out, path, edits[path]);
  return out;
}

// ---------------------------------------------------------------------------
// diff — what the user is about to overwrite
// ---------------------------------------------------------------------------

export interface DocChange {
  readonly path: string;
  /** JSON text of the value before/after; "（無）" when the key is absent */
  readonly before: string;
  readonly after: string;
}

const ABSENT = "（無）";
const show = (v: unknown): string => (v === undefined ? ABSENT : JSON.stringify(v));

/**
 * Leaf-level diff between two documents. Recurses into plain objects only;
 * arrays and scalars are compared whole (an ability's `effects` reads far
 * better as one changed block than as forty index paths).
 */
export function diffDocs(before: unknown, after: unknown, prefix = ""): DocChange[] {
  const a = container(before);
  const b = container(after);
  const bothPlain = a !== null && b !== null && !Array.isArray(a) && !Array.isArray(b);
  if (!bothPlain) {
    if (JSON.stringify(before) === JSON.stringify(after)) return [];
    return [{ path: prefix, before: show(before), after: show(after) }];
  }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const out: DocChange[] = [];
  for (const k of keys) {
    const path = prefix === "" ? k : `${prefix}.${k}`;
    out.push(
      ...diffDocs((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// the mirror rule
// ---------------------------------------------------------------------------

export const CORE_SLOTS = ["Q", "W", "E", "R"] as const;
export type CoreSlot = (typeof CORE_SLOTS)[number];

/** Which embedded slot of `championDoc` holds `abilityId` (null = none). */
export function embeddedSlotOf(
  championDoc: Readonly<Record<string, unknown>> | null | undefined,
  abilityId: string,
): CoreSlot | null {
  const abilities = container(championDoc?.["abilities"]);
  if (abilities === null || Array.isArray(abilities)) return null;
  for (const slot of CORE_SLOTS) {
    const embedded = container((abilities as Record<string, unknown>)[slot]);
    if (embedded === null || Array.isArray(embedded)) continue;
    if ((embedded as Record<string, unknown>)["id"] === abilityId) return slot;
  }
  return null;
}

/**
 * The embedded form of a standalone ability doc: identical minus the `schema`
 * discriminator, which the embedded shape (`zAbilityDef`, strict) forbids.
 */
export function embeddedForm(
  abilityDoc: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out = { ...abilityDoc };
  delete out["schema"];
  return out;
}

export interface WritePlanStep {
  readonly collection: EditCollection;
  readonly id: string;
  readonly doc: Record<string, unknown>;
  /** why this write exists — shown in the save summary */
  readonly reason: "edit" | "mirror";
}

/**
 * Turn one edited document into the COMPLETE set of writes that keeps content
 * self-consistent. For items, champions and EX abilities that is one write;
 * for a Q/W/E/R ability it is two — the standalone doc and its champion's
 * embedded twin — because the sim reads the embedded one.
 */
export function writePlan(
  collection: EditCollection,
  id: string,
  doc: Record<string, unknown>,
  championDoc?: Readonly<Record<string, unknown>> | null,
): WritePlanStep[] {
  const steps: WritePlanStep[] = [{ collection, id, doc, reason: "edit" }];
  if (collection !== "abilities" || !championDoc) return steps;
  const slot = embeddedSlotOf(championDoc, id);
  const championId = typeof championDoc["id"] === "string" ? championDoc["id"] : null;
  if (slot === null || championId === null) return steps;
  const patched = setAt(
    championDoc as Record<string, unknown>,
    `abilities.${slot}`,
    embeddedForm(doc),
  );
  steps.push({ collection: "champions", id: championId, doc: patched, reason: "mirror" });
  return steps;
}

// ---------------------------------------------------------------------------
// mirror-aware LINE EDIT (鑄技工坊 / #78) — never JSON round-trip the champion
// ---------------------------------------------------------------------------

/**
 * WC3-derived champion docs store whole-number floats as `"60.0"`. A full-doc
 * `JSON.stringify(doc, null, 2)` renders those as `"60"` — a byte diff on EVERY
 * `X.0` across ALL five slots, not just the one being edited. So the mirror
 * write must splice ONLY the target slot's brace-matched span, leaving every
 * other byte (all the sibling slots' `"60.0"`s, key order, spacing) untouched.
 *
 * These functions are PURE string surgery over the champion file TEXT, unit-
 * tested in editModel.test.ts. The content-api's mirror sub-route calls them;
 * the guard (loopback/Origin/NODE_ENV) is unchanged.
 */

/** Fields whose whole-number values WC3 content stores with a trailing `.0`. */
const FLOAT_FIELDS = new Set([
  "cooldown",
  "manaCost",
  "range",
  "radius",
  "castTimeSec",
  "recoverySec",
  "duration",
]);

/**
 * JSON.stringify with the project's 2-space indent, re-inserting the `.0` on
 * whole-number values that live under a FLOAT_FIELDS key (so the spliced slot
 * matches the surrounding champion doc's float convention). Effect amounts and
 * other integers render plain. `baseIndent` is the column the value sits at.
 */
export function stringifyEmbedded(value: unknown, baseIndent: string): string {
  const walk = (v: unknown, indent: string, floaty: boolean): string => {
    if (typeof v === "number") {
      if (floaty && Number.isInteger(v)) return `${v}.0`;
      return String(v);
    }
    if (v === null) return "null";
    if (typeof v === "boolean") return String(v);
    if (typeof v === "string") return JSON.stringify(v);
    const next = indent + "  ";
    if (Array.isArray(v)) {
      if (v.length === 0) return "[]";
      const items = v.map((el) => `${next}${walk(el, next, floaty)}`);
      return `[\n${items.join(",\n")}\n${indent}]`;
    }
    if (typeof v === "object") {
      const entries = Object.entries(v as Record<string, unknown>);
      if (entries.length === 0) return "{}";
      const lines = entries.map(
        ([k, val]) => `${next}${JSON.stringify(k)}: ${walk(val, next, FLOAT_FIELDS.has(k))}`,
      );
      return `{\n${lines.join(",\n")}\n${indent}}`;
    }
    return "null";
  };
  return walk(value, baseIndent, false);
}

/** Skip a JSON value starting at `i` (first non-ws char); return the index AFTER it. */
function skipValue(text: string, i: number): number {
  const c = text[i];
  if (c === "{" || c === "[") {
    const open = c;
    const close = c === "{" ? "}" : "]";
    let depth = 0;
    let inStr = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (inStr) {
        if (ch === "\\") j++;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return j + 1;
      }
    }
    throw new Error("unbalanced JSON while splicing champion slot");
  }
  if (c === '"') {
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === "\\") j++;
      else if (text[j] === '"') return j + 1;
    }
    throw new Error("unterminated string while splicing champion slot");
  }
  // number / literal: read until a JSON delimiter
  let j = i;
  while (j < text.length && !",}]\n".includes(text[j]!)) j++;
  return j;
}

/** Index of the `"key":` occurrence at object depth 1 inside the object at `objBrace`. */
function findKeyInObject(text: string, objBrace: number, key: string): number {
  const needle = `"${key}"`;
  let depth = 0;
  let inStr = false;
  for (let j = objBrace; j < text.length; j++) {
    const ch = text[j];
    if (inStr) {
      if (ch === "\\") j++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      if (depth === 1 && text.startsWith(needle, j)) {
        const after = j + needle.length;
        const colon = text.indexOf(":", after);
        if (colon !== -1) return j;
      }
      inStr = true;
    } else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return -1; // left the abilities object
    }
  }
  return -1;
}

/**
 * Replace the embedded `abilities.<slot>` block inside a champion doc's TEXT with
 * `embedded`, touching no other byte. Throws if the slot is not present.
 */
export function spliceEmbeddedSlot(
  championText: string,
  slot: CoreSlot,
  embedded: Record<string, unknown>,
): string {
  const abilitiesKey = findKeyInObject(championText, championText.indexOf("{"), "abilities");
  if (abilitiesKey === -1) throw new Error("champion doc has no abilities object");
  const abilitiesBrace = championText.indexOf("{", abilitiesKey);
  const slotKey = findKeyInObject(championText, abilitiesBrace, slot);
  if (slotKey === -1) throw new Error(`champion doc has no abilities.${slot}`);
  const colon = championText.indexOf(":", slotKey);
  let valueStart = colon + 1;
  while (valueStart < championText.length && " \t".includes(championText[valueStart]!)) valueStart++;
  const valueEnd = skipValue(championText, valueStart);
  // indent = whitespace before the slot key on its line
  const lineStart = championText.lastIndexOf("\n", slotKey) + 1;
  const indent = championText.slice(lineStart, slotKey);
  const serialized = stringifyEmbedded(embedded, indent);
  return championText.slice(0, valueStart) + serialized + championText.slice(valueEnd);
}

/**
 * Replace ONE top-level member's value inside a pretty-printed JSON doc's TEXT.
 * The standalone half of the 鑄技工坊 writeback: re-authoring an ability onto a
 * template only ever changes `template` / `effects` / `castType` / `radius` /
 * `targetsEnemies` / `innateKind` / `passive` / `castTimeSec`, so splicing those
 * members one at a time makes the git diff show exactly those lines — instead of
 * a whole-file `JSON.stringify` renormalising every `350.0` the Python exporter
 * wrote into `350` (measured: 56 of 359 lines on content/champions/godie-hart.json).
 *
 * Throws when the member is absent: a blind append would put the key in the
 * wrong place and silently reorder the doc, so the caller must add new members
 * through the full-doc PUT path instead.
 */
export function spliceTopLevelMember(text: string, key: string, value: unknown): string {
  const rootBrace = text.indexOf("{");
  if (rootBrace === -1) throw new Error("document is not a JSON object");
  const keyAt = findKeyInObject(text, rootBrace, key);
  if (keyAt === -1) throw new Error(`document has no top-level member "${key}"`);
  const colon = text.indexOf(":", keyAt);
  let valueStart = colon + 1;
  while (valueStart < text.length && " \t".includes(text[valueStart]!)) valueStart++;
  const valueEnd = skipValue(text, valueStart);
  const lineStart = text.lastIndexOf("\n", keyAt) + 1;
  const indent = text.slice(lineStart, keyAt);
  return text.slice(0, valueStart) + stringifyEmbedded(value, indent) + text.slice(valueEnd);
}

/**
 * Apply a member patch to a doc's TEXT, one splice per key, preserving every
 * byte outside the patched members. Key order on disk is untouched (a splice
 * never moves a member), so the resulting diff is minimal by construction.
 */
export function spliceMembers(text: string, patch: Record<string, unknown>): string {
  let out = text;
  for (const [k, v] of Object.entries(patch)) out = spliceTopLevelMember(out, k, v);
  return out;
}
