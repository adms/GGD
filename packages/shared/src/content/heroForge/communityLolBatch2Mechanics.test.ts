import { beforeAll, describe, expect, it } from "vitest";
import { shippedHeroCatalog } from "../../../testkit/heroPackageFixture";
import { TICK_HZ } from "../../constants";
import { asSeatId, asTeamId, type EntityId, type StatusId, type ChampionId } from "../../ids";
import { Abilities, SimWorld, rankUpAbility, registerChampion, spawnChampion, type IntentFrame, type SimEvent } from "../../sim";
import { extendRegistryContext, withRegistryContext } from "../../sim/content/registryContext";
import { runEffects } from "../../sim/effects/effectRunner";
import type { TemplateDoc } from "../schema/template";
import type { VfxSubtypeDoc } from "../schema/vfxSubtype";
import { createCommunityHeroRecipe } from "./communityExamples";
import { COMMUNITY_LOL_BATCH2_EXAMPLES } from "./communityLolBatch2";
import { compileGeneratedHeroDraft, generateHeroDraft, type CompiledHeroDraftResult } from "./generator";
import { createHeroSimulationBaseline } from "./simulationBaseline";

const catalog = shippedHeroCatalog();
const baseline = createHeroSimulationBaseline(catalog.documents);
const templates = [...catalog.documents].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
const configs = [...catalog.documents].filter(([key]) => key.startsWith("config/")).map(([, doc]) => doc);
const vfxSubtypes = [...catalog.documents].filter(([key]) => key.startsWith("vfx-subtypes/")).map(([, doc]) => doc as VfxSubtypeDoc);
const compiled = new Map<string, Extract<CompiledHeroDraftResult, { ok: true }>>();

beforeAll(() => {
  for (const id of ["sett", "fiddlesticks", "ornn", "ahri", "thresh"]) {
    const recipe = COMMUNITY_LOL_BATCH2_EXAMPLES.find((entry) => entry.id === id)!;
    const project = createCommunityHeroRecipe(recipe, `lol-mechanics-${id}`, templates);
    const generated = generateHeroDraft(project.acceptedPlan!, {
      heroId: project.projectId, heroName: project.brief.name, presentation: project.presentation,
    });
    const result = compileGeneratedHeroDraft(generated, templates, configs, vfxSubtypes);
    if (!result.ok) throw new Error(JSON.stringify(result.failures));
    compiled.set(id, result);
  }
});

type Rig = {
  world: SimWorld;
  hero: EntityId;
  foes: EntityId[];
  draft: Extract<CompiledHeroDraftResult, { ok: true }>["draft"];
  events: SimEvent[];
  step: (intent?: IntentFrame) => void;
};

function withHero(id: string, spots: [number, number][], run: (rig: Rig) => void) {
  const { draft } = compiled.get(id)!;
  const context = extendRegistryContext(baseline.context, `lol-mechanics-${id}`, () => {
    for (const ability of Object.values(draft.abilityDrafts)) Abilities.register(ability.id, ability);
    registerChampion(draft.champion, { overrideAbilities: true });
  });
  withRegistryContext(context, () => {
    const world = new SimWorld(baseline.arena, 0x11b2);
    Object.assign(world, structuredClone(baseline.rules));
    world.combatActive = true;
    const center = baseline.arena.zones[0]!.center;
    const hero = spawnChampion(world, { championId: draft.champion.id, seatId: asSeatId(0), teamId: asTeamId(0), pos: { ...center }, zone: 0, level: 18 });
    const foes = spots.map(([dx, dz], index) => spawnChampion(world, { championId: "thorne" as ChampionId, seatId: asSeatId(index + 1), teamId: asTeamId(1), pos: { x: center.x + dx, z: center.z + dz }, zone: 0, level: 18 }));
    const events: SimEvent[] = [];
    const step = (intent: IntentFrame = { commands: [], order: { kind: "hold" } }) => {
      world.step(new Map([
        [asSeatId(0), intent],
        ...foes.map((_, index) => [asSeatId(index + 1), { commands: [], order: { kind: "hold" } }] as [ReturnType<typeof asSeatId>, IntentFrame]),
      ]));
      events.push(...world.events);
    };
    step();
    // Keep all three geometry witnesses alive; no authored damage or range is changed.
    for (const entity of [hero, ...foes]) Object.assign(world.health.get(entity)!, { maxHp: 1_000_000, hp: 1_000_000 });
    world.transform.get(hero)!.facing = { x: 1, z: 0 };
    run({ world, hero, foes, draft, events, step });
  });
}

const damageFrom = (rig: Rig, slot: "W" | "E" | "R") => rig.events.filter((event) => event.type === "damage" && event.data.source === rig.hero && String(event.data.origin).includes(rig.draft.abilityDrafts[slot].id));

describe("LoL batch 2 corrected recipe mechanics", () => {
  it.each([0, 2, 3])("Sett W with %i grit hits center as true, sides as physical, never double-hits, and spends existing grit", (stacks) => {
    withHero("sett", [[3, 0], [3, 1.5], [3, 3]], (rig) => {
      const { world, hero, foes, draft, step } = rig;
      expect(rankUpAbility(world, hero, "W")).toBe(true);
      if (stacks > 0) runEffects([{ kind: "applyStatus", statusId: `${draft.champion.id}.grit` as StatusId, duration: 10, sourceScope: "caster", applyTo: "self", stacks }], { world, caster: hero, rank: 1, targets: [], origin: "fixture:grit", rng: world.rng });
      step({ commands: [{ kind: "castAbility", slot: "W", target: { type: "self" } }], order: { kind: "hold" } });
      for (let tick = 0; tick < TICK_HZ; tick++) step();
      const hits = damageFrom(rig, "W");
      expect(world.health.get(hero)!.shields.some((shield) => shield.stackKey === `${draft.champion.id}.w` && shield.amount > 0 && shield.expiresAtTick > world.tick)).toBe(true);
      expect(hits.filter((event) => event.data.target === foes[0]).map((event) => event.data.dmgType)).toEqual(["true"]);
      expect(hits.filter((event) => event.data.target === foes[1]).map((event) => event.data.dmgType)).toEqual(["physical"]);
      expect(hits.filter((event) => event.data.target === foes[2])).toEqual([]);
      expect(world.status.get(hero)!.effects.filter((effect) => effect.statusId === `${draft.champion.id}.grit` && effect.expiresAtTick > world.tick)).toEqual([]);
    });
  });

  it("Sett R carries the selected enemy past its starting position and damages only after travel ends", () => {
    withHero("sett", [[1, 0], [4, 0]], (rig) => {
      const { world, hero, foes, step, events } = rig;
      expect(rankUpAbility(world, hero, "R")).toBe(true);
      const start = { ...world.transform.get(hero)!.pos };
      step({ commands: [{ kind: "castAbility", slot: "R", target: { type: "entity", entityId: foes[0]! } }] });
      let sawPassenger = false;
      for (let tick = 0; tick < 2 * TICK_HZ && damageFrom(rig, "R").length === 0; tick++) {
        if (world.carried.has(foes[0]!)) {
          sawPassenger = true;
          const carrier = world.transform.get(hero)!.pos;
          const passenger = world.transform.get(foes[0]!)!.pos;
          expect(Math.hypot(passenger.x - carrier.x, passenger.z - carrier.z)).toBeLessThan(0.01);
        }
        if (world.nav.get(hero)?.override?.kind === "dash") expect(damageFrom(rig, "R")).toEqual([]);
        step();
      }
      expect(events.some((event) => event.type === "abilityCast" && event.data.caster === hero && event.data.slot === "R")).toBe(true);
      expect(sawPassenger).toBe(true);
      expect(world.transform.get(hero)!.pos.x - start.x).toBeGreaterThan(2);
      expect(world.transform.get(foes[0]!)!.pos.x - start.x).toBeGreaterThan(2);
      expect(damageFrom(rig, "R").some((event) => event.data.target === foes[1])).toBe(true);
      for (let tick = 0; tick < TICK_HZ; tick++) step();
      expect(world.carried.has(foes[0]!)).toBe(false);
    });
  });

  // GH#1190 —— 正常輸入 Q→E：E 撞 Q 柱才震波擊飛並撞碎柱子；同一招對空衝（沒柱）⛔ 不震。
  // ⭐ 兩臂的敵人都站在「E 停下處」的震波半徑內、衝刺線外 ⇒ 空衝那一臂若照樣震，一定打得到他。
  it.each([[true, 5], [false, 7]] as const)("Ornn E after Q pillar=%s knocks up and shatters only when the dash is blocked", (withPillar, foeX) => {
    withHero("ornn", [[foeX, 2]], (rig) => {
      const { world, hero, foes, step, events } = rig;
      for (const slot of ["Q", "E"] as const) expect(rankUpAbility(world, hero, slot)).toBe(true);
      const start = { ...world.transform.get(hero)!.pos };
      const ahead = { type: "point" as const, point: { x: start.x + 3, z: start.z } };
      if (withPillar) {
        step({ commands: [{ kind: "castAbility", slot: "Q", target: ahead }] });
        // Q 落空會吃完整後搖（abilityRecovery）⇒ 等玩家真的按得出 E 的時候再按；柱子活 4 秒以上
        for (let tick = 0; tick < 2 * TICK_HZ; tick++) step();
        const qEffects = COMMUNITY_LOL_BATCH2_EXAMPLES.find((r) => r.id === "ornn")!.moves.Q.params.effects as { kind: string; offsetForwardU?: number }[];
        const lineEnd = qEffects.find((e) => e.kind === "spawnObstacle")!.offsetForwardU!;
        expect([...world.obstacle.values()].map((o) => o.center.x - start.x), "Q 柱在裂地終點（⛔ 不在腳下）").toEqual([lineEnd]);
      }
      step({ commands: [{ kind: "castAbility", slot: "E", target: ahead }] });
      for (let tick = 0; tick < TICK_HZ; tick++) step();
      expect(events.some((e) => e.type === "abilityCast" && e.data.caster === hero && e.data.slot === "E")).toBe(true);
      const shock = damageFrom(rig, "E").filter((e) => e.data.target === foes[0]);
      const knockup = events.filter((e) => e.type === "leapStart" && e.data.id === foes[0]);
      expect([shock.length > 0, knockup.length > 0, events.some((e) => e.type === "obstacleShatter")]).toEqual([withPillar, withPillar, withPillar]);
      expect(world.obstacle.size, "柱子被撞碎（沒柱那一臂本來就是 0）").toBe(0);
    });
  });

  // GH#1187【再次施放】—— 三種用法都走正常指令（world.step 的 castAbility），⛔ 不手造階段。
  const cast = (slot: "Q" | "R", point: { x: number; z: number }): IntentFrame => ({ commands: [{ kind: "castAbility", slot, target: { type: "point", point } }] });
  const rejected = (rig: Rig, slot: "Q" | "R") => rig.events.filter((e) => e.type === "castRejected" && e.data.entity === rig.hero && e.data.slot === slot).map((e) => e.data.reason);
  const settle = (rig: Rig, ticks = TICK_HZ) => { for (let tick = 0; tick < ticks; tick++) rig.step(); };

  it("recast: Ahri R dashes to three separately aimed points and only then starts its cooldown", () => {
    withHero("ahri", [[0, -8]], (rig) => {
      const { world, hero } = rig;
      expect(rankUpAbility(world, hero, "R")).toBe(true);
      const c = { ...world.transform.get(hero)!.pos };
      const aims = [{ x: c.x + 3, z: c.z }, { x: c.x + 3, z: c.z + 3 }, { x: c.x, z: c.z + 3 }];
      const landed = aims.map((aim) => {
        rig.step(cast("R", aim));
        settle(rig);
        return world.transform.get(hero)!.pos;
      }).map((pos, i) => Math.hypot(pos.x - aims[i]!.x, pos.z - aims[i]!.z) < 1);
      expect(landed, "每一段落在自己那一按的落點").toEqual([true, true, true]);
      expect(world.abilities.get(hero)!.slots.R.cooldownRemainingTicks, "三段衝完才進冷卻").toBeGreaterThan(0);
      rig.step(cast("R", c));
      expect(rejected(rig, "R")).toEqual(["cooldown"]);
    });
  });

  it.each(["miss", "hit", "victim-dies"] as const)("recast: Thresh Q %s", (arm) => {
    withHero("thresh", [arm === "miss" ? [0, 6] : [5, 0]], (rig) => {
      const { world, hero, foes } = rig;
      expect(rankUpAbility(world, hero, "Q")).toBe(true);
      const c = { ...world.transform.get(hero)!.pos };
      rig.step(cast("Q", { x: c.x + 5, z: c.z }));
      settle(rig, TICK_HZ / 2);
      if (arm === "victim-dies") {
        Object.assign(world.health.get(foes[0]!)!, { hp: 1 });
        runEffects([{ kind: "damage", damageType: "true", amount: { flat: 100 } }], { world, caster: hero, rank: 1, targets: [foes[0]!], origin: "fixture:kill", rng: world.rng });
        settle(rig, 2);
        expect(world.health.get(foes[0]!)!.alive).toBe(false);
        expect(world.abilities.get(hero)!.slots.Q.recast, "被鉤者死亡 ⇒ 後段當場清除").toBeUndefined();
      }
      // ⭐ 刻意朝反方向按：飛向被鉤者靠的是錨點，⛔ 不是這一按的瞄準
      rig.step(cast("Q", { x: c.x - 5, z: c.z }));
      settle(rig, TICK_HZ / 2);
      if (arm === "hit") {
        const [h, f] = [world.transform.get(hero)!.pos, world.transform.get(foes[0]!)!.pos];
        expect(Math.hypot(h.x - f.x, h.z - f.z), "飛到同一個被鉤者身邊").toBeLessThan(2);
        expect(rejected(rig, "Q")).toEqual([]);
      } else expect(rejected(rig, "Q")).toEqual([arm === "miss" ? "recast-gate" : "cooldown"]);
    });
  });

  it.each([true, false])("recast: Ornn R recast dash rams the goat=%s ⇒ redirected knock-up only on contact", (recast) => {
    withHero("ornn", [[10, 0]], (rig) => {
      const { world, hero, foes, events } = rig;
      expect(rankUpAbility(world, hero, "R")).toBe(true);
      const c = { ...world.transform.get(hero)!.pos };
      const ahead = { x: c.x + 5, z: c.z };
      rig.step(cast("R", ahead));
      for (let tick = 0; tick < 3 * TICK_HZ && !events.some((e) => e.type === "projectileSpawn" && e.data.owner === hero); tick++) rig.step();
      settle(rig, TICK_HZ / 5);
      if (recast) rig.step(cast("R", ahead));
      settle(rig, TICK_HZ);
      const knockup = events.some((e) => e.type === "leapStart" && e.data.id === foes[0]);
      expect(knockup, "改向後的羊擊飛身前的敵人（首段那一趟不擊飛）").toBe(recast);
      // 沒按後段：羊先碰到鄂爾 ⇒ 窗口在 3 秒到期**之前**就清掉，再按 R 只會撞冷卻
      expect(world.abilities.get(hero)!.slots.R.recast).toBeUndefined();
      if (!recast) {
        rig.step(cast("R", ahead));
        expect(rejected(rig, "R")).toEqual(["cooldown"]);
      }
    });
  });

  it("Fiddlesticks R preserves its long startup and starts crow pulses after landing", () => {
    withHero("fiddlesticks", [[4, 0]], (rig) => {
      const { world, hero, foes, draft, step } = rig;
      expect(rankUpAbility(world, hero, "R")).toBe(true);
      expect(draft.abilityDrafts.R.castTimeSec).toBeGreaterThanOrEqual(1);
      step({ commands: [{ kind: "castAbility", slot: "R", target: { type: "point", point: { ...world.transform.get(foes[0]!)!.pos } } }] });
      for (let tick = 0; tick < Math.floor(TICK_HZ / 2); tick++) step();
      expect(damageFrom(rig, "R")).toEqual([]);
      for (let tick = 0; tick < 2 * TICK_HZ; tick++) step();
      const hits = damageFrom(rig, "R");
      expect(hits.length).toBeGreaterThanOrEqual(2);
      expect(hits[1]!.tick).toBeGreaterThan(hits[0]!.tick);
    });
  });
});
