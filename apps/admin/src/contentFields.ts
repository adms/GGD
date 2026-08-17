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
// ⚠️ 地面材質名**推導**自引擎認得的那一份，⛔ 不在提示字串裡手抄 ——
// 手抄的那一版在 GH#342 之前少了 tatami / obsidian 兩個，而它不會有東西變紅。
import { GROUND_STYLE_IDS } from "@ggd/shared/content/schema/groundStyle";

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
    // #248: 生命／回血／攻擊力／護甲／攻速／魔力／回魔 的每級成長已改由三圍
    // 成長推導（見下一組），不再手寫在 growth 裡，否則會雙重計算。
    // 只剩魔抗——魔獸三代沒有「魔抗屬性」，這一項只能手工設定。
    title: "每級成長 (growth)",
    fields: [{ path: "growth.mr", label: "魔抗", kind: "number" }],
  },
  {
    // #248: 從原始地圖抓回來的力量／敏捷／智慧。上面的「基礎數值」是地圖裡的
    // 原始值，實際數值 = 基礎值 + 係數 × 三圍（係數在「戰鬥系統」頁可調）。
    title: "三圍 (attributes)",
    fields: [
      { path: "attributes.str", label: "力量", kind: "number" },
      { path: "attributes.agi", label: "敏捷", kind: "number" },
      { path: "attributes.int", label: "智慧", kind: "number" },
      { path: "attributes.strGrowth", label: "力量成長", kind: "number", hint: "每級" },
      { path: "attributes.agiGrowth", label: "敏捷成長", kind: "number", hint: "每級" },
      { path: "attributes.intGrowth", label: "智慧成長", kind: "number", hint: "每級" },
      { path: "attributes.primary", label: "主屬性", kind: "text", hint: "STR / AGI / INT" },
      { path: "attributes.source", label: "來源", kind: "text", hint: "w3x（原始地圖）／authored（手工）" },
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
      {
        path: "vfxKey",
        label: "特效 key",
        kind: "text",
        hint: "主要特效（vfx/ 的 id）。有寫 vfxLayers 時，施法畫的是那一張表",
      },
      {
        path: "vfxLayers",
        label: "多層特效模板",
        kind: "json",
        hint:
          "陣列，最多 6 層（上限本身在 鑄技工坊 可調）。每一層： " +
          '{"vfxKey":"…","delayMs":220,"attachTo":"caster|point",' +
          '"w3xScale":1.8,"alpha":0.85,"timeScale":2.4,"tint":[90,170,255]}。' +
          "留空 = 沿用上面那個單一 vfxKey。格子清空要整個拿掉 key，不要填 0",
      },
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

/**
 * 三選一強化技能 — augments/<id>.json. These are the DRAFT abilities the owner
 * asked to edit separately from champion abilities (task #70 rule 3): a player
 * drafts them in the mid-match 3-choose-1, they are NOT any champion's default
 * kit. `modifiers`/`hooks` are complex arrays, surfaced via the raw-JSON editor
 * (uncoveredKeys names them) exactly as ability effects are.
 */
const AUGMENT_GROUPS: readonly FieldGroup[] = [
  { title: "識別", fields: IDENTITY },
  {
    title: "基本資料",
    fields: [
      { path: "name", label: "名稱", kind: "text" },
      { path: "description", label: "說明", kind: "multiline" },
      {
        path: "tier",
        label: "強化等級",
        kind: "text",
        hint: "silver / gold / prismatic — 決定在第幾輪三選一出現",
      },
      { path: "weight", label: "抽中權重", kind: "number", hint: "同等級內的相對出現機率" },
      { path: "tags", label: "標籤", kind: "stringList", hint: "逗號分隔" },
    ],
  },
];

/**
 * 抽獎池 — loot-tables/<id>.json. These are the 3-choose-1 ITEM DRAFT pools.
 * ⚠️ CORRECTED 2026-08-01: `legendary-weapons` is now BOTH the weapon-draft pool
 * AND the 傳說寶玉 pool, and `quest-rewards` is RETIRED — still editable here,
 * still whitelisted, but no round may schedule it (owner 「=> 退場」; the state
 * lives in `arena-rules.retiredLootTables` and is edited on the 傳說武器三選一
 * page). The owner asked to curate the draft
 * from the backend (task #70); a loot table is `{id, entries:[{itemId,weight}]}`,
 * an ARRAY doc with no scalar fields to label, so `entries` is edited through
 * the raw-JSON escape hatch (uncoveredKeys names it) under the same
 * `loot-table@1` schema the game loader validates against. Add/remove a whole
 * pool with 新增/刪除.
 */
const LOOT_GROUPS: readonly FieldGroup[] = [{ title: "識別", fields: IDENTITY }];

/**
 * 特效 — vfx/<id>.json (task #205). The vfx collection is a discriminated union
 * (vfx@1 particle | ribbon@1 trail) with strict cross-field refinements. The
 * SCALAR knobs get labelled inputs; the tuple/gradient core (color.start/end
 * rgba, colorStops/sizeStops, spriteSheet, emitter shape params) stays in the
 * raw-JSON 整份覆蓋 escape hatch surfaced by uncoveredKeys() — exactly as an
 * ability's `effects` and a loot-table's `entries` are today. A rich rgba /
 * gradient-stop widget is a deferred additive follow-up, not this pass.
 */
const VFX_GROUPS: readonly FieldGroup[] = [
  { title: "識別", fields: IDENTITY },
  {
    title: "發射與生命",
    fields: [
      { path: "mode", label: "模式", kind: "text", hint: "continuous（持續）或 burst（爆發）" },
      { path: "rate", label: "每秒粒子數", kind: "number", hint: "continuous 模式必填" },
      { path: "burstCount", label: "每爆發粒子數", kind: "integer", hint: "burst 模式必填" },
      { path: "lifetimeSec.min", label: "壽命最小(秒)", kind: "number" },
      { path: "lifetimeSec.max", label: "壽命最大(秒)", kind: "number", hint: "須 ≥ 最小值" },
      { path: "blendMode", label: "混合模式", kind: "text", hint: "additive / alpha / modulate / alphaKey" },
    ],
  },
  {
    title: "大小與物理",
    fields: [
      { path: "size.start", label: "起始大小", kind: "number" },
      { path: "size.end", label: "結束大小", kind: "number" },
      { path: "gravityY", label: "重力Y", kind: "number", hint: "負值向下（WC3 gravity → -y）" },
      { path: "speed.min", label: "噴發速度最小", kind: "number" },
      { path: "speed.max", label: "噴發速度最大", kind: "number", hint: "須 ≥ 最小值" },
      { path: "stretched", label: "拉伸尾焰", kind: "boolean", hint: "WC3 tail → BILLBOARD 拉伸" },
      { path: "ambient", label: "常駐(隨實體存活)", kind: "boolean" },
      { path: "anchorBone", label: "掛點骨架", kind: "text", hint: "glb joint 名稱；空=模型根" },
    ],
  },
  {
    title: "貼圖",
    fields: [
      { path: "texture", label: "貼圖路徑", kind: "text", hint: "須以 assets/ 開頭" },
    ],
  },
  // ribbon@1 shares this collection; its own scalars are labelled here too so a
  // ribbon doc is not entirely raw-JSON. Fields absent from a vfx@1 doc simply
  // render empty (getAt → undefined), which is the same as any optional field.
  {
    title: "緞帶 (ribbon@1)",
    fields: [
      { path: "widthAbove", label: "上緣寬", kind: "number" },
      { path: "widthBelow", label: "下緣寬", kind: "number" },
      { path: "lifespanSec", label: "殘影壽命(秒)", kind: "number" },
      { path: "uvScrollPerSec", label: "UV 捲動/秒", kind: "number" },
    ],
  },
];

/**
 * 場景物件 — arenas/<id>.json (場景物件管理). Only identity + the visual scalars
 * get labelled inputs. The gameplay payload — `zones[]` (center / boundaryRadius
 * / obstacles / spawns, a nested superRefine that every obstacle & spawn sits
 * inside the boundary) and `decor[]` prop placements — is raw-JSON only, so a
 * save can never produce an arena the sim's collision loader would reject: the
 * content-api dry-run runs zArenaDoc's superRefine before a byte is written.
 */
const ARENA_GROUPS: readonly FieldGroup[] = [
  { title: "識別", fields: IDENTITY },
  {
    title: "基本資料",
    fields: [
      { path: "name", label: "名稱", kind: "text" },
      {
        path: "groundStyle",
        label: "地面樣式",
        kind: "text",
        hint: `${GROUND_STYLE_IDS.join(" / ")}（視覺，不影響碰撞）`,
      },
    ],
  },
];

/**
 * 模型 — models/<id>.json.
 *
 * DELIBERATELY LEAN, and the omission is the design. A generated figure's
 * `voxel` block, its `clipMap` and its `scale` are OUTPUTS of the 鑄形工坊
 * studio, not fields to hand-tune: `scale` is #150's measured normalisation,
 * the clip map is total by construction, and hand-editing `voxel` would author
 * geometry the offline bake never sees. `glbPath` is read-only for the same
 * reason it is derived in the studio — typing it is how a model lands under
 * `assets/models/imported/` and silently gains 90° of yaw (#68/#1).
 *
 * What IS editable here is the one number that is a genuine gameplay
 * judgement: `collisionRadius`. Everything else this form does not cover is
 * NAMED by `uncoveredKeys` and reachable through 原始 JSON, as everywhere else.
 */
const MODEL_GROUPS: readonly FieldGroup[] = [
  { title: "識別", fields: IDENTITY },
  {
    title: "基本資料",
    fields: [
      {
        path: "glbPath",
        label: "模型檔",
        kind: "text",
        readOnly: true,
        hint: "content 相對路徑；體素模型由 pnpm voxel:gen 產生，不可手改",
      },
      {
        path: "scale",
        label: "縮放",
        kind: "number",
        readOnly: true,
        hint: "由 #150 統一身高換算（1.8u ÷ 實測高度），非人工填寫",
      },
      {
        path: "collisionRadius",
        label: "碰撞半徑",
        kind: "number",
        hint: "sim 用的平面半徑，預設 0.6",
      },
      {
        path: "teamTintMaterials",
        label: "隊色材質",
        kind: "stringList",
        hint: "會被染成隊伍顏色的材質名（#49）",
      },
    ],
  },
  {
    title: "動畫對應 (clipMap)",
    fields: [
      { path: "clipMap.idle", label: "待機", kind: "text" },
      { path: "clipMap.run", label: "跑動", kind: "text" },
      { path: "clipMap.attack", label: "攻擊", kind: "text" },
      { path: "clipMap.cast", label: "施法", kind: "text" },
      { path: "clipMap.hurt", label: "受擊", kind: "text" },
      { path: "clipMap.death", label: "死亡", kind: "text" },
    ],
  },
];

const GROUPS: Record<EditCollection, readonly FieldGroup[]> = {
  champions: CHAMPION_GROUPS,
  abilities: ABILITY_GROUPS,
  items: ITEM_GROUPS,
  augments: AUGMENT_GROUPS,
  "loot-tables": LOOT_GROUPS,
  vfx: VFX_GROUPS,
  arenas: ARENA_GROUPS,
  models: MODEL_GROUPS,
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
  augments: "三選一強化",
  "loot-tables": "三選一抽獎池",
  vfx: "特效",
  arenas: "場景物件",
  // 模型 — the collection 鑄形工坊 (task #229) saves into.
  models: "模型",
};

/** The `_index.json` / `/content` mount directory for a collection. */
export const COLLECTION_DIR: Record<EditCollection, string> = {
  champions: "champions",
  abilities: "abilities",
  items: "items",
  augments: "augments",
  "loot-tables": "loot-tables",
  vfx: "vfx",
  arenas: "arenas",
  models: "models",
};
