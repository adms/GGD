# Animated isekai-anime login background (Babylon, fully procedural) — TODO

A genuinely-animated 3D background behind the login card, matching the menu
BGM's dreamy fantasy mood (異世界日本動畫風). It is **fully procedural** — NO
image, texture or model files: every sprite/sky is drawn at runtime onto a
Babylon `DynamicTexture` (`render/menu/procedural/paint.ts` → `sprites.ts`), and
every mesh is a low-poly `MeshBuilder` primitive (`builders.ts`).

**Ownership / isolation.** All new code lives under
`apps/client/src/render/menu/**`, which owns its OWN Babylon `Engine` + `Scene`
+ canvas and render loop — it never touches the gameplay
`GameApp`/`Renderer`/`ChampionView`/`CameraRig`. `AuthScreen.tsx` mounts a
`<canvas>` (absolute `inset:0`, `zIndex` below the card, `pointer-events:none`
so the form stays clickable) and constructs `LoginScene` on mount, disposing it
on unmount — so switching to lobby/match tears the menu engine down and never
leaves two engines fighting the GPU. `LoginScene` is imported directly (not via
a render barrel) to avoid colliding with the parallel gameplay-render job.

**Scene.** Dawn/sunset gradient sky dome (pink → lavender → gold), drifting soft
clouds (billboarded procedural puffs), several floating low-poly islands (grass
caps + rocky undersides + stylised trees) that bob and slowly rotate at
different phases, a large glowing counter-rotating magic circle (concentric
emissive tori + rune ticks + a glow disc), rising light motes + drifting petals
(`ParticleSystem` with a procedurally-drawn soft radial-gradient sprite), a warm
key light + cool rim light for the anime pop, and a `DefaultRenderingPipeline`
bloom for the glow. A slow continuous `ArcRotateCamera` orbit + gentle
multi-axis bob keeps it alive (client presentation, so `Math.sin/cos` are fine —
unlike the deterministic sim).

**Perf (documented choice).** The menu doesn't need retina: the render buffer is
capped at ~1.25× device pixels (`engine.setHardwareScalingLevel`), the loop is
soft-capped near 60 fps (a 120 Hz panel won't render at 120), per-frame `dt` is
clamped so a hidden→shown tab doesn't fast-forward, and rendering is **paused
entirely while the tab is hidden** (`visibilitychange`). The hot loop is
allocation-free: reused pose object + in-place vector/colour mutation, no
per-frame Babylon allocations.

**Graceful fallback.** If WebGL init throws OR
`prefers-reduced-motion: reduce`, the 3D scene is skipped and the existing
radial-gradient stays as the background (a lighter CSS-only shimmer is layered
in the WebGL-failed-but-motion-allowed case). Pure decisions live in
`render/menu/background.ts` so the skip logic is unit-tested without a DOM.

**Audio-reactive glow — deferred (noted, not risky-edited).** The magic circle's
emissive + bloom can breathe with the music, but the shared `AudioSystem`
(`apps/client/src/audio`) exposes no `AnalyserNode` tap and inserting one into
its live WebAudio graph (StrictMode double-mount, crossfade/dispose ordering)
was judged too risky for this presentation job. `LoginScene` therefore runs a
subtle **constant** sine breathing, and leaves a clean, dormant seam
(`LoginSceneOptions.getAnalyser`) so a future audio change can light it up
without touching this scene. See the handoff.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| ls-01 | Camera drift: t=0 = base pose; continuous orbit advances alpha; bob axes stay within amplitude | login-camera-drift | unit | done |
| ls-02 | Island layout is deterministic (no RNG), sized, spatially distinct, spins both ways | login-island-layout | unit | done |
| ls-03 | Island bob stays within amplitude around base y; yaw advances over time | login-island-bob | unit | done |
| ls-04 | Cloud wrap-drift advances and folds back into range for any dt (hidden-tab catch-up) | login-cloud-wrap | unit | done |
| ls-05 | Glow pulse breathes within [base, base+amp]; audio push is bounded + clamped 0..1 | login-glow-pulse | unit | done |
| ls-06 | Analyser level = byte mean normalised to 0..1 (empty → 0) | login-analyser-level | unit | done |
| ls-07 | Soft-dot / cloud painters clear + build radial gradients (opaque core → transparent rim) + fill | login-paint-softdot | unit | done |
| ls-08 | Sky painter applies every dawn/sunset stop onto a vertical linear gradient + fills | login-paint-sky | unit | done |
| ls-09 | DynamicTexture sprite generators return real textures at runtime (no image files) | login-sprite-texture | unit | done |
| ls-10 | LoginScene constructs the full procedural cast under NullEngine (no render loop until asked) | login-scene-lifecycle | integration | done |
| ls-11 | dispose() tears down engine + scene with no leak; idempotent (double-unmount safe) | login-scene-dispose | integration | done |
| ls-12 | start/stop toggles the render loop; disposed scene cannot restart | login-scene-runloop | unit | done |
| ls-13 | Scene builds islands + particles + magic rings + active camera; a pumped frame drifts the camera | login-scene-contents | integration | done |
| ls-14 | prefers-reduced-motion skips the engine entirely (static gradient); missing matcher = no preference | login-reduced-motion | unit | done |

## Task #15 — dark-epic isekai BOSS-BATTLE redesign

The dawn scene was **re-themed + recomposed into a dark boss-battle vista** (the
same modules — no rebuild): a near-black atmospheric sky (`SKY_STOPS` is now a
navy→ember dark gradient, `paint.ts`) + EXP2 depth fog + heavy bloom
(`bloomThreshold` low so emissive POPS). The islands became **glowing ARENA
islands** (dark rock spire + tiered colosseum stands with emissive lips + a
magic-circle floor + emissive-capped pillars + an up-spilling light beam, each
in a distinct `arenaAccent` hue), joined by a huge vertical **sky sigil**, a
**blood-eclipse moon**, **god-ray light shafts**, rising **embers** + drifting
**stars**, and a slow **majestic camera reveal** (`revealRadius/revealTau`).

**Boss-battle FX (`procedural/fx.ts` controllers, driven by pure schedulers in
`math.ts`)** — all staggered on independent per-index clocks so something is
always happening but never everything at once, and every `update()` is
allocation-free (reused state/scratch, in-place mutation):

- **Fire DRAGONS** (×2, `DragonController`): a segmented serpentine body sampling
  a layered-sine flight path (`writeDragonPoint`) with an ember-trail
  `ParticleSystem` and a periodic breath-fire burst.
- **BEAM / shockwave pillars** (`BeamController`): charge-glow → bright emissive
  beam cylinder → expanding shockwave ring at the muzzle (`writeBeamState`,
  `shockwaveRadius`), skyward or arena↔arena.
- **EXPLOSIONS** (`ExplosionController`): expanding emissive core + spark burst +
  lingering smoke on a loose per-index timer (`writeExplosionState`).
- **Combat FLASHES** (`CombatFlashController`): quick billboarded clash pops
  between the islands (`writeFlashState`).

Each controller returns a bloom boost the scene sums (hard-capped) so a
beam/explosion punches the bloom without ever strobing.

**Contrast fix (real bug).** A dark **scrim** layer sits between the canvas and
the card (a focused radial well behind the title+card + a gentle top/bottom
vignette, `pointer-events:none`), the card is **dark glass**
(`rgba(9,12,21,0.86)` + backdrop blur), and the GGD title / tagline / helper
text are near-white with text-shadows — legible **even when a bright beam or
explosion flares behind them**, while the epic vista still shows around the card.

**Home-page footer (`ui/platform/HomeFooter.tsx`).** © 2026 Moriyamouse/Adms
糟糕騎士團 · the 「討論區」 forum link (facebook group, `target=_blank
rel=noopener noreferrer`) · a 「版權聲明」 link to the `#credits` page, which carries
the one mandatory attribution that remains — the CC-BY 4.0 login dragon. (The footer
used to print the 音楽：魔王魂 BGM credit inline; that credit is gone — no such music
ships any more, task #91 — and the dragon's obligation moved to the linked page
instead of a wall of text over the art.) `pointer-events:none` container (links
re-enable) so it never blocks the form; wraps + respects the bottom safe-area inset.

**Photosensitivity / a11y.** `prefers-reduced-motion` still skips the engine
entirely (AuthScreen → static dark gradient, no canvas, no strobing FX);
WebGL-fail falls back to a dark (not the old bright) ember/arc shimmer.
`LoginSceneOptions.epicFx:false` is an in-scene CALM seam that omits the
dragon/beam/explosion/flash controllers. FX particle counts are capped; the
fps-cap / dt-clamp / pause-on-hidden guards from #12 are retained.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| ls-15 | SKY_STOPS is a dark low-luminance gradient (no bright dawn colour survives); scene sets EXP2 fog + near-black clear | login-dark-palette | unit | done |
| ls-16 | Camera reveal: starts pulled back by revealRadius at t=0, eases to base; absent fields = back-compat base pose | login-camera-reveal | unit | done |
| ls-17 | cycleTime folds (t+offset)→[0,period); staggerOffset spreads N emitters with distinct offsets | login-cycle-stagger | unit | done |
| ls-18 | shockwaveRadius expands 0→max, monotone, clamped outside [0,1] | login-shockwave-radius | unit | done |
| ls-19 | Beam scheduler walks charge→fire(+shockwave)→idle deterministically; staggered by offset; writes into caller struct | login-beam-schedule | unit | done |
| ls-20 | Explosion scheduler: bounded channels, fires, radius grows across a blast, sites staggered (deterministic) | login-explosion-schedule | unit | done |
| ls-21 | Flash scheduler: bounded alpha/scale pop, fires, staggered per clash point | login-flash-schedule | unit | done |
| ls-22 | Dragon path: bounded + deterministic + moving, writes into the out vector (allocation-free) | login-dragon-path | unit | done |
| ls-23 | DragonController: capped body + one ember trail; pumping frames grows no meshes/PS/materials; disposes clean | login-fx-dragon | integration | done |
| ls-24 | BeamController: 3 meshes, no particles; allocation-free per frame; disposes clean | login-fx-beam | integration | done |
| ls-25 | ExplosionController: core+smoke + capped sparks; allocation-free per frame; disposes clean | login-fx-explosion | integration | done |
| ls-26 | CombatFlashController: one capped sprite per point; allocation-free per frame; disposes clean | login-fx-flash | integration | done |
| ls-27 | LoginScene: pumping many frames grows nothing (hot loop allocation-free with all FX live) | login-fx-alloc-free | integration | done |
| ls-28 | Calm mode (epicFx:false) omits the strobing dragon/beam/explosion/flash FX; epic build creates them | login-calm-mode | integration | done |
| ls-29 | HomeFooter renders the © line, the exact 討論區 forum href (blank/noopener), and the 「版權聲明」 link to the #credits page (the mandatory CC-BY dragon credit lives there; the old 魔王魂 credit is asserted GONE); container is pointer-events:none | login-footer | unit | done |
| ls-30 | creditsData (#13): exactly ONE mandatory entry — the CC-BY 4.0 dragon, accurate (title/author/licence/url + 署名 condition); © 2026 Moriyamouse/Adms line; CC0 KayKit + 効果音ラボ terms (AI/re-cut) + self-made BGM (無須署名) as courtesy; de-duplicated; no stale 魔王魂/maou.audio | credits-data | unit | done |

## Task #20 — login immersion: dragon roars, UI/typing SFX + keystroke FX, ride-onto-island enter transition

Layered onto the dark-epic vista (no rebuild of #15). Five CC0 SFX were staged
(`sfx/dragon-roar*.mp3`, `sfx/ui-*.mp3`, CREDITS appended) and wired into
`content/config/audio-map.json` as `dragonRoar` (2-clip near/far pool),
`uiClick`, `uiHover`, `uiType`.

- **Positioned SFX** — `AudioSystem.playSfx(event, { volume?, pan? })` now scales
  the voice gain by a per-call volume and inserts a `StereoPanner` (guarded: old
  Safari without `createStereoPanner` → centred) between the voice and the SFX
  bus, so the sfx-bus mute/volume + the first-gesture unlock still gate it.
- **Dragon roars** — each `ModelDragonController` fires `onRoar(worldPos, scale)`
  on the rising edge of its breath cycle (latched, allocation-free; the 2 dragons
  are out of phase via `breathOffset`). `LoginScene` resolves NEAR/FAR volume
  (`roarVolume` by camera distance × a size nudge) + stereo pan (`panFromScreenX`
  off the world→screen projection) into a `RoarEvent`; AuthScreen (owns the
  AudioSystem) forwards it to `playSfx("dragonRoar", {volume,pan})` via the
  `onRoar` hook.
- **UI SFX + keystroke FX** (`AuthScreen`) — `uiHover` on button/input/select
  hover, `uiClick` on tab switch + button click, `uiType` on every keystroke
  (`onChange` wrapper). Each keystroke also re-triggers a lightweight CSS
  glow-pulse over the focused field (reused span per field, restart-animation
  trick — no per-keystroke DOM alloc, no typing lag); under
  `prefers-reduced-motion` the spark spans are omitted (sound still plays).
- **Enter transition** — `LoginScene.playEnterTransition(onComplete)`: a ~1.4 s
  cinematic that swoops the `ArcRotateCamera` FORWARD + zooms onto the nearest
  arena island (`enterCameraPose`/`islandApproachPose`, real-elapsed-ms so it's
  frame-skip-safe), fires ONE loud centred roar, and fades a full-screen white
  overlay in (`enterFlashAlpha`, driven onto AuthScreen's flash div via
  `onFlash`), then calls `onComplete` EXACTLY once — on completion, via a
  hard safety timer, or on dispose-mid-swoop. AuthScreen picks the path purely
  (`chooseEnterMode`: swoop / quick-flash / instant-under-reduced-motion), keeps
  its own ~1.8 s hard fallback, and switches screen in onComplete for Sign in /
  Create account / Play offline — the doLogin/doRegister/playOffline logic is
  untouched, only the screen-switch timing is wrapped.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| li-01 | Roar volume: loud near → quiet far, monotone + clamped; degenerate band → nearVolume | login-roar-volume | unit | done |
| li-02 | Pan from screen-x maps across the viewport to a clamped -1..1; non-finite/zero-width → centred | login-roar-pan | unit | done |
| li-03 | Positioned SFX: per-call volume scales the voice gain + a StereoPanner is inserted (clamped), omitting both = back-compat | audio-sfx-volume-pan | integration | done |
| li-04 | clampPan into [-1,1] + sfxVoiceMultiplier (default 1, floored 0, bad→1) | audio-sfx-pan | unit | done |
| li-05 | Shipping audio-map parses + exposes dragonRoar/uiClick/uiHover/uiType with the staged clip paths + sane cooldowns | audio-map-login-keys | unit | done |
| li-06 | Dragons roar on breath edges → onRoar fires with a bounded, finite volume+pan (ambient = not big) | login-roar-emit | integration | done |
| li-07 | Enter keyframes: eased from→to endpoints, radius zoom-in monotone, writes into the out struct | login-enter-keyframe | unit | done |
| li-08 | Flash alpha: transparent until flashStart, ramps to 1 by completion, monotone, clamped | login-enter-flash | unit | done |
| li-09 | Island approach pose zooms in + pitches down + swings toward + looks at the island | login-enter-approach | unit | done |
| li-10 | chooseEnterMode: reduced-motion → instant; else swoop (scene live) / quick flash | login-enter-reduced | unit | done |
| li-11 | playEnterTransition swoops, drives the flash to 1, fires a big roar + onComplete exactly once | login-enter-transition | integration | done |
| li-12 | onComplete ALWAYS fires: immediately on a disposed scene; on dispose-mid-swoop (hard fallback) | login-enter-oncomplete | integration | done |

## Task #26 — reverse exit transition + distinct ANGRY action-roar vs ambient long-howl

Two changes layered onto #20 (no rebuild):

- **Two DISTINCT roars.** The scripted action roars (點選動作後的龍吼 — the enter
  swoop AND the return pull-back) now play a NEW `dragonRoarBig` audio-map key —
  the staged `sfx/dragon-roar-angry.mp3` (derived CC0, 4.25 s, much louder +
  pitched-down ANGRY), gain 1.0 — while the ambient breath roars keep the
  original near/far, stereo-panned `dragonRoar` 2-clip long-howl pool
  (龍吟長嘯, 遠近之分). Routing is the pure `roarSfxKey` (`render/menu/roarSfx.ts`):
  AuthScreen's `onRoar` forwards `big → dragonRoarBig`, ambient → `dragonRoar`.
- **Reverse RETURN intro.** `LoginScene.playReturnIntro(onComplete?)`: when the
  user EXITS the app back to the login page (logout / leave match), the scene
  STARTS at the enter-transition end-state (camera close on the nearest arena
  island, `islandApproachPose`) and eases back OUT/UP to the resting sky vista
  over ~1.4 s (`returnCameraPose` — the enter lerp with endpoints swapped; the
  per-frame target is the LIVE drift pose so the hand-off back to the ambient
  drift is seamless), firing ONE big angry roar as the pull-back begins. No
  white flash. Real-elapsed-ms driven (frame-skip-safe) with the same
  exactly-once `onComplete` guarantees as the enter swoop (safety timer +
  dispose-mid-pull-back). AuthScreen decides cold-load vs app-return via a
  passive, additive screen-history tracker (`ui/platform/screenHistory.ts` — an
  `appStore.subscribe` observer, NO store edits): `boot → auth` keeps the gentle
  reveal, `lobby/match → auth` plays the return intro. Fallbacks
  (`chooseReturnMode`): reduced-motion / WebGL-off skip the swoop, show the
  login immediately, and still play a soft `dragonRoarBig` (SFX-bus mute still
  gates it).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| li-13 | Return keyframes are the inverse of enter: start ≈ enter end-state, end ≈ resting vista, radius zoom-OUT monotone, same easing | login-return-keyframe | unit | done |
| li-14 | chooseReturnMode: reduced-motion / WebGL-off → skip; scene live + motion → swoop | login-return-mode | unit | done |
| li-15 | onRoar routing: big → dragonRoarBig, ambient → dragonRoar; soft fallback volume bounded | login-roar-routing | unit | done |
| li-16 | audio-map dragonRoarBig: the distinct angry clip (NOT in the dragonRoar pool), gain > 0.85, throttled | audio-map-roar-big | unit | done |
| li-17 | playReturnIntro: starts ON the island, ONE big centred roar, eases back to the drift vista, onComplete exactly once | login-return-intro | integration | done |
| li-18 | Return intro always completes: disposed scene → immediate; dispose-mid-pull-back → exactly once | login-return-oncomplete | integration | done |
| li-19 | Return decision: cold load (boot→auth) ≠ return; lobby/match→auth = return; duplicates/mid-app never mis-fire | login-return-decision | unit | done |

## Task #88 — two-track login rotation (epic ⇄ nocturne) + the dragon clash

> **SUPERSEDED IN PART BY TASK #134 (主題曲 · 寧靜女聲 → 排行榜天梯).** The user moved
> the serene nocturne OFF the login screen: it is now the ranked-ladder bed
> (requested by `ui/platform/LeaderboardPanel` via `audio/bgmOverride`, layered
> over the derived scene in `AudioDirector`), and login plays ONLY the epic
> `menu`. So the login rotation is **single-theme** now (`LOGIN_THEMES = ["menu"]`)
> and the dragon-clash calm rule is **dormant on login** (`isCalmLoginTheme`
> never matches a live login bed — the login bed is always `menu`). The rotation
> machine and the calm rule are kept intact (they cost nothing and would relight
> verbatim for a future serene login bed); the table below is updated to the new
> reality. The prose that follows is the ORIGINAL #88 rationale, kept for history.

The auth screen alternates the epic title theme with a serene high-soprano
nocturne (`menuNocturne`, 「夕凪 / Evening Calm」). Both beds are exactly
3 763 200 samples = 85.333 s — the pack's loop grid ×2 — so ONE constant is
simultaneously a whole loop of both, and the swap always lands on a loop join.

**When the swap happens.** Timed off `audioSystem.bedStartedAtMs` (when the file
actually playing started), never off mount: the bed does not start until the
first gesture unlocks the AudioContext, which can be many seconds later. So the
first theme always gets a WHOLE loop no matter when the player clicks, and the
600 ms equal-power crossfade always sits on the one point in each file that was
written to be cut. A player who logs in fast simply never reaches the nocturne —
correct, because it is the surprise, not the identity.

**Order.** Fixed, never shuffled, and index 0 is always the epic theme: it is
the game's identity and must be what a first visit and every RETURN visit open
on. The rotation resets on leaving the screen, which is also what keeps the
scripted angry roar off the nocturne (below).

**The dragon clash.** The ambient cry's level was tuned against the epic bed and
nothing about it changed when the bed did. Measured on the real scene (headless
LoginScene, 360 s → 61 cries, 11-13 per segment after the 2 s cooldown), mixed
into the real beds through the real gain chain, a cry rises **+20.4 dB** out of
the nocturne over a 400 ms window vs **+7.3 dB** out of the epic theme, on 27 %
of the segment. Fixed with three coordinated rules in `audio/loginAmbience`
(ceiling to the scene's own far-distance level, a swept duck, and 24 s spacing)
→ 4 cries per segment at +6.6 dB worst case, i.e. quieter relative to its own
bed than the cry already is over the epic theme. The scripted ANGRY roar is
deliberately untouched: it only fires on the two screen transitions, and the
rotation reset guarantees the return-intro one lands on the epic theme.

Single-theme table (task #134); the nocturne's own bed is covered by the
ranked-ladder row `rank-ui-nocturne-bgm` in [ranking-ui.md](ranking-ui.md):

| id | item | test_id | kind | status |
| --- | --- | --- | --- | --- |
| lr-01 | Single-theme since #134: the machine holds `menu` across whole segments — there is no second track to reach — while still arming + advancing real segments | login-rotation-single-theme | unit | done |
| lr-03 | A stale bed anchor must not flip / re-swap the bed every tick; re-arming requires a DIFFERENT anchor (kept for a future 2nd login bed) | login-rotation-no-runaway | unit | done |
| lr-04 | End-to-end over the real mixer: login drives EXACTLY ONE bed, `menu`, and never the nocturne (which login no longer asks for) | login-rotation-single-bed | integration | done |
| lc-01 | Epic-theme cries pass through byte-identical — the calm rule is scoped to a serene bed only | login-calm-epic-untouched | unit | done |
| lc-02 | Serene-bed cries are clamped to the far-distance level then ducked (>18 dB down); an already-quiet cry keeps its shape | login-calm-ambient-ducked | unit | done |
| lc-03 | The scripted `big` angry roar is ducked on a serene bed, untouched on epic, and never consumes the ambient spacing budget | login-calm-big-roar-exempt | unit | done |
| lc-04 | Spacing thins a real ~5.9 s cry cadence to ≤4 per serene segment while the epic theme keeps them all | login-calm-spacing | unit | done |
| lc-05 | Calm lifts when the BGM bus is inaudible (muted / slider at 0) — the rule only ever scales a volume, never bypasses the mixer | login-calm-respects-mixer | unit | done |
| lc-06 | DORMANT ON LOGIN (#134): login opens on `menu`, so `isCalmLoginTheme(loginThemeAt(0))` is false and neither ambient nor big login roars are ever calmed | login-calm-dormant-on-login | unit | done |

## Task #74 — login→battle handoff: fade the roar behind a >=1s loading bar

When the player presses "Play offline" the long login dragon roar used to carry
straight into the combat scene's voices, because the store flipped
`screen → "match"` the instant the button fired and main.tsx boots the GameApp
(and its voices) on that flip. The handoff now goes through a loading transition:

- **Staged launch.** `beginOfflineLoading` builds the offline `MatchLaunch` and
  parks it in `matchLoading` instead of jumping to the match; `screen` stays
  `"auth"`, so AuthScreen — and the still-running login scene that owns the
  roar — remain mounted. `commitMatchLaunch` performs the actual flip.
- **Roar fade requested.** Staging sets `matchLoading.roarFadeRequested`
  immediately; AuthScreen's `emitRoar` reads it and stops layering NEW roars, so
  nothing fresh fires into the match while the roar already playing tails off.
- **>=1s loading bar.** `MatchLoadingOverlay` renders a team-colour (blue,
  `TEAM_CSS[0]` — the own-champion "this is you" cue) fill that animates for
  `MATCH_LOADING_MIN_MS` (1000ms, the minimum hold), then calls
  `commitMatchLaunch`. The in-COMBAT own-champion glow itself is a render-side
  concern (the blue team-ring); this task owns only the transition + roar fade.

### Playtest fix — the enter guard must never latch permanently

`runEnter` latches `enteringRef` so a double-click cannot fire two swoops (or two
logins), but it was only ever RELEASED on the auth-failure path. An enter that
played the cinematic and then moved the player nowhere left the guard latched for
good: on the playtest lane (port 5205) one ineffective press of "Play offline vs
bots" was followed by three presses that did nothing at all — no error, no
console line, no request to the game server — and only a page reload brought the
button back.

- **One rule, released everywhere.** `shouldReleaseEnterGuard` (pure,
  `ui/platform/enterGuard.ts`): an enter "took" only if the app left the idle
  login screen — `screen !== "auth"`, OR a launch is staged behind the loading
  bar (the offline handoff deliberately stays on `"auth"` for that hold, so a
  staged launch must KEEP the guard latched). `runEnter` applies it in a
  `finally` around `proceed`, undoing the white flash and handing the button back
  whenever nothing moved. `runEnterAuth` no longer needs its own copy of the
  reset — a failed login is just "still on auth".
- **Never silent.** A `proceed` that throws, or an offline launch that stages
  nothing, raises `ENTER_FAILED_NOTE` through the error toast (`showError`)
  instead of swallowing the click.
- **Visibly re-enabled.** The guard is now a ref (the synchronous double-click
  gate) plus a state mirror, so releasing it actually re-enables the buttons;
  both the submit button and "Play offline vs bots" read the state copy.
- **The flash can no longer re-white the screen** (a second stuck-state found
  while verifying this live). `runEnter`'s ~1.8 s hard fallback can proceed while
  the swoop is still animating — a backgrounded tab pauses the render loop
  outright, and a frame hitch is enough on its own. The scene would then paint
  the flash to full white and FREEZE there, on top of the login screen we had
  just faded back in. `flashOwnedRef` makes ownership explicit: `runEnter` grants
  it, `fadeFlashOut` revokes it, and `onFlash` writes nothing once revoked.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| li-20 | Entering a match stages the launch behind a >=1s loading bar and requests the roar fade instead of jumping straight to "match"; commit flips to the match, cancel aborts, and the overlay renders the >=1s bar only while staged | login-match-loading | unit | done |
| li-21 | The enter guard releases whenever an enter leaves the player on the idle login screen (so "Play offline vs bots" can never latch dead), stays latched while a launch is staged behind the bar or the screen has changed, and a launch that goes nowhere raises a visible, dismissible error | login-enter-guard-release | unit | done |

## Verification

- `pnpm --filter @ggd/client test` — `render/menu/**` + `ui/platform/HomeFooter`
  suites: **49 tests green** (pure math incl. the boss-battle schedulers,
  painters + dark palette, sprite generators + FX controllers on NullEngine,
  LoginScene lifecycle / dark palette / calm mode / allocation-free pump,
  reduced-motion gate, footer credits).
- `pnpm --filter @ggd/client typecheck` — clean.
- Live: `pnpm --filter @ggd/client dev` (http://localhost:39527) → the login
  screen renders the dark-epic BOSS-BATTLE vista (glowing arena islands, fire
  dragons, kamehameha beams, explosions, clash flashes, eclipse moon, god-ray
  shafts) behind a readable dark-glass card + scrim; the form stays fully
  clickable; the footer credits render over the scene; leaving auth disposes the
  menu engine (no second Babylon engine in the match).
