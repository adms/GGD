/**
 * codexData — the LIVE data layer of the 內容圖鑑 (task #71).
 *
 * It reads the real content tree over HTTP at runtime:
 *
 *     GET /content/manifest.json          → contentVersion
 *     GET /content/<collection>/_index.json → the doc list
 *     GET /content/<doc path>             → every champion / item / ability doc
 *
 * That mount is the same one the game itself boots from (apps/client/
 * vite.config.ts `serveContent` in dev, nginx in prod), so editing a JSON under
 * content/ and reloading the page changes what the codex shows. There is NO
 * generated snapshot and NO baked copy anywhere in this directory — see
 * codexLive.test.ts, which fails the build if one appears.
 *
 * Everything here is pure over an injected `fetchFn`, so the whole layer is
 * unit-testable in the client's node vitest env (no DOM, no network).
 *
 * TOLERANT BY DESIGN: the codex's second job is REPORTING broken data, so it
 * must be able to load broken data. Nothing is schema-validated here (a zod
 * failure would hide the very row we want to list); missing/oddly-typed fields
 * degrade to null and are surfaced by codexIssues.ts instead.
 */
import {
  heroNumberFromAbilityName,
  nameComponents,
  HERO_NUMBER_RE,
} from "@ggd/shared/content/championIdentity";
import { stripAbilityNumber } from "../components/abilityText";
import type {
  CodexAbility,
  CodexChampion,
  CodexCollectionCount,
  CodexData,
  CodexItem,
  CodexItemBucket,
  CodexKind,
  CodexModifier,
  CodexSlot,
  CodexWhitelist,
} from "@ggd/shared/codex/codexTypes";
import type { ChampionAttributes } from "@ggd/shared/sim/stats/attributes";

/** Content mount (dev: vite `serveContent`; prod: nginx). */
export const CONTENT_BASE = "/content";
/** Operator curation read endpoint (dev vite proxies /api → platform :8080). */
export const WHITELIST_URL = "/api/v1/curation/whitelist";

/** Permissive default — an unreachable platform must never read as "disabled". */
export const UNKNOWN_WHITELIST: CodexWhitelist = {
  enforced: false,
  champions: new Set(),
  items: new Set(),
  abilities: new Set(),
};

export type FetchFn = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export interface LoadCodexOptions {
  /** injected for tests; defaults to the global fetch */
  fetchFn?: FetchFn;
  /** content mount override (tests) */
  base?: string;
  /** whitelist endpoint override (tests) */
  whitelistUrl?: string;
  /**
   * Parallel in-flight document requests (default 12). Deliberately modest:
   * the client's own content boot is pulling the same ~879 docs at the same
   * time, and a wider burst starves the row <img> loads (an icon that fails
   * once shows its fallback glyph until the row remounts).
   */
  concurrency?: number;
  /** clock injection so tests can pin `loadedAt` */
  now?: () => number;
}

// ---------------------------------------------------------------------------
// tiny fetch helpers
// ---------------------------------------------------------------------------

function defaultFetch(url: string): Promise<{ ok: boolean; json(): Promise<unknown> }> {
  return fetch(url);
}

/** GET + parse JSON; null on any failure (never throws — the page must render). */
async function getJson(fetchFn: FetchFn, url: string): Promise<unknown | null> {
  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * GET one JSON file off the content mount, relative to `/content`.
 *
 * EXPORTED SO THE LOADER STAYS THE ONLY FETCHER. `codexLive.test.ts` allows
 * exactly two modules in this directory to call `fetch` (this one and the icon
 * scanner); the live icon-coverage poll (task #97) re-reads `_index.json` and
 * the odd changed doc, so it borrows this instead of opening a second door.
 * Null on any failure — a poll must never throw into React.
 */
export function fetchContentJson(
  path: string,
  opts: { fetchFn?: FetchFn; base?: string } = {},
): Promise<unknown | null> {
  return getJson(opts.fetchFn ?? defaultFetch, `${opts.base ?? CONTENT_BASE}/${path}`);
}

/** `fetchContentJson` over many paths, bounded (default 4 — see LoadCodexOptions). */
export function fetchContentJsonMany(
  paths: readonly string[],
  opts: { fetchFn?: FetchFn; base?: string; concurrency?: number } = {},
): Promise<(unknown | null)[]> {
  return pooled(paths, opts.concurrency ?? 4, (p) => fetchContentJson(p, opts));
}

/** Run `work` over `inputs` with a bounded number of in-flight promises. */
async function pooled<I, O>(inputs: readonly I[], limit: number, work: (i: I) => Promise<O>): Promise<O[]> {
  const out = new Array<O>(inputs.length);
  let next = 0;
  const size = Math.max(1, Math.min(limit, inputs.length));
  await Promise.all(
    Array.from({ length: size }, async () => {
      for (;;) {
        const i = next++;
        if (i >= inputs.length) return;
        out[i] = await work(inputs[i] as I);
      }
    }),
  );
  return out;
}

// ---------------------------------------------------------------------------
// field readers (tolerant — content may be broken, that is the point)
// ---------------------------------------------------------------------------

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function optNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function numArray(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number" && Number.isFinite(x)) : [];
}
function numRecord(v: unknown): Record<string, number> {
  const src = asRecord(v);
  if (!src) return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(src)) if (typeof val === "number" && Number.isFinite(val)) out[k] = val;
  return out;
}
/**
 * The 三圍 block (task #248). All six numbers must be present and finite — a
 * partial block would make `championStatBase` derive from garbage, so a
 * malformed one degrades to null (= no attribute derivation) rather than to
 * zeros. Stays a runtime read of the fetched doc, per the liveness contract.
 */
function championAttributes(v: unknown): ChampionAttributes | null {
  const src = asRecord(v);
  if (!src) return null;
  const n = (k: string): number | null => {
    const x = src[k];
    return typeof x === "number" && Number.isFinite(x) ? x : null;
  };
  const [st, ag, it, sg, agg, ig] = [n("str"), n("agi"), n("int"), n("strGrowth"), n("agiGrowth"), n("intGrowth")];
  if (st === null || ag === null || it === null || sg === null || agg === null || ig === null) return null;
  const primary = src["primary"];
  const source = src["source"];
  return {
    str: st,
    agi: ag,
    int: it,
    strGrowth: sg,
    agiGrowth: agg,
    intGrowth: ig,
    primary: primary === "AGI" || primary === "INT" ? primary : "STR",
    source: source === "authored" ? "authored" : "w3x",
  };
}

// ---------------------------------------------------------------------------
// pure normalisers (exported: the unit tests drive these directly)
// ---------------------------------------------------------------------------

/**
 * Split a champion `name` on the WC3 convention 「稱號 - 全名」.
 * 109 of 113 champions follow it; the four that do not (sela, thorne,
 * 不良少年, 死亡騎士) come back as `{ title: null, fullName: name }`.
 * Reuses `nameComponents` so the codex and the identity rule split names the
 * SAME way (an unspaced hyphen belongs to the token: 「英靈-亞瑟王 - 黑化Saber」).
 */
export function splitChampionName(name: string): { title: string | null; fullName: string } {
  const parts = nameComponents(name);
  if (parts.length < 2) return { title: null, fullName: name.trim() === "" ? name : name.trim() };
  const fullName = parts[parts.length - 1] as string;
  return { title: parts.slice(0, -1).join(" - "), fullName };
}

/** `"20-002 解放"` → `"002"`; null when the name carries no valid 編號 prefix. */
export function skillIndexFromAbilityName(name: string | null | undefined): string | null {
  if (typeof name !== "string") return null;
  const m = HERO_NUMBER_RE.exec(name.trim());
  return m ? (m[2] ?? null) : null;
}

/** `"godie-e002.q"` → `"godie-e002"`; null when the id has no `.slot` suffix. */
export function championIdOfAbility(abilityId: string): string | null {
  const dot = abilityId.lastIndexOf(".");
  return dot > 0 ? abilityId.slice(0, dot) : null;
}

function modifiers(v: unknown): CodexModifier[] {
  if (!Array.isArray(v)) return [];
  const out: CodexModifier[] = [];
  for (const raw of v) {
    const m = asRecord(raw);
    if (!m) continue;
    out.push({ stat: str(m["stat"]) ?? "?", op: str(m["op"]) ?? "flat", value: num(m["value"]) });
  }
  return out;
}

/**
 * The item bucket. Prefers whatever task #70 authors on the doc (`bucket` or
 * `kind`); falls back to a derived split that only claims what today's docs can
 * prove. `source` is rendered in the UI so nobody mistakes the fallback for
 * curation.
 */
export function bucketOf(doc: Record<string, unknown>): { bucket: CodexItemBucket; source: "doc" | "derived" } {
  const authored = str(doc["bucket"]) ?? str(doc["kind"]);
  const KNOWN: readonly string[] = ["final", "component", "recipe-book", "quest-reward", "token-no-op"];
  if (authored && KNOWN.includes(authored)) return { bucket: authored as CodexItemBucket, source: "doc" };
  const name = str(doc["name"]) ?? "";
  if (name.includes("製作書")) return { bucket: "recipe-book", source: "derived" };
  if (num(doc["cost"], 0) === 0) return { bucket: "quest-reward", source: "derived" };
  const mods = modifiers(doc["modifiers"]);
  return { bucket: mods.length > 0 ? "with-modifiers" : "no-modifiers", source: "derived" };
}

export function normaliseItem(raw: unknown): CodexItem | null {
  const doc = asRecord(raw);
  const id = doc ? str(doc["id"]) : null;
  if (!doc || !id) return null;
  const name = str(doc["name"]) ?? id;
  const description = str(doc["description"]);
  const tags = strArray(doc["tags"]);
  const { bucket, source } = bucketOf(doc);
  const mods = modifiers(doc["modifiers"]);
  return {
    kind: "item",
    id,
    name,
    description,
    cost: num(doc["cost"]),
    tier: num(doc["tier"], 0),
    tags,
    modifiers: mods,
    unique: doc["unique"] === true,
    hasPassive: Array.isArray(doc["passive"]) && doc["passive"].length > 0,
    icon: str(doc["icon"]),
    bucket,
    bucketSource: source,
    searchKey: [id, name, description ?? "", tags.join(" "), mods.map((m) => m.stat).join(" ")]
      .join("\n")
      .toLowerCase(),
    doc,
  };
}

export function normaliseChampion(raw: unknown): CodexChampion | null {
  const doc = asRecord(raw);
  const id = doc ? str(doc["id"]) : null;
  if (!doc || !id) return null;
  const name = str(doc["name"]) ?? id;
  const { title, fullName } = splitChampionName(name);
  const description = str(doc["description"]);
  const tags = strArray(doc["tags"]);

  // hero 編號 — the champion IDENTITY (task #55). Derived from the ability
  // names exactly the way the shared rule does, incl. the EX ability, so the
  // codex can never disagree with curation about who a champion is.
  const abilities = asRecord(doc["abilities"]) ?? {};
  const abilityIds: string[] = [];
  const numbers = new Set<string>();
  for (const slot of ["Q", "W", "E", "R"] as const) {
    const ab = asRecord(abilities[slot]);
    if (!ab) continue;
    const abId = str(ab["id"]);
    if (abId) abilityIds.push(abId);
    const n = heroNumberFromAbilityName(str(ab["name"]));
    if (n) numbers.add(n);
  }
  const exAbilityId = str(doc["exAbility"]);

  return {
    kind: "champion",
    id,
    name,
    title,
    fullName,
    heroNumber: numbers.size === 1 ? ((numbers.values().next().value as string) ?? null) : null,
    description,
    role: str(doc["role"]) ?? "?",
    attackType: str(doc["attackType"]) ?? "?",
    modelKey: str(doc["modelKey"]),
    icon: str(doc["icon"]),
    baseStats: numRecord(doc["baseStats"]),
    growth: numRecord(doc["growth"]),
    attributes: championAttributes(doc["attributes"]),
    abilityIds,
    exAbilityId,
    buildPriority: strArray(doc["buildPriority"]),
    tags,
    searchKey: [id, name, title ?? "", fullName, description ?? "", str(doc["role"]) ?? "", tags.join(" ")]
      .join("\n")
      .toLowerCase(),
    doc,
  };
}

const SLOTS: readonly string[] = ["Q", "W", "E", "R", "EX"];

export function normaliseAbility(raw: unknown): CodexAbility | null {
  const doc = asRecord(raw);
  const id = doc ? str(doc["id"]) : null;
  if (!doc || !id) return null;
  const name = str(doc["name"]) ?? id;
  const description = str(doc["description"]);
  const slotRaw = str(doc["slot"]) ?? "";
  const slot = (SLOTS.includes(slotRaw) ? slotRaw : "Q") as CodexSlot;
  const heroNumber = heroNumberFromAbilityName(name);
  return {
    kind: "ability",
    id,
    name,
    cleanName: stripAbilityNumber(name),
    heroNumber,
    skillIndex: skillIndexFromAbilityName(name),
    slot,
    championId: championIdOfAbility(id),
    description,
    castType: str(doc["castType"]) ?? "?",
    maxRank: num(doc["maxRank"], 1),
    cooldown: numArray(doc["cooldown"]),
    manaCost: numArray(doc["manaCost"]),
    range: num(doc["range"]),
    radius: optNum(doc["radius"]),
    castTimeSec: optNum(doc["castTimeSec"]),
    targetsEnemies: typeof doc["targetsEnemies"] === "boolean" ? doc["targetsEnemies"] : null,
    effects: Array.isArray(doc["effects"])
      ? doc["effects"].map((e) => asRecord(e)).filter((e): e is Record<string, unknown> => e !== null)
      : [],
    vfxKey: str(doc["vfxKey"]),
    icon: str(doc["icon"]),
    searchKey: [id, name, stripAbilityNumber(name), description ?? "", slotRaw, heroNumber ?? ""]
      .join("\n")
      .toLowerCase(),
    doc,
  };
}

/** Parse the curation whitelist doc; anything unexpected → allow-all. */
export function whitelistFrom(raw: unknown): CodexWhitelist {
  const doc = asRecord(raw);
  if (!doc) return UNKNOWN_WHITELIST;
  const set = (v: unknown): Set<string> => new Set(strArray(v));
  return {
    enforced: true,
    champions: set(doc["champions"]),
    items: set(doc["items"]),
    abilities: set(doc["abilities"]),
  };
}

// ---------------------------------------------------------------------------
// the load
// ---------------------------------------------------------------------------

interface IndexEntry {
  id: string;
  path: string;
}

function indexEntries(raw: unknown): IndexEntry[] {
  const doc = asRecord(raw);
  const entries = doc?.["entries"];
  if (!Array.isArray(entries)) return [];
  const out: IndexEntry[] = [];
  for (const e of entries) {
    const rec = asRecord(e);
    const id = rec ? str(rec["id"]) : null;
    const path = rec ? str(rec["path"]) : null;
    if (id && path) out.push({ id, path });
  }
  return out;
}

async function loadCollection<T>(
  fetchFn: FetchFn,
  base: string,
  collection: string,
  concurrency: number,
  normalise: (raw: unknown) => T | null,
  errors: string[],
): Promise<{ entries: T[]; indexed: number }> {
  const index = await getJson(fetchFn, `${base}/${collection}/_index.json`);
  const listed = indexEntries(index);
  if (listed.length === 0) {
    errors.push(`${collection}: _index.json missing or empty`);
    return { entries: [], indexed: 0 };
  }
  const docs = await pooled(listed, concurrency, (e) => getJson(fetchFn, `${base}/${e.path}`));
  const entries: T[] = [];
  for (let i = 0; i < docs.length; i++) {
    const normalised = normalise(docs[i]);
    if (normalised === null) errors.push(`${collection}: could not read ${listed[i]?.path ?? "?"}`);
    else entries.push(normalised);
  }
  return { entries, indexed: listed.length };
}

function manifestCount(manifest: unknown, collection: string): number | null {
  const collections = asRecord(asRecord(manifest)?.["collections"]);
  const entry = asRecord(collections?.[collection]);
  return entry ? optNum(entry["count"]) : null;
}

/**
 * Load the whole codex from the live content mount. Never rejects: a broken /
 * absent collection yields an empty list plus an entry in `loadErrors`, so the
 * page can always render (and say what it could not read).
 */
export async function loadCodex(opts: LoadCodexOptions = {}): Promise<CodexData> {
  const fetchFn = opts.fetchFn ?? defaultFetch;
  const base = opts.base ?? CONTENT_BASE;
  const concurrency = opts.concurrency ?? 12;
  const now = opts.now ?? Date.now;
  const errors: string[] = [];

  const manifest = await getJson(fetchFn, `${base}/manifest.json`);
  if (manifest === null) errors.push("manifest.json missing — contentVersion unknown");

  const [items, champions, abilities, whitelistDoc] = await Promise.all([
    loadCollection(fetchFn, base, "items", concurrency, normaliseItem, errors),
    loadCollection(fetchFn, base, "champions", concurrency, normaliseChampion, errors),
    loadCollection(fetchFn, base, "abilities", concurrency, normaliseAbility, errors),
    getJson(fetchFn, opts.whitelistUrl ?? WHITELIST_URL),
  ]);

  const count = (collection: string, r: { entries: unknown[]; indexed: number }): CodexCollectionCount => ({
    manifest: manifestCount(manifest, collection),
    indexed: r.indexed,
    loaded: r.entries.length,
  });

  const counts: Record<CodexKind, CodexCollectionCount> = {
    item: count("items", items),
    champion: count("champions", champions),
    ability: count("abilities", abilities),
  };

  return {
    contentVersion: str(asRecord(manifest)?.["contentVersion"]),
    counts,
    items: items.entries,
    champions: champions.entries,
    abilities: abilities.entries,
    whitelist: whitelistDoc === null ? UNKNOWN_WHITELIST : whitelistFrom(whitelistDoc),
    loadedAt: now(),
    loadErrors: errors,
  };
}
