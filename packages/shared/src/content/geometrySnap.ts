/**
 * ⭐【沒標級別的幾何，載入時吸到最近一格】—— GH#1260 B3。
 *
 * owner（逐字）：
 * > 2026-08-22 02:47「我將出身 屬性 技能傷害耗魔冷卻**距離範圍** 這些五級距 正規化 公式化」
 * >  （`docs/_daily/2026-08-22.md:30`；⚠️ 修正輪更正：第一版寫 02:44）
 * > 2026-09-02 13:52「所有技能傷害（含升級）、AP加成、冷卻、**距離、範圍**、耗魔、條件增幅...
 * >  這些全部都五級距化標籤化」（`docs/_daily/2026-09-02.md:99`；:92 是 14:00 重貼的同一段）
 * > 2026-09-02 09:35「…或是**全部公式化自動套用**我就對落入五級距的合理性沒意見」
 * >  （`docs/_daily/2026-09-02.md:84`）
 * ⚠️ 09:35 那句的**原上下文是 AP 係數**（12-002 仙氣發勁那一串，帳本標「設計討論」）——
 *   把它套到「距離／範圍吸格」是 **Claude 的推論**，⛔ 不是 owner 對距離吸格的直接授權。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 為什麼是**一個載入時的接縫**，⛔ 不是逐檔寫級別
 *
 * 量到的（2026-09-15，註冊表開關前後逐值比對）：**208 個幾何值／113 支技能**不在格子上，
 * 而它們**大半是模板展開出來的**（`tpl-leap-strike` 的 `landRadius` 150 wc3u、
 * `tpl-charge-push` 的 `pushDistance`、社群 hero-template 的整段效果）——
 * 那些數字住在模板參數與模板本體裡，⛔ 文件上根本沒有一格可以填級別。
 * ⇒ 逐檔寫只收得到一半，另一半永遠是自由數字；而**卡面早就在印級距詞**
 *   （`abilityProse.ts::tierWordFor` 用同一支 `snapToTier` 把 3.67 印成「小」），
 *   引擎卻照跑 3.67 —— 卡面與場上說兩句話（第一·五守則）。
 *
 * ⇒ 一條規則、一個接縫：standalone／內嵌／模板展開後／編輯器預覽／英雄包匯入，
 *   全部走 `runtimeResolver.ts` 的同一條管線 ⇒ 不可能出現「這條路吸格、那條路沒有」。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 規則（每一條都是一張表，⛔ 沒有任何一支技能的 if）
 *
 * | 欄位 | 梯子 | 表住哪 |
 * |---|---|---|
 * | 技能頂層 `range` | 施法距離 | `range-tiers.json` |
 * | 技能頂層 `radius`、任何**帶 `radiusTier` 欄位的 kind** 的半徑 | AoE | `aoe-tiers.json` |
 * | 位移距離（`displacementFieldsOf`：擊退／衝刺／瞬移固定距離／拋投） | 位移兩條梯子 | `displacement-tiers.json` |
 *
 * · 「哪些 kind 的 `radius` 是命中範圍」**從 Zod 推導**（schema 上有 `radiusTier` 一格的那些）
 *   ⇒ `spawnObstacle`（身體大小）／`spawnModelFx`（演出）／螢幕回饋（觀眾半徑）自動不在內。
 * · 吸格用 `snapToTier`（最近一格，平手往小）＝卡面 `tierWordFor` **同一支** ⇒ 卡面詞＝場上值。
 * · 只動**沒有級別**的那一格；有級別的照舊由各軸 `resolve*Tier` 翻（級別贏）。
 * · ≤0 或 ≥ 決鬥區半徑（卡面印「全場」）不動 —— 那不是一個距離級別。
 * · ⛔ 不進 `template` 子樹（參數的單位是 wc3u）；⛔ 不動骨架英雄（fail-open 佔位，不是遊戲內容）；
 *   ⛔ 不動道具／增益（owner 原話說的是「技能」）。
 * · 位移只改**距離**，⛔ 不改作者的速度（owner 說的是距離；速度是穿牆安全欄位，另有天花板）。
 *
 * ⭐ rollback：三張表各一格 `snapUntiered`（後台「AoE 範圍五級距／施法距離五級距／位移級距」），
 *   false ⇒ 那一軸逐位元回到作者手寫的數字。
 *
 * ⚠️ 副作用（GH#1260 B3 修正輪記下）：開著時，文件／編輯器欄位上的 `2.75` ⛔ 不是場上值（場上 3）
 *   ⇒ 作者把 2.75 微調成 2.9 **不會有任何效果**（一格無聲失效的欄位）。
 *   ⇒ 緩解：{@link geometrySnapNotices} 用**同一次走訪**列出「寫 X、場上 Y」，編輯器存檔警示讀它
 *     （`apps/editor/src/authorWarnings.ts`）。要精確值 ⇒ 寫級別欄位，或關那一軸的 `snapUntiered`。
 */
import { aoeTiersFromDoc, radiusFieldOf, type AoeTiers } from "./aoeTiers";
import { rangeTiersFromDoc, type RangeTiers } from "./rangeTiers";
import {
  displacementFieldsOf,
  displacementTiersFromDoc,
  minBodyRadiusFromConfigs,
  type DisplacementTiers,
} from "./displacementTiers";
import { DUEL_ZONE_RADIUS_REF, snapToTier, type SkillTierName } from "./skillTiers";
import { SKELETON_CHAMPION_IDS } from "./skillNormalize";
import { zEffectDefUnion } from "./schema/effects/index";

export interface GeometrySnapTables {
  readonly aoe: AoeTiers;
  readonly range: RangeTiers;
  readonly displacement: DisplacementTiers;
}

type Ladder = Readonly<Record<SkillTierName, number>>;

let radiusKinds: ReadonlySet<string> | undefined;
/** schema 上有 `radiusTier` 一格的 kind ＝ 它的半徑是命中範圍。⭐ 推導，⛔ 不是名單。 */
function radiusTierKinds(): ReadonlySet<string> {
  if (radiusKinds === undefined) {
    const out = new Set<string>();
    for (const o of zEffectDefUnion.options) {
      const shape = (o as unknown as { shape: Record<string, { value?: unknown } | undefined> }).shape;
      if (shape["radiusTier"] !== undefined && typeof shape["kind"]?.value === "string") out.add(shape["kind"].value);
    }
    radiusKinds = out;
  }
  return radiusKinds;
}

/** 一個自由數字 → 它那一格的值；不該吸的回 undefined。 */
function snapped(v: unknown, ladder: Ladder): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v) || !(v > 0) || v >= DUEL_ZONE_RADIUS_REF) return undefined;
  const to = ladder[snapToTier(v, ladder)];
  return to === v ? undefined : to;
}

const distances = (t: DisplacementTiers["travel"]): Ladder =>
  Object.fromEntries(Object.entries(t).map(([k, r]) => [k, r.distance])) as Ladder;

/** 一格被吸格的幾何：作者寫的 `from` → 場上的 `to`。 */
export interface GeometrySnapNotice {
  /** `range` / `radius` / `effects[0].landRadius` */
  readonly path: string;
  readonly from: number;
  readonly to: number;
  readonly tier: SkillTierName;
  /** 哪一張表的哪一條梯子（＝要關哪一格 `snapUntiered`）。 */
  readonly ladder: "range" | "aoe" | "travel" | "push";
}

export function snapUntieredGeometry<T extends object>(
  def: T,
  t: GeometrySnapTables,
  onSnap?: (n: GeometrySnapNotice) => void,
): T {
  const rangeOn = t.range.enabled && t.range.snapUntiered;
  const aoeOn = t.aoe.enabled && t.aoe.snapUntiered;
  const dispOn = t.displacement.enabled && t.displacement.snapUntiered;
  if (!rangeOn && !aoeOn && !dispOn) return def;
  const d = def as Record<string, unknown>;
  const schema = d["schema"];
  if (schema !== undefined && schema !== "ability@1") return def;
  if (typeof d["id"] === "string" && SKELETON_CHAMPION_IDS.has(d["id"].split(".")[0]!)) return def;

  const kinds = radiusTierKinds();
  const ladders = { travel: distances(t.displacement.travel), push: distances(t.displacement.push) };
  const put = (
    out: Record<string, unknown>,
    key: string,
    raw: unknown,
    ladder: Ladder,
    name: GeometrySnapNotice["ladder"],
    path: string,
  ): void => {
    const v = snapped(raw, ladder);
    if (v === undefined) return;
    out[key] = v;
    onSnap?.({ path: path === "" ? key : `${path}.${key}`, from: raw as number, to: v, tier: snapToTier(v, ladder), ladder: name });
  };

  const walk = (node: unknown, path: string): unknown => {
    if (Array.isArray(node)) return node.map((v, i) => walk(v, `${path}[${i}]`));
    if (node === null || typeof node !== "object") return node;
    const rec = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) out[k] = k === "template" ? v : walk(v, path === "" ? k : `${path}.${k}`);
    const kind = rec["kind"];
    if (typeof kind !== "string") return out;
    if (aoeOn && kinds.has(kind) && typeof rec["radiusTier"] !== "string") {
      const f = radiusFieldOf(kind);
      put(out, f, rec[f], t.aoe.radius, "aoe", path);
    }
    const disp = dispOn ? displacementFieldsOf(rec) : undefined;
    if (disp !== undefined && typeof rec["distanceTier"] !== "string" && rec["launchDistance"] === undefined) {
      put(out, disp.distanceField, rec[disp.distanceField], ladders[disp.ladder], disp.ladder, path);
    }
    return out;
  };

  const out = walk(d, "") as Record<string, unknown>;
  if (rangeOn && typeof d["rangeTier"] !== "string" && d["rangeUnlimited"] !== true) {
    put(out, "range", d["range"], t.range.range, "range", "");
  }
  if (aoeOn && typeof d["radiusTier"] !== "string") put(out, "radius", d["radius"], t.aoe.radius, "aoe", "");
  return out as T;
}

/**
 * ⭐ 「作者寫 X、場上 Y」的清單 —— **同一次** {@link snapUntieredGeometry} 走訪記下來的，
 * ⛔ 不是第二份判斷（兩份一旦分岔，警示就會對一格沒被吸的值喊、或對被吸的值沉默）。
 * 給編輯器存檔警示用：級距內微調一個沒標級別的幾何值，場上**不會有任何變化**。
 */
export function geometrySnapNotices(def: object, t: GeometrySnapTables): GeometrySnapNotice[] {
  const out: GeometrySnapNotice[] = [];
  snapUntieredGeometry(def, t, (n) => out.push(n));
  return out;
}

/** 三張表從 config 文件讀（與 `createRuntimeResolver` 用同一組 `*FromDoc` 解析）。 */
export function geometrySnapTablesFromConfigs(configDocs: readonly unknown[]): GeometrySnapTables {
  const find = (schema: string): unknown =>
    configDocs.find((c) => (c as { schema?: unknown } | null)?.schema === schema);
  return {
    aoe: aoeTiersFromDoc(find("config.aoe-tiers@1")),
    range: rangeTiersFromDoc(find("config.range-tiers@1")),
    displacement: displacementTiersFromDoc(find("config.displacement-tiers@1"), minBodyRadiusFromConfigs(configDocs)),
  };
}
