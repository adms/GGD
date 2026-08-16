/**
 * 聖杯願望三選一（GH#333）—— **一條承重的線**，不是每個機制各一條。
 *
 * 這一批的承重線是：**「靈基適性條件真的把發不動的願望擋在卡池外」**。
 * 拿掉 `offerAugments` 裡那一句 `admissible(a)`，60 張願望照樣全部載入、
 * 照樣全部通過 Zod、畫面上照樣是三張卡 —— 而「成功反彈時⋯」會發給一位
 * 根本產不出反彈的英雄（實測全 repo 只有 1 支技能產得出反彈）。
 * 那正是七種失敗形態的第 ②：做出來了，但這一半從來沒有到玩家手上。
 *
 * ⛔ 刻意**不驗**的東西（第零守則②③⑦・第二守則「驗機制不驗數字」）：
 *   · 每一張願望的效果數字（那是 owner 每週在調的內容，住 `content/`）
 *   · 六條 `MECHANIC_PROBES` 各自一條測試（TypeScript 的
 *     `Record<GrailMechanic, …>` 已經擋住「加了名字忘了推導」）
 *   · `slotDiversityEnabled` 關掉的那一條路（第〇·六：測試只做預設啟動那一邊）
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { Augments } from "../content/registry";
import { offerAugments } from "./draft";
import { grailWishEligible, hasMechanic, modeFeaturesFor } from "./augmentEligibility";
import type { AugmentDef } from "../content/defs";
import type { AugmentId, EntityId } from "../../ids";

const TAG = "grail-wishes";

/** 一位最小的英雄：有隊伍、有 champion、有 stats，⛔ 沒有任何迴避／反彈來源。 */
function seatWorld(): { world: SimWorld; me: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 1);
  const me = 1 as EntityId;
  world.team.set(me, { teamId: 0 as never, seatId: 0 as never });
  world.champion.set(me, {
    championId: "x" as never,
    level: 1, xp: 0, gold: 0,
    items: [], augments: [],
    statStacks: 0, attrBonus: { str: 0, agi: 0, int: 0 }, statCapstonePct: 0,
    pendingOrbSlots: 0, undoStack: [],
  } as never);
  return { world, me };
}

function wish(id: string, over: Partial<AugmentDef>): AugmentDef {
  return {
    id: id as AugmentId, name: id, description: id,
    tier: "silver", weight: 100, tags: ["grail-wish"], ...over,
  } as AugmentDef;
}

describe("靈基適性條件（設計規則 §15 禁止死願望）", () => {
  it("★ 承重：機制不成立的願望**進不了卡池**，而不是進了之後什麼都不做", () => {
    cover(TAG);
    const { world, me } = seatWorld();
    Augments.clear();
    // 兩張同階同權重，差別只在其中一張要求身上有【反彈】來源。
    Augments.register("open" as AugmentId, wish("open", {}));
    Augments.register(
      "needs-reflect" as AugmentId,
      wish("needs-reflect", { eligibility: { requiresSelfMechanic: ["reflect"] } }),
    );

    const offer = offerAugments(world, me, "silver", 2);
    expect(offer.choices, "發不動的願望被發出去了（死願望）").toEqual(["open"]);

    // 對照組：閘關掉就兩張都發得出來 —— 證明差異來自這道閘，不是來自別的過濾。
    world.grailDraft = { ...world.grailDraft, eligibilityEnabled: false };
    expect(offerAugments(world, me, "silver", 2).choices).toHaveLength(2);
  });

  it("★ 舊增益卡是**偏好**不是硬閘：聖杯願望優先，但湊不滿時寧可補舊卡也不發空卡", () => {
    cover(TAG);
    const { world, me } = seatWorld();
    Augments.clear();
    Augments.register("legacy" as AugmentId, wish("legacy", { tags: ["offense"] }));
    Augments.register("grail" as AugmentId, wish("grail", {}));

    // 一張的位子 → 偏好贏，舊卡不出現（設計規則 §8「⛔ 禁止純屬性增益」）。
    expect(offerAugments(world, me, "silver", 1).choices).toEqual(["grail"]);
    // 兩張的位子而聖杯願望只有一張 → ⛔ 不可以發成一張。
    // （骨架內容樹一張願望都沒有，純 exclude 會讓整個三選一消失而畫面上只是「沒跳卡」。）
    expect(offerAugments(world, me, "silver", 2).choices).toHaveLength(2);
  });

  it("★ 缺席的條件 = 無條件；模式特徵從主機已經武裝的規則區塊推導", () => {
    cover(TAG);
    const { world, me } = seatWorld();
    const features = modeFeaturesFor(world, me);
    expect(grailWishEligible(world, me, undefined, features)).toBe(true);
    // 火圈／復活／小怪三個規則區塊都沒灌 → 三個特徵都不成立，要求它們的願望發不出來。
    expect(features.has("fireRing")).toBe(false);
    expect(grailWishEligible(world, me, { requiresModeFeature: ["fireRing"] }, features)).toBe(false);
    // 身上什麼都沒有 → 六個機制一個都不成立。
    expect(hasMechanic(world, me, "evasion")).toBe(false);
  });
});
