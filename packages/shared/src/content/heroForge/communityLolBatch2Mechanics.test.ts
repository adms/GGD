import { beforeAll, describe, expect, it } from "vitest";
import { shippedHeroCatalog } from "../../../testkit/heroPackageFixture";
import { TICK_HZ } from "../../constants";
import { asSeatId, asTeamId, type EntityId, type StatusId, type ChampionId } from "../../ids";
import { Abilities, SimWorld, rankUpAbility, registerChampion, spawnChampion, type IntentFrame, type SimEvent } from "../../sim";
import { extendRegistryContext, withRegistryContext } from "../../sim/content/registryContext";
import { runEffects } from "../../sim/effects/effectRunner";
import { mobRulesFromConfig, type MobWavesConfigLike } from "../../sim/mobs";
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
  for (const id of ["sett", "fiddlesticks", "ornn", "ahri", "thresh", "velkoz", "garen"]) {
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

type Draft = Extract<CompiledHeroDraftResult, { ok: true }>["draft"];
type Rig = {
  world: SimWorld;
  hero: EntityId;
  foes: EntityId[];
  draft: Draft;
  events: SimEvent[];
  step: (intent?: IntentFrame, foeIntent?: IntentFrame) => void;
};

/** `patch` 只改**這一次**註冊的草稿複本（⛔ 不動共用的編譯結果）。 */
function withHero(id: string, spots: [number, number][], run: (rig: Rig) => void, patch?: (draft: Draft) => void) {
  const draft = patch ? structuredClone(compiled.get(id)!.draft) : compiled.get(id)!.draft;
  patch?.(draft);
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
    const hold: IntentFrame = { commands: [], order: { kind: "hold" } };
    const step = (intent: IntentFrame = hold, foeIntent: IntentFrame = hold) => {
      world.step(new Map([
        [asSeatId(0), intent],
        ...foes.map((_, index) => [asSeatId(index + 1), foeIntent] as [ReturnType<typeof asSeatId>, IntentFrame]),
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

type Slot = "Q" | "W" | "E" | "R";
const damageFrom = (rig: Rig, slot: Slot) => rig.events.filter((event) => event.type === "damage" && event.data.source === rig.hero && String(event.data.origin).includes(rig.draft.abilityDrafts[slot].id));

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
  // ⭐ 兩臂的敵人 0 都站在「E 停下處」的震波半徑內、衝刺線外 ⇒ 空衝那一臂若照樣震，一定打得到他。
  // ⭐ 修正輪：敵人 1 站在衝刺線上、柱子**後面** ⇒ 沿途命中只算身體真的掃過的那一段：撞柱那一臂⛔ 不挨打、空衝那一臂挨打（兩個方向一起驗）。
  it.each([[true, 5], [false, 7]] as const)("Ornn E after Q pillar=%s knocks up and shatters only when the dash is blocked", (withPillar, foeX) => {
    withHero("ornn", [[foeX, 2], [8, 0]], (rig) => {
      const { world, hero, foes, step, events } = rig;
      for (const slot of ["Q", "E"] as const) expect(rankUpAbility(world, hero, slot)).toBe(true);
      const start = { ...world.transform.get(hero)!.pos };
      const ahead = { type: "point" as const, point: { x: start.x + 3, z: start.z } };
      if (withPillar) {
        step({ commands: [{ kind: "castAbility", slot: "Q", target: ahead }] });
        // Q 落空會吃完整後搖（abilityRecovery）⇒ 等玩家真的按得出 E 的時候再按；柱子活 4 秒以上
        for (let tick = 0; tick < 2 * TICK_HZ; tick++) step();
        // ⭐ 讀的是**裂地長度**（⛔ 不是柱子自己那一格前推）⇒ 兩格一旦分岔這裡就紅
        const qEffects = COMMUNITY_LOL_BATCH2_EXAMPLES.find((r) => r.id === "ornn")!.moves.Q.params.effects as { kind: string; length?: number }[];
        const lineEnd = qEffects.find((e) => e.kind === "damageLine")!.length!;
        expect([...world.obstacle.values()].map((o) => o.center.x - start.x), "Q 柱在裂地終點（⛔ 不在腳下）").toEqual([lineEnd]);
      }
      step({ commands: [{ kind: "castAbility", slot: "E", target: ahead }] });
      for (let tick = 0; tick < TICK_HZ; tick++) step();
      expect(events.some((e) => e.type === "abilityCast" && e.data.caster === hero && e.data.slot === "E")).toBe(true);
      const shock = damageFrom(rig, "E").filter((e) => e.data.target === foes[0]);
      const knockup = events.filter((e) => e.type === "leapStart" && e.data.id === foes[0]);
      const behindPillar = damageFrom(rig, "E").some((e) => e.data.target === foes[1]);
      expect([shock.length > 0, knockup.length > 0, events.some((e) => e.type === "obstacleShatter"), behindPillar], "震波／擊飛／撞碎只在撞柱時；沿途命中只到擋停點").toEqual([withPillar, withPillar, withPillar, !withPillar]);
      expect(world.obstacle.size, "柱子被撞碎（沒柱那一臂本來就是 0）").toBe(0);
    });
  });

  // GH#1187【再次施放】—— 三種用法都走正常指令（world.step 的 castAbility），⛔ 不手造階段。
  const cast = (slot: Slot, point: { x: number; z: number }): IntentFrame => ({ commands: [{ kind: "castAbility", slot, target: { type: "point", point } }] });
  const rejected = (rig: Rig, slot: Slot) => rig.events.filter((e) => e.type === "castRejected" && e.data.entity === rig.hero && e.data.slot === slot).map((e) => e.data.reason);
  const settle = (rig: Rig, ticks = TICK_HZ) => { for (let tick = 0; tick < ticks; tick++) rig.step(); };

  it("recast: Ahri R dashes to three separately aimed points and only then starts its cooldown", () => {
    withHero("ahri", [[0, -8]], (rig) => {
      const { world, hero } = rig;
      expect(rankUpAbility(world, hero, "R")).toBe(true);
      const c = { ...world.transform.get(hero)!.pos };
      const aims = [{ x: c.x + 3, z: c.z }, { x: c.x + 3, z: c.z + 3 }, { x: c.x, z: c.z + 3 }];
      const cooling: boolean[] = [];
      const landed = aims.map((aim) => {
        rig.step(cast("R", aim));
        settle(rig);
        cooling.push(world.abilities.get(hero)!.slots.R.cooldownRemainingTicks > 0);
        return world.transform.get(hero)!.pos;
      }).map((pos, i) => Math.hypot(pos.x - aims[i]!.x, pos.z - aims[i]!.z) < 1);
      expect(landed, "每一段落在自己那一按的落點").toEqual([true, true, true]);
      // ⭐ 修正輪：第一、二段之後冷卻**還沒**開始（cooldownAt 沒被讀 ⇒ 首放就在轉 ⇒ 這裡紅），第三段衝完才開始
      expect(cooling, "三段衝完才進冷卻（⛔ 不是首放就開始轉）").toEqual([false, false, true]);
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

  // GH#1191【持續引導】—— 正常指令開始 W／R；打斷的那一 tick 之後⛔ 一發都不再落下、⛔ 不收割；撐滿才收割；受傷不打斷。
  // ⭐ 打斷那幾臂的身體仍站在圈內（移動只橫移 1 格）⇒ 若波次沒作廢一定還打得到 —— 負向不是空轉。
  // ⭐ 修正輪：恐懼（方向盤被拿走）也要打斷 —— 引導把腳定住，少了這條恐懼打在引導中的人身上等於無效。
  // ⭐ GH#1191 驗收補洞：出貨政策 `DEFAULT_CHANNEL_CANCEL_ON` 有六條（move/stun/silence/knockdown/death/control），
  //   ⛔ 而守衛只驗過其中兩條 —— **沉默**與**死亡**這兩行（`channel.ts:82`／`:85`）可以整段刪掉而一條測試都不會紅。
  it.each(["complete", "whiff", "move", "stun", "fear", "silence", "death"] as const)("channel: Fiddlesticks W %s", (arm) => {
    withHero("fiddlesticks", [arm === "whiff" ? [6, 0] : [2, 0]], (rig) => {
      const { world, hero, foes, events } = rig;
      expect(rankUpAbility(world, hero, "W")).toBe(true);
      const arena = configs.find((doc) => (doc as { id?: string }).id === "arena-rules") as { mobWaves: MobWavesConfigLike };
      world.mobRules = mobRulesFromConfig(arena.mobWaves, world.dt, 1, undefined, undefined, new Set([asSeatId(0)]));
      rig.step(); // 升級觸發的屬性重算先跑完，再把血條撐大、打一半（滿血時回血是 0，「不空吸」會變空轉）
      Object.assign(world.health.get(hero)!, { maxHp: 1_000_000, hp: 500_000 });
      const c = { ...world.transform.get(hero)!.pos };
      const waves = (COMMUNITY_LOL_BATCH2_EXAMPLES.find((r) => r.id === "fiddlesticks")!.moves.W.params.effects as { count: number }[])[0]!.count;
      rig.step({ commands: [{ kind: "castAbility", slot: "W", target: { type: "self" } }], order: { kind: "hold" } });
      for (let t = 0; t < 2 * TICK_HZ && damageFrom(rig, "W").length === 0; t++) rig.step();
      if (arm !== "whiff") expect(world.abilities.get(hero)!.channel, "第一波落下時仍在引導").toBeTruthy();
      rig.step();
      const cut = world.tick;
      if (arm === "complete") runEffects([{ kind: "damage", damageType: "true", amount: { flat: 100 } }], { world, caster: foes[0]!, rank: 1, targets: [hero], origin: "fixture:poke", rng: world.rng });
      const CC = { stun: { stun: true }, fear: { feared: true }, silence: { silenced: true } } as const;
      if (arm === "stun" || arm === "fear" || arm === "silence") runEffects([{ kind: "applyStatus", statusId: `fixture.${arm}` as StatusId, duration: 0.3, ...CC[arm] }], { world, caster: foes[0]!, rank: 1, targets: [hero], origin: `fixture:${arm}`, rng: world.rng });
      // 死亡臂：⭐ 真的把人打死（⛔ 不是手寫 alive=false）—— 走出貨那條路，引導要在 channelSystem 看到 `!hp.alive` 的那一 tick 收掉
      if (arm === "death") runEffects([{ kind: "damage", damageType: "true", amount: { flat: 10_000_000 } }], { world, caster: foes[0]!, rank: 1, targets: [hero], origin: "fixture:death", rng: world.rng });
      // 移動臂：像推著搖桿一樣連送一秒的 move（harness 預設每拍送 hold，只送一拍會被下一拍的 hold 取消）
      for (let t = 0; t < TICK_HZ; t++) rig.step(arm === "move" ? { commands: [], order: { kind: "move", point: { x: c.x, z: c.z + 1 } } } : undefined);
      settle(rig, 2 * TICK_HZ);
      const hits = damageFrom(rig, "W");
      const heals = events.filter((e) => e.type === "heal" && e.data.target === hero && String(e.data.origin).includes(rig.draft.abilityDrafts.W.id));
      const hp = world.health.get(hero)!;
      expect(world.abilities.get(hero)?.channel, "結束後不留引導").toBeFalsy();
      if (arm === "whiff") expect([hits.length, heals.length, hp.hp < hp.maxHp], "打空不回血（而且有得回）").toEqual([0, 0, true]);
      else if (arm === "complete") expect([hits.length, heals.length, hp.hp < hp.maxHp], "每波一命中一回血＋撐滿收割一次（不回血）；受傷不打斷").toEqual([waves + 1, waves, true]);
      else {
        expect(hits.filter((e) => e.tick > cut), "打斷後排好的波次與收割⛔ 不落下").toEqual([]);
        if (arm === "move") expect(world.transform.get(hero)!.pos.z - c.z, "腳鬆開、走得出去").toBeGreaterThan(0.5);
        if (arm === "death") expect(world.health.get(hero)?.alive, "死亡臂：人真的死了（⛔ 不是夾具空轉）").toBe(false);
      }
    });
  });

  // ⭐ 修正輪：出貨節拍的每一發都落在引導時長之內 ⇒「撐滿時作廢殘留波次」那條路在出貨配方上是空轉的。
  //   ⇒ 夾具把引導縮到第 2、3 發之間（從配方的節拍推導），撐滿時一定還有排好的波次；它們若沒被作廢，引導結束後會照樣射出。
  it("channel: Velkoz R turns to the re-aimed direction mid-channel and voids the beams still scheduled when it completes", () => {
    const beam = (COMMUNITY_LOL_BATCH2_EXAMPLES.find((r) => r.id === "velkoz")!.moves.R.params.effects as { delaySec: number; intervalSec: number }[])[0]!;
    withHero("velkoz", [[5, 0], [0, 5]], (rig) => {
      const { world, hero, foes } = rig;
      expect(rankUpAbility(world, hero, "R")).toBe(true);
      const on = (id: EntityId) => damageFrom(rig, "R").filter((e) => e.data.target === id);
      rig.step({ commands: [{ kind: "castAbility", slot: "R", target: { type: "dir", dir: { x: 1, z: 0 } } }] });
      for (let t = 0; t < 2 * TICK_HZ && on(foes[0]!).length === 0; t++) rig.step();
      const turned = world.tick;
      rig.step({ commands: [{ kind: "castAbility", slot: "R", target: { type: "dir", dir: { x: 0, z: 1 } } }] });
      let ended = -1;
      for (let t = 0; t < 3 * TICK_HZ; t++) {
        rig.step();
        if (ended < 0 && !world.abilities.get(hero)!.channel) ended = world.tick;
      }
      expect(rejected(rig, "R"), "引導中同一格再按＝轉向，⛔ 不是被拒").toEqual([]);
      expect([on(foes[0]!).length > 0, on(foes[0]!).every((e) => e.tick <= turned), on(foes[1]!).length > 0]).toEqual([true, true, true]);
      expect([ended > 0, damageFrom(rig, "R").filter((e) => e.tick >= ended)], "撐滿後不留引導、排好的波次⛔ 不再射出").toEqual([true, []]);
    }, (draft) => {
      // 內嵌那一份在 overrideAbilities 下會蓋掉獨立那一份 ⇒ 兩份一起改
      for (const r of [draft.abilityDrafts.R, draft.champion.abilities.R]) r.channel = { ...r.channel!, durationSec: beam.delaySec + 1.5 * beam.intervalSec };
    });
  });

  // GH#1197【六槽綁定】—— 全部走正常指令（world.step 的 castAbility／move），⛔ 不手造階段；各臂的負向寫在斷言訊息裡。
  const hitsOn = (rig: Rig, slot: Slot, id: EntityId) => damageFrom(rig, slot).filter((e) => e.data.target === id).length;

  it("bind: Ahri Q orb hits once on the way out and once more on the way back", () => {
    withHero("ahri", [[4, 0]], (rig) => {
      expect(rankUpAbility(rig.world, rig.hero, "Q")).toBe(true);
      const c = { ...rig.world.transform.get(rig.hero)!.pos };
      rig.step(cast("Q", { x: c.x + 5, z: c.z }));
      settle(rig, 3 * TICK_HZ);
      expect(hitsOn(rig, "Q", rig.foes[0]!), "去程一下＋回程一下（⛔ 只有一下＝沒有回程）").toBe(2);
    });
  });

  it("bind: Ahri E charm makes the hit enemy walk toward Ahri on its own", () => {
    withHero("ahri", [[6, 0]], (rig) => {
      const { world, hero, foes } = rig;
      expect(rankUpAbility(world, hero, "E")).toBe(true);
      const c = { ...world.transform.get(hero)!.pos };
      rig.step(cast("E", { x: c.x + 6, z: c.z }));
      for (let t = 0; t < 2 * TICK_HZ && hitsOn(rig, "E", foes[0]!) === 0; t++) rig.step();
      const x0 = world.transform.get(foes[0]!)!.pos.x;
      settle(rig, TICK_HZ / 2);
      expect(x0 - world.transform.get(foes[0]!)!.pos.x, "被魅惑的人自己朝阿璃走（他的座位一直在下「站住」；⛔ 沒動＝沒有魅惑）").toBeGreaterThan(0.5);
    });
  });

  it("bind: Thresh R walls hit only when an enemy walks across one", () => {
    withHero("thresh", [[1.5, 0.7]], (rig) => {
      const { world, hero, foes } = rig;
      expect(rankUpAbility(world, hero, "R")).toBe(true);
      const c = { ...world.transform.get(hero)!.pos };
      rig.step({ commands: [{ kind: "castAbility", slot: "R", target: { type: "self" } }] });
      settle(rig, TICK_HZ / 2);
      const whileInside = hitsOn(rig, "R", foes[0]!);
      const walkOut: IntentFrame = { commands: [], order: { kind: "move", point: { x: c.x + 9, z: c.z + 0.7 } } };
      for (let t = 0; t < 2 * TICK_HZ; t++) rig.step(undefined, walkOut);
      expect([whileInside, hitsOn(rig, "R", foes[0]!)], "放下時站在圈內不挨打（⛔ 施放當下一圈傷害＝舊近似）；走出去穿過一段才挨一下").toEqual([0, 1]);
    });
  });

  it("bind: Velkoz Q recast splits the bolt that is still flying", () => {
    withHero("velkoz", [[0, -8]], (rig) => {
      const { world, hero } = rig;
      expect(rankUpAbility(world, hero, "Q")).toBe(true);
      const c = { ...world.transform.get(hero)!.pos };
      const mine = () => [...world.projectile.values()].filter((p) => p.ownerId === hero).map((p) => p.projectileId);
      rig.step(cast("Q", { x: c.x + 5, z: c.z }));
      for (let t = 0; t < TICK_HZ && mine().length === 0; t++) rig.step();
      settle(rig, 3);
      const flying = mine();
      rig.step(cast("Q", { x: c.x + 5, z: c.z }));
      const child = (catalog.documents.get("projectiles/imported.bolt.void.split") as { split: { projectileId: string } }).split.projectileId;
      expect([rejected(rig, "Q"), flying.length, mine()], "再按 Q：還在飛的主彈就地分成兩發子彈（⛔ 沒分裂＝還是一發主彈）").toEqual([[], 1, [child, child]]);
    });
  });

  it("bind: Velkoz W second rift still lands on the original line after Vel'Koz walks off it", () => {
    withHero("velkoz", [[5, 0]], (rig) => {
      const { world, hero, foes } = rig;
      expect(rankUpAbility(world, hero, "W")).toBe(true);
      const c = { ...world.transform.get(hero)!.pos };
      rig.step(cast("W", { x: c.x + 5, z: c.z }));
      for (let t = 0; t < TICK_HZ && hitsOn(rig, "W", foes[0]!) === 0; t++) rig.step();
      for (let t = 0; t < TICK_HZ; t++) rig.step({ commands: [], order: { kind: "move", point: { x: c.x, z: c.z + 6 } } });
      expect([world.transform.get(hero)!.pos.z - c.z > 2, hitsOn(rig, "W", foes[0]!)], "橫移離開原線之後第二段仍打原線上的人（⛔ 只有一下＝第二段跟著施法者走了）").toEqual([true, 2]);
    });
  });

  it("bind: Garen Q cleanses the slow on him and leaves his other debuff alone", () => {
    withHero("garen", [[3, 0]], (rig) => {
      const { world, hero, foes } = rig;
      expect(rankUpAbility(world, hero, "Q")).toBe(true);
      // 走出貨的 applyStatus（這兩個狀態沒有 status 文件 ⇒ 極性是空的，正是配方自帶減速的樣子）
      runEffects([
        { kind: "applyStatus", statusId: "fixture.slow" as StatusId, duration: 5, moveSpeedMult: 0.7 },
        { kind: "applyStatus", statusId: "fixture.disarm" as StatusId, duration: 5, disarmed: true },
      ], { world, caster: foes[0]!, rank: 1, targets: [hero], origin: "fixture:cc", rng: world.rng });
      rig.step({ commands: [{ kind: "castAbility", slot: "Q", target: { type: "self" } }] });
      settle(rig, TICK_HZ / 2);
      const left = world.status.get(hero)!.effects.filter((e) => String(e.statusId).startsWith("fixture.") && e.expiresAtTick > world.tick).map((e) => String(e.statusId));
      expect(left, "只清減速、繳械留著（⛔ 兩個都在＝沒淨化；兩個都走＝清過頭）").toEqual(["fixture.disarm"]);
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
