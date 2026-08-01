/**
 * 資源衍生屬性 —— 「AP+ (目前MP的 5%)」, proved on a real pipeline and on the
 * real shipped doc.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THESE ASSERTIONS AND NOT OTHERS
 *
 * The defect this feature exists against is a stat that LOOKS live and is not.
 * So nothing here asserts the SHAPE of a modifier and nothing greps source
 * (失敗形態 ⑥/⑦): every case moves `hp.mana`, runs the real
 * `resourceStatSystem` + `recomputeStats`, and reads `sc.final[Stat.AbilityPower]`
 * back — the number a damage formula and the HUD both consume.
 *
 * The four claims, in order of how expensive getting them wrong would be:
 *
 *   ① IT REALLY MOVES. Half the mana ⇒ half the bonus. An implementation that
 *      stores `fromResource` perfectly and never reads it in pass 2 goes red.
 *   ② IT IS NOT `from: "maxMana"` IN DISGUISE. The same doc written the old way
 *      is pinned side by side and must NOT move. Without this contrast a
 *      "simplification" back to `maxMana` would keep ① green at full mana.
 *   ③ AT ZERO IT DOES NOT EXIST. A champion with no such modifier is never
 *      marked dirty and never gets a `resourceSig` — that is what keeps every
 *      existing replay/digest bit-identical, and it is asserted on the observable
 *      (`sc.dirty` / `sc.resourceSig`), not on a claim.
 *   ④ THE SHIPPED DOC IS THE ONE UNDER TEST (失敗形態 ⑤). 光魔杖's real JSON is
 *      read off disk, equipped through `economy/itemSource.ts` — the ONE builder
 *      every equip path uses — and driven through real `world.step()` ticks.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { attachSource, recomputeStats } from "./statPipeline";
import { ModOp } from "./modifiers";
import { Stat } from "./statTypes";
import { itemModifierSource } from "../economy/itemSource";
import { resourceStatSystem, liveResource, hasResourceModifier } from "./resourceStats";
import { zGatedItemStatModifier } from "../../content/schema/item";
import type { ItemDef } from "../content/defs";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId, type SeatId } from "../../ids";
import type { IntentFrame } from "../intents";

beforeAll(() => registerSkeletonContent()); // synchronous — no 10 s hook to blow

const HERE = dirname(fileURLToPath(import.meta.url));
const ITEMS = join(HERE, "../../../../../content/items");
const NO_INTENTS: ReadonlyMap<SeatId, IntentFrame> = new Map();
const Z0 = SKELETON_ARENA.zones[0]!;
const LIGHT_WAND = "godie-i027";

function doc(itemId: string): ItemDef & { description: string } {
  return JSON.parse(readFileSync(join(ITEMS, `${itemId}.json`), "utf8"));
}

function rig(): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 20260801);
  const id = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: Z0.center.z + 14 },
    zone: 0,
    level: 1,
  });
  recomputeStats(world, id);
  return { world, id };
}

/** Re-derive stats the way the tick does: resource scan, then recompute. */
function settle(world: SimWorld, id: EntityId): number {
  resourceStatSystem(world);
  if (world.stats.get(id)!.dirty) recomputeStats(world, id);
  return world.stats.get(id)!.final[Stat.AbilityPower];
}

describe("① 資源衍生屬性真的會動", () => {
  it("AP = base + 5% of CURRENT mana, and it falls as the mana falls", () => {
    const { world, id } = rig();
    const hp = world.health.get(id)!;
    const baseAp = world.stats.get(id)!.final[Stat.AbilityPower];

    attachSource(world, id, {
      id: "test:live-ap",
      kind: "item",
      modifiers: [{ stat: Stat.AbilityPower, op: ModOp.PercentOf, value: 0.05, fromResource: "mp" }],
    });

    hp.mana = hp.maxMana;
    const full = settle(world, id);
    expect(full).toBeCloseTo(baseAp + 0.05 * hp.maxMana, 6);

    hp.mana = hp.maxMana / 2;
    const half = settle(world, id);
    expect(half).toBeCloseTo(baseAp + 0.05 * (hp.maxMana / 2), 6);

    // AND THE DIFFERENCE IS THE WHOLE POINT: this is what a `maxMana` reading
    // could never produce.
    expect(full - half).toBeCloseTo(0.05 * (hp.maxMana / 2), 6);

    hp.mana = 0;
    expect(settle(world, id)).toBeCloseTo(baseAp, 6);
  });

  it("a NEGATIVE pool pays 0, not a negative bonus — 「越死越強」 must be unreachable", () => {
    const { world, id } = rig();
    const hp = world.health.get(id)!;
    const baseAp = world.stats.get(id)!.final[Stat.AbilityPower];
    attachSource(world, id, {
      id: "test:live-ap",
      kind: "item",
      // `hp` on purpose: it is the pool that really does go negative (the tick a
      // champion dies), and it proves the clamp lives in `liveResource` rather
      // than in a `mana`-specific branch.
      modifiers: [{ stat: Stat.AbilityPower, op: ModOp.PercentOf, value: 0.05, fromResource: "hp" }],
    });
    hp.hp = -500;
    expect(liveResource(world, id, "hp")).toBe(0);
    // The bonus is EXACTLY zero: same AP as a champion carrying no such source.
    expect(settle(world, id)).toBeCloseTo(baseAp, 6);
  });
});

describe("② 它不是 `from: maxMana` 換個名字", () => {
  it("the maxMana form does NOT move when mana drains — the resource form does", () => {
    const stat = (fromMax: boolean): { full: number; empty: number } => {
      const { world, id } = rig();
      const hp = world.health.get(id)!;
      attachSource(world, id, {
        id: "test:ap",
        kind: "item",
        modifiers: [
          fromMax
            ? { stat: Stat.AbilityPower, op: ModOp.PercentOf, value: 0.05, from: Stat.MaxMana }
            : { stat: Stat.AbilityPower, op: ModOp.PercentOf, value: 0.05, fromResource: "mp" },
        ],
      });
      hp.mana = hp.maxMana;
      const full = settle(world, id);
      hp.mana = 0;
      // the maxMana form never marks dirty (nothing it reads moved), so force a
      // recompute — that is the strongest possible form of the claim.
      recomputeStats(world, id);
      const empty = world.stats.get(id)!.final[Stat.AbilityPower];
      return { full, empty };
    };

    const max = stat(true);
    expect(max.full).toBeCloseTo(max.empty, 6); // frozen — the OLD behaviour

    const live = stat(false);
    expect(live.full).toBeGreaterThan(live.empty); // alive — the NEW behaviour
  });
});

describe("③ 沒有內容用它的時候,它不存在", () => {
  it("a champion with no fromResource modifier is never marked dirty by the system", () => {
    const { world, id } = rig();
    const sc = world.stats.get(id)!;
    expect(hasResourceModifier(sc.sources, world.tick)).toBe(false);

    sc.dirty = false;
    world.health.get(id)!.mana = 1; // move the resource as hard as possible
    resourceStatSystem(world);

    expect(sc.dirty).toBe(false);
    // NOT EVEN A CACHE WRITE. `resourceSig` staying undefined is what proves the
    // scan bailed out before doing any arithmetic at all.
    expect(sc.resourceSig).toBeUndefined();
  });

  it("a champion sitting at full mana does not recompute either", () => {
    const { world, id } = rig();
    attachSource(world, id, {
      id: "test:live-ap",
      kind: "item",
      modifiers: [{ stat: Stat.AbilityPower, op: ModOp.PercentOf, value: 0.05, fromResource: "mp" }],
    });
    const sc = world.stats.get(id)!;
    settle(world, id); // first pass records the signature
    sc.dirty = false;
    resourceStatSystem(world); // nothing moved
    expect(sc.dirty).toBe(false);
  });
});

describe("④ 出貨的那一份 —— 光魔杖 godie-i027", () => {
  const d = doc(LIGHT_WAND);

  it("the shipped doc reads the LIVE mana, and its bytes parse", () => {
    const apMod = (d.modifiers ?? []).find((m) => m.stat === Stat.AbilityPower);
    expect(apMod).toBeDefined();
    expect(apMod!.op).toBe(ModOp.PercentOf);
    expect(apMod!.value).toBe(0.05); // owner's 「5%」
    expect(apMod!.fromResource).toBe("mp"); // 「目前MP」, not maxMana
    expect(apMod!.from).toBeUndefined(); // the two are mutually exclusive
    expect(() => zGatedItemStatModifier.parse(apMod)).not.toThrow();
  });

  it("owner's prose still says 目前MP — the assertion above is about THAT line", () => {
    expect(d.description).toContain("AP+ (目前MP的 5%)");
  });

  it("equipped through the shipped builder, a real tick's AP tracks the mana", () => {
    const { world, id } = rig();
    const champ = world.champion.get(id)!;
    champ.items[0] = LIGHT_WAND as ItemId;
    attachSource(world, id, itemModifierSource(world, id, LIGHT_WAND as ItemId, 0, d));

    const hp = world.health.get(id)!;
    hp.mana = hp.maxMana;
    world.step(NO_INTENTS);
    const full = world.stats.get(id)!.final[Stat.AbilityPower];

    hp.mana = 0;
    world.step(NO_INTENTS); // regen puts a sliver back; the gap is still the bonus
    const drained = world.stats.get(id)!.final[Stat.AbilityPower];

    expect(full - drained).toBeGreaterThan(0.05 * hp.maxMana * 0.9);
  });
});
