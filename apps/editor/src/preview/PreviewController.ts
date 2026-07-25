/**
 * PreviewController — the editor's live-preview seam.
 *
 * CONTRACT (per the master plan): the controller owns ONE Babylon
 * Engine/Scene + ONE sandbox SimWorld and reuses the REAL render/vfx/sim.
 * Champion preview computes FinalStats through the real statPipeline and
 * plays clips; ability preview casts through a PreviewDriver -> IntentFrame
 * (never a direct effectRunner poke); items/augments attach a ModifierSource
 * and show stat deltas; vfx spawn through the shared toParticleSystem factory.
 *
 * THIS FILE ships the interface + `SimPreviewController`, a renderless
 * implementation that runs the DATA half through the real engine (sandbox
 * SimWorld + real statPipeline/registries — no mocks). The Babylon rendering
 * half is the client engineer's seam: see BabylonPreview.todo.md.
 */
import {
  SimWorld,
  SKELETON_ARENA,
  spawnChampion,
  registerChampion,
  attachSource,
  recomputeStats,
  resolveScaling,
  ALL_STATS,
  type ChampionDef,
  type ItemDef,
  type AugmentDef,
  type AbilityDef,
  type CoreAbilitySlot,
  type Stat,
  type EffectDef,
} from "@ggd/shared/sim";
import { asSeatId, asTeamId, type EntityId } from "@ggd/shared/ids";

export interface ChampionPreview {
  level: number;
  finalStats: Record<Stat, number>;
  hp: number;
  mana: number;
}

export interface EffectLine {
  /** indentation depth (nested spawnProjectile.onHit) */
  depth: number;
  kind: EffectDef["kind"];
  summary: string;
  /** resolved amount per rank (damage/heal/shield), using real FinalStats */
  perRank?: number[];
}

export interface AbilityPreview {
  ability: AbilityDef;
  casterStats: Record<Stat, number>;
  lines: EffectLine[];
}

export interface StatDelta {
  stat: Stat;
  before: number;
  after: number;
}

export interface PreviewController {
  /** attach the (future) Babylon canvas; renderless impl records the intent */
  mount(canvas: HTMLCanvasElement | null): void;
  dispose(): void;
  previewChampion(def: ChampionDef, opts?: { level?: number }): ChampionPreview;
  previewAbility(champion: ChampionDef, slot: CoreAbilitySlot, opts?: { level?: number }): AbilityPreview;
  previewItem(item: ItemDef, on: ChampionDef, opts?: { level?: number }): StatDelta[];
  previewAugment(aug: AugmentDef, on: ChampionDef, opts?: { level?: number }): StatDelta[];
  /** stub: records the request; Babylon impl plays the ParticleSystem */
  spawnVfx(vfxKey: string): void;
  /** advance the sandbox SimWorld by fixed ticks (empty intents) */
  stepFixed(ticks: number): void;
}

/** Sandbox world + champion, going through the REAL registries/spawn/statPipeline. */
function sandbox(def: ChampionDef, level: number): { world: SimWorld; id: EntityId } {
  // Sandbox registries: the latest edited doc wins. `overrideAbilities` is
  // REQUIRED here — registerChampion now defaults to letting the standalone
  // content/abilities/<id>.json doc win (it is the source of truth at boot), so
  // without this flag the champion being edited would preview the copy loaded
  // from disk instead of the one on screen.
  registerChampion(def, { overrideAbilities: true });
  const world = new SimWorld(SKELETON_ARENA, 0xc0ffee);
  const id = spawnChampion(world, {
    championId: def.id,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: SKELETON_ARENA.zones[0]!.center.x, z: 0 },
    zone: 0,
    level,
  });
  return { world, id };
}

function effectLines(
  effects: readonly EffectDef[],
  finalStats: Record<Stat, number>,
  maxRank: number,
  depth = 0,
  out: EffectLine[] = [],
): EffectLine[] {
  for (const e of effects) {
    switch (e.kind) {
      case "damage": {
        const perRank = ranks(maxRank).map((r) => resolveScaling(finalStats, e.amount, r));
        out.push({ depth, kind: e.kind, summary: `${e.damageType} damage`, perRank });
        break;
      }
      case "heal": {
        const perRank = ranks(maxRank).map((r) => resolveScaling(finalStats, e.amount, r));
        out.push({ depth, kind: e.kind, summary: "heal", perRank });
        break;
      }
      case "shield": {
        const perRank = ranks(maxRank).map((r) => resolveScaling(finalStats, e.amount, r));
        out.push({ depth, kind: e.kind, summary: `shield for ${e.duration}s`, perRank });
        break;
      }
      case "applyStatus":
        out.push({
          depth,
          kind: e.kind,
          summary: `apply ${e.statusId} for ${e.duration}s${e.stun ? " (stun)" : ""}${e.root ? " (root)" : ""}${e.moveSpeedMult !== undefined ? ` (ms ×${e.moveSpeedMult})` : ""}`,
        });
        break;
      case "applyBuff":
        out.push({
          depth,
          kind: e.kind,
          summary: `buff ${e.modifiers.map((m) => `${m.stat} ${m.op} ${m.value}`).join(", ")} for ${e.duration}s`,
        });
        break;
      case "dash":
        out.push({ depth, kind: e.kind, summary: `dash ${e.mode} ${e.maxDistance}u @ ${e.speed}u/s` });
        break;
      case "spawnProjectile":
        out.push({ depth, kind: e.kind, summary: `projectile ${e.projectileId}, on hit:` });
        effectLines(e.onHit, finalStats, maxRank, depth + 1, out);
        break;
      // `restore` and `spawnVfx` used to fall through this switch silently, so an
      // ability made of them previewed as a BLANK effect list — the one place
      // 「表單看到的 == 遊戲跑的」 breaks is exactly where a designer trusts it.
      // 鑄技工坊's 原地震波 / 變身強化 templates emit both, so they are covered now.
      case "restore": {
        const parts: string[] = [];
        if (e.healthPct !== undefined) parts.push(`${Math.round(e.healthPct * 100)}% max HP`);
        if (e.manaPct !== undefined) parts.push(`${Math.round(e.manaPct * 100)}% max mana`);
        out.push({
          depth,
          kind: e.kind,
          summary: `restore ${parts.length > 0 ? parts.join(" + ") : "(nothing set)"}`,
        });
        break;
      }
      case "spawnVfx":
        out.push({
          depth,
          kind: e.kind,
          summary: `vfx ${e.vfxId} at ${e.at ?? "self"}${e.durationSec !== undefined ? ` for ${e.durationSec}s` : ""}`,
        });
        break;
    }
  }
  return out;
}

const ranks = (maxRank: number): number[] => Array.from({ length: maxRank }, (_, i) => i + 1);

export function createSimPreviewController(): PreviewController {
  let world: SimWorld | null = null;
  const vfxLog: string[] = [];

  return {
    mount(_canvas) {
      /* renderless stub — BabylonPreview will own Engine/Scene here */
    },
    dispose() {
      world = null;
      vfxLog.length = 0;
    },

    previewChampion(def, opts) {
      const level = opts?.level ?? 1;
      const sb = sandbox(def, level);
      world = sb.world;
      const stats = sb.world.stats.get(sb.id)!;
      const hp = sb.world.health.get(sb.id)!;
      return { level, finalStats: { ...stats.final }, hp: hp.hp, mana: hp.mana };
    },

    previewAbility(champion, slot, opts) {
      const level = opts?.level ?? 1;
      const sb = sandbox(champion, level);
      world = sb.world;
      const finalStats = { ...sb.world.stats.get(sb.id)!.final };
      const ability = champion.abilities[slot];
      return { ability, casterStats: finalStats, lines: effectLines(ability.effects, finalStats, ability.maxRank) };
    },

    previewItem(item, on, opts) {
      const level = opts?.level ?? 1;
      const sb = sandbox(on, level);
      world = sb.world;
      const before = { ...sb.world.stats.get(sb.id)!.final };
      attachSource(sb.world, sb.id, {
        id: `preview:item:${item.id}`,
        kind: "item",
        modifiers: item.modifiers,
        hooks: item.passive,
      });
      recomputeStats(sb.world, sb.id);
      const after = sb.world.stats.get(sb.id)!.final;
      return ALL_STATS.filter((s) => before[s] !== after[s]).map((s) => ({
        stat: s,
        before: before[s],
        after: after[s],
      }));
    },

    previewAugment(aug, on, opts) {
      const level = opts?.level ?? 1;
      const sb = sandbox(on, level);
      world = sb.world;
      const before = { ...sb.world.stats.get(sb.id)!.final };
      attachSource(sb.world, sb.id, {
        id: `preview:aug:${aug.id}`,
        kind: "augment",
        modifiers: aug.modifiers,
        hooks: aug.hooks,
      });
      recomputeStats(sb.world, sb.id);
      const after = sb.world.stats.get(sb.id)!.final;
      return ALL_STATS.filter((s) => before[s] !== after[s]).map((s) => ({
        stat: s,
        before: before[s],
        after: after[s],
      }));
    },

    spawnVfx(vfxKey) {
      vfxLog.push(vfxKey);
    },

    stepFixed(ticks) {
      if (!world) return;
      const empty = new Map();
      for (let i = 0; i < ticks; i++) world.step(empty);
    },
  };
}
