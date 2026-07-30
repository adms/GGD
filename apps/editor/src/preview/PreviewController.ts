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
        // 百分比生命與存款加成都必須出現在摘要裡:`perRank` 只是 `amount` 那一項,
        // 一張 12% 最大生命 + 存款加成的卡在預覽裡會看起來像一發平庸的固定傷害,
        // 而設計師會照那個假數字去調平衡。
        const pct =
          e.hpPct === undefined
            ? ""
            : `, +目標${e.hpPct.basis === "current" ? "當前" : "最大"}生命 ` +
              `${e.hpPct.perRank.map((v) => `${Math.round(v * 1000) / 10}%`).join("/")}`;
        const banked =
          e.bankedBonus === undefined
            ? ""
            : `, +存款「${e.bankedBonus.statusId}」×${e.bankedBonus.coeff}（上限 ${e.bankedBonus.max}）`;
        out.push({
          depth,
          kind: e.kind,
          summary: `${e.damageType} damage${pct}${banked}`,
          perRank,
        });
        break;
      }
      // 擴散 (task #210). The radius / falloff / cap all belong in the summary:
      // the numbers a designer needs to sanity-check are "how big" and "how many",
      // and `perRank` alone (the centre-of-circle amount) would read as a plain
      // single-target nuke — the same blank-preview trap the note below records,
      // one level subtler because it renders SOMETHING.
      case "damageArea": {
        const perRank = ranks(maxRank).map((r) => resolveScaling(finalStats, e.amount, r));
        const taper = e.falloff !== undefined && e.falloff < 1 ? `, ×${e.falloff} at rim` : "";
        const cap = e.maxTargets !== undefined ? `, max ${e.maxTargets}` : "";
        const origin = e.includeOrigin === true ? ", incl. epicentre" : "";
        out.push({
          depth,
          kind: e.kind,
          summary: `${e.damageType} area damage r=${e.radius}u${taper}${cap}${origin}`,
          perRank,
        });
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
      // TASK #247 follow-up. `leap` was added to the shared EffectDef union but
      // never taught to this switch, so 蒼月潮 07-03 — an ability whose ONLY
      // effect is a leap — previewed as an EMPTY effect list: the exact
      // 「表單看到的 == 遊戲跑的」 break the `restore`/`spawnVfx` note below
      // already records. The landing payload recurses like spawnProjectile's,
      // because that is where a leap's damage actually lives.
      case "leap": {
        const who = e.applyTo === "target" ? "target" : "self";
        const where =
          e.mode === "inPlace"
            ? "in place"
            : `to point${e.throwDistance !== undefined ? ` (throw ${e.throwDistance}u)` : ""}`;
        out.push({
          depth,
          kind: e.kind,
          summary: `leap ${who} ${where}, apex ${e.apexHeight}u over ${e.durationSec}s${
            e.landRadius ? `, land AoE ${e.landRadius}u` : ""
          }${e.onLand?.length ? ", on land:" : ""}`,
        });
        if (e.onLand?.length) effectLines(e.onLand, finalStats, maxRank, depth + 1, out);
        break;
      }
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
      // 變身 (task #249). The destination body is NOT in the effect — it is the
      // hero's own `transform.counterpartId` — so the preview names the
      // DIRECTION and the duration, which is all this effect actually decides.
      case "championForm":
        out.push({
          depth,
          kind: e.kind,
          summary: `champion form → ${e.to}${
            e.durationSec !== undefined ? ` for ${e.durationSec}s` : " (no expiry)"
          }`,
        });
        break;
      /* ═══════════════════════════════════════════════════════════════════
       * RESERVED KINDS (GH#289). The sim handlers throw until their lane
       * lands (sim/effects/effectRegistry.ts), so the preview says so IN THE
       * LINE rather than rendering a confident summary of a spell that would
       * crash the tick. The `never` tripwire below is why they are here at
       * all: growing the union without teaching this switch does not compile.
       *
       * When a lane implements its kind, replace its case here with a real
       * summary — that IS part of landing the feature, not a follow-up.
       * ═══════════════════════════════════════════════════════════════════ */
      case "dot": {
        // lane P1 LANDED. The card names the CADENCE, the PAYOUT COUNT and the
        // re-application rule, because those are the three things an author
        // cannot read off the raw fields: 「每 0.5 秒、持續 2 秒」 is four
        // payouts, not two, and 「再放一次」 means something different under
        // each of the three stacking modes.
        const stacking = e.stacking ?? "refresh";
        const payouts = Math.floor(e.durationSec / e.intervalSec) + (e.tickOnApply === true ? 1 : 0);
        const stack =
          stacking === "stack"
            ? `疊加 ×${e.maxStacks ?? 99} 上限`
            : stacking === "independent"
              ? "各自獨立計時"
              : "重複施放只延長時間";
        const orphan = e.onCasterDeath === "stop" ? "，施法者死亡即中斷" : "";
        out.push({
          depth,
          kind: e.kind,
          summary: `持續傷害 ${e.damageType} 每 ${e.intervalSec}s / 共 ${e.durationSec}s → ${payouts} 次 — ${stack}${orphan}`,
        });
        break;
      }
      case "summon":
        out.push({
          depth,
          kind: e.kind,
          summary: `⚠ NOT IMPLEMENTED (lane P2) — summon ${e.count}× ${e.championId}${
            e.durationSec !== undefined ? ` for ${e.durationSec}s` : " (permanent)"
          }`,
        });
        break;
      case "invulnerable": {
        // lane P3 LANDED. The card must say which AXES this grant actually
        // refuses — 「無敵」 alone is the lie that made 41-002 絕對屏障 ship as
        // +500 armour and 07-01 臨、兵、鬥 ship as a movement-speed buff.
        const mode = e.blocksDamage ?? "all";
        const dmg =
          mode === "none"
            ? "無傷害免疫"
            : mode === "all"
              ? "免疫所有傷害"
              : `免疫${mode === "magic" ? "魔法" : "物理"}傷害`;
        const tru = (e.blocksTrueDamage ?? mode === "all") ? " + 真實傷害" : "";
        const cc = e.blocksControl === true ? " + 免控" : "";
        out.push({
          depth,
          kind: e.kind,
          summary: `無敵/免疫 ${e.applyTo ?? "self"} ${e.durationSec}s — ${dmg}${tru}${cc}`,
        });
        break;
      }
      case "knockback":
        out.push({
          depth,
          kind: e.kind,
          summary: `⚠ NOT IMPLEMENTED (lane P4) — knockback ${e.distance}u @ ${e.speed}u/s from ${e.from ?? "caster"}`,
        });
        break;
      case "cycleBuff": {
        // 輪替增益 (揍敵客阿福 13-00). The preview line names the ORDER, because
        // the order is the mechanic: which step a swing lands on is derived from
        // the live expiry ticks, so a designer who cannot see the ring in the
        // card cannot tell this apart from four buffs applied at random.
        const ring = e.steps
          .map((s) => `${s.modifiers.map((m) => `${m.stat}${m.op === "pctAdd" ? ` +${Math.round(m.value * 100)}%` : ` ${m.value}`}`).join("/")} ${s.duration}s`)
          .join(" → ");
        out.push({
          depth,
          kind: e.kind,
          summary: `輪替增益 [${e.cycleKey}] on ${e.applyTo ?? "self"} — ${ring} → 循環`,
        });
        break;
      }
      case "evasion":
        out.push({
          depth,
          kind: e.kind,
          summary: `⚠ NOT IMPLEMENTED (lane P5) — ${Math.round(e.chance * 100)}% evasion on ${e.applyTo ?? "self"} for ${e.durationSec}s`,
        });
        break;
      // 18-00 薔薇荊棘之刃 —— 面前的一條直線 (sim/effects/damageLine.ts)。
      // 長寬都寫出來, 因為「3 個身位」在預覽裡看不出來, 而它是這張卡的全部。
      case "damageLine":
        out.push({
          depth,
          kind: e.kind,
          summary:
            `直線 ${e.damageType} 傷害 — 長 ${e.length} × 寬 ${e.width}, ` +
            `朝向 ${e.aim === "facing" ? "身體面向" : "事件目標"}, ` +
            `最多 ${e.maxTargets ?? "預設"} 人` +
            `${e.includeOrigin ? " (含震央)" : ""}${e.canCrit ? " · 可爆擊" : ""}`,
        });
        break;
      // 20-01 風王結界 —— 法球每次觸發自付法力 (sim/effects/spendMana.ts)。
      // ⚠️ 這一格漏掉的代價不是「預覽少一行字」：這個 switch 的 default 分支是
      // `throw`,所以少一個 case = **編輯器預覽碰到這個 kind 直接爆**,
      // 也就違反了「新機制要編輯器可調」。2026-07-31 由駁斥者量到。
      case "spendMana": {
        const perRank = ranks(maxRank).map((r) => resolveScaling(finalStats, e.amount, r));
        out.push({
          depth,
          kind: e.kind,
          summary:
            `扣除法力` +
            `${e.pctMaxMana !== undefined ? ` + 最大法力 ${Math.round(e.pctMaxMana * 100)}%` : ""}` +
            ` (${e.applyTo === "target" ? "目標" : "自己"})` +
            `${e.bankAs !== undefined ? `，存進「${e.bankAs.statusId}」${e.bankAs.durationSec} 秒` : ""}`,
          perRank,
        });
        break;
      }
      // 07-00 獸化心靈 / 08-00 龍紋記憶 —— 三圍發放 (sim/effects/grantAttribute.ts)。
      case "grantAttribute":
        out.push({
          depth,
          kind: e.kind,
          summary:
            `三圍 ${e.attr} ${e.mode === "pctOfCurrent" ? `×${1 + e.amount} (現有的 +${Math.round(e.amount * 100)}%)` : `+${e.amount}`}` +
            `${e.everyNth && e.everyNth > 1 ? ` · 每 ${e.everyNth} 次才發一次` : ""}` +
            `${e.maxAttribute !== undefined ? ` · 上限 ${e.maxAttribute}` : ""}` +
            `${e.durationSec !== undefined ? ` · 持續 ${e.durationSec}s` : " · 永久"}`,
        });
        break;
      default: {
        // EXHAUSTIVENESS TRIPWIRE (task #247 follow-up). This switch used to
        // fall through silently, which is how `restore`, `spawnVfx` and then
        // `leap` each shipped previewing as a BLANK line. `never` makes the
        // compiler refuse the next EffectDef kind until it is handled here —
        // the same job walk.test.ts's tag list does for the form, done at
        // build time instead of test time.
        const unhandled: never = e;
        throw new Error(`preview: unhandled effect kind ${(unhandled as EffectDef).kind}`);
      }
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
