/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  [暴擊吸血] —— 天堂之劍 (godie-i01n) 「6%機率造成10倍暴擊傷害，暴擊時吸血
 *  回復100%傷害」, as ONE source-carried grant
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① 為什麼不能用 `critChance` / `critDamage` 兩條 modifier 表達
 *
 * 出貨到 2026-08-01 為止,這一行**是**用兩條 modifier 寫的:
 * `critChance flat 0.06` + `critDamage flat 8.25`(1.75 + 8.25 = 10.0)。
 * 那個寫法有兩個可觀察的缺陷,而且兩個都不是調數字能修的:
 *
 *   (a) `critDamage` 是一條**聚合屬性**。它一旦 +8.25,這位英雄**每一次**暴擊
 *       都變成 10 倍 —— 包含他自己天生的、三選一給的、別件裝備給的暴擊。
 *       文案綁的是「6% 機率的那一次」,不是「所有暴擊」。
 *   (b) 「暴擊時吸血回復 100% 傷害」**根本寫不出來**。`Stat.Lifesteal` 是無條件
 *       吸血(`combat/damage.ts` 的 `pkt.origin === "basic"` 那一段),而且被
 *       `statTypes.ts` 夾在 [0, 0.8],所以「這一發回滿」既沒有觸發條件也超過上限。
 *
 * 所以它騎在 `ModifierSource` 上,理由和 `evasionScope` / `vision` / `flight` /
 * `damageTypeOverride` / `block` 一模一樣:「這件武器的暴擊不一樣」是**那個來源**
 * 的性質,聚合成一個 `Stat` 的那一刻就沒了。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② 決策點:它是**自己一條 proc**,還是**騎在既有的暴擊骰上**
 *
 * owner 的文案兩種讀法都成立,所以它是一個欄位({@link CritStrikeGrant.empowers}),
 * 不是註解裡的一段辯護(CLAUDE.md 第一守則):
 *
 *   · `"ownProcOnly"`(**預設**)—— 這個 grant 自己抽一次 `chance`。抽中的那一發
 *     吃 `damageMult` 與 `lifestealFraction`;英雄**自己**的 `Stat.CritChance`
 *     暴擊照舊吃 `Stat.CritDamage`,一點都沒變。
 *   · `"everyCrit"` —— `chance` 照抽(所以 0 暴擊率的英雄也拿得到 6%),但這一發
 *     **只要是暴擊**(自己的骰或這個 grant 的骰),就一起吃 `damageMult` 與
 *     `lifestealFraction`。
 *
 * 預設選 `"ownProcOnly"` 因為它嚴格較弱:一個已經堆到 40% 暴擊的英雄不會因為
 * 撿到這把劍就把 40% 全部變成 10 倍。猜錯的話 owner 在後台改一個下拉;猜錯的
 * 另一邊是玩家已經拿到一個沒有人設計過的爆發。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③ 兩個倍率同時成立時 —— **取 max,不相乘**
 *
 * 一發同時被英雄自己的暴擊(`critDamage`,預設 1.75)和這個 grant(10.0)打中時,
 * 答案是 10 倍還是 17.5 倍?這個專案對「同類乘數多來源怎麼算」**已經有一條規則**
 * 而且已經論證過:`combat/block.ts` ⑤ 的「取 max,不相加」,它自己又是沿用
 * `combat/evasion.ts` 的 `abilityEvasionOf`。再發明第三條仲裁規則才是缺陷。
 *
 * 所以:`amount = base × max(critDamage, damageMult)`。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ④ 吸血:為什麼是**封包上的一個覆寫**,而不是暴擊時再讀一次屬性
 *
 * 傷害在**佇列**裡結算,而暴擊是在**揮擊**的時候骰的(`BasicAttackSystem` 近戰、
 * 同一個值被塞進投射物給遠程)。所以「這一發是不是那個 proc」只有揮擊那一刻
 * 知道,結算時已經沒有人記得 —— 除非它跟著封包走。這就是
 * `DamagePacket.critLifesteal` 與 `ProjectileComp.critLifesteal` 存在的全部理由,
 * 也是為什麼**遠程半邊必須被明確接上**:`damageTypeOverride.ts` 的檔頭記著同一個
 * 陷阱(「普攻自己就有兩個 push 站點」),而在那之前有一份 authoringNote 就是
 * 因為只想到近戰而寫錯了實作方式。
 *
 * `lifestealMode` 是第二個決策點:100% 是**取代**持有者原本的吸血,還是**疊加**。
 * 預設 `"replace"`,因為 `Stat.Lifesteal` 的上限是 0.8,而 `1.0 > 0.8`,所以
 * 「取代」對持有者永遠不會是損失,同時嚴格小於「疊加」。
 *
 * ⚠️ 吸血的基數沿用既有那一段的基數 —— **真的從血條掉下來的量**(`dmg`,
 * 過了護盾與格擋),不是 `impact`。沒有新增第三種讀法:一個「打在滿護盾上還回滿血」
 * 的吸血是另一個機制。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⑤ 事件:一個都不用新增
 *
 * 這個 proc 走的是**既有的暴擊通道**:`crit: true` 已經在 `basicAttack` /
 * `basicAttackHit` / `damage` 三個事件上,`hitFeel.deriveCosmetics` 已經把 crit
 * 當成最高的 `ImpactTier`(更長的 hitstop、更重的震動),`combatText` 已經畫暴擊
 * 數字。吸血那一半走的是 `healTarget(origin:"lifesteal")`,而 `heal` 也早就在
 * `net/eventFanout.ts` 的 fanned-out 清單裡。
 *
 * 所以 `apps/game-server/src/net/eventFanout.ts` **不用動**,而這不是省事:
 * 那份清單的檔頭自己列著 `evade`/`explosion`/`buffApply` 曾經「做完、測過、出貨,
 * 然後在遊戲裡不存在」。借一條已經有真正消費者的線,比新增一個沒有人畫的事件安全。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⑥ 決定性
 *
 * 骰子一律走 `world.rng.chance`(播種、狀態折進 `SimWorld.digest()`);沒有
 * `Math.random`、沒有時鐘、沒有三角函式、沒有 `**`;唯一的迭代是插入序的
 * `sc.sources` 陣列。
 *
 * **ZERO GUARANTEE**:身上沒有任何一個活著的 `critStrike` 來源時,
 * {@link critStrikeFor} 在**碰 rng 之前**就回 `null`,`rollCritStrike` 因此一次
 * 亂數都不抽。所以在內容填進來之前每一份既有 replay 與 digest 逐位元不變。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";

/**
 * 這個 grant 的加成套用在**哪些**暴擊上 —— 見檔頭 ②。
 *
 * · `"ownProcOnly"`(省略時的預設)—— 只有這個 grant 自己抽中的那一發。
 * · `"everyCrit"`   —— 這一發只要是暴擊就算,包含英雄自己 `Stat.CritChance` 的。
 */
export type CritStrikeScope = "ownProcOnly" | "everyCrit";

/** 100% 吸血是**取代**持有者的 `Stat.Lifesteal`,還是**加在上面** —— 見檔頭 ④。 */
export type CritStrikeLifestealMode = "replace" | "add";

/**
 * 一個來源(道具/技能/buff)授予的暴擊 proc。
 *
 * 五根軸各自對應文案裡真的被寫出來的一個決定;沒有任何一根是為了未來想像出來的。
 * 數字欄位上下界都有,而且每一個都擋一種真的會發生的誤植 —— 見
 * `content/schema/item.ts` 的 `zItemCritStrike`。
 */
export interface CritStrikeGrant {
  /** 觸發機率 0..1。天堂之劍 = `0.06`(文案的「6%機率」)。 */
  chance: number;
  /**
   * 抽中時這一發的**總**倍率(不是加在 `critDamage` 上的增量)。
   * 天堂之劍 = `10`(文案的「10倍暴擊傷害」)。
   *
   * 和英雄自己的 `Stat.CritDamage` **取 max,不相乘** —— 見檔頭 ③。
   */
  damageMult: number;
  /**
   * 抽中時吸回**真的從血條掉下來的量**的幾成 0..1。
   * 天堂之劍 = `1`(文案的「吸血回復100%傷害」)。
   */
  lifestealFraction: number;
  /** 套用範圍,見 {@link CritStrikeScope}。省略 = `"ownProcOnly"`。 */
  empowers?: CritStrikeScope;
  /** 吸血怎麼結合既有吸血,見 {@link CritStrikeLifestealMode}。省略 = `"replace"`。 */
  lifestealMode?: CritStrikeLifestealMode;
}

/**
 * 這一發要怎麼打 —— {@link rollCritStrike} 的回傳。
 *
 * `critLifesteal` 是 `undefined` 表示「這一發沒有 proc」,而**不是** 0:0 是一個
 * 合法的值(一個 `lifestealFraction: 0` 的 grant),兩者必須分得開,否則
 * `damage.ts` 的 `??` 會把「沒 proc」讀成「吸 0%」並蓋掉持有者原本的吸血。
 */
export interface CritStrikeRoll {
  crit: boolean;
  amount: number;
  critLifesteal?: number;
}

/** [0,1] 夾取(同時擋掉 NaN)—— `chance` / `lifestealFraction` 的執行期上下界。 */
function clamp01(v: number): number {
  if (!(v > 0)) return 0;
  return v > 1 ? 1 : v;
}

/**
 * 這個單位身上**最好的**一個 `critStrike` 來源,`null` = 一個都沒有。
 *
 * 「最好」= **`chance × damageMult` 最大者**(期望增益),同值時取 `sc.sources`
 * 陣列裡靠前的那一個。`sc.sources` 是插入序陣列、每個 replica 一致,所以不需要
 * 排序正規化。
 *
 * ⚠️ 2026-07-31 更正(第三守則):這裡本來寫「和 `combat/block.ts` 的
 * `blockCutFor` 同一條」。**已經不是了** —— owner 裁決格擋改成鏈式獨立判定
 * (`sim/blockRules.ts`,`stacking: "independent"`),`chance × fraction` 這個
 * 排名指標在那邊只剩 `best` 模式在用。
 *
 * 這邊**維持**取最好的一個,而且刻意不順手跟著改:owner 的裁決講的是格擋,
 * 沒有講暴擊。今天全 `content/items/` 只有天堂之劍 (godie-i01n) 一支帶
 * `critStrike`,所以「兩支疊起來」在出貨內容裡是 0 筆(它**不是** `unique`,
 * 所以兩把同名武器買得到 —— 但兩把同樣的 grant 在這個指標下和一把等價)。
 * 第二支一旦上架,「暴擊 proc 多來源怎麼算」就變成 owner 已經替格擋答過的
 * 同一題,那時它應該和 `blockStacking` 一樣變成一個欄位,而不是繼續躺在這裡。
 *
 * ⚠️ 這個函式**不碰 rng** —— 它就是 ZERO GUARANTEE 的所在地。
 */
export function critStrikeFor(world: SimWorld, id: EntityId): CritStrikeGrant | null {
  const sc = world.stats.get(id);
  if (!sc) return null;
  let best: CritStrikeGrant | null = null;
  let bestWeight = 0;
  for (const src of sc.sources) {
    const g = src.critStrike;
    if (g === undefined) continue;
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
    const weight = clamp01(g.chance) * (g.damageMult > 0 ? g.damageMult : 0);
    // 嚴格大於 ⇒ 同分取陣列裡靠前的那一個 ⇒ 每個 replica 選到同一個來源。
    if (weight > bestWeight) {
      bestWeight = weight;
      best = g;
    }
  }
  return bestWeight > 0 ? best : null;
}

/**
 * 把「這一發普攻」交給 [暴擊吸血] 判一次。
 *
 * @param baseAmount  **沒有**乘任何暴擊倍率的攻擊力
 * @param amount      已經算好的傷害(英雄自己的暴擊已經乘進去了,或沒有)
 * @param crit        英雄自己的暴擊骰結果
 *
 * 恰好消耗 **1 次** rng draw,而且只在真的有一個合格來源時;沒有來源時 0 次
 * (見檔頭 ⑥ ZERO GUARANTEE),所以既有 replay 逐位元不變。
 */
export function rollCritStrike(
  world: SimWorld,
  attacker: EntityId,
  baseAmount: number,
  amount: number,
  crit: boolean,
): CritStrikeRoll {
  const g = critStrikeFor(world, attacker);
  if (g === null) return { crit, amount };

  const procced = world.rng.chance(clamp01(g.chance));
  // `"everyCrit"` 讓英雄自己骰出來的暴擊也吃這個 grant;`"ownProcOnly"`(預設)
  // 只認這個 grant 自己抽中的那一發。這一行就是檔頭 ② 的整個決策點。
  const empowered = procced || ((g.empowers ?? "ownProcOnly") === "everyCrit" && crit);
  if (!empowered) return { crit, amount };

  // 取 max,不相乘(檔頭 ③)。`baseAmount × damageMult` 比較的對象是**已經**算好
  // 的 `amount`,所以英雄自己的 critDamage 比 10 倍還高時他保留自己的數字。
  const boosted = baseAmount * g.damageMult;
  return {
    crit: true,
    amount: boosted > amount ? boosted : amount,
    critLifesteal: clamp01(g.lifestealFraction),
  };
}

/**
 * 這一發實際要吸多少比例 —— `combat/damage.ts` 的吸血段唯一的入口。
 *
 * @param statLifesteal 持有者的 `Stat.Lifesteal`(已經過 clamp 的最終值)
 * @param critLifesteal 封包帶來的 proc 吸血比例,`undefined` = 這一發沒 proc
 *
 * ⚠️ `mode` 讀的是**當下**身上那個 grant,不是封包 —— 兩者只可能在「揮擊之後、
 * 結算之前把裝備賣掉」的那一格分歧,而那一格賣掉的人本來就不該再拿到 proc 的
 * 100%。取不到 grant 時退回 `"replace"`,也就是文案的字面讀法。
 */
export function effectiveLifesteal(
  world: SimWorld,
  attacker: EntityId,
  statLifesteal: number,
  critLifesteal: number | undefined,
): number {
  if (critLifesteal === undefined) return statLifesteal;
  const mode = critStrikeFor(world, attacker)?.lifestealMode ?? "replace";
  if (mode === "add") return statLifesteal + critLifesteal;
  return critLifesteal;
}
