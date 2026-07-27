/**
 * 連殺 COMBO — 「戰鬥時擊殺殭屍或英雄間隔5秒內會顯示 combo 連殺數量」
 * (owner, 2026-07-27).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OWNER'S RULING (2026-07-27), stated here because it is the whole design
 *
 *   殭屍與英雄都算，而且累加在同一個數字上 —— 不分開顯示、不加權、不設上限。
 *
 * ONE RULE, TWO FEELS. That single rule produces two completely different hands
 * without a line of per-round code:
 *   • ROUND 9 — `content/config/arena-rules.json` schedules 20 mobs/wave with 60
 *     alive per zone. One AoE sweep through a zombie pack chains a dozen kills
 *     inside the same TICK, and the counter goes somewhere absurd. That 爽度 is
 *     the point, not an overflow to be capped.
 *   • ROUND 10 — the same file schedules `{mobsPerWaveCap: 0, maxAlivePerZone: 0}`:
 *     the owner's 「乾淨總決賽」 has no zombies at all, so the identical rule
 *     leaves nothing but champion kills, and a 3-combo in the final is a real
 *     3-combo. The number means something different in the final BECAUSE the
 *     rule never changed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION 1 — WHY THE COUNT LIVES IN THE SIM (and is measured in TICKS)
 *
 * `Date.now()` / `performance.now()` are banned under packages/shared (there is
 * a purity gate: sim/purity.test.ts), and rightly: the sim is a 30 Hz
 * deterministic replay. So the 5-second window is 5 × TICK_HZ = 150 TICKS, and
 * the clock is `world.tick`, which every replica advances in lockstep.
 *
 * Counting here rather than in the client buys three things a client-side tally
 * cannot have:
 *   • every client computes the SAME number — a spectator, the killer and the
 *     victim all see 「12 連殺」, not three different guesses;
 *   • the REPLAY (task #175, the owner's only feedback channel) reproduces the
 *     combo exactly, because it replays ticks, not wall-clock;
 *   • two kills in the SAME tick — the AoE case, which is the headline case —
 *     chain with a tick delta of 0. A client counting on arrival timestamps
 *     would have to guess whether two packets in one frame were one sweep or
 *     two separate kills.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY NOT REUSE `world.mobKills` OR `world.killTracking` (owner asked)
 *
 *   • `world.mobKills` (#215) is a MATCH-CUMULATIVE, MOB-ONLY tally whose whole
 *     job is the every-N-kills level-up. It carries no timestamp and it never
 *     sees a champion kill, so it can answer neither half of this feature. Its
 *     KILL SITE is reused though — see MobSystem: the combo is credited on the
 *     same line that bumps mobKills, so there is exactly one place in the sim
 *     that decides 「a mob kill happened and it belongs to X」.
 *   • `world.killTracking` (multikill streaks) is the closest existing thing —
 *     same shape, same idea — but it is a 10-second (MULTIKILL_WINDOW_TICKS =
 *     300) CHAMPION-ONLY streak that feeds `PlayerMatchStats.multikills` and
 *     therefore the S+..C- settlement rating. Widening it to 5 s and letting
 *     zombies into it would silently re-score every match ever rated. So this
 *     is a SEPARATE map that COPIES its shape — the pattern is reused, the
 *     meaning is not overloaded.
 *
 * ROUND BOUNDARIES need no special case. `MatchController.stepSim` steps the
 * world in EVERY phase, so `world.tick` keeps advancing through resolution and
 * the intermission shop; a combo therefore expires on its own long before the
 * next round's first kill. Nothing to reset, nothing to forget to reset.
 */
import type { EntityId } from "../../ids";
import { TICK_HZ } from "../../constants";
import type { SimWorld } from "../SimWorld";

/**
 * The owner's 5 seconds, in ticks. Derived from TICK_HZ rather than typed as
 * `150` so a tick-rate change cannot silently turn it into 2.5 seconds.
 *
 * ⚠️ This is THE knob the feature is: widen it to Infinity and every kill in a
 * round chains, which is exactly the regression `killCombo.test.ts` mutates for.
 */
export const KILL_COMBO_WINDOW_TICKS = 5 * TICK_HZ;

/**
 * The same window in milliseconds, for the DISPLAY side. The HUD has to know
 * when to take the number off screen and it lives in wall-clock, so it imports
 * this constant instead of restating 5000 — one edit moves both halves.
 */
export const KILL_COMBO_WINDOW_MS = (KILL_COMBO_WINDOW_TICKS * 1000) / TICK_HZ;

/**
 * Below this the number is not a combo, it is just a kill. A permanent 「1
 * 連殺」 hanging in the middle of the screen after every single zombie would be
 * noise, and it would make the 「2」 that follows read as a decrement rather
 * than a chain. The SIM still counts from 1 (it has to, or the second kill
 * cannot know it is the second) — this threshold is what the DISPLAY honours.
 */
export const KILL_COMBO_MIN_SHOWN = 2;

/** Per-killer combo bookkeeping. Same shape as `world.killTracking`, on purpose. */
export interface KillComboState {
  /** `world.tick` of the most recent kill credited to this killer. */
  lastKillTick: number;
  /** length of the chain including that kill (>= 1). */
  count: number;
}

/** What kind of thing was killed. Both feed the SAME counter (owner's ruling). */
export type KillComboVictim = "mob" | "champion";

/**
 * PURE: the chain length after a kill at `tick`, given the previous state.
 *
 * `<=` and not `<`: an AoE that kills six zombies in ONE tick has a delta of 0
 * between each credit, and those six MUST chain — that is the round-9 sweep the
 * owner is asking for. A strict `<` would still chain them (0 < 150), but the
 * boundary that matters is the other end: a kill exactly 150 ticks (5.000 s)
 * after the previous one is 「間隔5秒內」 and chains.
 */
export function nextComboCount(prev: KillComboState | undefined, tick: number): number {
  if (!prev) return 1;
  const elapsed = tick - prev.lastKillTick;
  return elapsed <= KILL_COMBO_WINDOW_TICKS ? prev.count + 1 : 1;
}

/**
 * PURE: is a combo recorded at `lastKillTick` still live at `tick`? Used by
 * `killComboOf` and by the tests; the display side answers the same question in
 * milliseconds (ui/hud/killComboModel).
 */
export function comboAlive(state: KillComboState | undefined, tick: number): boolean {
  return !!state && tick - state.lastKillTick <= KILL_COMBO_WINDOW_TICKS;
}

/**
 * Credit ONE kill to `killer` and emit the `killCombo` event the HUD renders.
 *
 * Called from exactly two places, which is the whole feature:
 *   • `systems/DeathSystem.ts` — champion victims (the kill-credit branch);
 *   • `systems/MobSystem.ts`   — mob victims (the payout branch, beside mobKills).
 * Both are already the single deciding point for "who killed what", so there is
 * no third opinion about kill credit anywhere.
 *
 * Returns the new count so a caller can assert on it without re-reading the map.
 */
export function creditKillCombo(
  world: SimWorld,
  killer: EntityId,
  victim: EntityId,
  victimKind: KillComboVictim,
): number {
  const tick = world.tick;
  const count = nextComboCount(world.killCombo.get(killer), tick);
  world.killCombo.set(killer, { lastKillTick: tick, count });
  world.emit("killCombo", {
    killer,
    // seat id so the client can tell 「my combo」 from 「someone else's」 without
    // resolving entity ids — same courtesy `mobSlain` / `guardianSlain` extend.
    killerSeatId: world.team.get(killer)?.seatId ?? -1,
    victim,
    victimKind,
    count,
    // The window travels WITH the event so the HUD never has to hard-code 5s.
    windowTicks: KILL_COMBO_WINDOW_TICKS,
    windowMs: KILL_COMBO_WINDOW_MS,
  });
  return count;
}

/** The killer's CURRENT combo at `world.tick` (0 once the window has lapsed). */
export function killComboOf(world: SimWorld, killer: EntityId): number {
  const st = world.killCombo.get(killer);
  return comboAlive(st, world.tick) ? st!.count : 0;
}
