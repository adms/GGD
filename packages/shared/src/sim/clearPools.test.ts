/**
 * `clearPools` 的行為守衛（A4a，#278）。
 *
 * ── 這一檔要釘死的三件事 ──────────────────────────────────────────────────
 *
 *  ①  `dispellable` **是一道閘**，不是一個沒人讀的欄位。
 *      ⚠️ 這正是 `sim/effects/invulnerable.ts` 檔頭那張字條擔心的東西
 *      （「整個 sim 沒有任何 dispel/purge 原語(grep 過:零個站點)…等 dispel
 *      這根軸真的存在再加」）。加了欄位而沒有人讀，就是又一個那種欄位。
 *
 *  ②  `order` **不是裝飾**。`count` 砍不完時「留下哪幾筆」必須是決定性的。
 *      ⛔ 這條同時是**純度**守衛：沒有全序就是靠陣列插入序決定拔誰，
 *      而那是 #198 那一族 desync 的形狀。
 *
 *  ③  `world.dot` **真的拔得到，而且復活也真的碰得到它**。
 *      這是 A4 順手修掉的既有漏洞 —— `effects/dotTick.ts` 的檔頭自己寫著
 *      「the host's round reset … knows nothing about `world.dot`」，
 *      而復活那條路也一樣。死前的燃燒會跟著復活的身體回來。
 *
 * ── 為什麼每一條都跑真的 `SimWorld` ───────────────────────────────────────
 * 「陣列被 filter 過了」是屬性（失敗形態 ⑦）。這裡讀的是**下一格 tick 之後**
 * 血條與 `world.dot` 的實際狀態，也就是玩家看得到的那一個。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, SELA } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { clearPools, clearForFreshBody } from "./clearPools";
import { reviveChampionAt } from "./revive";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import type { StatusEffect } from "./components";
import type { DotInstance } from "./effects/dot";

const TAG = "sim-clear-pools";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;

function stage(): { world: SimWorld; hero: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 7);
  world.combatActive = true;
  const hero = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  world.step(new Map());
  return { world, hero };
}

/** 一筆減速。`expires` 是**絕對** tick（sim/purity 的規矩）。 */
function slow(
  world: SimWorld,
  id: EntityId,
  statusId: string,
  expires: number,
  extra: Partial<StatusEffect> = {},
): void {
  const st = world.status.get(id) ?? { effects: [] };
  st.effects.push({
    statusId: statusId as StatusEffect["statusId"],
    sourceId: `src:${statusId}`,
    expiresAtTick: expires,
    moveSpeedMult: 0.7,
    ...extra,
  });
  world.status.set(id, st);
}

function burn(world: SimWorld, id: EntityId, origin: string, extra: Partial<DotInstance> = {}): void {
  const list = world.dot.get(id) ?? [];
  const inst: DotInstance = {
    sourceId: id,
    origin,
    damageType: "magic",
    amountPerTick: 10,
    expiresAtTick: world.tick + 300,
    // ⚠️ 欄位名是 `nextTick` / `intervalTicks`（見 dot.ts 的「EXACTLY SEVEN
    // FIELDS」那段）。第一版寫成 `nextTickAt` / `tickEveryTicks`，而
    // `as DotInstance` 把錯誤整個蓋掉 —— 燃燒一跳都沒有發生，測試卻只說
    // 「血沒有變少」。**不要用 `as` 建 fixture**，讓型別檢查幫你。
    nextTick: world.tick + 30,
    intervalTicks: 30,
    ...extra,
  };
  list.push(inst);
  world.dot.set(id, list);
}

const statusIds = (w: SimWorld, id: EntityId): string[] =>
  (w.status.get(id)?.effects ?? []).map((e) => String(e.statusId));

// ===========================================================================
describe("① dispellable 是一道閘（兩個方向都驗）", () => {
  it("★ 只有標了可驅散的那一筆消失，另一筆的 expiresAtTick 一格都沒動", () => {
    cover(TAG);
    const s = stage();
    slow(s.world, s.hero, "can-go", 999, { dispellable: true });
    slow(s.world, s.hero, "cannot-go", 888, { dispellable: false });

    clearPools(s.world, s.hero, {
      pools: { status: true },
      requireDispellable: true,
    });

    // 靶：把 clearPools 裡 `!need || dispellableOf(...)` 那一段拿掉
    //    → 兩筆一起被拔 → 紅。
    expect(statusIds(s.world, s.hero)).toEqual(["cannot-go"]);
    // 而且留下來那一筆是**原封不動**的，不是被重建過的。
    expect(s.world.status.get(s.hero)!.effects[0]!.expiresAtTick).toBe(888);
  });

  it("★ 反向：`requireDispellable: false` 時兩筆都走（回合重置就是這一種）", () => {
    cover(TAG);
    // ⚠️ 這條是①的另一半。少了它，一個「`isDispellable` 恆回 false」的實作
    // （＝什麼都拔不掉）在上面那條斷言下**也是綠的** —— 兩個方向必須都驗。
    const s = stage();
    slow(s.world, s.hero, "a", 999, { dispellable: true });
    slow(s.world, s.hero, "b", 888, { dispellable: false });
    clearPools(s.world, s.hero, { pools: { status: true }, requireDispellable: false });
    expect(statusIds(s.world, s.hero)).toEqual([]);
  });

  it("★ 沒標 dispellable 時吃 `defaults`（後台那一格真的有人讀）", () => {
    cover(TAG);
    const on = stage();
    slow(on.world, on.hero, "unmarked", 999);
    clearPools(on.world, on.hero, {
      pools: { status: true },
      requireDispellable: true,
      defaults: { status: true },
    });
    expect(statusIds(on.world, on.hero)).toEqual([]);

    const off = stage();
    slow(off.world, off.hero, "unmarked", 999);
    clearPools(off.world, off.hero, {
      pools: { status: true },
      requireDispellable: true,
      defaults: { status: false },
    });
    expect(statusIds(off.world, off.hero)).toEqual(["unmarked"]);
  });
});

// ===========================================================================
describe("② order 決定留下哪幾筆（而且是全序）", () => {
  it("★ newest 與 oldest 在 count:1 下拔到**不同**的那一筆", () => {
    cover(TAG);
    const mk = (order: "newest" | "oldest"): string[] => {
      const s = stage();
      slow(s.world, s.hero, "early", 100);
      slow(s.world, s.hero, "mid", 200);
      slow(s.world, s.hero, "late", 300);
      clearPools(s.world, s.hero, { pools: { status: true }, count: 1, order });
      return statusIds(s.world, s.hero);
    };
    // 靶：把 `[...cand].sort(cmp)` 換成不排序（照原序取前 count 筆）
    //    → 兩種 order 得到同一個結果 → 紅。
    const n = mk("newest");
    const o = mk("oldest");
    expect(n).not.toEqual(o);
    expect(n).toEqual(["early", "mid"]); // newest 先拔最晚到期的
    expect(o).toEqual(["mid", "late"]); // oldest 先拔最早到期的
  });

  it("⛔ 兩筆**同一 tick 到期**時結果仍然是決定性的（全序的第二關鍵字）", () => {
    cover(TAG);
    // 靶：把比較器的第二關鍵字拿掉、只比 expiresAtTick
    //    → 這一組輸入下「拔哪一筆」變成陣列順序決定的 → 兩種插入順序不同 → 紅。
    const run = (reversed: boolean): string[] => {
      const s = stage();
      const names = reversed ? ["zzz", "aaa"] : ["aaa", "zzz"];
      for (const n of names) slow(s.world, s.hero, n, 500); // 同一個 tick
      clearPools(s.world, s.hero, { pools: { status: true }, count: 1, order: "newest" });
      return statusIds(s.world, s.hero);
    };
    expect(run(false)).toEqual(run(true));
  });
});

// ===========================================================================
describe("③ world.dot —— A4 順手修掉的既有漏洞", () => {
  it("★ 淨化拔得掉燃燒，而且血條真的不再每秒掉", () => {
    cover(TAG);
    const s = stage();
    burn(s.world, s.hero, "ability:probe");
    const hp0 = s.world.health.get(s.hero)!.hp;
    // 先證明它真的在燒（對照組 —— 少了它，一個「dot 從來沒生效」的世界也會過）
    for (let i = 0; i < 40; i++) s.world.step(new Map());
    expect(s.world.health.get(s.hero)!.hp).toBeLessThan(hp0);

    clearPools(s.world, s.hero, { pools: { dot: true } });
    // 靶：把 clearPools 的 pool 分派裡 dot 那一支拿掉 → 這一行紅。
    expect(s.world.dot.has(s.hero)).toBe(false);

    const hp1 = s.world.health.get(s.hero)!.hp;
    for (let i = 0; i < 40; i++) s.world.step(new Map());
    // 拔掉之後只剩自然回血，血不會再往下掉。
    expect(s.world.health.get(s.hero)!.hp).toBeGreaterThanOrEqual(hp1);
  });

  it("⛔ 復活之後 world.dot 是空的 —— 死前的燃燒不可以跟著身體回來", () => {
    cover(TAG);
    const s = stage();
    burn(s.world, s.hero, "ability:grave");
    s.world.health.get(s.hero)!.alive = false;
    s.world.health.get(s.hero)!.hp = 0;

    reviveChampionAt(s.world, s.hero, { pos: { x: C.x, z: C.z }, zone: 0, hpPct: 0.5, manaPct: 0.5 });

    // 靶：把 `revive.ts` 的 `clearForFreshBody(world, id)` 改回原本那兩行
    //    （`hp.shields = []` + `if (st) st.effects = []`）→ 這一行紅。
    //    ⚠️ 那兩行**是出貨了很久的程式碼**，這條測試在它存在的整段期間都會是紅的
    //    —— 它釘的正是那個漏洞。
    expect(s.world.dot.has(s.hero)).toBe(false);
  });

  it("★ `clearForFreshBody` 三池一起清（status + shields + dot）", () => {
    cover(TAG);
    const s = stage();
    slow(s.world, s.hero, "x", 999, { dispellable: false }); // 不可驅散也要走
    burn(s.world, s.hero, "ability:y");
    s.world.health.get(s.hero)!.shields.push({
      amount: 100,
      expiresAtTick: 999,
      sourceId: "probe",
    });

    const r = clearForFreshBody(s.world, s.hero);

    expect(statusIds(s.world, s.hero)).toEqual([]);
    expect(s.world.dot.has(s.hero)).toBe(false);
    expect(s.world.health.get(s.hero)!.shields).toEqual([]);
    // ⚠️ 重置**不看** dispellable —— 那不是淨化。靶：把 `clearForFreshBody` 的
    // `requireDispellable: false` 改成 true → 那筆不可驅散的減速活下來 → 紅。
    expect(r.status).toBe(1);
    expect(r.total).toBe(3);
  });
});

// ===========================================================================
describe("④ 極性過濾", () => {
  it("★ debuff-only 的淨化不會吃掉自己的增益，也不會吃掉護盾", () => {
    cover(TAG);
    const s = stage();
    slow(s.world, s.hero, "the-debuff", 999, { polarity: "debuff" });
    slow(s.world, s.hero, "the-buff", 999, { polarity: "buff", moveSpeedMult: 1.3 });
    s.world.health.get(s.hero)!.shields.push({
      amount: 100,
      expiresAtTick: 999,
      sourceId: "mine",
    });

    clearPools(s.world, s.hero, { pools: { status: true, shields: true }, polarity: "debuff" });

    expect(statusIds(s.world, s.hero)).toEqual(["the-buff"]);
    // 護盾沒有極性 —— 一個「解除我方減益」的淨化不該順手把自己的盾吃掉。
    expect(s.world.health.get(s.hero)!.shields).toHaveLength(1);
  });

  it("★ 沒標極性的不會被有極性條件的淨化拔走（「不知道」≠「是」）", () => {
    cover(TAG);
    const s = stage();
    slow(s.world, s.hero, "unlabelled", 999);
    clearPools(s.world, s.hero, { pools: { status: true }, polarity: "debuff" });
    expect(statusIds(s.world, s.hero)).toEqual(["unlabelled"]);
  });
});
