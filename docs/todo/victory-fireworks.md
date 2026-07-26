# Victory fireworks — 勝利煙火 / 吃雞烤雞 (task #93 VFX)

The two victory celebrations, built on the task #33 pooled-preset VFX toolkit. The
**joke is the deliverable**: the match-win firework is a **full-screen roast chicken**
(吃雞 = winner winner chicken dinner), and its acceptance criterion is blunt — *can a
player tell it is a roast chicken?* It was answered by rendering the point cloud and
looking at it, over **seven iterations** (viking-helmet → bat → cat's-head → bull →
bird), and the structural properties that finally made it read are locked as tests so a
later "tidy-up" cannot silently ship a golden blob.

**Two tiers, deliberately different effects — not one at two sizes:**

- **ROUND WIN (tier 1)** — a short `SmallFireworkFx` **volley**: a handful of small
  peony bursts (flash + spark peony + smoke puff, pooled preset layers) popping in the
  upper frame as punctuation. Fires several times a match, so it is **≤1.5 s** end to
  end and its scatter+palette are **seeded by round number** so round four does not look
  like round one.
- **MATCH WIN / 吃雞 (tier 2)** — the full-screen `ChickenFireworkFx`: a launch comet, a
  white break flash, and a **~1650-point roast chicken** that **HOLDS** still and fully
  lit for **1.25 s** (long enough to read + screenshot), then droops under gravity,
  spreads, and cools to ember. Fires **once**.

**Silhouette** (`apps/client/src/vfx/chickenSilhouette.ts`, pure): the bird is an SDF
union of ellipses + tapered capsules (iq round-cone), sampled into a coloured point
cloud in two passes (interior fill + projected outline) plus a third **crease** pass that
draws each drumstick's own contour a short way into the breast. What makes it read, in
the order the iterations proved it: **two drumsticks in a ~49° V with fat bone knuckles**
(the tell; 43° reads as ears, 57° as horns), a **cool-white dish wider than the bird**
under warm gold (three-value separation survives the droop), a **breast dome between the
legs** (without it → bow-tie / cat's-head), and **no wing, no tail** (both made it read
as a bat — dropping them was the single biggest gain).

**Timeline + framing** (`fireworkMath.ts`, pure): the tier-2 curve is a real shell's —
launch → expand (with a ~4% overshoot) → **hold** → droop+fade — and the whole thing is
welded to **camera space** (`fitScale` to ~80% of the shorter frame axis) so "full
screen" holds on ultrawide and portrait alike. Tier-1 layout (`smallVolley`) is
round-seeded, upper-half, spread across bands, staggered.

**Shells** (`ChickenFireworkFx.ts` / `SmallFireworkFx.ts`): the chicken formation is
**one mesh, one draw call** — 4 verts/point, a vertex shader that places every point
analytically from ~8 uniforms (expand / drift / droop / alpha / cool / flash), additive,
depth-write off. The CPU writes ~8 floats per frame; nothing per-particle. The launch
comet, break flash, glitter and every small-shell layer are ordinary pooled
`vfxPresets` bursts (all with an explicit `texture` — a textureless pooled ParticleSystem
renders nothing, a bug caught only by a frame-stepped screenshot). Point budget scales
with the quality tier by **coarsening the sampling pitch, clamped** — a low-tier bird is
a whole bird, never one missing a drumstick.

**Trigger** (`victoryTrigger.ts`, pure `VictoryGate`): edge-detects the two events for
the **local team only** from `phase` / `outcomeDecided` / `round` / my team's
`roundWins` + `placement`. Round win = my `roundWins` incremented while undecided; match
win = `outcomeDecided` && my `placement === 1`, latched once. The deciding final round
reports the **match win only** (never grey+dark at once); the **loser gets nothing**;
joining mid-match adopts a baseline and never retro-fires.

**Facade + wiring** (`VictoryFireworks.ts`): composes both tiers behind the gate and
exposes `onRoundWin(round)` / `onMatchWin()` callbacks on the same edge (the screen tint
— grey for a round, dark for the match, reusing #85's desaturation — and the taunt VO
from `content/config/victory-taunts.json` are the umbrella task's, hung on these hooks).
Wired into `GameApp` next to the death-focus pass: one `victoryFx.sync(victoryInput(state),
nowMs)` + `victoryFx.update(nowMs)` per frame, framed against player 0's camera, disposed
with the scene. Costs nothing until a win edge fires.

**Review surface**: `apps/client/public/firework-audition.html` (dev-only, like the #80
ground- and #52 BGM-audition pages) runs the SHIPPED effects against a real camera. A
**frame-stepped clock** (`?step=1400`, `?volley=2&step=780`) freezes an exact moment
independent of renderer speed, so the "can you tell it's a chicken" judgement is made on
the same frame across iterations.

**Not in this task** (umbrella #93): the grey/dark screen treatment, and the taunt VO
generation/playback. This task delivers the fireworks + the trigger + the callback seam.

## Tests

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| fw-01 | roast-chicken silhouette reads: dense/bounded/deterministic cloud; clear V notch with mass both sides; two bone knuckles as the highest points (white vs non-white body); dish lower+wider+cooler than the bird; NO wing/tail; density scales without losing a body part | firework-chicken-shape | unit | done |
| fw-02 | tier-2 timeline is a shell not a tween: launches before it forms, HOLDS ≥1 s still+fully-lit, then droops (sag grows, alpha→0, cools to ember, spreads) | firework-timeline | unit | done |
| fw-03 | framing fits the bird inside the frame at every aspect incl. portrait, and still fills ~86% of the shorter axis | firework-framing | unit | done |
| fw-04 | tier-1 volley is SHORT (≤1.5 s), scatters differently per round but identically for the same round, and each shell breaks exactly once across a 60 fps sweep | firework-small-volley | unit | done |
| fw-05 | victory trigger edge-detects for the local team only: one round win per increment, match win once, deciding round is match-only, loser gets nothing | victory-trigger | unit | done |
| fw-06 | shell lifecycle on NullEngine: builds ONE formation mesh lazily, self-stops after the timeline, cheap+unbuilt while idle, disposes clean; small volley self-stops | firework-shell-lifecycle | unit | done |
| fw-07 | facade routes a round edge → small volley + onRoundWin, a match edge → chicken + onMatchWin (once), and fires NOTHING for the loser | victory-fireworks-facade | unit | done |

---

## #235 — 為什麼從來沒有人看過回合煙火（根因 + 修復 + 守門測試）

**owner 回報：兩種煙火都沒看過。** 查下來這是兩件不同的事，只有一件是真的壞掉。

### 根因（用遊戲真正的鏡頭量出來的，不是推論）

回合煙火（tier 1）把每一發都放在**鏡頭正前方 22 公尺**（`SMALL_DISTANCE`）。
#161 把戰鬥鏡頭從 55° 拉到 **68°**、眼睛在 **9.27 u** 高——那條「正前方」的軸是**朝地下鑽的**
（`fwd.y = −0.927`）。實際落點：

| 回合 | 4 發的世界 y | 在畫面內？ | 被地板擋住？ | 看得到？ |
|---|---|---|---|---|
| 1 | −9.97 / −9.32 / −9.40 / −9.45 | ✅ 100% | ✅ 100% | **0%** |
| 2 | −9.03 / −10.35 / −10.40 / −9.67 | ✅ 100% | ✅ 100% | **0%** |
| 3 | −9.53 / −9.86 / −9.45 / −9.12 | ✅ 100% | ✅ 100% | **0%** |

地板是**不透明、會寫深度**的 `buildZoneGround`（半徑 24）。粒子活著、NDC 完美置中、**零像素**。
無頭瀏覽器實拍佐證：用真 `CameraRig` 的 frame-stepped 截圖，跟「特效關掉」的同一格相比
**changedPixels = 0**。

**烤雞（tier 2）不是壞的。** 同一套實拍：透過**真的結算鏡頭**（`settlementCameraPose`，眼睛 1.15 u、
微微朝上）變動 **25.9%** 的畫面；透過戰鬥鏡頭也有 **25.7%**（它是 mesh 且 `renderingGroupId = 1`，
Babylon 會先清深度）。**所以 `fix/235-fireworks-visible` 的「修復前」證據是偽造的沒錯 —— 因為烤雞這半根本沒東西可修。**
它為什麼 owner 沒看到，客戶端這邊查得到的只有一條：`outcomeDecided && placement === 1` 這個
邊緣事件在正常一場 bot 對戰裡有沒有真的發生，屬於 game-server/結算流程（#193 仍在跑），本工作流不動。

### 修復

煙火改成**綁在世界的天空平面**（`SMALL_SKY_Y = 5.0`），不再綁在「鏡頭前方 N 公尺」：
frame 座標 (u, v) 現在是「天空平面上的哪個位置」，所以「永遠在畫面裡」這個好性質保留，
但落點永遠在地板之上（5.0 u 高過英雄 1.7、高過 2.4 的道具高度上限、低於 9.27 的眼睛）。
`skyPlacement()` 直接解 `eyeY + d·(fwdY + v·tan(fov/2)·upY) = skyY`（沒有 roll ⇒ `right.y = 0`，u 不影響高度，所以是解析解不是迭代）。
距離從 22 變成 ~4.7–5.2，所以**尺寸、速度、重力一起等比縮**，畫面上的大小完全不變。

再加一個**實測**出來的增益：原本的 tier-1 手感是對著 21° 平視鏡頭調的，在 68° 俯視、
整個畫面塞滿高對比石板地的情況下，實拍只變動 **0.42%** 的畫面——而玩家每場都會看好幾次的
施法預告光柱是 **3.83%**。一個「一回合一次的慶祝」比一次 Q 還小聲不叫慶祝。
`SMALL_SCREEN_GAIN = 2.8` 把它拉到 **3.0–3.4%**，跟光柱同一個量級。

### 這一輪真正的交付物：守門測試

`vfx/victoryFraming.test.ts` 用**遊戲真正的鏡頭**把每一發的世界座標重算一次，
任何一發跑出畫面或掉到地板下就紅。它**不是空轉的**——同一支測試裡把 #235 之前的擺法
重放一次，會如實地紅（100% 在畫面內、100% 被遮擋、0% 看得到）。

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| fw-08 | 回合煙火透過**真的** 68° 戰鬥鏡頭：1–8 回合、五種 dolly（10/16/24/40/90）、三種畫面比例（4:3 / 16:9 / 21:9）、鏡頭平移離開場中，每一發都在畫面內**且**在地板之上；並鎖住「天空平面高於道具高度上限、低於眼睛」 | victory-framing-visible | unit | done |
| fw-09 | 回歸證明：#235 之前的擺法（22 u 打在視軸上）跑同一道閘會紅，且紅的理由正是「100% 在畫面內、100% 被地板遮住」——閘不是空轉的 | victory-framing-regression | unit | done |
| fw-10 | 換了擺法但**沒有換構圖**：同一組 (u, v) 仍落在同一個 NDC 位置；縮放係數＝距離比 × `SMALL_SCREEN_GAIN`；鏡頭朝上或水平時不會除以零 | victory-framing-authored | unit | done |
| fw-11 | 烤雞透過**真的**結算鏡頭（0 / 0.9 / 2.4 秒三個時間點、英雄不在原點）在地板之上且在畫面內——記錄「這半沒有壞」這個事實，避免下一個人再修一次不存在的 bug | victory-framing-chicken | unit | done |

### 實拍工具（可重跑）

`apps/client/public/presentation-audition.html` + `src/render/presentationAudition.ts`：
**真 `CameraRig`、真 `buildZoneGround`**，`?fx=volley|chicken|pillar&cam=combat|settlement&step=780&hud=0`。
`apps/client/scripts/captureRealCamera.mjs` 用 CDP 驅動無頭 Chrome 逐格截圖，**並且對著「特效關掉」的同一格做像素差**——
「畫面裡有煙火」是判斷，「這一格跟關掉時差 N 個像素」是量測，而 0 像素正是 #93 那類 bug 的簽名。
