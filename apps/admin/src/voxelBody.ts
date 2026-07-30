/**
 * 體素身體開關 (GH#31) — the pure logic behind 後台 → 體素身體.
 *
 * owner, 2026-07-28:「請你都先用暴雪的 3d model，要替換成體素是我從後台設定套用
 * 才生效」.
 *
 * WHAT THIS PAGE DECIDES, AND WHAT IT DELIBERATELY DOES NOT.
 * It decides ONE bit per champion: does this hero wear the procedural voxel
 * figure, or its own 3D model? It does not touch the voxel LOOK — palette,
 * face, hair and motifs stay where they are (`models/_voxel-skins.json`, the
 * 體素外觀對照表 page), because a body switch that silently reset somebody's
 * hand-authored colours would be a destructive edit disguised as a toggle.
 *
 * THE THREE STATES ARE THE POINT. A champion is one of:
 *   • `null`   —— 沒設定過:the default rule decides (有自己的模型就用模型)
 *   • `true`   —— operator forced 體素
 *   • `false`  —— operator forced 自己的模型
 *
 * ⚠️ `null` is NOT `false`. Collapsing them is the bug this file is shaped to
 * prevent: an empty doc would then read as 「全部強制關掉體素」, which would
 * override the four champions that genuinely have no model of their own and
 * push them back onto a shared stand-in face — undoing #231 entirely, with
 * every test still green.
 */
import {
  BLIZZARD_MODEL_CHAMPIONS,
  STAND_IN_MODEL_KEYS,
  defaultPrefersVoxelBody,
} from "@ggd/shared/content/voxelSkin";
import { counterpartFormId } from "@ggd/shared/content/championForms";

/**
 * 這位英雄拿不拿得到真的 WC3 模型 —— 自己在 manifest 裡,**或者**它的變身對半
 * 在(#223 的「缺省即繼承」)。渲染端 `defaultPrefersVoxelBody` 就是這樣判的,
 * 所以後台的紅字必須用同一句話,否則畫面與後台會各說各話。
 */
function reachesBlizzardModel(championId: string): boolean {
  return (
    BLIZZARD_MODEL_CHAMPIONS.includes(championId) ||
    BLIZZARD_MODEL_CHAMPIONS.includes(counterpartFormId(championId) ?? "")
  );
}

/** The `config` collection doc the console writes through the durable overlay. */
export const BODY_COLLECTION = "config";
export const BODY_DOC_ID = "voxel-bodies";
export const BODY_SCHEMA = "config.voxel-bodies@1";

export interface VoxelBodiesDoc {
  id: string;
  schema: string;
  note?: string;
  bodies: Record<string, boolean>;
}

/** Where a champion's effective answer came from — shown as a badge per row. */
export type BodyOrigin = "overlay" | "default";

export interface BodyRow {
  championId: string;
  name: string;
  /** the shared stand-in mesh this champion points at, if any */
  modelKey: string;
  /**
   * true when a real Warcraft III model is REACHABLE for this champion.
   *
   * ⚠️ 2026-07-30 (#223) —— 這個欄位本來寫的是
   * `BLIZZARD_MODEL_CHAMPIONS.includes(c.id)`,也就是「**自己**在 manifest 裡」。
   * 那不等於「有模型可穿」:抽取器只拉了 40 個**可選**單位,26 對變身的 `Emeu`
   * 那一半天生不在名單上,而 `defaultPrefersVoxelBody` 的「缺省即繼承」讓它們
   * 穿得到對半的模型。照舊寫法,後台會對 6 位穿得到模型的英雄
   * (godie-e010 / h00w / n01b / o02n / o030 / u011)掛上「無可用模型」的紅字,
   * 而遊戲裡他們正穿著 Nman.glb / U012.glb —— 一個 operator 看得見的假訊息。
   */
  hasBlizzardModel: boolean;
  /** what the rule says with nobody interfering */
  defaultVoxel: boolean;
  /** what the operator set, or null when they never touched this champion */
  operator: boolean | null;
  /** what actually ships today */
  effective: boolean;
  origin: BodyOrigin;
}

export interface ChampionLite {
  id: string;
  name?: string;
  modelKey?: string;
}

/** An empty doc — the shipped state, and what a missing overlay resolves to. */
export function emptyBodiesDoc(): VoxelBodiesDoc {
  return {
    id: BODY_DOC_ID,
    schema: BODY_SCHEMA,
    note: "GH#31 —— 後台設定的體素身體開關。只記錄「被動過的」英雄。",
    bodies: {},
  };
}

/** Read the map out of a doc of unknown provenance, tolerating junk. */
export function extractBodies(doc: unknown): Record<string, boolean> {
  const d = doc as VoxelBodiesDoc | null | undefined;
  if (!d || d.schema !== BODY_SCHEMA || !d.bodies || typeof d.bodies !== "object") return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(d.bodies)) if (typeof v === "boolean") out[k] = v;
  return out;
}

/**
 * The resolution every consumer must agree on: operator first, rule second.
 * The client's `ContentDb.voxelSkinOverrideFor` implements the same order —
 * `voxelBodyResolutionMatchesClient` in the test file pins them together, since
 * a console that previews one answer while the game renders another is worse
 * than no console at all.
 */
export function resolveBody(
  championId: string,
  modelKey: string | undefined,
  operator: Record<string, boolean>,
): { effective: boolean; origin: BodyOrigin } {
  const set = operator[championId];
  if (typeof set === "boolean") return { effective: set, origin: "overlay" };
  return { effective: defaultPrefersVoxelBody(modelKey, championId), origin: "default" };
}

/** Build the whole table. Only stand-in champions can meaningfully be toggled. */
export function bodyRows(
  champions: readonly ChampionLite[],
  operator: Record<string, boolean>,
): BodyRow[] {
  return champions
    .filter((c) => STAND_IN_MODEL_KEYS.includes(c.modelKey ?? ""))
    .map((c) => {
      const r = resolveBody(c.id, c.modelKey, operator);
      return {
        championId: c.id,
        name: c.name ?? c.id,
        modelKey: c.modelKey ?? "",
        hasBlizzardModel: reachesBlizzardModel(c.id),
        defaultVoxel: defaultPrefersVoxelBody(c.modelKey, c.id),
        operator: typeof operator[c.id] === "boolean" ? operator[c.id]! : null,
        effective: r.effective,
        origin: r.origin,
      };
    })
    .sort((a, b) => (a.championId < b.championId ? -1 : 1));
}

/**
 * Set one champion's bit. Returns a NEW doc — the page never mutates the object
 * it is rendering, so a failed PUT leaves the table showing what is actually
 * stored rather than what the operator hoped for.
 */
export function setBody(doc: VoxelBodiesDoc, championId: string, voxel: boolean): VoxelBodiesDoc {
  return { ...doc, bodies: { ...doc.bodies, [championId]: voxel } };
}

/**
 * Drop a champion's entry so it falls back to the rule.
 *
 * ⚠️ This is NOT the same as `setBody(id, false)`, and the difference is the
 * whole reason the third state exists: for a champion with no model of its own,
 * "forget my setting" means 「回到體素」 while "set false" means 「強制用模型」—
 * and it has none, so it would render as a shared stand-in face.
 */
export function forgetBody(doc: VoxelBodiesDoc, championId: string): VoxelBodiesDoc {
  const bodies = { ...doc.bodies };
  delete bodies[championId];
  return { ...doc, bodies };
}

/** Headline counts for the page banner. */
export function bodySummary(rows: readonly BodyRow[]): {
  total: number;
  voxel: number;
  model: number;
  touched: number;
  noModelAvailable: number;
} {
  return {
    total: rows.length,
    voxel: rows.filter((r) => r.effective).length,
    model: rows.filter((r) => !r.effective).length,
    touched: rows.filter((r) => r.operator !== null).length,
    noModelAvailable: rows.filter((r) => !r.hasBlizzardModel).length,
  };
}
