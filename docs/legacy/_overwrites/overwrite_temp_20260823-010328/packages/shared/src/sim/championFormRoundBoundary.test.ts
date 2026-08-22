/**
 * GH#579 —— **回合結算的那一刻，變身就還原了**。
 *
 * `endCombatChampionForms` 在這之前是 repo 裡**零呼叫者**的一支函式（它自己的單元
 * 測試 `championForm.test.ts:342` 一直是綠的 —— 失敗形態⑤：被測的不是出貨的那條
 * 路），而 `ChampionFormSystem.ts` 的檔頭逐字寫著「a form is a WITHIN-ROUND state…
 * cannot leak across the intermission」。**那句話是假的，沒有任何東西會紅。**
 * 出貨內容真的踩得到：8 個 `{"to":"toggle"}` 且沒有 `durationSec` 的形態
 * （`expiresTick = FORM_NEVER_EXPIRES`，其中兩支是 passive）永遠不會自己到期，
 * 活著的人身上沒有任何清除路徑 ⇒ 下一回合開場仍然是變身後的模型／技能組／屬性。
 *
 * ⛔ 斷言讀 `world.championForm` / `world.champion` 這兩個**最終物件**，
 * ⛔ 不掃原始碼字串 —— `roundResetPools.test.ts` 掃的 `restoreForNextRound`
 * 本來就不碰 `championForm`，對這個缺陷永遠是綠的。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { MatchController, type SeatSpec } from "../../../../apps/game-server/src/match/MatchController";
import { applyChampionForm, FORM_NEVER_EXPIRES } from "./systems/ChampionFormSystem";
import { Champions } from "./content/registry";
import type { ChampionId } from "../ids";

/** 短相位：只是要走過一次回合邊界。戰鬥短到沒有人會死 —— 死亡是**另一條**清除路徑。 */
const CFG = { champSelectTicks: 2, intermissionTicks: 2, combatMaxTicks: 30, resolutionTicks: 2 };
const ALT_ID = "form-round-boundary-alt" as ChampionId;

function runTo(ctl: MatchController, ok: () => boolean): void {
  let guard = 0;
  while (!ok() && guard++ < 5000) ctl.tick();
  expect(guard).toBeLessThan(5000);
}

describe("GH#579 回合結算 → 變身還原", () => {
  it("★ 一個**永不到期**的切換形態，撐不過回合結算", () => {
    cover("champion-form-round-boundary");
    const seats: SeatSpec[] = Array.from({ length: 12 }, (_, i) => ({
      seatId: i,
      teamId: Math.floor(i / 3),
      isBot: true,
    }));
    const ctl = new MatchController("gh579", 7, seats, CFG);
    runTo(ctl, () => ctl.phase.phase === "combat");

    const entity = [...ctl.seats.values()].find((s) => s.entityId !== null)!.entityId!;
    const baseId = ctl.world.champion.get(entity)!.championId;
    // 出貨 26 對變身的形狀：base 指向一個 `role: "alternate"` 的對手身體。
    // 骨架內容沒有任何一對，所以在這裡接一對上去（與 `championForm.test.ts` 同法）。
    const baseDoc = Champions.get(baseId);
    Champions.register(ALT_ID, { ...baseDoc, id: ALT_ID, name: "alt", modelKey: "champ.alt" });
    Champions.register(baseId, {
      ...baseDoc,
      transform: {
        role: "base",
        counterpartId: ALT_ID,
        normalUnitRawcode: "H00X",
        alternateUnitRawcode: "H00Y",
        triggerAbility: { rawcode: "A000", name: "99-01 測試變身" },
      },
    });

    // 出貨 toggle 的逐字參數：`durationSec` 缺席 ⇒ 永不到期。
    expect(applyChampionForm(ctl.world, entity, "toggle", undefined, { origin: "test" })).toBe(true);
    expect(ctl.world.championForm.get(entity)!.expiresTick).toBe(FORM_NEVER_EXPIRES);
    expect(ctl.world.champion.get(entity)!.championId).toBe(ALT_ID);

    runTo(ctl, () => ctl.phase.phase === "resolution");
    // 夾具本身要有意義：他**活著**走出戰鬥 —— 所以下面兩行不可能是死亡那條路做的。
    expect(ctl.world.health.get(entity)!.alive).toBe(true);

    // 靶（突變）：刪掉 `concludeCombat` 裡那一行 `endCombatChampionForms`
    // → 這四行全部紅（形態帶著 ALT 身體整段跨進下一回合的 combat）。
    expect(ctl.world.championForm.size).toBe(0);
    expect(ctl.world.champion.get(entity)!.championId).toBe(baseId);

    runTo(ctl, () => ctl.phase.phase === "intermission");
    expect(ctl.world.championForm.size).toBe(0);
    expect(ctl.world.champion.get(entity)!.championId).toBe(baseId);
  });
});
