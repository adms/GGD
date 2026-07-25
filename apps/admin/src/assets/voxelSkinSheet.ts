/**
 * voxelSkinSheet — the data half of 體素外觀對照表 (task #231).
 *
 * NOTHING IS SNAPSHOTTED. The rows are computed at view time from
 * `/content/champions/*.json` plus the SAME shared generator the game runs, so
 * the sheet cannot show the owner a look the build does not actually produce.
 * That is this project's reports-as-live-pages rule, and here it is load-bearing:
 * the whole point of the page is 驗收, and approving a stale render is worse
 * than having no page.
 *
 * Pure functions only — the React hook lives in useVoxelSkinSheet.ts.
 */
import {
  generateAllVoxelSkins,
  lookSignature,
  compactRecipe,
  motifBoxCount,
  voxelSkinInputOf,
  fromHex,
  luminance,
  STAND_IN_MODEL_KEYS,
  VOXEL_SKINS_SCHEMA,
  type ChampionLike,
  type VoxelSkinOverride,
  type VoxelSkinRecipe,
} from "@ggd/shared/content/voxelSkin";

export const CHAMPION_INDEX_URL = "/content/champions/_index.json";
export const VOXEL_OVERRIDES_URL = "/content/models/_voxel-skins.json";

/** One tile on the sheet. */
export interface SkinRow {
  championId: string;
  /** 稱號 (title) — "" when the doc's name has no " - " */
  title: string;
  /** 本名 (proper name) */
  proper: string;
  fullName: string;
  modelKey: string;
  attackType: string;
  tags: readonly string[];
  recipe: VoxelSkinRecipe;
  signature: string;
  /** true when this champion's modelKey is one of the four shared stand-ins */
  sharedStandIn: boolean;
  /** how many champions share this champion's modelKey (1 = its own) */
  modelKeyShareCount: number;
  /** true when a hand-authored L1 override applies */
  overridden: boolean;
  /** w3x vertex tint (#49), when the doc carries one */
  tint: readonly [number, number, number] | null;
  motifBoxes: number;
  /** measured relative luminance of outfitPrimary (the legibility number) */
  outfitLuminance: number;
}

/** Whole-sheet numbers, all computed from the same functions the tests assert on. */
export interface SkinSheetStats {
  champions: number;
  distinctLooks: number;
  collisions: number;
  saltEscalations: number;
  /** compact recipe JSON for the WHOLE roster, in bytes */
  recipeBytes: number;
  /** texture bytes SHIPPED — zero, by construction */
  shippedTextureBytes: 0;
  /** runtime atlas bytes per champion (painted, never shipped) */
  atlasBytesPerChampion: number;
  standInChampions: number;
  overriddenChampions: number;
}

interface IndexFile {
  entries?: { id: string; path: string }[];
}

/** Parse a collection index; anything malformed yields no entries. */
export function parseChampionIndex(raw: unknown): { id: string; path: string }[] {
  const entries = (raw as IndexFile | null)?.entries;
  if (!Array.isArray(entries)) return [];
  return entries.filter(
    (e): e is { id: string; path: string } =>
      !!e && typeof e.id === "string" && typeof e.path === "string",
  );
}

/** Parse the L1 override sidecar; a wrong/absent schema yields no overrides. */
export function parseOverrides(raw: unknown): Record<string, VoxelSkinOverride> {
  const file = raw as { schema?: string; overrides?: Record<string, VoxelSkinOverride> } | null;
  if (!file || file.schema !== VOXEL_SKINS_SCHEMA || !file.overrides) return {};
  const out: Record<string, VoxelSkinOverride> = {};
  for (const [id, ov] of Object.entries(file.overrides)) {
    if (ov && typeof ov === "object") out[id] = ov;
  }
  return out;
}

interface ChampionDocLike extends ChampionLike {
  tint?: [number, number, number];
}

/**
 * Build the whole sheet from the champion docs + the override sidecar.
 * Deterministic and order-independent: `generateAllVoxelSkins` sorts by id.
 */
export function buildSheet(
  docs: readonly ChampionDocLike[],
  overrides: Record<string, VoxelSkinOverride>,
): { rows: SkinRow[]; stats: SkinSheetStats } {
  const result = generateAllVoxelSkins(docs.map(voxelSkinInputOf), overrides);
  const shareCount = new Map<string, number>();
  for (const d of docs) {
    const key = d.modelKey ?? "";
    shareCount.set(key, (shareCount.get(key) ?? 0) + 1);
  }

  const rows: SkinRow[] = [];
  for (const doc of docs) {
    const recipe = result.recipes.get(doc.id);
    if (!recipe) continue;
    const name = doc.name ?? "";
    const i = name.indexOf(" - ");
    rows.push({
      championId: doc.id,
      title: i < 0 ? "" : name.slice(0, i),
      proper: i < 0 ? name : name.slice(i + 3),
      fullName: name,
      modelKey: doc.modelKey ?? "",
      attackType: doc.attackType ?? "",
      tags: doc.tags ?? [],
      recipe,
      signature: lookSignature(recipe),
      sharedStandIn: STAND_IN_MODEL_KEYS.includes(doc.modelKey ?? ""),
      modelKeyShareCount: shareCount.get(doc.modelKey ?? "") ?? 1,
      overridden: Object.prototype.hasOwnProperty.call(overrides, doc.id),
      tint: doc.tint ?? null,
      motifBoxes: motifBoxCount(recipe),
      outfitLuminance: luminance(fromHex(recipe.palette.outfitPrimary)),
    });
  }
  rows.sort((a, b) => (a.championId < b.championId ? -1 : a.championId > b.championId ? 1 : 0));

  const sigs = new Set(rows.map((r) => r.signature));
  const recipeBytes = JSON.stringify(
    Object.fromEntries(rows.map((r) => [r.championId, compactRecipe(r.recipe)])),
  ).length;

  return {
    rows,
    stats: {
      champions: rows.length,
      distinctLooks: sigs.size,
      collisions: rows.length - sigs.size,
      saltEscalations: result.escalated.length,
      recipeBytes,
      shippedTextureBytes: 0,
      atlasBytesPerChampion: 64 * 64 * 4,
      standInChampions: rows.filter((r) => r.sharedStandIn).length,
      overriddenChampions: rows.filter((r) => r.overridden).length,
    },
  };
}

/**
 * 相似度警示 — pairs whose four display colours are close enough that a player
 * would read them as the same champion.
 *
 * Distinct SIGNATURES is the hard guarantee; this is the softer, more honest
 * check on top of it, because two champions can differ in emblem and still look
 * alike across a lane. Distance is max-channel over the four colours, so one
 * genuinely different colour is enough to clear the warning.
 */
export function similarPairs(
  rows: readonly SkinRow[],
  threshold = 0.1,
): { a: SkinRow; b: SkinRow; distance: number }[] {
  const quad = (r: SkinRow): number[] =>
    [
      r.recipe.palette.outfitPrimary,
      r.recipe.palette.outfitSecondary,
      r.recipe.palette.skin,
      r.recipe.palette.hair,
    ].flatMap((h) => [...fromHex(h)]);
  const vecs = rows.map(quad);
  const out: { a: SkinRow; b: SkinRow; distance: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      let worst = 0;
      const vi = vecs[i] as number[];
      const vj = vecs[j] as number[];
      for (let k = 0; k < vi.length; k++) {
        worst = Math.max(worst, Math.abs((vi[k] as number) - (vj[k] as number)));
      }
      if (worst < threshold) out.push({ a: rows[i] as SkinRow, b: rows[j] as SkinRow, distance: worst });
    }
  }
  return out.sort((x, y) => x.distance - y.distance);
}

/** Filter axes the owner asked for. */
export interface SheetFilter {
  text: string;
  element: string;
  attackType: string;
  onlyStandIn: boolean;
  onlyTinted: boolean;
  onlyOverridden: boolean;
}

export const EMPTY_FILTER: SheetFilter = {
  text: "",
  element: "",
  attackType: "",
  onlyStandIn: false,
  onlyTinted: false,
  onlyOverridden: false,
};

export function applyFilter(rows: readonly SkinRow[], f: SheetFilter): SkinRow[] {
  const needle = f.text.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.element && r.recipe.element !== f.element) return false;
    if (f.attackType && r.attackType !== f.attackType) return false;
    if (f.onlyStandIn && !r.sharedStandIn) return false;
    if (f.onlyTinted && !r.tint) return false;
    if (f.onlyOverridden && !r.overridden) return false;
    if (!needle) return true;
    return (
      r.championId.toLowerCase().includes(needle) ||
      r.fullName.toLowerCase().includes(needle) ||
      r.modelKey.toLowerCase().includes(needle)
    );
  });
}

export type SheetSort = "id" | "title" | "element" | "hue" | "modelKey";

/** Hue of outfitPrimary, 0..360 — the sort that puts look-alikes side by side. */
export function outfitHue(r: SkinRow): number {
  const [red, g, b] = fromHex(r.recipe.palette.outfitPrimary);
  const max = Math.max(red, g, b);
  const min = Math.min(red, g, b);
  const d = max - min;
  if (d < 1e-6) return 0;
  const h =
    max === red ? ((g - b) / d) % 6 : max === g ? (b - red) / d + 2 : (red - g) / d + 4;
  return (h * 60 + 360) % 360;
}

export function sortRows(rows: readonly SkinRow[], by: SheetSort): SkinRow[] {
  const out = [...rows];
  const str = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  switch (by) {
    case "title":
      return out.sort((a, b) => str(a.title || a.proper, b.title || b.proper));
    case "element":
      return out.sort(
        (a, b) => str(a.recipe.element, b.recipe.element) || str(a.championId, b.championId),
      );
    case "hue":
      return out.sort((a, b) => outfitHue(a) - outfitHue(b));
    case "modelKey":
      return out.sort((a, b) => str(a.modelKey, b.modelKey) || str(a.championId, b.championId));
    default:
      return out.sort((a, b) => str(a.championId, b.championId));
  }
}

/**
 * Turn the 待改 marks into a paste-ready `overrides` block for
 * content/models/_voxel-skins.json — so a 驗收 call-out closes into the L1
 * layer as authored data instead of into a chat message.
 */
export function exportOverrideStub(
  rows: readonly SkinRow[],
  marked: ReadonlySet<string>,
  notes: Readonly<Record<string, string>>,
): string {
  const overrides: Record<string, unknown> = {};
  for (const r of rows) {
    if (!marked.has(r.championId)) continue;
    overrides[r.championId] = {
      note: notes[r.championId] || `待改 — ${r.fullName}`,
      palette: { ...r.recipe.palette },
      face: { ...r.recipe.face },
      hair: { ...r.recipe.hair },
      outfit: { ...r.recipe.outfit },
      motifs: { ...r.recipe.motifs },
    };
  }
  return JSON.stringify({ schema: VOXEL_SKINS_SCHEMA, overrides }, null, 2);
}
