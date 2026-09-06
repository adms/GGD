# 觸控支援（touch controls + touch HUD + PWA）— TODO

> ⭐ **平台政策（GH#1089，owner 2026-09-06 逐字）：**
> 「本遊戲不支援手機但支援平板最高 30fps  手機是 30fps
>  以 ipad mini 的 A17 Pro 為最低配備標準來設計」
>
> ⇒ ⭐ 這一頁底下的「mobile-NN」是**觸控**那一層的工作項（那一層平板照樣要），
> ⛔ 不是「我們支援手機」的宣稱。政策的唯一住處是
> `content/config/model-lod.json` 的 `platformPolicy`（後台「畫質分級」那一頁）；
> 手機進站會看到一張告知（⛔ 出貨不硬擋）。

iOS Safari / iPadOS / WKWebView only (Android explicitly out of scope). Wild-Rift-style touch
controls: LEFT half of the canvas is a floating virtual joystick (touchstart anchors the
stick, drag vector with radial deadzone 0.12 / radius 64px issues continuous move orders
through the SAME gamepad left-stick semantics — `move` to self + dir·4, coalesced by
IntentSender; release stops issuing and the last order finishes). RIGHT side: Q/W/E/R
ability arc + a big basic-attack button — TAP quick-casts through the shared
`buildCastCommand` path (skillshot/dash → nearest-enemy dir or facing; ground → point at
min(range, 6) toward facing; self → self; targeted → nearest in range), PRESS-AND-DRAG
enters aim mode (line/disc indicator via render/AimIndicator), RELEASE casts with that aim,
dragging back into the cancel zone aborts. Attack button = attackTarget nearest (LT
semantics). Per-frame joystick/aim state rides the plain-mutable `touchFrame`
(frameBus pattern — never React state); React renders only chrome/cooldowns.

Layout: touch controls enable on `'ontouchstart' in window` && coarse pointer (dev seam:
`globalThis.__ggdForceTouch`); viewport-fit=cover + safe-area insets; portrait shows a
rotate-to-landscape overlay; platform screens get >=44px touch targets via ui/mobile.css.
Perf: RenderConfig quality tier "mobile" (auto: touch or <=4 cores; manual override in the
HUD settings corner) caps hardware scaling at 1.5x and halves particle budgets. PWA:
manifest.webmanifest (standalone, landscape) + programmatically generated icons
(scripts/gen-icons.ts) + apple-touch-icon; NO service worker yet (offline cache deferred).
Bluetooth pads on iOS ride the existing rAF-polled Gamepad API path unchanged.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| mobile-01 | Floating joystick: anchor at touchstart, drag → continuous move orders (deadzone 0.12, radius 64px, MOVE_LEAD math, left-half only) | mobile-joystick-move | unit | done |
| mobile-02 | Joystick release stops issuing (last order finishes); next touch re-anchors | mobile-joystick-release | unit | done |
| mobile-03 | Multi-touch identifier isolation: joystick + ability drag tracked independently; second ability finger ignored | mobile-touch-isolation | unit | done |
| mobile-04 | Tap-vs-drag threshold (AIM_START_PX) picks quick cast vs aim mode | mobile-tap-threshold | unit | done |
| mobile-05 | Ability TAP → exact castAbility Command shapes per castType (same shapes the gamepad tests assert) | mobile-quickcast-shapes | unit | done |
| mobile-06 | Drag-aim release → dir/point commands + line/disc indicator states (drag-projected ground point) | mobile-drag-aim | unit | done |
| mobile-07 | Cancel zone aborts the cast (drag back / touchcancel) | mobile-cancel-zone | exception | done |
| mobile-08 | Attack button = attackTarget nearest (LT semantics; no target → no order) | mobile-attack-basic | unit | done |
| mobile-09 | Touch detection ('ontouchstart' + coarse pointer + __ggdForceTouch seam) gates the touch layout | mobile-detect-layout | unit | done |
| mobile-10 | Portrait → rotate-to-landscape overlay logic | mobile-rotate-overlay | unit | done |
| mobile-11 | Quality tier: auto-detect (touch / <=4 cores), persisted override, hardware scaling caps 1.5x/2x | mobile-quality-tier | unit | done |
| mobile-12 | Mobile particle budget: burst counts / capacities / emit rates halved | mobile-particle-cap | unit | done |
| mobile-13 | PWA manifest (standalone, landscape, icons on disk) + apple-touch-icon + iOS meta; no service worker | mobile-pwa-manifest | integration | done |
| mobile-14 | Safe-area insets + >=44px platform touch targets + touch-action/gesture opt-outs | mobile-safe-area | unit | done |
| mobile-15 | Real-device iPhone match: touch joystick + drag-aim casts against a live server over LAN | mobile-e2e-device | e2e | pending |

mobile-15 needs a physical iPhone on the LAN (see apps/client/README.md "iPhone
on-device testing"); it stays `pending` until an automated on-device suite emits
its beacon (same convention as couch-16 / webui-11).
