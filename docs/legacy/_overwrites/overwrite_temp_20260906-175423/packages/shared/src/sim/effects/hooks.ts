/**
 * Hook dispatch — event-driven effects from ModifierSources (champion passives,
 * item passives, augments). Hooks run inline at emit time; any damage they
 * produce goes into the damage queue (resolved by combatResolveSystem's bounded
 * multi-pass drain), keeping ordering deterministic.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { HookDef, HookEvent } from "../stats/modifiers";
import { liveAttribute } from "../stats/attrSources";
import { runEffects } from "./effectRunner";
import type { CastableSlot } from "../intents";
import { requirementScale, scaleEffects } from "../content/requirement";
import { evaluateCondition } from "../content/condition";
import type { TriggerDamage } from "./effect";
import { originInScope } from "../combat/damageTypeOverride";
// ⭐ S6 `onConsumed: "detachSource"` 的出口。`stats/statPipeline.ts` 不 import 這支，
// 所以這條邊不成環（`effectKind.ts` 檔頭那個 runtime-undefined 陷阱在這裡不成立）。
import { detachSource } from "../stats/statPipeline";
import { NEVER_FIRED, hookIcdTicks } from "./hookIcd";

/**
 * 全隊作用域 —— every CHAMPION on `owner`'s team, ALIVE OR DEAD, owner included,
 * in ascending entity-id order. THE resolution of `HookDef.target: "allies"`
 * (天生牙 godie-i031's 「我方所有英雄」/「我們全部英雄」); the membership rules and
 * why the dead are in it are argued on that field in `stats/modifiers.ts`.
 *
 * ⚠️ SORTED. `world.champion` is a Map, and `sim/purity.test.ts` bans relying on
 * its iteration order: without the sort, 「哪一個隊友先被治療」 (and therefore who
 * gets the last point of an overheal-clamped heal) would depend on spawn order.
 *
 * A body with no `TeamComp` — the client's prediction shadow world, a bare test
 * entity — has no team, so it gets an EMPTY list rather than "everybody". An
 * empty target list makes every effect kind a no-op, which is the correct
 * reading of 「我方」 for someone who is on no side.
 */
export function alliedChampions(world: SimWorld, owner: EntityId): EntityId[] {
  const team = world.team.get(owner);
  if (!team) return [];
  const out: EntityId[] = [];
  for (const [id] of world.champion) {
    if (world.team.get(id)?.teamId !== team.teamId) continue;
    out.push(id);
  }
  out.sort((a, b) => a - b);
  return out;
}

/**
 * `HookDef.victim` 的閘 —— 「那個實體符不符合這條 hook 要的身分」。
 *
 * 純函式,**沒有 rng、沒有時鐘**,所以它可以(而且必須)坐在 ICD 閘與機率骰
 * 之前:被它擋掉的一發不可以燒掉持有者的冷卻,也不可以動到 seed。
 *
 * ── 三個「比隊伍」的成員(批 1)──────────────────────────────────────────
 * `world.team.get()` 回 `undefined` 時**一律不通過**。這不是保守的隨手選擇,
 * 是與 {@link alliedChampions} 同向的一條政策:客戶端的預測影子世界裡的身體
 * 沒有 `TeamComp`,而「不知道你站哪一邊」若被讀成「你是敵人」,預測端就會跑出
 * 一份伺服器沒有的觸發 —— 那是一個玩家看得到、而且只在網路上出現的分歧。
 *
 * ── `mobsCountAsEnemy` 只動 `"enemyChampion"` ────────────────────────────
 * `"allyChampion"` 不受影響(殭屍永遠不是隊友);`"enemy"` 本來就收。
 * 全域覆寫存在的理由與它為什麼不是單一布林,見 `sim/augmentEnemyFilter.ts`。
 */
function victimPasses(
  world: SimWorld,
  owner: EntityId,
  victim: HookDef["victim"],
  target: EntityId,
): boolean {
  switch (victim) {
    // Positive tests on BOTH sides: a neutral that is neither (a guardian,
    // a flower) matches neither filter, which is the honest reading of the
    // field name.
    case "mob":
      return world.mob.has(target);
    case "champion":
      return world.champion.has(target);
    case "enemyChampion":
      // ⚠️ `sameTeam(...) !== false` → `=== false` 是 `"champion"` 與
      // `"enemyChampion"` 的**全部**差別。拿掉隊伍比較,13 個寫著「敵方英雄」
      // 的 hook 位置會被隊友的身體觸發,而畫面上跟正常一模一樣。
      return (
        sameTeam(world, owner, target) === false &&
        (world.champion.has(target) ||
          (world.augmentEnemyFilter.mobsCountAsEnemy && world.mob.has(target)))
      );
    case "allyChampion":
      return sameTeam(world, owner, target) === true && world.champion.has(target);
    case "enemy":
      return sameTeam(world, owner, target) === false;
    default:
      return true;
  }
}

/**
 * 兩個身體同不同隊 —— `undefined` = **至少一邊沒有 `TeamComp`**,也就是
 * 「不知道」,而不是「不同隊」。
 *
 * 三個呼叫端都拿 `=== true` / `=== false` 比,所以「不知道」對三個成員一律
 * 是不通過。這個三態是刻意的:寫成 boolean 的話,客戶端預測影子世界裡那些
 * 沒有隊伍的身體會被歸進「不同隊」= 敵人,於是預測端跑出一份伺服器沒有的
 * 觸發。方向與 {@link alliedChampions}(沒有隊伍 → 空名單)一致。
 */
function sameTeam(world: SimWorld, a: EntityId, b: EntityId): boolean | undefined {
  const ta = world.team.get(a);
  const tb = world.team.get(b);
  if (!ta || !tb) return undefined;
  return ta.teamId === tb.teamId;
}

/**
 * `HookDef.damageSource` 的閘 —— 「觸發這一次的那一發封包是什麼來路」。
 *
 * ⛔ `"ability"` / `"other"` 走 `combat/damageTypeOverride.ts` 的
 * {@link originInScope},**不是**第二份 `startsWith("ability:")`。兩份就會有
 * 兩種「什麼算技能傷害」,而它們分歧的那一天,惡夢魔王碎片(`scope:"ability"`)
 * 與這個欄位會對同一發封包給出不同的答案。
 */
function damageSourcePasses(want: NonNullable<HookDef["damageSource"]>, origin: string): boolean {
  const isBasic = originInScope(origin, "basic");
  switch (want) {
    case "basic":
      return isBasic;
    case "nonBasic":
      return !isBasic;
    case "ability":
      return originInScope(origin, "ability");
    case "other":
      return !isBasic && !originInScope(origin, "ability");
    default:
      return true;
  }
}

/**
 * 這條 hook 這一次的內部冷卻該記在哪一格 —— `internalCooldownScope` 的全部。
 *
 * `"source"`(省略 = 這一個)回 `hookLastFired[hi]`,也就是這個欄位出現之前
 * 每一份文件走的那一格。`"perAbilitySlot"` 回該槽位自己的一格,而**沒有槽位的
 * 事件**(`onDamageDealt` / `onBasicAttack` / `onInterval` …)共用 `""` 那一格
 * —— 那正是欄位說明裡寫的「退化成全域」。
 */
const ICD_NO_SLOT_KEY = "";

// ⭐ S3 —— sentinel 與 ICD 換算搬到 `effects/hookIcd.ts`（見上面的 import）。
// 行為逐位元不變；搬家的理由是 `effects/modifyCooldown.ts` 要寫的正是這裡讀的
// 那一格，而它**不可以** import 這支（那個環的危害寫在 hookIcd.ts 的檔頭）。

/**
 * 這個 hook 這一次的觸發門檻,`undefined` = 不用抽(必定通過)。
 *
 * ONE draw or ZERO draws, exactly as before this function existed:
 *   · 兩個欄位都沒有 → `undefined` → 不抽(今天絕大多數 hook)
 *   · `chance` → 那個常數(每一份既有文件走這條,值與位置都沒變)
 *   · `chanceFrom` → `clamp(flat + 三圍 × coeff, min, max)`
 *     ⭐ GH#1054 —— `flat` 是常數項（96-01 華山劍法 j:44815「(5 + 敏捷/15)%」）。
 *     缺席 = 0 ⇒ 這一行對每一份既有文件（朗基努斯之槍）算出**同一個**門檻。
 *
 * ⚠️ 讀不到三圍的身體(不是英雄)只剩常數項:一件掛在部隊或召喚物身上的武器沒有
 * 敏捷可言,而在資料缺席時發最大獎是這一族最容易出的錯。沒有 `flat` 時那就是
 * `clamp(0)` = `min`,與這一格出現之前逐位元相同。
 *
 * PURE —— 沒有 rng(骰子在呼叫端),沒有時鐘。所以每個複本算出同一個門檻。
 */
function hookProcChance(world: SimWorld, owner: EntityId, hook: HookDef): number | undefined {
  const from = hook.chanceFrom;
  if (from === undefined) return hook.chance;
  const live = liveAttribute(world, owner, from.attr, from.basis ?? "total") ?? 0;
  return Math.min(from.max, Math.max(from.min, (from.flat ?? 0) + live * from.coeff));
}

/**
 * ⭐ S6【一次性觸發器】—— `maxTriggers` / `consumeOn` / `onConsumed` / `perTarget`
 * 的那一格帳本。15-04 卡上寫「**下一次**普攻」，而實測連續兩次 `onBasicAttack`
 * 各打了一發 119.80 —— 缺的不是數值，是**次數**這個概念本身。
 *
 * ⛔ 不可以用「掛一個 duration 極短的增益」假裝一次性：那是**時間**界不是次數界，
 * 攻速一高就會吃到兩次，而畫面上跟正確的一模一樣（失敗形態④）。
 *
 * `perTarget` 那一半只有**帶對象**的事件談得上（`onInterval` 由 schema 擋在載入
 * 期），所以這裡 `target === undefined` 一律退回共用的那一格。
 */
function triggersUsed(
  src: { hookFireCount?: number[]; hookFireCountByTarget?: (Map<EntityId, number> | undefined)[] },
  hi: number,
  perTarget: boolean,
  target: EntityId | undefined,
): number {
  if (perTarget && target !== undefined) return src.hookFireCountByTarget?.[hi]?.get(target) ?? 0;
  return src.hookFireCount?.[hi] ?? 0;
}

/** 扣掉一次額度，回傳扣完之後的用量。 */
function consumeTrigger(
  src: {
    hooks?: unknown[];
    hookFireCount?: number[];
    hookFireCountByTarget?: (Map<EntityId, number> | undefined)[];
  },
  hi: number,
  perTarget: boolean,
  target: EntityId | undefined,
  used: number,
): number {
  const n = used + 1;
  if (perTarget && target !== undefined) {
    if (!src.hookFireCountByTarget) src.hookFireCountByTarget = new Array(src.hooks?.length ?? 0);
    let m = src.hookFireCountByTarget[hi];
    if (!m) {
      m = new Map<EntityId, number>();
      src.hookFireCountByTarget[hi] = m;
    }
    m.set(target, n);
    return n;
  }
  if (!src.hookFireCount) src.hookFireCount = new Array(src.hooks?.length ?? 0).fill(0);
  src.hookFireCount[hi] = n;
  return n;
}

export function fireHooks(
  world: SimWorld,
  owner: EntityId,
  event: HookEvent,
  target?: EntityId,
  abilitySlot?: CastableSlot,
  /**
   * 觸發這一次的那一發傷害 —— 只有 `combatResolveSystem` 的兩個呼叫點會傳
   * (`onDamageDealt` / `onDamageTaken`,同一發封包的兩個視角)。
   *
   * 它一路傳進 `EffectContext.incoming`,是 `damage.incomingPct`(反彈)唯一的
   * 資料來源:`zScaling` 只讀得到 CASTER 的屬性表,「剛剛那一下的 200%」在此之前
   * 完全寫不出來。順便也是 `HookDef.damageSource`(普攻/非普攻)的資料來源。
   */
  incoming?: TriggerDamage,
  /**
   * 這一次呼叫允不允許在**持有者已經死了**的時候發動 —— 省略 = 不允許,
   * 也就是這個參數出現之前每一個呼叫點走的那一條路。
   *
   * ⚠️ 下面那道存活閘不是可有可無的:一個躺在地上的人,他的道具被動、光環、
   * 反彈、`onDamageTaken` 都不該繼續作用(屍體照樣會被 AoE 掃到,所以那些事件
   * 真的還在發)。⛔ 所以這不是一個「關掉存活閘」的全域開關,而是**逐事件**的
   * 一格 —— 誰有資格開,由 `systems/WorldHookSystem.ts` 那張表上的
   * `firesWhenOwnerDead` 決定,今天只有【死亡時】那一列填了 true。
   *
   * ⛔ 也不可以寫成 `if (event === "onDeath")`:那是「為某一個技能/事件寫一個
   * if」的形狀(CLAUDE.md 第〇·五守則),下一個「陣亡後遺留」的時刻就要再寫一個。
   * 表格說話,這裡只認參數。
   */
  firesWhenOwnerDead?: boolean,
  /**
   * ⭐ 45-00 —— 這一次呼叫只跑**通過這個謂詞**的 hook。省略 = 全部（＝這個參數
   * 出現之前每一個呼叫點走的那一條路，逐位元不變）。
   *
   * 存在的理由只有一個：`incomingPct.negateOriginal`（反彈免傷）必須在**扣血
   * 之前**判定，而其餘的 `onDamageTaken` 必須在扣血**之後**才讀得到 `hpLost`。
   * 於是 `combat/damage.ts` 用同一個事件呼叫兩次，各自帶一個互補的謂詞 ——
   * **一條 hook 只會被其中一次收到**，所以沒有「同一條發兩次」的可能。
   *
   * ⛔ 位置在最上面（緊跟 `hook.on`），與 `victim` / `damageSource` 同一族：
   * 純函式、無 rng、無時鐘。被它擋掉的一發不可以燒 ICD、不可以動 seed，
   * 否則兩次呼叫會各抽一次籤，而一支免傷反彈的機率就變成了兩倍。
   */
  hookFilter?: (hook: HookDef) => boolean,
): number {
  let fired = 0;
  const sc = world.stats.get(owner);
  if (!sc) return fired;
  const ownerHp = world.health.get(owner);
  // #293 —— 在此之前這一行沒有 `firesWhenOwnerDead`,而 `DeathSystem` 是**先**寫
  // `hp.alive = false` 再 `emit("death")` 的,所以 `onDeath` 在出貨路徑上一次都
  // 發不出來(失敗形態②:做了但沒有人收得到)。
  if (ownerHp && !ownerHp.alive && !firesWhenOwnerDead) return fired;

  /** ⭐ S6 —— `onConsumed: "detachSource"` 的待卸清單（見迴圈之後那一行）。 */
  let detachAfter: string[] | undefined;

  for (const src of sc.sources) {
    if (!src.hooks) continue;
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
    if (!src.hookLastFired) src.hookLastFired = new Array(src.hooks.length).fill(NEVER_FIRED);

    for (let hi = 0; hi < src.hooks.length; hi++) {
      const hook = src.hooks[hi]!;
      if (hook.on !== event) continue;
      // ⭐ 45-00 —— 呼叫端的互補謂詞（見上）。rng-FREE，所以擋在 ICD 與骰子前面。
      if (hookFilter !== undefined && !hookFilter(hook)) continue;
      if (hook.abilitySlot && hook.abilitySlot !== abilitySlot) continue;
      // #244 — WHAT died / was hit. Absent or "any" = no filter, so every
      // pre-#244 hook is untouched. An entity-less event never filters.
      //
      // 批 1 (2026-08-04) 把 union 從「是什麼」加寬到「站在哪一邊」
      // (enemyChampion / allyChampion / enemy),判斷搬進 `victimPasses`。
      // ⛔ 位置一個字都沒動 —— 它必須留在 ICD 閘與機率骰**之前**(理由與下方
      // `requires` 那一段完全相同:被擋掉的一發不可以燒 ICD、不可以動 seed)。
      if (hook.victim !== undefined && hook.victim !== "any" && target !== undefined) {
        if (!victimPasses(world, owner, hook.victim, target)) continue;
      }

      // [反彈] 「普通攻擊」 過濾 —— owner 的文案是「反彈**普通攻擊**傷害 200%」,
      // 而在這之前 `onDamageTaken` 分不出普攻、技能與 DoT。
      //
      // 位置:緊跟著 `victim`,因為它跟 `victim` 是同一類東西 —— 「這一則事件
      // 是什麼」的過濾,rng-FREE,而且**在內部冷卻閘與機率骰之前**。理由與
      // `requires` 完全相同(見下方那一段):被這條擋掉的一發不可以燒掉持有者的
      // ICD、也不可以動到 seed,否則每一次被技能打到都會偷偷推進亂數流,
      // 而那一發根本不可能觸發。
      //
      // 沒有封包 = 不通過(跟 `victim` 相反,理由見 `HookDef.damageSource`)。
      if (hook.damageSource !== undefined && hook.damageSource !== "any") {
        if (incoming === undefined) continue;
        if (!damageSourcePasses(hook.damageSource, incoming.origin)) continue;
      }

      // B2 (2026-08-05) —— 「那一發是什麼型別 / 是不是暴擊」。
      //
      // ⛔ 位置與 `damageSource` 完全相同,而且理由**一個字都沒變**:這兩條是
      // 「這一則事件是什麼」的過濾,rng-FREE,必須在**內部冷卻閘與機率骰之前**。
      // 搬到骰子後面 = 被擋掉的一發也抽了籤 = 每一次被非暴擊打到都偷偷推進亂數流,
      // 而那一發根本不可能觸發 —— 那是一條只有 `world.rng.state` 前後比對才看得見
      // 的決定性缺陷,錄影會在幾百 tick 之後才對不起來。
      //
      // 沒有封包 = 不通過(同 `damageSource`):「沒有傷害」不可能是一發魔法傷害,
      // 也不可能是一次暴擊。載入時 `refineHookDamageContext` 已經擋掉把它們掛到
      // 無傷害事件上的文件,所以正常內容碰不到這一行。
      if (hook.damageType !== undefined && hook.damageType !== "any") {
        if (incoming === undefined) continue;
        if (incoming.type !== hook.damageType) continue;
      }
      if (hook.damageCrit !== undefined && hook.damageCrit !== "any") {
        if (incoming === undefined) continue;
        if (incoming.crit !== (hook.damageCrit === "crit")) continue;
      }

      // ⭐ G8 —— 「這一發暴擊是**我自己那條** critStrike 打出來的嗎」
      // (89-01 憤怒的頭槌:「**這一招**想起頭槌的那一下把敵人震昏」)。
      //
      // 在這個欄位之前,唯一寫得出來的是 `damageCrit: "crit"`,而那是一道**粗
      // 過濾**:持有者身上任何一條暴擊來源(甚至他天生的 `Stat.CritChance`)打出
      // 的暴擊都會觸發它。畫面上的差別是「這一招偶爾震昏」變成「這位英雄的每一
      // 次暴擊都震昏」—— 一個沒有人設計過的控場量。
      //
      // ⛔ 位置與上面三條**完全相同**,理由一個字都沒變:這是「這一則事件是什麼」
      // 的過濾,rng-FREE,必須在 ICD 閘與機率骰之前。
      //
      // ⚠️ 這同時是「一次判定、一串結果」的整個答案(G8 的另一半):hook 自己
      // **不填 `chance`**,判定就只有暴擊那一次骰 —— 於是 77-02「暴擊時追加落雷」
      // 不可能再出現「暴擊了但沒落雷」。
      // ⛔ 所以**不需要**第二套 `CritStrikeGrant.onProc`:那會是第二個「暴擊時
      // 做什麼」的住處,而它拿不到 target、也接不上 `victim`/`condition`/
      // `internalCooldown`/`maxTriggers` 那一整排既有的閘(第零守則⑨)。
      //
      // ⚠️ 2026-08-10 —— 上面那段論證在**技能**暴擊上曾經是假的:
      // `effects/damage.ts` 那一族只設 `crit`、**不設 `critSources`**,所以這一格
      // 只有普攻通得過,而作者被逼回「grant 抽一次 + hook 再抽一次」。⛔ 修法**不是**
      // 補一格 `onProc`,是把那三支的就地擲骰換成 `combat/critStrike.ts::
      // rollAbilityCrit`（同一份合成、同一份名單）—— 那一行改完,這段論證才第一次
      // 對全部的暴擊成立。
      //
      // 沒有封包 = 不通過(同 `damageSource`);`critSources` 缺席 = 這一發沒有
      // 任何 grant 參與 = 一定不是「我那一條」。
      if (hook.critSource === "thisSource") {
        if (incoming?.critSources?.includes(src.id) !== true) continue;
      }

      // ⭐ S10 —— 被反彈掉的**原封包**是什麼(60-04 迴旋斬:「若成功反彈敵方
      // **技能** AP 傷害」)。
      //
      // 在這兩格之前,`onReflectSuccess` 的過濾讀的是**反彈封包**自己 —— 而那一發
      // 的 origin 永遠是反彈者的技能、type 永遠是作者填的那一個,所以「原本打過來
      // 的是不是技能 AP」這個問題**問不出來**,60-04 的條件只能整條放棄。
      //
      // ⛔ 判定走 `damageSourcePasses` 那一份既有函式,不是第二份
      // `startsWith("ability:")`(理由逐字見那個函式的檔頭)。
      // ⚠️ 沒有原封包 = 不通過,與 `damageSource` 的不對稱一致。
      if (hook.reflectedDamageSource !== undefined && hook.reflectedDamageSource !== "any") {
        const from = incoming?.reflectedFrom;
        if (from === undefined) continue;
        if (!damageSourcePasses(hook.reflectedDamageSource, from.origin)) continue;
      }
      if (hook.reflectedDamageType !== undefined && hook.reflectedDamageType !== "any") {
        const from = incoming?.reflectedFrom;
        if (from === undefined) continue;
        if (from.type !== hook.reflectedDamageType) continue;
      }

      // 職業限定閘 (owner 2026-07-30: 近戰專用擴散 / 法師保命 / 坦克衝刺 /
      // 射手百分比傷害). See sim/content/requirement.ts for the axes and why
      // `role` is not one of them.
      //
      // EVALUATED AGAINST `owner`, WHICH IS ALSO THE FIX FOR AURAS. `owner` is
      // whoever CARRIES this source — the item holder for an item passive, and
      // the ALLY STANDING IN THE RADIUS for a hook projected by an `auras`
      // block (auraSystem attaches the payload to the recipient's own
      // `sources`). So one field spells both 「近戰專用」 and 「周圍的近戰友軍」.
      //
      // ORDER IS LOAD-BEARING: this runs BEFORE the internal-cooldown gate and
      // BEFORE the proc roll, so a BLOCKED clause costs its carrier nothing —
      // no ICD burned, no `world.rng` draw consumed. Gating after the roll would
      // make a melee-only proc silently eat the rng stream on every ranged
      // champion's attack, which is both a wasted proc and a determinism trap
      // for anyone reasoning about the seed. `scale` is a pure function of world
      // state, so every replica takes the identical branch.
      //
      // Absent `requires` → scale 1 → both lines below are exact no-ops, which
      // is why no pre-existing hook changes behaviour.
      const scale = requirementScale(world, owner, hook.requires);
      if (scale === 0) continue;

      // ⭐ S6 —— 額度閘（`maxTriggers`）。
      //
      // ⛔ 位置與 `victim` / `damageSource` / `requires` 完全同一族，理由**一個字
      // 都沒變**：這是一條 rng-FREE 的「這條 hook 還有沒有資格發動」過濾，必須在
      // **內部冷卻閘與機率骰之前**。搬到骰子後面 = 一條額度早就用完的 hook 每一次
      // 普攻都偷偷推進亂數流，而那是一條只有 `world.rng.state` 前後比對才看得見的
      // 決定性缺陷。
      //
      // 缺席 = **無限次** = 這個欄位出現之前每一條 hook 的行為，所以既有內容
      // 一份都碰不到這一行。
      const perTargetQuota = hook.perTarget === true;
      const used = triggersUsed(src, hi, perTargetQuota, target);
      if (hook.maxTriggers !== undefined && used >= hook.maxTriggers) continue;

      // Internal cooldown.
      //
      // `combatEnv.itemCooldown` (#189) scales this and ONLY this, and only for
      // an ITEM source: owner asked for 道具冷卻 to be tunable independently of
      // the ability `cooldown` factor, which multiplies ability cast cooldowns
      // in abilities/abilitySystem.ts and has never touched an item.
      //
      // The kind check is what keeps the knob honest — champion passives,
      // augments, auras and timed buffs all reach this same line, and scaling
      // their ICDs from a factor labelled 道具冷卻 in the console would be a
      // number that does not do what it says. Shipped at 1.0, so every existing
      // hook keeps its exact pre-#189 cadence.
      //
      // `internalCooldownScope` (批 1, 決策點 1-4) 只換**記在哪一格**,不換
      // 上面任何一句:省略 = `"source"` = `hookLastFired[hi]`,也就是這個欄位
      // 出現之前每一份文件走的那一格,所以既有節奏一個 tick 都沒動。
      const perSlot = hook.internalCooldownScope === "perAbilitySlot";
      const slotKey = abilitySlot ?? ICD_NO_SLOT_KEY;
      if (hook.internalCooldown) {
        const icdTicks = hookIcdTicks(world, src, hook);
        const last = perSlot
          ? (src.hookLastFiredBySlot?.[hi]?.get(slotKey) ?? NEVER_FIRED)
          : src.hookLastFired[hi]!;
        if (world.tick - last < icdTicks) continue;
      }
      // proc chance (WC3 Hbh1/Ocr1/War1 …) — seeded rng, so a replay of the
      // same seed rolls identically. A failed roll leaves the ICD clock alone.
      //
      // ⚠️ `chanceFrom`(朗基努斯之槍「(總敏捷)% 機率」)佔的是**同一個抽籤位置**,
      // 而且照樣只抽一次:動的是**門檻**,不是抽的次數或時機。所以每一份既有
      // 文件的亂數流一個位元都沒動 —— 這正是 `sim/content/condition.ts`
      // DECISION 1 要保住的性質。兩個欄位互斥(schema 在載入時擋),所以
      // 「相乘還是取代」這個沒有正確答案的問題不會出現。
      const procChance = hookProcChance(world, owner, hook);
      if (procChance !== undefined && !world.rng.chance(procChance)) continue;

      // 觸發條件 (owner 2026-07-30 「on-attack by condition」). See
      // sim/content/condition.ts — the whole model, both determinism decisions
      // and the human-readable renderer live there.
      //
      // ORDER, AND WHY IT IS HERE AND NOT ANYWHERE ELSE:
      //
      //   · AFTER the `requires` class gate and AFTER the internal-cooldown
      //     gate, because both of those are rng-FREE and a condition tree is
      //     not. A melee-only clause on a ranged champion, or a clause still on
      //     cooldown, must cost that carrier nothing — no draw, no stream
      //     movement — for the same reason `requires` is gated before the proc
      //     roll: otherwise every ranged champion's every swing silently
      //     advances the seed on a proc that can never fire.
      //   · AFTER the legacy `chance` roll, so the WC3 proc column keeps its
      //     exact pre-existing draw position and every ported passive's stream
      //     is byte-identical to before this field existed. A condition tree
      //     draws AFTER it, never before.
      //   · BEFORE `hookLastFired`, so a condition that does not hold does NOT
      //     burn the internal cooldown — the same WC3 semantics a failed proc
      //     roll already has ("a failed proc does not consume the cooldown").
      //
      // `target` is passed through as the condition's 敵人 subject: absent on an
      // entity-less event, where every `subject:"target"` leaf reads FALSE by
      // design (condition.ts DECISION 2).
      if (!evaluateCondition(world, hook.condition, { self: owner, ...(target !== undefined ? { target } : {}) })) {
        continue;
      }
      // 記帳。`"source"` 那一格**永遠**寫,連 `perAbilitySlot` 也寫 —— 這樣
      // 一條 hook 從 per-slot 改回 source(後台切一格)不會拿到一份空的歷史,
      // 而且 `hookLastFired` 仍是「這條 hook 最後一次發動」的單一真相
      // (診斷面板、未來的 UI 都讀它)。
      // ⭐ S6 —— 扣額度。`consumeOn` 今天只有 `"fire"`（發動的那一刻），而這一格
      // 刻意先存在：它把「這裡有二選一」寫進契約，`"hit"`（下游真的打到人才算）
      // 上線那天只是加一個 enum 成員，不是改語意。
      // ⛔ 位置在**條件通過之後**：一個沒通過條件的事件不可以吃掉「下一次普攻」，
      // 理由與它下面那行不燒 ICD 逐字相同。
      if (hook.maxTriggers !== undefined) {
        const nowUsed = consumeTrigger(src, hi, perTargetQuota, target, used);
        // 用完之後整份來源卸下（圖示跟著消失）。⚠️ 真的卸下要等這一輪跑完 ——
        // `detachSource` 會 splice 掉 `sc.sources`，而我們正在迭代它。
        if (nowUsed >= hook.maxTriggers && hook.onConsumed === "detachSource") {
          if (!detachAfter) detachAfter = [];
          if (!detachAfter.includes(src.id)) detachAfter.push(src.id);
        }
      }
      src.hookLastFired[hi] = world.tick;
      if (perSlot) {
        if (!src.hookLastFiredBySlot) src.hookLastFiredBySlot = new Array(src.hooks.length);
        let m = src.hookLastFiredBySlot[hi];
        if (!m) {
          m = new Map<string, number>();
          src.hookLastFiredBySlot[hi] = m;
        }
        m.set(slotKey, world.tick);
      }

      const resolveAgainst =
        hook.target === "allies"
          ? alliedChampions(world, owner)
          : hook.target === "self" || target === undefined
            ? [owner]
            : [target];
      runEffects(scaleEffects(hook.effects, scale), {
        world,
        caster: owner,
        // ⭐ G4 —— 這條 hook 的 payload 以**授予它的那一階**求值。
        //
        // 在這一行之前它寫死 `rank: 1`,所以一支被動技的 hook 效果不管學到第幾階
        // 都只讀得到 `perRank` 的第 1 欄。代價不是三支技能而是**全 repo 的抄寫稅**:
        // 一支七階被動的作者被迫在 `passive.ranks[]` 的每一階**各抄一份**同樣的
        // hook 只為了換掉裡面那個數字,而抄漏一階**不會紅** —— 那一階的玩家安靜地
        // 拿到第 1 階的數值(失敗形態 ②)。
        //
        // ⛔ 不在這裡回頭查 `world.abilities` 反推 rank:一份來源可能來自道具
        //(無 rank)、augment(無 rank)、靈氣(rank 屬於發射者)、`applyBuff`
        //(rank 屬於那一次施放)—— 四種來路四個 if 就是第〇·五守則的越線。
        // rank 是**授予那一刻**的性質,所以它騎在 source 上(`grantRank`)。
        //
        // 缺席 = 1 = 這一行以前的行為,所以道具與增益卡逐位元不變;而載入時的
        // `refineUnrankedHookPerRank` 擋掉「掛在拿不到 rank 的載體上卻寫了多欄
        // perRank」的文件 —— fail-loud,不是靜默付第 1 欄。
        rank: Math.max(1, src.grantRank ?? 1),
        targets: resolveAgainst,
        origin: `hook:${src.id}`,
        // 觸發這一次的那一發封包,原封不動往下傳。`damage.incomingPct` 讀它,
        // 而且它同時帶著 `reflectDepth` —— 反彈鏈的終止性就掛在這個欄位上。
        ...(incoming !== undefined ? { incoming } : {}),
        rng: world.rng,
      });
      fired++;
    }
  }
  // ⭐ S6 —— `onConsumed: "detachSource"`：額度用完的來源整份卸下（圖示跟著消失）。
  // ⛔ 位置在**兩層迴圈之外**：`detachSource` 會 `splice` 掉 `sc.sources`，而上面
  // 正在 `for…of` 迭代同一個陣列 —— 邊迭代邊 splice 會**跳過**下一份來源，而症狀
  // 是「同一 tick 觸發的另一件裝備偶爾不生效」，看起來像機率問題。
  if (detachAfter) for (const id of detachAfter) detachSource(world, owner, id);
  // ⭐ 45-00 —— 「這一次呼叫真的跑了幾條 hook」。呼叫端只有一個（免傷的預掃描）
  // 在讀它：跑了 ≥1 條免傷 hook = 這一發不扣血。⛔ 不可以改成「持有者身上有沒有
  // 免傷 hook」—— 那讀不到 ICD、機率與條件三道閘，一支 20% 機率的寫輪眼會變成
  // 100% 免傷（owner 2026-08-09 的 45-00 裁決正是「20% 機率」）。
  return fired;
}
