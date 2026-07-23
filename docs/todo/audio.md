# Client audio system + `config.audio-map@1` — TODO

WebAudio mixer for the voxel client. A framework-free `apps/client/src/audio/**`
(NOT Babylon sound, NOT under `render/`) drives one background bed at a time
with an equal-power crossfade on scene change, and a pooled SFX layer throttled
per event so a burst of `damage`/`death` network events can never machine-gun
the mixer. All non-trivial decisions live in pure modules (`audioSelect`,
`audioSettings`, `scene`) so vitest covers them without a browser; `AudioSystem`
is the thin imperative shell over the WebAudio graph
(`ctx → master → {bgmBus, sfxBus} → per-voice gain`).

Content binds it: `content/config/audio-map.json` (`config.audio-map@1`, a new
member of the `config` discriminated union) maps `bgm[scene] → track` and
`sfx[event] → {files[], gain?, cooldownMs?, maxConcurrent?}`. Scenes drive BGM
(menu/lobby/room/champSelect/intermission/combat/fireRing/settlement +
one-shot stings battleStart/victory/defeat); events drive SFX (the server's
MSG.EVENT whitelist plus client-only moments kill/multiKill/allySlain/
champSelectConfirm/matchStart/roundStart/taunt).

Assets (staged under `content/assets/audio/`, documented in that dir's README):
11 CC0 music beds (`bgm/`, provenance in `bgm/MANIFEST.json`); the 21 imported
GoDieEX22s.w3x Chinese voice quips (`sfx/*.mp3`) bound to kills/deaths/announces;
and 11 procedurally-synthesised non-verbal combat clips (`sfx/fx/*.wav`,
deterministic `GENERATE.sh` + `MANIFEST.json`) for the mechanical events
(swing/hit/tick/launch/impact/cast) that no voice quip could legibly cover.
Per-event `gain` was set from measured integrated loudness + true-peak so loud
clippers (87joke +5.2 dBTP) can't overshoot and quiet stings (4die -20.4 LUFS)
still land — no source file was re-encoded.

Autoplay: buffers are fetched/decoded eagerly but the `AudioContext` is only
`resume()`d on the first pointer/key gesture, which also starts whatever scene
is current then. Everything degrades to silence — a 404 clip, a missing map, or
a browser without WebAudio all no-op; audio never throws into a caller. Master /
BGM / SFX sliders + a mute toggle live in the existing settings panel
(`ui/SettingsScreen`), persisted to their own localStorage key
(`ggd.audio`, defaults master .8 / bgm .5 / sfx .9). The `AudioDirector`
(render-less, mounted once at `AppRoot`) turns discrete store transitions —
platform screen, match phase, K/D tally — into scene changes + SFX; nothing
audio touches the per-frame path.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| au-01 | Event→file selection incl. seeded random-pick determinism (injected rng) | audio-select-file | unit | done |
| au-02 | Per-event cooldownMs gating drops a same-window burst, allows after | audio-cooldown-gate | unit | done |
| au-03 | maxConcurrent caps simultaneous voices; a release frees a slot | audio-maxconcurrent-cap | unit | done |
| au-04 | Equal-power crossfade gain curves: endpoints exact, monotonic, sum≈const | audio-crossfade-math | unit | done |
| au-05 | Volume math: master×bus×clip product; mute → 0; inputs clamped 0..1 | audio-volume-math | unit | done |
| au-06 | Mixer settings persistence round-trip (localStorage) + partial/garbage clamp | audio-volume-persistence | unit | done |
| au-07 | Schema parse of a `config.audio-map@1` sample doc (+ reject bad paths/keys) | audio-schema-parse | unit | done |
| au-08 | Graceful no-op on a missing file / missing map / no AudioContext (never throws) | audio-missing-file | exception | done |
| au-09 | Scene mapping: screen/phase → BGM scene (fireRing swap, victory/defeat, sting edge) | audio-scene-map | unit | done |
| au-10 | BGM bed: scene change swaps once, same scene is a no-op (loop never restarts) | audio-bgm-swap | unit | done |
| au-11 | Autoplay unlock: no AudioContext before a gesture; scene starts on unlock() | audio-unlock | unit | done |
| au-12 | Authored `content/config/audio-map.json` parses against `config.audio-map@1` (id/schema) | audio-map-doc-valid | unit | done |
| au-13 | All 11 BGM scenes authored; loop flags match `bgm/MANIFEST.json`; loop:false set = battleStart/victory/defeat | audio-map-bgm-scenes | unit | done |
| au-14 | Every whitelisted MSG.EVENT is bound to a non-empty SFX pool | audio-map-event-coverage | unit | done |
| au-15 | Every referenced bgm/sfx path starts with `assets/` and exists on disk | audio-map-files-exist | integration | done |
| au-16 | High-frequency combat events (damage/basicAttack/hit/projectile) carry cooldownMs + a small maxConcurrent | audio-map-throttle | unit | done |
| au-17 | attack/hit/damage/level-up map to distinct clips; death pool disjoint from the mechanical fx (legibility) | audio-map-legible-events | unit | done |
| au-18 | Every one of the 21 imported w3x voice clips is bound somewhere (none stranded) | audio-map-w3x-complete | unit | done |
| au-19 | All 21 w3x clips staged as real, non-empty MP3s (ID3/frame-sync header) | audio-sfx-real-mp3 | unit | done |
| au-20 | Synthesised fx clips are mono 16-bit 44.1 kHz PCM WAV | audio-fx-pcm-wav | unit | done |
| au-21 | HUD-tally → SFX edges: kill / death / allySlain / levelUp (1→2, not the 0→1 assignment) / exUnlock (0→1) fire on their discrete increases, in a stable order | audio-tally-edges | unit | done |
| au-22 | Two local kills inside `MULTIKILL_WINDOW_MS` upgrade kill→multiKill; outside the window stays a plain kill | audio-tally-multikill | unit | done |
| au-23 | A seat change (new match) re-baselines the tally silently — a reset K/D never replays as a flurry of quips | audio-tally-rebaseline | unit | done |
| au-24 | Champ-select last 5 s: 5/4/3/2 fire `countTick` at strictly increasing volume, the final second fires the distinct `countFinal` at 1.0; a mid-countdown mount picks up where it is | audio-countdown-cue | unit | done |
| au-25 | Once-per-second guard: re-renders, 20 Hz snapshot repeats and backwards timer jitter never double-fire; the guard rearms on phase change / clock reset; mute + the unlock gate still silence it | audio-countdown-guard | unit | done |
| au-26 | `countTick`/`countFinal` are authored as two DISTINCT single-clip pools with a sub-second cooldown and a tiny voice cap | audio-countdown-map | unit | done |
| au-27 | Pressing Ready silences the four nagging ticks and keeps ONLY the final "brace" cue; a suppressed second is consumed, not queued; champ select is not commitable | audio-countdown-committed | unit | done |
| au-28 | Looping bed re-entering a scene resumes in phase (source starts at elapsed mod duration) so the extended B-section plays across rounds instead of restarting bar 0; one-shot stings + first visits start at 0; authored silence still advances the scene clock | audio-bgm-loop-resume | unit | done |
| au-29 | Test-mode force-silence gate (VITE_GGD_SILENT / window.__GGD_SILENT__ / ?silent), read once at construction: AudioContext never created (contextState null, playSfx/playBgm/playClip/playSting no-op) and nameVoice's out-of-graph HTMLAudioElement never created; unset = unchanged | audio-test-silence | unit | done |
| au-30 | Hit-feel P1 weight tiers: hit-light/medium/heavy/crit + block-hit bound to distinct single, throttled clips (own fx/*.wav); the ringing lab block samples are no longer any clip's block voice | audio-map-hit-tiers | unit | done |
| au-31 | SFX load PER SCENE (task #63): boot fetches ZERO sfx (down from the whole ~80-clip / ~2.5 MB set); a small always-on UI core warms on unlock; each BGM scene warms only its own subset on entry (`sfxManifest` → `preloadSceneSfx`); preload never creates the AudioContext before the gesture and never gates — an unlisted / not-yet-warmed cue still lazy-loads on first `playSfx`. Manifest events all resolve in the shipped audio-map | audio-sfx-scene-preload | integration | done |

The seven **system/announcer broadcast** events (`matchStart`, `roundStart`,
`levelUp`, `death`, `multiKill`, `allySlain`, `exUnlock`) are bound here but are
owned by their own pack — the map bindings, the staged clips and the map-flavour
pools that received the displaced w3x quips are all gated by
[announcer-vo.md](announcer-vo.md) (av-01..av-12).

## Champ-select countdown (task #30)

The last five seconds of champ select are audible: **5 s / 4 s / 3 s / 2 s** play
`countTick` at **0.45 / 0.60 / 0.75 / 0.90**, and the **final second** plays the
higher, ~3× longer `countFinal` at **1.0** — so the run-up gets progressively
louder and the last beat is unmistakably a different sound. Both clips are new
procedural members of the `sfx/fx/` set (`count-tick.wav` 880 Hz / 150 ms,
`count-final.wav` 1320 Hz / 420 ms, same deterministic `GENERATE.sh`, both
peak-normalised to −3 dBFS); the rising loudness is the per-call `volume` option
on `playSfx`, never a differently-rendered file. Both are narrow-band tonal
rather than noise transients because they are the only clips in the set designed
to be heard **over** a music bed (the champSelect BGM).

The countdown's source of truth is the HUD store's `phaseSecondsLeft`
(`apps/client/src/net/RoomStore.ts`, `ceil(phaseTicksLeft / TICK_HZ)` from the
server snapshot) — the same value `PhaseTimer` renders. The decision is pure
(`apps/client/src/audio/countdownCue.ts`); `AudioDirector` is a two-line shell
holding the guard in a ref. A cue fires only when the clock has **strictly
descended** past the last second fired, which is what makes React re-renders,
20 Hz snapshot repeats and 3→4→3 jitter all no-ops, and makes the volume ramp
monotonic by construction. The guard **rearms** whenever the countdown is not
running (a non-`champSelect` phase, or a champSelect clock above 5 s), so the
next champ select — next match or a restarted timer — counts down again.

**Mid-phase mount is deliberately NOT silent**: if the screen appears with 3 s
left (reconnect, late join, hot reload) the cue fires from wherever it picks up,
at that second's volume, still ending on `countFinal`. Nothing sounds at 0 s
(the 1 s cue is the reaction moment), and everything still rides the SFX bus, so
mute and the first-gesture autoplay unlock suppress it like any other SFX.

**COMMITTED — Ready silences the nagging (task #95).** Task #38 put the
intermission in `COUNTDOWN_PHASES`, so the same bells now ring **every round**
rather than once a match. Ringing four escalating alarms at a player who already
pressed Ready is crying wolf: they answered the question, and the phase is only
still running because someone *else* has not. A committed sample therefore drops
the ticks and keeps the single `countFinal`, because the two cues say different
things — ticks mean *act* (already answered), the race-start trill means *brace*
(combat starts NOW, still true). The guard advances over the suppressed seconds,
so nothing queues up to fire late. Scoped to the intermission in `AudioDirector`
(`phase === "intermission" && localReady`): champ select has no Ready, and a
stale seat flag must never silence the one countdown that costs you a champion.
The picture follows the same rule — see
[intermission.md](intermission.md) and `ui/panels/prepCountdown.ts`.

## Integration (wiring to real app state + live proof)

`AudioDirector` (render-less, mounted once at `AppRoot`) is the only wiring
seam. It reads DISCRETE store projections and drives audio:

- **BGM** ← platform `store.screen` (auth→menu, lobby, room) + HUD `phase`
  (champSelect/intermission/combat/settlement) + round timer (last 30 s of
  combat → `fireRing`) + team `placement` (matchEnd → victory/defeat). One
  `useAudioScene` owns the bed. Proven live end-to-end in an offline bot match:
  the bed crossfaded **menu → champSelect → intermission → combat →
  battleStart(sting) → fireRing → settlement → victory**, every bed fetched 200.
- **Discrete SFX** ← `diffTally` over the HUD K/D/level/EX/ally tally
  (kill/multiKill/death/allySlain/levelUp/exUnlock), champion pick
  (champSelectConfirm), the intermission→combat edge (battleStart sting +
  roundStart), and the shell→match edge (matchStart). Of the 15 server
  `MSG.EVENT` keys, `levelUp` and `exUnlock` reach a legal discrete seam (the
  seat projection) and are wired here; the rest are combat-rate.

**Known gap — low-level combat SFX not auto-wired.** `damage`, `basicAttack`,
`basicAttackHit`, `projectileSpawn`, `projectileHit`, `attackWindup`,
`castBegin/End/Interrupt`, `abilityCast`, `flowerSpawn`, `flowerBurst` exist
ONLY in the per-frame `MSG.EVENT` drain inside `GameApp.frame()`
(`apps/client/src/GameApp.ts`), which is outside the audio job's ownership and
has no read-only public seam carrying raw events. The clips + pools + gains are
authored and the engine plays them (verified live via `playSfx`), but the
auto-trigger is deferred to a one-line drain-loop call
(`audioSystem.playSfx(ev.type)`) — see the handoff.

## Login / menu chrome SFX (task #20)

Five third-party **CC0** clips staged for the login screen's immersion pass and
bound as new `sfx` events in `audio-map.json` (playable now via
`audioSystem.playSfx("<event>")`; the `AudioEvent` union in `audio/types.ts`
lists them for compile-time convenience). All mono 44.1 kHz MP3, edge-trimmed,
peak-normalised only — relative loudness is the per-event `gain`, as elsewhere.
Full provenance + per-clip processing in `content/assets/CREDITS.md`.

| event | clip(s) | source (all CC0) | gain | notes |
| --- | --- | --- | --- | --- |
| `dragonRoar` | `dragon-roar.mp3` (3.4 s) + `dragon-roar2.mp3` (0.9 s) | OpenGameArt — trazzz123 "CC0 Deep Monster Roar" + rubberduck "80 CC0 creature SFX #2" | 0.85 | 2-clip pool for near/far boss dragons; roar2 pitched −8 % for a distinct, deeper far-roar |
| `uiClick` | `ui-click.mp3` (0.10 s) | Kenney **UI Audio** (`click1`) | 0.55 | button press |
| `uiHover` | `ui-hover.mp3` (0.24 s) | Kenney **UI Audio** (`rollover1`) | 0.30 | soft hover/focus tick (subtle) |
| `uiType` | `ui-type.mp3` (0.045 s) | Kenney **Interface Sounds** (`tick_001`) | 0.25 | subtle keystroke tick |

**Remaining (wiring, not assets).** Playback triggers on the login screen —
`AuthScreen.tsx` field-focus/hover → `uiHover`, button press → `uiClick`,
keystroke → `uiType`, and the `LoginScene` near/far dragons → `dragonRoar` — are
the code half of task #20 (alongside the ride-dragon enter transition). The
assets, map bindings, and event names are in place; those are one-line
`playSfx(...)` calls once the menu gets an unlocked audio seam. Login-screen
audio must respect the same first-gesture `AudioContext` unlock as the rest of
the mixer (buffers warm per scene from the unlock onward — see au-31; nothing
sounds before a user gesture).
