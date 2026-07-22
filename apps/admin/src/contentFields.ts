/**
 * contentFields — which fields the 內容管理 page shows and edits, per
 * collection. Pure data + pure helpers, so the whole thing is unit-testable
 * under plain node with no DOM and no server.
 *
 * WHAT THIS IS NOT: a schema. The authority on whether a document is legal is
 * the shared Zod schemas that the GAME LOADER uses, reached through the
 * content-api's dry-run `/validate` route. This file only decides what gets a
 * labelled input instead of living in the raw-JSON escape hatch — so a field
 * missing from these tables is inconvenient, never a validation hole. Any
 * document, including one whose shape this file has never heard of, can still
 * be edited whole through 原始 JSON and is still validated by the real schemas
 * before a single byte is written.
 *
 * Field kinds come from @ggd/shared/content/editModel, whose `parseField`
 * spells "cleared" as `undefined` = REMOVE THE KEY, because that is how the Zod
 * schemas spell "no value".
 */
import type { EditCollection, FieldKind } from "@ggd/shared/content/editModel";

export interface FieldSpec {
  /** dot path into the document ("baseStats.maxHealth") */
  readonly path: string;
  readonly label: string;
  readonly kind: FieldKind;
  /** shown under the input — units, ranges, gotchas */
  readonly hint?: string;
  /** id/schema are structural: rendered read-only, never editable here */
  readonly readOnly?: boolean;
}

export interface FieldGroup {
  readonly title: string;
  readonly fields: readonly FieldSpec[];
}

const IDENTITY: readonly FieldSpec[] = [
  { path: "id", label: "id", kind: "text", readOnly: true, hint: "檔名即 id，不可在此改" },
  { path: "schema", label: "schema", kind: "text", readOnly: true, hint: "結構標籤，由 collection 決定" },
];

/** 英雄 — champions/<id>.json */
const CHAMPION_GROUPS: readonly FieldGroup[] = [
  { title: "識別", fields: IDENTITY },
  {
    title: "基本資料",
    fields: [
      { path: "name", label: "名稱", kind: "text" },
      { path: "description", label: "介紹", kind: "multiline", hint: "圖鑑與選角畫面顯示的全文" },
      { path: "role", label: "定位", kind: "text", hint: "fighter / mage / marksman / support / tank / assassin" },
      { path: "attackType", label: "攻擊類型", kind: "text", hint: "melee 或 ranged" },
      { path: "modelKey", label: "模型 key", kind: "text", hint: "models/ 的 key，改錯會變成替身模型" },
      { path: "icon", label: "圖示", kind: "text", hint: "content 相對路徑，需以 assets/ 開頭" },
      { path: "tags", label: "標籤", kind: "stringList", hint: "逗號分隔" },
    ],
  },
  {
    title: "基礎數值 (baseStats)",
    fields: [
      { path: "baseStats.maxHealth", label: "生命", kind: "number" },
      { path: "baseStats.healthRegen", label: "生命回復", kind: "number" },
      { path: "baseStats.maxMana", label: "魔力", kind: "number" },
      { path: "baseStats.manaRegen", label: "魔力回復", kind: "number" },
      { path: "baseStats.ad", label: "攻擊力", kind: "number" },
      { path: "baseStats.ap", label: "法術強度", kind: "number" },
      { path: "baseStats.armor", label: "護甲", kind: "number" },
      { path: "baseStats.mr", label: "魔抗", kind: "number" },
      { path: "baseStats.as", label: "攻速", kind: "number", hint: "每秒攻擊次數" },
      { path: "baseStats.ms", label: "移速", kind: "number", hint: "遊戲單位／秒" },
      { path: "baseStats.range", label: "攻擊距離", kind: "number" },
      { path: "baseStats.critChance", label: "爆擊率", kind: "number", hint: "0–1" },
      { path: "baseStats.critDamage", label: "爆擊倍率", kind: "number" },
      { path: "baseStats.cdr", label: "冷卻縮減", kind: "number", hint: "0–1" },
      { path: "baseStats.lifesteal", label: "吸血", kind: "number", hint: "0–1" },
    ],
  },
  {
    title: "每級成長 (growth)",
    fields: [
      { path: "growth.maxHealth", label: "生命", kind: "number" },
      { path: "growth.healthRegen", label: "生命回復", kind: "number" },
      { path: "growth.maxMana", label: "魔力", kind: "number" },
      { path: "growth.manaRegen", label: "魔力回復", kind: "number" },
      { path: "growth.ad", label: "攻擊力", kind: "number" },
      { path: "growth.armor", label: "護甲", kind: "number" },
      { path: "growth.mr", label: "魔抗", kind: "number" },
      { path: "growth.as", label: "攻速", kind: "number" },
    ],
  },
  {
    title: "技能與出裝",
    fields: [
      { path: "exAbility", label: "EX 技能 id", kind: "text", hint: "abilities/ 的 id；清空代表沒有 EX" },
      { path: "skillOrder", label: "加點順序", kind: "stringList", hint: "Q, W, E, R" },
      { path: "buildPriority", label: "推薦出裝", kind: "stringList", hint: "items/ 的 id，逗號分隔" },
    ],
  },
];

/** 技能 — abilities/<id>.json */
const ABILITY_GROUPS: readonly FieldGroup[] = [
  { title: "識別", fields: IDENTITY },
  {
    title: "基本資料",
    fields: [
      { path: "name", label: "名稱", kind: "text", hint: "命名規則 xx-0N，見 ability 編號慣例" },
      { path: "description", label: "說明", kind: "multiline" },
      { path: "slot", label: "槽位", kind: "text", hint: "Q / W / E / R / EX / PASSIVE" },
      { path: "castType", label: "施放方式", kind: "text", hint: "targeted / skillshot / self / ground …" },
      { path: "icon", label: "圖示", kind: "text", hint: "content 相對路徑，需以 assets/ 開頭" },
      { path: "vfxKey", label: "特效 key", kind: "text" },
    ],
  },
  {
    title: "數值",
    fields: [
      { path: "maxRank", label: "最大等級", kind: "integer" },
      { path: "cooldown", label: "冷卻 (每級)", kind: "numberList", hint: "逗號分隔，長度應等於最大等級" },
      { path: "manaCost", label: "魔耗 (每級)", kind: "numberList", hint: "逗號分隔" },
      { path: "range", label: "施放距離", kind: "number" },
      { path: "radius", label: "範圍半徑", kind: "number" },
      { path: "castTime", label: "施放時間", kind: "number" },
      { path: "targetsEnemies", label: "可指定敵人", kind: "boolean" },
      { path: "targetsAllies", label: "可指定隊友", kind: "boolean" },
    ],
  },
];

/** 武器道具 — items/<id>.json */
const ITEM_GROUPS: readonly FieldGroup[] = [
  { title: "識別", fields: IDENTITY },
  {
    title: "基本資料",
    fields: [
      { path: "name", label: "名稱", kind: "text" },
      { path: "description", label: "說明", kind: "multiline" },
      { path: "cost", label: "價格", kind: "integer" },
      { path: "tier", label: "階級", kind: "integer" },
      { path: "icon", label: "圖示", kind: "text", hint: "content 相對路徑，需以 assets/ 開頭" },
      { path: "tags", label: "標籤", kind: "stringList", hint: "逗號分隔" },
      { path: "buildsFrom", label: "合成自", kind: "stringList", hint: "items/ 的 id，逗號分隔" },
    ],
  },
];

const GROUPS: Record<EditCollection, readonly FieldGroup[]> = {
  champions: CHAMPION_GROUPS,
  abilities: ABILITY_GROUPS,
  items: ITEM_GROUPS,
};

export function fieldGroups(collection: EditCollection): readonly FieldGroup[] {
  return GROUPS[collection];
}

/** Every spec for a collection, flattened (group order preserved). */
export function allFields(collection: EditCollection): readonly FieldSpec[] {
  return fieldGroups(collection).flatMap((g) => g.fields);
}

/** The spec for one path, or null when the page has no labelled input for it. */
export function fieldSpec(collection: EditCollection, path: string): FieldSpec | null {
  return allFields(collection).find((f) => f.path === path) ?? null;
}

/**
 * Top-level keys a document has that NO labelled input covers — the honest
 * answer to "is the form showing me everything?". The page names these next to
 * the raw-JSON editor instead of pretending they do not exist; `abilities` and
 * `effects` are the big ones, and silently hiding them is how an editor
 * convinces someone a field is gone when it is merely unrendered.
 */
export function uncoveredKeys(
  collection: EditCollection,
  doc: Readonly<Record<string, unknown>>,
): string[] {
  const covered = new Set(allFields(collection).map((f) => f.path.split(".")[0] as string));
  return Object.keys(doc)
    .filter((k) => !covered.has(k))
    .sort();
}

// ---------------------------------------------------------------------------
// display labels
// ---------------------------------------------------------------------------

export const COLLECTION_LABEL: Record<EditCollection, string> = {
  champions: "英雄",
  abilities: "技能",
  items: "武器道具",
};

/** The `_index.json` / `/content` mount directory for a collection. */
export const COLLECTION_DIR: Record<EditCollection, string> = {
  champions: "champions",
  abilities: "abilities",
  items: "items",
};
