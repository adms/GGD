import {
  Abilities,
  Projectiles,
  SKELETON_ARENA,
  SimWorld,
  rankUpAbility,
  registerChampion,
  spawnChampion,
  type AbilityDef,
  type CastableSlot,
  type ChampionDef,
  type IntentFrame,
  type ProjectileDef,
  type SimEvent,
} from "../../sim";
import { abilityInstanceFor } from "../../sim/abilities/innateActive";
import { learnEx } from "../../sim/abilities/abilitySystem";
import { isPassiveOnly } from "../../sim/abilities/abilityPassives";
import { asSeatId, asTeamId, type EntityId, type StatusId } from "../../ids";
import { activeRegistryContext, captureRegistryContext, extendRegistryContext, withRegistryContext } from "../../sim/content/registryContext";
import type { HeroSimulationBaseline } from "./simulationBaseline";
import { zHeroScenarioSetup, type HeroScenarioSetup } from "./scenarioSetup";
import { Statuses } from "../../sim/content/registry";
import { runEffects } from "../../sim/effects/effectRunner";
import { adjustMarkCount } from "../../sim/marks";
import { configureScenarioCombat, prepareScenarioOpponent, scenarioResourceCost, scenarioResourceCount, type OpponentPreparation, type ScenarioResourceCost } from "./scenarioOpponent";

export interface HeroScenarioState {
  readonly casterHp: number;
  readonly casterMana: number;
  readonly casterPos: { x: number; z: number };
  readonly targetHp: number;
  readonly targetMana: number;
  readonly targetPos: { x: number; z: number };
  readonly targetStatuses: number;
  readonly targetShields: number;
}

export interface HeroAbilityScenarioResult {
  readonly seed: number;
  readonly slot: CastableSlot;
  readonly rank: number;
  readonly ticks: number;
  readonly status: "accepted" | "rejected" | "passive";
  readonly rejectionReason?: string;
  readonly before: HeroScenarioState;
  readonly after: HeroScenarioState;
  readonly resourceCost?: ScenarioResourceCost;
  readonly events: readonly HeroScenarioEvent[];
  readonly eventCounts: Readonly<Record<string, number>>;
  readonly digestTrail: readonly number[];
  readonly assertions: readonly {
    readonly id: string;
    readonly status: "pass" | "warning" | "fail";
    readonly summaryZh: string;
  }[];
}

/** Resolved actor transforms accompany events; renderers never infer movement. */
export type HeroScenarioEvent = SimEvent & {
  readonly actorPose: { readonly caster: { x: number; z: number }; readonly target: { x: number; z: number } };
};

export interface HeroKitScenarioResult {
  readonly seed: number;
  readonly ticksPerStep: number;
  readonly order: readonly ["PASSIVE", "Q", "W", "E", "R", "EX"];
  readonly status: "accepted" | "rejected";
  readonly rejectedSlots: readonly string[];
  readonly rejectionReasonsBySlot: Readonly<Record<string, string>>;
  readonly eventCountsBySlot: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly resourceCostsBySlot?: Readonly<Record<string, ScenarioResourceCost>>;
  readonly digestTrail: readonly number[];
  readonly assertions: readonly { id: string; status: "pass" | "fail"; summaryZh: string }[];
}

function state(world: SimWorld, caster: EntityId, target: EntityId): HeroScenarioState {
  const ch = world.health.get(caster)!;
  const th = world.health.get(target)!;
  return {
    casterHp: ch.hp,
    casterMana: ch.mana,
    casterPos: { ...world.transform.get(caster)!.pos },
    targetHp: th.hp,
    targetMana: th.mana,
    targetPos: { ...world.transform.get(target)!.pos },
    targetStatuses: world.status.get(target)?.effects.length ?? 0,
    targetShields: th.shields.length,
  };
}

function target(ability: AbilityDef, foe: EntityId, ally: EntityId, point: { x: number; z: number }) {
  switch (ability.castType) {
    case "self": return { type: "self" as const };
    case "targeted": return { type: "entity" as const, entityId: ability.targetsEnemies === false ? ally : foe };
    case "ground": return { type: "point" as const, point };
    case "skillshot": return { type: "dir" as const, dir: { x: 1, z: 0 } };
    case "dash": return { type: "point" as const, point };
  }
}

/**
 * One deterministic scenario seam shared by Editor preview and the main
 * importer. A package receipt is evidence only; import acceptance reruns this
 * function from the authoring graph and compares the compact result digest.
 */
export function runHeroAbilityScenario(
  champion: ChampionDef,
  ability: AbilityDef,
  opts: { setup?: HeroScenarioSetup; baseline?: HeroSimulationBaseline; level?: number; rank?: number; ticks?: number; seed?: number; relatedChampions?: readonly ChampionDef[]; relatedAbilities?: readonly AbilityDef[]; relatedProjectiles?: readonly ProjectileDef[] } = {},
): HeroAbilityScenarioResult {
  const setup = opts.setup && zHeroScenarioSetup.parse(opts.setup);
  if (setup?.priorCast?.slot === ability.slot) throw new Error("前置施法請選擇另一個技能槽。");
  const level = setup?.level ?? opts.level ?? 18;
  const rank = Math.max(1, Math.min(setup?.rank ?? opts.rank ?? ability.maxRank, ability.maxRank));
  const ticks = Math.max(1, Math.min(opts.ticks ?? 360, 1_800));
  const seed = Math.max(0, Math.min(Math.floor(opts.seed ?? 0xc0ffee), 0xffffffff));
  const def = ability.slot === "Q" || ability.slot === "W" || ability.slot === "E" || ability.slot === "R"
    ? { ...champion, abilities: { ...champion.abilities, [ability.slot]: ability } }
    : champion;
  const context = extendRegistryContext(opts.baseline?.context ?? activeRegistryContext() ?? captureRegistryContext("hero-scenario-base"), "hero-scenario", () => {
    for (const related of opts.relatedAbilities ?? []) Abilities.register(related.id, related);
    for (const projectile of opts.relatedProjectiles ?? []) Projectiles.register(projectile.id, projectile);
    Abilities.register(ability.id, ability);
    for (const related of opts.relatedChampions ?? []) if (related.id !== def.id) registerChampion(related);
    registerChampion(def, { overrideAbilities: true });
  });
  return withRegistryContext(context, () => {
  const arena = opts.baseline?.arena ?? SKELETON_ARENA;
  const world = new SimWorld(arena, seed);
  if (setup?.obstacle) world.setArena({ ...arena, zones: arena.zones.map((zone, index) => index === 0
    ? { ...zone, obstacles: [...zone.obstacles, { kind: "box" as const, center: { x: zone.center.x + setup.obstacle!.x, z: zone.center.z + setup.obstacle!.z }, halfW: 0.15, halfD: 3 }] }
    : zone) });
  if (opts.baseline) Object.assign(world, structuredClone(opts.baseline.rules));
  configureScenarioCombat(world);
  world.ultGateOverride = true;
  const center = arena.zones[0]!.center;
  const caster = spawnChampion(world, { championId: def.id, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: center.x - 3, z: center.z }, zone: 0, level });
  const foe = spawnChampion(world, { championId: def.id, seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: center.x + 3, z: center.z }, zone: 0, level });
  const ally = spawnChampion(world, { championId: def.id, seatId: asSeatId(2), teamId: asTeamId(0), pos: { x: center.x, z: center.z + 3 }, zone: 0, level });
  world.step(new Map());

  const slot = ability.slot as CastableSlot;
  const component = world.abilities.get(caster)!;
  if (slot === "EX") learnEx(world, caster);
  if (slot === "Q" || slot === "W" || slot === "E" || slot === "R") {
    component.unspentPoints = 20;
    while (component.slots[slot].rank < rank && rankUpAbility(world, caster, slot)) { /* shared rank-up seam */ }
  }
  const casterHealth = world.health.get(caster)!;
  casterHealth.hp = casterHealth.maxHp * 0.5;
  casterHealth.mana = casterHealth.maxMana;
  for (const id of [foe, ally]) {
    const hp = world.health.get(id)!;
    hp.hp = hp.maxHp * 0.5;
    hp.mana = hp.maxMana * 0.5;
  }
  const targetEntity = ability.castType === "targeted" && ability.targetsEnemies === false ? ally : foe;
  if (setup) for (const [entity, actor] of [[caster, setup.caster], [targetEntity, setup.target]] as const) {
    Object.assign(world.transform.get(entity)!.pos, { x: center.x + actor.x, z: center.z + actor.z });
    const health = world.health.get(entity)!;
    health.hp = health.maxHp * actor.hp / 100;
    health.mana = health.maxMana * actor.mana / 100;
    for (const statusId of actor.statuses) {
      if (!Statuses.tryGet(statusId)) throw new Error(`試玩狀態不在目前基線：${statusId}`);
      runEffects([{ kind: "applyStatus", statusId: statusId as StatusId, duration: ticks * world.dt }], { world, rng: world.rng, caster: entity, targets: [entity], rank: 1, origin: "hero-scenario-setup" });
    }
  }
  // A single-slot scene may seed an already installed resource counter. The
  // complete kit below never does: earning the resource is tested in sequence.
  // Never manufacture a missing counter or override its declared capacity.
  let preparedResource = 0;
  const cost = ability.statusCost;
  if (cost && cost.subject !== "target" && cost.appliedBy === undefined && setup?.resourceSetup !== "empty") {
    const mark = world.marks.get(caster)?.get(cost.statusId);
    const required = cost.count === "all" ? 1 : cost.count;
    if (mark && mark.max >= required && mark.count < required) {
      preparedResource = adjustMarkCount(world, caster, cost.statusId, required - mark.count);
    }
  }
  const events: HeroScenarioEvent[] = [];
  const digestTrail: number[] = [];
  const isPassiveSource = ability.innateKind === "passive" || isPassiveOnly(ability);
  const recordEvents = () => {
    const actorPose = { caster: { ...world.transform.get(caster)!.pos }, target: { ...world.transform.get(targetEntity)!.pos } };
    events.push(...world.events.map((event) => ({ ...event, data: structuredClone(event.data), actorPose })));
  };
  if (setup) recordEvents();
  const recordPreparation = () => { recordEvents(); digestTrail.push(world.digest()); };
  let preparationTicks = prepareScenarioOpponent(world, caster, ability, setup?.opponentPreparation, recordPreparation);
  const opponentPrepared = preparationTicks > 0;
  let priorCastSummary: string | undefined;
  if (setup?.priorCast) {
    const prior = setup.priorCast;
    const priorInstance = abilityInstanceFor(component, prior.slot);
    if (!priorInstance) throw new Error(`前置技能不存在：${prior.slot}`);
    const priorAbility = Abilities.get(priorInstance.abilityId);
    component.unspentPoints = 20;
    const priorRank = Math.min(rank, priorAbility.maxRank);
    if (prior.slot === "EX") learnEx(world, caster);
    else while (priorInstance.rank < priorRank && rankUpAbility(world, caster, prior.slot)) { /* real learning path */ }
    // Establish conditions by executing the author's actual ability. Do not
    // fabricate target statuses, refill mana, clear cooldowns or erase damage.
    const priorIntent: IntentFrame = { commands: [{ kind: "castAbility", slot: prior.slot,
      target: target(priorAbility, foe, ally, { ...world.transform.get(foe)!.pos }) }] };
    const priorTicks = Math.ceil(prior.waitSec / world.dt);
    preparationTicks += priorTicks;
    for (let index = 0; index < priorTicks; index++) {
      world.step(index === 0 ? new Map([[asSeatId(0), priorIntent]]) : new Map());
      recordPreparation();
    }
    const accepted = events.some(event => event.type === "abilityCast" && event.data.abilityId === priorAbility.id && event.data.caster === caster);
    const rejection = events.find(event => event.type === "castRejected" && event.data.entity === caster && event.data.slot === prior.slot && event.data.reason !== "approaching");
    priorCastSummary = `前置 ${prior.slot}：${accepted ? "已施放" : `未施放（${String(rejection?.data.reason ?? "no-cast-observed")}）`}，經過 ${prior.waitSec} 秒後嘗試本招；保留實際生命、魔力、位置與狀態。`;
  }
  const before = state(world, caster, targetEntity);
  const resourceBefore = scenarioResourceCount(world, caster, targetEntity, ability);
  const selectedEventStart = events.length;
  const castTarget = target(ability, foe, ally, { ...world.transform.get(foe)!.pos });
  const first: IntentFrame = isPassiveSource
    ? { commands: [], order: { kind: "attackTarget", entity: foe } }
    : { commands: [{ kind: "castAbility", slot, target: castTarget }] };
  const navigation = new Map((setup?.movementOrders ?? []).map(order => [Math.max(1, Math.round(order.atSec / world.dt)), order]));
  world.step(new Map([[asSeatId(0), first]]));
  if (setup?.obstacle) world.emit("previewObstacle", { x: center.x + setup.obstacle.x, z: center.z + setup.obstacle.z, halfW: 0.15, halfD: 3 });
  recordEvents();
  digestTrail.push(world.digest());
  for (let index = 1; index < ticks; index += 1) {
    if (isPassiveSource) world.nav.get(caster)!.attackTarget = foe;
    const navigationOrder = navigation.get(index);
    // Explicit preview inputs use the same command path as a player. Rejected
    // rapid/late inputs remain in the report; no mana or cooldown is reset.
    const presses = ability.recast && !isPassiveSource ? (setup?.recastPresses ?? []).filter(sec => Math.max(1, Math.round(sec / world.dt)) === index) : [];
    const frame: IntentFrame = { commands: presses.map(() => ({ kind: "castAbility", slot, target: castTarget })),
      ...(navigationOrder ? { order: navigationOrder.kind === "hold" ? { kind: "hold" as const } :
        { kind: "move" as const, point: { x: center.x + navigationOrder.x, z: center.z + navigationOrder.z } } } : {}) };
    world.step(navigationOrder || presses.length ? new Map([[asSeatId(0), frame]]) : new Map());
    recordEvents();
    digestTrail.push(world.digest());
  }
  const selectedEvents = events.slice(selectedEventStart);
  const acceptedCast = selectedEvents.some((event) => event.type === "abilityCast" && event.data.abilityId === ability.id && event.data.caster === caster);
  const ownRejections = selectedEvents.filter((event) => event.type === "castRejected" && event.data.entity === caster && event.data.slot === slot);
  // `approaching` is the game's queued movement command, not a failed cast.
  // It is successful only if this caster really reaches and casts this ability.
  const rejection = ownRejections.find((event) => event.data.reason !== "approaching") ?? (!acceptedCast ? ownRejections[0] : undefined);
  const rejectionReason = rejection ? String(rejection.data.reason ?? "unknown") : !acceptedCast && !isPassiveSource ? "no-cast-observed" : undefined;
  const passive = rejectionReason === "passive" || isPassiveSource;
  const eventCounts: Record<string, number> = {};
  for (const event of events) eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
  const after = state(world, caster, targetEntity);
  const assertions: Array<{ id: string; status: "pass" | "warning" | "fail"; summaryZh: string }> = [{
    id: "intent-accepted",
    status: passive || (!rejection && acceptedCast) ? "pass" : "fail",
    summaryZh: passive ? "被動來源已掛載，未偽裝成主動施放。" : rejectionReason ? `未完成施放：${rejectionReason}` : "IntentFrame 已由正式 world.step 接受。",
  }];
  if (preparedResource > 0) assertions.push({ id: "single-slot-resource-setup", status: "warning",
    summaryZh: `單槽試玩預先補入 ${preparedResource} 層施放資源；只驗證支付與技能效果，不代表已驗證集氣。整套驗收不補資源。` });
  if (priorCastSummary) assertions.push({ id: "single-slot-prior-cast", status: "warning", summaryZh: priorCastSummary });
  if (opponentPrepared) assertions.push({ id: "opponent-preparation", status: "warning",
    summaryZh: "前置情境：敵方以實際普攻指令攻擊施法者 3 秒，再停止指令；保留傷害、位置、狀態與真正取得的資源，未建立或補入目標資源。" });
  const manaAtRank = ability.manaCost[Math.min(rank, ability.manaCost.length) - 1] ?? 0;
  if (!passive && !rejection && manaAtRank > 0) assertions.push({
    id: "mana-spent",
    status: after.casterMana < before.casterMana ? "pass" : "warning",
    summaryZh: after.casterMana < before.casterMana ? "施放後魔力已扣除。" : "技能宣告耗魔，但驗收窗結束時沒有觀察到魔力下降。",
  });
  const changed = after.targetHp !== before.targetHp
    || after.targetStatuses !== before.targetStatuses
    || after.targetShields !== before.targetShields
    || after.targetPos.x !== before.targetPos.x
    || after.targetPos.z !== before.targetPos.z
    || after.casterHp !== before.casterHp
    || after.casterPos.x !== before.casterPos.x
    || after.casterPos.z !== before.casterPos.z;
  if (!passive && !rejection) assertions.push({
    id: "observable-result",
    status: changed || events.length > 1 ? "pass" : "warning",
    summaryZh: changed || events.length > 1 ? "已觀察到狀態數值、位置或事件變化。" : "施放被接受，但目前場景沒有觀察到可驗收結果。",
  });
  return {
    seed,
    slot,
    rank: slot === "EX" || slot === "PASSIVE" ? 1 : component.slots[slot].rank,
    ticks: ticks + preparationTicks,
    status: passive ? "passive" : rejectionReason ? "rejected" : "accepted",
    ...(rejectionReason && !passive ? { rejectionReason } : {}),
    before,
    after,
    ...(ability.statusCost ? { resourceCost: scenarioResourceCost(world, caster, targetEntity, ability, resourceBefore) } : {}),
    events,
    eventCounts,
    digestTrail,
    assertions,
  };
  });
}

/** Stable, compact evidence compared across Editor and importer. */
export function heroScenarioProjection(result: HeroAbilityScenarioResult): unknown {
  return {
    seed: result.seed,
    slot: result.slot,
    rank: result.rank,
    ticks: result.ticks,
    status: result.status,
    rejectionReason: result.rejectionReason ?? null,
    before: result.before,
    after: result.after,
    ...(result.resourceCost ? { resourceCost: result.resourceCost } : {}),
    eventCounts: result.eventCounts,
    digestTail: result.digestTrail.at(-1) ?? null,
    assertions: result.assertions,
  };
}

/**
 * Integrated six-slot proof. Unlike six isolated smoke tests, every action runs
 * in one SimWorld so passive hooks, buffs, movement and later casts share state.
 * HP/MP and positions are reset only to keep the durable target alive and in
 * range; statuses, hook state, summons and ongoing casts remain live. The slot
 * about to be exercised has its own cooldown cleared so a legitimate proxy
 * cast cannot prevent the matrix from observing that slot at least once.
 */
export function runHeroKitScenario(
  champion: ChampionDef,
  abilities: Readonly<Record<"PASSIVE" | "Q" | "W" | "E" | "R" | "EX", AbilityDef>>,
  opts: { baseline?: HeroSimulationBaseline; seed?: number; ticksPerStep?: number; opponentPreparation?: OpponentPreparation; relatedProjectiles?: readonly ProjectileDef[]; relatedAbilities?: readonly AbilityDef[]; relatedChampions?: readonly ChampionDef[] } = {},
): HeroKitScenarioResult {
  const seed = Math.max(0, Math.min(Math.floor(opts.seed ?? 0xc0ffee), 0xffffffff));
  const ticksPerStep = Math.max(30, Math.min(Math.floor(opts.ticksPerStep ?? 180), 240));
  const order = ["PASSIVE", "Q", "W", "E", "R", "EX"] as const;
  const context = extendRegistryContext(opts.baseline?.context ?? activeRegistryContext() ?? captureRegistryContext("hero-kit-base"), "hero-kit", () => {
    for (const ability of opts.relatedAbilities ?? []) Abilities.register(ability.id, ability);
    for (const related of opts.relatedChampions ?? []) if (related.id !== champion.id) registerChampion(related);
    for (const ability of Object.values(abilities)) Abilities.register(ability.id, ability);
    for (const projectile of opts.relatedProjectiles ?? []) Projectiles.register(projectile.id, projectile);
    registerChampion(champion, { overrideAbilities: true });
  });
  return withRegistryContext(context, () => {
  const arena = opts.baseline?.arena ?? SKELETON_ARENA;
  const world = new SimWorld(arena, seed);
  if (opts.baseline) Object.assign(world, structuredClone(opts.baseline.rules));
  configureScenarioCombat(world);
  world.ultGateOverride = true;
  const center = arena.zones[0]!.center;
  const casterStart = { x: center.x - 3, z: center.z };
  const foeStart = { x: center.x + 3, z: center.z };
  const allyStart = { x: center.x, z: center.z + 3 };
  const caster = spawnChampion(world, { championId: champion.id, seatId: asSeatId(0), teamId: asTeamId(0), pos: casterStart, zone: 0, level: 18 });
  const foe = spawnChampion(world, { championId: champion.id, seatId: asSeatId(1), teamId: asTeamId(1), pos: foeStart, zone: 0, level: 18 });
  const ally = spawnChampion(world, { championId: champion.id, seatId: asSeatId(2), teamId: asTeamId(0), pos: allyStart, zone: 0, level: 18 });
  world.step(new Map());
  const component = world.abilities.get(caster)!;
  component.unspentPoints = 20;
  for (const slot of ["Q", "W", "E", "R"] as const) while (component.slots[slot].rank < abilities[slot].maxRank && rankUpAbility(world, caster, slot)) { /* real rank gate */ }
  learnEx(world, caster);

  const eventCountsBySlot: Record<string, Record<string, number>> = {};
  const resourceCostsBySlot: Record<string, ScenarioResourceCost> = {};
  const rejectedSlots: string[] = [];
  const rejectionReasonsBySlot: Record<string, string> = {};
  const digestTrail: number[] = [];
  for (const slot of order) {
    if (slot === "EX" && component.exSlot) component.exSlot.cooldownRemainingTicks = 0;
    else if (slot === "Q" || slot === "W" || slot === "E" || slot === "R") component.slots[slot].cooldownRemainingTicks = 0;
    let preflightCast = "none";
    Object.assign(world.transform.get(caster)!.pos, casterStart);
    Object.assign(world.transform.get(foe)!.pos, foeStart);
    Object.assign(world.transform.get(ally)!.pos, allyStart);
    for (const entity of [caster, foe, ally]) {
      const hp = world.health.get(entity)!;
      hp.alive = true;
      hp.maxHp = Math.max(hp.maxHp, 1_000_000);
      hp.hp = hp.maxHp;
      hp.mana = hp.maxMana;
    }
    const counts: Record<string, number> = {};
    let acceptedCast = false;
    let terminalRejection = false;
    let preparing = true;
    const record = () => {
      for (const event of world.events) {
        counts[event.type] = (counts[event.type] ?? 0) + 1;
        if (!preparing && event.type === "abilityCast" && event.data.caster === caster && event.data.abilityId === abilities[slot].id) acceptedCast = true;
        if (!preparing && event.type === "castRejected" && event.data.entity === caster && event.data.slot === slot) {
          if (event.data.reason !== "approaching") terminalRejection = true;
          rejectionReasonsBySlot[slot] = `${String(event.data.reason ?? "unknown")} (preflightCast=${preflightCast})`;
        }
      }
    };
    prepareScenarioOpponent(world, caster, abilities[slot], opts.opponentPreparation, () => { digestTrail.push(world.digest()); record(); });
    preparing = false;
    preflightCast = component.cast ? `${component.cast.slot}:${component.cast.ticksLeft}` : "none";
    const resourceTarget = abilities[slot].castType === "targeted" && abilities[slot].targetsEnemies === false ? ally : foe;
    const resourceBefore = scenarioResourceCount(world, caster, resourceTarget, abilities[slot]);
    const passive = abilities[slot].innateKind === "passive" || isPassiveOnly(abilities[slot]);
    const frame: IntentFrame = passive
      ? { commands: [], order: { kind: "attackTarget", entity: foe } }
      : { commands: [{ kind: "castAbility", slot, target: target(abilities[slot], foe, ally, { ...foeStart }) }] };
    world.step(new Map([[asSeatId(0), frame]]));
    digestTrail.push(world.digest());
    record();
    for (let tick = 1; tick < ticksPerStep; tick += 1) {
      if (passive) world.nav.get(caster)!.attackTarget = foe;
      world.step(new Map());
      digestTrail.push(world.digest());
      record();
    }
    eventCountsBySlot[slot] = counts;
    const resource = scenarioResourceCost(world, caster, resourceTarget, abilities[slot], resourceBefore);
    if (resource) resourceCostsBySlot[slot] = resource;
    if (!passive && (terminalRejection || !acceptedCast)) rejectedSlots.push(slot);
    else delete rejectionReasonsBySlot[slot];
  }
  const assertions = [{
    id: "six-slot-order",
    status: rejectedSlots.length === 0 ? "pass" as const : "fail" as const,
    summaryZh: rejectedSlots.length === 0 ? "同一世界依序完成被動、Q、W、E、R、EX。" : `未完成：${rejectedSlots.join("、")}`,
  }];
  return { seed, ticksPerStep, order, status: rejectedSlots.length === 0 ? "accepted" : "rejected", rejectedSlots, rejectionReasonsBySlot, eventCountsBySlot,
    ...(Object.keys(resourceCostsBySlot).length ? { resourceCostsBySlot } : {}), digestTrail, assertions };
  });
}

export function heroKitScenarioProjection(result: HeroKitScenarioResult): unknown {
  return {
    seed: result.seed,
    ticksPerStep: result.ticksPerStep,
    order: result.order,
    status: result.status,
    rejectedSlots: result.rejectedSlots,
    rejectionReasonsBySlot: result.rejectionReasonsBySlot,
    eventCountsBySlot: result.eventCountsBySlot,
    ...(result.resourceCostsBySlot ? { resourceCostsBySlot: result.resourceCostsBySlot } : {}),
    digestTail: result.digestTrail.at(-1) ?? null,
    assertions: result.assertions,
  };
}
