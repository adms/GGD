/**
 * FIELD ADOPTION CENSUS — "does any content doc actually use this?"
 *
 * Detection recipe **S8** from docs/_false-completions.md, made computable:
 *
 *   「機制上線、內容 0 筆」 — schema, sim and UI are all ready, and not one
 *   document fills the field. Nothing errors. Nothing crashes. The mechanism
 *   simply never happens in a match, and every test stays green because every
 *   test is about the code, not about whether any content reaches it.
 *
 * A field that exists in code but appears in ZERO content docs is a mechanism
 * nobody can experience. So is a Stat nothing modifies, an enum member nothing
 * selects, an effect `kind` nothing casts, and a weapon class no champion is
 * tagged with. This module counts all four, from the two sources of truth:
 *
 *   supply  ← the Zod schemas in ./schema  (what the code OFFERS content)
 *   demand  ← the real content/ tree       (what content ACTUALLY sets)
 *
 * Both sides are derived at call time. Nothing here hard-codes the list of
 * things that are currently wrong — that list is the OUTPUT. The guard that
 * consumes this census is `fieldAdoption.test.ts`; the census itself is pure
 * and side-effect-free so an in-app page can render it live (per the project's
 * "reports are live pages" rule) without duplicating the derivation.
 *
 * WHY IT IS NOT A grep. The recipe as written in the audit doc was
 * `grep -rl '"hitFeel"' content/ | wc -l`. A grep has to be told what to look
 * for, which means the next field — the one nobody has thought of yet — is
 * exactly the one it misses. Walking the schema inverts that: a field is
 * censused **because it exists**, on the commit that adds it.
 *
 * ---------------------------------------------------------------------------
 * WHAT COUNTS AS "REGISTERED" (the supply side)
 * ---------------------------------------------------------------------------
 *
 * 1. `field:` every OPTIONAL property in every collection schema. Required
 *    properties are excluded on purpose: a required property is present in
 *    100 % of docs by construction (the loader rejects the doc otherwise), so
 *    it can never be an S8. Optionality is precisely the affordance that lets
 *    content decline to use a mechanism.
 *
 * 2. `enum:` every member of every enum reached from a schema, aggregated
 *    across all the positions that enum appears in. `Stat` arrives this way
 *    (it is a `z.nativeEnum` behind `zStat`), so "a Stat no doc references"
 *    needs no special case — `evasion` shows up as `enum:stat=evasion`.
 *
 * 3. `variant:` every branch of every discriminated union, keyed by its
 *    discriminator value. This is how effect `kind`s are censused: an effect
 *    the sim implements and no ability casts is the same pathology.
 *
 * 4. `tag:` a CODE-DEFINED vocabulary matched against a free-text content
 *    field. The schemas type `tags` as `string[]`, so the schema walk can say
 *    nothing about it — yet `sim/systems/BasicAttackSystem.ts` reads exactly
 *    five of those strings to pick a weapon, and the client binds a distinct
 *    attack clip to each. Those five are registered explicitly below, from the
 *    sim's own exported constant, so the census speaks about them too.
 *
 * ---------------------------------------------------------------------------
 * THE CASCADE RULE (why the report is short instead of 400 rows long)
 * ---------------------------------------------------------------------------
 *
 * A key is only REPORTED if its container was reached in at least one doc.
 * `hitFeel.shakeStyle` is not an independent finding while `hitFeel` itself is
 * unset — it is the same finding, counted eleven times. So the census carries
 * `reach` (how many docs got as far as the container) and the guard ignores
 * anything with `reach === 0`. The outermost unadopted thing is the one that
 * gets named, and adopting it makes its children visible on the next run.
 */
import type { ZodTypeAny } from "zod";
import { COLLECTIONS, type CollectionName } from "./schema/index";
import { WEAPON_TAGS } from "../sim/systems/BasicAttackSystem";
import type { ContentStore } from "./store";

// ---------------------------------------------------------------------------
// CODE-DEFINED VOCABULARIES over free-text content fields
// ---------------------------------------------------------------------------

/**
 * A set of strings the CODE gives meaning to, which content supplies through a
 * field the schema only types as `string[]`. The schema walk cannot see these,
 * so each one is declared here — with the module that owns the vocabulary as
 * its source, never a copy of the list.
 *
 * Adding a vocabulary is the deliberate act of saying "these strings are an
 * interface, not free text". If you find yourself writing
 * `if (tags.includes("...")）` in a system, it belongs here.
 */
export interface TagVocabulary {
  /** census name, e.g. "weaponClass" */
  readonly name: string;
  /** where the vocabulary is defined — quoted in the failure message */
  readonly source: string;
  /** the collection whose docs carry the tags */
  readonly collection: CollectionName;
  /** the doc property holding the free-text array */
  readonly field: string;
  /** the recognised members, imported from the owning module */
  readonly members: readonly string[];
}

export const TAG_VOCABULARIES: readonly TagVocabulary[] = [
  {
    name: "weaponClass",
    source: "sim/systems/BasicAttackSystem.ts WEAPON_TAGS → client audio/combatSfx.ts WEAPON_SFX",
    collection: "champions",
    field: "tags",
    members: WEAPON_TAGS,
  },
];

// ---------------------------------------------------------------------------
// Census shape
// ---------------------------------------------------------------------------

export type AdoptionKind = "field" | "enum" | "variant" | "tag";

export interface AdoptionRow {
  /** stable census key, e.g. "field:abilities.hitFeel" or "enum:stat=evasion" */
  readonly key: string;
  readonly kind: AdoptionKind;
  /** number of content docs that actually exercise this */
  readonly docs: number;
  /**
   * number of docs that reached the CONTAINER this lives in. `docs === 0 &&
   * reach === 0` means "structurally unreachable because its parent is itself
   * unadopted" — not an independent finding (see THE CASCADE RULE).
   */
  readonly reach: number;
  /** up to 3 "<collection>/<id>" witnesses, for a message you can act on */
  readonly examples: readonly string[];
}

export interface Census {
  readonly rows: readonly AdoptionRow[];
  readonly totalDocs: number;
  /** ms spent walking, so the guard can state its own cost honestly */
  readonly elapsedMs: number;
}

// ---------------------------------------------------------------------------
// Zod introspection
// ---------------------------------------------------------------------------

interface ZDef {
  typeName?: string;
  innerType?: ZodTypeAny;
  schema?: ZodTypeAny;
  getter?: () => ZodTypeAny;
  type?: ZodTypeAny;
  out?: ZodTypeAny;
  shape?: () => Record<string, ZodTypeAny>;
  options?: ZodTypeAny[];
  discriminator?: string;
  keyType?: ZodTypeAny;
  valueType?: ZodTypeAny;
  values?: readonly string[];
  value?: unknown;
}

const defOf = (s: ZodTypeAny): ZDef => s._def as unknown as ZDef;

/** Peel Optional/Nullable/Default/Effects/Lazy/Branded/Pipeline wrappers. */
function unwrap(schema: ZodTypeAny): { schema: ZodTypeAny; optional: boolean } {
  let s = schema;
  let optional = false;
  for (let i = 0; i < 25; i++) {
    const def = defOf(s);
    switch (def.typeName) {
      case "ZodOptional":
      case "ZodNullable":
      case "ZodDefault":
        optional = true;
        s = def.innerType!;
        continue;
      case "ZodEffects":
        s = def.schema!;
        continue;
      case "ZodLazy":
        s = def.getter!();
        continue;
      case "ZodBranded":
        s = def.type!;
        continue;
      case "ZodPipeline":
        s = def.out!;
        continue;
      default:
        return { schema: s, optional };
    }
  }
  return { schema: s, optional };
}

/** Enum members, for ZodEnum and ZodNativeEnum alike. */
function enumMembers(schema: ZodTypeAny): string[] | null {
  const def = defOf(schema);
  if (def.typeName === "ZodEnum") return [...(def.values ?? [])];
  if (def.typeName === "ZodNativeEnum") {
    const obj = (def as unknown as { values: Record<string, unknown> }).values;
    return Object.values(obj).filter((v): v is string => typeof v === "string");
  }
  return null;
}

/**
 * Name every nameable schema node (object / enum / union) by the SHORTEST path
 * that reaches it, so a schema reused in five places gets one census name
 * instead of five. Ties break lexicographically, which keeps the census key of
 * a given field byte-stable across runs and across unrelated schema edits.
 *
 * Sibling collapse: when one schema INSTANCE sits under several sibling keys of
 * the same object — `champion.abilities.{Q,W,E,R}` are all literally the same
 * `zAbilityDef` — the shared segment becomes `*`, so the four slots report as
 * one row (`champions.abilities.*.…`) rather than four identical findings.
 *
 * Recursion terminates because a node is only descended into when this visit
 * gives it a strictly shorter name than it already had; `zEffectDef`'s knot
 * (spawnProjectile.onHit → EffectDef) therefore unwinds on the second visit.
 */
function nameSchemas(): Map<ZodTypeAny, string> {
  const names = new Map<ZodTypeAny, string>();
  const depthOf = (p: string): number => (p === "" ? 0 : p.split(".").length);

  const nameable = (s: ZodTypeAny): boolean => {
    const t = defOf(s).typeName;
    return (
      t === "ZodObject" ||
      t === "ZodEnum" ||
      t === "ZodNativeEnum" ||
      t === "ZodDiscriminatedUnion"
    );
  };

  const visit = (raw: ZodTypeAny, path: string, depth: number): void => {
    if (depth > 14) return;
    const { schema } = unwrap(raw);

    if (nameable(schema)) {
      const prev = names.get(schema);
      if (prev !== undefined && (depthOf(prev) < depthOf(path) || prev <= path)) return;
      names.set(schema, path);
    }

    const def = defOf(schema);
    switch (def.typeName) {
      case "ZodObject": {
        const shape = def.shape!();
        // sibling collapse: which child instances appear under >1 key
        const seen = new Map<ZodTypeAny, number>();
        for (const k of Object.keys(shape)) {
          const inner = unwrap(shape[k]!).schema;
          seen.set(inner, (seen.get(inner) ?? 0) + 1);
        }
        for (const k of Object.keys(shape)) {
          const child = shape[k]!;
          const shared = (seen.get(unwrap(child).schema) ?? 0) > 1;
          const seg = shared ? "*" : k;
          visit(child, path === "" ? seg : `${path}.${seg}`, depth + 1);
        }
        break;
      }
      case "ZodArray":
        visit(def.type!, `${path}[]`, depth + 1);
        break;
      case "ZodRecord":
        visit(def.valueType!, `${path}{}`, depth + 1);
        break;
      case "ZodDiscriminatedUnion":
      case "ZodUnion": {
        const disc = def.discriminator;
        for (const [i, opt] of (def.options ?? []).entries()) {
          let label = `|${i}`;
          if (disc !== undefined) {
            const lit = defOf(unwrap(opt).schema).shape?.()[disc];
            const v = lit ? defOf(unwrap(lit).schema).value : undefined;
            if (typeof v === "string") label = `#${v}`;
          }
          visit(opt, `${path}${label}`, depth + 1);
        }
        break;
      }
      default:
        break;
    }
  };

  // Collections first and in declaration order, so a collection ROOT always
  // wins its own name over any nested path that happens to be equally short.
  for (const [name, spec] of Object.entries(COLLECTIONS)) {
    visit(spec.schema as ZodTypeAny, name, 0);
  }
  return names;
}

// ---------------------------------------------------------------------------
// The census
// ---------------------------------------------------------------------------

interface Tally {
  kind: AdoptionKind;
  docs: Set<string>;
  reach: Set<string>;
}

/**
 * Compute the census over a loaded store. Pure: same store in, same rows out,
 * in a stable key order.
 */
export function censusAdoption(store: ContentStore): Census {
  const t0 = Date.now();
  const names = nameSchemas();
  const tallies = new Map<string, Tally>();

  const tally = (key: string, kind: AdoptionKind): Tally => {
    let t = tallies.get(key);
    if (t === undefined) {
      t = { kind, docs: new Set(), reach: new Set() };
      tallies.set(key, t);
    }
    return t;
  };

  // ---- PRE-PASS: register every key at zero, so a field nothing uses is a
  // row reading 0 rather than a row that silently does not exist. This is the
  // whole difference between a census and a grep.
  const registered = new Set<ZodTypeAny>();
  const register = (raw: ZodTypeAny, depth: number): void => {
    if (depth > 14) return;
    const { schema } = unwrap(raw);
    if (registered.has(schema)) return;
    registered.add(schema);
    const own = names.get(schema);
    const def = defOf(schema);

    const members = enumMembers(schema);
    if (members !== null && own !== undefined) {
      for (const m of members) tally(`enum:${own}=${m}`, "enum");
      return;
    }

    switch (def.typeName) {
      case "ZodObject": {
        const shape = def.shape!();
        for (const k of Object.keys(shape)) {
          if (unwrap(shape[k]!).optional && own !== undefined) {
            tally(`field:${own}.${k}`, "field");
          }
          register(shape[k]!, depth + 1);
        }
        break;
      }
      case "ZodArray":
        register(def.type!, depth + 1);
        break;
      case "ZodRecord":
        register(def.keyType!, depth + 1);
        register(def.valueType!, depth + 1);
        break;
      case "ZodDiscriminatedUnion": {
        const disc = def.discriminator;
        for (const opt of def.options ?? []) {
          const inner = unwrap(opt).schema;
          const lit = disc === undefined ? undefined : defOf(inner).shape?.()[disc];
          const v = lit ? defOf(unwrap(lit).schema).value : undefined;
          if (typeof v === "string" && own !== undefined) {
            tally(`variant:${own}#${v}`, "variant");
          }
          register(opt, depth + 1);
        }
        break;
      }
      case "ZodUnion":
        for (const opt of def.options ?? []) register(opt, depth + 1);
        break;
      default:
        break;
    }
  };
  for (const spec of Object.values(COLLECTIONS)) register(spec.schema as ZodTypeAny, 0);

  for (const v of TAG_VOCABULARIES) {
    for (const m of v.members) tally(`tag:${v.name}=${m}`, "tag");
  }

  // ---- COUNTING PASS: walk (schema, value) in lockstep over every real doc.
  const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

  const count = (raw: ZodTypeAny, value: unknown, doc: string, depth: number): void => {
    if (value === undefined || value === null || depth > 14) return;
    const { schema } = unwrap(raw);
    const own = names.get(schema);
    const def = defOf(schema);

    const members = enumMembers(schema);
    if (members !== null) {
      if (own !== undefined && typeof value === "string") {
        for (const m of members) tally(`enum:${own}=${m}`, "enum").reach.add(doc);
        if (members.includes(value)) tally(`enum:${own}=${value}`, "enum").docs.add(doc);
      }
      return;
    }

    switch (def.typeName) {
      case "ZodObject": {
        if (!isPlainObject(value)) return;
        const shape = def.shape!();
        for (const k of Object.keys(shape)) {
          if (unwrap(shape[k]!).optional && own !== undefined) {
            const t = tally(`field:${own}.${k}`, "field");
            t.reach.add(doc);
            if (value[k] !== undefined) t.docs.add(doc);
          }
          count(shape[k]!, value[k], doc, depth + 1);
        }
        break;
      }
      case "ZodArray":
        if (Array.isArray(value)) for (const el of value) count(def.type!, el, doc, depth + 1);
        break;
      case "ZodRecord": {
        if (!isPlainObject(value)) return;
        // A record keyed by an enum (baseStats/growth are `record(zStat, …)`)
        // makes its KEYS the vocabulary — that is where Stat adoption lives.
        const keyMembers = enumMembers(unwrap(def.keyType!).schema);
        const keyName = names.get(unwrap(def.keyType!).schema);
        for (const k of Object.keys(value)) {
          if (keyMembers !== null && keyName !== undefined) {
            for (const m of keyMembers) tally(`enum:${keyName}=${m}`, "enum").reach.add(doc);
            if (keyMembers.includes(k)) tally(`enum:${keyName}=${k}`, "enum").docs.add(doc);
          }
          count(def.valueType!, value[k], doc, depth + 1);
        }
        break;
      }
      case "ZodDiscriminatedUnion": {
        if (!isPlainObject(value)) return;
        const disc = def.discriminator;
        for (const opt of def.options ?? []) {
          const inner = unwrap(opt).schema;
          const lit = disc === undefined ? undefined : defOf(inner).shape?.()[disc];
          const v = lit ? defOf(unwrap(lit).schema).value : undefined;
          if (typeof v !== "string" || own === undefined) continue;
          const t = tally(`variant:${own}#${v}`, "variant");
          t.reach.add(doc);
          if (disc !== undefined && value[disc] === v) {
            t.docs.add(doc);
            count(opt, value, doc, depth + 1);
          }
        }
        break;
      }
      case "ZodUnion":
        // Untagged unions have no discriminator to match on; descend into every
        // branch and let the value shape decide what matches.
        for (const opt of def.options ?? []) count(opt, value, doc, depth + 1);
        break;
      default:
        break;
    }
  };

  let totalDocs = 0;
  for (const [name, spec] of Object.entries(COLLECTIONS)) {
    const col = name as CollectionName;
    for (const id of store.ids(col)) {
      totalDocs++;
      count(spec.schema as ZodTypeAny, store.get(col, id), `${col}/${id}`, 0);
    }
  }

  // ---- TAG VOCABULARIES: free-text arrays the schema cannot speak about.
  for (const v of TAG_VOCABULARIES) {
    for (const id of store.ids(v.collection)) {
      const doc = store.get<Record<string, unknown>>(v.collection, id);
      const raw = doc[v.field];
      const present = new Set(
        (Array.isArray(raw) ? raw : []).filter((t): t is string => typeof t === "string"),
      );
      for (const m of v.members) {
        const t = tally(`tag:${v.name}=${m}`, "tag");
        t.reach.add(`${v.collection}/${id}`);
        if (present.has(m)) t.docs.add(`${v.collection}/${id}`);
      }
    }
  }

  const rows: AdoptionRow[] = [...tallies.entries()]
    .map(([key, t]) => ({
      key,
      kind: t.kind,
      docs: t.docs.size,
      reach: t.reach.size,
      examples: [...t.docs].sort().slice(0, 3),
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  return { rows, totalDocs, elapsedMs: Date.now() - t0 };
}

/**
 * MINIMUM SAMPLE. A key is only claimed to be "adopted by nobody" when at
 * least this many docs could have adopted it.
 *
 * `reach === 1` says the container exists in exactly ONE document — every
 * `config@1` singleton, and any collection with a handful of docs. "0 of 1 docs
 * set `gore.style` to `off`" is not a false completion, it is the operator's
 * current setting; "0 of 1 projectiles chose meshShape `orb`" is not a dead
 * renderer path, it is a sample size of one. Claiming otherwise would fill the
 * exemption list with noise, and an exemption list nobody believes is how the
 * guard dies.
 *
 * 3 is the smallest floor that clears the singleton configs while still
 * speaking about the small collections (5 arenas, 5 skins, 5 status-effects).
 * See "WHAT THIS DOES NOT CATCH" in fieldAdoption.test.ts.
 */
export const MIN_REACH = 3;

/**
 * The rows the guard is entitled to complain about: registered, structurally
 * reachable (see THE CASCADE RULE), sampled by at least `MIN_REACH` docs, and
 * used by nothing.
 */
export function unadopted(census: Census, minReach = MIN_REACH): readonly AdoptionRow[] {
  return census.rows.filter((r) => r.docs === 0 && r.reach >= minReach);
}

/** Render the census as a fixed-width table — this is the owner-facing report. */
export function formatCensus(census: Census, opts?: { limit?: number }): string {
  const limit = opts?.limit ?? Infinity;
  const byKind = new Map<AdoptionKind, AdoptionRow[]>();
  for (const r of census.rows) {
    if (r.reach === 0 && r.docs === 0) continue; // unreachable: cascade-suppressed
    const list = byKind.get(r.kind) ?? [];
    list.push(r);
    byKind.set(r.kind, list);
  }
  const out: string[] = [];
  out.push(
    `FIELD ADOPTION CENSUS — ${census.totalDocs} docs, ${census.rows.length} registered keys, ${census.elapsedMs} ms`,
  );
  for (const kind of ["field", "enum", "variant", "tag"] as const) {
    const list = (byKind.get(kind) ?? []).slice().sort((a, b) => a.docs - b.docs || (a.key < b.key ? -1 : 1));
    if (list.length === 0) continue;
    const zero = list.filter((r) => r.docs === 0).length;
    out.push(`\n  ── ${kind} (${list.length} reachable, ${zero} at ZERO) ──`);
    for (const r of list.slice(0, limit)) {
      const pct = r.reach === 0 ? "—" : `${((r.docs / r.reach) * 100).toFixed(1)}%`;
      const mark = r.docs === 0 ? "  ZERO" : "      ";
      out.push(`  ${mark} ${r.docs.toString().padStart(5)}/${r.reach.toString().padEnd(5)} ${pct.padStart(6)}  ${r.key}`);
    }
  }
  return out.join("\n");
}
