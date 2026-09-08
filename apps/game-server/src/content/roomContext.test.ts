import { expect, it } from "vitest";
import { Models } from "@ggd/shared/content/registries";
import { ContentStore } from "@ggd/shared/content/store";
import { registerAll } from "@ggd/shared/content/registries";
import { captureRegistryContext, extendRegistryContext } from "@ggd/shared/sim/content/registryContext";
import { withRoomContent } from "./roomContext";
import { registerSkeletonContent, THORNE } from "@ggd/shared/sim/content/skeleton";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA, spawnChampion, rankUpAbility, type ChampionDef } from "@ggd/shared/sim";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "@ggd/shared/ids";

it("interleaved asynchronous room work and timers retain independent immutable content", async () => {
  const put = (value: string) => {
    const store = new ContentStore();
    store.add("models", "async-model", { id: "async-model", schema: "model@1", glbPath: value });
    registerAll(store, { representation: "verified-runtime" });
  };
  put("official");
  const base = captureRegistryContext("base");
  const a = extendRegistryContext(base, "a", () => put("a"));
  const b = extendRegistryContext(base, "b", () => put("b"));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = withRoomContent(a, async () => {
    expect(Models.get("async-model").glbPath).toBe("a");
    await gate;
    expect(Models.get("async-model").glbPath).toBe("a");
    await new Promise<void>((resolve) => setTimeout(() => { expect(Models.get("async-model").glbPath).toBe("a"); resolve(); }, 0));
  });
  const second = withRoomContent(b, async () => {
    expect(Models.get("async-model").glbPath).toBe("b");
    release(); await Promise.resolve();
    expect(Models.get("async-model").glbPath).toBe("b");
    expect(() => Models.clear()).toThrow("immutable");
  });
  await Promise.all([first, second]);
  expect(Models.get("async-model").glbPath).toBe("official");
});

it("real SimWorld casts use each room's pinned skill even when the same hero ID has a new version", async () => {
  registerSkeletonContent();
  const base = captureRegistryContext("sim-base");
  const championId = "room-content-proof" as ChampionId;
  const context = (damage: number) => extendRegistryContext(base, `damage-${damage}`, () => {
    const champion = structuredClone(THORNE) as ChampionDef;
    champion.id = championId;
    for (const slot of ["Q", "W", "E", "R"] as const) champion.abilities[slot].id = `${championId}.${slot.toLowerCase()}` as AbilityId;
    champion.abilities.Q = { ...champion.abilities.Q, castType: "targeted", castTimeSec: 0, manaCost: [0, 0, 0, 0], range: 20, effects: [{ kind: "damage", damageType: "true", amount: { flat: damage } }] };
    const store = new ContentStore();
    for (const ability of Object.values(champion.abilities)) store.add("abilities", ability.id, ability);
    store.add("champions", champion.id, champion);
    registerAll(store, { representation: "verified-runtime" });
  });
  const first = context(100); const second = context(200);
  const cast = async (selected: ReturnType<typeof context>) => withRoomContent(selected, async () => {
    const world = new SimWorld(SKELETON_ARENA, 9981);
    const center = SKELETON_ARENA.zones[0]!.center;
    const caster = spawnChampion(world, { championId, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: center.x - 2, z: center.z }, zone: 0, level: 18 });
    const foe = spawnChampion(world, { championId, seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: center.x + 2, z: center.z }, zone: 0, level: 18 });
    world.step(new Map());
    world.abilities.get(caster)!.unspentPoints = 1;
    expect(rankUpAbility(world, caster, "Q")).toBe(true);
    await Promise.resolve();
    world.step(new Map([[asSeatId(0), { commands: [{ kind: "castAbility", slot: "Q", target: { type: "entity", entityId: foe } }] }]]));
    expect(world.events.some((event) => event.type === "castRejected")).toBe(false);
    const damage = world.events.filter((event) => event.type === "damage").reduce((total, event) => total + Number(event.data.amount), 0);
    expect(damage).toBeGreaterThan(0); return damage;
  });
  const [oldDamage, newDamage] = await Promise.all([cast(first), cast(second)]);
  expect(newDamage).toBeCloseTo(oldDamage * 2, 5);
  expect(await cast(first)).toBe(oldDamage);
});
