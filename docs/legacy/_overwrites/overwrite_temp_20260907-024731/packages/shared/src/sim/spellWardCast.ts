/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  【法術護盾 · 整發攔截】—— GH#1091（原作 `ANss` Spell Shield）
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GH#1085 讓 07-01 臨、兵、鬥的護盾擋得下敵方的**負面狀態**，而它擋的只有
 * 「掛狀態」那一條路（`effects/applyStatus.ts`）。⇒ 一支「魔法傷害 ＋ 暈眩」的
 * 敵方法術打上來時：**暈眩沒中、傷害照樣落地**，而純傷害的指定目標法術則
 * 什麼都不擋 —— 卡面「可抵擋對方負性魔法」在傷害那一半是假的（第一·五守則）。
 *
 * 原作擋的是**整發**：Storm Bolt 打在帶 Spell Shield 的英雄身上，暈眩與傷害
 * 一起消失，護盾隨即碎掉。⇒ 缺的不是「再擋一個地方」，是**解算層的一個判準**。
 *
 * ── ① 為什麼住在施放解算層，⛔ 不是傷害入口 ────────────────────────────────
 *
 * 票文列了兩條路，而它們**不是同一件事的兩種寫法**：
 *
 * | 住處 | 它擋得掉什麼 | 為什麼不夠 |
 * |---|---|---|
 * | `combat/damage.ts` 的封包閘 | 只有**傷害**封包 | 狀態那一半仍要走 `applyStatus` ⇒ ⭐ **同一發會被扣兩次次數** |
 * | ⭐ 施放解算層（這一支） | 這一發的**每一個** effect | 一發＝一次判定＝一次消耗 |
 *
 * ⇒ 選解算層。而它同時關掉了「扣兩次」這個票文自己點名的風險：整發被拒 ⇒
 * `runEffects` 根本沒跑 ⇒ `applyStatus` 那道閘看不到這一發。
 *
 * ── ② 為什麼只擋 `castType: "targeted"` ────────────────────────────────────
 *
 * 出處：原作 Spell Shield 擋的是**指定目標**的法術（w3a `ANss`；WC3 的範圍技
 * 與投射物不吃它 —— 那正是「用暴風雪逼掉神符盾」這個經典操作存在的理由）。
 * ⇒ 範圍技／投射物／自我增益一律不進這一段；它們的減益仍由 GH#1085 的
 * `applyStatus` 那道閘處理（⭐ 兩條路合起來才是完整的護盾，⛔ 這一支不是取代）。
 *
 * ⚠️ ⛔ **不要**把這一段改成「所有敵方技能」——那會讓一個 30 秒冷卻的護盾
 * 擋下一發殭屍潮的範圍傷害，而玩家在畫面上分不出它擋掉的是哪一個。
 *
 * ── ③ 「整發取消」到底取消了什麼 ───────────────────────────────────────────
 *
 *   ✅ 取消：`runEffects`（傷害 · 狀態 · 位移 · 這一發掛在自己身上的連段窗）
 *            ＋ `onAbilityHit` / `abilityHit`（它**沒有**命中）
 *   ⛔ 不取消：魔力與冷卻（施放者已經付了，WC3 也不退）、`onAbilityCast`
 *            （他確實放了一發）、收招餘韻、面向鎖
 *
 * ⚠️ 連段窗一起消失是**刻意**的，⛔ 不是漏了：原作的語意是「這一發被吃掉了」，
 * 而一發被吃掉的法術不該留下任何它發生過的痕跡（07-02 者、皆、陣 的
 * `applyTo: "self"` 標記走的是同一次 `runEffects`）。
 *
 * ── ④ 純度 ────────────────────────────────────────────────────────────────
 * 讀 `world.stats` / `world.team` / `world.transform` / `world.tick`，寫
 * `grant.charges` 與 `world.events`。無 rng、無 `Date.now`、無三角函式、無 `**`、
 * ⛔ 無 Map 迭代（`sim/purity.test.ts`）。扣次數是**決定性**的：同一份來源實例
 * 減一，⛔ 沒有任何機率。
 */
import type { SimWorld } from "./SimWorld";
import type { EntityId } from "../ids";
import type { AbilityDef } from "./content/defs";
import type { DamageType } from "./effects/effect";
import { chargedWardSource, spendImmunityCharge } from "./statusTagImmunity";
import { detachSource } from "./stats/statPipeline";

/**
 * 整發被護盾吃掉時送到客戶端的那一拍。
 *
 * 形狀照 `combat/damage.ts::emitImmune` 的 `immune`（客戶端在
 * `apps/client/src/net/RoomConnection.ts` 用 `recordEvade(ev.data, "immune")`
 * 接它，畫成打擊點的「免疫」浮字）——⭐ 走既有的事件名與既有的消費端，
 * ⛔ 不開第二個（一個沒有人畫的事件就是失敗形態②，而新事件還要走
 * `eventFanout` 白名單 ⇒ 失敗形態⑧）。
 *
 * ⚠️ ⛔ **刻意沒有 `statusId`**（`applyStatus` 那一拍有）：這一發被拒的時候
 * 「哪一份狀態被擋下」**沒有答案** —— 被擋下的是整發。`origin`（`ability:<id>`）
 * 才是這一拍的身分，而它在。
 */
export interface CastWardBlockEvent {
  target: EntityId;
  source: EntityId;
  amount: 0;
  dmgType: DamageType;
  origin: string;
}

/**
 * ⭐ 這一發要不要被受害者的法術護盾**整發**吃掉。
 *
 * 回 `true` ＝ 已經扣過次數、已經發過那一拍（護盾扣到 0 的話也已經拔掉），
 * 呼叫端**不要**跑這一發的 effects。
 *
 * ⚠️ 它有副作用（扣次數／發事件／拔來源），所以呼叫端**一次施放只能問一次** ——
 * 兩個解算點（瞬發 `abilities/abilitySystem.ts`、有吟唱 `systems/CastResolveSystem.ts`）
 * 各自只會走到其中一個。
 */
export function spellWardRefusesCast(
  world: SimWorld,
  caster: EntityId,
  def: AbilityDef,
  targets: readonly EntityId[],
  origin: string,
): boolean {
  // ── 開關（`config.shield@1` ⇒ `world.shieldRules`）─────────────────────────
  // `status-only` ＝ 逐位元回到 GH#1085 那一版：這一支整段不作用，減益仍由
  // `applyStatus` 那道閘擋、傷害照樣落地。
  if (world.shieldRules.spellWardBlocksWholeCast !== "whole") return false;
  // 原作只擋指定目標的法術（見檔頭②）。`targeted` 解出來永遠正好一個目標，
  // 所以下面那個 `!== 1` 是不變量的守衛，⛔ 不是在處理多目標。
  if (def.castType !== "targeted" || targets.length !== 1) return false;
  const victim = targets[0]!;
  // 自己給自己的（治療／增益走 `targetsEnemies: false`）⛔ 不消耗護盾 ——
  // 與 GH#1085 的 `appliedByHostile` 同一個判準、同一個理由（卡面的「對方」）。
  if (victim === caster) return false;
  if (world.team.get(caster)?.teamId === world.team.get(victim)?.teamId) return false;
  const sc = world.stats.get(victim);
  if (sc === undefined) return false;
  const ward = chargedWardSource(sc.sources, world.tick);
  const grant = ward?.statusImmunity;
  if (ward === undefined || grant === undefined) return false;
  // ⭐ 承重那一行：少了它護盾永遠擋得住（第二發也免疫），而畫面上看起來
  // 「護盾很強」而不是「壞了」。
  const spent = spendImmunityCharge(grant);
  const tt = world.transform.get(victim);
  const beat: CastWardBlockEvent = {
    target: victim,
    source: caster,
    amount: 0,
    // 卡面說的是「負性**魔法**」——與 `applyStatus` 那一拍同一格,客戶端拿它挑顏色。
    dmgType: "magic",
    origin,
  };
  world.emit("immune", { ...beat, x: tt?.pos.x ?? 0, z: tt?.pos.z ?? 0 });
  if (spent) detachSource(world, victim, ward.id);
  return true;
}
