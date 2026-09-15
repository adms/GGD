/**
 * 【互動物】（GH#1189 瑟雷西 W 燈籠）承重守衛 —— 跑**出貨的**那一條路，⛔ 不手造燈籠：
 * `COMMUNITY_LOL_BATCH2_EXAMPLES` 的 thresh → 鑄技編譯器 → 真的 `castAbility` → 真的 `world.step`
 * → 隊友的 `interact` 指令走 `CommandSystem` → `acceptInteractable`。
 *
 * 突變（實跑，見 commit）：`checkInteractable` 拿掉同隊那一行 ⇒ ①「敵人點燈」紅。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { shippedHeroCatalog } from "../../testkit/heroPackageFixture";
import { TICK_HZ } from "../constants";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import { Abilities, SimWorld, rankUpAbility, registerChampion, spawnChampion, type IntentFrame, type SimEvent } from "./index";
import { extendRegistryContext, withRegistryContext } from "./content/registryContext";
import type { TemplateDoc } from "../content/schema/template";
import type { VfxSubtypeDoc } from "../content/schema/vfxSubtype";
import { createCommunityHeroRecipe } from "../content/heroForge/communityExamples";
import { COMMUNITY_LOL_BATCH2_EXAMPLES } from "../content/heroForge/communityLolBatch2";
import { compileGeneratedHeroDraft, generateHeroDraft, type CompiledHeroDraftResult } from "../content/heroForge/generator";
import { createHeroSimulationBaseline } from "../content/heroForge/simulationBaseline";

const catalog = shippedHeroCatalog();
const baseline = createHeroSimulationBaseline(catalog.documents);
const docs = (prefix: string) => [...catalog.documents].filter(([k]) => k.startsWith(prefix)).map(([, d]) => d);
let draft: Extract<CompiledHeroDraftResult, { ok: true }>["draft"];

beforeAll(() => {
  const templates = docs("ability-templates/") as TemplateDoc[];
  const recipe = COMMUNITY_LOL_BATCH2_EXAMPLES.find((r) => r.id === "thresh")!;
  const project = createCommunityHeroRecipe(recipe, "lol-interact-thresh", templates);
  const generated = generateHeroDraft(project.acceptedPlan!, { heroId: project.projectId, heroName: project.brief.name, presentation: project.presentation });
  const result = compileGeneratedHeroDraft(generated, templates, docs("config/"), docs("vfx-subtypes/") as VfxSubtypeDoc[]);
  if (!result.ok) throw new Error(JSON.stringify(result.failures));
  draft = result.draft;
});

type Rig = { world: SimWorld; thresh: EntityId; near: EntityId; far: EntityId; foe: EntityId; events: SimEvent[]; step: (cmds?: Map<number, IntentFrame["commands"]>) => void };

function withLantern(run: (rig: Rig) => void): void {
  const context = extendRegistryContext(baseline.context, "lol-interact-thresh", () => {
    for (const ability of Object.values(draft.abilityDrafts)) Abilities.register(ability.id, ability);
    registerChampion(draft.champion, { overrideAbilities: true });
  });
  withRegistryContext(context, () => {
    const world = new SimWorld(baseline.arena, 0x1189);
    Object.assign(world, structuredClone(baseline.rules));
    world.combatActive = true;
    const c = baseline.arena.zones[0]!.center;
    const at = (dx: number, dz: number) => ({ x: c.x + dx, z: c.z + dz });
    const spawn = (id: string, seat: number, team: number, pos: { x: number; z: number }) =>
      spawnChampion(world, { championId: id as ChampionId, seatId: asSeatId(seat), teamId: asTeamId(team), pos, zone: 0, level: 18 });
    const thresh = spawn(draft.champion.id, 0, 0, at(0, 0));
    const near = spawn("thorne", 1, 0, at(2, 0));
    const far = spawn("thorne", 2, 0, at(-9, 0));
    const foe = spawn("thorne", 3, 1, at(2, 1));
    const events: SimEvent[] = [];
    const step = (cmds = new Map<number, IntentFrame["commands"]>()) => {
      world.step(new Map([0, 1, 2, 3].map((s) => [asSeatId(s), { commands: cmds.get(s) ?? [], order: { kind: "hold" } }] as const)));
      events.push(...world.events);
    };
    step();
    for (const e of [thresh, near, far, foe]) Object.assign(world.health.get(e)!, { maxHp: 1_000_000, hp: 1_000_000 });
    run({ world, thresh, near, far, foe, events, step });
  });
}

const dist = (world: SimWorld, a: EntityId, b: EntityId) => {
  const pa = world.transform.get(a)!.pos, pb = world.transform.get(b)!.pos;
  return Math.hypot(pa.x - pb.x, pa.z - pb.z);
};

/** 真的施放 W 到 `near` 的腳下，回傳燈籠 id。 */
function throwLantern(rig: Rig): EntityId {
  const { world, thresh, near, events, step } = rig;
  expect(rankUpAbility(world, thresh, "W")).toBe(true);
  step(new Map([[0, [{ kind: "castAbility", slot: "W", target: { type: "point", point: { ...world.transform.get(near)!.pos } } }]]]));
  for (let t = 0; t < TICK_HZ && !events.some((e) => e.type === "interactableSpawn"); t++) step();
  const spawned = events.find((e) => e.type === "interactableSpawn");
  expect(spawned, "W 施放後場上沒有燈籠").toBeDefined();
  return Number(spawned!.data.id) as EntityId;
}

const rejection = (events: SimEvent[], entity: EntityId) =>
  events.filter((e) => e.type === "interactRejected" && e.data.entity === entity).map((e) => e.data.reason);

describe("GH#1189 瑟雷西 W 燈籠：隊友自選互動位移", () => {
  it("放燈不搬人、護盾照結算；敵人／施法者／太遠被拒；合法隊友點了才飛回，用完即收、重複被拒", () => {
    withLantern((rig) => {
      const { world, thresh, near, far, foe, events, step } = rig;
      const lantern = throwLantern(rig);
      const shielded = world.health.get(near)!.shields.some((s) => String(s.stackKey).endsWith(".lantern") && s.amount > 0);
      expect(shielded, "W 的護盾要與點不點燈無關、施放當下就結算").toBe(true);

      const before = { ...world.transform.get(near)!.pos };
      for (let t = 0; t < TICK_HZ / 2; t++) step();
      const drift = Math.hypot(world.transform.get(near)!.pos.x - before.x, world.transform.get(near)!.pos.z - before.z);
      expect(drift, "⛔ 放燈後沒點的隊友被搬走了 —— 施法者不可以替隊友決定").toBeLessThan(0.01);

      step(new Map([[3, [{ kind: "interact", objectId: lantern }]], [0, [{ kind: "interact", objectId: lantern }]], [2, [{ kind: "interact", objectId: lantern }]]]));
      expect(rejection(events, foe), "敵人站在燈籠旁點燈必須被拒（隊伍驗證）").toEqual(["enemy"]);
      expect(rejection(events, thresh)).toEqual(["owner"]);
      expect(rejection(events, far)).toEqual(["too-far"]);
      expect(world.interactable.has(lantern), "被拒的點擊不可以消耗燈籠").toBe(true);

      const gap = dist(world, near, thresh);
      step(new Map([[1, [{ kind: "interact", objectId: lantern }]]]));
      expect(rejection(events, near)).toEqual([]);
      expect(dist(world, near, thresh), "合法隊友點燈之後沒有飛回瑟雷西").toBeLessThan(gap / 2);
      expect(events.some((e) => e.type === "interactableEnd" && e.data.id === lantern && e.data.reason === "used")).toBe(true);
      expect(world.interactable.size).toBe(0);

      step(new Map([[1, [{ kind: "interact", objectId: lantern }]]]));
      expect(rejection(events, near)).toEqual(["gone"]);
    });
  });

  it("死亡的隊友點不了；到期之後誰都點不了", () => {
    withLantern((rig) => {
      const { world, near, far, events, step } = rig;
      const lantern = throwLantern(rig);
      world.health.get(near)!.alive = false;
      step(new Map([[1, [{ kind: "interact", objectId: lantern }]]]));
      expect(rejection(events, near)).toEqual(["dead"]);
      for (let t = 0; t < 8 * TICK_HZ && world.interactable.size > 0; t++) step();
      expect(events.some((e) => e.type === "interactableEnd" && e.data.id === lantern && e.data.reason === "expired")).toBe(true);
      step(new Map([[2, [{ kind: "interact", objectId: lantern }]]]));
      expect(rejection(events, far)).toEqual(["gone"]);
    });
  });
});
