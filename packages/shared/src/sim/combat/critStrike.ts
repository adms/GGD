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
 * ③ 多個倍率同時成立時 —— **每一條獨立骰、倍率依序相乘**(owner 2026-08-09)
 *
 * owner 逐字(GH#302):
 *
 *   「我同時獲得 1%機率 100倍 以及 10%機率 2倍暴擊傷害,這樣我會有三種結果,
 *     100x2=200、100、2倍,**因為是每一條暴擊獨立算完傷害再帶入下一條**」
 *
 * 所以一發攻擊上的每一條暴擊來源(英雄自己的 `Stat.CritChance`,加上每一個
 * 來源攜帶的 grant)**各抽各的骰**,抽中的把自己的倍率乘進總倍率。
 *
 * ⚠️ **這一段在 2026-08-09 之前寫的是「取 max,不相乘」**,而且附了一整段論證:
 * 「這個 repo 對同類乘數已經有一條規則(`block.ts` ⑤ 的取 max),再發明第三條
 * 仲裁規則才是缺陷」。那段論證**被 owner 推翻了,所以它整段不見了** ——
 * CLAUDE.md 第三守則:一個活得比它描述的行為還久的辯護,比沒有註解更糟。
 *
 * ⭐ 新規則的理由,以及**為什麼暴擊與格擋/迴避本來就不該同一條**:
 * 暴擊是**肉鴿三選一會發的東西**。取 max 的世界裡,玩家的第二張暴擊卡是廢牌 ——
 * 撿到它畫面上什麼都不會變,而那是這個模式最不能有的手感。格擋/迴避是**防守側
 * 的保命率**,兩件疊起來趨近 100% 本來就該收斂(不然就沒有人打得死你);
 * 暴擊是**進攻側的爆發**,它的樂趣就在疊起來會炸。兩條仲裁規則並存不是缺陷,
 * 前提是兩條**各自寫得出自己的理由** —— 這一段就是暴擊那一條的理由。
 *
 * ⛔ 而且「怎麼算」本身是**後台的一格下拉**,不是這裡的一個決定:
 * `sim/critRules.ts` 的 `stackMode`(`multiply` 出貨 / `max` 舊行為 / `add`),
 * 外加 `maxTotalMult`(總倍率上限,出貨 100)與 `sourceCap`(最多算幾條,出貨 5)。
 * owner 2026-08-09:「暴擊計算方式 上限 這些參數都要能後台彈性設定」。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③-b 決定性的代價:**抽幾次骰變成「身上有幾條暴擊」的函式**
 *
 * `multiply` / `add` 下,每一條合格的 grant 都自己抽一次 `world.rng.chance`。
 * 舊行為是**整發只抽一次**(只有最強的那一條參與)。所以同一顆種子的**既有錄影
 * 對不上** —— owner 選了接受這個代價(錄影只在同一個版本內有效)。
 *
 * ⚠️ 但它**不是無界的**:`sourceCap`(出貨 5)給了每一次攻擊的 draw 次數一個
 * 上界 —— 最多 1 次(英雄自己的暴擊率,由 `BasicAttackSystem` 抽)加上 `sourceCap`
 * 次,出貨設定下 ≤ 6。所以決定性沒有變差,變的只是同一顆種子對應的那一串結果。
 *
 * ⚠️ **ZERO GUARANTEE 仍然成立**:身上一條 grant 都沒有時這裡一次都不抽
 * (見 ⑥),而出貨內容只有天堂之劍一支帶 `critStrike` —— 也就是說絕大多數既有
 * 錄影其實逐位元不變,會變的只有「真的帶了兩把以上暴擊武器」的那些。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③-c 超出 `sourceCap` 時**丟掉哪幾條** —— 明確且決定性
 *
 * 照**期望增益 `chance × damageMult` 由大到小**排序,取前 `sourceCap` 條;
 * 同分時取 `sc.sources` 插入序靠前的那一個。⛔ 不是插入序取前 N ——
 * 那會讓「剛買到的那把最強的劍」被上限吃掉,而畫面上完全看不出來。
 * 這個排名指標不是新發明的:`critStrikeFor` 從第一天就用它挑「最好的一條」。
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
 * `sc.sources` 陣列,以及它排序之後的複本 —— 比較器是「權重降序 + 插入序升序」,
 * 插入序唯一,所以那是一個**全序**,不靠 `Array.prototype.sort` 穩不穩定。
 *
 * **ZERO GUARANTEE**:身上沒有任何一個活著的 `critStrike` 來源時,
 * {@link critStrikeFor} 在**碰 rng 之前**就回 `null`,`rollCritStrike` 因此一次
 * 亂數都不抽。所以在內容填進來之前每一份既有 replay 與 digest 逐位元不變。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { CritRules } from "../critRules";

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
   * 抽中時**這一條**貢獻的倍率(不是加在 `critDamage` 上的增量)。
   * 天堂之劍 = `10`(文案的「10倍暴擊傷害」)。
   *
   * ⚠️ 它是「這一條」不是「這一發」:出貨的 `stackMode: "multiply"` 下,它會和
   * 英雄自己的 `Stat.CritDamage`、以及其他抽中的 grant **相乘** —— 見檔頭 ③。
   * (2026-08-09 以前這裡寫的是「取 max,不相乘」。)
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

/** 一條**合格**的來源,連同它的排序鍵。 */
interface RankedGrant {
  g: CritStrikeGrant;
  /** 期望增益 `chance × damageMult` —— 排序的主鍵(降序)。 */
  weight: number;
  /** `sc.sources` 的插入序 —— 排序的次鍵(升序),唯一,所以比較器是全序。 */
  order: number;
}

/**
 * 這一發**有資格參與**的暴擊來源,已經照期望增益由大到小排好。
 *
 * 合格 = 有 `critStrike`、還沒過期、而且 `chance × damageMult > 0`。
 * 最後那一條就是 ZERO GUARANTEE 的真正所在地:一個 `chance: 0`(或
 * `damageMult: 0`)的 grant 永遠不可能改變任何東西,所以它連骰都不該抽。
 *
 * ⚠️ **這個函式不碰 rng,也不讀 `critRules`** —— 上限與模式是呼叫端的事,
 * 它只負責「誰有資格、誰排前面」。分開是為了讓 `critStrikeFor`(吸血那一半在用)
 * 與 `rollCritStrike`(傷害那一半)問的是**同一個排名**,不會漂成兩套。
 */
function rankedGrants(world: SimWorld, id: EntityId): RankedGrant[] {
  const sc = world.stats.get(id);
  if (!sc) return [];
  const out: RankedGrant[] = [];
  let order = 0;
  for (const src of sc.sources) {
    order++;
    const g = src.critStrike;
    if (g === undefined) continue;
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
    const weight = clamp01(g.chance) * (g.damageMult > 0 ? g.damageMult : 0);
    if (weight <= 0) continue;
    out.push({ g, weight, order });
  }
  // 權重降序 + 插入序升序。`order` 唯一 ⇒ 全序 ⇒ 不依賴 sort 的穩定性,
  // 每個 replica 得到逐位元相同的順序(檔頭 ⑥)。
  out.sort((a, b) => (b.weight === a.weight ? a.order - b.order : b.weight - a.weight));
  return out;
}

/**
 * 這個單位身上**最好的**一個 `critStrike` 來源,`null` = 一個都沒有。
 *
 * 「最好」= **`chance × damageMult` 最大者**(期望增益),同值時取 `sc.sources`
 * 陣列裡靠前的那一個。
 *
 * ⚠️ 2026-08-09 之後它**不再是傷害那一半的入口**(owner 推翻了「只算最好的
 * 那一條」,見檔頭 ③)。它現在只剩兩個用途:`stackMode: "max"` 那一條回滾路徑,
 * 以及 {@link effectiveLifesteal} 讀 `lifestealMode`。
 *
 * ⚠️ 這個函式**不碰 rng**。
 */
export function critStrikeFor(world: SimWorld, id: EntityId): CritStrikeGrant | null {
  return rankedGrants(world, id)[0]?.g ?? null;
}

/** 這一條 grant 這一發吃不吃得到 —— 檔頭 ② 的整個決策點,兩條路徑共用。 */
function empoweredBy(g: CritStrikeGrant, procced: boolean, ownCrit: boolean): boolean {
  // `"everyCrit"` 讓英雄自己骰出來的暴擊也吃這個 grant;`"ownProcOnly"`(預設)
  // 只認這個 grant 自己抽中的那一發。
  return procced || ((g.empowers ?? "ownProcOnly") === "everyCrit" && ownCrit);
}

/** 這一條 grant 貢獻的倍率。<= 0 的誤植當成 1(不影響),不是當成 0(歸零傷害)。 */
function multOf(g: CritStrikeGrant): number {
  return g.damageMult > 0 ? g.damageMult : 1;
}

/** 總倍率的天花板 —— `critRules.maxTotalMult`,夾的是**合成之後**的那一個。 */
function capTotal(mult: number, rules: CritRules): number {
  return mult > rules.maxTotalMult ? rules.maxTotalMult : mult;
}

/**
 * 把「這一發普攻」交給暴擊系統結算 —— 英雄自己那一條與每一條 grant 一起。
 *
 * @param baseAmount  **沒有**乘任何暴擊倍率的攻擊力
 * @param ownCritMult 英雄自己 `Stat.CritChance` 骰出來的倍率;**沒暴擊時 = 1**
 * @param ownCrit     英雄自己的暴擊骰結果(骰在 `BasicAttackSystem`,不在這裡)
 *
 * ⚠️ 2026-08-09 之前第四個參數是**已經算好的 `amount`**。改成倍率是因為新規則
 * 要把每一條的倍率相乘,而從 `amount` 反推倍率要除以 `baseAmount` —— 一個
 * `baseAmount === 0` 的攻擊會得到 NaN,而 NaN 傷害在畫面上就是「這一刀沒打到」。
 *
 * rng 消耗(檔頭 ③-b):`multiply` / `add` 每一條合格 grant 各 1 次、最多
 * `critRules.sourceCap` 次;`max` 恰好 1 次(舊行為);一條合格 grant 都沒有時
 * **0 次**(ZERO GUARANTEE),所以那些場次的既有 replay 逐位元不變。
 */
export function rollCritStrike(
  world: SimWorld,
  attacker: EntityId,
  baseAmount: number,
  ownCritMult: number,
  ownCrit: boolean,
): CritStrikeRoll {
  const rules = world.critRules;
  const ranked = rankedGrants(world, attacker);
  // ZERO GUARANTEE —— 在碰 rng 之前就走人。
  if (ranked.length === 0) {
    return { crit: ownCrit, amount: baseAmount * capTotal(ownCritMult, rules) };
  }

  if (rules.stackMode === "max") {
    // 回滾路徑:只有最強的那一條參與,**整發只抽一次**。連 draw 次數都跟舊行為
    // 一樣是刻意的 —— 合成規則回去了但每發抽兩次骰的話,兩件暴擊武器的觸發率
    // 仍然被改掉了,那不是回滾,是第三種行為(見 `critRules.ts` 的 `CritStackMode`)。
    const g = ranked[0]!.g;
    const procced = world.rng.chance(clamp01(g.chance));
    if (!empoweredBy(g, procced, ownCrit)) {
      return { crit: ownCrit, amount: baseAmount * capTotal(ownCritMult, rules) };
    }
    const m = ownCritMult > multOf(g) ? ownCritMult : multOf(g);
    return {
      crit: true,
      amount: baseAmount * capTotal(m, rules),
      critLifesteal: clamp01(g.lifestealFraction),
    };
  }

  // ── multiply(出貨)/ add ──────────────────────────────────────────────
  // 每一條**各抽各的骰**,抽中的把自己的倍率帶進來(owner 2026-08-09)。
  const cap = ranked.length < rules.sourceCap ? ranked.length : rules.sourceCap;
  const multiply = rules.stackMode === "multiply";
  // `add` 是「有貢獻的那幾條相加」,所以它要數有幾條在貢獻:一條都沒有時總倍率
  // 是 1(不暴擊),不是 0(這一刀不痛)。`multiply` 用 1 當單位元就沒有這個問題。
  let product = ownCrit ? ownCritMult : 1;
  let sum = ownCrit ? ownCritMult : 0;
  let contributors = ownCrit ? 1 : 0;
  let anyGrant = false;
  let critLifesteal: number | undefined;
  for (let i = 0; i < cap; i++) {
    const g = ranked[i]!.g;
    const procced = world.rng.chance(clamp01(g.chance));
    if (!empoweredBy(g, procced, ownCrit)) continue;
    anyGrant = true;
    product *= multOf(g);
    sum += multOf(g);
    contributors++;
    // 吸血跟著**最強的那一條吃得到的 grant**走(`ranked` 已排序,所以是第一條)。
    // 多條同時 proc 時不相加:吸血的基數是「真的掉下來的血」,兩條 100% 相加
    // 等於回兩倍的傷害量,那是另一個機制。
    if (critLifesteal === undefined) critLifesteal = clamp01(g.lifestealFraction);
  }

  const total = multiply ? product : contributors === 0 ? 1 : sum;
  return {
    crit: ownCrit || anyGrant,
    amount: baseAmount * capTotal(total, rules),
    ...(critLifesteal !== undefined ? { critLifesteal } : {}),
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
