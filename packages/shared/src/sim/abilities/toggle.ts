/**
 * 【切換】—— 開／關兩態的按鈕，以及**資源耗盡自動關閉**。
 *
 * 擋住的兩支：20-01 風王結界（Saber 的招牌）· 70-00 紮根（白木卡迪那）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 這一支的靈魂：**只有一個出口**
 *
 * 計畫 §13 的驗收條件逐字寫著：
 *   「風王結界**手動關閉**與 **MP 不足自動關閉**都走**同一個 onExit child**」
 *
 * 而 20-01 的傷害**有一半在關閉那一刻**（「關閉時，凝聚的風能一次釋放
 * 『風王鐵槌』」）。所以「兩條關閉路徑」不是一個架構潔癖問題 ——
 * 寫成兩份的話，其中一份忘了跑 onExit，玩家就有一半的時候看不到那一招，
 * 而**兩份實作各自的測試都會綠**（失敗形態 ③ + ⑤）。
 *
 * 這裡的結構性保證是：{@link exitToggle} 是這個模組**唯一**會從
 * `ab.toggles` 移除一筆的地方，也是**唯一**呼叫 `runEffects(tg.onExit, …)`
 * 的地方。手動關閉（`castAbility` 第二次按下）與自動關閉（本檔的
 * `toggleUpkeepSystem`）都只是**呼叫它**，差別只在 `reason` 這個字串。
 * 要讓兩者分岔，必須先寫出第二個 `runEffects(tg.onExit …)` —— 而那一行不存在
 * 就是守衛 `toggle.test.ts` 用行為量到的東西。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 兩種成本是**兩個數字**，不是一個
 *
 *   開關成本 = `ability@1.manaCost`   → 20-01 的 50/100/150/200
 *   維持成本 = `toggle.upkeepCost`     → 20-01 的 30/50/70/90
 *
 * 節奏（`upkeepCadence`）也是一格而不是一個 if：20-01 是「每次攻擊」，
 * 70-00 紮根**完全沒有維持成本**。四個決策全部落在
 * `content/schema/ability.ts` 的 `zAbilityToggle` 上（CLAUDE.md 第一守則）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 邊界（明說，不是遺漏）
 *
 * · **死掉不關**。屍體不付維持成本（下面的 `alive` 閘），但切換旗標留著。
 *   「關閉時的大招要不要從屍體上放出來」是一個真的決策點，它應該是一格欄位
 *   而不是我在這裡挑一邊 —— 在 owner 裁決之前，⛔ **不要**為它偷開第二條
 *   出口，那正是這個檔存在要防的事。
 * · **客戶端不知道按鈕亮著**。切換態沒有進 snapshot；HUD 的高亮是另一條線。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 純度
 * 不抽 rng、不看時鐘、沒有三角函式、沒有 `**`。`perSecond` 的到期用**絕對
 * tick**（`ToggleState.nextUpkeepTick`），不是遞減計數器。跨身體的處理順序
 * 明確排序過 —— 兩個人同一 tick 自動關閉時，他們排進傷害佇列的先後不可以
 * 取決於 `Map` 的迭代順序。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { CastableSlot } from "../intents";
import type { AbilityDef } from "../content/defs";
import type { AbilitiesComp, ToggleState } from "../stats/statsComp";
import { Abilities } from "../content/registry";
import { runEffects } from "../effects/effectRunner";
import { abilityInstanceFor } from "./innateActive";

/** 為什麼關的。⛔ 它只影響 `costOnExit` 與事件上的字串，**不影響 onExit**。 */
export type ToggleExitReason =
  /** 玩家自己再按了一次那顆按鈕。 */
  | "manual"
  /** 付不出維持成本（20-01「[MP]不足則自動關閉」）。 */
  | "resourceEmpty";

/** 這顆按鈕現在開著嗎。 */
export function isToggleOn(ab: AbilitiesComp, slot: CastableSlot): boolean {
  return findToggle(ab, slot) !== undefined;
}

function findToggle(ab: AbilitiesComp, slot: CastableSlot): ToggleState | undefined {
  return ab.toggles?.find((t) => t.slot === slot);
}

/**
 * 打開一顆切換技。由 `castAbility` 在**付完開關成本之後**呼叫。
 *
 * ⚠️ 生效時點是「付出成本的那一刻」而不是「效果跑完的那一刻」：施法被打斷時
 * 玩家已經付了錢，那他至少要拿得到一顆關得掉的按鈕。（出貨的兩支切換技
 * `castTimeSec` 都是 0，所以今天兩者是同一 tick。）
 */
export function enterToggle(
  world: SimWorld,
  id: EntityId,
  slot: CastableSlot,
  def: AbilityDef,
): void {
  const tg = def.toggle;
  const ab = world.abilities.get(id);
  if (!tg || !ab || isToggleOn(ab, slot)) return;
  (ab.toggles ??= []).push({
    slot,
    abilityId: def.id,
    // 開的當下就算好第一次扣款的**絕對** tick。`perSecond` 以外不會被讀，
    // 但無條件寫進去 —— 有條件地寫是欄位變成「有時候是 undefined」的做法。
    nextUpkeepTick: world.tick + upkeepIntervalTicks(world, tg.upkeepIntervalSec),
  });
  world.emit("toggleEnter", { id, slot, abilityId: def.id });
}

/**
 * ⭐ **唯一的關閉出口。** 手動與自動都走這裡；`reason` 只改成本與事件字串。
 *
 * 回傳「本來是開著的嗎」—— false = 這顆按鈕沒開，什麼都沒發生。
 */
export function exitToggle(
  world: SimWorld,
  id: EntityId,
  slot: CastableSlot,
  reason: ToggleExitReason,
): boolean {
  const ab = world.abilities.get(id);
  if (!ab?.toggles) return false;
  const idx = ab.toggles.findIndex((t) => t.slot === slot);
  if (idx < 0) return false;
  const st = ab.toggles[idx]!;
  const def = Abilities.get(st.abilityId);
  const tg = def.toggle;

  // ⛔ 先移除再跑效果。onExit 裡如果有任何東西又碰到這顆按鈕（變身把技能表
  // 換掉、hook 反手再按一次），留著這一筆就是一個無限迴圈。
  ab.toggles.splice(idx, 1);

  const inst = abilityInstanceFor(ab, slot);
  const rank = Math.max(1, inst?.rank ?? 1);

  if (tg) {
    // ── 開關成本：「每次[開關]耗[MP]」，開一次關一次各付一次 ────────────
    // ⚠️ 自動關閉**永遠不付**，而且那不是欄位能改的：自動關閉的觸發條件就是
    // 「付不出維持成本」，再跟他要一筆更貴的開關成本是自相矛盾的。
    if (reason === "manual" && tg.costOnExit !== false) {
      const hp = world.health.get(id);
      if (hp) {
        const cost = def.manaCost[rank - 1] ?? 0;
        // 夾住而不是拒絕：關不掉的切換技等於把方向盤從玩家手上拿走。
        // 付不出全額就付得出多少算多少，按鈕照樣關。
        hp.mana = Math.max(0, hp.mana - cost);
      }
    }
    // ── 關閉要不要重新進冷卻（預設 false，見 schema 上的理由）──────────
    if (tg.cooldownOnExit && inst) {
      const cdSecs = (def.cooldown[rank - 1] ?? 0) * world.combatEnv.cooldown;
      inst.cooldownRemainingTicks = Math.round(cdSecs / world.dt);
    }
  }

  // ⭐ 風王鐵槌住在這裡，而這是**全檔唯一**跑它的地方。
  const t = world.transform.get(id);
  runEffects(tg?.onExit ?? [], {
    world,
    caster: id,
    rank,
    // 空的目標集：onExit 的效果自己用 `shape` 解目標（前方圓形範圍），
    // 因為「關閉」這個動作沒有一個被指定的對象。
    targets: [],
    point: t ? { x: t.pos.x, z: t.pos.z } : undefined,
    direction: t ? { x: t.facing.x, z: t.facing.z } : undefined,
    // `ability:` 前綴是刻意的 —— `originInScope(origin,"ability")` 靠它把
    // 風王鐵槌認成技能傷害（惡夢魔王碎片之類的 scope 過濾器讀同一個字串）。
    origin: `ability:${st.abilityId}`,
    abilitySlot: slot,
    rng: world.rng,
  });

  world.emit("toggleExit", { id, slot, abilityId: st.abilityId, reason });
  return true;
}

/** `perSecond` 的週期換算成 tick，至少 1（0 tick 的週期會變成每 tick 扣款）。 */
function upkeepIntervalTicks(world: SimWorld, sec: number | undefined): number {
  return Math.max(1, Math.round((sec ?? 1) / world.dt));
}

/**
 * 每 tick：收維持成本，付不出來就**走同一個 `exitToggle` 自動關閉**。
 *
 * ⚠️ 排在 `basicAttackSystem` 之後 —— 它讀 `world.events` 裡這一 tick 的
 * `basicAttack`，而那個陣列在 `step()` 開頭才被清空。往前搬一格，`perAttack`
 * 的扣款就永遠收不到任何一刀，而**畫面上跟「沒有人開這個技能」一模一樣**。
 *
 * `ab.toggles` 空的時候是嚴格 no-op，所以每一份既有錄影逐位元不變。
 */
export function toggleUpkeepSystem(world: SimWorld): void {
  // 這一 tick 誰揮了刀。⚠️ `basicAttack` 在迴避／失手判定**之前**發射，
  // 而文案寫的是「每次**攻擊**」不是「每次命中」—— 揮了就算。
  let swung: Set<EntityId> | undefined;
  for (const ev of world.events) {
    if (ev.type !== "basicAttack") continue;
    const src = ev.data.source as EntityId | undefined;
    if (src !== undefined) (swung ??= new Set()).add(src);
  }

  // 先收出「身上有開著的切換技」的人再**排序**。跨身體的處理順序看得見：
  // 兩個人同一 tick 自動關閉，他們的 onExit 傷害排進 damageQueue 的先後
  // 不可以取決於 `Map` 的迭代順序（sim/purity.test.ts）。
  let owners: EntityId[] | undefined;
  for (const [id, ab] of world.abilities) {
    if (ab.toggles && ab.toggles.length > 0) (owners ??= []).push(id);
  }
  if (!owners) return;
  owners.sort((a, b) => a - b);

  for (const id of owners) {
    const ab = world.abilities.get(id);
    const hp = world.health.get(id);
    if (!ab?.toggles) continue;
    // 屍體不付維持成本。⛔ 也**不**自動關閉 —— 見檔頭的邊界說明。
    if (!hp?.alive) continue;
    // 快照：`exitToggle` 會就地改動這個陣列。
    for (const st of [...ab.toggles]) {
      const tg = Abilities.get(st.abilityId).toggle;
      if (!tg || tg.upkeepCadence === "none") continue;

      // ── 節奏閘 ────────────────────────────────────────────────────────
      if (tg.upkeepCadence === "perAttack") {
        if (!swung?.has(id)) continue;
      } else {
        if (world.tick < st.nextUpkeepTick) continue;
        // 絕對 tick 往前推一格週期（不是遞減計數器）。
        st.nextUpkeepTick = world.tick + upkeepIntervalTicks(world, tg.upkeepIntervalSec);
      }

      const rank = Math.max(1, abilityInstanceFor(ab, st.slot)?.rank ?? 1);
      const cost = tg.upkeepCost[rank - 1] ?? 0;
      if (!(cost > 0)) continue;

      const onMana = (tg.upkeepResource ?? "mana") === "mana";
      const pool = onMana ? hp.mana : hp.hp;
      if (pool < cost) {
        // ⭐ 這就是「[MP]不足則自動關閉」。它呼叫的是**手動關閉呼叫的那一支**。
        if (tg.exitOnResourceEmpty !== false) exitToggle(world, id, st.slot, "resourceEmpty");
        // `false` 的讀法是「付不出來就這一次不扣，但繼續開著」—— 一個真的
        // 有人會想要的設計（免費維持的儀式型切換），所以它是一格。
        continue;
      }
      if (onMana) hp.mana = pool - cost;
      else hp.hp = pool - cost;
    }
  }
}
