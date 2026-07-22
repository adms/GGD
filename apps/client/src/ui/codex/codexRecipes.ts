/**
 * codexRecipes — item ↔ item relations, reconstructed LIVE from the fetched
 * item docs (task #71 cross-links).
 *
 * WHERE THE RECIPE COMES FROM. Task #70 is rebuilding content/items/** with a
 * real recipe tree read out of the JASS; when it lands the docs themselves will
 * carry the components and `buildRecipeGraph` uses them verbatim
 * (`source: "doc"`). Until then we DEGRADE GRACEFULLY to the only machine-
 * readable recipe the current docs have: the w3x tooltip text, which writes
 *
 *     合成配方：
 *     吸血石
 *     奧理哈魯根劍身
 *     妖刀村正製作書
 *
 * i.e. component NAMES, one per line, terminated by a blank line. 70 of the 212
 * items carry such a block (180 component references, of which ~161 resolve to
 * a real item by exact name today). Unresolved names are NOT swallowed — they
 * are returned so the detail view can show 「未解析：寶石碎片」, which is a real
 * content defect (godie-i065's name never resolved out of the w3x string table,
 * so nothing in the codex can match the component that refers to it).
 *
 * Pure functions over already-fetched docs: no fetch, no React, node-testable.
 */
import type { CodexItem } from "@ggd/shared/codex/codexTypes";

/** Marker the w3x tooltip uses to open the component list. */
const RECIPE_MARKER = "合成配方";

/** A resolved (or unresolved) component reference of one item. */
export interface RecipeComponent {
  /** the name as written in the recipe block */
  readonly name: string;
  /** the item it resolves to, or null when no item carries that name */
  readonly id: string | null;
}

export interface ItemRecipe {
  /** "doc" = authored components (task #70); "description" = parsed tooltip. */
  readonly source: "doc" | "description";
  readonly components: readonly RecipeComponent[];
}

export interface RecipeGraph {
  /** itemId → its components (only items that declare a recipe appear) */
  readonly recipeOf: ReadonlyMap<string, ItemRecipe>;
  /** itemId → the items that list it as a component */
  readonly buildsInto: ReadonlyMap<string, readonly string[]>;
  /** component names no item answers to (a content defect worth showing) */
  readonly unresolvedNames: readonly string[];
}

/**
 * Pull the component names out of a w3x item description.
 * Returns [] when there is no 合成配方 block. Lines are trimmed; the block ends
 * at the first blank line (the tooltip's next section) or end of text.
 */
export function parseRecipeComponents(description: string | null | undefined): string[] {
  if (typeof description !== "string" || !description.includes(RECIPE_MARKER)) return [];
  const lines = description.split("\n");
  const start = lines.findIndex((l) => l.includes(RECIPE_MARKER));
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (line === "") break;
    out.push(line);
  }
  return out;
}

/** Component names authored on the doc by task #70, if any. */
function authoredComponents(doc: Readonly<Record<string, unknown>>): string[] | null {
  for (const key of ["components", "recipe", "buildsFrom"]) {
    const v = doc[key];
    if (Array.isArray(v)) {
      const names = v.filter((x): x is string => typeof x === "string" && x !== "");
      if (names.length > 0) return names;
    }
    // `{ components: [...] }` shape
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      const inner = (v as Record<string, unknown>)["components"];
      if (Array.isArray(inner)) {
        const names = inner.filter((x): x is string => typeof x === "string" && x !== "");
        if (names.length > 0) return names;
      }
    }
  }
  return null;
}

/**
 * Build the item relation graph from the loaded items. Components are matched
 * by EXACT name (or by id, so an authored id-based recipe from #70 works too).
 */
export function buildRecipeGraph(items: readonly CodexItem[]): RecipeGraph {
  const byName = new Map<string, string>();
  const byId = new Set<string>();
  for (const it of items) {
    byId.add(it.id);
    if (!byName.has(it.name)) byName.set(it.name, it.id);
  }

  const recipeOf = new Map<string, ItemRecipe>();
  const buildsInto = new Map<string, string[]>();
  const unresolved = new Set<string>();

  for (const it of items) {
    const authored = authoredComponents(it.doc);
    const names = authored ?? parseRecipeComponents(it.description);
    if (names.length === 0) continue;
    const components: RecipeComponent[] = names.map((name) => {
      const id = byId.has(name) ? name : (byName.get(name) ?? null);
      if (id === null) unresolved.add(name);
      return { name, id };
    });
    recipeOf.set(it.id, { source: authored ? "doc" : "description", components });
    for (const c of components) {
      if (c.id === null || c.id === it.id) continue;
      const list = buildsInto.get(c.id) ?? [];
      if (!list.includes(it.id)) list.push(it.id);
      buildsInto.set(c.id, list);
    }
  }

  return { recipeOf, buildsInto, unresolvedNames: [...unresolved].sort() };
}
