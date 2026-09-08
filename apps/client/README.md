# @ggd/client — 3D voxel arena client

Babylon.js imperative canvas + React 18 DOM HUD + Zustand + colyseus.js.

## Dev flow

```sh
# terminal A — authoritative game server (dev mode: no ticket needed)
pnpm --filter @ggd/game-server dev

# terminal B — the client
pnpm --filter @ggd/client dev
```

Open <http://localhost:39527>. The client auto-joins (or creates) a bot-filled
`match` room on `ws://localhost:2567` (override with `VITE_GAME_WS`). Pick a
champion, then play:

| Input | Action |
| --- | --- |
| Right-click | Move (attack an enemy under the cursor) |
| A + left-click | Attack-move |
| Q / W / E / R | Quick-cast at the cursor (castType from shared ability defs) |
| S | Stop |
| B | Recall |
| Space | Toggle camera follow-lock |
| Mouse wheel | Zoom |
| Screen edges / arrow keys | Pan (when follow-lock is off) |

## JRPG cursor (`src/cursor/`)

The stock OS arrow disappears into a busy match screen, so the client ships its
own: a brass-trimmed **blade pointer**, a fully-lit gold variant with the classic
JRPG **▶ selector** for anything clickable, and a crimson **reticle** while an
attack-move is armed — all skinned to match `ui/buttonFx.css`, and all built as a
heavy dark contour under a bright trim so they stay readable on both the bright
arena floor and the dark UI panels.

**Size is a player setting** (S 32 / M 48 / L 64 / XL 96 px, default M), picked in
the top audio cluster and persisted under `localStorage["ggd.cursor"]`. Applying
it is instant: `cursor/applyCursor.ts` rewrites three CSS custom properties on
`<html>` and `cursor/cursor.css` only consumes them — no reload, no stylesheet
swap. Import from the `cursor/` barrel (`CURSOR_SIZE_OPTIONS` / `getCursorSize` /
`setCursorSize`, or `ui/useCursor`'s `useCursorSize()` in React).

The whole stylesheet is wrapped in `@media (hover: hover) and (pointer: fine)`,
so on a touch device no rule matches and not one cursor PNG is fetched.

Re-cut the art (vector geometry → SVG masters + the PNG ladder, no image
dependency) with `pnpm exec tsx apps/client/scripts/gen-cursors.ts`.

## 支援的平台（GGD 只有一份 web client）

> owner 2026-09-06（逐字）：
> 「本遊戲不支援手機但支援平板最高 30fps  手機是 30fps
>  以 ipad mini 的 A17 Pro 為最低配備標準來設計」

| 裝置 | 支援 | fps 上限（預設） |
| --- | --- | --- |
| 桌機（Mac / PC 瀏覽器） | ✅ | 60 |
| 平板（觸控） | ✅ | **30** |
| 手機 | ⛔ **不支援** | —— 進站會看到一張告知，但**不硬擋**（可以繼續） |

**最低配備標準：iPad mini (A17 Pro)。**

⭐ 這四件事（手機支不支援 · 要不要硬擋 · 判成手機的短邊門檻 · 平板 fps 上限 ·
最低配備那行字）**只有一個住處**：`content/config/model-lod.json` 的
`platformPolicy`（schema `config.model-lod@1`，後台「畫質分級」那一頁）。
⛔ 這份 README、客戶端 UI、商店頁都**不可以**再各打一次那些值 —— 上面那一行
機型名是唯一的例外，而它的權威值在 `platformPolicy.minDevice`。

消費端：`apps/client/src/render/frameCap.ts` 的 `applyPlatformPolicy()`（fps 上限
與告知政策）＋ `apps/client/src/input/mobileDetect.ts` 的 `classifyDevice()`
（哪一類裝置）＋ `apps/client/src/ui/PlatformNotice.tsx`（那張告知）。
採用點只有一個：`render/modelLod.ts` 的 `applyModelLodPolicy()`。

⚠️ **web 上分不乾淨手機與平板**，而 iPadOS 的 Safari 預設回報成桌機
（`'ontouchstart' in window` 是 false、UA 寫 `Macintosh`）—— 所以觸控判定同時看
`navigator.maxTouchPoints`，而「手機」是「觸控 **且** 短邊 < `phoneShortEdgePx`
（出貨 600 CSS px）」。⭐ 誤判的方向刻意選成**寧可放行**。

### 觸控操作

Touch controls (Wild-Rift-style) enable automatically when the device has
touch events (or a real `maxTouchPoints`) AND a coarse primary pointer
(`'ontouchstart' in window` / `navigator.maxTouchPoints > 0` +
`(pointer: coarse)`); dev harness: set `globalThis.__ggdForceTouch = true`
before the match starts to force them in an emulator. iOS Safari / iPadOS /
WKWebView only — Android is explicitly out of scope.

| Touch input | Action |
| --- | --- |
| Left half — touch + drag | Floating joystick: continuous move orders (anchor at touchstart, deadzone 0.12, radius 64px); release lets the last order finish |
| Q/W/E/R button TAP | Quick cast (same `buildCastCommand` path as mouse/pad: skillshot/dash → nearest-enemy dir or facing, ground → min(range, 6) toward facing, self, targeted → nearest) |
| Q/W/E/R press-and-drag | Aim mode: line (skillshot) / disc (ground, drag-projected point) indicator; release casts, dragging back to the button cancels |
| ⚔ button | Basic-attack nearest enemy (gamepad LT semantics) |
| ⌂ button | Recall |

Implementation seams: `input/TouchInput.ts` (pure mapping + per-identifier
state machine; per-frame joystick/aim state rides the plain-mutable
`touchFrame`, never React state), `ui/TouchControls.tsx` (button chrome +
cooldown sweeps from the discrete store), `render/AimIndicator.ts` (drag-aim
telegraph), `ui/mobile.css` (safe-area insets, ≥44px platform touch targets).

**Performance tier** — `render/RenderConfig.ts`: quality `"mobile"`
auto-detects on touch devices or ≤4-core CPUs (hardware scaling capped at
1.5x instead of 2x, particle budgets halved); override it in the in-match ⚙
settings corner (persisted in `localStorage["ggd.quality"]`).

**PWA** — `public/manifest.webmanifest` (standalone, landscape) + generated
icons (`pnpm exec tsx apps/client/scripts/gen-icons.ts`). "Add to Home
Screen" in iOS Safari gives a fullscreen landscape app. There is deliberately
NO service worker yet — offline/asset caching is future work.

**Bluetooth gamepads on iOS** work through the existing Gamepad API path
unchanged: `GamepadInput` polls `navigator.getGamepads()` from the same rAF
loop (no desktop-only assumptions), so a paired Xbox/DualSense pad drives the
match exactly like on desktop — touch controls and pad coexist, last writer
wins.

### 在真機上測試（⚠️ 手機是**開發測試**用途，⛔ 不是支援的平台）

```sh
pnpm --filter @ggd/game-server dev          # terminal A
pnpm --filter @ggd/client dev -- --host     # terminal B — LAN-exposed vite
```

Then on an **iPad** (the supported touch target) — or an iPhone, which is only
ever a debugging surface here — on the SAME Wi-Fi: open `http://<mac-ip>:5173`
(find the Mac's IP via System Settings → Wi-Fi, or `ipconfig getifaddr en0`).
Rotate to landscape (portrait shows a rotate overlay). Caveats:

- The page must be served over `http://<ip>` (not `localhost`); iOS blocks
  `ws://` mixed content only on `https://` pages, so the dev flow works as-is.
- "Add to Home Screen" for the standalone fullscreen experience; in-browser
  Safari keeps its toolbars and reserves edge swipes.
- Low Power Mode caps Safari at 30 fps — disable it when profiling. ⚠️ 平板的
  出貨上限**本來就是 30**（`platformPolicy.tabletFpsCap`），所以在平板上量 fps
  之前先確認你分得出「低耗電模式的 30」與「我們的 30」。

## Architecture (enforced by `src/architecture.test.ts`)

- `GameApp.ts` owns ONE `requestAnimationFrame` loop: drain network → advance
  interpolation clock → local prediction → `EntityViewRegistry.sync`
  (imperative transforms) → camera → vfx → `scene.render()`.
- ONLY `render/*` and `vfx/*` import `@babylonjs/*`.
- Zustand (`net/RoomStore`) carries DISCRETE-rate data only (phase, gold,
  level, cooldowns, lives, offers). Entity transforms flow schema →
  `InterpolationBuffer` → Babylon, bypassing React entirely; world-anchored
  DOM (healthbars, damage numbers) reads the plain mutable `frameBus`.
- The local champion is predicted by `predict/LocalPrediction`, which re-runs
  the SHARED `orderSystem`/`movementSystem` (identical collision/arena data)
  and reconciles against `SeatState.lastAckSeq`; remotes interpolate ~100 ms
  in the past.
- Champions render as procedural Minecraft-style voxel figures immediately;
  if `content/assets/models/<modelKey>.glb` exists it is hot-swapped in via
  `AssetManager` + `ClipAnimator` (procedural fallback is test-proven).

## Tests

```sh
pnpm --filter @ggd/client test        # vitest (covers client-01..08 beacons)
pnpm --filter @ggd/client typecheck
pnpm --filter @ggd/client build
```

`scripts/smoke.ts` (see below) drives a headless colyseus.js client against a
locally running game-server:

```sh
pnpm --filter @ggd/game-server dev &   # or `start`
tsx apps/client/scripts/smoke.ts       # joins, selects, moves, reports
```

## Known issue (server-side, tracked separately)

The shared schema classes (`packages/shared/src/protocol/schema.ts`) declare
fields as class property initializers; compiled with ES2022
`useDefineForClassFields` (the repo default) those [[Define]] semantics clobber
@colyseus/schema's per-instance tracking accessors, so the game-server crashes
on encode as soon as a real client joins. Fix: `"useDefineForClassFields":
false` in `tsconfig.base.json` (or constructor assignment in schema.ts). The
client is immune — it decodes via colyseus.js reflection and never passes the
shared classes as `rootSchema` (see `net/RoomConnection.ts`).
