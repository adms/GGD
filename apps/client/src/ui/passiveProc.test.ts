/**
 * ⭐ GH#576 的**純**那一半：認得出「這是哪一支技能的被動」、節流、以及內部冷卻的
 * 讀數（owner 2026-08-23：「例如初號機暴走都看不出來有沒有生效**冷卻剩多少**」）。
 *
 * ⚠️ 來源 id 一律由 sim 那兩支函式**產出**，⛔ 不手打字面值 —— 手打的那一份是
 * 第二個住處，而它 drift 的症狀是「被動再也不閃了」（畫面上跟「這一場沒觸發」
 * 一模一樣）。
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  abilityPassiveSourceId,
  abilityToggleSourceId,
} from "@ggd/shared/sim/abilities/abilityPassives";
import { DEFAULT_UI_CUES } from "@ggd/shared/content";
import {
  notePassiveProc,
  passiveHookIcdSeconds,
  passiveIcdSample,
  passiveProcAbilityId,
  resetPassiveProc,
} from "./passiveProc";

beforeEach(() => resetPassiveProc());

describe("passiveProcAbilityId — 一條規則涵蓋每一支被動 (GH#576)", () => {
  it("認得被動與切換技兩種來源，⛔ 但不認主動施放", () => {
    expect(passiveProcAbilityId(`hook:${abilityPassiveSourceId("godie-e00r.passive")}`)).toBe(
      "godie-e00r.passive",
    );
    expect(passiveProcAbilityId(`hook:${abilityToggleSourceId("godie-u01d.q")}`)).toBe(
      "godie-u01d.q",
    );
    // 主動施放走的是 castBegin/abilityCast 那條路 —— 這裡認出來會讓一次施放閃兩下。
    expect(passiveProcAbilityId("ability:godie-e00r.q")).toBeNull();
    // 道具/增益卡的 hook 也帶 origin，但它們沒有格子可閃。
    expect(passiveProcAbilityId("hook:item:serrated-edge")).toBeNull();
    expect(passiveProcAbilityId(undefined)).toBeNull();
  });
});

describe("內部冷卻的讀數 (GH#576 的第二半)", () => {
  it("秒數從技能文件來（⛔ 不是抄一份數字），而且取最長的那一條 hook", () => {
    const def = {
      passive: {
        ranks: [{ hooks: [{ internalCooldown: 12 }, { internalCooldown: 150 }] }, { hooks: [] }],
      },
    };
    expect(passiveHookIcdSeconds(def)).toBe(150);
    expect(passiveHookIcdSeconds({ passive: { ranks: [{ hooks: [{}] }] } })).toBe(0);
    expect(passiveHookIcdSeconds(undefined)).toBe(0);
  });

  it("觸發之後倒數，走完就不畫了", () => {
    notePassiveProc("PASSIVE", 10, 1000);
    const mid = passiveIcdSample("PASSIVE", 4000)!;
    expect(mid.secsLeft).toBeCloseTo(7, 5);
    expect(mid.maxSec).toBe(10);
    expect(passiveIcdSample("PASSIVE", 11_001)).toBeNull();
    // 沒有內部冷卻的被動⛔ 不畫一條假的冷卻條
    notePassiveProc("Q", 0, 1000);
    expect(passiveIcdSample("Q", 1100)).toBeNull();
  });

  it("⭐ 被節流吃掉的那一次仍然把冷卻起點往前推", () => {
    const gap = DEFAULT_UI_CUES.passiveFlashThrottleMs;
    expect(notePassiveProc("EX", 10, 1000)).toBe(true);
    // 窗口內的第二次：⛔ 不閃
    expect(notePassiveProc("EX", 10, 1000 + gap / 2)).toBe(false);
    // ⋯但冷卻是從**第二次**起算的（滿格），⛔ 不是停在第一次的時間上
    expect(passiveIcdSample("EX", 1000 + gap / 2)!.secsLeft).toBeCloseTo(10, 5);
    // 窗口過了就又閃得起來
    expect(notePassiveProc("EX", 10, 1000 + gap + 1)).toBe(true);
  });
});
