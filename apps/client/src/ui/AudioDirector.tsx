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
 *                                        + the local champion's own kill line
 *                                        and the 觀眾歡呼 crowd cheer (#234)
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
  decideCrowdCheer,
  diffTally,
  isCombatEnd,
  isCombatStart,
  sceneForMatch,
  sceneForPlatform,
  stepCountdown,
  COUNTDOWN_INITIAL,
  type CheerTier,
  type CountdownState,
  type HealthSnapshot,
  type TallySnapshot,
} from "../audio";
import { setCombatSfxSeat } from "../audio/combatSfx";
import { playContextualVoice } from "../audio/contextualVoice";
import { closeRoundEndVoiceBeat, openRoundEndVoiceBeat } from "../audio/roundEndVoice";
import {
  useAudioArena,
  useAudioBoot,
  useAudioScene,
  useBgmOverride,
  useLoginTheme,
} from "./useAudio";

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
  // GH#531 — which arena is being played. A per-ROUND string, so this is a
  // discrete projection like every other input here, not a per-frame read.
  const mapId = useHud((s) => s.mapId);
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
  // ⭐ The arena must be told to the mixer BEFORE the scene, so that when the
  // intermission→combat edge fires, `playBgm("combat")` already resolves to
  // this round's own battle theme instead of starting the shared bed and
  // crossfading again a frame later. React runs effects in declaration order,
  // which is what makes "before" mean anything here.
  useAudioArena(mapId || null);
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
      // …and no fight ambience follows you out (task #216). Leaving mid-combat
      // (exit to lobby, a bounced join) never crosses the combat→x phase edge,
      // so this is the second, screen-level teardown of the same beds.
      audioSystem.stopSustainedSfx();
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
    // COMBAT TEARDOWN (task #216). The fight's SUSTAINED beds — the ~60 s
    // `fireRingLoop` lit at ring ignition and the ~38 s `arenaAmbience` started
    // with the round — are one-shot clips long enough to outlive the round that
    // started them, and until now nothing could stop a started SFX at all. So a
    // round settling inside that window carried burning fire through 結算 and
    // into the shop, which is exactly what the owner heard. The edge (not a
    // phase test) is the seam: leaving combat for ANY phase ends them.
    if (isCombatEnd(prev, phase)) audioSystem.stopSustainedSfx();
    // GH#527 —— 回合結束那一拍的**開與關**。owner 2026-08-22:「回合結束只播放角色
    // 自己語音，不要播放機械語音，重複播放太吵了」。決策整個住在
    // `audio/roundEndVoice`（三支播放器各自去問它一次）；這裡只發出「現在是那一拍」
    // 這個訊號 —— 這個元件本來就是全 app 唯一持有 phase 的音訊擁有者，而它已經用
    // 同一個形狀把座位 id 發給 `combatSfx.setCombatSfxSeat` 了。
    // ⚠️ 必須**兩個邊緣都發**：只開不關的話，比賽結束的結算（`matchEnd`）與選角
    // 確認的名言會被回合結束的政策一起關掉，而那不是 owner 講的東西。
    if (phase === "resolution") openRoundEndVoiceBeat();
    else if (prev === "resolution") closeRoundEndVoiceBeat();
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
  const killStreak = useRef<number>(0);
  const everKilled = useRef<boolean>(false);
  // Crowd-cheer throttle state (#234). Kept SEPARATE from the kill/multiKill
  // announcer keys on purpose: the SfxGate cooldown is cross-frame and keyed on
  // the event string, so a new population poured into an existing key starves
  // the incumbent. The rule itself is the pure `decideCrowdCheer`.
  const lastCheerMs = useRef<number | null>(null);
  const lastCheerTier = useRef<CheerTier>(0);
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
    const res = diffTally(prevTally.current, next, {
      nowMs,
      lastKillMs: lastKillMs.current,
      killStreak: killStreak.current,
      everKilled: everKilled.current,
    });
    prevTally.current = next;
    lastKillMs.current = res.lastKillMs;
    killStreak.current = res.killStreak;
    everKilled.current = res.everKilled;
    // A seat change is a NEW match: re-baseline the cheer window too, or a
    // stale timestamp from the previous match could swallow the first cheer of
    // this one (diffTally already returns killVoice = null on that transition,
    // so nothing sounds while we reset).
    if (res.rebaselined) {
      lastCheerMs.current = null;
      lastCheerTier.current = 0;
    }
    for (const ev of res.events) {
      audioSystem.playSfx(ev);
      // #51 stingers LAYER under the VO these tally events already fire (their
      // own keys, kept out of the VO-only levelUp/exUnlock pools per the ledger).
      if (ev === "levelUp") audioSystem.playSfx("levelUpJingle");
      else if (ev === "exUnlock") audioSystem.playSfx("exUnlockSting");
    }
    // CONTEXTUAL VOICE — the LOCAL champion's own kill-N / first-blood /
    // unstoppable line (celebratory, always fires past the throttle). Only the
    // local streak talks; a seat change re-baselines killVoice to null.
    if (res.killVoice && localChampionId) playContextualVoice(localChampionId, res.killVoice);
    // 周圍觀眾歡呼 (#234) — the arena reacting to MY kill, alongside my own
    // champion's line. Deliberately NOT fired for an ally's or an enemy's kill:
    // `hudStore.kills` tallies every seat, so those are observable, but a cheer
    // per body in a twelve-champion fight is the "wall of noise" the owner ruled
    // out (and the streak refs above are single-seat by construction). A spree
    // escalates to the LONGER, LOUDER roar rather than stacking copies — the
    // decision, including its own throttle, is the pure `decideCrowdCheer`; the
    // audio map's maxConcurrent:1 + 2.4 s cooldown is the second guard.
    const cheer = decideCrowdCheer({
      killVoice: res.killVoice,
      killStreak: res.killStreak,
      nowMs,
      lastCheerMs: lastCheerMs.current,
      lastCheerTier: lastCheerTier.current,
    });
    if (cheer) {
      audioSystem.playSfx(cheer.event, { volume: cheer.volume });
      lastCheerMs.current = nowMs;
      lastCheerTier.current = cheer.tier;
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
