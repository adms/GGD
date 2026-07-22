/**
 * The Zod field-walker: shared schema -> UISchema IR. Introspects zod's _def
 * by typeName string (robust across module instances). Handles the widget set:
 * text / number / boolean / enum / literal / array / tuple / object / record /
 * discriminated union (EffectDef cards keyed by "kind") / ref (from zRef's
 * description) — with a depth cap so the recursive EffectDef union terminates
 * (deeper levels fall back to a raw-JSON node).
 */
import type { ZodTypeAny } from "zod";
import { refFromDescription } from "@ggd/shared/content";
import { humanize, type UINode } from "./uiSchema";

export interface WalkOptions {
  /** recursion cap; below it nodes degrade to kind:"unknown" (JSON editor) */
  maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 12;

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
  return walk(root, path, label, 0, opts.maxDepth ?? DEFAULT_MAX_DEPTH);
}

function walk(raw: ZodTypeAny, path: string, label: string, depth: number, maxDepth: number): UINode {
  const { schema, optional, description } = unwrap(raw);
  const base = { path, label, optional, ...(description && !description.startsWith("ref") ? { description } : {}) };

  if (depth > maxDepth) return { kind: "unknown", ...base };

  const def = schema._def as { typeName?: string } & Record<string, unknown>;
  switch (def.typeName) {
    case "ZodString": {
      const ref = refFromDescription(description);
      return { kind: "text", ...base, ...(ref ? { ref } : {}) };
    }
    case "ZodNumber": {
      const checks = (def.checks ?? []) as { kind: string; value?: number; inclusive?: boolean }[];
      const int = checks.some((c) => c.kind === "int");
      const min = checks.find((c) => c.kind === "min")?.value;
      const max = checks.find((c) => c.kind === "max")?.value;
      return {
        kind: "number",
        ...base,
        int,
        ...(min !== undefined ? { min } : {}),
        ...(max !== undefined ? { max } : {}),
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
      const item = walk(def.type as ZodTypeAny, `${path}[]`, "Item", depth + 1, maxDepth);
      return { kind: "array", ...base, item };
    }
    case "ZodTuple": {
      const items = (def.items as ZodTypeAny[]).map((it, i) =>
        walk(it, `${path}[${i}]`, `#${i}`, depth + 1, maxDepth),
      );
      return { kind: "tuple", ...base, items };
    }
    case "ZodObject": {
      const shape = (def.shape as () => Record<string, ZodTypeAny>)();
      const fields = Object.entries(shape).map(([key, child]) =>
        walk(child, path ? `${path}.${key}` : key, humanize(key), depth + 1, maxDepth),
      );
      return { kind: "object", ...base, fields };
    }
    case "ZodRecord": {
      const value = walk(def.valueType as ZodTypeAny, `${path}.*`, "Value", depth + 1, maxDepth);
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
            walk(child, path ? `${path}.${key}` : key, humanize(key), depth + 1, maxDepth),
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
      return node.min !== undefined && node.min > 0 ? node.min : 0;
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
