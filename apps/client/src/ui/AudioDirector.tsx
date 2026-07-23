/**
 * AudioDirector — the single audio conductor for the whole app. A render-less
 * component (mounted once at AppRoot, above the screen switch) that turns
 * DISCRETE store transitions into BGM scene changes and one-shot SFX:
 *
 *   platform screen (auth/lobby/room)  → menu / lobby / room beds
 *   ranked-ladder panel, while shown   → menuNocturne (a mounted-screen override)
 *   match phase                        → champSelect/intermission/combat/
 *                                        fireRing/settlement/victory/defeat
 *   → combat                           → battleStart sting + combat bed under it
 *   screen → match                     → matchStart greeting
 *   local K/D tally                    → kill / multiKill / death / allySlain
 *   local level / EX rank              → levelUp / exUnlock
 *   local champion pick                → champSelectConfirm
 *   prep-phase last 5 s                → countTick ×4 (rising) then countFinal
 *                                        (champ select + the shop window; the
 *                                        ticks go quiet once you press Ready)
 *
 * It reads only change-guarded, discrete-rate projections (screen, phase,
 * phase seconds, K/D tallies, level, EX rank) — never per-frame data — so audio
 * can never sit in the hot path (client-08). One `useAudioScene` call owns the
 * bed, so the platform and match sources never fight over it. The low-level
 * combat SFX (attack/hit/cast/projectile/flower/damage) live only in the
 * per-frame MSG.EVENT drain (GameApp) and are intentionally NOT driven here.
 */
import { useEffect, useRef } from "react";
import { useHud } from "../net/RoomStore";
import { useApp } from "./platform/store";
import {
  audioSystem,
  diffTally,
  isCombatStart,
  sceneForMatch,
  sceneForPlatform,
  stepCountdown,
  COUNTDOWN_INITIAL,
  type CountdownState,
  type TallySnapshot,
} from "../audio";
import { useAudioBoot, useAudioScene, useBgmOverride, useLoginTheme } from "./useAudio";

export function AudioDirector(): null {
  useAudioBoot();

  const screen = useApp((s) => s.screen);
  const inRoom = useApp((s) => s.room !== null);

  const phase = useHud((s) => s.phase);
  const phaseSecondsLeft = useHud((s) => s.phaseSecondsLeft);
  const localSeatId = useHud((s) => s.localSeatId);
  const placement = useHud((s) => {
    if (s.localSeatId === null) return 0;
    const seat = s.seats.find((x) => x.seatId === s.localSeatId);
    if (!seat) return 0;
    return s.teams.find((t) => t.teamId === seat.teamId)?.placement ?? 0;
  });
  const localChampionId = useHud((s) =>
    s.localSeatId === null ? "" : (s.seats.find((x) => x.seatId === s.localSeatId)?.championId ?? ""),
  );
  const localKills = useHud((s) => (s.localSeatId === null ? 0 : (s.kills[s.localSeatId] ?? 0)));
  const localDeaths = useHud((s) => (s.localSeatId === null ? 0 : (s.deaths[s.localSeatId] ?? 0)));
  const localLevel = useHud((s) => {
    if (s.localSeatId === null) return 0;
    return s.seats.find((x) => x.seatId === s.localSeatId)?.level ?? 0;
  });
  const localExRank = useHud((s) => {
    if (s.localSeatId === null) return 0;
    return s.seats.find((x) => x.seatId === s.localSeatId)?.exRank ?? 0;
  });
  // Ready = "I have answered the prep window's question" (task #95). A single
  // boolean, flipped at most once per round → still a discrete projection.
  const localReady = useHud((s) => {
    if (s.localSeatId === null) return false;
    return s.seats.find((x) => x.seatId === s.localSeatId)?.ready ?? false;
  });
  // teammate deaths: same team, not the local seat (a primitive sum → no
  // spurious re-renders vs. returning an object selector).
  const allyDeaths = useHud((s) => {
    if (s.localSeatId === null) return 0;
    const seat = s.seats.find((x) => x.seatId === s.localSeatId);
    if (!seat) return 0;
    let total = 0;
    for (const x of s.seats) {
      if (x.teamId === seat.teamId && x.seatId !== s.localSeatId) total += s.deaths[x.seatId] ?? 0;
    }
    return total;
  });

  // ONE bed driver: in a match the phase picks the scene, otherwise the
  // platform screen does. sceneForPlatform returns null while screen==="match",
  // so the two sources never overlap.
  const platformScene = screen === "match" ? null : sceneForPlatform({ screen, inRoom });
  // Login is a SINGLE theme now (task #134 moved the nocturne to the ladder), so
  // sceneForPlatform's "menu" is the whole answer; the rotation is kept as a
  // trivial holder of `menu` (see audio/loginRotation) and still owns its clock.
  const loginTheme = useLoginTheme(platformScene === "menu");
  const derivedScene =
    screen === "match"
      ? sceneForMatch({ phase, phaseSecondsLeft, placement })
      : platformScene === "menu"
        ? loginTheme
        : platformScene;
  // A mounted screen (the ranked ladder → menuNocturne) can request a bespoke
  // bed; it wins over the derived scene while it is up and releases on unmount,
  // at which point derivedScene takes back over. The ladder only ever mounts in
  // the lobby, so this never collides with a match scene. (task #134)
  const override = useBgmOverride();
  const scene = override ?? derivedScene;
  useAudioScene(scene);

  // matchStart greeting on the shell → match entry (fires once per match).
  const prevScreen = useRef(screen);
  useEffect(() => {
    if (screen === "match" && prevScreen.current !== "match") audioSystem.playSfx("matchStart");
    prevScreen.current = screen;
  }, [screen]);

  // battleStart sting on the intermission → combat edge (match only).
  const prevPhase = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = phase;
    if (prev === null) return; // first mount: no edge
    if (isCombatStart(prev, phase)) {
      audioSystem.playSting("battleStart");
      audioSystem.playSfx("roundStart");
    }
  }, [phase]);

  // Consolidated tally → SFX: kill/multiKill, death, allySlain, levelUp,
  // exUnlock. A seat change (new match) re-baselines silently. All decisions
  // live in the pure `diffTally`; this effect is just the imperative shell.
  const prevTally = useRef<TallySnapshot>({
    seatId: localSeatId,
    kills: localKills,
    deaths: localDeaths,
    level: localLevel,
    exRank: localExRank,
    allyDeaths,
  });
  const lastKillMs = useRef<number | null>(null);
  useEffect(() => {
    const next: TallySnapshot = {
      seatId: localSeatId,
      kills: localKills,
      deaths: localDeaths,
      level: localLevel,
      exRank: localExRank,
      allyDeaths,
    };
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    const res = diffTally(prevTally.current, next, { nowMs, lastKillMs: lastKillMs.current });
    prevTally.current = next;
    lastKillMs.current = res.lastKillMs;
    for (const ev of res.events) audioSystem.playSfx(ev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSeatId, localKills, localDeaths, localLevel, localExRank, allyDeaths]);

  // prep-phase countdown (champ select + the intermission shop window): 5/4/3/2 s
  // tick louder each second, the last second is the distinct countFinal at full
  // volume. The once-per-second guard (and its rearm on phase change / clock
  // reset) lives in the pure `stepCountdown`, so a React re-render or a repeated
  // a snapshot repeat can never double-fire.
  //
  // COMMITTED (#95): once you press Ready the prep window is no longer YOUR
  // deadline — it is only still running because someone else has not answered.
  // The four nagging ticks are dropped and only the final "brace" cue survives.
  // Scoped to the intermission on purpose: champ select has no Ready, and a
  // stale seat flag must never be able to silence the one countdown that
  // actually costs you your champion.
  const committed = phase === "intermission" && localReady;
  const countdown = useRef<CountdownState>(COUNTDOWN_INITIAL);
  useEffect(() => {
    const { cue, next } = stepCountdown(countdown.current, {
      phase,
      secondsLeft: phaseSecondsLeft,
      committed,
    });
    countdown.current = next;
    if (cue) audioSystem.playSfx(cue.event, { volume: cue.volume });
  }, [phase, phaseSecondsLeft, committed]);

  // champion locked in during champ select.
  const prevPick = useRef(localChampionId);
  useEffect(() => {
    if (localChampionId && localChampionId !== prevPick.current) {
      audioSystem.playSfx("champSelectConfirm");
    }
    prevPick.current = localChampionId;
  }, [localChampionId]);

  return null;
}
