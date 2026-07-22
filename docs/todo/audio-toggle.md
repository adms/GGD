# Global always-accessible audio quick-control — TODO

A tiny, always-visible music/SFX toggle pinned to the TOP layer of EVERY screen
(auth, lobby, room, champ-select, in-match, settlement), so a player can silence
the background music or the sound effects **independently in one tap** from
anywhere — without opening Settings. Requested as
「音樂跟音效開關應該放在每個畫面最上層可開關」.

Reuses the existing mixer rather than rebuilding it. `apps/client/src/audio/`
already held master/BGM/SFX volumes + a master mute with pub/sub + localStorage
(`ggd.audio`); this feature adds a minimal, additive **per-bus mute**
(`bgmMuted` / `sfxMuted`) so each bus can be silenced on its own, independent of
both the volume sliders and the master mute:

- `audio/audioSelect.ts` — `VolumeState` gains optional `bgmMuted?/sfxMuted?`
  (absent ⇒ `false`, so old blobs & existing literals stay valid);
  `effectiveGain` returns 0 for a bus whose per-bus mute is set.
- `audio/audioSettings.ts` — defaults + `clampAudioVolumes` backfill the two
  flags as `false` (backward-compatible schema); new `setBusMuted(bus, muted)` /
  `toggleBusMuted(bus)` persist + notify like the existing mute API.
- `audio/AudioSystem.ts` — `applyVolumes()` zeroes the live BGM/SFX bus gain
  node when its per-bus mute is set (slider level preserved, master untouched);
  thin `setBusMuted` / `toggleBusMuted` wrappers mirror `setMuted`/`toggleMuted`.

UI: `ui/AudioToggle.tsx` renders a compact two-button cluster (🎵 music / 🔊
SFX, each 44×44 with a diagonal "off" slash when muted, low-contrast so it never
fights the HUD). It reads live mute state via `useAudioVolumes()`, and a tap
`toggleBusMuted`s that bus **and** calls `audioSystem.unlock()` so a first-gesture
tap also kicks autoplay. Mounted ONCE in `ui/platform/AppRoot.tsx` (a sibling of
`AudioDirector`, above the screen switch) and **portaled to `<body>`** with a very
high z-index, so it escapes `#hud-root`'s stacking context and sits above the
in-match `MatchOverlay` and every overlay on every screen. The container is
`pointer-events:none` (only the buttons are tappable) so it never blocks
gameplay input; the corner offset drops below the in-match Leave/gear column and
respects mobile safe-area insets. The pure presentational `AudioToggleView` is
exported so it renders in the `node` test env via `renderToStaticMarkup`.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| at-01 | Per-bus mute round-trips through audioSettings + localStorage without disturbing the bus slider level | audio-toggle-bus-mute-persist | unit | done |
| at-02 | Music and SFX toggle independently — store state, `effectiveGain` math, and the live `AudioSystem` bus gain (master untouched) | audio-toggle-bus-independence | unit | done |
| at-03 | Default is fully unmuted; an old persisted blob lacking the keys reads unmuted (backward-compatible schema) | audio-toggle-default-unmuted | unit | done |
| at-04 | `AudioToggleView` renders the correct on/off icon state for each bus from store-derived props | audio-toggle-render-state | unit | done |
| at-05 | A slider drag reaches the PLAYING bed's bus gain on EVERY input event (never on release / next track), without restarting the source; other buses undisturbed; mute and level stay independent on the live graph | audio-toggle-volume-live | integration | done |
| at-06 | Master/music/SFX levels persist under `ggd.audio`, reload into a fresh mixer's live gains, and clamp garbage instead of NaN-ing the mix | audio-toggle-volume-persist | unit | done |
| at-07 | The tray is collapsed by default (the one-tap mutes are untouched), renders one labelled+announced slider per control when open, never an empty box, and each slider reports only its own bus | audio-toggle-tray-render | unit | done |
| at-08 | The cursor-size cell walks the shared `cursor/` ladder (no size/label/px redeclared), clamps out-of-range indices, snaps drags to integer steps, and persists through `cursorSettings` | audio-toggle-cursor-size | unit | done |
| at-09 | With the tray OPEN, the cluster stays inside the `audio-toggle` slot's declared band (⇒ disjoint from every other top-right slot) and inside the viewport at 667×375 / 812×375 / 852×393 / desktop, insets included | audio-toggle-panel-layout | regression | done |

## Expandable control tray (real-time volume + cursor size)

Follow-up request: 「在置頂音樂音效處一起可以調整大小 (音樂音量處應該也要能即時調整音樂大小)」
— the cluster must also carry the *levels*, adjustable **live**, plus the JRPG
cursor's size.

**Collapsed state is unchanged** — 🎵 / 🔊 are still one-tap per-bus mutes, and
the new 🎚 disclosure is *prepended*, so both mute buttons keep the exact screen
position they always had. Expanding opens a tray of range inputs: Master /
Music / SFX and (fine pointers only) Cursor size.

**Real time.** Each slider writes on `input` — every pointer move of a drag, not
on release:

```
slider → audioSystem.setVolume → audioSettings.patch (persist + notify)
       → AudioSystem.applyVolumes → the LIVE bus GainNode
```

The seam already existed (the AudioSystem subscribes to `audioSettings` and the
bus gain multiplies whatever bed is playing), so nothing had to be rewired — but
`applyVolumes` now *ramps* the bus over `VOLUME_RAMP_MS` (25 ms) instead of
writing `gain.value`, because a drag emits dozens of edits a second and a raw
write zippers. `AudioSystem.liveGain(bus)` was added as the read side: the test
samples it *between* drag moves to prove each one lands, and asserts no
`BufferSource` is started or stopped (a restart would drop the loop phase — the
failure mode of an engine that only reads volume at track start).

**Cursor size** is not this component's state. The tray renders
`CURSOR_SIZE_OPTIONS` and calls `setCursorSize` from the `cursor/` barrel (the
agreed seam), as an index-stepped range input, and only when
`(hover: hover) and (pointer: fine)` matches — the same query `cursor.css` is
gated on, so the control is offered exactly where it can do something.

**Layout — why the tray opens SIDEWAYS.** The cluster occupies the
`audio-toggle` slot of the top-right corner stack (`ui/hud/hudLayout`, task
#42): band `[78,122]` on fine pointers, `[96,140]` on coarse. Growing only along
X keeps the expanded tray **inside that band**, and the registry's guard test
already proves the corner's bands never overlap — so the open tray provably
cannot cover the scoreboard above it or the settings gear below it, at any
pointer type, with no new assumptions about anyone's width. A downward panel was
rejected: docked past the whole stack it would start at 208 px (fine) / 252 px
(touch), leaving ~123 px on a 375 px-tall landscape phone — not enough for four
rows without either overlapping a neighbour or running off-screen. The geometry
lives in `ui/audioClusterLayout.ts` (pure) and the sweep in its test; the tray
may never wrap to a second row, so a viewport too narrow for it scrolls
horizontally instead (`mobile.css`).

**Touch + keyboard.** The buttons stay 44×44; the range thumbs grow to 22 px on
coarse pointers and take `touch-action: none` so a drag is never stolen as a
page gesture. Range inputs are natively arrow-key operable, the disclosure
carries `aria-expanded`/`aria-controls`, each slider announces its value, and
Escape collapses the tray.

## Wiring notes

- **Mount seam:** `AppRoot` renders `<AudioToggle />` once, above the screen
  switch. `AudioToggle` portals to `document.body`, so a single mount covers all
  screens including full-screen `MatchOverlay`. In a non-DOM env (tests / SSR)
  the portal falls back to inline rendering.
- **First-gesture autoplay:** the tap handler calls `audioSystem.unlock()` before
  flipping the bus mute, so landing on any screen and immediately hitting the
  toggle both resumes a suspended `AudioContext` and applies the new mute.
- **No new state store:** per-bus mute lives in the existing `audioSettings`
  singleton under the same `ggd.audio` localStorage key; `SettingsScreen`'s
  sliders and master-mute continue to work unchanged and compose with it.
