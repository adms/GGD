/**
 * snapshot — projects the SimWorld + controller state into the Colyseus schema.
 * The ONE publish seam: a quantized binary channel can replace the entities map
 * later without touching anything else.
 */
import type { ArraySchema } from "@colyseus/schema";
import { ENTITY_FLAG, ENTITY_KIND, EntityState, MatchState, OfferState, ROUND_OUTCOME, SeatState, TeamState } from "@ggd/shared/protocol/schema";
import { Champions } from "@ggd/shared/sim/content/registry";
import { FLOWER_MODEL_KEY } from "@ggd/shared/sim/flowers";
import { REVIVE_CIRCLE_MODEL_KEY } from "@ggd/shared/sim/revive";
import type { ChampionId } from "@ggd/shared/ids";
import type { MatchController } from "../match/MatchController";
import type { HumanDriver } from "../seat/HumanDriver";

/** Replace an ArraySchema's contents (schema v3 lacks a compatible splice). */
function setArray<T extends string | number>(arr: ArraySchema<T>, values: readonly T[]): void {
  // mutate only when changed to avoid redundant patches
  if (arr.length === values.length && values.every((v, i) => arr[i] === v)) return;
  arr.clear();
  for (const v of values) arr.push(v);
}

export function projectSnapshot(ctl: MatchController, state: MatchState, humanDrivers: Map<number, HumanDriver>): void {
  const world = ctl.world;
  state.phase = ctl.phase.phase;
  state.round = ctl.phase.round;
  // The ACTIVE arena for the current round (task #145). Set here every tick (not
  // once at onCreate) so the per-round rotation reaches every client: the id
  // changes when the controller swaps arenas at combat entry, and the client-
  // render agent re-renders the scene on the change. Server-authoritative +
  // deterministic, so every client agrees on the round's map.
  state.mapId = ctl.arena.id;
  state.tick = world.tick;
  state.phaseTicksLeft = ctl.phase.ticksLeft;
  // match decided -> client disables input + starts the settlement front-view
  state.outcomeDecided = ctl.outcomeDecided;

  // ---- teams ----
  while (state.teams.length < ctl.lives.size) state.teams.push(new TeamState());
  let ti = 0;
  for (const [teamId, lives] of ctl.lives) {
    const ts = state.teams[ti]!;
    ts.teamId = teamId;
    ts.lives = lives;
    ts.eliminated = lives <= 0;
    ts.placement = ctl.placements.get(teamId) ?? 0;
    // PER-ROUND participation + duel result (reset at each combat entry). The
    // round-end presentation needs it because a BYE team is parked dead and
    // scores nothing, so `alive` + per-round K/D alone cannot tell 「輪空」 from
    // 「被團滅」 — and celebrating a team that sat the round out is the #173 bug.
    ts.roundOutcome = ctl.roundOutcome.get(teamId) ?? ROUND_OUTCOME.NONE;
    // MATCH-lifetime duels won. The client's victory gate (vfx/victoryTrigger)
    // fires the small round-win firework on this counter RISING, so it must be
    // projected every patch and must never be reset mid-match (#93).
    ts.roundWins = ctl.roundWins.get(teamId) ?? 0;
    ti++;
  }

  // ---- seats ----
  for (const [seatId, seat] of ctl.seats) {
    const key = String(seatId);
    let ss = state.seats.get(key);
    if (!ss) {
      ss = new SeatState();
      state.seats.set(key, ss);
    }
    ss.seatId = seatId;
    ss.teamId = seat.teamId;
    ss.displayName = seat.displayName;
    ss.accountId = seat.accountId;
    ss.connected = seat.sessionId !== null;
    ss.driver = seat.driverKind;
    ss.championId = seat.championId;
    ss.ready = seat.ready;
    ss.lastAckSeq = humanDrivers.get(seatId)?.mailbox.lastSeq ?? 0;
    // PER-ROUND K/D (reset at each combat entry, never cumulative). The round-end
    // winner model (#143) + quote VO (#142) rank the leading team's seats by these
    // to name THAT round's MVP, so the presented champion changes with the round.
    // Clamped to the uint8 wire field.
    ss.roundKills = Math.min(ctl.roundKills.get(seatId) ?? 0, 255);
    ss.roundDeaths = Math.min(ctl.roundDeaths.get(seatId) ?? 0, 255);

    if (seat.entityId !== null) {
      ss.entityId = seat.entityId;
      const champ = world.champion.get(seat.entityId);
      const ab = world.abilities.get(seat.entityId);
      if (champ) {
        ss.level = champ.level;
        ss.gold = champ.gold;
        ss.xp = champ.xp;
        setArray(ss.items, champ.items.map((i) => i ?? ""));
        setArray(ss.augments, champ.augments);
        // 能力屬性強化 progress (task #82) — N/20 and whether the capstone has
        // landed. The shop panel (#38) owns the presentation; this is the state
        // it needs so a player can never destroy 19 stacks unknowingly.
        ss.statStacks = Math.min(champ.statStacks, 255);
        ss.statCapstonePct = champ.statCapstonePct;
        // buy/sell undo depth (task #121) — the client shows 「↩ 復原上一步」
        // exactly when > 0. Clamped to the uint8 wire field.
        ss.undoDepth = Math.min(champ.undoStack.length, 255);
      }
      if (ab) {
        ss.unspentPoints = ab.unspentPoints;
        setArray(ss.abilityRanks, [ab.slots.Q.rank, ab.slots.W.rank, ab.slots.E.rank, ab.slots.R.rank]);
        setArray(ss.cooldowns, [
          ab.slots.Q.cooldownRemainingTicks,
          ab.slots.W.cooldownRemainingTicks,
          ab.slots.E.cooldownRemainingTicks,
          ab.slots.R.cooldownRemainingTicks,
        ]);
        // per-hero EX slot (5th ability). exAbilityId is set whenever the hero
        // HAS an EX (even locked), so the client can render the greyed button.
        if (ab.exSlot) {
          ss.exAbilityId = ab.exSlot.abilityId;
          ss.exRank = ab.exSlot.rank;
          ss.exCooldown = ab.exSlot.cooldownRemainingTicks;
        } else {
          ss.exAbilityId = "";
          ss.exRank = 0;
          ss.exCooldown = 0;
        }
      }
    }

    // offers for this seat (rebuild only when the set changes)
    const seatOffers = [...ctl.offers.entries()].filter(([, o]) => o.seatId === seatId);
    const sameOffers =
      ss.offers.length === seatOffers.length &&
      seatOffers.every(([offerId], i) => ss.offers[i]?.offerId === offerId);
    if (!sameOffers) {
      ss.offers.clear();
      for (const [offerId, offer] of seatOffers) {
        const os = new OfferState();
        os.offerId = offerId;
        os.tier = offer.tier;
        os.choices.push(...offer.choices);
        ss.offers.push(os);
      }
    }
  }

  // ---- entities ----
  const seen = new Set<string>();
  for (const [id, t] of world.transform) {
    const key = String(id);
    seen.add(key);
    let es = state.entities.get(key);
    if (!es) {
      es = new EntityState();
      state.entities.set(key, es);
    }
    es.id = id;
    es.x = t.pos.x;
    es.z = t.pos.z;
    es.fx = t.facing.x;
    es.fz = t.facing.z;
    es.zone = t.zone;

    const proj = world.projectile.get(id);
    if (proj) {
      es.kind = ENTITY_KIND.PROJECTILE;
      es.seatId = -1;
      es.key = proj.projectileId;
      es.alive = true;
    } else if (world.flower.has(id)) {
      // neutral healing flower: no seat/team; hp rides along so healthbars work
      es.kind = ENTITY_KIND.FLOWER;
      es.seatId = -1;
      es.key = FLOWER_MODEL_KEY;
      const hp = world.health.get(id);
      if (hp) {
        es.hp = hp.hp;
        es.maxHp = hp.maxHp;
        es.mana = 0;
        es.maxMana = 0;
        es.alive = hp.alive;
        es.shield = 0;
      }
      es.flags = 0;
    } else {
      const circle = world.reviveCircle.get(id);
      if (circle) {
        // revive circle (task #84): a GROUND AREA, not a unit. It has no
        // health/team component sim-side, so the float slots carry its own
        // state instead — see the ENTITY_KIND doc for the exact mapping.
        const rules = world.reviveRules;
        es.kind = ENTITY_KIND.REVIVE_CIRCLE;
        es.seatId = circle.ownerSeatId; // the DEAD owner (team tint + HUD name)
        es.key = REVIVE_CIRCLE_MODEL_KEY;
        es.hp = circle.progressTicks;
        es.maxHp = rules ? rules.channelTicks : 0;
        es.mana = Math.max(0, circle.expiresAtTick - world.tick);
        es.maxMana = circle.expiresAtTick - circle.spawnedAtTick;
        es.shield = t.radius; // ring radius, straight from the config
        es.alive = true;
        es.flags =
          (circle.channellerId !== null ? ENTITY_FLAG.CHANNELLING : 0) |
          (circle.contested ? ENTITY_FLAG.CONTESTED : 0);
        continue;
      }
      const team = world.team.get(id);
      const champ = world.champion.get(id);
      es.kind = 0;
      es.seatId = team ? team.seatId : -1;
      es.key = champ ? Champions.get(champ.championId as ChampionId).modelKey : "";
      const hp = world.health.get(id);
      if (hp) {
        es.hp = hp.hp;
        es.maxHp = hp.maxHp;
        es.mana = hp.mana;
        es.maxMana = hp.maxMana;
        es.alive = hp.alive;
        es.shield = hp.shields.reduce(
          (s, sh) => (sh.expiresAtTick > world.tick ? s + sh.amount : s),
          0,
        );
      }
      // status flags for animation/UI
      let flags = 0;
      const nav = world.nav.get(id);
      if (nav?.override) flags |= ENTITY_FLAG.DASHING;
      const ab = world.abilities.get(id);
      if (ab?.cast) flags |= ENTITY_FLAG.CASTING;
      if (ab?.windup) flags |= ENTITY_FLAG.WINDUP;
      const st = world.status.get(id);
      if (st) {
        for (const e of st.effects) {
          if (e.expiresAtTick <= world.tick) continue;
          if (e.root) flags |= ENTITY_FLAG.ROOTED;
          if (e.stun) flags |= ENTITY_FLAG.STUNNED;
          if (e.moveSpeedMult !== undefined && e.moveSpeedMult < 1) flags |= ENTITY_FLAG.SLOWED;
        }
      }
      es.flags = flags;
    }
  }
  // remove despawned entities
  for (const key of [...state.entities.keys()]) {
    if (!seen.has(key)) state.entities.delete(key);
  }
}
