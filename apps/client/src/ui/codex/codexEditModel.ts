/**
 * codexEditModel — the PURE half of the codex editor (task #96).
 *
 * Everything here is plain data manipulation over the raw document the codex
 * already keeps (`entry.doc` is the exact JSON on disk), so all of it is
 * unit-testable in the client's node vitest env. NOTHING here talks to the
 * network and nothing here decides whether editing is allowed — that is
 * `codexEdit.ts`, which is dev-build gated and is the only module in this
 * directory permitted to write.
 *
 * THE MIRROR RULE — the trap this file exists to close. Every Q/W/E/R ability
 * is stored TWICE: standalone at `content/abilities/<id>.json` AND embedded in
 * its champion under `abilities[<slot>]`. The SIM reads the EMBEDDED copy
 * (sim/content/registry.ts registers `def.abilities[slot]`), so an editor that
 * saved only the standalone doc would look like it worked and change nothing
 * in game. `mirrorPlan()` turns one ability edit into the pair of writes that
 * keeps the two copies identical. (An EX ability is referenced by `exAbility`
 * and has no embedded twin, so it mirrors nowhere — also handled here.)
 *
 * Empty input means ABSENT, not empty: clearing a field removes the key rather
 * than writing `""`/`null`, because the shared Zod schemas spell "no value" as
 * an absent optional key. Whether that is legal for a given field is not
 * guessed here — the server dry-run validates with the very schemas the game
 * loader uses, and its FieldIssues are what the UI shows.
 */
import type { CodexKind } from "@ggd/shared/codex/codexTypes";

/** The three content collections the codex browses. */
export type CodexCollection = "items" | "champions" | "abilities";

export function collectionOf(kind: CodexKind): CodexCollection {
  return kind === "item" ? "items" : kind === "champion" ? "champions" : "abilities";
}

/** Dev content-api mount (same-origin: vite proxies it, nginx in the dev profile). */
export const EDIT_BASE = "/content-api";

/** URL for one document, optionally a sub-route ("validate" / "backups" / "restore"). */
export function docUrl(collection: CodexCollection, id: string, sub?: string): string {
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
  | "numberList";

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
  readonly collection: CodexCollection;
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
  kind: CodexKind,
  id: string,
  doc: Record<string, unknown>,
  championDoc?: Readonly<Record<string, unknown>> | null,
): WritePlanStep[] {
  const steps: WritePlanStep[] = [
    { collection: collectionOf(kind), id, doc, reason: "edit" },
  ];
  if (kind !== "ability" || !championDoc) return steps;
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
