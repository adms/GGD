/**
 * ⭐【開關型技能開著沒有】真的上了線（GH#546）—— 風王結界那一族。
 *
 * ⚠️ 這條守衛在的理由，是它抓到的那個缺陷：`SeatState.toggleMask` 的欄位在線路上、
 * `toggleMaskHas` 在客戶端讀、`abilityReadyFrame` 照著畫環、`abilityToggleWiring`
 * 對帳斷言全綠 —— 而 **`net/snapshot.ts` 的投影一次都沒有寫過它**。
 * ⇒ 玩家按下風王結界，圖示**不會有任何變化**（失敗形態②：算出來了但從沒送到客戶端）。
 *
 * ⛔ 而它比多數的更難看見：**「永遠關著」與「這支技能沒有開關」在畫面上逐位元
 * 一模一樣**，所以沒有任何截圖、沒有任何既有測試會不一樣。
 *
 * ⭐ 兩條都讀**全新的 `MatchState`**（＝一個剛連上/重連的客戶端收到的第一份完整
 * 狀態）—— 開關是**很久以前**按下的，事件歷史補不回來，那正是它必須是一格欄位
 * 而不是一個事件的理由。
 *
 * ⛔ 零出貨數值：沒有任何技能 id、沒有任何槽位被寫死成「就是 E」。
 *
 * ── 突變紀錄（實跑）────────────────────────────────────────────────────────
 * M1 `net/snapshot.ts` 把 `ss.toggleMask = mask;` 那一行刪掉
 *    → ★① FAIL（`expected false to be true` —— 開著的那一格讀回「關」）。
 *      ★② 仍綠（它問的是「沒開的不要亮」，什麼都不送當然滿足）⇒ ② 一個人
 *      證明不了任何東西，這正是失敗形態④的樣子，所以兩條都留著。
 *    改回來 → 2/2 綠。
 */
import { describe, it, expect } from "vitest";
import { MatchState, toggleMaskHas } from "@ggd/shared/protocol/schema";
import { CASTABLE_SLOTS } from "@ggd/shared/sim/intents";
import { enterToggle, isToggleOn } from "@ggd/shared/sim/abilities/toggle";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { EntityId } from "@ggd/shared/ids";
import type { CastableSlot } from "@ggd/shared/sim/intents";
import { MatchController } from "../match/MatchController";
import { projectSnapshot } from "./snapshot";

const seats = Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

function inCombat(): MatchController {
  const ctl = new MatchController("toggles", 4242, seats, {
    champSelectTicks: 5,
    intermissionTicks: 30,
    combatMaxTicks: 1200,
    resolutionTicks: 5,
  });
  while (ctl.phase.phase !== "combat") ctl.tick();
  ctl.tick();
  return ctl;
}

/** 一個**剛連上的客戶端**收到的第一份完整狀態裡，這個座位的 mask。 */
function freshMaskOf(ctl: MatchController, seatId: number): number {
  const state = new MatchState();
  projectSnapshot(ctl, state, new Map());
  for (const [, ss] of state.seats) if (ss.seatId === seatId) return ss.toggleMask;
  throw new Error(`座位 ${seatId} 不在快照裡`);
}

describe("開關型技能的開/關真的送到客戶端 (toggle-mask-wire-546)", () => {
  it("★① 開著的那一格在**全新快照**上讀回「開」—— ⛔ 不是事件，是狀態", () => {
    const ctl = inCombat();
    const seat = [...ctl.seats.values()][0]!;
    const eid = seat.entityId as EntityId;
    const ab = ctl.world.abilities.get(eid)!;

    // ⭐ 找一格**真的有 `toggle`** 的技能，⛔ 不假設是哪一支、哪一槽。
    let slot: CastableSlot | null = null;
    for (const s of CASTABLE_SLOTS) {
      const id = s === "EX" ? ab.exSlot?.abilityId : s === "PASSIVE" ? undefined : ab.slots[s as "Q"]?.abilityId;
      if (id && Abilities.get(id)?.toggle) { slot = s; break; }
    }
    if (!slot) {
      // 這位英雄身上沒有開關技 —— 直接用引擎的開啟出口在任一格上開一個。
      // ⚠️ 這不是放水：承重的是**投影**，⛔ 不是「哪支技能有開關」。
      slot = "Q";
      enterToggle(ctl.world, eid, slot, { toggle: {} } as never);
    }
    expect(isToggleOn(ab, slot), "前提：sim 這邊真的開著").toBe(true);

    const mask = freshMaskOf(ctl, seat.seatId);
    expect(
      toggleMaskHas(mask, CASTABLE_SLOTS.indexOf(slot)),
      "⛔ sim 開著而線路上是關的 ⇒ 玩家按下去圖示不會有任何變化（失敗形態②）",
    ).toBe(true);
  });

  it("★② 沒開的那幾格一顆 bit 都不要亮 —— ⛔ 不可以整條點滿了事", () => {
    const ctl = inCombat();
    const seat = [...ctl.seats.values()][1]!;
    const ab = ctl.world.abilities.get(seat.entityId as EntityId)!;
    const mask = freshMaskOf(ctl, seat.seatId);
    for (let i = 0; i < CASTABLE_SLOTS.length; i++) {
      const s = CASTABLE_SLOTS[i]!;
      if (isToggleOn(ab, s)) continue;
      expect(toggleMaskHas(mask, i), `${s} 沒開，線路上不該亮`).toBe(false);
    }
  });
});
