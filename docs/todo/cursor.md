# JRPG custom cursor (size-adjustable) — TODO

Requested as 「web 畫面中太多物件，請你設計日式 RPG 風格滑鼠游標」, with an
explicit follow-up that its **size must be adjustable**: a match screen carries a
canvas, an anchor layer, a HUD and several overlays at once, and the stock OS
arrow disappears into it.

Before this there was **no custom cursor anywhere** — no `public/cursors/`, and
every non-default `cursor:` in the client was the browser keyword `pointer` set
inline. So this is greenfield, not a re-skin.

## The design

Three variants, drawn to belong to the same world as the JRPG button skin task
#24 gave every button (`ui/buttonFx.css`: dark-indigo panel, brass/gold trim, 45°
notched corners, cyan→violet→magenta→gold cyber glow).

| variant | when | look | hotspot |
| --- | --- | --- | --- |
| `default` | everywhere else | brass-trimmed **blade pointer** — dark indigo body, gold leading edge, gold gem inset | blade tip |
| `pointer` | anything clickable | the same blade **unsheathed** — gold body, dark trim, cyan/violet bloom, and the classic JRPG **▶ selector** riding beside it | blade tip |
| `attack` | an armed attack-move over the arena | crimson **diamond reticle**, four gold spikes, gold centre pip (`.ggd-btn--danger` ramp) | dead centre |

`default` and `pointer` share one silhouette on purpose: hovering a button
changes the cursor's *material*, never its shape, so the pointer never appears to
jump.

**Visibility is the whole point**, so every variant is built the same way: a wide
near-black contour UNDER a bright trim. The dark ring survives the bright arena
floor; the bright trim survives the dark UI panels. Neither background can
swallow it.

## Assets

Authored as vector geometry in `apps/client/scripts/gen-cursors.ts` (same call as
`scripts/gen-icons.ts` — no image dependency), which emits BOTH outputs from that
one geometry table, so the SVG master and the shipped PNG cannot drift:

- `public/cursors/ggd-cursor-<variant>.svg` — vector master, design reference
  only. Safari does not support SVG in `cursor: url()`.
- `public/cursors/ggd-cursor-<variant>-<32|48|64|96>.png` — the ladder the
  browser actually loads. A cursor image renders at its intrinsic size and every
  engine ignores images past ~128px, so "bigger cursor" *means* "bigger PNG",
  and 96 is the top of the ladder deliberately. 15 files, ~28 KB total; a page
  only ever fetches the three for the active size.

Re-cut with `tsx apps/client/scripts/gen-cursors.ts`.

## Size setting (S / M / L / XL)

`cursor/cursorSettings.ts` — a versioned localStorage blob under its own key
(`ggd.cursor`), read through a forward-merging clamp, exposed as plain pub/sub
over an immutable snapshot. Exactly the `audio/audioSettings.ts` precedent, and
its own key for the same reason: the cursor has no render coupling, so a corrupt
graphics blob must never be able to take the pointer down with it. Default is
**M (48px)** — deliberately larger than the ~32px OS arrow, since "the cursor
gets lost" is the bug being fixed.

Applying is instant and reload-free: `cursor/applyCursor.ts` writes three CSS
custom properties on `<html>` and `cursor.css` only consumes them. Twelve static
rules (3 variants × 4 sizes) were rejected — the hotspot has to be re-derived per
size, and hand-writing it in both `cursorTheme.ts` and the CSS is exactly the
duplicated magic number that drifts. `cursorTheme.ts` is now the only place a
pixel coordinate exists.

## The seam (shared with the audio cluster)

The size picker is rendered by the top audio cluster (`ui/AudioToggle.tsx`), not
by this module. The agreed API is the `cursor/` barrel — no cursor state lives in
the component:

```ts
import { CURSOR_SIZE_OPTIONS, getCursorSize, setCursorSize, cursorSettings } from "../cursor";
// React: import { useCursorSize } from "./useCursor";  → { size, setSize, options }
```

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| cur-01 | Cursor size persists under `ggd.cursor` and round-trips through a fresh store for every step; subscribers fire on a real change only; a corrupt / partial / future-version blob degrades to the default instead of leaving no cursor | cursor-size-persist | unit | done |
| cur-02 | Every variant × size resolves to a file that EXISTS in `public/cursors/`, with an integral, in-bounds hotspot derived from the design coordinate, and the option list matches the ladder (XL under the ~128px engine cap) | cursor-asset-hotspot | unit | done |
| cur-03 | Applying a size changes the resolved CSS — distinct image value per variant, distinct set per size — reaches a root element through the store subscription, toggles the combat variant DOM-safely, and is wired into `main.tsx` | cursor-apply-live | unit | done |
| cur-04 | `cursor.css` is provably pointer-only: every rule sits inside `(hover: hover) and (pointer: fine)`, every declaration keeps a native keyword fallback, no gesture/layout property is smuggled in, and the one `#game-canvas` rule is variant-scoped | cursor-touch-safe | regression | done |

## Wiring notes

- **Boot:** `main.tsx` imports `cursor/cursor.css` and calls `initCursor()` before
  the first paint. `initCursor` is idempotent (StrictMode / Vite HMR safe) and a
  no-op without a DOM.
- **Inline styles:** ~20 components set `cursor: "pointer"` in an inline `style`
  object, which outranks any selector, so the interactive rule needs
  `!important`. It is scoped to `[data-ggd-cursor]` and every rule keeps the
  native keyword it replaces as the list fallback, so an unfetched PNG degrades
  to the stock cursor rather than to nothing. Disabled controls are excluded and
  given the plain blade, matching `buttonFx.css` and `widgets.tsx`.
- **Text inputs keep the native I-beam.** Caret placement is a precision job and
  a 96px blade would hide the glyph being aimed at.
- **Combat variant:** `input/InputCapture` routes every write to
  `attackMoveArmed` through one `setAttackArmed()` helper that also flips the
  cursor, so the two can never disagree (a stuck reticle after the click resolves
  is the whole failure mode). `dispose()` clears it, so leaving a match with A
  still armed cannot strand the reticle on the lobby.
- **Touch devices are untouched.** The entire stylesheet is wrapped in
  `@media (hover: hover) and (pointer: fine)`: on a phone not one rule matches,
  no cursor PNG is ever fetched, and `#game-canvas`'s `touch-action: none`, the
  ≥44px touch targets and the touch-control gestures are all unaffected —
  mechanically asserted by cur-04. A hybrid device (iPad + trackpad, Surface)
  picks the cursor up the moment a fine pointer appears, with no JS listener.
