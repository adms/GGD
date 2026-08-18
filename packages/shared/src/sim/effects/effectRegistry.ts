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
// ── 契約層 2026-08-09 (GH#301-2) — 真瞬移。⛔ 保留槽位，`apply` 目前 THROW。
import { blinkEffect } from "./blink";
// ── [EX∅ 根源] 2026-08-18 —— 兩個空殼槽位（見下面註冊處的說明）。
import { carryEffect } from "./carry";
import { mindControlEffect } from "./mindControl";

// ── 嘲弄 / 煉金術 (鍊金術之盾 godie-i06q) ────────────────────────────────────
import { tauntEffect } from "./taunt"; // 強制索敵 — model + config in ../taunt.ts
import { grantGoldEffect } from "./grantGold"; // 「黃金數量為敵方等級」

// ── 復活 (天生牙 godie-i031) ─────────────────────────────────────────────────
// Delegates the STATE CONTRACT to `sim/revive.ts::reviveChampionAt`, the same
// function the 復活圈 (#84/#206) completes through — so this is a new way to
// TRIGGER a revive, never a second definition of what a revived champion is.
import { dispelEffect } from "./dispel";
import { shieldBreakEffect } from "./shieldBreak";
import { devourEffect } from "./devour";
import { reviveEffect } from "./revive";

// ── Lane 1 (2026-08-08) — 同一個形狀的四個實例，界共用 ./kindLimits.ts ──────
import { modifyCooldownEffect } from "./modifyCooldown";
import { weightedBranchEffect } from "./weightedBranch";
import { swapResourceEffect } from "./swapResource";
import { eventValueConversionEffect } from "./eventValueConversion";

// ── Lane 2 (2026-08-08) — 同一個形狀的三個實例，界共用 ./kindLimits.ts ──────
import { randomAreaEffect } from "./randomArea";
import { manaBarrierEffect } from "./manaBarrier";
import { extendBuffEffect } from "./extendBuff";

// ── Lane 3 (2026-08-10) — G12 延遲序列 / S5 代放。界共用 ./kindLimits.ts ─────
import { delayedEffect } from "./delayed"; // 排程器半在 ./delayed.ts::delayedSystem
import { proxyCastEffect } from "./proxyCast"; // 終止性證明在該檔檔頭①

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
  shieldBreak: shieldBreakEffect,
  devour: devourEffect,

  // ── Lane 1 (#284 / §16.12 / §16.14 / §16.16) ─────────────────────────────
  // 縮短**特定一支**技能的冷卻（⛔ 不是全域 cdr）。行為 ./modifyCooldown.ts。
  modifyCooldown: modifyCooldownEffect,
  // 一次 RNG 抽一個加權分支（俄羅斯輪盤）。⭐ 只 draw 一次，見 ./weightedBranch.ts。
  weightedBranch: weightedBranchEffect,
  // 原子交換雙方資源（交換筆記本）。行為 ./swapResource.ts。
  swapResource: swapResourceEffect,
  // 把這次事件的數值轉成另一種資源（太陰道 / 吞噬）。行為 ./eventValueConversion.ts。
  eventValueConversion: eventValueConversionEffect,

  // ── Lane 2 (2026-08-08 覆蓋矩陣 X9 / X7 / X20) ────────────────────────────
  // 隨機落點排程（13-04 龍星群 · 70-04 千年練成）。⭐ draw 預算 = 2×count，
  // 只在施法那一刻花掉；到期走絕對 tick。⚠️ 它需要 `randomAreaSystem` 被接進
  // `SimWorld.step()` 的 7c″ 才會落地 —— 見 ./randomArea.ts 檔頭④。
  randomArea: randomAreaEffect,
  // 魔力抵傷（44-00 機警）。⛔ 不是受傷後補護盾：`manaBarrierCutFor` 在扣血之前
  // 把傷害換成扣魔。⚠️ 需要 `combat/damage.ts` 一行呼叫 —— 見 ./manaBarrier.ts 檔頭②。
  manaBarrier: manaBarrierEffect,
  // 受傷延長增益（52-01 狂戰士之怒）。⭐ 無狀態、零接線，見 ./extendBuff.ts。
  extendBuff: extendBuffEffect,

  // ── 真瞬移 (GH#301-2)。owner 推翻了 templates/expand.ts 那句「a `kind:
  //    "blink"` … deliberately was not added」。⭐ 行為**已經落地**(2026-08-09
  //    下午):同一個 tick 換座標,中間位置一格都不存在 —— 這正是它與 `leap`
  //    (`MIN_LEAP_TICKS = 2`) 的全部差別。機制在 ../movement/blink.ts,
  //    「誰移動、移到哪」在 ./blink.ts。⛔ 它已經不再丟例外。
  blink: blinkEffect,

  // ── Lane 3 (2026-08-10)：handler **已經落地**（stub 撤掉）─────────────────
  //
  // ⭐ G12【延遲序列】—— 一串排在未來 tick 的效果，目標在**施放那一刻凍住**。
  //    ⛔ 與 `randomArea` 的差別是**一句話**：那邊到期用圓心重解（走開就打空），
  //    這邊到期用凍住的名單。⚠️ 需要 `delayedSystem` 被接進 `SimWorld.step()`
  //    的 7e′（已接），見 ./delayed.ts 檔頭③。
  delayed: delayedEffect,
  // ⭐ S5【代放】—— 一支技能施放另一支技能（80-04「20% 機率使出弒鬼神」）。
  //    ⛔ `payCosts` 非 none 時走 `castAbility` 的**同一排閘**，不在 handler 裡
  //    重寫沉默／暈眩／魔力那些 if。終止性 = 深度嚴格遞增 + 有界上限。
  proxyCast: proxyCastEffect,

  // ── reserved: replace the stub module's `apply`, nothing here changes ─────
  evasion: evasionEffect, //           lane P5 — 閃避   (uses the existing Stat.Evasion)

  // ── [EX∅ 根源]（2026-08-18）：詞彙包先落地兩個槽位 ────────────────────────
  // ⚠️ 兩支 handler 目前是**空殼**（`apply` 什麼都不做，⛔ 也不 throw ——
  // 一個會丟例外的保留槽會讓一份合法的 JSON 在真的比賽裡炸掉伺服器）。
  // 它們在這裡是因為 `EffectHandlers` 是 mapped type：**少一列是 compile error**，
  // 而那正是我們要的 —— 「schema 收得下、註冊表沒有它」在這個 repo 裡不可能發生。
  carry: carryEffect, //         L4 —— 【背負】(禰豆子的木箱)
  convertTeam: mindControlEffect, // L5 —— 【陣營轉換】(大師球)
  // lane P6 — 護盾傷害類型過濾 is NOT a kind: it is `shield.absorbs`, see shield.ts
};
