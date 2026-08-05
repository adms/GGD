/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE EFFECT REGISTRY — how to add a new effect kind (READ THIS FIRST)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * To implement a kind you touch THREE files, and only one of them is shared:
 *
 *   1. `effects/<name>.ts`      — write `export const <name>Effect:
 *                                 EffectKindSpec<"<name>"> = { apply(e, ctx) {…} }`
 *   2. `effects/effectRegistry.ts` (this file) — ONE import + ONE line in the
 *                                 record below
 *   3. `content/schema/effect.ts` + `sim/effects/effect.ts` — the union member
 *                                 and its Zod mirror, if the kind is new
 *
 * That is the whole seam. Before GH#289 all twelve handlers lived in one
 * 500-line `switch` inside effectRunner.ts and every parallel lane adding a
 * primitive collided in the same hunk; now a lane owns a file.
 *
 * ── The rules that are NOT negotiable ──────────────────────────────────────
 *
 * • A handler mutates the world ONLY through the established paths: the damage
 *   queue, `addShield`, `world.status`, `attachSource`, `nav.override`,
 *   projectile spawns, `world.emit`. Reaching around them is how a mechanic
 *   ends up invisible to the snapshot (failure shape ②).
 *
 * • `packages/shared/src/sim/**` is PURE (sim/purity.test.ts enforces it): no
 *   `Math.random` — use `ctx.rng` — no `Date.now`, no trigonometry, no `**`.
 *   Every deadline is an ABSOLUTE tick (`world.tick + N`), never a countdown.
 *   Iterate Maps/Sets in sorted order.
 *
 * • A STUB THROWS. It must never return quietly. The kinds still reserved below
 *   (GH#289 opened five — `dot`, `summon`, `invulnerable`, `knockback`,
 *   `evasion` — and each lane deletes its own row as it lands) each raise a
 *   named error, because a silent no-op is precisely CLAUDE.md's failure shape
 *   ② — the content author sees the effect on the card, the designer sees it in
 *   the preview, and nothing happens in the game. The registry is a mapped type
 *   over `EffectDef["kind"]`, so an unregistered kind is a COMPILE error and an
 *   unimplemented one is a LOUD runtime error. Neither can be silent.
 *
 * • Behaviour options belong in the CONTENT, not in a branch you picked. Owner,
 *   2026-07-30: 「所有開發都要以編輯器可以彈性設定為準，尤其是決策點」. If while
 *   writing a handler you think "A or B here?", that is a field on the effect
 *   with the owner-stated default — see `shield.absorbs` for the worked example.
 *
 * • Every handler needs a guard that runs a REAL `SimWorld.step()` and reads
 *   final state (`world.health`, `world.stats.get(id).final`), not one that
 *   asserts what the effect OBJECT looks like. Mutation-verify it: break the
 *   key line, watch it go red, put it back.
 *
 * ── `bake` (optional) ──────────────────────────────────────────────────────
 *
 * A kind that LAUNCHES a deferred payload (`leap.onLand`,
 * `spawnProjectile.onHit`) also declares `bake`, which resolves cast-time
 * conditionals at the moment of launch — see effectRunner.ts's
 * `bakeCastTimeConditionals` for the #247 defect that exists to kill. Absent =
 * identity, and that is the right answer for a kind with no nested payload and
 * no conditional term; `bake` must NOT throw for an unimplemented kind, because
 * baking a list walks EVERY member of it.
 */
import type { EffectRegistry } from "./effectKind";

import { applyBuffEffect } from "./applyBuff";
import { cycleBuffEffect } from "./cycleBuff";
import { applyStatusEffect } from "./applyStatus";
import { championFormEffect } from "./championForm";
import { damageEffect } from "./damage";
import { damageAreaEffect } from "./damageArea";
import { damageLineEffect } from "./damageLine";
import { grantAttributeEffect } from "./grantAttribute";
import { dashEffect } from "./dash";
import { healEffect } from "./heal";
import { leapEffect } from "./leap";
import { restoreEffect } from "./restore";
import { shieldEffect } from "./shield";
import { spawnProjectileEffect } from "./spawnProjectile";
import { spawnVfxEffect } from "./spawnVfx";
import { spendManaEffect } from "./spendMana";

// ── landed primitives (GH#289 lanes) ─────────────────────────────────────────
import { dotEffect } from "./dot"; // P1 持續傷害 — payout half in ./dotTick.ts
import { knockbackEffect } from "./knockback"; // P4 擊退／擊飛 — bounds in ./knockbackLimits.ts
import { invulnerableEffect } from "./invulnerable"; // P3 無敵/免疫 — predicates live there too
import { summonEffect } from "./summon"; // P2 召喚物 — lifecycle half in ../summons.ts

// ── reserved slots (GH#289) — schema-known, registry-slotted, LOUDLY unimplemented
import { evasionEffect } from "./evasion";

// ── 嘲弄 / 煉金術 (鍊金術之盾 godie-i06q) ────────────────────────────────────
import { tauntEffect } from "./taunt"; // 強制索敵 — model + config in ../taunt.ts
import { grantGoldEffect } from "./grantGold"; // 「黃金數量為敵方等級」

// ── 復活 (天生牙 godie-i031) ─────────────────────────────────────────────────
// Delegates the STATE CONTRACT to `sim/revive.ts::reviveChampionAt`, the same
// function the 復活圈 (#84/#206) completes through — so this is a new way to
// TRIGGER a revive, never a second definition of what a revived champion is.
import { dispelEffect } from "./dispel";
import { reviveEffect } from "./revive";

/**
 * kind → handler. The mapped type demands EVERY member of the `EffectDef`
 * union, so growing the union without landing a handler stops the build.
 */
export const EFFECT_HANDLERS: EffectRegistry = {
  // ── shipped ──────────────────────────────────────────────────────────────
  damage: damageEffect,
  damageArea: damageAreaEffect,
  // 面前直線範圍 (18-00 薔薇荊棘之刃) — a CAPSULE, so 「站在他背後」 stays an
  // answer to him. Shape from collision/shapes.ts; see ./damageLine.ts.
  damageLine: damageLineEffect,
  // 三圍發放 (07-00 獸化心靈) — permanent 力/敏/智 with a 「每 N 次」 gate and a
  // ceiling on the RESULT. Writes the same `attrBonus` the shop writes, so it
  // reaches the client through the existing projection. See ./grantAttribute.ts.
  grantAttribute: grantAttributeEffect,
  heal: healEffect,
  shield: shieldEffect,
  applyStatus: applyStatusEffect,
  applyBuff: applyBuffEffect,
  // 輪替增益 (揍敵客阿福 13-00) — rotation index derived from absolute expiry
  // ticks, so it adds no SimWorld field and no counter. See ./cycleBuff.ts.
  cycleBuff: cycleBuffEffect,
  restore: restoreEffect,
  // 消耗法力 — the WC3 ORB per-swing charge (20-01 風王結界). Gated by the
  // hook's own `condition`, never by itself; see effects/spendMana.ts.
  spendMana: spendManaEffect,
  dash: dashEffect,
  leap: leapEffect,
  championForm: championFormEffect,
  spawnProjectile: spawnProjectileEffect,
  spawnVfx: spawnVfxEffect,

  // ── landed: lane P1 持續傷害 (uses SimWorld.dot; ticked by dotTickSystem) ──
  dot: dotEffect,
  // ── landed: lane P4 擊退／擊飛 (nav.override + world.knockdown, no new store)
  knockback: knockbackEffect,
  // ── landed: lane P2 召喚物 (uses SimWorld.summon; ticked by summonSystem) ──
  summon: summonEffect,
  // ── landed: lane P3 無敵/免疫 (SimWorld.invulnerable; NO system — 到期即失效) ──
  invulnerable: invulnerableEffect,

  // ── 嘲弄 (鍊金術之盾) — forces auto-targeting through the ONE seam
  //    `targeting.forcedTargetOf`; state + every decision field in sim/taunt.ts.
  taunt: tauntEffect,
  // ── 發放金幣, optionally × the victim's level (「黃金數量為敵方等級」).
  //    ⚠️ Pays at PROC time, not at kill confirmation — see ./grantGold.ts.
  grantGold: grantGoldEffect,

  // ── 復活 (天生牙 godie-i031) — this handler decides WHO / WHERE / WHETHER;
  //    the state contract («what a revived champion looks like») is the
  //    circle's own `sim/revive.ts::reviveChampionAt`. See ./revive.ts.
  revive: reviveEffect,

  // ── 【淨化】/【驅散】(A4b) — 清 status / dot / shields / buffs 的選定子集。
  //    行為 ./dispel.ts，池子語意 ../clearPools.ts，旋鈕 ../dispelRules.ts。
  dispel: dispelEffect,

  // ── reserved: replace the stub module's `apply`, nothing here changes ─────
  evasion: evasionEffect, //           lane P5 — 閃避   (uses the existing Stat.Evasion)
  // lane P6 — 護盾傷害類型過濾 is NOT a kind: it is `shield.absorbs`, see shield.ts
};
