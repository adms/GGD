/**
 * LoL 四段穿透 + 雙分支減傷 —— 守衛。
 *
 * ⛔ 驗**機制**不驗**數字**：每一條斷言不是「方向」（負抗性嚴格更痛）就是
 * 「等式」（100% 穿透 ≡ 沒有護甲），所以 owner 把 `negativeResistAmplifyCeiling`
 * 從 2.0 調成 1.5 一條都不會紅。出貨值住在 `content/config/mitigation.json` +
 * `DEFAULT_MITIGATION_RULES`，⛔ 不在這裡抄第四份。
 *
 * ⚠️ 承重突變（做過，見 commit message）：
 *   M1 `mitigationMult` 的負分支改回 `100/(100+Math.max(0,resist))`
 *   M2 `mitigate()` 裡拿掉 `resolvePenetration(...)`（直接用 `raw`）
 *   M3 `resistAfterPenetration` 的 `if (raw <= 0) return raw` 刪掉
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import type { ItemDoc } from "../../content/schema/item";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { zeroStats, Stat } from "../stats/statTypes";
import { attachSource } from "../stats/statPipeline";
import { itemModifierSource } from "../economy/itemSource";
import { combatResolveSystem } from "./damage";
import { mitigationMult, resistAfterPenetration, NO_PENETRATION } from "./penetration";
import type { ItemDef } from "../content/defs";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";
import * as V from "../math/vec2";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;
const K = 2; // 只是這個檔的算術用的 k，⛔ 不是對出貨值的斷言

/** 一個有真的 StatsComp 的靶（`resist` 直接寫進 final —— 那就是 `mitigate()` 讀的東西）。 */
function dummy(world: SimWorld, seat: number, x: number, resist?: number): EntityId {
  const id = world.spawn();
  world.transform.set(id, { pos: { x, z: 14 }, vel: V.v2(), facing: { x: 1, z: 0 }, radius: 0.6, zone: 0 });
  world.health.set(id, { hp: 1e6, maxHp: 1e6, mana: 0, maxMana: 0, alive: true, shields: [] });
  world.team.set(id, { teamId: asTeamId(seat), seatId: asSeatId(seat) });
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  world.status.set(id, { effects: [] });
  if (resist !== undefined) {
    const final = zeroStats();
    final[Stat.Armor] = resist;
    final[Stat.MagicResist] = resist;
    world.stats.set(id, { championId: "dummy" as ChampionId, final, dirty: false, sources: [] });
  }
  return id;
}

function hpLost(
  world: SimWorld,
  source: EntityId,
  target: EntityId,
  type: "physical" | "magic" | "true",
  origin = "basic",
): number {
  const before = world.health.get(target)!.hp;
  world.damageQueue.push({ source, target, amount: 400, type, crit: false, origin });
  combatResolveSystem(world);
  const lost = before - world.health.get(target)!.hp;
  world.health.get(target)!.hp = 1e6;
  return lost;
}

describe("雙分支曲線", () => {
  it("負抗性放大傷害，正抗性減傷 —— 而且接縫在 R=0 連續（不需要特判）", () => {
    // M1：負分支改回 max(0, resist) ⇒ 第一條與第三條紅。
    expect(mitigationMult(-30, K)).toBeGreaterThan(mitigationMult(0, K));
    expect(mitigationMult(0, K)).toBeGreaterThan(mitigationMult(30, K));
    expect(mitigationMult(0, K)).toBe(1);
    expect(mitigationMult(-1e-9, K)).toBeCloseTo(1, 9);
    // 越負越痛，且**永遠達不到** ceiling（漸近極限，⛔ 不是 clamp —— 一個
    // `Math.min(k, …)` 會讓下面第二條變成相等而紅）。
    expect(mitigationMult(-1e6, K)).toBeGreaterThan(mitigationMult(-100, K));
    expect(mitigationMult(-1e6, K)).toBeLessThan(K);
  });

  it("ceiling = 1.0 就是一鍵 rollback —— 負抗性逐位元等於 0 抗性", () => {
    for (const r of [-1, -30, -1e6]) expect(mitigationMult(r, 1)).toBe(mitigationMult(0, 1));
  });
});

describe("段③④ —— 穿透只能把抗性往 0 撈回來", () => {
  const pen = (p: Partial<typeof NO_PENETRATION>) => ({ ...NO_PENETRATION, ...p });

  it("對正抗性有效；對已經 ≤ 0 的抗性完全無效（LoL 明文）", () => {
    // M3：刪掉 `if (raw <= 0) return raw` ⇒ 第二、第三條紅（−27 被抹成 0 或 −13.5）。
    expect(resistAfterPenetration(100, pen({ armorPct: 1 }), true)).toBe(0);
    expect(resistAfterPenetration(-27, pen({ armorPct: 1 }), true)).toBe(-27);
    expect(resistAfterPenetration(-27, pen({ armorFlat: 999 }), true)).toBe(-27);
  });

  it("扁平穿透穿不破 0，而且 % 是乘法疊加不是加法", () => {
    expect(resistAfterPenetration(10, pen({ armorFlat: 999 }), true)).toBe(0);
    // 兩份 50% ⇒ 剩 (1−0.5)(1−0.5)，⛔ 不是 0。加法版會讓這一條變成 0。
    const twoHalves = 1 - (1 - 0.5) * (1 - 0.5);
    expect(resistAfterPenetration(100, pen({ armorPct: twoHalves }), true)).toBeGreaterThan(0);
    // 物理/魔法是**兩條平行的軸** —— 護甲穿透對魔法傷害無話可說。
    expect(resistAfterPenetration(100, pen({ armorPct: 1 }), false)).toBe(100);
  });
});

describe("接上 mitigate()", () => {
  /** 攻擊者帶一份 100% 護甲穿透（手寫 grant = 機制那一半）。 */
  function armed(world: SimWorld, id: EntityId): void {
    attachSource(world, id, {
      id: "test-pen",
      kind: "item",
      modifiers: [],
      penetration: { scope: "basic", armorPct: 1 },
    });
  }

  it("100% 穿透 ≡ 沒有護甲；但目標護甲為負時穿透無效，放大照樣生效", () => {
    // M2：`mitigate()` 拿掉 `resolvePenetration(...)` ⇒ 第一條紅（穿透整個消失，
    // 而畫面上只差一個數字 —— 失敗形態 ②）。
    const w = new SimWorld(SKELETON_ARENA, 42);
    // ⚠️ 攻擊者也要有 StatsComp —— 穿透住在 `StatsComp.sources` 上，一個沒有屬性表
    // 的來源（殭屍/守衛塔）拿不到任何授予。這正是下一條測的東西。
    const a = dummy(w, 0, Z0.center.x, 0);
    const bare = dummy(w, 1, Z0.center.x + 3, 0);
    const armored = dummy(w, 2, Z0.center.x + 6, 100);
    const broken = dummy(w, 3, Z0.center.x + 9, -30);
    const baseline = hpLost(w, a, bare, "physical");
    const brokenNoPen = hpLost(w, a, broken, "physical");
    armed(w, a);
    expect(hpLost(w, a, armored, "physical")).toBeCloseTo(baseline, 9);
    // 段③被規則跳過 ⇒ 帶槍與不帶槍打負護甲**一模一樣**，而兩者都比無護甲更痛。
    expect(hpLost(w, a, broken, "physical")).toBeCloseTo(brokenNoPen, 9);
    expect(brokenNoPen).toBeGreaterThan(baseline);
    // scope:"basic" ⇒ 技能不順便穿（那是一個 `Stat` 表達不出來的性質）。
    expect(hpLost(w, a, armored, "physical", "ability:x.q")).toBeLessThan(baseline);
  });

  it("真傷不吃放大；沒有屬性表的目標（殭屍）與來源都是嚴格 no-op", () => {
    const w = new SimWorld(SKELETON_ARENA, 42);
    const a = dummy(w, 0, Z0.center.x, 0);
    const broken = dummy(w, 1, Z0.center.x + 3, -30);
    const mob = dummy(w, 2, Z0.center.x + 6); // ⛔ 沒有 StatsComp
    const trueDmg = hpLost(w, a, broken, "true");
    expect(hpLost(w, a, broken, "physical")).toBeGreaterThan(trueDmg);
    // 沒有 StatsComp 的攻擊者不會爆炸，也拿不到穿透（`NO_PENETRATION`）。
    const before = hpLost(w, mob, broken, "physical");
    armed(w, a);
    expect(hpLost(w, mob, broken, "physical")).toBeCloseTo(before, 9);
    expect(hpLost(w, a, mob, "physical")).toBeCloseTo(trueDmg, 9);
  });
});

describe("出貨的穿透名冊", () => {
  let items: ItemDoc[];
  beforeAll(async () => {
    registerSkeletonContent();
    items = (await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store.all<ItemDoc>("items");
  });

  it("恰好只有霸王破甲槍，而且它不再是真傷（雙向 ratchet）", () => {
    const found = items
      .filter((d) => (d as { penetration?: unknown }).penetration !== undefined)
      .map((d) => d.id as string);
    expect(found).toEqual(["godie-i00f"]);
    const doc = items.find((i) => i.id === "godie-i00f")!;
    expect((doc as { penetration?: unknown }).penetration).toMatchObject({ scope: "basic", armorPct: 1 });
    // 第三守則：欄位由文案背書。owner 改了文案就要有人重讀機制。
    expect(doc.description ?? "").toContain("[穿透] 普攻無視敵方 100% 護甲");
    expect((doc as { damageTypeOverride?: unknown }).damageTypeOverride).toBeUndefined();
  });

  it("裝上出貨的那一份文件，普攻真的無視護甲", () => {
    const w = new SimWorld(SKELETON_ARENA, 42);
    const a = dummy(w, 0, Z0.center.x, 0);
    const b = dummy(w, 1, Z0.center.x + 3, 100);
    const before = hpLost(w, a, b, "physical");
    const def = items.find((i) => i.id === "godie-i00f") as unknown as ItemDef;
    attachSource(w, a, itemModifierSource(w, a, "godie-i00f" as ItemId, 0, def));
    expect(hpLost(w, a, b, "physical")).toBeGreaterThan(before);
    // ⚠️ MUTATION: 從 `stats/sourceGrants.ts` 刪掉 penetration 那一行轉發 ——
    // 夾具那一半全綠，只有這一條紅。
  });
});
