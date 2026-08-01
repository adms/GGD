/**
 * 格擋 — THE FOUR SHIPPED DOCS, driven through the shipped equip path.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SEPARATE FILE FROM `block.test.ts`
 *
 * `block.test.ts` proves the MECHANISM on fixtures. That is a different claim
 * from 「the four items owner wrote actually do it」, and CLAUDE.md 失敗形態 ⑤
 * (「被測的不是出貨的那個」) is exactly the gap between them: a perfect gate with
 * the content still un-authored changes nothing a player can feel, and every
 * fixture test stays green while it is true.
 *
 * So this file reads `content/items/*.json` DIRECTLY (like
 * `effects/shieldAbsorb.test.ts` and `content/icons.test.ts`) — no
 * `ContentLoader` boot, so it neither depends on `pnpm content:build` having run
 * nor on the rest of the tree parsing, and it cannot time out in a busy suite.
 * (That last point is not hypothetical: a guard in this same batch passed
 * standalone and then blew a 10 s `beforeAll` inside the full parallel run.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THREE CLAIMS, EACH AT ITS OWN LAYER
 *
 *   ① THE DOC SAYS IT — the authored `block` values are pinned per item, so a
 *      silent rebalance (or an agent "tidying" a number) is a red test, and the
 *      values are checked against `zItemBlockGrant`, so the shipped bytes really
 *      do parse.
 *   ② THE SIM RECEIVES IT — the source is built by `economy/itemSource.ts`
 *      `itemModifierSource`, the ONE builder every equip path uses. Deleting the
 *      `block: def.block` forward there is the classic 「算出來但從沒送到」
 *      (失敗形態 ②) and it goes red here.
 *   ③ THE MATCH FEELS IT — real packets, real ticks, reading `health.hp`. This
 *      is the layer that would catch a block that resolves after the hp write.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { zeroStats } from "../stats/statTypes";
import { attachSource } from "../stats/statPipeline";
import { itemModifierSource } from "../economy/itemSource";
import { zItemBlockGrant } from "../../content/schema/item";
import type { BlockGrant } from "./block";
import type { ItemDef } from "../content/defs";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId, type SeatId } from "../../ids";
import type { DamageType } from "../effects/effect";
import type { IntentFrame } from "../intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const ITEMS = join(HERE, "../../../../../content/items");
const NO_INTENTS: ReadonlyMap<SeatId, IntentFrame> = new Map();
const Z0 = SKELETON_ARENA.zones[0]!;
const LANE_Z = Z0.center.z + 14;

function doc(itemId: string): ItemDef & { description: string } {
  return JSON.parse(readFileSync(join(ITEMS, `${itemId}.json`), "utf8"));
}

/**
 * WHAT owner's prose promises, per item — transcribed here so the assertion and
 * the sentence it is about sit on the same screen. The `line` string is quoted
 * from `description` and re-checked against the real doc below, so this table
 * cannot drift away from owner's text without going red (第三守則).
 */
const SHIPPED: {
  id: string;
  name: string;
  line: string;
  block: BlockGrant;
  /** types the prose says are stopped / let through, for the behaviour pass */
  stopped: DamageType[];
  through: DamageType[];
}[] = [
  {
    id: "godie-i00j",
    name: "奇門盾甲",
    line: "[格擋] 50%格擋 AD 及 AP 傷害 (真實傷害無法阻擋)",
    block: { damageTypes: ["physical", "magic"], chance: 0.5, fraction: 1 },
    stopped: ["physical", "magic"],
    through: ["true"],
  },
  {
    id: "godie-i00s",
    name: "黃金聖鬥衣",
    line: "[格擋] 50%機率抵擋 100% AP傷害",
    block: { damageTypes: ["magic"], chance: 0.5, fraction: 1 },
    stopped: ["magic"],
    through: ["physical", "true"],
  },
  {
    id: "godie-i016",
    name: "晨曦之光",
    line: "[格擋] 30%機率 抵擋致命一擊(超過現存生命的傷害)",
    block: {
      damageTypes: ["physical", "magic", "true"],
      chance: 0.3,
      fraction: 1,
      lethalOnly: true,
      internalCooldown: 1,
    },
    stopped: ["physical", "magic", "true"],
    through: [],
  },
  {
    id: "godie-i06g",
    name: "殺豬刀",
    line: "[格擋] 30%機率 抵擋致命一擊(超過現存生命的傷害)",
    block: {
      damageTypes: ["physical", "magic", "true"],
      chance: 0.3,
      fraction: 1,
      lethalOnly: true,
      internalCooldown: 1,
    },
    stopped: ["physical", "magic", "true"],
    through: [],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
describe("格擋 · ① the four shipped docs really carry the values owner's prose promises", () => {
  for (const s of SHIPPED) {
    it(`${s.name} ${s.id}`, () => {
      const d = doc(s.id);
      // The quoted line is still owner's line. Without this the table below
      // could describe an item whose text was rewritten under it.
      expect(d.description).toContain(s.line);
      expect(d.block).toEqual(s.block);
      // …and the shipped bytes really pass the authoring schema.
      expect(zItemBlockGrant.parse(d.block)).toEqual(s.block);
    });
  }

  it("內部冷卻只在**致命一擊格擋**上,兩支平擋沒有 —— owner 的裁決只講了那一族", () => {
    // owner 2026-07-31:「**致命一擊格擋**要不要內部冷卻? => 冷卻 1秒」。
    // 那句話沒有提到奇門盾甲與黃金聖鬥衣,而它們的「50%」在文案上是「每一發
    // 各抽一次」—— 給它們一個一秒冷卻等於把 50% 悄悄變成「每秒最多擋一次」,
    // 那是一次沒有人核准過的削弱。這一條是那個削弱的守衛。
    for (const s of SHIPPED) {
      const icd = doc(s.id).block!.internalCooldown;
      if (s.block.lethalOnly === true) expect(icd, s.name).toBe(1);
      else expect(icd, s.name).toBeUndefined();
    }
  });

  it("殺豬刀 and 晨曦之光 carry the IDENTICAL grant — one sentence, one set of values", () => {
    // owner wrote the same clause on both. Two docs that drift apart on a
    // sentence that is byte-identical is a balance bug nobody would ever
    // notice by reading either file alone.
    expect(doc("godie-i06g").block).toEqual(doc("godie-i016").block);
  });

  it("「真實傷害無法阻擋」 is written on exactly ONE doc, and exactly that doc omits `true`", () => {
    // The carve-out is DATA, not a rule — so the prose clause and the array
    // contents have to agree. Stated as an implication rather than an
    // equivalence, because the CONVERSE is false and that is not a bug:
    // 黃金聖鬥衣 also omits `true`, for the unrelated reason that its whole
    // grant is magic-only. Writing this as `includes === !saysNoTrue` is how
    // I first got it wrong.
    const withClause = SHIPPED.filter((s) => doc(s.id).description.includes("真實傷害無法阻擋"));
    expect(withClause.map((s) => s.id)).toEqual(["godie-i00j"]);
    for (const s of withClause) expect(doc(s.id).block!.damageTypes).not.toContain("true");
    // …and the two death saves, whose prose carries NO such clause, do cover it.
    for (const s of SHIPPED.filter((x) => x.block.lethalOnly === true)) {
      expect(doc(s.id).description).not.toContain("真實傷害無法阻擋");
      expect(doc(s.id).block!.damageTypes).toContain("true");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("格擋 · ② the shipped equip path forwards it to the sim", () => {
  for (const s of SHIPPED) {
    it(`${s.name} — itemModifierSource carries the grant`, () => {
      const world = new SimWorld(SKELETON_ARENA, 1);
      const holder = world.spawn();
      const src = itemModifierSource(world, holder, s.id as ItemId, 0, doc(s.id));
      // The `block: def.block` line in economy/itemSource.ts is the ENTIRE
      // wiring — delete it and the item parses, ships, appears in the shop, and
      // does nothing (失敗形態 ②). This is the assertion that notices.
      expect(src.block).toEqual(s.block);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
describe("格擋 · ③ what the doc does in a real match", () => {
  interface Rig {
    world: SimWorld;
    attacker: EntityId;
    victim: EntityId;
  }

  /** Victim carries the REAL item's source and a zeroed StatsComp (see block.test.ts). */
  function rigWith(itemId: string, seed: number, hp: number): Rig {
    const world = new SimWorld(SKELETON_ARENA, seed);
    const spawn = (x: number, seat: number, team: number, life: number): EntityId => {
      const id = world.spawn();
      world.transform.set(id, {
        pos: { x, z: LANE_Z },
        vel: { x: 0, z: 0 },
        facing: { x: 1, z: 0 },
        radius: 0.6,
        zone: 0,
      });
      world.health.set(id, {
        hp: life,
        maxHp: 20000,
        mana: 400,
        maxMana: 400,
        alive: true,
        shields: [],
      });
      world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
      world.nav.set(id, {
        order: null,
        moveTarget: null,
        override: null,
        attackTarget: null,
        attackTargetAuto: false,
      });
      world.status.set(id, { effects: [] });
      world.stats.set(id, {
        championId: "fixture" as ChampionId,
        final: zeroStats(),
        dirty: false,
        sources: [],
      });
      return id;
    };
    const attacker = spawn(Z0.center.x, 0, 0, 20000);
    const victim = spawn(Z0.center.x + 3, 1, 1, hp);
    // THE SHIPPED BUILDER, not a hand-written literal.
    attachSource(world, victim, itemModifierSource(world, victim, itemId as ItemId, 0, doc(itemId)));
    world.rebuildGrid();
    return { world, attacker, victim };
  }

  /**
   * Fire N identical packets one per tick; report how many cost the victim 0 hp.
   *
   * ⚠️ `alive` is restored at the TOP of every trial, not just `hp`. A death-save
   * trial by definition sends a killing blow, so an unsaved trial leaves the body
   * dead — and `combatResolveSystem`'s very first line is
   * `if (!hp || !hp.alive) continue`, which drops the next packet WITHOUT
   * touching hp. Reading that as "blocked" is a false positive, and it is not
   * hypothetical: the first version of this helper reset only `hp` and reported
   * 399 saves out of 400 on a 30 % item.
   */
  function blockedOutOf(
    r: Rig,
    n: number,
    amount: number,
    type: DamageType,
    /**
     * 每一發之間多空幾個 tick。**內部冷卻**(晨曦之光 / 殺豬刀 = 1 秒)讓
     * 「一個 tick 一發」和「一秒一發」量到的是兩件完全不同的事:前者量的是
     * 冷卻,後者量的才是 30% 這個機率。0 = 原本的逐 tick 節奏。
     */
    gapTicks = 0,
  ): number {
    const hp = r.world.health.get(r.victim)!;
    let blocked = 0;
    for (let i = 0; i < n; i++) {
      for (let g = 0; g < gapTicks; g++) {
        r.world.step(NO_INTENTS);
        hp.alive = true;
      }
      hp.alive = true;
      const before = hp.hp;
      r.world.damageQueue.push({
        source: r.attacker,
        target: r.victim,
        amount,
        type,
        crit: false,
        origin: "basic",
      });
      r.world.step(NO_INTENTS);
      if (hp.hp === before) blocked++;
      hp.hp = before; // hold the victim at a fixed hp so every trial is identical
      hp.alive = true;
    }
    return blocked;
  }

  // ---- the two flat-chance items -----------------------------------------
  for (const s of SHIPPED.filter((x) => x.block.lethalOnly !== true)) {
    it(`${s.name} stops roughly ${Math.round(s.block.chance * 100)}% of ${s.stopped.join("/")}`, () => {
      for (const type of s.stopped) {
        const r = rigWith(s.id, 4242, 10000);
        const blocked = blockedOutOf(r, 400, 50, type);
        // ±10 pp band on 400 trials: wide enough that the seed cannot make it
        // flaky, narrow enough that a 0.3 authored as 0.5 (or a block that
        // never fires) is caught. Measured on seed 4242: 奇門盾甲 physical 209.
        expect(blocked).toBeGreaterThan(400 * (s.block.chance - 0.1));
        expect(blocked).toBeLessThan(400 * (s.block.chance + 0.1));
      }
    });

    it(`${s.name} never stops ${s.through.join("/")}`, () => {
      for (const type of s.through) {
        const r = rigWith(s.id, 4242, 10000);
        // ZERO, not "fewer" — the type filter is absolute, not a modifier.
        expect(blockedOutOf(r, 400, 50, type)).toBe(0);
      }
    });
  }

  // ---- the two death saves ------------------------------------------------
  for (const s of SHIPPED.filter((x) => x.block.lethalOnly === true)) {
    it(`${s.name} ignores survivable hits entirely`, () => {
      const r = rigWith(s.id, 777, 10000);
      // 「超過現存生命的傷害」 — 50 out of 10,000 is not that, at any chance.
      expect(blockedOutOf(r, 400, 50, "physical")).toBe(0);
    });

    it(`${s.name} saves roughly 30% of the hits that WOULD kill (packets spaced past the 1 s ICD)`, () => {
      const r = rigWith(s.id, 777, 500);
      // ⚠️ `gapTicks` 是這一條的重點,不是調味料。owner 2026-07-31 給了這兩支
      // **1 秒內部冷卻**,所以「一個 tick 一發」量到的是 400/30 ≈ 13 次保命
      // (實測 13),那是冷卻的數字不是 30% 的數字。把封包拉開到超過一秒,
      // 冷卻就不再是瓶頸,量到的才是 owner 文案裡那個 30%。
      const gap = Math.round(1 / r.world.dt) + 1; // 1 秒 + 1 tick
      const saved = blockedOutOf(r, 200, 5000, "physical", gap); // 5000 >> 500 hp
      expect(saved).toBeGreaterThan(200 * (s.block.chance - 0.1));
      expect(saved).toBeLessThan(200 * (s.block.chance + 0.1));
    });

    it(`${s.name} 的 1 秒內部冷卻是真的 —— 逐 tick 猛打不會變成連續保命`, () => {
      // owner:「致命一擊格擋要不要內部冷卻? => 冷卻 1秒」。
      // 沒有冷卻時 400 發 30% 會救下 ~120 次;有 1 秒冷卻時上限是
      // 400 / 30 ≈ 14 次,而且幾乎和 chance 無關。兩個數字差一個數量級,所以
      // 這一條分得出「欄位寫進文件了但沒有人讀它」(失敗形態 ②)。
      const r = rigWith(s.id, 777, 500);
      const perTick = Math.round(1 / r.world.dt);
      const saved = blockedOutOf(r, 400, 5000, "physical"); // 逐 tick,不留空隙
      expect(saved).toBeLessThanOrEqual(Math.ceil(400 / perTick));
      expect(saved).toBeGreaterThan(0); // …但它沒有壞掉:還是會救
    });

    it(`${s.name} saves against true damage too (no 真傷 clause in its prose)`, () => {
      const r = rigWith(s.id, 777, 500);
      expect(blockedOutOf(r, 400, 5000, "true")).toBeGreaterThan(0);
    });
  }

  it("a saved champion is still ALIVE and still on the same hp — the save is not a heal", () => {
    const r = rigWith("godie-i016", 777, 500);
    const hp = r.world.health.get(r.victim)!;
    let saw = false;
    for (let i = 0; i < 60 && !saw; i++) {
      r.world.damageQueue.push({
        source: r.attacker,
        target: r.victim,
        amount: 5000,
        type: "physical",
        crit: false,
        origin: "basic",
      });
      r.world.step(NO_INTENTS);
      if (hp.hp === 500) saw = true;
      else hp.hp = 500; // reset the deaths and try again
      hp.alive = true;
    }
    expect(saw).toBe(true);
    expect(hp.hp).toBe(500); // exactly the hp it started on — never above
  });
});
