/**
 * snapshot — projects the SimWorld + controller state into the Colyseus schema.
 * The ONE publish seam: a quantized binary channel can replace the entities map
 * later without touching anything else.
 */
import type { ArraySchema } from "@colyseus/schema";
import { DuelState, ENTITY_FLAG, ENTITY_KIND, EntityState, GROWTH_TIER_STACKS, MatchState, OfferState, ROUND_OUTCOME, SeatState, TeamState } from "@ggd/shared/protocol/schema";
import { visualStackCount } from "@ggd/shared/sim/stats/visualStacks";
import { Champions } from "@ggd/shared/sim/content/registry";
import { FLOWER_MODEL_KEY } from "@ggd/shared/sim/flowers";
import { REVIVE_CIRCLE_MODEL_KEY } from "@ggd/shared/sim/revive";
import { GOLD_COIN_MODEL_KEY } from "@ggd/shared/sim/coins";
import { MOB_MODEL_KEY } from "@ggd/shared/sim/mobs";
import { currentFireRingRadius, isBurnedByFireRing } from "@ggd/shared/sim/fireRing";
import { attrBonusArray } from "@ggd/shared/sim/economy/statPath";
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
  // FIRE RING (#195): replicate the authority's own counter + radius. Both
  // freeze the instant a round settles, which is exactly what the client's
  // flame band must do — a `phaseTicksLeft`-derived ring would keep shrinking
  // over a hazard that has stopped burning. `currentFireRingRadius` is the same
  // pure law fireRingSystem burned against this tick.
  state.fireRingTicks = world.fireRingTicks;
  state.fireRingRadius = currentFireRingRadius(world);

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

  // ---- duels (task #208) ----
  // Mirror the current round's pairings + per-zone winner so a spectating client
  // can find a still-LIVE zone to watch once its own duel is decided. `pairings`
  // is empty outside combat, so this list is empty then too. `winner < 0` == the
  // duel is still being fought; a bye team is in no pairing and so appears here
  // in no entry (bye correctness, #173). Rebuilt only when the shape changes to
  // avoid redundant patches: same length AND same (zone, winner) per slot.
  const pairings = ctl.pairings;
  const duelsSame =
    state.duels.length === pairings.length &&
    pairings.every((p, i) => {
      const d = state.duels[i];
      return d?.zone === p.zone && d?.winner === (ctl.duelWinnerOf(p.zone) ?? -1);
    });
  if (!duelsSame) {
    state.duels.clear();
    for (const p of pairings) {
      const ds = new DuelState();
      ds.zone = p.zone;
      ds.teamA = p.sideA;
      ds.teamB = p.sideB;
      ds.winner = ctl.duelWinnerOf(p.zone) ?? -1;
      state.duels.push(ds);
    }
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
        // WHAT those ticks bought, as the three 三圍 totals (#260 — 力/敏/智,
        // ATTR_KEYS order). `statStacks` above is only a streak COUNTER, and the
        // bought attributes live on `ChampionComp.attrBonus`, which the client
        // has no other view of — without this the shop reconstructs the champion
        // without them and cannot answer 「這 375g 買到什麼」.
        setArray(ss.attrBonus, attrBonusArray(world, seat.entityId));
        // buy/sell undo depth (task #121) — the client shows 「↩ 復原上一步」
        // exactly when > 0. Clamped to the uint8 wire field.
        ss.undoDepth = Math.min(champ.undoStack.length, 255);
        // 陣亡投幣 throws left this round (task #191). Authoritative and
        // reconnect-safe: the dead player's 「丟金幣 n/10」 button must read the
        // same number after a socket blink as before it.
        ss.coinsLeft = Math.min(world.coinBudget.get(seat.entityId) ?? 0, 255);
        // 殭屍擊殺數 (task #258). `world.mobKills` is MATCH-CUMULATIVE and keyed
        // by champion entity — the same counter MobSystem grants a level off
        // every 30 kills — so the HUD's live number and the level the player is
        // being granted can never disagree. It reached the client only through
        // the round-settle progress chart before this line existed; mid-combat
        // there was nothing on the wire to show.
        ss.mobKills = Math.min(world.mobKills.get(seat.entityId) ?? 0, 65535);
        // YOUR OWN ACTIVE STATUS EFFECTS (owner: 「我也看不出來自己暈眩還是
        // 發生什麼事情」). Two index-aligned arrays; polarity and display name
        // stay on the content doc, which the client already has.
        //
        // ⚠️ ALREADY-EXPIRED ENTRIES ARE DROPPED HERE, not left for the client
        // to filter. StatusSystem clears them on its own tick, but a status that
        // expires between the sim step and this projection would otherwise ride
        // the wire for one snapshot and flash a 0-second icon at the player.
        const sc = world.status.get(seat.entityId);
        const live = (sc?.effects ?? []).filter((e) => e.expiresAtTick > world.tick);
        setArray(ss.statusIds, live.map((e) => String(e.statusId)));
        // RELATIVE ticks, matching every other timer on the wire.
        setArray(
          ss.statusRemainTicks,
          live.map((e) => Math.min(65535, Math.max(0, e.expiresAtTick - world.tick))),
        );
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
        // 天生技 (6th slot). Only the cooldown rides the wire — which innate the
        // hero owns follows from championId, and its rank is 1 from spawn. 0
        // both for a permanent 被動 innate and for the 3 heroes with no NN-00.
        ss.passiveCooldown = ab.passiveSlot?.cooldownRemainingTicks ?? 0;
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
        // The mana pair used to carry the lifetime countdown. Task #196 removed
        // the lifetime (the ring lasts until the round ends), so both slots are
        // pinned to 0 — which is also the client's "no countdown" signal: it
        // reads lifeLeft as 1 whenever maxMana is 0. Left as spare capacity
        // rather than repurposed, so a future field gets an honest name.
        es.mana = 0;
        es.maxMana = 0;
        es.shield = t.radius; // ring radius, straight from the config
        es.alive = true;
        es.flags =
          (circle.channellerId !== null ? ENTITY_FLAG.CHANNELLING : 0) |
          (circle.contested ? ENTITY_FLAG.CONTESTED : 0);
        continue;
      }
      const structure = world.structure.get(id);
      if (structure) {
        // NEUTRAL duel-zone GUARDIAN (task #89/#105). Like a flower it carries
        // transform + health + a marker and NOTHING ELSE — no team/seat/champion
        // — but it is its OWN distinct kind so the client stops falling it
        // through to the champion default (kind 0 + team-0 tint = a grey blob
        // painted as a blue teammate). seatId -1 = neutral (all four teams may
        // target it; #85 never keeps it in colour as a teammate); key = the
        // per-arena model doc id (樹人 / 石頭人 / 巨獸人). hp rides along so a
        // neutral health bar renders.
        es.kind = ENTITY_KIND.GUARDIAN;
        es.seatId = -1;
        es.key = structure.modelKey;
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
        continue;
      }
      const coin = world.coin.get(id);
      if (coin) {
        // DROPPED GOLD COIN (task #191). Loot on the floor: no team, no health,
        // not targetable. Like the revive circle it reuses the existing float
        // slots instead of growing the wire schema — `shield` carries the coin's
        // gold value so the client never hard-codes 100.
        es.kind = ENTITY_KIND.GOLD_COIN;
        es.seatId = coin.ownerSeatId; // the DEAD thrower, for presentation only
        es.key = GOLD_COIN_MODEL_KEY;
        es.hp = 0;
        es.maxHp = 0;
        es.mana = 0;
        es.maxMana = 0;
        es.shield = coin.value;
        es.alive = true;
        es.flags = 0;
        continue;
      }
      const mob = world.mob.get(id);
      if (mob) {
        // ROGUELITE MOB (task #215 喪標麥可). A MONSTER-team neutral that MOVES.
        // Placed BEFORE the champion default so it never paints as a grey team-0
        // teammate. seatId -1 = neutral (all champions may target it); key = the
        // 喪標麥可's model doc; hp rides along so a neutral health bar renders.
        // #217: the key comes from the ARMED rules, so `mobWaves.mob.modelKey` is
        // a live knob instead of an authored-but-ignored field; MOB_MODEL_KEY is
        // only the fallback for a world armed by a pre-#217 caller.
        es.kind = ENTITY_KIND.MOB;
        es.seatId = -1;
        es.key = world.mobRules?.modelKey ?? MOB_MODEL_KEY;
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
      // #195: outside the fire ring THIS tick → the seat's own screen washes
      // translucent red. Composed from the sim's burn predicate itself, so the
      // wash and the damage can never disagree.
      if (isBurnedByFireRing(world, id)) flags |= ENTITY_FLAG.BURNING;
      // #244 — VISIBLE GROWTH. Two threshold bits in a `flags` word that is
      // already on the wire, so the boss reveal costs ZERO extra bytes and is
      // legible to enemies and spectators with no seat lookup. The COUNT stays
      // server-side; the client only ever needs the tier. Champion-agnostic: the
      // content decides which stacks are visible (`applyBuff.stackVisual`).
      const grown = visualStackCount(world, id);
      if (grown >= GROWTH_TIER_STACKS[0]) flags |= ENTITY_FLAG.MUD_SWELL;
      if (grown >= GROWTH_TIER_STACKS[1]) flags |= ENTITY_FLAG.MUD_BOSS;
      // #247 AIRBORNE: fly height. Absent (the normal case) writes 0, which
      // Colyseus's delta encoder then never puts on the wire — so a match with
      // no leaps costs exactly zero extra bytes. (The companion `sc` model-scale
      // channel was removed as dead — see the note in protocol/schema.ts.)
      const air = world.airborne.get(id);
      es.h = air ? air.y : 0;
      if (air) flags |= ENTITY_FLAG.AIRBORNE;
      es.flags = flags;
    }
  }
  // remove despawned entities
  for (const key of [...state.entities.keys()]) {
    if (!seen.has(key)) state.entities.delete(key);
  }
}
