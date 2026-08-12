/**
 * 攻速解鎖上限 (GH#286) —— owner:「一般上限是 4.0,搭配特殊條件如技能、道具...
 * 等效果,可以解鎖最多到 10.0」.
 *
 * ⚠️ 每一條斷言都被設計成**分得出對錯兩種實作**,而不只是「跑得過」:
 *   · 「取 max 不疊加」不是斷言 `=== 7`,而是同時斷言 `!== 12` —— 只寫前者的話,
 *     一個把兩個來源相加的實作在 (5,7) 之外的某些數字上仍會通過。
 *   · 「硬上限 10.0」用 `CapRaise 999` 來問,因為 999 和 10 差得夠遠,任何
 *     「解鎖 = 直接採用 value」的實作都會被抓到。
 *   · 「缺文件 → 出貨預設」直接量 sim 的最終攻速,不是量 `statCapsFromDoc` 的
 *     回傳值 —— 回空表的 bug 的症狀是「解鎖技能沒有效果」,不是「函式回傳 {}」
 *     (失敗形狀 ⑦:掃屬性而非行為)。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import { Stat, STAT_CLAMPS } from "./stats/statTypes";
import { ModOp } from "./stats/modifiers";
import { attachSource, buffExpirySystem, recomputeStats } from "./stats/statPipeline";
import {
  CAPPABLE_STATS,
  DEFAULT_STAT_CAPS,
  capFor,
  effectiveCap,
  normalizeStatCaps,
  statCapsFromDoc,
} from "./statCaps";
import { finalizeStat } from "./baseBonus";

beforeAll(() => registerSkeletonContent());

/** A champion with a huge FLAT attack-speed bonus, so the CLAMP is what decides. */
function pinned(world: SimWorld): EntityId {
  const c = SKELETON_ARENA.zones[0]!.center;
  const id = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x, z: c.z },
    zone: 0,
  });
  attachSource(world, id, {
    id: "t:as-flood",
    kind: "buff",
    modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.Flat, value: 999 }],
  });
  recomputeStats(world, id);
  return id;
}

const asOf = (w: SimWorld, id: EntityId): number => w.stats.get(id)!.final[Stat.AttackSpeed];

describe("屬性上限:一般 4.0 / 解鎖 10.0 (statcaps)", () => {
  it("沒有任何解鎖來源時,攻速被夾在 4.0", () => {
    cover("statcaps-normal-cap");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const id = pinned(w);
    expect(asOf(w, id)).toBe(4.0);
    // 而且**不是**解鎖上限:一個把 unlocked 當成常態上限的實作會給 10。
    expect(asOf(w, id)).not.toBe(10.0);
  });

  it("一個 CapRaise 6.0 的 buff → 夾在 6.0(不是 4.0,也不是 10.0)", () => {
    cover("statcaps-raise-partial");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const id = pinned(w);
    attachSource(w, id, {
      id: "buff:unlock6",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: 6.0 }],
    });
    recomputeStats(w, id);
    expect(asOf(w, id)).toBe(6.0);
    expect(asOf(w, id)).not.toBe(4.0); // CapRaise 被忽略的實作
    expect(asOf(w, id)).not.toBe(10.0); // 「有解鎖就直接開到硬上限」的實作
  });

  it("CapRaise 999 → 夾在 10.0,硬上限擋得住", () => {
    cover("statcaps-hard-ceiling");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const id = pinned(w);
    attachSource(w, id, {
      id: "buff:unlock-absurd",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: 999 }],
    });
    recomputeStats(w, id);
    expect(asOf(w, id)).toBe(10.0);
  });

  it("兩個 CapRaise (5 和 7) → 7,**不是 12** —— 取 max,不疊加", () => {
    cover("statcaps-max-not-sum");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const id = pinned(w);
    attachSource(w, id, {
      id: "buff:unlock5",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: 5 }],
    });
    attachSource(w, id, {
      id: "buff:unlock7",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: 7 }],
    });
    recomputeStats(w, id);
    expect(asOf(w, id)).toBe(7);
    // 疊加的實作會給 min(12, 10) = 10;先到先贏的實作會給 5。三個答案互不相同,
    // 所以這一條真的分得出實作。
    expect(asOf(w, id)).not.toBe(10);
    expect(asOf(w, id)).not.toBe(5);
  });

  it("順序無關:先掛 7 再掛 5 仍然是 7", () => {
    cover("statcaps-max-not-sum");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const id = pinned(w);
    attachSource(w, id, {
      id: "buff:unlock7",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: 7 }],
    });
    attachSource(w, id, {
      id: "buff:unlock5",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: 5 }],
    });
    recomputeStats(w, id);
    expect(asOf(w, id)).toBe(7);
  });

  it("CapRaise 不乘 stacks —— 疊三層的 6.0 還是 6.0,不是 18", () => {
    cover("statcaps-no-stack-scale");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const id = pinned(w);
    attachSource(w, id, {
      id: "buff:unlock6x3",
      kind: "buff",
      stacks: 3,
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: 6 }],
    });
    recomputeStats(w, id);
    expect(asOf(w, id)).toBe(6);
  });

  it("比一般上限低的 CapRaise 是 no-op —— 解鎖不能拿來偷偷削弱", () => {
    cover("statcaps-lower-is-noop");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const id = pinned(w);
    attachSource(w, id, {
      id: "buff:unlock2",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: 2 }],
    });
    recomputeStats(w, id);
    expect(asOf(w, id)).toBe(4.0);
  });

  it("buff 過期後上限回到 4.0", () => {
    cover("statcaps-expiry");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const id = pinned(w);
    attachSource(w, id, {
      id: "buff:unlock-timed",
      kind: "buff",
      expiresAtTick: 30,
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: 9 }],
    });
    recomputeStats(w, id);
    expect(asOf(w, id)).toBe(9);

    // 絕對 tick 比較(這個 repo 的規矩),不是每 tick 遞減的計數器。
    w.tick = 30;
    buffExpirySystem(w);
    recomputeStats(w, id);
    expect(asOf(w, id)).toBe(4.0);
  });

  it("CapRaise 自己不給任何數值 —— 只有天花板動,值不動", () => {
    cover("statcaps-raise-is-not-a-bonus");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const c = SKELETON_ARENA.zones[0]!.center;
    const id = spawnChampion(w, {
      championId: "sela" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: c.x, z: c.z },
      zone: 0,
    });
    const before = asOf(w, id);
    expect(before).toBeLessThan(4.0); // 裸裝的英雄離天花板還很遠
    attachSource(w, id, {
      id: "buff:unlock-only",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: 10 }],
    });
    recomputeStats(w, id);
    expect(asOf(w, id)).toBe(before);
  });

  it("解鎖只作用在被指名的那條屬性 —— 攻速的解鎖不會鬆開移速", () => {
    cover("statcaps-per-stat");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const id = pinned(w);
    attachSource(w, id, {
      id: "buff:ms-flood",
      kind: "buff",
      modifiers: [
        { stat: Stat.MoveSpeed, op: ModOp.Flat, value: 999 },
        { stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: 10 },
      ],
    });
    recomputeStats(w, id);
    expect(asOf(w, id)).toBe(10);
    // ⚠️ 移速在 2026-08-12 之後**有自己的 stat-caps 一格**（owner：「上限是 10」），
    //    所以生效的上限不再是 `STAT_CLAMPS` 的上界 —— 那條只剩下界。
    //    ⛔ 從出貨表推導，不抄字面值（第四個住處）。
    expect(w.stats.get(id)!.final[Stat.MoveSpeed]).toBe(
      capFor(DEFAULT_STAT_CAPS, Stat.MoveSpeed).base,
    );
  });

  it("下限不受影響 —— 解鎖只搬天花板", () => {
    cover("statcaps-floor-untouched");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const c = SKELETON_ARENA.zones[0]!.center;
    const id = spawnChampion(w, {
      championId: "sela" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: c.x, z: c.z },
      zone: 0,
    });
    attachSource(w, id, {
      id: "buff:slow-to-death",
      kind: "buff",
      modifiers: [
        { stat: Stat.AttackSpeed, op: ModOp.PercentAdd, value: -5 },
        { stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: 10 },
      ],
    });
    recomputeStats(w, id);
    expect(asOf(w, id)).toBeCloseTo(0.2, 9);
  });
});

describe("後台調過的上限真的生效 (statcaps-table)", () => {
  it("把一般上限調到 5.0:沒有解鎖來源時就夾在 5.0", () => {
    cover("statcaps-admin-base");
    const w = new SimWorld(SKELETON_ARENA, 7);
    w.statCaps = normalizeStatCaps({ as: { base: 5.0, unlocked: 12.0 } });
    const id = pinned(w);
    expect(asOf(w, id)).toBe(5.0);
  });

  it("把解鎖上限調到 12.0:CapRaise 999 打得到 12.0", () => {
    cover("statcaps-admin-unlocked");
    const w = new SimWorld(SKELETON_ARENA, 7);
    w.statCaps = normalizeStatCaps({ as: { base: 5.0, unlocked: 12.0 } });
    const id = pinned(w);
    attachSource(w, id, {
      id: "buff:unlock-absurd",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: 999 }],
    });
    recomputeStats(w, id);
    expect(asOf(w, id)).toBe(12.0);
    // 寫死 10.0 的實作會在這裡紅。
    expect(asOf(w, id)).not.toBe(10.0);
  });

  it("⚠️ 缺內容文件 → 出貨預設,不是「退回 STAT_CLAMPS 而且不能解鎖」", () => {
    cover("statcaps-missing-doc-default");
    // 這是這個功能最貴的一個 bug:回空表的話,下面這一場的解鎖技能會完全沒有效果,
    // 而且不會有任何錯誤訊息。所以斷言寫在**行為**上,不是在函式回傳值上。
    const w = new SimWorld(SKELETON_ARENA, 7);
    w.statCaps = statCapsFromDoc(undefined); // 內容沒載到 / 還沒有這份文件
    const id = pinned(w);
    expect(asOf(w, id)).toBe(4.0);
    attachSource(w, id, {
      id: "buff:unlock-absurd",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: 999 }],
    });
    recomputeStats(w, id);
    expect(asOf(w, id), "缺文件時解鎖功能整個消失了 —— statCapsFromDoc 回了空表").toBe(10.0);
  });

  it("壞文件(schema 不符 / caps 不是物件)同樣退回出貨預設", () => {
    cover("statcaps-missing-doc-default");
    expect(statCapsFromDoc({ schema: "config.base-bonus@1", bonus: {} })).toBe(DEFAULT_STAT_CAPS);
    expect(statCapsFromDoc({ schema: "config.stat-caps@1", caps: null })).toBe(DEFAULT_STAT_CAPS);
    expect(statCapsFromDoc("nonsense")).toBe(DEFAULT_STAT_CAPS);
    // 但一份真的存在、只是空的文件,就是操作者的決定 —— 不覆寫他。
    expect(statCapsFromDoc({ schema: "config.stat-caps@1", caps: {} })).toEqual({});
  });
});

describe("statCaps 純函式 (statcaps-unit)", () => {
  it("capFor:表裡沒有 → STAT_CLAMPS 上界,而且 base === unlocked(不可解鎖)", () => {
    cover("statcaps-unit");
    const c = capFor({}, Stat.AttackSpeed);
    expect(c.base).toBe(STAT_CLAMPS[Stat.AttackSpeed]![1]);
    expect(c.unlocked).toBe(c.base);
    // 完全沒有夾限的屬性:兩邊都是 +∞
    const hp = capFor({}, Stat.MaxHealth);
    expect(hp.base).toBe(Number.POSITIVE_INFINITY);
    expect(hp.unlocked).toBe(Number.POSITIVE_INFINITY);
  });

  it("effectiveCap = clamp(max(base, raised), base, unlocked)", () => {
    cover("statcaps-unit");
    const t = DEFAULT_STAT_CAPS;
    expect(effectiveCap(t, Stat.AttackSpeed, 0)).toBe(4);
    expect(effectiveCap(t, Stat.AttackSpeed, 3)).toBe(4); // 比 base 低 = no-op
    expect(effectiveCap(t, Stat.AttackSpeed, 6)).toBe(6);
    expect(effectiveCap(t, Stat.AttackSpeed, 10)).toBe(10);
    expect(effectiveCap(t, Stat.AttackSpeed, 1e9)).toBe(10);
    expect(effectiveCap(t, Stat.AttackSpeed, Number.NaN)).toBe(4);
  });

  it("normalizeStatCaps 丟掉未知 key / 非數值,並修正 unlocked < base", () => {
    cover("statcaps-unit");
    const t = normalizeStatCaps({
      as: { base: 4, unlocked: 10 },
      nonsense: { base: 1, unlocked: 2 },
      ms: { base: "x", unlocked: 3 },
      cdr: { base: 0.6, unlocked: 0.2 },
    });
    expect(t[Stat.AttackSpeed]).toEqual({ base: 4, unlocked: 10 });
    expect((t as Record<string, unknown>).nonsense).toBeUndefined();
    expect(t[Stat.MoveSpeed]).toBeUndefined();
    expect(t[Stat.CooldownReduction]).toEqual({ base: 0.6, unlocked: 0.6 });
  });

  it("CAPPABLE_STATS 覆蓋每一條有夾限的屬性 + 出貨表列的每一條", () => {
    cover("statcaps-unit");
    for (const s of Object.keys(STAT_CLAMPS) as Stat[]) expect(CAPPABLE_STATS).toContain(s);
    for (const s of Object.keys(DEFAULT_STAT_CAPS) as Stat[]) expect(CAPPABLE_STATS).toContain(s);
  });

  it("finalizeStat 缺 caps 時吃出貨預設,不是空表", () => {
    cover("statcaps-unit");
    // 空表 → capFor 退回 STAT_CLAMPS 且不可解鎖 → capRaise 10 會被吃掉。
    expect(finalizeStat(99, Stat.AttackSpeed, { capRaise: 10 })).toBe(10);
    expect(finalizeStat(99, Stat.AttackSpeed, { caps: {}, capRaise: 10 })).toBe(4);
    expect(finalizeStat(99, Stat.AttackSpeed, {})).toBe(4);
  });
});
