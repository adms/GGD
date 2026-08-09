/**
 * The Zod field-walker: shared schema -> UISchema IR. Introspects zod's _def
 * by typeName string (robust across module instances). Handles the widget set:
 * text / number / boolean / enum / literal / array / tuple / object / record /
 * discriminated union (EffectDef cards keyed by "kind") / ref (from zRef's
 * description) — with TWO bounds so the recursive EffectDef union terminates
 * at a tree you can actually hold in memory (deeper levels fall back to a
 * raw-JSON node): a height cap (maxDepth) and, because the tree is exponential
 * in that height, a re-entry cap on each schema instance (MAX_REENTRY — read
 * the note on it before touching either number).
 */
import type { ZodTypeAny } from "zod";
import { refFromDescription } from "@ggd/shared/content";
import { humanize, type UINode } from "./uiSchema";

export interface WalkOptions {
  /** recursion cap; below it nodes degrade to kind:"unknown" (JSON editor) */
  maxDepth?: number;
  /**
   * how many times one schema INSTANCE may re-enter itself down a single
   * chain before degrading to kind:"unknown". See MAX_REENTRY.
   */
  maxReentry?: number;
}

const DEFAULT_MAX_DEPTH = 12;

/**
 * ⚠️ THE DEPTH CAP ALONE IS NOT A BOUND — it caps the HEIGHT of the tree, and
 * the tree it caps is EXPONENTIAL in that height. `zEffectDef` is a 34-member
 * discriminated union in which many members carry `EffectDef[]` children
 * (`onHit` / `onLand` / `onArrive` / `onHitTargets` / `effects` / `onEnd` /
 * `onDevour` / `finalEffects` / hook `effects` …), so every extra level of
 * `maxDepth` multiplies the node count by the number of those edges.
 *
 * Measured on the real shared schema (2026-08-10, `walkZod(zEffectDef)`):
 *
 *     maxDepth  3 →      5,306 nodes
 *     maxDepth  5 →     54,599
 *     maxDepth  7 →    557,195
 *     maxDepth  9 →  5,681,741       (~10× per two levels)
 *
 * — so the shipped `maxDepth: 12` is on the order of 10^8 nodes. It fit in
 * memory only because the schema had SIX `z.lazy` recursion sites; the
 * 2026-08-10 engine batch (delayed / proxyCast / dash.onEnd / devour.onDevour /
 * damageArea+damageLine.onHitTargets) took it to TWELVE, roughly squaring the
 * blow-up, and `walk.test.ts` died with "Ineffective mark-compacts near heap
 * limit — JavaScript heap out of memory". The browser would have died too:
 * this walker builds the editor's form.
 *
 * The fix bounds what actually recurses. A chain carries the multiset of
 * schema INSTANCES it passed through; re-entering an instance that is already
 * an ancestor counts as one level of recursion, and beyond MAX_REENTRY the
 * node degrades to `kind:"unknown"` — the same raw-JSON fallback the depth cap
 * already produces, so nothing becomes uneditable that was editable before,
 * it just switches widget. Non-recursive schemas are untouched: sharing a
 * `zScaling` between SIBLINGS is not an ancestor relationship.
 *
 * 2 = an effect, an effect nested in it, and one more. Past that the nesting
 * is deeper than any authored ability and the JSON editor is the honest
 * widget. `maxDepth` stays as the belt-and-braces height limit.
 */
const MAX_REENTRY = 2;

interface Unwrapped {
  schema: ZodTypeAny;
  optional: boolean;
  description?: string;
}

/** Peel Optional/Nullable/Default/Effects/Lazy/Branded wrappers. */
function unwrap(schema: ZodTypeAny): Unwrapped {
  let s = schema;
  let optional = false;
  let description: string | undefined;
  for (let i = 0; i < 20; i++) {
    description ??= (s as { description?: string }).description;
    const def = s._def as { typeName?: string } & Record<string, unknown>;
    switch (def.typeName) {
      case "ZodOptional":
      case "ZodNullable":
        optional = true;
        s = def.innerType as ZodTypeAny;
        continue;
      case "ZodDefault":
        optional = true;
        s = def.innerType as ZodTypeAny;
        continue;
      case "ZodEffects":
        s = def.schema as ZodTypeAny;
        continue;
      case "ZodLazy":
        s = (def.getter as () => ZodTypeAny)();
        continue;
      case "ZodBranded":
        s = def.type as ZodTypeAny;
        continue;
      case "ZodPipeline":
        s = def.out as ZodTypeAny;
        continue;
      default:
        return { schema: s, optional, description };
    }
  }
  return { schema: s, optional, description };
}

export function walkZod(
  root: ZodTypeAny,
  path = "",
  label = "Document",
  opts: WalkOptions = {},
): UINode {
  return walk(root, path, label, 0, opts.maxDepth ?? DEFAULT_MAX_DEPTH, new Map(), opts.maxReentry ?? MAX_REENTRY);
}

function walk(
  raw: ZodTypeAny,
  path: string,
  label: string,
  depth: number,
  maxDepth: number,
  /** how many times each schema instance already appears on THIS chain */
  ancestors: ReadonlyMap<ZodTypeAny, number>,
  maxReentry: number,
): UINode {
  const { schema, optional, description } = unwrap(raw);
  const base = { path, label, optional, ...(description && !description.startsWith("ref") ? { description } : {}) };

  if (depth > maxDepth) return { kind: "unknown", ...base };

  // The recursion bound (see MAX_REENTRY). Counted on the unwrapped instance,
  // because the `z.lazy(() => zEffectDef)` at every recursion site resolves to
  // the SAME object — which is exactly what makes it detectable here.
  const seen = ancestors.get(schema) ?? 0;
  if (seen > maxReentry) return { kind: "unknown", ...base };
  const chain: ReadonlyMap<ZodTypeAny, number> = new Map(ancestors).set(schema, seen + 1);
  const down = (child: ZodTypeAny, p: string, l: string): UINode =>
    walk(child, p, l, depth + 1, maxDepth, chain, maxReentry);

  const def = schema._def as { typeName?: string } & Record<string, unknown>;
  switch (def.typeName) {
    case "ZodString": {
      const ref = refFromDescription(description);
      return { kind: "text", ...base, ...(ref ? { ref } : {}) };
    }
    case "ZodNumber": {
      const checks = (def.checks ?? []) as { kind: string; value?: number; inclusive?: boolean }[];
      const int = checks.some((c) => c.kind === "int");
      const minCheck = checks.find((c) => c.kind === "min");
      const maxCheck = checks.find((c) => c.kind === "max");
      const min = minCheck?.value;
      const max = maxCheck?.value;
      // `inclusive` is the difference between `.min(0)` and `.positive()`.
      // Dropping it is what let `defaultForVariant` seed a `radius` of 0 into a
      // `.positive()` field — see UINumber.exclusiveMin.
      return {
        kind: "number",
        ...base,
        int,
        ...(min !== undefined ? { min } : {}),
        ...(max !== undefined ? { max } : {}),
        ...(min !== undefined && minCheck?.inclusive === false ? { exclusiveMin: true } : {}),
        ...(max !== undefined && maxCheck?.inclusive === false ? { exclusiveMax: true } : {}),
      };
    }
    case "ZodBoolean":
      return { kind: "boolean", ...base };
    case "ZodEnum":
      return { kind: "enum", ...base, options: [...(def.values as string[])] };
    case "ZodNativeEnum": {
      const values = Object.values(def.values as Record<string, string | number>).filter(
        (v) => typeof v === "string",
      );
      return { kind: "enum", ...base, options: values };
    }
    case "ZodLiteral":
      return { kind: "literal", ...base, value: def.value as string | number | boolean };
    case "ZodArray": {
      const item = down(def.type as ZodTypeAny, `${path}[]`, "Item");
      return { kind: "array", ...base, item };
    }
    case "ZodTuple": {
      const items = (def.items as ZodTypeAny[]).map((it, i) =>
        down(it, `${path}[${i}]`, `#${i}`),
      );
      return { kind: "tuple", ...base, items };
    }
    case "ZodObject": {
      const shape = (def.shape as () => Record<string, ZodTypeAny>)();
      const fields = Object.entries(shape).map(([key, child]) =>
        down(child, path ? `${path}.${key}` : key, humanize(key)),
      );
      return { kind: "object", ...base, fields };
    }
    case "ZodRecord": {
      const value = down(def.valueType as ZodTypeAny, `${path}.*`, "Value");
      return { kind: "record", ...base, value };
    }
    case "ZodDiscriminatedUnion": {
      const discriminator = def.discriminator as string;
      const options = def.options as ZodTypeAny[];
      const variants = options.map((opt) => {
        const { schema: optSchema } = unwrap(opt);
        const shape = (optSchema._def as { shape: () => Record<string, ZodTypeAny> }).shape();
        const tagSchema = unwrap(shape[discriminator]!).schema;
        const tag = String((tagSchema._def as { value: unknown }).value);
        const fields = Object.entries(shape)
          .filter(([key]) => key !== discriminator)
          .map(([key, child]) =>
            down(child, path ? `${path}.${key}` : key, humanize(key)),
          );
        return { tag, fields };
      });
      return { kind: "discriminatedUnion", ...base, discriminator, variants };
    }
    default:
      return { kind: "unknown", ...base };
  }
}

/** A sensible empty value for a node (new array items / union variant switch). */
export function defaultValueFor(node: UINode): unknown {
  switch (node.kind) {
    case "text":
      return "";
    case "number":
      return defaultNumber(node);
    case "boolean":
      return false;
    case "enum":
      return node.options[0];
    case "literal":
      return node.value;
    case "array":
      return [];
    case "tuple":
      return node.items.map(defaultValueFor);
    case "record":
      return {};
    case "object": {
      const out: Record<string, unknown> = {};
      for (const f of node.fields) {
        if (f.optional) continue;
        const key = lastKey(f.path);
        if (key) out[key] = defaultValueFor(f);
      }
      return out;
    }
    case "discriminatedUnion": {
      const v = node.variants[0];
      if (!v) return {};
      const out: Record<string, unknown> = { [node.discriminator]: v.tag };
      for (const f of v.fields) {
        if (f.optional) continue;
        const key = lastKey(f.path);
        if (key) out[key] = defaultValueFor(f);
      }
      return out;
    }
    case "unknown":
      return null;
  }
}

/** default value for a specific union variant (card switch) */
export function defaultForVariant(
  node: { discriminator: string; variants: { tag: string; fields: UINode[] }[] },
  tag: string,
): unknown {
  const v = node.variants.find((x) => x.tag === tag);
  if (!v) return { [node.discriminator]: tag };
  const out: Record<string, unknown> = { [node.discriminator]: tag };
  for (const f of v.fields) {
    if (f.optional) continue;
    const key = lastKey(f.path);
    if (key) out[key] = defaultValueFor(f);
  }
  return out;
}

function lastKey(path: string): string | null {
  const seg = path.split(".").pop() ?? "";
  if (!seg || seg.endsWith("[]") || seg === "*") return null;
  return seg;
}

/**
 * The value a fresh number widget starts on — and it must SATISFY the field's
 * own bounds, not merely sit near them.
 *
 * The rule this replaces was `min > 0 ? min : 0`, which is wrong for every
 * `.positive()` field in the shared schemas: zod records `.positive()` as
 * `min = 0, inclusive = false`, so `min > 0` is false and the seed was 0 —
 * the ONE value the field forbids. Switching an effect card to `damageArea`
 * therefore produced `{kind:"damageArea", damageType:"physical", amount:{},
 * radius:0}`, which `zEffectDef` rejects with "Number must be greater than 0".
 * The card looked fully filled in; only the SAVE failed, with a 422. The same
 * hole seeded `dash.speed`, `dash.maxDistance` and `leap.durationSec`.
 *
 * Preference order, so the change stays a fix and not a re-design:
 *   1. 0 whenever 0 is legal — what the old rule produced for `.min(0)`,
 *      `.min(-5)` and unbounded fields, and the least surprising blank slate;
 *   2. otherwise the closest legal value to 0 that the bounds allow, stepping
 *      one off an exclusive bound and clamping into the opposite one.
 */
function defaultNumber(node: {
  int: boolean;
  min?: number;
  max?: number;
  exclusiveMin?: boolean;
  exclusiveMax?: boolean;
}): number {
  const { min, max, exclusiveMin, exclusiveMax } = node;
  const satisfiesMin = (v: number) => min === undefined || (exclusiveMin ? v > min : v >= min);
  const satisfiesMax = (v: number) => max === undefined || (exclusiveMax ? v < max : v <= max);
  if (satisfiesMin(0) && satisfiesMax(0)) return 0;

  if (!satisfiesMin(0) && min !== undefined) {
    // 0 is below the floor: sit ON an inclusive floor, one step above an
    // exclusive one, then pull back inside the ceiling if that overshot.
    const lo = exclusiveMin ? min + 1 : min;
    if (satisfiesMax(lo)) return lo;
    if (max !== undefined) return exclusiveMax ? (min + max) / 2 : max;
    return lo;
  }
  // 0 is above the ceiling (a strictly-negative field): mirror the above.
  if (max !== undefined) return exclusiveMax ? max - 1 : max;
  return 0;
}
