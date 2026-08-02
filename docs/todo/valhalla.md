# 英靈殿 — lobby champion showcase (task #258) — TODO

Lobby, centre column, **above 「單人 vs BOT」** (owner: 「大廳中央上面 (單人vsBot 之上) 增加一個
區塊 [英靈殿] 用 3d model + 英雄全名+稱號, 描述, 技能介紹 隨機介紹一個英雄，並且每過1分鐘就會
輪播隨機下一個英雄」).

**Shape:**
- `apps/client/src/ui/platform/valhalla.ts` — pure rules: the showable roster
  (`registry ∩ operator whitelist`, via the champ-select filter — **not** `marqueeRoster`,
  which drops the ten alternate-form ids the owner has enabled), the shuffle bag
  (every champion once per pass, no back-to-back repeat across a reshuffle), the layout tiers,
  and the clock's pause predicate. `Math.random` is injected, so the ordering rules are
  provable; this is client presentation and lives outside `packages/shared`'s determinism gate.
- `apps/client/src/ui/platform/lobbyCombatEnv.ts` — the pre-match combat-env table
  (content `config.combat-env@1` + `GET /api/v1/combat-env`, admin wins, fail-safe to content).
  Without it the lobby prints base cooldowns — 60s for an ability that is 12s in combat (#125).
- `apps/client/src/ui/platform/ValhallaPanel.tsx` — the card. Composes existing selectors only:
  `championDisplayFor` (稱號/全名/blurb), `parseDescriptionSections` (故事),
  `skillRows(champSelectSkillSeat(def))` + champ-select's own `SkillRowView`, and
  `StorePreviewCanvas` for the 3D stage. Subscribes to `useContentReady()`; renders a SKELETON,
  never `null`. The CHROME is silent — the controls are raw `<button>`s, not the SFX-carrying
  shared `Btn`. **⚠️ 2026-08-02 更正:** 「Emits no sound at all」 是這一行原本的說法，現在是假的。
  GH#256 之後每一次**換人**都會 `playValhallaDeclaration(current)`（自動輪播 / 「下一位」/
  第一抽都算），播的是該英雄自己的語音 —— **不是名言**，119 隻的 `quote` 欄位實測 0/119，
  #139/#142 還沒做。守衛：`valhalla/ValhallaPanelMount.test.ts`。
- `apps/client/src/render/StorePreview.ts` — gains `setPaused()`; the preview's render loop was
  unconditional, so a lobby in a background tab span a WebGL context forever.
- `apps/client/src/ui/platform/StorePreviewCanvas.tsx` — gains `paused`, `minHeight` and an
  `onStatus` load signal, so a caller can put the champion's portrait up instead of a black hole.
- `apps/client/src/ui/platform/ranking.css` — `@media (max-height: 520px)` makes
  `.ggd-lobby-body` scroll. iPhone landscape is 844×390, so the existing `max-width: 720px`
  rule never fires there and anything past the fold was unreachable, not merely clipped.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| valhalla-01 | Roster is `registry ∩ operator whitelist` and KEEPS the ten enabled alternate-form champions (`marqueeRoster.isSelectableChampion` would delete 天地志狼/悟空/索隆/藏馬/飛影/拳四郎/妙蛙花/草泥馬/莉娜/小呆) | valhalla-roster-whitelist | unit | done |
| valhalla-02 | An unreachable platform (NO_FILTER) shows the full registry; an enforced-but-empty whitelist shows the honest empty state | valhalla-roster-degrade | unit | done |
| valhalla-03 | One pass of the shuffle bag shows every champion exactly once before any repeat | valhalla-bag-pass | unit | done |
| valhalla-04 | 200 consecutive draws never repeat back-to-back, including across a bag boundary (a plain reshuffle can) | valhalla-bag-no-repeat | regression | done |
| valhalla-05 | A bag built for a stale roster (whitelist/content landing late) is rebuilt instead of drawing dead ids | valhalla-bag-stale | unit | done |
| valhalla-06 | At ≤520px viewport height the card collapses to one line and the 3D stage is dropped, so it cannot push 「一鍵開打」 off a phone in landscape | valhalla-layout-strip | unit | done |
| valhalla-07 | On every desktop tier the stage stays under a third of the viewport and the scrolling body is bounded — a long 故事 can never grow the card | valhalla-layout-bounded | unit | done |
| valhalla-08 | The rotation clock stops on a hidden tab, an off-screen card, and while the player is reading it (deferred, not cancelled) | valhalla-clock-pause | unit | done |
| valhalla-09 | The pre-match combat-env resolves content defaults + admin override (admin wins) and fails safe to CONTENT, never to the neutral all-1.0 table | valhalla-env-merge | unit | done |
| valhalla-10 | Regression for the #125 hole this closes: with the shipped table a 60s base cooldown displays as 12s, and as 60s under the neutral table the lobby used to get | valhalla-env-125 | regression | done |

## Verified in a real browser (not just green tests)

Headless Chrome + SwiftShader against a local dev client (`:39628`) and a throwaway platform
(`:8158`, own scratch `DATA_DIR`, the real 49-champion whitelist). Never ggd.adms.ai.

| What | Evidence |
| --- | --- |
| Card is ABOVE 單人 vs BOT, 3D model drawn, text readable @1280×720 | `valhallaAboveBot: true`, stage 240×190 canvas, non-background pixels 28–49% of the stage |
| Rotation changes champion AND model | one run, two shots: `godie-hvwd 桔梗` → `godie-h02k 熊貓`, `identicalBytes: false` |
| Phone landscape 844×390 keeps 「一鍵開打」 on screen | strip height 31px; button y=326..380 with `inViewport: true` (before the strip redesign it was 86px and the button fell to y=380..434, off-screen) |
| Skeleton, not a blank, before content lands | first-paint probe: `[data-ggd-valhalla]` present with an empty champion id |
| No new console errors | `consoleErrors: []` on every capture |

## Known gaps (not fixed here)

- 拳四郎 (`godie-u00l`) renders as 皮卡丘 — both docs point at `imported.heropikachu`. Pre-existing
  #77/#113 debt; the showcase makes it more visible, it does not cause it.
- `godie-h02r 妙蛙花` has an empty `description`; the card falls back to
  「（此英雄在原地圖沒有描述文字）」 rather than a blank block.
- 43 champions still mount a shared blocky stand-in mesh on preview stages (#226/#231 open
  question). The 🎭 badge says so.
