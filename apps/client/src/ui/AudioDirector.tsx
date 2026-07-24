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
 *
 * It does publish ONE value INTO that per-frame layer: the local seat id
 * (`setCombatSfxSeat`). The guardian's last-hit reward chime (#89) is the single
 * combat cue that is not the same for every listener, and this component is
 * already the app's one owner of "which seat am I" for audio.
 */
import { useEffect, useRef } from "react";
import { useHud } from "../net/RoomStore";
import { useApp } from "./platform/store";
import {
  audioSystem,
  crossedIntoLowHealth,
  diffTally,
  isCombatStart,
  sceneForMatch,
  sceneForPlatform,
  stepCountdown,
  COUNTDOWN_INITIAL,
  type CountdownState,
  type HealthSnapshot,
  type TallySnapshot,
} from "../audio";
import { setCombatSfxSeat } from "../audio/combatSfx";
import { useAudioBoot, useAudioScene, useBgmOverride, useLoginTheme } from "./useAudio";

export function AudioDirector(): null {
  useAudioBoot();

  const screen = useApp((s) => s.screen);
  const inRoom = useApp((s) => s.room !== null);
  // "The join actually committed": true only once the room socket is open and
  // the first authoritative state has landed (RoomStore flips it on the first
  // syncHudFromState). The screen flips to "match" the instant the seat token
  // arrives — BEFORE the join is even attempted — so keying match audio off the
  // screen alone plays a match-start greeting for a join that then bounces
  // (task #200). Gating on `connected` means the greeting only fires for a
  // match the player actually entered.
  const connected = useHud((s) => s.connected);

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
  // Local HP bar (discrete, change-guarded projections) — drives the lowHealth
  // warning cue. Primitive selectors so a bar tick can't spuriously re-render.
  const localHp = useHud((s) => s.localHp);
  const localMaxHp = useHud((s) => s.localMaxHp);
  const localAlive = useHud((s) => s.localAlive);
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

  // WHO AM I → the per-frame combat SFX layer. `guardianSlain` (#89) is fanned
  // out to every client but its 金幣獎勵 chime belongs to the ONE seat that landed
  // the last hit, so `combatSfx` needs to know which seat is listening. This is
  // the only place that already owns "the local seat" for audio purposes, so it
  // publishes it; the mapping stays a pure function of (event, seat). Cleared on
  // unmount so a torn-down director can never leave a stale seat gating a cue.
  useEffect(() => {
    setCombatSfxSeat(localSeatId);
    return () => setCombatSfxSeat(null);
  }, [localSeatId]);

  // matchStart greeting on match ENTRY — but gated on the join being COMMITTED,
  // not merely on the screen flip. The seat-token push flips `screen` to "match"
  // before the join is attempted; a join that then bounces (e.g. an expired seat
  // reservation, task #200) must not have played a match-start greeting for a
  // match the player never entered ("背後聲音那些播放" on the bounced first press).
  // So we arm on match entry and fire only when `connected` turns true. The
  // 効果音ラボ 試合開始のゴング (#51 match-start-gong) LAYERS under the Japanese
  // announcer VO — its own key, never mixed into the VO-only matchStart pool.
  //
  // Fires exactly once per entry: `greeted` re-arms only when the screen LEAVES
  // match. A "Restart match" (matchEpoch bump) keeps screen === "match" while it
  // briefly drops `connected`, so — as before this change — it does not re-greet.
  const greeted = useRef(false);
  useEffect(() => {
    if (screen !== "match") {
      greeted.current = false; // left the match: re-arm the greeting for next entry
      return;
    }
    if (connected && !greeted.current) {
      greeted.current = true;
      audioSystem.playSfx("matchStart");
      audioSystem.playSfx("matchStartGong");
    }
  }, [screen, connected]);

  // Phase-edge one-shots (match only):
  //   • intermission → combat : battleStart sting + roundStart VO
  //   • * → champSelect        : vsReveal 對戰カード bachi-bachi flourish (#51)
  //   • * → matchEnd           : match-end gong (#51), layered under the win/lose
  //                              sting `sceneForMatch` already swaps the bed to.
  const prevPhase = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = phase;
    if (prev === null) return; // first mount: no edge
    if (isCombatStart(prev, phase)) {
      audioSystem.playSting("battleStart");
      audioSystem.playSfx("roundStart");
      // Quiet arena environment bed under the combat BGM — fired once as the
      // round begins (the ~38 s clip is played as one long one-shot; the client
      // has no true SFX loop). Always appropriate: it is the room, not the fight.
      audioSystem.playSfx("arenaAmbience");
      // 重生/重新進場 — the local champion materialises into the arena at round
      // start. Gated on being alive so a spectator / bye seat stays silent. A
      // mid-round revive is NOT a phase edge, so this never doubles with the
      // global reviveComplete shimmer (#84). See the per-frame combat path for
      // reviveChannel / reviveComplete.
      if (localAlive) audioSystem.playSfx("respawn");
    }
    if (phase === "champSelect" && prev !== "champSelect") audioSystem.playSfx("vsReveal");
    if (phase === "matchEnd" && prev !== "matchEnd") audioSystem.playSfx("matchEndGong");
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    for (const ev of res.events) {
      audioSystem.playSfx(ev);
      // #51 stingers LAYER under the VO these tally events already fire (their
      // own keys, kept out of the VO-only levelUp/exUnlock pools per the ledger).
      if (ev === "levelUp") audioSystem.playSfx("levelUpJingle");
      else if (ev === "exUnlock") audioSystem.playSfx("exUnlockSting");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSeatId, localKills, localDeaths, localLevel, localExRank, allyDeaths]);

  // Low-HP warning cue: fires once as the local champion's HP crosses DOWN
  // through the danger line (a fresh spawn / respawn re-arms it). The pure
  // `crossedIntoLowHealth` owns the edge; the audio map's 3 s cooldown is a
  // second guard against a jittering bar. (#51 low-health)
  const prevHealth = useRef<HealthSnapshot>({ hp: localHp, maxHp: localMaxHp, alive: localAlive });
  useEffect(() => {
    const next: HealthSnapshot = { hp: localHp, maxHp: localMaxHp, alive: localAlive };
    if (crossedIntoLowHealth(prevHealth.current, next)) audioSystem.playSfx("lowHealth");
    prevHealth.current = next;
  }, [localHp, localMaxHp, localAlive]);

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
