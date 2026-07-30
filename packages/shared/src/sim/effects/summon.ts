/**
 * `summon` — 召喚物 (GH#289 lane P2). Spawns one or more bodies that fight for
 * the caster and leave the field on a deadline.
 *
 * This module is the HANDLER and the component; the placement / cap / lifecycle
 * machinery lives in `sim/summons.ts` (which is also where the long design note
 * is). Everything the handler decides comes off the effect document — see the
 * `summon` member of `EffectDef` for why each of the eleven fields is a field
 * and not a branch somebody picked.
 *
 * WHY IT NEEDS A STORE. A summon is a SECOND ENTITY that has to remember who
 * owns it and when it despawns. Neither fact fits an existing component:
 * `TeamComp` gives it a side but not an owner, `MobComp` belongs to the #215
 * zombie-wave scheduler (a summon is not a wave spawn and must not be counted
 * as one), and nothing existing expires an entity on a deadline. Hence
 * {@link SimWorld.summon}.
 */
import type { ChampionId, EntityId } from "../../ids";
import type { EffectKindSpec } from "./effectKind";
import type { Vec2 } from "../math/vec2";
import { Champions } from "../content/registry";
import {
  DEFAULT_SUMMON_CAP,
  DEFAULT_SUMMON_SPREAD,
  spawnSummon,
  summonSpawnPos,
  summonTeam,
  summonsInGroup,
} from "../summons";

/**
 * Marker on a SUMMONED entity — everything the lifecycle needs and nothing the
 * champion/mob stores already carry.
 *
 * ⚠️ ONLY `ownerId` + `expiresAtTick` are required. The rest are optional with
 * an explicit "absent means" so a `SummonComp` built by hand (test fixtures, the
 * GH#289 seam's own `reservedStores.test.ts`) still compiles and still behaves —
 * the same 「缺席 = 今天的行為」 rule every #206/#288/#289 field follows.
 * `spawnSummon` ALWAYS writes all of them.
 */
export interface SummonComp {
  /** the entity that summoned it (kill credit, aggro, ownership caps) */
  ownerId: EntityId;
  /** ABSOLUTE tick it despawns; `Number.POSITIVE_INFINITY` = permanent */
  expiresAtTick: number;
  /** ABSOLUTE tick it entered the world — the eviction order for `onCap` */
  spawnTick?: number;
  /**
   * Which 上限 budget this body counts against. `summon.capScope` decides what
   * goes in it: the ability's `origin` (per caster PER ability, the default) or
   * the fixed `"*"` (one budget for everything that caster summons).
   */
  capKey?: string;
  /** 主人死了怎麼辦; ABSENT = `"despawn"` (see the effect doc) */
  onOwnerDeath?: "despawn" | "persist";
  /**
   * The hero LEVEL its sheet is read at. Lives here because the stat pipeline
   * has to find it somewhere and a summon has no ChampionComp — see
   * `stats/statPipeline.ts`. ABSENT reads as level 1.
   */
  level?: number;

  /* ── 誰打得到它 —— 決策點, 解析器與理由都在 sim/summonRules.ts ────────────
   * These SIX exist because a summon is neither a champion nor a mob, and both
   * automatic target pickers in the sim were allow-lists over exactly those two
   * stores. Before they existed, NOTHING could auto-acquire a summon: it hit
   * people and nothing hit back. See summonRules.ts for the measurement and for
   * why 「缺席」 means the WC3 behaviour here and not 「今天的行為」. */

  /** 敵方自動索敵看不看得見它; ABSENT = true (WC3: an ordinary unit) */
  autoTargetable?: boolean;
  /** 索敵比較器的第一鍵; ABSENT = `"summon"` (between champion and mob) */
  targetPriority?: "champion" | "summon" | "mob";
  /** #215 小怪會不會咬它; ABSENT = true (WC3: creeps fight summons) */
  mobTargetable?: boolean;
  /** 玩家能不能手動點它; ABSENT = true (WC3: right-clickable) */
  manualTargetable?: boolean;
  /** 火圈燒不燒它; ABSENT = true (owner 2026-07-30 的 保底 —— 見 summonRules.ts) */
  burnsInFireRing?: boolean;
  /** 打死它給擊殺者多少金幣; ABSENT = 0 = 今天出貨的行為 (WC3: no bounty) */
  bountyGold?: number;
}

export const summonEffect: EffectKindSpec<"summon"> = {
  apply(e, ctx) {
    const { world } = ctx;

    // 歸屬 — 被它擊殺算誰的. `"owner"` needs a killer-rewrite seam inside
    // DeathSystem (another lane's file), so it REFUSES rather than silently
    // paying nobody while the card promises otherwise — failure shape ②, and
    // the same rule the pre-P6 `shield.absorbs` followed.
    if (e.killCredit === "owner") {
      throw new Error(
        "summon.killCredit: \"owner\" is not implemented — a summon's kills currently pay " +
          "nobody, because systems/DeathSystem.ts gates every payout on " +
          "world.champion.has(killer). Use \"none\" (or omit the field) until that seam exists.",
      );
    }

    const casterT = world.transform.get(ctx.caster);
    // No body, no summon. A caster that left the world between cast-begin and
    // resolve (died, was destroyed) must not spawn anything — and must not
    // crash the tick either.
    if (casterT === undefined) return;

    // WHOSE BODY. `"self"` resolves the CASTER's own doc so a 分身 ability need
    // not name its own hero (which goes stale the moment the hero is renamed or
    // gains a 變身 counterpart).
    const wantedId =
      e.body === "self"
        ? (world.stats.get(ctx.caster)?.championId ?? (e.championId as ChampionId))
        : (e.championId as ChampionId);
    // SOFT ref (see the Zod mirror): the ability may be authored before the body
    // ships. An unknown id summons NOTHING — loudly wrong on screen, rather than
    // `Champions.get` throwing inside a tick and taking the whole match down.
    if (Champions.tryGet(wantedId) === undefined) {
      world.emit("summonFailed", { owner: ctx.caster, championId: wantedId, reason: "unknownBody" });
      return;
    }

    const formation = e.formation ?? "ring";
    const spread = e.spread ?? DEFAULT_SUMMON_SPREAD;
    const capKey = e.capScope === "caster" ? "*" : ctx.origin;
    const maxAlive = Math.max(0, Math.floor(e.maxAlive ?? DEFAULT_SUMMON_CAP));
    const onCap = e.onCap ?? "skip";
    const { teamId, seatId } = summonTeam(world, ctx.caster, e.team ?? "owner");

    // 存活時間 — an ABSOLUTE tick, computed ONCE here. Absent = permanent.
    const expiresAtTick =
      e.durationSec === undefined
        ? Number.POSITIVE_INFINITY
        : world.tick + Math.max(1, Math.round(e.durationSec / world.dt));

    // ANCHOR. Falls back to the caster at every step, so an ability authored
    // `at: "point"` that somehow resolved without one still summons.
    let anchor: Vec2 = casterT.pos;
    if (e.at === "target") {
      const first = ctx.targets[0];
      const tt = first === undefined ? undefined : world.transform.get(first);
      if (tt !== undefined) anchor = tt.pos;
    } else if (e.at === "point" && ctx.point !== undefined) {
      anchor = ctx.point;
    }

    const count = Math.max(0, Math.floor(e.count));
    for (let i = 0; i < count; i++) {
      // 上限 — re-read PER BODY, not once before the loop: a single cast of
      // `count: 5` into a group with 2 free slots must place 2 and stop, and
      // with `replaceOldest` the eviction has to be visible to the next
      // iteration or the loop evicts the body it just made.
      const live = summonsInGroup(world, ctx.caster, capKey);
      if (live.length >= maxAlive) {
        if (onCap === "skip") break;
        // 「超過殺最舊」 (37-02 黑核晶). Oldest = lowest (spawnTick, then id) —
        // the id tiebreak is what makes two bodies summoned on the same tick
        // evict in the same order on every replica.
        let victim: EntityId | null = null;
        let victimTick = Number.POSITIVE_INFINITY;
        for (const sid of live) {
          const st = world.summon.get(sid)?.spawnTick ?? 0;
          if (st < victimTick) {
            victimTick = st;
            victim = sid;
          }
        }
        if (victim === null) break; // cap is 0: nothing to evict, nothing to place
        const vs = world.summon.get(victim)!;
        world.emit("summonDespawn", {
          id: victim,
          owner: vs.ownerId,
          reason: "capEvicted",
          x: world.transform.get(victim)?.pos.x ?? 0,
          z: world.transform.get(victim)?.pos.z ?? 0,
        });
        world.destroy(victim);
      }

      const pos = summonSpawnPos(
        world,
        casterT.zone,
        anchor,
        casterT.facing,
        i,
        count,
        formation,
        spread,
      );
      spawnSummon(world, {
        ownerId: ctx.caster,
        championId: wantedId,
        // WC3 summons scale off the ABILITY level, which is `ctx.rank` here —
        // so an un-authored `level` grows with the rank the player invested,
        // rather than pinning every summon in the game to level 1.
        level: Math.max(1, Math.floor(e.level ?? ctx.rank)),
        zone: casterT.zone,
        pos,
        teamId,
        seatId,
        expiresAtTick,
        capKey,
        onOwnerDeath: e.onOwnerDeath ?? "despawn",
        hpMult: e.hpMult ?? 1,
        damageMult: e.damageMult ?? 1,
        origin: ctx.origin,
        // 誰打得到它 — passed through UNRESOLVED (`?? undefined`, never a
        // defaulted value). The resolvers in sim/summonRules.ts are the ONE
        // place a default is chosen; baking one in here would give a
        // hand-built SummonComp (test fixtures, reservedStores.test.ts) and a
        // spawned one two different answers to the same question.
        autoTargetable: e.autoTargetable,
        targetPriority: e.targetPriority,
        mobTargetable: e.mobTargetable,
        manualTargetable: e.manualTargetable,
        burnsInFireRing: e.burnsInFireRing,
        bountyGold: e.bountyGold,
      });
    }
  },
};
