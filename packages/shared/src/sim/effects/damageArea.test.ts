/**
 * 擴散 (`damageArea`) 的行為守衛 —— #210.
 *
 * ---------------------------------------------------------------------------
 * 這裡刻意不測什麼
 * ---------------------------------------------------------------------------
 * 不測「文件裡有沒有 damageArea 這個字」, 不測「schema 認不認得這個 kind」。
 * 那是屬性, 不是行為 (七種失敗形態的第 ⑦ 種), 而這個功能存在的唯一理由是
 * **第二個人身上要真的掉血**。所以每一條斷言都讀 `world.damageQueue` ——
 * runner 真正寫出去的那個物件。
 *
 * 命中集合走真的 `enemiesInCircle` + 真的 broad-phase grid, 不是自己手寫一份
 * 名單: 第 ⑤ 種失敗形態 (「被測的不是出貨的那個」) 就是這樣發生的。
 *
 * 突變紀錄 (每一條都真的做過, 見 commit message):
 *   · 把 `victims.push(...)` 那一行刪掉        → 「打到第二個人」紅
 *   · 把 `victims.length = cap` 拿掉            → 「maxTargets 封頂」紅
 *   · 把 `(1 - (1 - falloff) * t)` 換成 `1`     → 「falloff 遞減」紅
 *   · 把 `a.id - b.id` 那一段拿掉               → 「同距離時的順序」紅
 *   · `clampSpreadRadius` 直接 return radius    → 「半徑上界」紅
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import { SPREAD_MAX_RADIUS, SPREAD_MAX_TARGETS } from "./spreadLimits";
import { zEffectDef } from "../../content/schema/effect";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import type { ItemDoc } from "../../content/schema/item";
import type { LootTableDoc } from "../../content/schema/lootTable";
import { asTeamId, asSeatId, type EntityId } from "../../ids";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;

interface Rig {
  world: SimWorld;
  caster: EntityId;
  /** the entity the EVENT hit — the circle's centre */
  epicentre: EntityId;
  /** enemies placed at the requested offsets from the epicentre, in order */
  bystanders: EntityId[];
}

/**
 * `offsets` are metres EAST of the epicentre. The epicentre itself sits 0.5 u
 * east of the caster so that "the caster is not the centre" is a property the
 * rig can actually distinguish.
 */
function rig(offsets: number[], opts?: { allyIdx?: number[]; seed?: number }): Rig {
  const world = new SimWorld(SKELETON_ARENA, opts?.seed ?? 7);
  const place = (x: number, z: number, team: number, seat: number): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x, z },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.1, // small bodies: the circle test is centre-to-centre, not body-overlap
      zone: 0,
    });
    world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
    return id;
  };
  const caster = place(C.x, C.z, 0, 0);
  const epicentre = place(C.x + 0.5, C.z, 1, 1);
  const bystanders = offsets.map((d, i) =>
    place(C.x + 0.5 + d, C.z, opts?.allyIdx?.includes(i) ? 0 : 1, i + 2),
  );
  world.rebuildGrid();
  return { world, caster, epicentre, bystanders };
}

function ctxOf(r: Rig): EffectContext {
  return {
    world: r.world,
    caster: r.caster,
    rank: 1,
    targets: [r.epicentre],
    origin: "hook:item:test-spread",
    rng: r.world.rng,
  };
}

const area = (over: Partial<Extract<EffectDef, { kind: "damageArea" }>>): EffectDef => ({
  kind: "damageArea",
  damageType: "physical",
  amount: { flat: 100 },
  radius: 4,
  ...over,
});

/** what actually reached the damage queue, as (target -> amount) */
function hits(world: SimWorld): Map<EntityId, number> {
  return new Map(world.damageQueue.map((p) => [p.target, p.amount]));
}

describe("damageArea — 擴散真的打到第二個人 (do-spread-area)", () => {
  it("an enemy who was NOT the event's victim takes damage", () => {
    cover("do-spread-area");
    // B stands 2 u from the epicentre, well inside the 4 u circle, and was
    // never in `ctx.targets`. Before #210 there was no field that could reach
    // it at all — an `onBasicAttack` hook only ever resolved the one victim.
    const r = rig([2]);
    runEffects([area({})], ctxOf(r));
    const h = hits(r.world);
    expect(h.get(r.bystanders[0]!), "the bystander took nothing — 擴散 did not spread").toBe(100);
  });

  it("the epicentre is NOT double-billed by default, and IS with includeOrigin", () => {
    cover("do-spread-area");
    const a = rig([2]);
    runEffects([area({})], ctxOf(a));
    expect(hits(a.world).has(a.epicentre)).toBe(false);

    const b = rig([2]);
    runEffects([area({ includeOrigin: true })], ctxOf(b));
    expect(hits(b.world).get(b.epicentre)).toBe(100);
  });

  it("an ALLY inside the circle is never hit", () => {
    cover("do-spread-area");
    const r = rig([1, 2], { allyIdx: [0] });
    runEffects([area({})], ctxOf(r));
    const h = hits(r.world);
    expect(h.has(r.bystanders[0]!), "an ally took splash damage").toBe(false);
    expect(h.get(r.bystanders[1]!)).toBe(100);
  });

  it("nobody outside the radius is hit", () => {
    cover("do-spread-area");
    const r = rig([3.5, 6]);
    runEffects([area({ radius: 4 })], ctxOf(r));
    const h = hits(r.world);
    expect(h.has(r.bystanders[0]!)).toBe(true);
    expect(h.has(r.bystanders[1]!), "an enemy 6 u away was hit by a 4 u circle").toBe(false);
  });
});

describe("damageArea — maxTargets 真的封頂 (do-spread-cap)", () => {
  it("caps the victim count and keeps the NEAREST ones", () => {
    cover("do-spread-cap");
    const r = rig([1, 2, 3, 3.5]);
    runEffects([area({ maxTargets: 2 })], ctxOf(r));
    const h = hits(r.world);
    expect(h.size, "maxTargets did not cap the burst").toBe(2);
    expect(h.has(r.bystanders[0]!)).toBe(true);
    expect(h.has(r.bystanders[1]!)).toBe(true);
    expect(h.has(r.bystanders[2]!), "a FARTHER enemy displaced a nearer one").toBe(false);
  });

  it("absent maxTargets hits everyone in the circle", () => {
    cover("do-spread-cap");
    const r = rig([1, 2, 3, 3.5]);
    runEffects([area({})], ctxOf(r));
    expect(hits(r.world).size).toBe(4);
  });

  it("maxTargets 0 / negative disables the spread rather than hitting everyone", () => {
    cover("do-spread-cap");
    const r = rig([1, 2]);
    // NOT reachable through the schema (min 1) — reachable through the admin
    // overlay, which does not run Zod (#283). The sim must clamp anyway.
    runEffects([area({ maxTargets: 0 })], ctxOf(r));
    expect(hits(r.world).size).toBe(0);
  });
});

describe("damageArea — falloff 真的遞減 (do-spread-falloff)", () => {
  it("linear taper: full at the centre, ×falloff at the rim", () => {
    cover("do-spread-falloff");
    const r = rig([1, 3]);
    runEffects([area({ radius: 4, falloff: 0.5 })], ctxOf(r));
    const h = hits(r.world);
    const near = h.get(r.bystanders[0]!)!;
    const far = h.get(r.bystanders[1]!)!;
    // 1 - (1 - 0.5) * (d / 4)
    expect(near).toBeCloseTo(100 * (1 - 0.5 * (1 / 4)), 6);
    expect(far).toBeCloseTo(100 * (1 - 0.5 * (3 / 4)), 6);
    expect(far, "the FARTHER victim did not take less").toBeLessThan(near);
  });

  it("absent falloff is FLAT — distance changes nothing", () => {
    cover("do-spread-falloff");
    const r = rig([1, 3]);
    runEffects([area({ radius: 4 })], ctxOf(r));
    const h = hits(r.world);
    expect(h.get(r.bystanders[0]!)).toBe(100);
    expect(h.get(r.bystanders[1]!)).toBe(100);
  });

  it("falloff 0 zeroes the rim but never goes negative past it", () => {
    cover("do-spread-falloff");
    // radius 2 with a body that reaches in from 2.05 — `enemiesInCircle` is a
    // body-overlap query, so a centre distance slightly PAST the radius is
    // reachable. Without the `t > 1` clamp the taper would go negative, i.e.
    // the "damage" would heal.
    const r = rig([2.05]);
    r.world.transform.get(r.bystanders[0]!)!.radius = 0.5;
    r.world.rebuildGrid();
    runEffects([area({ radius: 2, falloff: 0 })], ctxOf(r));
    for (const p of r.world.damageQueue) expect(p.amount).toBeGreaterThanOrEqual(0);
  });
});

describe("damageArea — 上界真的夾 (do-spread-limits)", () => {
  it("a radius past SPREAD_MAX_RADIUS is clamped, not honoured", () => {
    cover("do-spread-limits");
    // A raw WC3 `Area` value (300) pasted straight into the field. Clamped to
    // 12, so the enemy at 15 u must survive.
    const r = rig([SPREAD_MAX_RADIUS - 1, SPREAD_MAX_RADIUS + 3]);
    runEffects([area({ radius: 300 })], ctxOf(r));
    const h = hits(r.world);
    expect(h.has(r.bystanders[0]!)).toBe(true);
    expect(h.has(r.bystanders[1]!), "the 300 u radius was honoured — the whole zone").toBe(false);
  });

  it("the schema REFUSES the same out-of-range values the sim clamps", () => {
    cover("do-spread-limits");
    const base = { kind: "damageArea", damageType: "physical", amount: { flat: 1 } };
    expect(zEffectDef.safeParse({ ...base, radius: 300 }).success).toBe(false);
    expect(zEffectDef.safeParse({ ...base, radius: SPREAD_MAX_RADIUS }).success).toBe(true);
    expect(zEffectDef.safeParse({ ...base, radius: 4, falloff: 1.5 }).success).toBe(false);
    expect(zEffectDef.safeParse({ ...base, radius: 4, falloff: -0.1 }).success).toBe(false);
    expect(
      zEffectDef.safeParse({ ...base, radius: 4, maxTargets: SPREAD_MAX_TARGETS + 1 }).success,
    ).toBe(false);
    expect(zEffectDef.safeParse({ ...base, radius: 4, maxTargets: 2.5 }).success).toBe(false);
  });
});

describe("damageArea — 決定性 (do-spread-determinism)", () => {
  it("two seeded runs produce the SAME ordered (target, amount) sequence", () => {
    cover("do-spread-determinism");
    const run = (): string => {
      const r = rig([1, 1, 1, 2, 2], { seed: 99 });
      runEffects([area({ canCrit: true, falloff: 0.4, maxTargets: 3 })], ctxOf(r));
      return JSON.stringify(r.world.damageQueue.map((p) => [p.target, p.amount]));
    };
    expect(run()).toBe(run());
  });

  it("equidistant victims are ordered by ENTITY ID, not by grid luck", () => {
    cover("do-spread-determinism");
    // Three bodies at the same distance. The cap slices this list, so the
    // tiebreak decides WHO LIVES — it cannot be left to Array.sort's stability.
    const r = rig([2, 2, 2]);
    runEffects([area({ maxTargets: 2 })], ctxOf(r));
    const struck = r.world.damageQueue.map((p) => p.target);
    expect(struck).toEqual([...struck].sort((a, b) => a - b));
    expect(struck).toEqual([r.bystanders[0]!, r.bystanders[1]!]);
  });
});

/**
 * 出貨的那一份 (第 ⑤ 種失敗形態的解藥). 上面全部用合成的 EffectDef; 這一段讀
 * `content/`, 所以「runner 會了但沒有任何一件武器用它」不可能是綠的。
 */
describe("傳說池的近戰擴散武器 (co-spread-content)", () => {
  let byId: Map<string, ItemDoc>;
  let pool: ItemDoc[];

  beforeAll(async () => {
    const store = (await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store;
    byId = new Map(store.all<ItemDoc>("items").map((d) => [d.id as string, d]));
    const table = store
      .all<LootTableDoc>("loot-tables")
      .find((t) => t.id === "legendary-weapons");
    if (!table) throw new Error("content/loot-tables/legendary-weapons.json is missing");
    pool = table.entries.map((e) => {
      const doc = byId.get(e.itemId as string);
      if (!doc) throw new Error(`legendary ${e.itemId} has no content doc`);
      return doc;
    });
  });

  const areaEffects = (d: ItemDoc): Extract<EffectDef, { kind: "damageArea" }>[] =>
    (d.passive ?? [])
      .flatMap((h) => h.effects)
      .filter((e): e is Extract<EffectDef, { kind: "damageArea" }> => e.kind === "damageArea");

  it("the pool is 24 wide — a silent shrink back to 15 is a regression", () => {
    cover("co-spread-content");
    // #210: owner 「目前太少，很容易被抽完」. 15 -> 20. Pinned rather than
    // floored because the failure being guarded is a re-curation that quietly
    // drops entries, which a `>= 6` floor would sleep through.
    //
    // 20 -> 24 (職業限定閘 lane, owner 2026-07-30): the four class legendaries
    // 裂地巨斧 / 賢者的護身符 / 衝鋒重脛甲 / 穿甲弩 were added here BECAUSE this
    // table is the only shipping path a tier-5 has — `craftRole: final` (the
    // shop shelf) holds nothing above tier 2, so a legendary that is not in
    // this table is content the player can never reach.
    //
    // ⚠️ The title used to read 「25 wide」 while the assertion said 20. That
    // was a stale comment, not a second rule — corrected here rather than
    // carried forward (CLAUDE.md 第三守則: 註解會說謊).
    expect(pool.length).toBe(24);
  });

  it("近戰擴散 is a NON-EMPTY category — the thing owner asked for", () => {
    cover("co-spread-content");
    // 「特別是近戰可以擴散攻擊的武器」. Before #210 this list was empty in two
    // independent ways: no effect could express a spread, and no pool weapon
    // was melee-locked.
    const melee = pool.filter(
      (d) => d.requiresAttackType === "melee" && areaEffects(d).length > 0,
    );
    expect(melee.map((d) => d.id), "no melee spread weapon in the legendary pool").toContain(
      "godie-i000",
    );
    expect(melee.length).toBeGreaterThanOrEqual(1);
  });

  it("every 擴散 the pool ships is inside the limits and hangs off a real hook", () => {
    cover("co-spread-content");
    const withArea = pool.filter((d) => areaEffects(d).length > 0);
    // 5 today: 丈八蛇矛 / 熾天使之弓 / 斬岩刃 / 月牙魔杖 / 死之王的神盾
    //          + 火焰泰坦腰帶 + 防狼電擊棒
    expect(withArea.length, "the pool ships no 擴散 at all").toBeGreaterThanOrEqual(5);
    for (const d of withArea) {
      for (const e of areaEffects(d)) {
        expect(e.radius, `${d.name} radius`).toBeGreaterThan(0);
        expect(e.radius, `${d.name} radius past the mis-parse ceiling`).toBeLessThanOrEqual(
          SPREAD_MAX_RADIUS,
        );
        if (e.maxTargets !== undefined) {
          expect(e.maxTargets, `${d.name} maxTargets`).toBeLessThanOrEqual(SPREAD_MAX_TARGETS);
        }
      }
      // A `damageArea` sitting in an array nothing fires is exactly failure ③.
      expect(
        (d.passive ?? []).some((h) => h.effects.some((e) => e.kind === "damageArea")),
        `${d.name} carries a damageArea in no hook`,
      ).toBe(true);
    }
  });

  it("丈八蛇矛's 「擴散傷害60%」 is 60% of AD, not a flat number", () => {
    cover("co-spread-content");
    // The one place the text pins the FORMULA rather than a value. A rescale
    // that turned this into `flat` would keep every other test green.
    const doc = byId.get("godie-i000")!;
    expect(doc.description).toContain("擴散傷害60%");
    const e = areaEffects(doc)[0]!;
    expect(e.amount.flat ?? 0).toBe(0);
    expect(e.amount.ratios).toEqual([{ stat: "ad", coeff: 0.6 }]);
  });

  it("月牙魔杖's 「距離越遠流星傷害越低」 is the only falloff claim, and it is authored", () => {
    cover("co-spread-content");
    // falloff would otherwise be a field no shipped doc uses — failure ③ on the
    // field itself. 月牙魔杖 is the doc whose TEXT demands it.
    const doc = byId.get("godie-i06e")!;
    expect(doc.description).toContain("距離越遠流星傷害越低");
    const e = areaEffects(doc)[0]!;
    expect(e.falloff, "the wand's text promises a taper its effect does not have").toBeDefined();
    expect(e.falloff!).toBeLessThan(1);
  });
});
