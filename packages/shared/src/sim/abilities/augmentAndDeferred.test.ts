/**
 * 2026-08-13 三個引擎機制的**承重守衛**（第二守則）。
 *
 * 三個都是同一種缺陷：**產出得了、沒有消費端**（失敗形態②）——
 * schema 收、後台畫得出、對外契約說 supported，而場上什麼都不會發生。
 * ⛔ 所以斷言讀的是**最終效果樹**（改寫後真的長什麼樣），
 *    不是「欄位存在嗎」那種掃屬性的假守衛（失敗形態⑦）。
 *
 * ⛔ 驗**機制**不驗**數字**（第二守則）：下面沒有任何一個出貨值被抄進斷言，
 *    夾具用的是測試自己造的小樹。
 *
 * 突變紀錄（一批一條，挑最承重的那一條線）：
 *   · `effectChildChains.ts` 的 `EFFECT_CHILD_CHAINS` 拿掉 `"effects"` 那一列
 *     → **typecheck 與 vitest 同時紅**（型別窮盡斷言 + 這裡的 randomArea 那條）
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../testkit/cover";
import { applyAugmentToEffects } from "./abilityAugment";
import { rebaseTriggerForDeferred, DEFERRED_RESOLVE_PASS } from "../effects/deferredTrigger";
import type { EffectDef } from "../effects/effect";

/** 深度搜尋：這棵樹裡所有 `damage` 節點的 AP 係數。 */
function apCoeffs(nodes: readonly EffectDef[]): number[] {
  const out: number[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return void n.forEach(walk);
    if (n === null || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    const amt = o.amount as { ratios?: { stat: string; coeff: number }[] } | undefined;
    if (o.kind === "damage" && amt?.ratios) {
      for (const r of amt.ratios) if (r.stat === "ap") out.push(r.coeff);
    }
    Object.values(o).forEach(walk);
  };
  walk(nodes);
  return out;
}

describe("2026-08-13 的三個引擎機制真的有消費端", () => {
  it("⭐ E2 · 跨技能強化走得進**巢狀子鏈** —— 70-002 的傷害住在 randomArea 裡", () => {
    cover("augment-nested-chains");
    // 一棵「傷害不在頂層」的樹：randomArea → effects[] → damage。
    // ⛔ 上一版的 rewriter 只走 onHit / onLand / branches 三個名字，所以這棵樹
    //    被強化之後**一點傷害都不會多**，而卡片、後台、對外契約全部說它 supported。
    const tree: EffectDef[] = [
      {
        kind: "randomArea",
        shape: "circle",
        radius: 5,
        count: 3,
        effects: [{ kind: "damage", damageType: "magic", amount: { ratios: [{ stat: "ap", coeff: 1 }] } }],
      } as unknown as EffectDef,
    ];
    const before = apCoeffs(tree);
    const after = apCoeffs(
      applyAugmentToEffects(tree, [{ op: "damageCoeffAp", mode: "add", value: 5 }]),
    );
    expect(before, "夾具前提：樹裡本來就有一個 AP 係數").toHaveLength(1);
    expect(after[0]!, "巢狀在 randomArea.effects[] 裡的傷害被改寫了").toBeGreaterThan(before[0]!);
  });

  it("⭐ E3-lite · 強化改得到**逐階**持續時間（三個住處都要）", () => {
    cover("augment-rank-scalar");
    // `championForm.durationSec` 出貨是 [6,9,12,15]；`applyBuff` 另有 perRank[].duration
    // 且**它贏過**頂層 duration。⛔ 只改頂層等於什麼都沒改（77-002 踩的正是這一格）。
    const tree: EffectDef[] = [
      {
        kind: "applyBuff",
        modifiers: [],
        duration: 6,
        perRank: [{ modifiers: [], duration: 6 }, { modifiers: [], duration: 9 }],
      } as unknown as EffectDef,
    ];
    const out = applyAugmentToEffects(tree, [
      { op: "durationSec", mode: "set", value: 30 },
    ]) as unknown as { duration: number; perRank: { duration: number }[] }[];
    expect(out[0]!.duration, "頂層那一格").toBe(30);
    // ⭐ 承重的一半：逐階區塊**贏過**頂層，所以它沒被改到就等於整條強化是死的。
    expect(
      out[0]!.perRank.map((r) => r.duration),
      "每一階都要被改到 —— owner「增加**至** N」= 取代不是相加",
    ).toEqual([30, 30]);
  });

  it("⭐ E1 · 觸發脈絡跨 tick 要**定基**，⛔ 不是原封搬過去", () => {
    cover("deferred-trigger-rebase");
    const trig = {
      raw: 100,
      mitigated: 80,
      hpLost: 80,
      origin: "ability:x",
      type: "magic",
      reflectDepth: 1,
      resolvePass: 3,
    } as unknown as Parameters<typeof rebaseTriggerForDeferred>[0];
    const out = rebaseTriggerForDeferred(trig) as unknown as Record<string, unknown>;
    // ⭐ 只有 resolvePass 該動：它是「那一個 tick 的排空迴圈」的性質，搬到未來就是
    //    型別對、語意錯 —— 一發在第 3 輪落地的反彈所觸發的延遲酬載會被閘門整串丟掉，
    //    症狀是「這招**有時候**完全沒傷害」。
    expect(out.resolvePass, "定基到排空迴圈之外").toBe(DEFERRED_RESOLVE_PASS);
    // ⛔ reflectDepth 絕對不可以一起歸零：反彈鏈的終止性整個掛在它嚴格遞增上，
    //    歸零 = A↔B 互彈變成無界迴圈，而**沒有任何東西會報錯**。
    expect(out.reflectDepth, "鏈深度原封不動（終止性掛在它身上）").toBe(1);
    expect(out.mitigated, "封包自己的讀數原封不動").toBe(80);
    // 冪等 —— 巢狀 delayed 會再定基一次。
    expect(rebaseTriggerForDeferred(out as never)).toEqual(out);
  });
});
