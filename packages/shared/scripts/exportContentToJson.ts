#!/usr/bin/env tsx
/**
 * One-time migration: walk the TS-literal skeleton content (registries +
 * SKELETON_ARENA) and write the JSON-per-object store under content/, plus
 * default config / model / status-effect / vfx docs. Then rebuild every
 * _index.json + manifest.json.
 *
 * Idempotent + deterministic — safe to re-run; identical content yields
 * byte-identical files and the same contentVersion.
 *
 * NOTE: sim/content/skeleton.ts stays as-is (the sim unit tests depend on the
 * literals). The JSON store is authoritative for runtime loading; the literal
 * module remains until the game-server switches to the ContentLoader.
 * See content/README.md.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import {
  registerSkeletonContent,
  Champions,
  Abilities,
  Items,
  Augments,
  Projectiles,
  LootTables,
  SKELETON_ARENA,
} from "../src/sim/index";
import type { EffectDef } from "../src/sim/effects/effect";
import { MAX_ROUNDS_UNLIMITED } from "../src/roomSettings";
import type { HookDef } from "../src/sim/stats/modifiers";
import { COLLECTIONS, type CollectionName } from "../src/content/schema/index";
import type { ConfigDoc } from "../src/content/schema/config";
import type { ModelDoc } from "../src/content/schema/model";
import type { StatusEffectDoc } from "../src/content/schema/statusEffect";
import type { VfxDoc } from "../src/content/schema/vfx";
import { rebuildAllIndexes, writeDocAtomic } from "../src/content/node/index";

const CONTENT_DIR = process.env.GGD_CONTENT_DIR ?? join(__dirname, "../../../content");

function doc<T extends { id: string }>(collection: CollectionName, def: T): T & { schema: string } {
  const { id, ...rest } = def;
  return { id, schema: COLLECTIONS[collection].schemaTag, ...rest } as T & { schema: string };
}

/** Validate-then-write: the store must never contain a doc its schema rejects. */
function emit(collection: CollectionName, d: { id: string; schema: string }): void {
  COLLECTIONS[collection].schema.parse(d);
  writeDocAtomic(CONTENT_DIR, collection, d);
  written[collection] = (written[collection] ?? 0) + 1;
}

const written: Partial<Record<CollectionName, number>> = {};

// ---------- walk effects for status ids + vfx keys ----------
const statusIds = new Set<string>();
const vfxKeys = new Set<string>();

function walkEffects(effects: readonly EffectDef[] | undefined): void {
  for (const e of effects ?? []) {
    if (e.kind === "applyStatus") statusIds.add(e.statusId);
    if (e.kind === "spawnProjectile") walkEffects(e.onHit);
  }
}
function walkHooks(hooks: readonly HookDef[] | undefined): void {
  for (const h of hooks ?? []) walkEffects(h.effects);
}

// ---------- main ----------
registerSkeletonContent();

for (const p of Projectiles.all()) {
  if (p.vfxKey) vfxKeys.add(p.vfxKey);
  emit("projectiles", doc("projectiles", p));
}
for (const a of Abilities.all()) {
  if (a.vfxKey) vfxKeys.add(a.vfxKey);
  walkEffects(a.effects);
  emit("abilities", doc("abilities", a));
}
for (const c of Champions.all()) {
  walkHooks(c.passive?.hooks);
  emit("champions", doc("champions", c));
}
for (const i of Items.all()) {
  walkHooks(i.passive);
  emit("items", doc("items", i));
}
for (const a of Augments.all()) {
  walkHooks(a.hooks);
  emit("augments", doc("augments", a));
}
for (const t of LootTables.all()) emit("loot-tables", doc("loot-tables", t));

emit("arenas", doc("arenas", SKELETON_ARENA));

// ---------- status-effect docs ----------
const STATUS_META: Record<string, Omit<StatusEffectDoc, "id" | "schema">> = {
  slow40: { name: "Slow (40%)", description: "Movement speed reduced by 40%.", polarity: "debuff", tags: ["slow"] },
  slow25: { name: "Slow (25%)", description: "Movement speed reduced by 25%.", polarity: "debuff", tags: ["slow"] },
  root: { name: "Rooted", description: "Cannot move.", polarity: "debuff", tags: ["root"] },
  burnstun: { name: "Searing Stun", description: "Stunned by the firestorm.", polarity: "debuff", tags: ["stun"] },
};
for (const id of [...statusIds].sort()) {
  const meta = STATUS_META[id] ?? { name: id, polarity: "debuff" as const };
  emit("status-effects", { id, schema: "status-effect@1", ...meta });
}

// ---------- config ----------
const MATCH_CONFIG: ConfigDoc = {
  id: "config.match",
  schema: "config@1",
  tick: { tickHz: 30, snapshotHz: 20 },
  match: {
    teamCount: 4,
    teamSize: 3,
    startingTeamLives: 8,
    champSelectSec: 30,
    // PREP WINDOW (task #38): the intermission is now a whole scene with a
    // centre-stage shop, so it is a 60 s prep phase, not a 25 s pause.
    intermissionSec: 60,
    combatMaxSec: 90,
    resolutionSec: 6,
    // 0 = 不設限（照賽制打到最後一回合／決賽為止；⛔ 不是「團隊生命歸零」——
    // 2026-07-27 取消淘汰之後生命歸零不讓任何人出局）—— 這支一次性遷移腳本寫的是骨架值，
    // 出貨值以 content/config/config.match.json 為準。#288 讓這一格出現在型別上。
    maxRounds: MAX_ROUNDS_UNLIMITED,
  },
  economy: {
    startingGold: 600,
    killGold: 150,
    assistGold: 75,
    roundWinGold: 300,
    roundLoseGold: 150,
    sellRefund: 0.7,
    inventorySlots: 6,
  },
  progression: {
    levelCap: 18,
    xpBase: 100,
    xpPerLevel: 80,
    xpKill: 120,
    xpAssist: 60,
    xpRoundSurvive: 100,
  },
  draft: { offerCount: 3, tierSchedule: { "1": "silver", "3": "gold", "5": "prismatic" } },
};
emit("config", MATCH_CONFIG);

// ---------- models (the .glb files are authored later in Blockbench) ----------
const MODELS: ModelDoc[] = ["sela", "thorne"].map((c) => ({
  id: `champ.${c}`,
  schema: "model@1",
  glbPath: `assets/models/champ.${c}.glb`,
  scale: 1,
  collisionRadius: 0.6,
  clipMap: { idle: "Idle", run: "Run", attack: "Attack", cast: "Cast", hurt: "Hurt", death: "Death" },
  attachPoints: {
    rightHand: { x: 0.35, y: 1.1, z: 0.1 },
    overhead: { x: 0, y: 2.2, z: 0 },
  },
  teamTintMaterials: ["TeamPrimary", "TeamTrim"],
}));
for (const m of MODELS) emit("models", m);

// ---------- vfx (one default doc per key used by skeleton content) ----------
const VFX_OVERRIDES: Record<string, Partial<VfxDoc>> = {
  "fx.firestorm": {
    emitter: { shape: "cone", radius: 5, angleDeg: 60 },
    mode: "continuous",
    rate: 120,
    burstCount: undefined,
    lifetimeSec: { min: 0.4, max: 1.1 },
    size: { start: 0.9, end: 0.2 },
  },
  "fx.cinder-ward": {
    emitter: { shape: "sphere", radius: 1.2 },
    color: { start: [1, 0.75, 0.35, 0.9], end: [1, 0.45, 0.15, 0] },
  },
  "fx.barkskin": {
    emitter: { shape: "sphere", radius: 1 },
    blendMode: "alpha",
    color: { start: [0.45, 0.7, 0.3, 0.9], end: [0.25, 0.45, 0.15, 0] },
  },
  "fx.root-snare": {
    blendMode: "alpha",
    color: { start: [0.4, 0.65, 0.25, 1], end: [0.2, 0.4, 0.1, 0] },
  },
};

function defaultVfx(key: string): VfxDoc {
  const base: VfxDoc = {
    id: key,
    schema: "vfx@1",
    emitter: { shape: "point" },
    mode: "burst",
    burstCount: 24,
    lifetimeSec: { min: 0.2, max: 0.6 },
    size: { start: 0.45, end: 0.1 },
    color: { start: [1, 0.6, 0.2, 1], end: [1, 0.2, 0.05, 0] },
    blendMode: "additive",
  };
  const merged = { ...base, ...VFX_OVERRIDES[key] } as VfxDoc & { burstCount?: number };
  if (merged.mode === "continuous") delete merged.burstCount;
  return merged;
}
for (const key of [...vfxKeys].sort()) emit("vfx", defaultVfx(key));

// ---------- indexes + manifest ----------
const manifest = rebuildAllIndexes(CONTENT_DIR);

console.log(`exported content to ${CONTENT_DIR}`);
for (const [c, n] of Object.entries(written).sort()) console.log(`  ${c}: ${n} doc(s)`);
console.log(`contentVersion: ${manifest.contentVersion}`);
