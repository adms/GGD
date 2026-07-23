#!/usr/bin/env tsx
/**
 * RUNTIME PROBE (diagnostic, not a test) for the cast-telegraph light pillar.
 *
 * Unit tests were green through all five of this project's "wired but dead"
 * bugs, so this walks the WHOLE chain with nothing stubbed:
 *
 *   content/*.json  → ContentLoader + registerAll   (the game-server boot pair)
 *                   → the REAL Abilities registry
 *                   → a REAL SimWorld, stepped tick by tick
 *                   → the REAL castBegin / castEnd events it emits
 *                   → the REAL VfxSystem.handleEvent on a Babylon NullEngine
 *                   → the pillar layer, read back frame by frame
 *
 * It also reports the two numbers that decide whether this feature is visible
 * at all in a match today: how many registered abilities have a cast window
 * (only those emit castBegin), and what element each ability's column will be.
 *
 *   pnpm --filter @ggd/client exec tsx scripts/probeCastPillar.ts
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ContentLoader } from "@ggd/shared/content/loader";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
import { registerAll, VfxDefs } from "@ggd/shared/content/registries";
import { Abilities, Champions } from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { castAbility, rankUpAbility, learnEx } from "@ggd/shared/sim/abilities/abilitySystem";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "@ggd/shared/ids";
import type { AbilityDef } from "@ggd/shared/sim/content/defs";
import type { CastTarget, CoreAbilitySlot, AbilitySlot } from "@ggd/shared/sim/intents";
import { TICK_MS } from "@ggd/shared/constants";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";

// The client's settings store reads `localStorage` at import time. Node 25
// exposes a stub that is not a Storage, so give it a real in-memory one BEFORE
// the client modules load (hence the dynamic imports below — the point of this
// probe is to run the SHIPPING client code, not a copy of it).
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  get length() {
    return mem.size;
  },
};
const { VfxSystem } = await import("../src/vfx/VfxSystem");
const {
  pillarPalette,
  pillarTintFromRamp,
  chromaOf,
  crowdAlphaScale,
  crowdTotalLuminance,
  motesPerPulse,
  moteSpec,
  DEFAULT_FRINGE,
  MAX_PILLARS,
  MOTE_PERIOD_MS,
} = await import("../src/vfx/castPillar");

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = process.env.GGD_CONTENT_DIR ?? join(HERE, "../../../content");

const res = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
registerAll(res.store);

const all = Abilities.all();
console.log(`contentVersion:        ${res.manifest.contentVersion}`);
console.log(`champions registered:  ${Champions.ids().length}`);
console.log(`abilities registered:  ${all.length}`);
console.log(`vfx docs registered:   ${VfxDefs.ids().length}`);

/**
 * The palette an ability ACTUALLY gets in a match.
 *
 * This must mirror `VfxSystem.pillarPaletteFor` exactly, INCLUDING the doc-tint
 * fallback: the shipping client passes `vfxDoc: (key) => contentDb.vfxFor(key)`
 * (GameApp.ts), and `contentDb.vfxFor` is `VfxDefs.tryGet` once content is
 * registered. An earlier revision of this probe passed `null` for the tint,
 * which silently collapsed every non-`fx.prim.*` ability into one
 * "(default gold)" bucket and reported a colour the game never renders.
 */
function resolve(vfxKey: string | undefined): ReturnType<typeof pillarPalette> {
  const doc = vfxKey ? VfxDefs.tryGet(vfxKey) : undefined;
  return pillarPalette(vfxKey, doc ? pillarTintFromRamp(doc.colorStops, doc.color.start) : null);
}
const hex = (c: readonly number[]): string =>
  "#" +
  [0, 1, 2]
    .map((i) =>
      Math.round(Math.max(0, Math.min(1, c[i] as number)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const isGold = (c: readonly number[]): boolean =>
  [0, 1, 2].every((i) => Math.abs((c[i] as number) - (DEFAULT_FRINGE[i] as number)) < 1e-6);

// ---------------------------------------------------------------------------
// 1) WHO GETS A PILLAR TODAY — only a cast window emits castBegin
// ---------------------------------------------------------------------------
const withWindow = all.filter((a) => (a.castTimeSec ?? 0) > 0);
console.log(
  `\n[1] abilities with a cast window (→ raise a pillar): ${withWindow.length} / ${all.length}` +
    `  (${((withWindow.length / all.length) * 100).toFixed(1)}%)`,
);
for (const a of [...withWindow].sort((x, y) => x.id.localeCompare(y.id)).slice(0, 12)) {
  const p = resolve(a.vfxKey);
  console.log(
    `      ${a.id.padEnd(22)} ct=${a.castTimeSec}s  vfxKey=${(a.vfxKey ?? "(none)").padEnd(26)}` +
      ` fringe=${hex(p.fringe)} via=${p.element ?? (isGold(p.fringe) ? "FF7 gold (no hue anywhere)" : "doc ramp")}`,
  );
}
if (withWindow.length > 12) console.log(`      … ${withWindow.length - 12} more`);

// ---------------------------------------------------------------------------
// 2) WHAT COLOUR each column ACTUALLY is, resolved the way the client does
// ---------------------------------------------------------------------------
const bySource = new Map<string, number>();
const byHue = new Map<string, number>();
for (const a of all) {
  const p = resolve(a.vfxKey);
  const src = p.element
    ? `element: ${p.element}`
    : isGold(p.fringe)
      ? "FF7 gold (doc carried no hue)"
      : "doc colour ramp";
  bySource.set(src, (bySource.get(src) ?? 0) + 1);
  byHue.set(hex(p.fringe), (byHue.get(hex(p.fringe)) ?? 0) + 1);
}
console.log(`\n[2] pillar colour SOURCE for all ${all.length} abilities (real doc tints):`);
for (const [k, n] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`      ${String(n).padStart(4)}  ${k}`);
}
const goldCount = bySource.get("FF7 gold (doc carried no hue)") ?? 0;
console.log(
  `      distinct fringe colours: ${byHue.size}` +
    `   |  gold fallback: ${goldCount} (${((goldCount / all.length) * 100).toFixed(1)}%)`,
);
console.log(`      top fringe colours:`);
for (const [k, n] of [...byHue.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`        ${String(n).padStart(4)}  ${k}${k === hex(DEFAULT_FRINGE) ? "  (FF7 gold)" : ""}`);
}
/**
 * THE 依文潔琳 CHECK, run over the whole roster instead of one champion.
 *
 * The owner's objection was an ICE ability erupting in orange fire. That is
 * detectable without knowing anything about the content: an ability whose id or
 * vfxKey names a cool/plant concept must not resolve to a warm hue.
 */
const COOL = /ice|frost|freeze|chill|glacial|snow|water|aqua|nature|thorn|root|bramble|bark|vine|leaf|poison|venom|toxic/i;
const mismatches: string[] = [];
for (const a of all) {
  const hay = `${a.id} ${a.vfxKey ?? ""} ${a.name ?? ""}`;
  if (!COOL.test(hay)) continue;
  const p = resolve(a.vfxKey);
  const [r, g, b] = p.fringe;
  // warm = red dominates blue by a clear margin AND the colour is saturated
  if (r > b + 0.25 && chromaOf(p.fringe) > 0.25 && (g as number) < (r as number)) {
    mismatches.push(`${a.id} (${a.vfxKey ?? "no vfxKey"}) → ${hex(p.fringe)}`);
  }
}
console.log(
  `\n[2b] cool/plant-named abilities erupting in a WARM column: ${mismatches.length}` +
    (mismatches.length ? "  ← the 依文潔琳 mismatch" : "  ← none"),
);
for (const m of mismatches.slice(0, 15)) console.log(`      ${m}`);
if (mismatches.length > 15) console.log(`      … ${mismatches.length - 15} more`);

/**
 * THE OWNER'S OWN EXAMPLE, resolved through the REGISTRY.
 *
 * 依文潔琳 is the champion the owner named when rejecting ice-that-looks-like-
 * fire, so she is a standing regression target rather than a one-off check.
 *
 * Read `Champions.get(id).abilities[slot]` and the `Abilities` registry, NEVER
 * `content/champions/<id>.json`. The raw champion doc still carries the stale
 * embedded `fx.ember-bolt-cast` for these abilities (194 mirror drifts are known
 * to be on disk); the standalone ability doc says `fx.prim.ice.nova` and, since
 * the shadowing fix, the standalone doc is what the match actually uses. Reading
 * the file instead of the registry reports a bug that does not exist.
 */
console.log(`\n[2c] 依文潔琳 and friends, resolved through the REGISTRY (not the raw champion doc):`);
for (const id of ["godie-n003", "godie-n01g"]) {
  const champ = Champions.all().find((c) => c.id === id);
  if (!champ) continue;
  console.log(`      ${id}  ${champ.name}`);
  for (const slot of ["Q", "W", "E", "R"] as CoreAbilitySlot[]) {
    const a = champ.abilities?.[slot];
    if (!a) continue;
    const reg = Abilities.tryGet(a.id);
    const p = resolve(reg?.vfxKey);
    console.log(
      `        ${slot} ${a.id.padEnd(16)} vfxKey=${(reg?.vfxKey ?? "(none)").padEnd(24)}` +
        ` fringe=${hex(p.fringe)} via=${p.element ?? "doc ramp"}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 3) THE WHOLE CHAIN: real sim → real events → real VfxSystem → real pillar
// ---------------------------------------------------------------------------
function targetFor(def: AbilityDef, foe: EntityId, pos: { x: number; z: number }): CastTarget {
  switch (def.castType) {
    case "self":
      return { type: "self" };
    case "targeted":
      return def.targetsEnemies === false ? { type: "self" } : { type: "entity", entityId: foe };
    case "ground":
      return { type: "point", point: pos };
    default:
      return { type: "point", point: pos };
  }
}

/** The champion + slot of the first ability that actually has a cast window. */
function findCaster(): { championId: string; slot: AbilitySlot; def: AbilityDef } | null {
  for (const c of Champions.all()) {
    for (const slot of ["Q", "W", "E", "R"] as CoreAbilitySlot[]) {
      const def = c.abilities?.[slot];
      if (def && (def.castTimeSec ?? 0) > 0) return { championId: c.id, slot, def };
    }
  }
  return null;
}

const pick = findCaster();
if (!pick) {
  console.log("\n[3] NO registered ability has a cast window — nothing to drive. STOP.");
  process.exit(0);
}

const world = new SimWorld(SKELETON_ARENA, 4242);
world.ultGateOverride = true;
const P = { x: 0, z: 0 };
const caster = spawnChampion(world, {
  championId: pick.championId as ChampionId,
  seatId: asSeatId(0),
  teamId: asTeamId(0),
  pos: { x: P.x, z: P.z },
  zone: 0,
});
const foe = spawnChampion(world, {
  championId: pick.championId as ChampionId,
  seatId: asSeatId(1),
  teamId: asTeamId(1),
  pos: { x: P.x + 3, z: P.z },
  zone: 0,
});
const NO_INTENTS = new Map();
world.step(NO_INTENTS);
world.rebuildGrid();

const ab = world.abilities.get(caster)!;
if (pick.slot === "EX") learnEx(world, caster);
else if (ab.slots[pick.slot as CoreAbilitySlot].rank < 1) {
  ab.unspentPoints = 1;
  rankUpAbility(world, caster, pick.slot as CoreAbilitySlot);
}
world.step(NO_INTENTS);
world.rebuildGrid();
world.health.get(caster)!.mana = 9999;

const engine = new NullEngine();
const scene = new Scene(engine);
const positions = new Map<number, { x: number; z: number }>();
positions.set(caster as unknown as number, { x: P.x, z: P.z });
positions.set(foe as unknown as number, { x: P.x + 3, z: P.z });
// `vfxDoc` is NOT optional decoration here: GameApp passes
// `(key) => contentDb.vfxFor(key)`, and without it every pillar in this probe
// would fall back to the gold default and the colour census above would be a
// measurement of the probe rather than of the game.
const vfx = new VfxSystem(scene, {
  entityPos: (id) => positions.get(id) ?? null,
  vfxDoc: (key) => VfxDefs.tryGet(key) ?? null,
});

console.log(
  `\n[3] driving the real sim: ${pick.championId} ${pick.slot} = ${pick.def.id}` +
    `  (castTimeSec ${pick.def.castTimeSec}, vfxKey ${pick.def.vfxKey ?? "(none)"})`,
);

const target = targetFor(pick.def, foe, { x: P.x + 3, z: P.z });
const castRes = castAbility(world, caster, pick.slot, target);
console.log(`      castAbility → "${castRes}"`);

let nowMs = 0;
const seen: string[] = [];
const drain = (): void => {
  for (const ev of world.events) {
    seen.push(ev.type);
    // EXACTLY what GameApp does for every drained event
    vfx.handleEvent({ type: ev.type, tick: world.tick, data: ev.data as never }, nowMs);
  }
};
drain();
vfx.update(nowMs);
const casterId = caster as unknown as number;
console.log(
  `      tick ${String(world.tick).padStart(3)}  events=[${world.events.map((e) => e.type).join(",")}]` +
    `  pillar=${vfx.castPillarFx.phaseOf(casterId) ?? "none"}` +
    `  alpha=${(vfx.castPillarFx.shellAlphaOf(casterId) ?? 0).toFixed(4)}`,
);

for (let i = 0; i < 30; i++) {
  world.step(NO_INTENTS);
  nowMs += TICK_MS;
  drain();
  vfx.update(nowMs);
  const phase = vfx.castPillarFx.phaseOf(casterId);
  const types = world.events.map((e) => e.type);
  if (types.length > 0 || i < 3 || phase === null) {
    console.log(
      `      tick ${String(world.tick).padStart(3)} (t=${String(nowMs).padStart(4)}ms)` +
        `  events=[${types.join(",")}]` +
        `  pillar=${phase ?? "none"}` +
        `  alpha=${(vfx.castPillarFx.shellAlphaOf(casterId) ?? 0).toFixed(4)}`,
    );
  }
  if (phase === null && seen.includes("castEnd")) break;
}

console.log(`      event types seen: ${[...new Set(seen)].join(", ")}`);
console.log(
  `      VERDICT: castBegin=${seen.includes("castBegin")} castEnd=${seen.includes("castEnd")}` +
    ` pillarRose=${seen.includes("castBegin")} pillarCleared=${!vfx.castPillarFx.has(casterId)}` +
    ` liveMeshes=${scene.meshes.length}`,
);

// ---------------------------------------------------------------------------
// 4) WORST-CASE BUDGET, computed from the shipping constants
// ---------------------------------------------------------------------------
const spec = moteSpec(pillarPalette("fx.prim.fire.nova", null));
console.log(`\n[4] worst-case budget (3v3v3v3 = 12 champions casting at once)`);
console.log(`      pillar slots (hard cap):        ${MAX_PILLARS}`);
console.log(`      meshes per pillar:              3  (shell + core + base flare)`);
console.log(`      meshes at the cap:              ${MAX_PILLARS * 3}  (allocated once, reused forever)`);
console.log(`      per-cast allocation after warm-up: 0 meshes / 0 materials / 0 systems`);
for (const n of [1, 4, 8, 12, 16]) {
  const pulses = (n * 1000) / MOTE_PERIOD_MS;
  const perPulse = motesPerPulse(n, 1);
  const live = pulses * perPulse * spec.lifetimeSec.max;
  console.log(
    `      ${String(n).padStart(2)} casting → alpha x${crowdAlphaScale(n).toFixed(3)}` +
      `  total light ${crowdTotalLuminance(n).toFixed(2)} (naive would be ${n})` +
      `  motes ${perPulse}/pulse, ${pulses.toFixed(0)} pulses/s, <=${live.toFixed(0)} live particles`,
  );
}

vfx.dispose();
scene.dispose();
engine.dispose();
