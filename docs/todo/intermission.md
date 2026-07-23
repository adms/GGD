# 中場 intermission — its own scene + a centre-stage shop — TODO

The intermission is a SEPARATE SCENE from the arena, and the shop is its centre of gravity.

## Why this exists

The user asked 「戰鬥場景一開始就能動跟 ready 按鈕才能動 是什麼意思？戰鬥還沒開始嗎？」.
During `intermission` the sim runs and the champion is fully controllable, so it *looked*
like combat; `MatchController` advances on `expired || (allSeatsReady && offers.size === 0)`,
i.e. Ready means "skip the rest of my prep time", not "unlock movement". Nothing on screen
named the phase.

The user then ruled on the shape of the fix (2026-07-22):
「中場是獨立於戰鬥場景外的一個新場景，所以戰鬥的時候商店不會出現」. That decides three
things at once:

1. **The phase becomes self-evident.** A scene change is the strongest possible phase
   signal — stronger than any banner.
2. **The shop cannot leak into combat.** It lives in another scene, so "hidden during
   combat" is structural. The SERVER-side purchase gate still matters (a client can always
   send the command) and is unchanged in importance.
3. **Task #29's 2.4 u prop cap does not apply.** That sweep governs the ARENA's standable
   points. Nothing in `render/intermission/**` is ever loaded by `ArenaScene`, no hero
   stands among these props, and the merchant's cart is deliberately 2.55 u. No re-run of
   the 35-ray sweep is needed for it.

   **But the SIGHTLINE still applies, and waiving the cap quietly waived that too**
   (task #103). #29 carried two separate guarantees — props stay under 2.4 u, AND no
   prop fully hides a character from the fixed camera. Only the first one is about
   standable points. The second is about a camera and a subject, and the intermission
   has both. Waiving them together is how the 店員 ended up occluded by his own stall
   with a green suite: int-16 checks HEIGHTS, int-18 checks SCREEN-SPACE X, and neither
   can see an object standing between the camera and its subject. int-28 casts the ray.

## Where the pieces live

| Concern | File |
| --- | --- |
| Prep-window duration (content, not a constant) | `apps/game-server/src/match/phaseConfig.ts` ← `content/config/config.match.json` |
| Server shop rule (the authority) | `packages/shared/src/sim/economy/shopAccess.ts` |
| Rejections surfaced, never swallowed | `packages/shared/src/sim/systems/CommandSystem.ts` → `buyRejected` / `sellRejected` |
| The market scene | `apps/client/src/render/intermission/IntermissionScene.ts` |
| Its staging, as plain numbers | `apps/client/src/render/intermission/layout.ts` |
| Scene mount / arena draw suppression | `apps/client/src/ui/IntermissionStage.tsx` |
| The shop card | `apps/client/src/ui/panels/MerchantShop.tsx` |
| HUD gate + auto-open | `apps/client/src/ui/panels/shopGate.ts` |
| Reason → sentence → SFX | `apps/client/src/ui/panels/shopFeedback.ts` |
| Per-slot skill detail (reuses the #71/#76 layer) | `apps/client/src/ui/panels/skillDetails.ts` |

## The prep window is CONTENT

`config.match@1` has declared `match.intermissionSec` since the content pipeline landed, the
Zod schema validated it and the editor offered it — and **nothing read it**. `MatchRoom`
passed `DEFAULT_PHASE_CONFIG` literally, so the real prep window was a constant in
`PhaseMachine.ts` and the doc was decoration. `resolvePhaseConfig()` makes the declaration
load-bearing; the shipped value is **60 s** (was 25 s), which is what a centre-stage shop
needs. Ready still skips the remainder.

The duration is deliberately NOT in `constants.ts` (that owns TICK_HZ / seat counts) and NOT
in `arena-rules.json` (that owns per-ROUND grants — what a round *gives*, not how long a
phase *lasts*).

## The shop gate

| phase | who may shop |
| --- | --- |
| `intermission` (prep) | everyone |
| `combat` | ONLY a champion already DOWN this round — dying is a head start, not dead time |
| anything else | nobody |

Enforced server-side in `CommandSystem` via `shopAccess`, mirrored in the HUD via `shopGate`
so the UI never pretends to be open and then eats a rejection.

## The prep window is TIMED, and now it looks it (task #95)

「shop 頁面也是有限時，一樣進入要有倒數計時的畫面跟音效提示」. The *sound* already
existed — task #30 built the last-5s bells and int-04 above added `intermission` to
`COUNTDOWN_PHASES` — but nothing on screen said the shop was on a clock. The card's own
`備戰時間 44s` was 11 px of dim grey wedged between the merchant's name and the gold purse,
and the CLOSED card showed no time at all.

`ui/panels/prepCountdown.ts` is the whole decision, pure and node-tested;
`ui/panels/PrepClock.tsx` only paints it.

**The ramp is deliberately not champ select's.** That deadline is unforgiving and fires
ONCE a match (miss it → random champion). This one is soft and fires EVERY ROUND, so an
identical alarm would be crying wolf by round three:

| seconds left | look | sound |
| --- | --- | --- |
| > 10 | plain clock | — |
| 10 → 6 | gold, **colour only** — the shop is a reading task, so you get a beat to finish the tooltip you are on | — |
| 5 → 1 | red, the number pops once a second | `countTick` ×4 rising, then `countFinal` |
| any, after Ready | green, still | `countFinal` only |

The loud band **is** `COUNTDOWN_LEAD_SEC` — one constant, so the picture and the bells can
never disagree. Nothing NEW appears at 5 s (the pill has been there since the phase opened),
nothing flashes, shakes or moves the layout: that is what makes it survivable on round six.

**Ready is an answer, and the countdown stops asking.** Pressing Ready does not shorten
*your* clock — it may still run 40 s because someone else has not readied. So the visual
goes calm-green and the four nagging ticks are dropped, while the single `countFinal`
survives: the ticks say *act* (already answered), the race-start trill says *brace* (still
true). `stepCountdown`'s guard still advances over a suppressed second, so nothing queues up
to fire late.

**The card may be closed, so the clock does not live in the card.** `<PrepClock/>` is a
SIBLING of `<MerchantShop/>` in `HudRoot`, pinned above `ReadyButton` because the clock and
Ready are one decision — spend the time, or end it early. The card's header line and the
closed re-open button both render `shopClockChip()` from the same module, so they agree with
the pill instead of drifting from it. int-26 scans both files to keep it that way.

**The defeated shopper (combat) gets no countdown.** Their deadline is the last enemy dying,
at an unknowable moment; combat expiring on time is the rare draw-on-HP case. Counting that
clock down would be counting down to something that normally does not happen. They keep the
honest sentence and no number — which is also why `combat` is still not in `COUNTDOWN_PHASES`.

## Test gate

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| int-01 | Phase durations come from `config.match@1`; an authored seconds block converts to tick counts | phase-config-content | unit | done |
| int-02 | The shipped prep window is 60 s and the DOC is what sets it (the fallback constant agrees) | phase-config-prep-window | unit | done |
| int-03 | A missing / zero / negative duration falls back per-field, never to a 0-tick phase | phase-config-fallback | unit | done |
| int-04 | The last-5s countdown rings for the prep window too, at ANY configured length, once per round | audio-countdown-prep | unit | done |
| int-05 | Prep opens the shop for everyone, alive or not | shop-gate-prep | unit | done |
| int-06 | Combat closes the shop for a LIVING champion, with a reason | shop-gate-combat-alive | security | done |
| int-07 | A champion DOWN this round keeps the shop until the round resolves | shop-gate-defeated | unit | done |
| int-08 | Every other phase is closed to everyone | shop-gate-closed | unit | done |
| int-09 | Match phase → shop phase mapping; an unknown phase is CLOSED | shop-gate-phase-map | unit | done |
| int-10 | Server authority: a mid-combat buy by a living champion is rejected and the reason emitted | shop-gate-server | security | done |
| int-11 | Every `BuyResult` reaches the client instead of being swallowed (no-gold / no-slot / unknown) | shop-gate-reasons | regression | done |
| int-12 | Each rejection reason yields a distinct, readable, AUDIBLE message; an unknown one degrades to a sentence | shop-reject-surfaced | regression | done |
| int-13 | HUD gate: prep open, combat unmounted for the living, mounted+labelled for the defeated | shop-ui-gate | unit | done |
| int-14 | Auto-open fires on the prep EDGE only, and again every round | shop-ui-autoopen | unit | done |
| int-15 | Skill detail per slot incl. passive + EX, rank-scaled numbers, EX hidden until unlocked | shop-skill-details | unit | done |
| int-16 | Merchant set renders at the MEASURED heights; the awning clears his head; the cart is the landmark | intermission-scale | unit | done |
| int-17 | Staging: merchant behind his counter, cart overlapping the stall, hero's back to camera looking at him | intermission-staging | unit | done |
| int-18 | Fixed shot: breathes ±0.02 rad, never orbits, keeps the cast inside the free 55% the LEFT-docked card leaves — the RIGHT half, keyed on `SHOP_CARD_SIDE` (task #94) — at 4:3/16:9/21:9 | intermission-camera | unit | done |
| int-19 | Ground: 2 u paving grid on the plaza disc, grass ring outside it, silhouettes at 9–13 u, all shipped CC0 models | intermission-ground | unit | done |
| int-20 | Mood is the anti-arena: fogged, gently bloomed, nothing strobes | intermission-mood | unit | done |
| int-21 | Scene lifecycle: own engine/scene/camera, no eager loop, no user orbit, survives unloadable models, idempotent dispose | intermission-scene-lifecycle | integration | done |
| int-22 | Enter transition fires `onComplete` EXACTLY once — on completion, on dispose mid-ease, or already disposed | intermission-transition-once | exception | done |
| int-23 | Asset contract vs the SHIPPED .glbs: every referenced model exists, the merchant's sword mesh is there to hide, and all four driven clips are on the rig | intermission-assets | regression | done |
| int-24 | The prep clock is on screen for the WHOLE window (a countdown on ENTRY, not a jump scare), in the prep phase only, and survives a junk clock | prep-countdown-ramp | unit | done |
| int-25 | Ready commits: green, still, no pop at any second — but the clock stays, because someone else may still be shopping | prep-countdown-ready | unit | done |
| int-26 | The pill is HudRoot's, never MerchantShop's, and the CLOSED re-open button carries the same chip — a closed card cannot hide the clock | prep-countdown-surfaces | regression | done |
| int-27 | The defeated shopper gets a sentence, never a countdown (their deadline is the last enemy dying, not the combat clock) | prep-countdown-defeated | unit | done |
| int-28 | SIGHTLINE: rays from the composed eye to the merchant and the champion at head/chest/feet hit ZERO market geometry — cast against the shipped .glb triangles, not the recorded footprints | intermission-sightline | regression | done |
| int-29 | Purchase reaction — the clip is resolved by PREFERENCE ORDER over the .glb's real group names (victory → attack → cast), never an idle/walk/death/hurt pose; empty / idle-only inventories return null so the caller can degrade | intermission-champion-reaction-pick | unit | done |
| int-30 | A completed purchase makes the hero react and return to rest: a rig with a reaction clip plays it (no pop), a rig with NONE gets a procedural squash-pop that springs back to its resting scale and never sticks; no champion in frame is a silent no-op | intermission-champion-reaction | unit | done |
| int-31 | Shop tabs LEAD with the hero's 屬性 (attribute) panel — the default-selected tab is 屬性 (label moved 商品→屬性), 技能 is kept, and the hero's portrait renders a real `<img>` beside the tabs when the champion has an extracted icon | shop-tab-attributes-portrait | unit | done |
| int-32 | STANCE: the mounted champion is GROUNDED — `setChampion` measures the placed model and lifts its feet onto the floor (min.y → 0), the same per-model root-transform StorePreview applies (#129), so an imported rig whose bind box dips below the origin no longer sits half-buried; empty/bone-only box is a no-op | intermission-champion-grounded | unit | done |
| int-33 | LEFT DOCK (task #94): the shop card docks on the LEFT, reading the SAME `SHOP_CARD_SIDE` the intermission scene mirrors the 3D market around — one source of truth, so the panel and the merchant/店員 stage can never share a half (`shopDockAnchor` is the pure geometry the panel renders from, and the mirrored scene keeps the clerk in the free RIGHT 55% per the #103 sightline) | shop-left-dock | unit | done |
| int-34 | The shelves show the ACTUAL purchasable stock: the `Items` registry → `shopCatalogue` → `groupCatalogue` pipeline the panel renders, so a registered priced whitelisted item lands on a real shelf with its real id/cost (offence for +ad), and every shelved row is a genuine registered item — not a decorative placeholder | shop-shelves-real-stock | unit | done |

## The purchase reaction (task #111)

「shop 時候…購買的時候 勝利或攻擊動作」. On a completed purchase (`shopEvent.kind
=== "bought"`, surfaced by `IntermissionStage`) the merchant plays `Interact`
AND the player's own hero plays a one-shot victory/attack clip, then returns to
idle. `render/intermission/reactionClip.ts` is the whole decision, pure and
node-tested; `IntermissionScene.playChampionReaction()` maps the chosen NAME to
its live `AnimationGroup` and plays it.

Clip inventories differ wildly — KayKit stand-ins carry 76 (celebration
included), imported heroes 1–24, and some have NO attack clip at all (task #69) —
so the clip is resolved by PREFERENCE ORDER over the .glb's real group names, not
the six-key `clipMap` (which has no "victory" key). A hero with no legible clip
still reacts: a short procedural squash-and-hop that springs back to rest.
Nothing freezes on a non-looping clip or throws.

## The hero is GROUNDED here (task #111); the per-clip ROTATION audit is #68's

Two distinct defects both read as 「face-down on the floor」 when a champion is
shown large, still and close for the first time:

1. **Sinking / floating (fixed here, int-32).** The intermission mount placed
   the hero at `position.y = 0` with no grounding, so an imported rig whose bind
   box dips below the origin (`imported.picacugy` spans y∈[-0.58, 1.71]) sat
   half-buried in the paving. `setChampion` now measures the placed model and
   lifts its feet onto the floor (`stance.groundShiftY` = `-min.y`) — the SAME
   per-model root-transform StorePreview applies (#129), ported to this mount.

2. **Baked per-clip root rotation (still #68's).** A subset of imports bake a
   root-bone rotation that differs **between clips** (heropikachu: Stand 99.7° /
   Attack 0° / others 260°/360°), so **no single scene transform can correct
   it** — a static counter-rotation that fixes idle breaks attack. That is a
   model/exporter-level defect and remains task #68's mandate; the grounding
   above does NOT rotate the champion, and `int-30` pins that
   `playChampionReaction` does not either.

## Not done here

- **Merchant VO.** He waves and gestures but says nothing. The 効果音ラボ licence forbids
  re-cutting its voice actresses' syllables into new lines, so a merchant voice needs its
  own source (see `content/assets/audio/sfx/lab/MANIFEST.json`).
- **Couch play.** The shop card is single-player only (`!couch` in `HudRoot`); split-screen
  needs a per-viewport card, which is couch-play's own problem.
- **Shop inventory curation** is task #70's; this consumes whatever the catalogue reports.
