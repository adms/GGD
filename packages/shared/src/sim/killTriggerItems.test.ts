/**
 * 擊殺觸發家族 —— 天生牙 (godie-i031) 與 甘豆腐之袍 (godie-i03f), on the SHIPPED
 * docs and through the SHIPPED kill path.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * WHAT THIS GUARDS, AND WHY EACH ASSERTION IS THE ONE THAT WOULD CATCH IT
 *
 * Three owner lines, all on `onKill`:
 *   · 天生牙 [復活] 「殺死任一個敵方**英雄**單位，將復活我方所有英雄」
 *   · 天生牙 [回復] 「殺死任一個敵方**單位**，回復我們全部英雄 1%生命」
 *   · 甘豆腐之袍 [疊層] 「每殺死一名英雄可以額外獲得 10點智慧，上限 160」
 *
 * The failure shapes this file is built against (CLAUDE.md 第二守則's table):
 *
 *  ② 「算出來了但玩家拿不到」 — the effect exists, the doc parses, and the ITEM's
 *    source never carries the hook. Every case here equips through the SHIPPED
 *    `grantItemFree` → `attachItemSource` path and reads back `world.health` /
 *    `liveAttribute`, never a hand-built ModifierSource and never `def.passive`.
 *  ⑤ 「被測的不是出貨的那個」 — a hand-written fixture stays green after somebody
 *    empties `content/items/godie-i031.json`. §0 registers the REAL docs off
 *    disk, and §5 re-derives 1 % / 10 / 160 from the owner's own 效能 prose, so
 *    the doc and the description are pinned to EACH OTHER, not to a constant
 *    typed in this file.
 *  ④ 「斷言方向跟缺陷無關」 — 「someone got healed」 passes for `target:"self"`
 *    too. §1 asserts a NON-CASTER ally moved, which is the only reading that
 *    separates the 全隊 scope from every scope that existed before it.
 *  ③ 「可以刪掉但測試全綠」 — the whole point of the mutation log in the report:
 *    each `it` names the ONE line whose deletion turns it red.
 *
 * ⚠️ THE KILL IS A REAL KILL. Nothing calls `fireHooks` by hand: a lethal packet
 * goes into `world.damageQueue` and `world.step()` runs, so DeathSystem's
 * `fireHooks(world, killer, "onKill", id)` is the trigger under test. A test that
 * fired the hook itself would stay green if that line were deleted.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { zItemDoc } from "../content/schema/item";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { Champions, Items } from "./content/registry";
import type { ItemDef } from "./content/defs";
import { spawnChampion } from "./spawnChampion";
import { grantItemFree, sellItem } from "./economy/shop";
import { attachItemSource } from "./economy/itemSource";
import { alliedChampions } from "./effects/hooks";
import { liveAttribute } from "./stats/attrSources";
import { attachSource, recomputeStats } from "./stats/statPipeline";
import { beginCombatRevives, reviveRulesFromConfig } from "./revive";
import { ModOp } from "./stats/modifiers";
import { Stat } from "./stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../ids";

const TAG = "kill-trigger-items";
const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;

/** 天生牙 — [復活] + [回復] */
const FANG = "godie-i031" as ItemId;
/** 甘豆腐之袍 — [疊層] 每殺死一名英雄 +10 智慧, 上限 160 */
const ROBE = "godie-i03f" as ItemId;

let HERO: ChampionId;
const doc = (id: ItemId): Record<string, unknown> =>
  JSON.parse(readFileSync(join(CONTENT_DIR, "items", `${id}.json`), "utf-8")) as Record<
    string,
    unknown
  >;

// ── §0 — the SHIPPED docs, parsed by the SHIPPED schema ─────────────────────
beforeAll(() => {
  registerSkeletonContent();
  for (const id of [FANG, ROBE]) {
    // `.parse`, not a cast: if the schema stops accepting what the doc says, the
    // whole file goes red HERE rather than silently testing a stripped object.
    const parsed = zItemDoc.parse(doc(id));
    Items.register(parsed.id as ItemId, parsed as unknown as ItemDef);
  }
  HERO = [...Champions.all()].sort((a, b) => (a.id < b.id ? -1 : 1))[0]!.id;
});

interface Field {
  world: SimWorld;
  /** team 0, the item holder */
  killer: EntityId;
  /** team 0, alive, standing apart from the killer */
  mate: EntityId;
  /** team 0, killed before the trigger */
  corpse: EntityId;
  /** team 1 */
  enemy: EntityId;
}

const hero = (w: SimWorld, seat: number, team: number, x: number): EntityId =>
  spawnChampion(w, {
    championId: HERO,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: Z0.center.x + x, z: Z0.center.z },
    zone: 0,
    level: 3,
  });

const step = (w: SimWorld, n = 2): void => {
  for (let i = 0; i < n; i++) w.step(new Map());
};

/** A lethal TRUE packet — the shipped queue, so DeathSystem really runs. */
const kill = (w: SimWorld, killer: EntityId, target: EntityId): void => {
  w.damageQueue.push({
    source: killer,
    target,
    amount: 1e6,
    type: "true",
    crit: false,
    origin: "ability:test",
  });
};

/**
 * PASSIVE REGEN OFF for one body. Not part of the mechanic — it is the noise
 * floor: `RegenSystem` adds `healthRegen × dt` to every living champion every
 * tick, so an exact 「1 % of max」 assertion would be 「1 % plus however many
 * ticks the harness happened to run」. Zeroing it makes every heal number in
 * this file exact and therefore able to catch an off-by-a-factor.
 */
function freezeRegen(world: SimWorld, id: EntityId): void {
  attachSource(world, id, {
    id: "test:no-regen",
    kind: "buff",
    modifiers: [{ stat: Stat.HealthRegen, op: ModOp.Override, value: 0 }],
  });
}

/** Three allies + one enemy; `corpse` is already dead when the field returns. */
function field(itemId: ItemId | null = FANG): Field {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  world.combatActive = true;
  const killer = hero(world, 0, 0, -3);
  const mate = hero(world, 1, 0, 3);
  const corpse = hero(world, 2, 0, 6);
  const enemy = hero(world, 3, 1, 0);
  for (const id of [killer, mate, corpse, enemy]) {
    freezeRegen(world, id);
    recomputeStats(world, id);
  }
  if (itemId !== null) expect(grantItemFree(world, killer, itemId)).toBeGreaterThanOrEqual(0);
  // The ally dies to the ENEMY, so no on-kill hook of ours is involved in making
  // the corpse — otherwise the setup would be testing itself.
  kill(world, enemy, corpse);
  step(world);
  expect(world.health.get(corpse)!.alive).toBe(false);
  return { world, killer, mate, corpse, enemy };
}

// ═══════════════════════════════════════════════════════════════════════════
// §1 — [回復] 「殺死任一個敵方單位，回復我們全部英雄 1%生命」
// ═══════════════════════════════════════════════════════════════════════════
describe("§1 天生牙 [回復] — 1% to the WHOLE team, on any enemy kill", () => {
  it("heals a teammate who is nowhere near the kill (the 全隊 scope, not self/event)", () => {
    cover(`${TAG}/restore-allies-scope`);
    const f = field();
    const maxHp = f.world.stats.get(f.mate)!.final[Stat.MaxHealth];
    // hurt the bystander so the heal has somewhere to land (overheal is invisible)
    f.world.health.get(f.mate)!.hp = maxHp * 0.5;
    const before = f.world.health.get(f.mate)!.hp;

    kill(f.world, f.killer, f.enemy);
    step(f.world);

    // ⭐ THE ASSERTION THAT MAKES THIS A GUARD: the entity measured is NOT the
    // killer and NOT the victim, so it is unreachable by `target:"self"` and by
    // `target:"event"` alike. `combatEnv.healing` is 1.0 in a bare world.
    expect(f.world.health.get(f.mate)!.hp - before).toBeCloseTo(
      maxHp * 0.01 * f.world.combatEnv.healing,
      6,
    );
  });

  it("the KILLER is in 「我們全部英雄」 too", () => {
    cover(`${TAG}/restore-includes-self`);
    const f = field();
    const maxHp = f.world.stats.get(f.killer)!.final[Stat.MaxHealth];
    f.world.health.get(f.killer)!.hp = maxHp * 0.5;
    const before = f.world.health.get(f.killer)!.hp;
    kill(f.world, f.killer, f.enemy);
    step(f.world);
    expect(f.world.health.get(f.killer)!.hp - before).toBeGreaterThan(0);
  });

  it("an ENEMY is never healed by it", () => {
    cover(`${TAG}/restore-not-enemies`);
    const f = field();
    // a SECOND enemy, so there is a live one left on team 1 after the kill
    const enemy2 = hero(f.world, 4, 1, 9);
    freezeRegen(f.world, enemy2);
    recomputeStats(f.world, enemy2);
    const maxHp = f.world.stats.get(enemy2)!.final[Stat.MaxHealth];
    f.world.health.get(enemy2)!.hp = maxHp * 0.5;
    const before = f.world.health.get(enemy2)!.hp;
    kill(f.world, f.killer, f.enemy);
    step(f.world);
    expect(f.world.health.get(enemy2)!.hp).toBeCloseTo(before, 6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §2 — [復活] 「殺死任一個敵方英雄單位，將復活我方所有英雄」
// ═══════════════════════════════════════════════════════════════════════════
describe("§2 天生牙 [復活] — a hero kill stands the whole team back up", () => {
  it("the dead ally is alive again, at HIS OWN corpse, on the revive HP fraction", () => {
    cover(`${TAG}/revive-on-champion-kill`);
    const f = field();
    const at = { ...f.world.transform.get(f.corpse)!.pos };
    const maxHp = f.world.stats.get(f.corpse)!.final[Stat.MaxHealth];

    kill(f.world, f.killer, f.enemy);
    step(f.world);

    const hp = f.world.health.get(f.corpse)!;
    expect(hp.alive).toBe(true);
    // 0.5 is `REVIVE_EFFECT_FALLBACK_HP_PCT` == the shipped arena-rules number,
    // and the extra 1 % is the item's OWN sibling clause: hooks fire in array
    // order, so [復活] stands him up and [回復] — which pays 「我們全部英雄」 for
    // the same kill — then finds a living body to heal. Worth pinning: it is the
    // one place the two clauses interact, and it is deterministic.
    expect(hp.hp).toBeCloseTo(maxHp * 0.51, 6);
    // AT THE CORPSE, not at the killer — a whole-team revive must not teleport
    // the team onto the killer's tile.
    const pos = f.world.transform.get(f.corpse)!.pos;
    expect(pos.x).toBeCloseTo(at.x, 6);
    expect(pos.z).toBeCloseTo(at.z, 6);
    expect(pos.x).not.toBeCloseTo(f.world.transform.get(f.killer)!.pos.x, 3);
  });

  it("it reaches the client: `reviveComplete` is emitted for the revived ally", () => {
    cover(`${TAG}/revive-emits-event`);
    // 失敗形態 ②. `reviveComplete` is already in FANNED_OUT_EVENT_TYPES with
    // three consumers (VfxSystem shimmer, combatSfx 復活完成, combatSfxSpatial),
    // so reusing it is what makes the item VISIBLE without a netcode change.
    const f = field();
    kill(f.world, f.killer, f.enemy);
    const seen: Record<string, unknown>[] = [];
    for (let i = 0; i < 2; i++) {
      f.world.step(new Map());
      for (const ev of f.world.events) if (ev.type === "reviveComplete") seen.push(ev.data);
    }
    const mine = seen.filter((d) => d.ownerId === f.corpse);
    expect(mine.length).toBe(1);
    expect(mine[0]!.channeller).toBe(f.killer);
    expect(typeof mine[0]!.x).toBe("number");
  });

  it("a MOB-shaped kill does NOT revive — `victim:\"champion\"` is the whole difference", () => {
    cover(`${TAG}/revive-victim-filter`);
    const f = field();
    // The 回復 clause fires on ANY unit; the 復活 clause only on a 英雄. A body
    // with no ChampionComp is what separates them, and it is one field.
    const neutral = f.world.spawn();
    f.world.transform.set(neutral, {
      pos: { x: Z0.center.x, z: Z0.center.z + 2 },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.6,
      zone: 0,
    });
    f.world.health.set(neutral, { hp: 10, maxHp: 10, mana: 0, maxMana: 0, alive: true, shields: [] });

    kill(f.world, f.killer, neutral);
    step(f.world);

    expect(f.world.health.get(neutral)!.alive).toBe(false);
    expect(f.world.health.get(f.corpse)!.alive).toBe(false);
  });

  it("no item, no revive — the effect really is what stands them up", () => {
    cover(`${TAG}/revive-needs-the-item`);
    const f = field(null); // same field, nobody holding 天生牙
    kill(f.world, f.killer, f.enemy);
    step(f.world);
    expect(f.world.health.get(f.corpse)!.alive).toBe(false);
  });

  it("HP/mana follow the match's OWN reviveCircles numbers when the effect names none", () => {
    cover(`${TAG}/revive-inherits-arena-rules`);
    const f = field();
    // 「復活回多少」 has ONE home in 戰鬥系統. Arming the circles with a NON-default
    // 0.2 must move the item too, or the operator's knob is a lie on this path.
    beginCombatRevives(
      f.world,
      reviveRulesFromConfig(
        {
          channelSec: 5,
          radius: 2,
          decayMult: 2,
          revivesPerTeamPerRound: 1,
          reviveHpPctMax: 0.2,
          reviveManaPctMax: 0.2,
          contestPauses: true,
          damageInterrupts: false,
          ccInterrupts: true,
        },
        f.world.dt,
      ),
      [asTeamId(0), asTeamId(1)],
    );
    const maxHp = f.world.stats.get(f.corpse)!.final[Stat.MaxHealth];
    kill(f.world, f.killer, f.enemy);
    step(f.world);
    // 0.2 from the doc + the sibling [回復] clause's 1 %, as above.
    expect(f.world.health.get(f.corpse)!.hp).toBeCloseTo(maxHp * 0.21, 6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §3 — the DECISION FIELDS on `revive`, each proved to actually decide
// ═══════════════════════════════════════════════════════════════════════════
describe("§3 revive decision fields", () => {
  /** A probe item carrying ONE `revive` hook with the given overrides. */
  function probe(over: Record<string, unknown>, target: "allies" | "event"): ItemDef {
    return {
      id: "probe-revive" as ItemId,
      name: "probe",
      cost: 0,
      tier: 1,
      tags: [],
      passive: [
        {
          on: "onKill",
          target,
          effects: [{ kind: "revive", ...over } as never],
        },
      ],
    } as unknown as ItemDef;
  }

  it("`side` defaults to \"ally\" — an onKill revive does NOT resurrect its own victim", () => {
    cover(`${TAG}/revive-side-default-ally`);
    // The footgun: `revive` with the DEFAULT hook scope resolves against the
    // corpse you just made. Without the default this is an item that farms
    // enemies back to life.
    const f = field(null);
    f.world.champion.get(f.killer)!.items[0] = "probe-revive" as ItemId;
    attachItemSource(f.world, f.killer, "probe-revive" as ItemId, 0, probe({}, "event"));
    kill(f.world, f.killer, f.enemy);
    step(f.world);
    expect(f.world.health.get(f.enemy)!.alive).toBe(false);
  });

  it("`side:\"any\"` unlocks it (so the default is a choice, not an accident)", () => {
    cover(`${TAG}/revive-side-any`);
    const f = field(null);
    f.world.champion.get(f.killer)!.items[0] = "probe-revive" as ItemId;
    attachItemSource(
      f.world,
      f.killer,
      "probe-revive" as ItemId,
      0,
      probe({ side: "any" }, "event"),
    );
    kill(f.world, f.killer, f.enemy);
    step(f.world);
    expect(f.world.health.get(f.enemy)!.alive).toBe(true);
  });

  it("`teamCharge:\"requireAndSpend\"` is the once-per-round bound, and it SPENDS", () => {
    cover(`${TAG}/revive-team-charge`);
    const f = field(null);
    f.world.champion.get(f.killer)!.items[0] = "probe-revive" as ItemId;
    attachItemSource(
      f.world,
      f.killer,
      "probe-revive" as ItemId,
      0,
      probe({ teamCharge: "requireAndSpend" }, "allies"),
    );
    // ONE charge for team 0 — the same budget the 復活圈 spends.
    f.world.reviveCharges.set(asTeamId(0), 1);
    kill(f.world, f.killer, f.enemy);
    step(f.world);
    expect(f.world.health.get(f.corpse)!.alive).toBe(true);
    expect(f.world.reviveCharges.get(asTeamId(0))).toBe(0);

    // …and with the budget spent, the next kill revives nobody.
    const enemy2 = hero(f.world, 4, 1, 9);
    recomputeStats(f.world, enemy2);
    kill(f.world, f.enemy, f.corpse); // put him back down (no hook of ours involved)
    step(f.world);
    expect(f.world.health.get(f.corpse)!.alive).toBe(false);
    kill(f.world, f.killer, enemy2);
    step(f.world);
    expect(f.world.health.get(f.corpse)!.alive).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §4 — 甘豆腐之袍 [疊層]: capped, and it LEAVES WITH THE ITEM
// ═══════════════════════════════════════════════════════════════════════════
describe("§4 甘豆腐之袍 [疊層] — +10 INT per hero kill, capped at 160", () => {
  /** Kill `n` enemy champions with `killer`, one per step. */
  function killHeroes(f: Field, n: number): void {
    for (let i = 0; i < n; i++) {
      const victim = hero(f.world, 10 + i, 1, 12 + i);
      recomputeStats(f.world, victim);
      kill(f.world, f.killer, victim);
      step(f.world, 2);
    }
  }

  /**
   * 智慧 CONTRIBUTED BY EQUIPMENT — `總` minus `基礎`, the two readings
   * `stats/attrSources.ts` documents (WC3's `GetHeroStatBJ(…, includeBonuses)`).
   *
   * ⚠️ NOT a raw `liveAttribute("total")` delta. A kill also grants XP, and a
   * LEVEL-UP moves 智慧 by the champion's own growth curve — an earlier draft of
   * this file measured 172 instead of 160 and the 12 was 蒼藍's level growth, not
   * a broken cap. Subtracting `"base"` removes level growth, 三選一 picks and any
   * `grantAttribute` payout in one step, leaving exactly what the SOURCES fold —
   * which is the number under test.
   */
  const fromGear = (f: Field): number =>
    liveAttribute(f.world, f.killer, "int", "total")! -
    liveAttribute(f.world, f.killer, "int", "base")!;

  it("16 hero kills = +160 INT; the 17th adds nothing (「上限 160」)", () => {
    cover(`${TAG}/robe-cap-160`);
    const f = field(ROBE);
    expect(fromGear(f)).toBeCloseTo(0, 9);
    killHeroes(f, 16);
    expect(fromGear(f)).toBeCloseTo(160, 6);
    killHeroes(f, 1);
    expect(fromGear(f)).toBeCloseTo(160, 6); // the cap holds, it does not creep
  });

  it("the ramp really is 10 a kill (not 「something happened」)", () => {
    cover(`${TAG}/robe-ramp-10-per-kill`);
    const f = field(ROBE);
    killHeroes(f, 1);
    expect(fromGear(f)).toBeCloseTo(10, 6);
    killHeroes(f, 2);
    expect(fromGear(f)).toBeCloseTo(30, 6);
  });

  it("SELLING the robe takes all of it — the whole reason it is not `attrBonus`", () => {
    cover(`${TAG}/robe-stacks-leave-on-sell`);
    const f = field(ROBE);
    killHeroes(f, 5);
    expect(fromGear(f)).toBeCloseTo(50, 6);

    const slot = f.world.champion.get(f.killer)!.items.indexOf(ROBE);
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(sellItem(f.world, f.killer, slot)).toBe(true);
    recomputeStats(f.world, f.killer);
    expect(fromGear(f)).toBeCloseTo(0, 9);
    // …and the permanent accumulator was never touched, which is what makes the
    // removal structural rather than a teardown somebody has to remember.
    expect(f.world.champion.get(f.killer)!.attrBonus.int).toBeCloseTo(0, 9);
  });

  it("the stacks are REAL stats, not just a number: AP moves with them", () => {
    cover(`${TAG}/robe-stacks-reach-the-sheet`);
    // 失敗形態 ⑦ (掃屬性代替掃行為): 「liveAttribute went up」 is a property.
    // What the player feels is AP, via `championStatBase`'s intToAp coefficient.
    // Measured across the SELL rather than across the kills, so a level-up
    // cannot be what moved it.
    const f = field(ROBE);
    killHeroes(f, 16);
    recomputeStats(f.world, f.killer);
    const apStacked = f.world.stats.get(f.killer)!.final[Stat.AbilityPower];
    const slot = f.world.champion.get(f.killer)!.items.indexOf(ROBE);
    sellItem(f.world, f.killer, slot);
    recomputeStats(f.world, f.killer);
    expect(apStacked).toBeGreaterThan(f.world.stats.get(f.killer)!.final[Stat.AbilityPower]);
  });

  it("a MOB-shaped kill does not stack it (「每殺死一名英雄」)", () => {
    cover(`${TAG}/robe-victim-champion-only`);
    const f = field(ROBE);
    const neutral = f.world.spawn();
    f.world.transform.set(neutral, {
      pos: { x: Z0.center.x, z: Z0.center.z + 2 },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.6,
      zone: 0,
    });
    f.world.health.set(neutral, { hp: 10, maxHp: 10, mana: 0, maxMana: 0, alive: true, shields: [] });
    kill(f.world, f.killer, neutral);
    step(f.world);
    expect(fromGear(f)).toBeCloseTo(0, 9);
  });

  it("the stacks survive the holder's own death (an item bonus is not a buff)", () => {
    cover(`${TAG}/robe-stacks-survive-death`);
    const f = field(ROBE);
    killHeroes(f, 3);
    kill(f.world, f.enemy, f.killer);
    step(f.world);
    expect(f.world.health.get(f.killer)!.alive).toBe(false);
    recomputeStats(f.world, f.killer);
    expect(fromGear(f)).toBeCloseTo(30, 6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §5 — THE DOC AND THE OWNER'S PROSE, pinned to each other (失敗形態 ⑤)
// ═══════════════════════════════════════════════════════════════════════════
describe("§5 the shipped docs still say what the 效能 prose says", () => {
  it("天生牙 carries exactly the two onKill clauses, and they differ ONLY in `victim`", () => {
    cover(`${TAG}/fang-doc-shape`);
    const d = doc(FANG) as { description: string; passive: Record<string, unknown>[] };
    expect(d.description).toContain("[復活] 殺死任一個敵方英雄單位");
    expect(d.description).toContain("[回復] 殺死任一個敵方單位");
    // ⚠️ 這裡篩 `on === "onKill"` 而不是斷言 `d.passive.length === 2`。
    // 這條測試的標題就寫著它守的是什麼:「**兩條 onKill** 只差在 victim」——
    // 「這件道具總共只有兩條被動」是另一件事,而那件事沒有人主張過。
    // 2026-08-05（A4b/#278）天生牙依 owner 裁決多了一條 `onInterval` 的
    // 【淨化】光環,總數斷言就此變成一條**過期的規格**:它會在別人做對事情的
    // 時候紅,而且用錯誤的訊息紅(參 CLAUDE.md「itemTiers 那一型」)。
    const hooks = d.passive.filter((h) => h.on === "onKill");
    expect(hooks.length).toBe(2);
    // 但也不可以就這樣放生:第三條必須真的是那條被授權的淨化,
    // 否則任何人往這件道具上黏任何東西都不會被發現。
    const others = d.passive.filter((h) => h.on !== "onKill");
    expect(others.map((h) => (h.effects as { kind: string }[])[0]!.kind)).toEqual(["dispel"]);
    for (const h of hooks) {
      expect(h.on).toBe("onKill");
      expect(h.target).toBe("allies"); // 「我方所有英雄」 / 「我們全部英雄」
    }
    const revive = hooks.find((h) => (h.effects as { kind: string }[])[0]!.kind === "revive")!;
    const restore = hooks.find((h) => (h.effects as { kind: string }[])[0]!.kind === "restore")!;
    expect(revive.victim).toBe("champion"); // 「敵方**英雄**單位」
    expect(restore.victim).toBe("any"); //     「敵方**單位**」 — a zombie counts
    // 1 %, read out of the prose rather than typed here.
    const pct = /回復我們全部英雄\s*(\d+(?:\.\d+)?)%生命/.exec(d.description)![1]!;
    expect((restore.effects as { healthPct: number }[])[0]!.healthPct).toBeCloseTo(
      Number(pct) / 100,
      9,
    );
  });

  it("甘豆腐之袍's 10 / 160 come from the prose, and it banks onto the ITEM", () => {
    cover(`${TAG}/robe-doc-shape`);
    const d = doc(ROBE) as { description: string; passive: Record<string, unknown>[] };
    const m = /每殺死一名英雄可以額外獲得\s*(\d+)點智慧，上限\s*(\d+)/.exec(d.description)!;
    const e = (d.passive[0]!.effects as Record<string, unknown>[])[0]!;
    expect(d.passive[0]!.on).toBe("onKill");
    expect(d.passive[0]!.victim).toBe("champion");
    expect(e.kind).toBe("grantAttribute");
    expect(e.attr).toBe("int");
    expect(e.amount).toBe(Number(m[1]));
    expect(e.maxSourceTotal).toBe(Number(m[2]));
    // ⭐ the field that makes selling remove it. Deleting it from the doc leaves
    // every other assertion in this file green except §4's sell case.
    expect(e.store).toBe("source");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §6 — determinism of the new scope (sim/purity.test.ts's other half)
// ═══════════════════════════════════════════════════════════════════════════
describe("§6 the 全隊 scope is deterministic", () => {
  it("`alliedChampions` is sorted, includes self and the dead, excludes enemies", () => {
    cover(`${TAG}/allies-sorted`);
    const f = field(null);
    const allies = alliedChampions(f.world, f.killer);
    expect(allies).toEqual([...allies].sort((a, b) => a - b));
    expect(allies).toContain(f.killer); // self
    expect(allies).toContain(f.corpse); // dead — `revive` needs them
    expect(allies).not.toContain(f.enemy);
  });

  it("a body with no team gets an EMPTY list, not the whole world", () => {
    cover(`${TAG}/allies-teamless`);
    const f = field(null);
    const loose = f.world.spawn();
    expect(alliedChampions(f.world, loose)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §7 — the #195 refusal, INHERITED rather than re-decided
// ═══════════════════════════════════════════════════════════════════════════
describe("§7 a fully-closed fire ring refuses the item revive too", () => {
  it("nobody stands up inside a closed ring (the griefing loop the circle also refuses)", () => {
    cover(`${TAG}/revive-refused-inside-closed-ring`);
    const f = field();
    // A ring closed to 0.1 u — smaller than a champion's 0.6 body, so
    // `fireRingInnerRadius` is negative and there is nowhere survivable at all.
    // Burn rates 0 so the ring cannot be what kills anyone during the assertion.
    f.world.fireRingRules = {
      startTicks: 0,
      shrinkTicks: 1,
      minRadius: 0.1,
      // 二段制 OFF for this fixture: `stage1Radius === minRadius` and
      // `stage2ShrinkTicks === 0` is exactly what `fireRingRulesFromConfig`
      // produces for a config with no `stage2StartSec`, i.e. the single-stage
      // law this case has always been about (a ring that is ALREADY closed).
      stage1Radius: 0.1,
      stage2GapTicks: 1,
      stage2ShrinkTicks: 0,
      burnCurveTicks: [0],
      burnCurveRates: [0],
      maxPctPerSec: 0,
      combatMaxTicks: Number.POSITIVE_INFINITY,
      // 殭屍王 extension knobs, all disarmed — this case is about the CLOSED
      // ring, and a boss extension would move `startTicks` out from under it.
      bossExtendTicks: 0,
      bossDelayTicks: 0,
      bossExtendedTicks: 0,
      bossDelayedTicks: 0,
      // 回合硬上限 (#248) disarmed for the same reason: this case is about a ring
      // that is ALREADY closed, and a cap is a ceiling on when it opens.
      hardCapTicks: Number.POSITIVE_INFINITY,
      hardDeadlineTicks: Number.POSITIVE_INFINITY,
    };
    f.world.fireRingTicks = 1000;

    kill(f.world, f.killer, f.enemy);
    step(f.world);

    expect(f.world.health.get(f.corpse)!.alive).toBe(false);
  });
});
