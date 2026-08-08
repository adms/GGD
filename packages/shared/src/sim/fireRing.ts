/**
 * Fire ring (火圈 / 火環) — the round-pacing hazard.
 *
 * REDESIGNED (task #195, owner directive):
 *
 *   「火圈出現時間變成 戰鬥開始 60秒，而且是漸漸縮圈，只有在不斷縮小的圈圈才
 *     不會扣血，圈圈外會有激烈火焰，角色被火燒到畫面會變半透明紅，圈圈會花
 *     20秒時間縮到最小沒有生存空間」
 *
 * so the mechanic is now a BATTLE-ROYALE RING, not a global burn timer:
 *
 *   • it ignites 60 s of combat-ELAPSED time in (`startSec`, unchanged in kind
 *     — see THE TRIGGER below, nothing inverted);
 *   • from that instant the ring radius CONTRACTS CONTINUOUSLY from the zone
 *     boundary (24) — see 二段制 below for where it stops and when it resumes;
 *   • a champion whose WHOLE BODY is inside the ring takes nothing; anyone
 *     outside burns with a %-of-own-maxHealth true-damage rate read off
 *     {@link FireRingConfigLike.burnCurve} — a BREAKPOINT TABLE keyed on
 *     SECONDS SINCE IGNITION (shipped 0 s → 4 %/s, 20 s → 20 %/s, 40 s → 100 %/s,
 *     linearly interpolated, held flat past the last row) and then CLAMPED by
 *     `maxPctPerSec`, which ships at 0.5 (owner 2026-08-02 「預設最高是50%…
 *     不必到100%」) — so the curve's own tail above 50 %/s is a ceiling the
 *     operator can raise in the admin console, not what a player meets today;
 *   • at the end `minRadius - bodyRadius < 0`, so the "inside" test is false for
 *     every champion at every position — 「沒有生存空間」 falls out of the same
 *     arithmetic instead of needing a second rule.
 *
 * 二段制 —— TWO STAGES, FOUR OPERATOR NUMBERS (owner 2026-08-02):
 *
 *   「燃燒是二段制，第一段燒 20 秒就停止縮圈，起始於 60 秒；
 *     第二段燒到全地圖淹沒，起始於 90 秒」
 *   「第一、第二段燒幾秒跟起始是幾秒，也可以在後台設定」
 *
 *   t=0 ───── 60s ═════ 80s ──── 90s ═══════════► 半徑 0（全地圖淹沒）
 *             ↑起燃      ↑停止縮圈  ↑第二段起
 *
 * The four numbers are `startSec` / `shrinkSec` / `stage2StartSec` /
 * `stage2ShrinkSec`, plus `stage1Radius` (where 「停止縮圈」 stops) and
 * `minRadius` (「全地圖淹沒」 = 0). All of them are admin fields; the law that
 * reads them is {@link fireRingRadius}.
 *
 * ⚠️ WHAT THE SECOND STAGE ACTUALLY FIXES, AND WHY THE POCKET IS THE POINT.
 * The single-stage ring closed to `minRadius: 0.5`, and a champion's collision
 * radius is 0.6 (`spawnChampion.ts`). The safety predicate is WHOLE-BODY-INSIDE
 * (`inner = radius - body.radius; inner > 0 && distSq <= inner*inner`), so from
 * the instant the shrink ended there was NOWHERE on the map a body fit — 「火圈」
 * was a geometric execution on a timer, and the 20 s of closing tension ended in
 * a guaranteed wipe rather than in a fight. 二段制 makes 「停止縮圈」 mean
 * something: `stage1Radius` (4.0) is bounded STRICTLY ABOVE a body radius, so
 * the 10 s breather has a pocket in it that a player can actually hold, and only
 * 第二段 removes it. The old docstring here argued 0.5 was chosen over 0 partly
 * because 「at 0 'dist exactly 0' would be a measure-zero safe spot」 — that was
 * FALSE (with `inner > 0` in the predicate, radius 0 gives `inner = -0.6` and is
 * safe for nobody), and it is exactly the kind of self-consistent wrong reason
 * CLAUDE.md 第三守則 is about. `minRadius` now ships at 0 because owner said
 * 全地圖淹沒 and 0 is the number that says it.
 *
 * At t = 0 `inner = 23.4`, which is EXACTLY `clampToBoundary`'s
 * `boundaryRadius - body.radius`, so ignition burns nobody — the ring only
 * starts biting as it moves. (Unchanged by 二段制.)
 *
 * ⚠️ THE BURN CURVE STILL RUNS ON ONE CLOCK ACROSS BOTH STAGES, AND THAT IS NOT
 * A KNOB. Its x axis is SECONDS SINCE IGNITION and it does not reset, pause, or
 * fork at 第二段. 「停止縮圈」 is a promise about the RADIUS, not about the fire:
 * standing outside the pocket during the breather keeps costing what the curve
 * says, which is what makes the pocket worth taking. The alternatives were
 * considered and are worse in a way a reader can check: a second table would put
 * two answers on 「此刻燒多少」 (the `tauntRules.priority` drift), and re-basing
 * the clock at 第二段 would drop the rate back to 4 %/s at combat second 90 —
 * i.e. the ring would get GENTLER exactly as it floods the map, and owner's
 * 「第 100 秒 100%」 anchor would land in the wrong place.
 *
 * THE TRIGGER: `startSec` is combat-ELAPSED seconds and always was
 * (`FireRingSystem` counts up from combat entry). #195 changes its VALUE from
 * 180 to 60; it does NOT invert the client's cue derivation
 * (`apps/client/src/audio/fireRingWindow.ts` still derives
 * `combatMaxSec - startSec` seconds-LEFT). `combatMaxSec` comes down to 100
 * with it so the bed swap stays coincident with ignition and the `combat` bed's
 * B-section still gets to play.
 *
 * WHY THE BURN IS NOT SCALED BY combat-env `damageDealt`. The rate is a
 * fraction of the victim's OWN maxHealth, so it is already invariant to the
 * `maxHealth` multiplier and to every stat knob; folding `damageDealt` in would
 * turn a global tuning dial into a silent retiming of the round. The ring is
 * ROUND PACING, not combat — it must keep its 20 s clock whatever the operator
 * does to combat numbers. (It also bypasses armor/MR, shields, the damage queue
 * and kill credit — unchanged from #132, deliberately.)
 *
 * SINGLE SOURCE OF TRUTH: the ring's schedule is `config.match@1`'s
 * `match.fireRing` block. `combatMaxSec` is only the hard phase backstop and
 * must be >= `startSec + ` {@link ringFullCloseSec} (schema-enforced), so the
 * ring can always finish closing — BOTH stages — before the phase force-ends.
 *
 * 回合硬上限 — 不管什麼條件 (#248, owner 2026-08-01):
 *
 *   「時間延長太久了，不管什麼條件，每回合最長上限就是 5 分鐘出現火圈準備收場，
 *     不會無限增加時間」
 *
 * `roundHardCapSec` (300 s shipped) is a CEILING on the ignition tick, enforced
 * by {@link applyRoundHardCap} on the STATE rather than at any call site — see
 * that function for why that is the only way it can honour 「不管什麼條件」. What
 * it actually bounds is `extendRoundForBoss`, which the shipped
 * `arena-rules.json` lets fire again on every 100th zombie PER CHAMPION
 * (`boss.repeatable: true`), each time adding another 180 s to BOTH deadlines.
 * The `.max(3600)` bounds on those two knobs bound one summon; nothing bounded
 * the total until this.
 *
 * 保底 — EVERY UNIT BURNS, NOT JUST CHAMPIONS (owner 2026-07-30):
 *
 *   「火圈百分比真實傷害是所有場上玩家、bot、各種殭屍都會百分比真實傷害燒死，
 *     所以還是有個保底結果」
 *
 * #132/#195/#270 built the burn as a CHAMPION-ONLY loop (`FireRingSystem`
 * iterates `world.champion`), which was fine while a round ended on 「一隊全滅」.
 * The moment a round also waits on the field being CLEAR, one zombie wedged in a
 * corner can hold the round open forever, because nothing else in the sim is
 * guaranteed to reach it. {@link fireRingBurnMobs} closes that: the same radius,
 * the same rate, the same %-of-own-maxHealth true damage, applied to 一般殭屍 /
 * 特殊殭屍 / 殭屍王 as well. PERCENT is what makes it a backstop at all — a flat
 * number is a rounding error against a 276,944 hp king.
 *
 * Lifecycle (mirrors flowers/revives): combat-phase only. The match host arms
 * it on combat entry (`beginCombatFireRing`) and disarms it on round exit
 * (`endCombatFireRing`). The tick loop additionally gates every burn on
 * `world.combatActive`, so the instant a round SETTLES (task #100) the ring
 * stops — it is a LIVE-combat accelerator, never a post-settle grinder — and,
 * per zone, on `world.settledZones` (task #216), so a duel that finished EARLY
 * stops burning its CHAMPIONS instead of grinding them down while the other
 * zone is still fighting (that grind is what the owner saw from the shop).
 *
 * ⚠️ THE settledZones SKIP IS CHAMPION-ONLY SINCE 2026-07-30. It was written
 * when the ring only ever touched champions, so 「a settled zone does not burn」
 * and 「a settled zone does not burn PLAYERS」 were the same sentence; they are
 * not any more. {@link fireRingBurnMobs} keeps eating zombies in a settled zone
 * on purpose — the reason is written at that function, and
 * {@link isBurnedByFireRing} forks identically so the flag never outruns the
 * damage.
 *
 * PURITY: no rng, no trig, no transcendentals, no wall-clock. The radius is a
 * pure function of the tick COUNTER (never accumulated `r -= step`, which would
 * be a function of tick HISTORY and could drift), built from one subtract, one
 * divide, one multiply and one add — all IEEE-correctly-rounded, hence
 * byte-identical across replicas.
 */
import type { SimWorld } from "./SimWorld";
import type { EntityId } from "../ids";
import { distSq } from "./math/vec2";
import { applyEnvironmentalBurn } from "./combat/environmentalBurn";

/** Fire-ring rules in TICKS (converted from the config doc's seconds). */
export interface FireRingRules {
  /**
   * The ABSOLUTE combat-elapsed tick the ring ignites on — the round-length
   * knob, and (since #L1) the ring half of the ROUND CLOCK below.
   *
   * ⚠️ NOT a constant any more. `extendRoundForBoss` moves this DEADLINE
   * outward when the 殭屍王 walks in. It is still an absolute threshold
   * compared against the up-counter `world.fireRingTicks` — never a countdown
   * that gets topped up — so 「延後 180 秒」 is one add on one number and the
   * radius stays a pure function of (rules, tick). See THE ROUND CLOCK below.
   *
   * ⚠️ AND IT IS BOUNDED ABOVE by {@link hardCapTicks} since #248: every write
   * to it goes through {@link applyRoundHardCap}, so no caller — present or
   * future — can push the ring past 回合硬上限.
   */
  startTicks: number;
  /**
   * ticks 第一段 takes to contract from the zone boundary to
   * {@link stage1Radius}. (Pre-二段制 this closed all the way to `minRadius`;
   * it still does whenever stage 2 is off, because then `stage1Radius` IS
   * `minRadius` — see {@link stage1Radius}.)
   */
  shrinkTicks: number;
  /** the fully-closed radius. Below a champion's body radius, on purpose. */
  minRadius: number;

  /* ── 二段制 (owner 2026-08-02) ─────────────────────────────────────────
   *
   *   「燃燒是二段制，第一段燒 20 秒就停止縮圈，起始於 60 秒；
   *     第二段燒到全地圖淹沒，起始於 90 秒」
   *   「第一、第二段燒幾秒跟起始是幾秒，也可以在後台設定」
   *
   * Shipped timeline, all four numbers authored in `config.match.json`:
   *
   *   t=0 ───── 60s ═════ 80s ──── 90s ═══════════► 半徑 0（全地圖淹沒）
   *             ↑起燃      ↑停止縮圈  ↑第二段起
   *             └ 20 秒 ┘  └10 秒喘息┘ └── 20 秒 ──┘
   *
   * WHY THE BREATHER NEEDS A STANDABLE POCKET. Before this, the single stage
   * ran straight to `minRadius: 0.5`, which is BELOW a champion's body radius
   * (0.6) — so the moment the shrink ended, `fireRingIsSafe` was false for
   * everyone everywhere. 「火圈」 was a geometric execution, not a burn. A
   * 「停止縮圈」 phase is only meaningful if there is somewhere to stop AT, so
   * {@link stage1Radius} is a FIELD (shipped 4.0) bounded strictly above a body
   * radius, and 「站在口袋裡的人不會被燒」 is a behavioural guard, not a comment.
   *
   * ⚠️ WHY THE POCKET RADIUS IS AN EXPLICIT FIELD AND NOT DERIVED FROM
   * 「縮多久 × 速率」. Both spellings can express the shipped timeline; they rot
   * differently. A derived stop radius makes the ONE number that must stay
   * above 0.6 an EMERGENT product of two other knobs, so an operator who
   * lengthens `shrinkSec` (a pacing edit, nothing to do with geometry) silently
   * pushes the pocket under a body and restores the exact defect this redesign
   * removes — with no field to bound and no error to read. Authored explicitly,
   * the invariant is a `.min()` on the very number it constrains, checkable at
   * the instant of editing (CLAUDE.md: 「只在遠離現場的地方響的警報不是守衛」).
   * The shrink RATE is the derived quantity instead — (zoneR − stage1Radius) /
   * shrinkSec — which nothing depends on being in any particular range.
   */

  /**
   * 第一段停下來的半徑 —— the pocket the ring holds at during 「停止縮圈」.
   *
   * ⚠️ STAGE 2 OFF ⇒ THIS EQUALS {@link minRadius}, which collapses the whole
   * law below back to the pre-二段制 single ramp, tick for tick. That is how a
   * hand-built fixture / the client's prediction shadow / `MatchController`'s
   * per-round substitution — none of which author stage-2 fields — stay
   * byte-identical. See {@link fireRingRulesFromConfig}.
   */
  stage1Radius: number;
  /**
   * ticks AFTER IGNITION at which 第二段 starts closing again.
   *
   * ⚠️ A GAP, NOT AN ABSOLUTE TICK, even though the operator authors an
   * absolute combat second (`stage2StartSec: 90`). `startTicks` is NOT a
   * constant — `extendRoundForBoss` pushes it out by 180 s and
   * {@link applyRoundHardCap} pulls it back — so an absolute stage-2 tick would
   * drift out of the shape the operator drew: in a 殭屍王 round the ring would
   * ignite at 4:00 with stage 2 already 150 s in the past, i.e. it would flood
   * the map on the ignition tick. Freezing the AUTHORED GAP at arm time (30 s
   * on the shipped 60/90) makes every mover of `startTicks` move the whole ring
   * as one shape, for free. Same reasoning the burn curve's x axis already
   * uses, and the same reasoning `hardDeadlineTicks` uses for `authoredTail`.
   *
   * Floored at {@link shrinkTicks} at arm time: 第二段 can never begin before
   * 第一段 finished. The schema refines this too, but `FireRingConfigLike` is
   * also hand-built by callers that never see Zod.
   */
  stage2GapTicks: number;
  /**
   * ticks 第二段 takes to close from {@link stage1Radius} to {@link minRadius}.
   * **0 = 二段制 OFF** (the operator authored no `stage2StartSec`) — the single
   * flag for the whole feature, so 「有沒有第二段」 has exactly one answer.
   */
  stage2ShrinkTicks: number;

  /* ── THE BURN CURVE (owner 2026-08-02) ─────────────────────────────────
   *
   *   「火圈應該是隨秒數越高越燒越痛的生命百分比的真實傷害
   *     (極端情形第100秒後燒100%真實傷害=必死)」
   *
   * The burn used to be a two-point ramp (`burnPctPerSecStart` →
   * `burnPctPerSecEnd`) whose x axis was the SHRINK PROGRESS. Those two fields
   * are GONE, and the reason they had to go rather than stay as a projection is
   * that the shrink saturates: `p = min(1, ticksSinceStart / shrinkTicks)` pins
   * the rate at its end value 20 s after ignition and it never rises again, so
   * 「隨秒數越高越燒越痛」 was not expressible at all. The x axis is now
   * SECONDS SINCE IGNITION, with no upper limit tied to the shrink.
   *
   * ⚠️ SINCE IGNITION, NOT SINCE ROUND START, AND THAT IS NOT A KNOB.
   * `extendRoundForBoss` pushes `startTicks` out by `boss.delayFireRingSec`
   * (180 s shipped) and `MatchController.fireRingForRound()` swaps in
   * `ROYALE_FIRE_RING_START_SEC` (180) for the final round. A curve keyed on
   * absolute combat seconds would therefore be FULLY WALKED THROUGH before a
   * king round's ring even ignites — the first burning tick would already be
   * the terminal rate and the whole 20 s of closing tension collapses into
   * 「圈一出現，圈外的人一秒蒸發」 (measured: 1.03 s to death vs 11.60 s).
   * A decision point with exactly one non-broken value is not a decision point,
   * so there is deliberately no `burnCurveOrigin` switch. What DOES float with
   * `startSec` is the translation of the owner's 「第 100 秒」 into a row of
   * this table (shipped `startSec: 60` ⇒ the 100th second is `sec: 40`); the
   * admin page shows both clocks side by side so that stays visible.
   *
   * COMPILED, NOT INTERPRETED. Two parallel, frozen, already-monotonic arrays,
   * resolved ONCE in {@link fireRingRulesFromConfig}: `burnCurveTicks[i]` is the
   * breakpoint in TICKS since ignition, `burnCurveRates[i]` its per-second burn.
   * Parallel arrays and not an array of objects because `fireRingRatePerSec` is
   * a per-tick read and this way the scan touches no property lookups and
   * allocates nothing; frozen and pre-sorted because a Map/`Object.keys` walk
   * would make a REPLAY's damage depend on insertion order (CLAUDE.md
   * 「Map 迭代要先排序」 — here the sort is hoisted out of the hot path entirely).
   *
   * Both arrays are non-empty and the same length — invariants of the compiler.
   */

  /** breakpoint x values: TICKS since ignition, non-decreasing, `[0] >= 0`. */
  burnCurveTicks: readonly number[];
  /** breakpoint y values: per-second burn (fraction of the victim's maxHealth). */
  burnCurveRates: readonly number[];
  /**
   * hard cap on the per-second rate (fraction of maxHealth).
   * `Number.POSITIVE_INFINITY` = the config authored no cap.
   */
  maxPctPerSec: number;

  /* ── THE ROUND CLOCK (#L1) ─────────────────────────────────────────────
   *
   * owner 2026-07-30: 「殭屍王出現回合結束時間延長 3 分鐘(火圈時間也延後),
   * 除非全死不然不會提前結束,避免打到一半結果回合結束」
   *
   * WHY THE DEADLINE LIVES HERE AND NOT IN A COUNTDOWN. `PhaseMachine` runs
   * combat off `ticksLeft--`, a DECREMENTING counter; extending a round that
   * way means `ticksLeft += 5400`, which is exactly the pattern CLAUDE.md
   * forbids (「到期一律用絕對 tick,不是遞減計數器」) because two hosts that
   * decrement a different number of times disagree about when the round ends.
   * `combatMaxTicks` is the same deadline as an ABSOLUTE combat-elapsed tick,
   * compared against the very counter (`world.fireRingTicks`) the ring already
   * uses — so the two halves of 「延長 3 分鐘」 can never drift apart, and
   * extending is one add on one number rather than a re-based countdown.
   *
   * WHY ON THE RING'S RULES. `world.fireRingTicks` IS the combat-elapsed clock
   * (FireRingSystem increments it, and only while `combatActive`), and the ring
   * schedule is already armed/disarmed per combat entry by the match host. A
   * second per-combat clock would have to be armed by the same host at the same
   * moment and could then be armed at a DIFFERENT moment — which is how two
   * round timers end up disagreeing. One clock, two thresholds.
   */

  /**
   * ABSOLUTE combat-elapsed tick at which the combat phase is over — the hard
   * backstop `match.combatMaxSec` names, in the sim's own units.
   *
   * `Number.POSITIVE_INFINITY` = the caller armed the ring without telling the
   * sim the backstop (`fireRingRulesFromConfig`'s third argument omitted:
   * fixtures, the client's prediction shadow, any pre-#L1 caller). Then
   * {@link isCombatTimeUp} is false forever, i.e. the sim asserts no deadline
   * at all — byte-identical to the behaviour before #L1, where the deadline
   * existed only inside the game-server's PhaseMachine.
   */
  combatMaxTicks: number;
  /** ticks ONE 殭屍王 summon adds to `combatMaxTicks` (0 = the knob is off). */
  bossExtendTicks: number;
  /** ticks ONE 殭屍王 summon adds to `startTicks` (0 = the knob is off). */
  bossDelayTicks: number;
  /**
   * running total actually added to `combatMaxTicks` so far this combat.
   *
   * ⚠️ 「ACTUALLY」 IS LOAD-BEARING SINCE #248. This is what the host mirrors
   * onto `PhaseMachine.ticksLeft` (the countdown on the wire) and what
   * `mobBossSpawn.extendedTicks` broadcasts. Once the hard cap starts eating
   * extensions, the AUTHORED `bossExtendTicks` and the APPLIED delta stop being
   * the same number, and a countdown seeded from the authored one would show
   * the player three minutes the sim has no intention of giving.
   */
  bossExtendedTicks: number;
  /** running total actually added to `startTicks` so far this combat. */
  bossDelayedTicks: number;

  /* ── THE HARD CAP (#248) ───────────────────────────────────────────────
   *
   * owner 2026-08-01: 「時間延長太久了，不管什麼條件，每回合最長上限就是 5 分鐘
   * 出現火圈準備收場，不會無限增加時間」
   *
   * WHY A CEILING AND NOT A THIRD CLOCK. Everything that lengthens a round today
   * does it by ADDING to one of the two numbers above (`extendRoundForBoss` is
   * the only mutator, and `arena-rules.json`'s `boss.repeatable: true` at
   * `killThreshold: 100` is what makes it unbounded — 100, 200, 300 … zombies,
   * per champion, +180 s each time). A cap expressed as a CEILING ON THOSE TWO
   * NUMBERS therefore binds every such path by construction, including ones
   * written later, because the thing being capped is the state, not the caller.
   * A separate 「hard stop」 timer would have to be armed by somebody, and could
   * then be armed at the wrong moment or not at all — the exact failure the
   * ROUND CLOCK note above rejects a second clock for.
   *
   * BOTH ARE ABSOLUTE TICKS, per CLAUDE.md 「到期一律用絕對 tick」.
   */

  /**
   * Ceiling on {@link startTicks}: the ring's closing sequence begins here no
   * matter what deferred it. `Number.POSITIVE_INFINITY` = no cap authored
   * (`FireRingConfigLike.roundHardCapSec` omitted — fixtures, the client's
   * prediction shadow, any pre-#248 caller), which is byte-identical to the
   * behaviour before this field existed.
   */
  hardCapTicks: number;
  /**
   * Ceiling on {@link combatMaxTicks}. Derived ONCE at arm time as
   * `hardCapTicks + tail`, where `tail` is the gap the operator authored between
   * ignition and the backstop (`combatMaxSec - startSec`, floored at
   * `shrinkTicks`). So the cap moves the whole authored shape forward instead of
   * inventing a second 「多久之後才真的結束」 number the operator never wrote:
   * on the shipped 60/20/100 the tail is 40 s, so a capped round ignites at
   * 5:00, is fully closed at 5:20 and force-settles at 5:40.
   */
  hardDeadlineTicks: number;

  /* ── 攔截層 (GH#287) ────────────────────────────────────────────────────── */

  /**
   * 免死（帶 `lethal` 規則的具名標記，例：十二道試煉）擋不擋火圈燒傷。
   *
   * ⚠️ ABSENT ⇒ **false = 今天的行為（火圈無視免死）**，所以加上這個欄位對每一份
   * 手寫夾具、客戶端預測影子、既有錄影都是嚴格 no-op。
   *
   * ⚠️ 這是**設計決策點，等 owner 裁決**：火圈存在的理由是強制結束回合，而免死
   * 若擋得住火圈，一個帶 12 層【十二道試煉】的人可以在圈外站 12 次。兩種答案都
   * 說得通，所以它是一個欄位而不是程式裡的一個分支（CLAUDE.md 第一守則），預設
   * 選「保留今天行為」的那一個。
   *
   * ⛔ **無敵沒有對應的欄位，而那不是漏了**：內容側已經有一格
   * （`invulnerable` 的 `blocksTrueDamage`，省略時跟著 `blocksDamage:"all"`），
   * 所以「這支技能擋不擋火圈」本來就是編輯器卡片上的一個選項。再開一個全域開關
   * 會變成兩個地方回答同一個問題。
   */
  lethalSaveApplies?: boolean;
}

/**
 * One row of the burn curve: 「點燃後 `sec` 秒，每秒燒掉自身最大生命的
 * `pctPerSec`」。 `pctPerSec: 1` = 100 %/s = a full health bar in exactly one
 * second = the owner's 「必死」.
 */
export interface FireRingBurnPoint {
  /** seconds SINCE IGNITION (not since round start — see FireRingRules). */
  sec: number;
  /** per-second burn at that instant, as a fraction of the victim's maxHealth. */
  pctPerSec: number;
}

/**
 * 出貨曲線 —— THE one literal. `content/config/config.match.json` carries the
 * same three rows, `zFireRingConfig.burnCurve` uses this as its `.default()`,
 * and every hand-built fixture that omits `burnCurve` lands here too, so there
 * is exactly one answer to 「沒填的話燒多少」.
 *
 * WHY THESE THREE ROWS (owner 2026-08-02 「隨秒數越高越燒越痛…第100秒後燒
 * 100%真實傷害=必死」):
 *   · `{0, 0.04}` and `{20, 0.2}` are BIT-FOR-BIT the old two-point ramp's
 *     endpoints under the shipped `shrinkSec: 20`, so the 0–20 s stretch — the
 *     part nobody asked to change — has identical damage, tick for tick.
 *   · `{40, 1.0}` is the owner's sentence: shipped `startSec: 60` ⇒ 60 + 40 =
 *     COMBAT SECOND 100, burning 100 %/s = death in one second.
 */
export const DEFAULT_BURN_CURVE: readonly FireRingBurnPoint[] = Object.freeze([
  Object.freeze({ sec: 0, pctPerSec: 0.04 }),
  Object.freeze({ sec: 20, pctPerSec: 0.2 }),
  Object.freeze({ sec: 40, pctPerSec: 1 }),
]);

/**
 * 每秒燒傷的天花板（佔最大生命），出貨值 —— THE one literal, same rule as
 * {@link DEFAULT_BURN_CURVE}. owner 2026-08-02:
 *
 *   「可以把燃燒真傷上限數值設定放在後台，例如預設最高是50%之類，不必到100%」
 *
 * `content/config/config.match.json` carries this number, `zFireRingConfig`
 * uses it as the `.default()`, and `fireRingRulesFromConfig` fills it in for
 * every hand-built fixture — so there is exactly one answer to 「沒填的話上限
 * 是多少」.
 *
 * ⚠️ WHY ABSENT ⇒ THIS AND NOT `Infinity` (this is the DECISION POINT). Before
 * 2026-08-02 an omitted cap resolved to `Number.POSITIVE_INFINITY` — 「沒填 =
 * 完全不設限」 — while the Zod field bounded the same knob at 2. Two layers, two
 * different answers, infinitely far apart, and the divergence was INVISIBLE:
 * every doc that goes through the loader carries the field, so only the paths
 * that skip Zod (fixtures, `MatchController`'s per-round substitutions, the
 * admin preview when the box is blank) ever saw the `Infinity` branch, and they
 * saw it silently. The project's convention is 「缺文件＝出貨預設，不是空表」
 * (`sim/stealth.ts` returns `DEFAULT_STEALTH_RULES` for a missing doc, and
 * `compileBurnCurve` two functions up returns `DEFAULT_BURN_CURVE` for a
 * missing table); a missing CAP now follows the same rule. The cost of the
 * other choice is asymmetric: 「忘了填 → 沒有上限」 is a one-second wipe nobody
 * authored, 「忘了填 → 50 %/s」 is the shipped experience.
 *
 * An operator who genuinely wants the curve to speak for itself sets this to
 * `1` (= 一秒滿血變空), which is the Zod maximum — there is no longer any
 * setting that means 「無限」, on purpose: above 1 the number cannot change what
 * any player sees.
 */
export const DEFAULT_MAX_PCT_PER_SEC = 0.5;

/**
 * 第一段停下來的半徑，出貨值 —— the pocket the ring holds at between the two
 * stages. THE one literal (schema `.default()` + the sim's `??` both point here).
 *
 * WHY 4.0 AND NOT SOMETHING SMALLER. It has to clear a champion's collision
 * radius (0.6, `spawnChampion.ts`) by enough that the pocket is a PLACE and not
 * a pixel: `fireRingIsSafe` is whole-body-inside, so the standable disc is
 * `4.0 − 0.6 = 3.4` across the radius, which holds a 3v3 shoulder-to-shoulder
 * and still forces contact — that is the 「口袋」 the 10-second breather is for.
 * Below ~1.2 the arithmetic still 「works」 while the breather means nothing,
 * which is why the schema floors this at 1 rather than at 0.6 + ε.
 *
 * NOT a hard-coded fraction of the zone boundary (24), on purpose: `arena.royale`
 * ships a 42-radius zone, and a fraction would silently make the pocket 1.75×
 * bigger there — a pacing change nobody authored, in one arena, invisible.
 */
export const DEFAULT_STAGE1_RADIUS = 4;

/**
 * 第二段縮多久，出貨值（秒）—— used when the operator authored a
 * `stage2StartSec` but left the duration blank. Mirrors 第一段's shipped 20 s,
 * because owner named 20 for the first stage and named no number for the
 * second; a duration that reads the same as the one he DID name is the least
 * surprising blank-box answer, and it is a field, so it costs one edit to move.
 */
export const DEFAULT_STAGE2_SHRINK_SEC = 20;

/**
 * 免死擋不擋火圈燒傷，出貨值 (GH#287) —— THE one literal, same rule as
 * {@link DEFAULT_MAX_PCT_PER_SEC}: `content/config/config.match.json` 帶這個值，
 * `zFireRingConfig.lethalSaveApplies` 用它當 `.default()`，
 * `fireRingRulesFromConfig` 的 `??` 也指這裡 —— 三層對「沒填的話擋不擋」只有一個答案。
 *
 * ⚠️ **false = 今天的行為（火圈無視免死）**，而這是一個 owner 還沒表態的**決策點**，
 * 所以預設選的是「保留現況」的那一個（CLAUDE.md 第一守則）。推導寫在
 * {@link FireRingRules.lethalSaveApplies}。
 */
export const DEFAULT_LETHAL_SAVE_APPLIES = false;

/** Seconds-based fire-ring config (mirror of config.match@1 `match.fireRing`). */
export interface FireRingConfigLike {
  /** 第一段起始 —— combat-elapsed seconds until the ring ignites. */
  startSec: number;
  /** 第一段縮多久 —— seconds to contract from the zone boundary. */
  shrinkSec?: number;
  /**
   * 第一段停下來的半徑 (二段制). ABSENT ⇒ {@link minRadius}, i.e. 第一段 closes
   * all the way and there is no pocket — the pre-二段制 shape.
   */
  stage1Radius?: number;
  /**
   * 第二段起始 —— the ABSOLUTE combat-elapsed second 第二段 starts closing at
   * (owner's 90). Compiled into a gap from ignition; see
   * {@link FireRingRules.stage2GapTicks} for why it cannot stay absolute.
   *
   * ⚠️ ABSENT ⇒ **二段制 OFF**: one stage, closing straight to `minRadius`,
   * byte-identical to every recorded replay taken before this existed. This is
   * the ONE fact that makes the change safe to deploy over a durable admin
   * overlay that still holds a pre-二段制 `config.match` (see the schema's
   * matching note): such a doc keeps parsing AND keeps playing the ring it was
   * authored for, instead of being rejected — and a rejected overlay doc does
   * not fail-safe itself, it discards THE WHOLE OVERLAY LAYER
   * (`apps/platform/internal/contentoverlay/validate.go` documents that blast
   * radius). The cost of the choice is stated where an operator can act on it:
   * the admin console shows the two stage-2 boxes blank and says 「留白 = 只有
   * 第一段」.
   */
  stage2StartSec?: number;
  /**
   * 第二段縮多久 —— seconds 第二段 takes to reach `minRadius`. Only consulted
   * when `stage2StartSec` is authored; ABSENT ⇒ {@link DEFAULT_STAGE2_SHRINK_SEC}.
   */
  stage2ShrinkSec?: number;
  /**
   * 全地圖淹沒 —— the terminal radius. Ships at 0 since 二段制: the second stage
   * is 「燒到全地圖淹沒」, and 0 is the only number that says so without a reader
   * having to know that 0.5 happens to be under a body radius.
   */
  minRadius?: number;
  /**
   * The burn curve in SECONDS SINCE IGNITION. ABSENT ⇒ {@link DEFAULT_BURN_CURVE}
   * — same convention the two retired `burnPctPerSec*` knobs had (`?? 0.04`,
   * `?? 0.2`), so a hand-built fixture keeps burning without authoring a table.
   */
  burnCurve?: readonly FireRingBurnPoint[];
  /**
   * Ceiling on the per-second burn (fraction of maxHealth). ABSENT ⇒
   * {@link DEFAULT_MAX_PCT_PER_SEC} (0.5), NOT 「uncapped」 — see that constant
   * for why the old `Infinity` fallback was a drift and not a feature.
   */
  maxPctPerSec?: number;
  /**
   * 殭屍王在場時的回合延長 (#L1) — mirror of `match.fireRing.boss`.
   *
   * It rides INSIDE the ring block, not beside it, for one reason: the match
   * host resolves `match.fireRing` (`resolveFireRing()`) and hands exactly that
   * object to `fireRingRulesFromConfig`. A sibling block would need a second
   * channel through the host, and a knob that needs new plumbing before it does
   * anything is a knob the operator can turn with no effect.
   *
   * ABSENT ⇒ both 0 ⇒ a king changes nothing, the pre-#L1 behaviour.
   */
  boss?: {
    /** seconds added to the combat deadline per summon (owner: 180) */
    extendCombatSec?: number;
    /** seconds the ring's ignition is pushed back per summon (owner: 180) */
    delayFireRingSec?: number;
  };
  /**
   * 回合硬上限 (#248) — the combat-elapsed second the ring's closing sequence
   * begins at NO MATTER WHAT. Mirror of `match.fireRing.roundHardCapSec`.
   *
   * ABSENT ⇒ NO CAP, deliberately asymmetric with the schema's `.default(300)`,
   * exactly like `boss` above and for the same reason: a doc that went through
   * the loader always has one, while a hand-built fixture or the client's
   * prediction shadow stays byte-identical to pre-#248.
   */
  roundHardCapSec?: number;
  /**
   * 免死擋不擋火圈燒傷 (GH#287). ABSENT ⇒ {@link DEFAULT_LETHAL_SAVE_APPLIES}
   * （false ＝今天的行為，火圈無視免死），所以每一份手寫夾具、客戶端預測影子與
   * 既有錄影逐位元不變。完整推導與「等 owner 裁決」的標記寫在
   * {@link FireRingRules.lethalSaveApplies}。
   *
   * ⭐ 三個住處都到齊了（CLAUDE.md 第一守則）：`content/config/config.match.json`
   * 的出貨值 · `content/schema/config.ts` 的 `zFireRingConfig` + `.default()` ·
   * `apps/admin/src/matchConfig.ts` 的欄位說明與「火圈」分組。
   * ⚠️ 這句話在 2026-08-08 當天有過一個中間版本寫著「只有 sim 這一層讀得到它，
   * 後台還沒有這一格」—— 那是寫在後台那一格落地**之前**的。留這一行是因為一個
   * 只住在 sim 裡的「可切旋鈕」等於不存在：owner 切不到，而它的整個存在理由就是
   * 讓 owner 可以切。
   */
  lethalSaveApplies?: boolean;
}

/**
 * 「一個火圈從點燃到完全收攏，總共要幾秒」 —— THE one formula, in SECONDS,
 * shared by the sim (`fireRingRulesFromConfig`'s deadline tail), the Zod
 * cross-field refines, and the admin console's labels.
 *
 * ⚠️ IT EXISTS BECAUSE THE ANSWER CHANGED SHAPE. Before 二段制 it was literally
 * `shrinkSec`, and that literal was written out by hand in FOUR refines plus
 * the sim. Leaving four hand-written copies to be re-derived is how
 * 「startSec + shrinkSec」 survives in a refine that is supposed to bound the
 * WHOLE ring and quietly starts letting a 110-second ring through a 100-second
 * backstop (failure mode ④: the assertion no longer points at the defect).
 *
 * 二段制 OFF (`stage2StartSec` absent) ⇒ `shrinkSec`, exactly as before.
 */
export function ringFullCloseSec(cfg: FireRingConfigLike): number {
  const shrink = cfg.shrinkSec ?? 20;
  if (cfg.stage2StartSec === undefined) return shrink;
  // The authored gap, floored so a mis-authored 「第二段比第一段早」 cannot make
  // the WHOLE ring look SHORTER than one stage — the refine that rejects it
  // must not be fed a number this function already flattered.
  const gap = Math.max(shrink, cfg.stage2StartSec - cfg.startSec);
  return gap + (cfg.stage2ShrinkSec ?? DEFAULT_STAGE2_SHRINK_SEC);
}

/**
 * Compile the authored seconds-domain burn curve into the two frozen,
 * tick-domain, already-monotonic arrays {@link fireRingRatePerSec} reads.
 *
 * Runs ONCE per combat entry. Everything expensive or order-sensitive about a
 * table lookup — the seconds→ticks division, the monotonicity, the freezing —
 * happens here so the per-tick path is a bounded scan over ≤ 8 numbers with no
 * allocation, no division by `dt` and no iteration whose order could differ
 * between two replicas.
 *
 * THREE DEFENCES, and each one is a real failure this function has to absorb
 * because `FireRingConfigLike` is ALSO hand-built by fixtures and by
 * `MatchController`'s per-round substitutions, which never see Zod:
 *
 *   · EMPTY / MISSING table ⇒ {@link DEFAULT_BURN_CURVE}. An empty array would
 *     otherwise make the lookup read `xs[0]` of nothing and burn `NaN` hp —
 *     which silently sets every health bar to NaN rather than throwing.
 *   · NON-MONOTONIC ticks ⇒ clamped to the previous breakpoint. The schema
 *     already rejects an out-of-order table, but rounding can also collide two
 *     distinct authored seconds onto one tick (`sec: 0.01` at 30 Hz). The
 *     lookup treats a zero-width segment as a STEP rather than dividing by 0
 *     (→ ±Infinity %/s), so a collision is harmless instead of lethal.
 *   · NEGATIVE rates ⇒ 0. A negative burn is a heal from an environmental
 *     hazard; the ring is a backstop and must never hand HP back.
 */
function compileBurnCurve(
  curve: readonly FireRingBurnPoint[] | undefined,
  dt: number,
): { ticks: readonly number[]; rates: readonly number[] } {
  const src = curve !== undefined && curve.length > 0 ? curve : DEFAULT_BURN_CURVE;
  const ticks: number[] = [];
  const rates: number[] = [];
  for (const p of src) {
    let t = Math.max(0, Math.round(p.sec / dt));
    const prev = ticks.length > 0 ? ticks[ticks.length - 1]! : -1;
    if (t < prev) t = prev;
    ticks.push(t);
    rates.push(p.pctPerSec > 0 ? p.pctPerSec : 0);
  }
  return { ticks: Object.freeze(ticks), rates: Object.freeze(rates) };
}

/**
 * Convert the seconds-based config block into tick-based sim rules. The
 * seconds→ticks conversion happens ONCE, here, at arm time — never per tick, so
 * no per-tick division can round differently on a different host.
 *
 * `combatMaxSec` is `config.match@1`'s `match.combatMaxSec`, passed in rather
 * than mirrored into the ring block: the doc must keep exactly one home for
 * that number (the schema's own refine already couples them). Omit it and the
 * sim simply asserts no deadline — see {@link FireRingRules.combatMaxTicks}.
 */
export function fireRingRulesFromConfig(
  cfg: FireRingConfigLike,
  dt: number,
  combatMaxSec?: number,
): FireRingRules {
  // Seconds→ticks for the two extension knobs. `Math.max(0, …)` and not
  // `Math.max(1, …)`: 0 seconds must mean 「這個開關關掉」, and a phase-minimum
  // of one tick would turn 「不要延長」 into 「延長一格」.
  const extTicks = (sec: number | undefined): number =>
    sec === undefined || !(sec > 0) ? 0 : Math.round(sec / dt);
  const startTicks = Math.max(0, Math.round(cfg.startSec / dt));
  const shrinkTicks = Math.max(1, Math.round((cfg.shrinkSec ?? 20) / dt));
  const minRadius = cfg.minRadius ?? 0.5;
  // ── 二段制, resolved ONCE (owner 2026-08-02) ─────────────────────────────
  // `stage2StartSec` absent is THE off switch, and it is checked here rather
  // than in three consumers so 「有沒有第二段」 has one answer. Off ⇒
  // stage1Radius = minRadius and stage2ShrinkTicks = 0, which makes the shrink
  // law below degenerate to the pre-二段制 single ramp with no branch of its own
  // (see `fireRingRadius`) — that is what keeps every existing fixture and every
  // recorded replay digest bit-identical.
  const twoStage = cfg.stage2StartSec !== undefined;
  const stage1Radius = twoStage ? (cfg.stage1Radius ?? DEFAULT_STAGE1_RADIUS) : minRadius;
  // Seconds→ticks for the gap, NOT for an absolute stage-2 tick — see
  // FireRingRules.stage2GapTicks for why an absolute tick cannot survive
  // `extendRoundForBoss`. Floored at `shrinkTicks`: 第二段 never starts before
  // 第一段 stopped. (The schema refines the same thing at author time; this is
  // the belt for the Zod-free callers, and it is the number the law reads.)
  const stage2GapTicks = twoStage
    ? Math.max(shrinkTicks, Math.round((cfg.stage2StartSec! - cfg.startSec) / dt))
    : shrinkTicks;
  const stage2ShrinkTicks = twoStage
    ? Math.max(1, Math.round((cfg.stage2ShrinkSec ?? DEFAULT_STAGE2_SHRINK_SEC) / dt))
    : 0;
  const combatMaxTicks =
    combatMaxSec === undefined || !Number.isFinite(combatMaxSec) || combatMaxSec <= 0
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.round(combatMaxSec / dt));
  // #248 — the two ceilings, resolved ONCE here so no per-tick arithmetic can
  // round them differently on a different host (same rule as the two above).
  const hardCapTicks =
    cfg.roundHardCapSec === undefined ||
    !Number.isFinite(cfg.roundHardCapSec) ||
    cfg.roundHardCapSec <= 0
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.round(cfg.roundHardCapSec / dt));
  // The tail the operator authored between ignition and the backstop. Floored at
  // one full close so a cap can never force-end combat with the ring still
  // shrinking — the promise is 「出現火圈準備收場」, and a 收場 nobody gets to see
  // is failure mode ① one layer up.
  //
  // ⚠️ THE FLOOR IS THE WHOLE RING, NOT 第一段. Under 二段制 the ring is still
  // closing 50 s after ignition on the shipped numbers; flooring at `shrinkTicks`
  // (20 s) would let a capped round force-end with the second stage half shut,
  // i.e. the promised 收場 never drawn — the exact ① this floor exists to stop.
  const fullCloseTicks = stage2GapTicks + stage2ShrinkTicks;
  const authoredTail = Number.isFinite(combatMaxTicks)
    ? Math.max(fullCloseTicks, combatMaxTicks - startTicks)
    : fullCloseTicks;
  const burn = compileBurnCurve(cfg.burnCurve, dt);
  const rules: FireRingRules = {
    startTicks,
    shrinkTicks,
    minRadius,
    stage1Radius,
    stage2GapTicks,
    stage2ShrinkTicks,
    burnCurveTicks: burn.ticks,
    burnCurveRates: burn.rates,
    // ABSENT CAP = THE SHIPPED CAP (owner 2026-08-02 「預設最高是50%…不必到
    // 100%」). This line has now held three different answers — `1e9`, then
    // `Infinity`, now the shipped default — and the first two were both wrong
    // in the same way: they answered 「上限是多少」 differently from the Zod field
    // that bounds the very same knob, and nothing could see the disagreement
    // because only the Zod-free callers (fixtures, MatchController's per-round
    // substitutions, the admin preview with a blank box) reach this `??`.
    // {@link DEFAULT_MAX_PCT_PER_SEC} is now the ONLY literal, referenced by
    // both layers. (CLAUDE.md: 只能有一個地方回答一個問題.)
    maxPctPerSec: cfg.maxPctPerSec ?? DEFAULT_MAX_PCT_PER_SEC,
    combatMaxTicks,
    bossExtendTicks: extTicks(cfg.boss?.extendCombatSec),
    bossDelayTicks: extTicks(cfg.boss?.delayFireRingSec),
    bossExtendedTicks: 0,
    bossDelayedTicks: 0,
    hardCapTicks,
    hardDeadlineTicks: Number.isFinite(hardCapTicks)
      ? hardCapTicks + authoredTail
      : Number.POSITIVE_INFINITY,
    // GH#287 —— ⭐ 這一行就是「後台那一格 → sim」的接線。ABSENT ⇒
    // `DEFAULT_LETHAL_SAVE_APPLIES`（false ⇒ 火圈無視免死 = 今天的行為）。
    // 指常數而不是寫字面值,理由與 `maxPctPerSec` 那一段相同:Zod 的 `.default()`
    // 與這個 `??` 必須是同一個答案,而只有 Zod-free 的呼叫端(夾具 / 預測影子 /
    // 後台預覽)會走到這個 `??`。
    // 守衛:`fireRingLethalSaveConfig.test.ts`(刪掉這一行 → 後台開了也不生效 → 紅)。
    lethalSaveApplies: cfg.lethalSaveApplies ?? DEFAULT_LETHAL_SAVE_APPLIES,
  };
  // Arm-time clamp. A no-op on any doc the schema validated (its refine already
  // requires `startSec + shrinkSec <= roundHardCapSec`), but `FireRingConfigLike`
  // is also hand-built by fixtures and by the MatchController's per-round
  // substitutions — and 「不管什麼條件」 has to include 「the round started that
  // way」, not only 「something extended it」.
  applyRoundHardCap(rules);
  return rules;
}

/**
 * 回合硬上限 (#248) — clamp both round deadlines back under the cap. IDEMPOTENT
 * and total: it reads only `rules`, so calling it after ANY mutation of
 * `startTicks` / `combatMaxTicks` restores the invariant.
 *
 * owner 2026-08-01: 「不管什麼條件，每回合最長上限就是 5 分鐘出現火圈準備收場，
 * 不會無限增加時間」
 *
 * ⚠️ THIS IS THE ONLY PLACE THE CAP IS ENFORCED, ON PURPOSE. `startTicks` is
 * read directly by four consumers (`fireRingSystem`, `fireRingBurnMobs`,
 * `currentFireRingRadius`, `isBurnedByFireRing`) plus two accessors. Clamping
 * the STATE at write time keeps all six correct with no second copy of the rule;
 * clamping at READ time would need six identical edits and the first one missed
 * would put the client's flame on a different clock from the damage — the exact
 * drift the #216 note above spent a paragraph avoiding.
 *
 * NO CAP AUTHORED ⇒ IMMEDIATE RETURN, so a fixture / prediction-shadow world is
 * byte-identical to pre-#248 and every existing recorded digest still replays.
 *
 * ⚠️ 「A CAPPED ROUND ALWAYS FINISHES CLOSING」 IS AN INVARIANT OF THE TWO
 * CEILINGS, NOT A THIRD CLAMP. `hardDeadlineTicks - hardCapTicks` is the
 * authored tail, which `fireRingRulesFromConfig` floors at `shrinkTicks`. So:
 *
 *   · both clamps fire  → gap = authoredTail            >= shrinkTicks ✔
 *   · only the deadline → gap = hardDeadline - startTicks, and startTicks is
 *                         already <= hardCapTicks, so gap >= authoredTail   ✔
 *   · neither fires     → nothing changed; whatever gap the config had is the
 *                         pre-#248 behaviour, not this feature's business    ✔
 *
 * An extra `startTicks = min(startTicks, combatMaxTicks - shrinkTicks)` line
 * was written here first and then DELETED: against `hardDeadlineTicks` it can
 * never fire (proof above), and against the AUTHORED deadline it fires only on
 * a config the schema already rejects (`startSec + shrinkSec > combatMaxSec`) —
 * where it would silently re-time a deliberately degenerate fixture and pretend
 * to have fixed an authoring bug. A guard that cannot fire is a comment
 * pretending to be code (CLAUDE.md 第三守則).
 *
 * PURITY: two comparisons and two assignments. No rng, no clock, no iteration.
 */
export function applyRoundHardCap(rules: FireRingRules): void {
  if (!Number.isFinite(rules.hardCapTicks)) return;
  if (rules.combatMaxTicks > rules.hardDeadlineTicks) {
    rules.combatMaxTicks = rules.hardDeadlineTicks;
  }
  if (rules.startTicks > rules.hardCapTicks) rules.startTicks = rules.hardCapTicks;
}

/**
 * THE 殭屍王 ROUND EXTENSION (#L1). Called from `summonMobBoss` — the one place
 * a king actually enters the world — the instant the king is spawned.
 *
 * Moves BOTH deadlines outward by the authored amounts:
 *   • `combatMaxTicks += bossExtendTicks`  ── 「回合結束時間延長 3 分鐘」
 *   • `startTicks     += bossDelayTicks`   ── 「火圈時間也延後」
 *
 * BOTH, ALWAYS, TOGETHER. Extending only the phase would leave the ring closing
 * on its original schedule, so the king fight would still end with everyone
 * burned out of the arena — which is the exact 「打到一半結果回合結束」 the
 * owner asked to stop. Delaying only the ring would run the round into the hard
 * backstop instead. They are one instruction and this is the one function.
 *
 * IF THE RING HAS ALREADY IGNITED it RE-OPENS: `startTicks` moves past
 * `world.fireRingTicks`, so `fireRingRadius` is asked for a negative
 * `ticksSinceStart` and returns the full zone boundary again, FireRingSystem
 * goes dormant, and `isBurnedByFireRing` reports false — all three off the same
 * comparison, so no consumer can disagree with another. That is deliberate: the
 * king is a 100-kill payoff and the owner's rule is that it must be fightable,
 * not that the fire keeps its place in the queue. The visible cost is a radius
 * pop and a second `fireRingStart` beat when the delayed ignition comes round;
 * both are honest 「火圈延後了」 signals.
 *
 * Returns the ticks ADDED to the combat deadline this call (0 when the ring is
 * disarmed or both knobs are 0), so the caller can put the real number on the
 * wire instead of re-deriving it from config.
 *
 * PURITY: two adds on two numbers, no rng, no clock, no iteration order.
 */
export function extendRoundForBoss(world: SimWorld): number {
  const rules = world.fireRingRules;
  // No armed ring ⇒ no combat-elapsed clock to hang a deadline on. The knob is
  // authored inside the ring block precisely so this can never be a silent
  // half-state: no ring, no round clock, no extension.
  if (!rules || world.fireRingTicks < 0) return 0;
  const extend = rules.bossExtendTicks;
  const delay = rules.bossDelayTicks;
  if (extend <= 0 && delay <= 0) return 0;

  // ⛔ THE HALF-STATE GATE. `combatMaxTicks` is `Infinity` whenever the host
  // armed the ring WITHOUT a backstop — which is what ships today:
  // `MatchController` calls `fireRingRulesFromConfig(ring, dt)` with TWO args,
  // so the deadline that actually force-ends combat is `PhaseMachine.ticksLeft`
  // (100 s × 30 Hz = 3000 ticks) and nothing here can move it.
  //
  // Applying only the delay in that world is STRICTLY WORSE THAN NOT APPLYING
  // ANYTHING: ignition slides 1800 → 7200 while the round still ends at 3000,
  // so summoning a 殭屍王 does not extend the round — it SILENTLY CANCELS THE
  // FIRE RING for the whole round. That also removes the 保底 that
  // `fireRingBurnMobs` provides, in exactly the rounds a ~276k-HP king is up.
  // Measured on the shipped 2-arg wiring at the last combat tick (2999):
  // with a king `radius = 24.0` (full boundary) and `burning = false`;
  // without one `radius = 0.5`, `burning = true`.
  //
  // So: no enforceable deadline ⇒ no delay either. Both halves or neither —
  // which is what this function's own contract said all along, and what the
  // previous revision violated. Once the host passes `combatMaxSec` through,
  // this gate opens on its own and both halves apply. Do NOT "fix" this by
  // deleting the guard; fix the host wiring (see the 3-arg overload).
  if (!Number.isFinite(rules.combatMaxTicks)) return 0;

  // #248 — APPLY, THEN CAP, THEN BOOK WHAT SURVIVED. The running totals and the
  // return value are measured as DELTAS across the clamp, never taken from the
  // authored knobs, because the host mirrors this number onto the player's
  // round countdown (`MatchController.combatTimeUp`) and `summonMobBoss` puts it
  // on the wire as 「回合延長 N 秒」. Booking the authored 180 while the cap gave
  // 60 would be a countdown the player can catch out with a stopwatch — the
  // same lie the 「read the REAL number back out」 note in mobs.ts already names.
  const startBefore = rules.startTicks;
  const deadlineBefore = rules.combatMaxTicks;
  rules.startTicks += delay;
  rules.combatMaxTicks += extend;
  applyRoundHardCap(rules);
  const appliedDelay = rules.startTicks - startBefore;
  const appliedExtend = rules.combatMaxTicks - deadlineBefore;
  rules.bossDelayedTicks += appliedDelay;
  rules.bossExtendedTicks += appliedExtend;
  return appliedExtend;
}

/**
 * The ignition tick IN FORCE right now — post-extension, which is the whole
 * point: a consumer that reads `match.fireRing.startSec` off the config doc is
 * reading the value the round STARTED with, not the one the ring will actually
 * fire on. -1 when the ring is disarmed.
 */
export function fireRingIgnitionTick(world: SimWorld): number {
  const rules = world.fireRingRules;
  return rules && world.fireRingTicks >= 0 ? rules.startTicks : -1;
}

/**
 * The combat deadline IN FORCE right now, as an absolute combat-elapsed tick —
 * post-extension. `Number.POSITIVE_INFINITY` when the ring is disarmed or the
 * host armed it without a backstop (see {@link FireRingRules.combatMaxTicks}).
 */
export function combatDeadlineTick(world: SimWorld): number {
  const rules = world.fireRingRules;
  return rules && world.fireRingTicks >= 0 ? rules.combatMaxTicks : Number.POSITIVE_INFINITY;
}

/**
 * Has the combat phase run out of time? THE predicate a match host should
 * force-end combat on, replacing a `ticksLeft--` countdown: it is absolute, it
 * is the same clock the ring reads, and it already accounts for every 殭屍王
 * extension applied this round.
 *
 * 「除非全死不然不會提前結束」 — the OTHER half of the owner's instruction — is
 * the host's early-settle path (`concludeCombat` / `settledZones`), which this
 * predicate deliberately says nothing about: a round can still end the instant
 * one side is wiped. This only governs the TIMER.
 */
export function isCombatTimeUp(world: SimWorld): boolean {
  return world.fireRingTicks >= combatDeadlineTick(world);
}

/**
 * How many ticks the 殭屍王 has pushed this round's deadline out by, total.
 * The number a HUD should show as 「回合延長 N 秒」 — read off the live rules,
 * never recomputed from config, so it cannot claim an extension that a disarmed
 * or knob-off ring never applied.
 */
export function bossRoundExtensionTicks(world: SimWorld): number {
  const rules = world.fireRingRules;
  return rules && world.fireRingTicks >= 0 ? rules.bossExtendedTicks : 0;
}

/**
 * THE SHRINK LAW, 二段制 (owner 2026-08-02). Ring radius `ticksSinceStart` ticks
 * past ignition:
 *
 *   ┌ t <= 0                    │ zoneRadius            (dormant / ignition tick)
 *   ├ 0 < t < shrinkTicks       │ zoneRadius → stage1Radius   第一段, linear
 *   ├ shrinkTicks <= t <= gap   │ stage1Radius          ⟵ 「停止縮圈」, the pocket
 *   ├ gap < t < gap+stage2      │ stage1Radius → minRadius    第二段, linear
 *   └ t >= gap + stage2Shrink   │ minRadius             全地圖淹沒, clamped
 *
 * THE HOLD IS THE FEATURE, and it is a hold in the ARITHMETIC rather than a
 * flag: between the two ramps there is no term that varies with `t`, so
 * 「80–90 秒之間半徑一格都不動」 is not a behaviour anyone has to remember to
 * preserve. A guard steps a real world across that window and reads the radius
 * back, because 「有一段時間不縮」 is precisely the kind of claim a property test
 * over (monotone, ends at 0) would pass while the hold was deleted (⑦).
 *
 * 二段制 OFF ⇒ `stage1Radius === minRadius` and `stage2ShrinkTicks === 0`, so
 * branch 2 returns `minRadius` and branch 3/4 are unreachable: the function is
 * the pre-二段制 one-ramp law, value for value, with no `if (twoStage)` anywhere.
 *
 * `zoneRadius` is the ZONE's `boundaryRadius` — arena geometry, NOT an ability
 * radius, so it is deliberately not multiplied by `combatEnv.abilityRange`.
 *
 * Pure and monotonic non-increasing, with no transcendentals: an eased curve
 * (pow/exp) is the one thing that would pass the purity gate today and still be
 * genuinely platform-variable. Both ramps are a function of the tick COUNTER,
 * never of tick history, so a replica that joins mid-round agrees exactly.
 */
export function fireRingRadius(
  rules: FireRingRules,
  ticksSinceStart: number,
  zoneRadius: number,
): number {
  if (ticksSinceStart <= 0) return zoneRadius;
  if (ticksSinceStart < rules.shrinkTicks) {
    const p = ticksSinceStart / rules.shrinkTicks;
    return zoneRadius + (rules.stage1Radius - zoneRadius) * p;
  }
  const sinceStage2 = ticksSinceStart - rules.stage2GapTicks;
  // 「停止縮圈」 — and, with stage 2 off, the permanent end state (= minRadius).
  if (sinceStage2 <= 0 || rules.stage2ShrinkTicks <= 0) return rules.stage1Radius;
  const k = sinceStage2 < rules.stage2ShrinkTicks ? sinceStage2 : rules.stage2ShrinkTicks;
  return rules.stage1Radius + (rules.minRadius - rules.stage1Radius) * (k / rules.stage2ShrinkTicks);
}

/**
 * The safety predicate: is a body of radius `bodyRadius`, sitting
 * `distSqToCenter` (SQUARED) from the zone centre, WHOLLY inside a ring of
 * `radius`?
 *
 * `inner <= 0` is the fully-closed case — false for everyone, no special case,
 * which is literally 「沒有生存空間」. The comparison is exact (`<=`) on both
 * replicas: no hysteresis, because hysteresis would make the answer depend on
 * history rather than on the tick.
 */
export function fireRingIsSafe(
  radius: number,
  bodyRadius: number,
  distSqToCenter: number,
): boolean {
  const inner = radius - bodyRadius;
  return inner > 0 && distSqToCenter <= inner * inner;
}

/**
 * The per-SECOND burn rate (fraction of a victim's maxHealth) at
 * `ticksSinceStart` ticks past ignition — for anything OUTSIDE the ring.
 *
 * Reads the compiled breakpoint table (see {@link FireRingRules}), linearly
 * interpolated between rows, FLAT before the first row and FLAT after the last.
 *
 * ⚠️ HELD FLAT PAST THE LAST ROW, ON PURPOSE — there is no 「keep extrapolating
 * the final slope」 switch. Under the shipped table the last row IS 100 %/s and
 * the cap IS 1, so hold and extrapolate produce byte-identical damage: the
 * switch would be a knob the operator can turn with no effect (failure mode ②)
 * everywhere except configs it did not ship with. What an operator actually
 * wants — a steeper or longer tail — is another ROW, which the table already
 * takes (up to 8) and which says what it does instead of implying it.
 *
 * ── WHAT THE SHIPPED CURVE ACTUALLY DOES ──────────────────────────────────
 * Numbers below are MEASURED by stepping a real `SimWorld` at 30 Hz with a
 * 1,242 hp champion parked outside the ring, not integrated on paper; the guard
 * is `fireRingBurnCurve.test.ts`, which pins the death TICK.
 *
 *   · rate at t = 0 / 10 / 20 / 30 / 40 s → 4 / 12 / 20 / 60 / 100 %/s
 *   · step out AT IGNITION and never come back → dead 351 ticks later, t =
 *     11.700 s, i.e. combat second 71.700 on the shipped `startSec: 60`.
 *     ⚠️ That tick is UNCHANGED from the retired two-point ramp (also 2151):
 *     the whole 0–20 s stretch has bit-identical damage, so this redesign costs
 *     the 「點燃就往外跑」 player exactly nothing.
 *   · a 3-second panic detour AT IGNITION costs 15.6 % of your health bar
 *     (∫₀³(0.04 + 0.008t)dt = 0.156 exactly; 15.56 % summing the 90 real ticks).
 *     ⚠️ The docstring that used to live here said 「~13 %」 — it was wrong
 *     BEFORE this change too, and wrong in shape as well as in value, because
 *     the cost is not a constant: the same 3 seconds cost 39.6 % starting at
 *     t = 10 and 77.8 % starting at t = 20 (measured, this curve).
 *   · ⚠️ THE TAIL IS NOW SOMETHING A PLAYER LIVES TO MEET, and 二段制 is what
 *     changed that. Under the single stage the ring closed to `minRadius: 0.5`
 *     — under a body radius — at t = 19.933 s, so the last possible survivor
 *     (full hp, zone centre, never attacked) was dead at t = 23.633 s, sixteen
 *     seconds BEFORE the 40 s row he was supposed to feel. With the pocket
 *     (`stage1Radius: 4.0`) he is safe through 第一段 and the breather, and only
 *     starts burning when 第二段 pulls the radius under his body at t = 47.0 s;
 *     the rate he meets there is already the capped 0.5/s, so he dies at
 *     t = 49.033 s (combat second 109.033). MEASURED by stepping a real world;
 *     the guard that pins the tick is `fireRingBurnCurve.test.ts`, and the
 *     radius timeline it depends on is `fireRingTwoStage.test.ts`.
 *     (The old note here recommended 「raise `minRadius` above 0.6」 as the fix
 *     for that. That is exactly what `stage1Radius` now is — a knob whose whole
 *     job is to be a pocket — except it is a SECOND radius, so the terminal one
 *     could go to 0 and still mean 全地圖淹沒.)
 *
 * PURITY: no allocation, no Map, no property-name iteration, ≤ 8 comparisons.
 * One subtract / divide / multiply / add per call, all IEEE-correctly-rounded.
 */
export function fireRingRatePerSec(rules: FireRingRules, ticksSinceStart: number): number {
  if (ticksSinceStart < 0) return 0;
  const xs = rules.burnCurveTicks;
  const ys = rules.burnCurveRates;
  const last = xs.length - 1;
  let rate: number;
  if (ticksSinceStart <= xs[0]!) {
    rate = ys[0]!;
  } else if (ticksSinceStart >= xs[last]!) {
    rate = ys[last]!;
  } else {
    // xs is non-decreasing and xs[last] > ticksSinceStart, so this terminates
    // with xs[i] >= ticksSinceStart and i >= 1.
    let i = 1;
    while (i < last && xs[i]! < ticksSinceStart) i++;
    const x0 = xs[i - 1]!;
    const span = xs[i]! - x0;
    // ⚠️ HONEST NOTE (第三守則): `span === 0` is UNREACHABLE today, and a
    // mutation test proved it — deleting this ternary keeps every test green.
    // Proof: xs is non-decreasing, the loop stops at the FIRST i with
    // `xs[i] >= ticksSinceStart`, and `ticksSinceStart > xs[0]` here; so if
    // `xs[i-1] === xs[i]` the loop would already have stopped at `i-1`.
    // It is kept as a ONE-COMPARISON belt because the failure it prevents is
    // silent: `(t - x0) / 0` is ±Infinity, `hp -= maxHp * Infinity * dt` sets
    // every health bar to -Infinity, and nothing downstream throws. Anyone who
    // relaxes the monotonisation in `compileBurnCurve` makes it reachable.
    const f = span > 0 ? (ticksSinceStart - x0) / span : 1;
    const y0 = ys[i - 1]!;
    rate = y0 + (ys[i]! - y0) * f;
  }
  return Math.min(rules.maxPctPerSec, rate);
}

/**
 * The ring radius RIGHT NOW for `zone`, DERIVED — never stored. A disarmed or
 * dormant ring reads as the full zone boundary, so a client that renders this
 * unconditionally draws the un-shrunk rim rather than a phantom hazard.
 *
 * Snapshot encoding and the replay host-digest both call this, so the number on
 * the wire is the same number the burn was evaluated against.
 */
export function currentFireRingRadius(world: SimWorld, zone = 0): number {
  const zoneDef = world.arena.zones[zone] ?? world.arena.zones[0];
  const zoneRadius = zoneDef?.boundaryRadius ?? 0;
  const rules = world.fireRingRules;
  if (!rules || world.fireRingTicks < 0) return zoneRadius;
  return fireRingRadius(rules, world.fireRingTicks - rules.startTicks, zoneRadius);
}

/**
 * Is entity `id` being burned by the ring THIS tick? The exact predicate
 * `fireRingSystem` applies, exported so the snapshot's `ENTITY_FLAG.BURNING`
 * (which drives the client's red screen wash) can never drift from the damage
 * that justifies it.
 */
export function isBurnedByFireRing(world: SimWorld, id: EntityId): boolean {
  const rules = world.fireRingRules;
  if (!rules || world.fireRingTicks < 0 || !world.combatActive) return false;
  if (world.fireRingTicks < rules.startTicks) return false;
  const t = world.transform.get(id);
  if (!t) return false;
  // #216: a zone whose duel is already decided does not burn (FireRingSystem
  // skips it), so the BURNING flag must not claim it does.
  //
  // …EXCEPT FOR MOBS, which `fireRingBurnMobs` deliberately keeps burning there
  // (see its 「為什麼小怪不吃 settledZones」 note). This predicate exists to make
  // the client's flame/wash agree with the damage TICK FOR TICK, so it has to
  // fork exactly where the damage forks — a shared `settledZones` line here
  // would paint a settled zone's zombies as un-burnt while they cook.
  if (world.settledZones.has(t.zone) && !world.mob.has(id)) return false;
  const zoneDef = world.arena.zones[t.zone] ?? world.arena.zones[0];
  if (!zoneDef) return false;
  const radius = fireRingRadius(
    rules,
    world.fireRingTicks - rules.startTicks,
    zoneDef.boundaryRadius,
  );
  return !fireRingIsSafe(radius, t.radius, distSq(t.pos, zoneDef.center));
}

/**
 * 保底 — THE RING EATS THE ZOMBIES TOO (owner 2026-07-30).
 *
 * 「火圈百分比真實傷害是所有場上玩家、bot、各種殭屍都會百分比真實傷害燒死，
 *   所以還是有個保底結果」
 *
 * The champion half of this is `FireRingSystem`'s loop over `world.champion`;
 * this is the SAME burn applied to `world.mob` (一般殭屍 / 特殊殭屍 / 殭屍王).
 * Split out here rather than folded into that loop because MobSystem is what
 * owns the mob lifecycle end-to-end — spawn, AI, death payout, despawn — and a
 * mob that the ring kills has to flow through that payout exactly like one a
 * champion killed (it already does: `MobSystem`'s death scan explicitly names
 * 「the fire ring」 as a no-killer source, and `payMobBounty` runs BEFORE the
 * killer gate so a king/特殊殭屍 that drowns in the ring still pays its 分紅).
 *
 * WHY PERCENT IS THE WHOLE POINT. A shipped 殭屍王 carries ~276,944 hp. Any flat
 * environmental tick is a rounding error against that; `hp.maxHp * ratePerSec *
 * dt` closes it on exactly the same 20 s clock as a 3,000 hp champion, which is
 * what makes this a BACKSTOP rather than a nuisance. Nothing here reads
 * `combatEnv`, armour, MR or shields — same deliberate bypass as the champion
 * burn (#132/#270), so the mechanic cannot be tuned into impotence by accident.
 *
 * ⚠️ 為什麼小怪不吃 `settledZones`。 The #216 skip exists for a PLAYER-facing
 * complaint: a knocked-out player is already looking at the shop and must not
 * watch his team-mates' bars drain behind it. A zombie has no shop and no bar to
 * protect — and a zone that settled while a zombie is still standing is exactly
 * the 「一隻卡在角落的殭屍讓回合永遠不結束」 hole this whole function exists to
 * close. So the ring keeps burning mobs everywhere, and `isBurnedByFireRing`
 * forks on the same condition so the flame the client paints still matches the
 * damage tick for tick.
 *
 * WHY THERE IS NO `burnMobs` ADMIN SWITCH. Everything tunable about this burn —
 * ignition, shrink length, the whole `burnCurve` table and its cap — is ALREADY
 * the operator's, in `match.fireRing`, and every one of those knobs applies to mobs
 * unchanged because the damage is a fraction of the victim's own maxHealth. The
 * only thing left to make switchable would be 「保底 off」, and a round that can
 * no longer be guaranteed to end is not a setting anyone wants shipped.
 *
 * PURITY / DETERMINISM: reads `world.fireRingTicks` — which `fireRingSystem`
 * has ALREADY advanced this tick at step 8b — so a mob is judged against the
 * exact same radius as the champions beside it, never a one-tick-stale one. Ids
 * are sorted before iteration, so the event order in the digest cannot depend on
 * Map internals. No rng, no wall-clock, no trig.
 */
export function fireRingBurnMobs(world: SimWorld): void {
  const rules = world.fireRingRules;
  if (!rules) return;
  if (world.fireRingTicks < 0) return;
  if (!world.combatActive) return; // live combat only — mirrors fireRingSystem
  const ticksSinceStart = world.fireRingTicks - rules.startTicks;
  if (ticksSinceStart < 0) return; // dormant — the ring has not ignited yet
  const ratePerSec = fireRingRatePerSec(rules, ticksSinceStart);
  if (ratePerSec <= 0) return; // degenerate config: no damage, same as champions
  const dt = world.dt;
  // GH#287 攔截層規則 — same object shape and same source of truth as the
  // champion loop's, hoisted once per tick.
  const envRules = { lethalSaveApplies: rules.lethalSaveApplies ?? false };
  for (const id of [...world.mob.keys()].sort((a, b) => a - b)) {
    const hp = world.health.get(id);
    if (!hp || !hp.alive) continue;
    const t = world.transform.get(id);
    if (!t) continue;
    // per-zone geometry, exactly like the champion loop: a mob in zone 1 is
    // judged against zone 1's centre, never zone 0's.
    const zoneDef = world.arena.zones[t.zone] ?? world.arena.zones[0];
    if (!zoneDef) continue;
    const radius = fireRingRadius(rules, ticksSinceStart, zoneDef.boundaryRadius);
    // WHOLE BODY inside = safe. A 殭屍王's body is wider than a champion's, so
    // it stops being safe EARLIER — which is the correct reading of 「沒有生存
    // 空間」 for something that big, not a special case.
    if (fireRingIsSafe(radius, t.radius, distSq(t.pos, zoneDef.center))) continue;
    const dmg = hp.maxHp * ratePerSec * dt;
    if (dmg <= 0) continue;
    // GH#287 —— same gate as the champion loop, through the same one function.
    // Still no armour/MR, no shields, no combat-env (see `combat/environmentalBurn.ts` ③);
    // what it adds is 無敵/免死, which a bare `hp.hp -=` could never see.
    const dealt = applyEnvironmentalBurn(world, id, dmg, envRules);
    if (dealt <= 0) continue; // refused — nothing left the health bar
    world.emit("fireRingDamage", {
      id,
      amount: dealt,
      dmgType: "true",
      origin: "fireRing",
      x: t.pos.x,
      z: t.pos.z,
    });
  }
}

/**
 * Combat entry: arm the fire-ring schedule. Clears any stale state and starts
 * the combat-elapsed tick counter at 0. The ring stays at the full zone
 * boundary (and burns nobody) until the counter reaches `startTicks`.
 */
export function beginCombatFireRing(world: SimWorld, rules: FireRingRules): void {
  world.fireRingRules = rules;
  world.fireRingTicks = 0;
}

/**
 * Combat exit (round end / phase leave): disarm the ring. Idempotent. The
 * counter resets to -1 so a disarmed world's fireRingSystem is a pure no-op
 * (client prediction shadow world, unit tests, legacy boots).
 */
export function endCombatFireRing(world: SimWorld): void {
  world.fireRingRules = null;
  world.fireRingTicks = -1;
}
