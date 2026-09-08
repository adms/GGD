/**
 * `knockback` — 擊退／擊飛 as an ABILITY-AUTHORED primitive (lane P4, GH#193).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  WHAT WAS ALREADY THERE, AND WHAT THIS ADDS
 * ═══════════════════════════════════════════════════════════════════════════
 * GH#193's rule 「擊退改成傷害佔受傷者生命百分比驅動，並減去雙方距離（全後台
 * 可調）」 is ALREADY LIVE — but only as a SIDE EFFECT OF TAKING DAMAGE:
 * `combat/damage.ts` computes it inside `applyImpact`, per landed hit, and the
 * whole law plus its three admin knobs live in `sim/combatFeel.ts`.
 *
 * What did NOT exist is a shove an ability can DECIDE to apply:
 *
 *   · a pure displacement with no damage attached (衝擊波 / 推開 / 拉近),
 *   · a PULL (WC3's hook family) — the damage pipeline can only push,
 *   · 擊飛, a vertical component; `DashOverride` has no height at all,
 *   · 期間不可控制 — the ground slide takes the FEET (`nav.override` beats
 *     steering) but leaves the victim free to cast and swing the whole way.
 *
 * This module is those four, and it reaches them through the EXISTING stores.
 * No new SimWorld field: the slide is `nav.override` (`DashOverride`, whose
 * `kind` field has read `"dash" | "knockback"` since day one), the arc is the
 * SAME `nav.override` slot carrying #247's `LeapOverride`, and the action-lock
 * is `world.knockdown`, which every actor already gates on.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE ONE SEMANTIC THE WHOLE GAME SHARES: the authored number is a FLOOR
 * ═══════════════════════════════════════════════════════════════════════════
 * `distance` means 「距離 0 時要推多遠」, NOT 「無論多遠都推這麼遠」. That is
 * not a choice made here — it is the semantic `combat/damage.ts` already gives
 * the author's `hitFeel.knockbackMag`, for a reason that was MEASURED: 114 of
 * 115 shipped champions carry a `hitFeel.knockbackMag` on their basic attack,
 * so if an authored override skipped the gap subtraction, GH#193 would be dead
 * for basic attacks — the exact complaint (#45) it was written to fix.
 *
 * So the pipeline here is the same three steps, in the same order, calling the
 * SAME two functions out of `combatFeel.ts` (not a second copy of the algebra —
 * a second copy is how two implementations drift with nothing going red):
 *
 *     raw      = max(authored distance, knockbackRaw(rules, impactPower, hp))
 *     distance = afterGap(raw, 攻守雙方目前的距離)
 *     distance <= 0 → NOTHING HAPPENS (no slide, no launch, no lock)
 *
 * ⚠️ `afterGap` is the whole point of the rule and it reads like a pointless
 * subtraction. It is not. Deleting it hands permanent kiting back to ranged
 * (they shove from 8.2 and never step in) and makes every melee shove cancel
 * its own next swing (range 1.6). See combatFeel.ts's 「這個減法不是 bug，
 * 不要把它優化掉」 and the `kb-gap` guards in knockback.test.ts.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  DECISION POINTS ARE FIELDS (CLAUDE.md 第一守則)
 * ═══════════════════════════════════════════════════════════════════════════
 * owner 2026-07-30: 「所有開發都要以編輯器可以彈性設定為準，**尤其是決策點**」.
 * Every "A or B?" this handler ran into became a field on the effect with the
 * owner-stated default, not a branch defended in a comment:
 *
 *   `from`           push away / along facing / PULL
 *   `applyTo`        the targets (default) or the caster (a recoil)
 *   `hpBasis`        % of MAX health (default — the shipped rule) or CURRENT
 *   `subtractGap`    default TRUE — owner:「並減去雙方距離」
 *   `launchHeight`   0 = ground slide (default), > 0 = 擊飛 parabola
 *   `launchDistance` ⭐ 四檔落點 (GH#301-1) — 缺席 = 今天的推算行為
 *   `uncontrollable` default TRUE — owner:「期間不可控制」
 *   `getupTicks`     the 爬起來 window after landing
 *
 * ⭐ `launchDistance`（owner 2026-08-09，GH#301-1）推翻了規範裡的「落點與飛行
 * 時間由系統推算，作者指定不了」，同時把它簡化成四檔（一小段 / 預設 / 一大段 /
 * 到底部）。⛔ 四檔的**實際距離不在這支檔案裡** —— 它們是
 * `config.combat-feel@1` 的 `knockback.launchShortUnits` /
 * `launchLongUnits` / `launchEdgeUsesFireRing`（第一守則：寫死才需要理由）。
 * 這裡只有 `tierDistance`，而它做的是把那三格讀出來、把「到底部」換算成一條
 * 射線的長度。飛行時間仍然是 `distance / speed`，所以擊飛的弧線與作者選的那一
 * 檔永遠對得上。
 *
 * ⚠️ `hpBasis: "current"` deserves its own note, because `combat/damage.ts`
 * explicitly REJECTS current-hp for the global rule:「用當前生命的話,殘血的人
 * 會被一巴掌推到天邊 —— 一個把追擊變成處決的隱形機制,沒有人要求過」. That
 * verdict is about an INVISIBLE, always-on mechanic. Per-ability, opt-in, and
 * off by default, it is a visible design lever instead — which is exactly the
 * 「兩種模式都做，後台可切，預設值選 owner 明說的那個」 prescription. The
 * default here is and must stay `"max"`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  WHY `world.knockdown` IS THE RIGHT CHANNEL FOR 「期間不可控制」
 * ═══════════════════════════════════════════════════════════════════════════
 * The override alone only takes the feet. `movementHold` gives knockdown
 * rooted + stunned (so even TURNING freezes), and four more systems already
 * read the same map — `abilities/abilitySystem` rejects the cast as "stunned",
 * `BasicAttackSystem` refuses the swing, `CastResolveSystem` interrupts one in
 * progress, `RecoverySystem` clears the recovery. Inventing a second store
 * would mean five call sites to update and five chances to miss one.
 *
 * ⚠️ It is a DECREMENTING counter, not an absolute tick, and that is deliberate
 * despite CLAUDE.md's 「到期一律用絕對 tick」: `world.knockdown` is a shipped
 * store aged once per tick by `HitstopSystem`, shared with `hitstop`/`hitstun`,
 * and folded into `digest()`. Writing an absolute tick INTO it would be read as
 * a duration by every existing consumer. The rule protects against two clocks
 * disagreeing; using the one clock that already exists serves the same end.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  MID-FLIGHT VICTIMS
 * ═══════════════════════════════════════════════════════════════════════════
 * A body already in a #247 arc is out of the planar physics world and its
 * `world.airborne` entry is owned by that arc. Overwriting `nav.override` with
 * a `DashOverride` would strand that entry set forever — the digest would hash
 * it, the client would render the champion floating (失敗形態 ①). So a leaper
 * is dropped out of the air by `cancelLeap` FIRST, which is the same path death
 * / revive / round-reset use, and only then shoved.
 */
import type { EffectKindSpec } from "./effectKind";
import type { EntityId } from "../../ids";
import type { Vec2 } from "../math/vec2";
import type { SimWorld } from "../SimWorld";
import { dist, lenSq, normalize, sub } from "../math/vec2";
import { afterGap, knockbackRaw } from "../combatFeel";
import { currentFireRingRadius } from "../fireRing";
import { cancelLeap, leapTicks, resolveLandingPoint, startLeap } from "../movement/leap";
import {
  KB_MAX_DISTANCE,
  KB_MAX_GETUP_TICKS,
  KB_MAX_IMPACT_POWER,
  KB_MAX_LAUNCH_HEIGHT,
  KB_MAX_SPEED,
  clampKb,
} from "./knockbackLimits";

/**
 * Shove direction, unit-length, or `null` when there is nothing to point at.
 *
 * The degenerate case (caster and victim on the exact same point) uses the SAME
 * fallback `combat/damage.ts` uses — shove opposite the victim's own facing,
 * and a fixed axis if even that is zero — so a body can never be handed a zero
 * direction, which `startDash`-style code silently drops.
 */
function shoveDir(
  from: "caster" | "facing" | "pull",
  victimPos: Vec2,
  victimFacing: Vec2,
  casterPos: Vec2 | null,
  casterFacing: Vec2 | null,
  aimed: Vec2 | undefined,
): Vec2 | null {
  if (from === "facing") {
    const d = aimed ?? casterFacing;
    return d !== null && d !== undefined && lenSq(d) > 1e-12 ? normalize(d) : null;
  }
  if (casterPos !== null) {
    const away = sub(victimPos, casterPos);
    if (lenSq(away) > 1e-12) {
      return from === "pull" ? normalize({ x: -away.x, z: -away.z }) : normalize(away);
    }
  }
  if (lenSq(victimFacing) > 1e-12) {
    const back = normalize(victimFacing);
    return from === "pull" ? back : { x: -back.x, z: -back.z };
  }
  return { x: 1, z: 0 };
}

/**
 * ⭐ 四檔落點 → 這一次真的要飛多遠（GH#301-1，owner 2026-08-09）。
 *
 * ── 為什麼三檔都**繞過**上面那條 gap 減法 ────────────────────────────────
 * 減距離（GH#193）存在的理由寫在 `combatFeel.ts`：擋掉**傷害驅動**的擊退變成
 * 遠程的永久風箏。它管的是「系統替你算出來的那個長度」。而這四檔回答的是
 * 完全不同的一句話 —— 作者**指定的落點**。一個被 gap 吃掉的「到底部」不會到
 * 底部，一個被 gap 吃掉的「一大段」在遠程手上是 0：那不是被平衡，是這一格
 * 從來沒有生效過（失敗形態 ②）。
 *
 * ⚠️ 所以四檔與 `subtractGap` 不是同一個問題的兩半：
 *   · `launchDistance` 缺席（或 `"default"`）→ 一格都沒變，走 `subtractGap`。
 *   · 明確選了一檔 → 那一檔就是落點，`distance` / `impactPower` / gap 全部不看。
 * 想要「推算出來的長度」的作者寫的就是 `"default"`，那一格已經表達得完整。
 *
 * ── 「到底部」是一條射線打在圓上，不是一個大數字 ──────────────────────
 * 決鬥區是一個**圓盤**，所以「邊緣」離身體多遠取決於他站在哪、往哪飛。直接
 * 塞一個 999 讓碰撞去夾也會「到底部」，但 `uncontrollable` 的鎖是
 * `distance / speed` 算出來的 —— 一個假的長度會讓被擊飛的人在牆邊躺 30 秒。
 *
 * ⚠️ 火圈縮小的情況（issue 明講要處理）由 `launchEdgeUsesFireRing` 決定，
 * ⛔ 不是這裡的一個 if —— 見 `combatFeel.ts` 的那一格為什麼是決策點。
 * 已經站在該圓之外（火圈縮過頭、人在火裡）時判別式 ≤ 0 → 回 0 → 不推：
 * 把一個已經在燒的人再往外推是純粹的加害，而且方向上沒有「邊緣」可言。
 *
 * PURITY: 只有 + − × ÷ 與一次 `Math.sqrt`（IEEE-754 正確捨入，`math/vec2.ts`
 * 早就在用）。無 rng、無時鐘、無三角函式。
 */
function tierDistance(
  world: SimWorld,
  tier: "short" | "long" | "toEdge",
  pos: Vec2,
  bodyRadius: number,
  zone: number,
  dir: Vec2,
): number {
  const kb = world.combatFeel.knockback;
  if (tier === "short") return kb.launchShortUnits;
  if (tier === "long") return kb.launchLongUnits;
  const zoneDef = world.arena.zones[zone] ?? world.arena.zones[0];
  if (zoneDef === undefined) return 0;
  const edge = kb.launchEdgeUsesFireRing
    ? currentFireRingRadius(world, zone)
    : zoneDef.boundaryRadius;
  // 身體要整個留在圈內 —— 落點是「半徑 edge − 體半徑」那個圓，與 `relaxBody`
  // 的邊界夾限同一個定義，所以算出來的長度不會在落地那一刻被再夾一次。
  const rim = edge - bodyRadius;
  if (!(rim > 0)) return 0;
  const fx = pos.x - zoneDef.center.x;
  const fz = pos.z - zoneDef.center.z;
  const b = fx * dir.x + fz * dir.z;
  const c = fx * fx + fz * fz - rim * rim; // 站在圈內時為負
  const disc = b * b - c;
  if (!(disc > 0)) return 0;
  const hit = Math.sqrt(disc) - b;
  return hit > 0 ? hit : 0;
}

/**
 * `bumpFreeze` from combat/damage.ts, which is module-private there. Max-merge.
 *
 * ⭐ EXPORTED for `./pull.ts` (#147): 吸引與擊退共用**同一個**行動鎖通道
 * (`world.knockdown`)，因為那是五個系統已經在讀的那一格。第二份 max-merge
 * 會在其中一份被改的那一天分岔，而兩份看起來都對（第零守則⑨）。
 */
export function lockOut(world: SimWorld, id: EntityId, ticks: number): void {
  if (ticks <= 0) return;
  const cur = world.knockdown.get(id) ?? 0;
  if (ticks > cur) world.knockdown.set(id, ticks);
}

export const knockbackEffect: EffectKindSpec<"knockback"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const ct = world.transform.get(ctx.caster);
    const subjects = (e.applyTo ?? "target") === "self" ? [ctx.caster] : ctx.targets;

    // Clamp ONCE, outside the loop: these are author-authored numbers and the
    // admin overlay path does not run Zod (#283) — see knockbackLimits.ts.
    const floor = clampKb(e.distance, KB_MAX_DISTANCE);
    const speed = clampKb(e.speed, KB_MAX_SPEED);
    const power = e.impactPower === undefined ? 0 : clampKb(e.impactPower, KB_MAX_IMPACT_POWER);
    const apex = clampKb(e.launchHeight, KB_MAX_LAUNCH_HEIGHT);
    const getup = Math.round(clampKb(e.getupTicks, KB_MAX_GETUP_TICKS));
    if (!(speed > 0)) return; // a zero-speed shove never finishes: never start one

    // `ctx.targets` is an ARRAY built by the caster's own targeting (already a
    // total order); it is not a Map, so it needs no re-sort. Sorting it here
    // would in fact DIVERGE from every other handler.
    for (const id of subjects) {
      const t = world.transform.get(id);
      const nav = world.nav.get(id);
      // No nav component = no body to shove. Neutrals/flowers land here, by
      // construction, exactly as they do in the damage pipeline.
      if (t === undefined || nav === undefined) continue;
      const hp = world.health.get(id);
      if (hp !== undefined && !hp.alive) continue;

      // 攻守雙方目前的距離. A self-shove has only one body, so the gap is 0 and
      // `subtractGap` is a no-op for it — the rule is about the SPACE BETWEEN
      // two fighters, and there is none.
      const gap = ct !== undefined && id !== ctx.caster ? dist(t.pos, ct.pos) : 0;

      // ⚠️ 方向要在距離**之前**算出來（GH#301-1）：`"toEdge"` 的長度是一條
      // 沿著推的方向打在邊界圓上的射線，沒有方向就沒有那個長度。順序換了但
      // 兩條路徑都是 `continue`，所以哪一個先判都不會多推或少推一個身體。
      const dir = shoveDir(
        e.from ?? "caster",
        t.pos,
        t.facing,
        ct !== undefined && id !== ctx.caster ? ct.pos : null,
        ct !== undefined ? ct.facing : null,
        ctx.direction,
      );
      if (dir === null) continue;

      // ── GH#193's law, reached through combatFeel.ts's OWN function so the
      //    operator's live minPct / maxBodies / bodyUnit govern authored shoves
      //    exactly as they govern damage-driven ones.
      //
      // ⭐ …除非作者**指定了落點**（四檔，GH#301-1）。缺席 / `"default"` =
      //    這一整段推算，一格都沒變；其餘三檔整段跳過，見 `tierDistance`。
      const tier = e.launchDistance ?? "default";
      let distance: number;
      if (tier === "default") {
        let raw = floor;
        if (power > 0 && hp !== undefined) {
          const basis = (e.hpBasis ?? "max") === "current" ? hp.hp : hp.maxHp;
          raw = Math.max(raw, knockbackRaw(world.combatFeel.knockback, power, basis));
        }
        // ⚠️ THE SUBTRACTION. Do not "simplify" it away — see the header.
        distance = (e.subtractGap ?? true) ? afterGap(raw, gap) : raw;
      } else {
        distance = tierDistance(world, tier, t.pos, t.radius, t.zone, dir);
      }
      if (!(distance > 0)) continue;

      // A body already mid-arc owns `world.airborne`; drop it out of the air
      // through the shipped path before touching its override (see header).
      if (nav.override?.kind === "leap") cancelLeap(world, id);

      let flightTicks: number;
      if (apex > 0) {
        // ── 擊飛: the #247 parabola. Flight time comes from the SAME two
        //    numbers as the slide (distance / speed), so an author tuning the
        //    shove cannot accidentally desync the arc from its own length.
        const durationSec = distance / speed;
        // ⭐ owner 2026-08-21 —— 擊飛的落點也不可以在**牆的另一邊**。⚠️ 地面
        //    滑行那一半（下面 else）本來就不會穿牆（`moveWithCollision`），
        //    所以在此之前「同一支技能推人」的兩條路對地形的看法是相反的。
        const to = resolveLandingPoint(
          world,
          id,
          { x: t.pos.x + dir.x * distance, z: t.pos.z + dir.z * distance },
          { mode: "leap" },
        );
        const ok = startLeap(world, id, {
          to,
          apexHeight: apex,
          durationSec,
          casterId: ctx.caster,
          rank: ctx.rank,
          origin: ctx.origin,
          ...(ctx.abilitySlot !== undefined ? { slot: ctx.abilitySlot } : {}),
        });
        if (!ok) continue;
        flightTicks = leapTicks(durationSec);
      } else {
        // ── ground slide: MovementSystem integrates it with collision, so it
        //    slides along walls and clamps inside the zone (never clips through).
        //
        //    ⚠️ `authored: true` is LOAD-BEARING, not metadata. Without it this
        //    slide is indistinguishable from the ambient damage shove, and
        //    `combat/damage.ts`'s arbiter (slot 8, AFTER this ran at slot 3)
        //    overwrites it with the damage the SAME ability just dealt — which
        //    is the outage every shipped 擊退 ability was in. See the
        //    SHOVE ARBITRATION block there and sim/knockbackVsDamage.test.ts.
        nav.override = { kind: "knockback", dir, speed, remaining: distance, authored: true };
        // MovementSystem eats `min(speed*dt, remaining)` per tick, so the slide
        // is ceil(distance / (speed*dt)) ticks long. Integer division only.
        flightTicks = Math.ceil(distance / (speed * world.dt));
      }

      // ── 期間不可控制 (owner). Default TRUE.
      if (e.uncontrollable ?? true) lockOut(world, id, flightTicks + getup);
    }
  },
};
