/**
 * ⭐ 客戶端預測用的**屬性計算** —— 抽成純函式的唯一理由是**它要能被守衛跑到**。
 *
 * ── 為什麼（GH#616）────────────────────────────────────────────────────────
 * 這兩支原本是 `GameApp` 的 private method，而 `GameApp` **沒辦法 headless 建**
 * （Babylon engine / canvas / socket）⇒ 任何守衛都只能**自己重寫一份**去驗 ——
 * 而那正是第二守則失敗形態⑤（被測的不是出貨的那個）。
 *
 * ⚠️ 2026-08-23 我第一次寫這條守衛時就踩了：測試自己呼叫 `finalizeStat`，
 * 於是**把出貨路徑改回錯的版本，測試照樣綠**。⇒ 抽出來，讓守衛跑**這一支**。
 *
 * ── ⛔ 這裡不可以有第二份公式 ──────────────────────────────────────────────
 * 伺服器的最終值是 `statPipeline.recomputeStats` 的 `computeStat`：
 *
 *     championStatBase(卡面 + growth·(等級−1) + 三圍)
 *       → 修飾子折疊（flat / pctAdd / pctMult / override / capRaise）
 *       → finalizeStat（環境倍率鏈 → 基礎加成 → 每級加成 → 夾限）
 *
 * ⭐ 這個檔案的每一層都呼叫**伺服器用的同一支函式**（`championStatBase` /
 * `finalizeStat` / `attackRangeScaleFactor` / `capFor`），⛔ 不抄任何一條鏈或
 * 一個係數 —— 抄了它漂掉的那天沒有東西會紅（第〇·四守則）。
 *
 * ── ⛔ 量到的五個漏接（2026-08-23，GH#616 複驗）────────────────────────────
 * 在此之前這裡只有「卡面 `Flat` 道具加成 × 環境倍率鏈」，於是**五層**只在伺服器發生：
 *
 * | 漏掉的 | 量到的影響（出貨內容） |
 * |---|---|
 * | `growth·(等級−1)`（`msGrowthTier` 在載入時解析成 `growth.ms`） | 出貨初始等級 **6** ⇒ 夢幻之星-初音 影子**慢 8.0%** |
 * | 非 `Flat` 的道具修飾子（`pctAdd` / `pctMult` / `capRaise`） | 3 件出貨道具帶移速：`godie-i014`／`godie-i00s` ×1.2、`odm-gear` +50% ⇒ 買了就**慢 17–33%** |
 * | `rangeScale`（身體放大倍數 → 攻擊距離，GH#252） | 7 位英雄，最多 **×1.30**（`godie-o030` 伺服器 6.396 / 客戶端 4.920） |
 * | 職業限定閘 `requires`（⚠️ 比 GH#616 更早的缺陷） | 貫雷槍「近戰+4／遠戰+2」**兩條都收** ⇒ 射程 4.44 而伺服器 3.24 |
 * | 出貨的 `stat-caps` / `base-bonus` / `per-level-bonus` 三張表 | 今天 `ms`/`range` 都沒有列 ⇒ 0；⛔ 但 owner 哪天加一列就會**靜靜地**分岔 |
 *
 * ⛔ **靈氣（`auras`）預測不到**，而且刻意不做：它是「誰站在半徑內」的函式，
 * 而影子世界只有自己一具身體。夢幻之星-初音的天生技把 `ms +8%` 寫在自己的靈氣裡
 * ⇒ 那 8% 由 `reconcile` 吸收（守衛從內容**推導**這份名單，⛔ 不是寫死豁免）。
 *
 * ⚠️ 影子比伺服器慢/快，代價都一樣：每一張快照把角色拉回去 ＝ owner 說的「回溯」。
 */
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { finalizeStat } from "@ggd/shared/sim/baseBonus";
import { baseBonusFromDoc, perLevelBonusFromDoc } from "@ggd/shared/sim/baseBonus";
import { statCapsFromDoc, capFor, type StatCapTable } from "@ggd/shared/sim/statCaps";
import { attackRangeScaleFactor, bodyScaleRulesFromDoc } from "@ggd/shared/sim/bodyScale";
import { championStatBase, NO_ATTR_BONUS } from "@ggd/shared/sim/stats/attributes";
import { heroStartLevel } from "@ggd/shared/content/schema/config/match";
import {
  scaleModifiers,
  DEFAULT_MISMATCH_SCALE,
  MISMATCH_SCALE_MAX,
  MISMATCH_SCALE_MIN,
  type ClassRequirement,
} from "@ggd/shared/sim/content/requirement";
import { ModOp, type StatModifier } from "@ggd/shared/sim/stats/modifiers";
import { Champions, Items } from "@ggd/shared/sim/content/registry";
import { Configs } from "@ggd/shared/content/registries";
import type { CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";
import type { ChampionId, ItemId } from "@ggd/shared/ids";

/** 沒有英雄卡時的移速底線（與 `GameApp` 在此之前逐位元相同）。 */
export const FALLBACK_MOVE_SPEED = 6.6;

/**
 * 一格文件 → 一張解析好的表，**按文件物件的參照**記憶。
 *
 * ⚠️ 這不是微優化：`GameApp.ensurePredictionEntity` **每一幀**都呼叫下面兩支，
 * 而 `*FromDoc` 每次都會重建一個 frozen 物件。內容換了（登錄表重註冊）參照就變，
 * ⇒ 快取自己失效，⛔ 不需要任何人記得清它。
 */
const MISS = Symbol("miss");
function byDoc<R>(parse: (doc: unknown) => R): (doc: unknown) => R {
  let key: unknown = MISS;
  let val: R;
  return (doc) => {
    if (doc !== key) {
      key = doc;
      val = parse(doc);
    }
    return val;
  };
}
const capsOf = byDoc(statCapsFromDoc);
const bonusOf = byDoc(baseBonusFromDoc);
const perLevelOf = byDoc(perLevelBonusFromDoc);
const bodyRulesOf = byDoc(bodyScaleRulesFromDoc);
const startLevelOf = byDoc(heroStartLevel);

/** `perLevelBonus` 的 `appliesTo` 要小寫（卡面存的是 `"STR"`）。 */
function primaryAttrOf(def: { attributes?: { primary?: string } } | undefined) {
  const p = def?.attributes?.primary;
  return p === "STR" ? "str" : p === "AGI" ? "agi" : p === "INT" ? "int" : undefined;
}

interface Fold {
  flat: number;
  pctAdd: number;
  pctMult: number;
  override: number | null;
  capRaise: number;
}

/**
 * 職業限定閘（`item@1.modifiers[].requires`）的倍率 —— 與伺服器的
 * `requirement.ts::requirementScale` 逐條相同，只是主體從「世界上那具身體」
 * 換成「這張英雄卡」（兩個軸 `attackType` / `primaryStat` 本來就都讀卡）。
 *
 * ⛔ 少了這一格會**兩條都加**：`godie-i01g` 貫雷槍寫著「近戰 +4／遠戰 +2」，
 * 兩條全收 ⇒ 影子的射程 4.44 而伺服器 3.24（量到的，出貨內容）。
 * ⚠️ 這個缺陷**比 GH#616 更早**：舊版只折 `Flat`，而這兩條正是 `Flat`。
 */
function gateScale(
  def: { attackType?: string; attributes?: { primary?: string } } | undefined,
  req: ClassRequirement | undefined,
): number {
  if (req === undefined) return 1;
  let ok = true;
  if (req.attackType !== undefined && def?.attackType !== undefined) {
    ok &&= def.attackType === req.attackType;
  }
  if (req.primaryStat !== undefined && def?.attributes?.primary !== undefined) {
    ok &&= def.attributes.primary === req.primaryStat;
  }
  if (ok) return 1;
  if (req.onMismatch !== "reduced") return 0;
  const raw = req.mismatchScale ?? DEFAULT_MISMATCH_SCALE;
  return raw < MISMATCH_SCALE_MIN ? MISMATCH_SCALE_MIN : raw > MISMATCH_SCALE_MAX ? MISMATCH_SCALE_MAX : raw;
}

/**
 * 背包這一格屬性的折疊 —— 與 `statPipeline.computeStat` 的 op 語意逐條相同。
 *
 * ⛔ `ModOp.PercentOf` 刻意不做：伺服器要**第二趟**才算得出它（它讀別條屬性的
 * 第一趟值）。影子只算兩條屬性，重建整個兩趟管線就是把 `recomputeStats` 抄一份。
 * ⇒ 這條由 `reconcile` 吸收，而守衛從出貨內容推導「有沒有人這樣用移速/射程」。
 */
function foldItems(
  items: readonly string[],
  stat: Stat,
  caps: StatCapTable,
  def: { attackType?: string; attributes?: { primary?: string } } | undefined,
): Fold {
  const f: Fold = { flat: 0, pctAdd: 0, pctMult: 1, override: null, capRaise: 0 };
  for (const itemId of items) {
    if (!itemId) continue;
    for (const raw of Items.tryGet(itemId as ItemId)?.modifiers ?? []) {
      if (raw.stat !== stat) continue;
      // 帶 scope 的加成不進全域折疊（statPipeline 同一行）。
      if (raw.scopeSlot !== undefined || raw.scopeAbilityId !== undefined) continue;
      // 職業限定閘 —— 伺服器在 `itemSource.attachItemSource` 就篩掉了。
      const { requires, ...bare } = raw as StatModifier & { requires?: ClassRequirement };
      const k = gateScale(def, requires);
      if (k === 0) continue;
      const m = scaleModifiers([bare], k)[0]!;
      switch (m.op) {
        case ModOp.Flat:
          f.flat += m.value;
          break;
        case ModOp.PercentAdd:
          f.pctAdd += m.value;
          break;
        case ModOp.PercentMult:
          f.pctMult *= 1 + m.value;
          break;
        case ModOp.Override:
          f.override = m.value;
          break;
        case ModOp.CapRaise:
          if (m.value > f.capRaise) f.capRaise = m.value;
          break;
        case ModOp.CapRaisePct: {
          const lifted = capFor(caps, stat).base * (1 + m.value);
          if (lifted > f.capRaise) f.capRaise = lifted;
          break;
        }
        default:
          break;
      }
    }
  }
  return f;
}

/**
 * 影子要用的一條屬性 —— **與伺服器 `recomputeStats` 逐位元相同**。
 *
 * ⚠️ `attackType` 讀**英雄卡**（`ChampionDef` 的必填欄位），⛔ 不是「射程 > 3」
 * 那種啟發式 —— 射程是會被道具動到的衍生值，用它反推身分等於讓一件裝備
 * 把近戰變成遠程（`statPipeline.ts:141` 逐字記著同一條）。
 *
 * @param level 這具身體**現在**的等級。省略 = 出貨的登場等級
 *   （`config.match@1.progression.heroStartLevel`，owner 2026-08-23 設為 6）——
 *   ⛔ 不是寫死的 1，那會讓每一位帶 `msGrowthTier` 的英雄從開場就分岔。
 */
function predictedStat(
  championId: string,
  items: readonly string[],
  stat: Stat,
  env: CombatEnvMultipliers,
  level?: number,
): number {
  const def = Champions.tryGet(championId as ChampionId);
  const caps = capsOf(Configs.tryGet("stat-caps"));
  const lv = level ?? startLevelOf(Configs.tryGet("config.match"));
  // 卡面 + growth·(等級−1) + 三圍。⛔ 不是 `def.baseStats[stat]`：`msGrowthTier`
  //   在載入時就被解析成 `growth.ms`（第〇·四守則），只讀卡面等於丟掉它。
  const base = def
    ? championStatBase(def, stat, lv, env, NO_ATTR_BONUS)
    : stat === Stat.MoveSpeed
      ? FALLBACK_MOVE_SPEED
      : 0;
  const f = foldItems(items, stat, caps, def);
  const modified = f.override ?? (base + f.flat) * (1 + f.pctAdd) * f.pctMult;
  return finalizeStat(modified, stat, {
    env,
    baseBonus: bonusOf(Configs.tryGet("base-bonus")),
    caps,
    capRaise: f.capRaise,
    // 身體放大倍數 → 攻擊距離（GH#252）。`finalizeStat` 只把它套在
    // `Stat.AttackRange` 上，所以移速那一條逐位元不受影響。
    rangeScale: attackRangeScaleFactor(def?.bodyScale, bodyRulesOf(Configs.tryGet("body-scale"))),
    subject: { attackType: def?.attackType },
    perLevelBonus: perLevelOf(Configs.tryGet("per-level-bonus")),
    level: lv,
    primaryAttr: primaryAttrOf(def),
  });
}

/** 影子的移速。⇒ 影子跑得跟伺服器一樣快，快照就沒有東西要拉回去。 */
export function predictedMoveSpeed(
  championId: string,
  items: readonly string[],
  env: CombatEnvMultipliers,
  level?: number,
): number {
  return predictedStat(championId, items, Stat.MoveSpeed, env, level);
}

/**
 * 影子的攻擊距離。`orderSystem` 把追擊停在 `reach × 0.9`，所以這一格短了，
 * 影子就會比伺服器多走那一段，然後被每一張快照拉回來。
 */
export function predictedAttackRange(
  championId: string,
  items: readonly string[],
  env: CombatEnvMultipliers,
  level?: number,
): number {
  return predictedStat(championId, items, Stat.AttackRange, env, level);
}
