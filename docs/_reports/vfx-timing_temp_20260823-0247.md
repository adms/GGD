# 三條 [優先] 特效時長與守衛物件 — 落地報告 (GH#569 / GH#567)

產出時間戳：`20260823-0247`　lane：D2　⛔ 未跑 `content:build` / `skills:sync`（由主 session 統一跑）

## ① fade out 尾段 ≤ 一格（`config.vfx-cleanup@1.vfxFadeOutMaxSec`，出貨 0.5 秒）

三個住處：`content/config/vfx-cleanup.json` · Zod `zConfigVfxCleanupDoc` + `DEFAULT_VFX_CLEANUP` · admin `VFX_CLEANUP_SPEC`（上下界 0.05–3 由 `VFX_FADE_OUT_MAX_SEC_BOUNDS` **單一住處**供給 Zod 與 policy）。

夾在 `apps/client/src/vfx/particleFactory.toParticleSystem()` —— 全 repo 唯一把 `vfx@1` 變成 Babylon 粒子系統的入口（`VfxSystem` / `AmbientVfx` / `FireRingFx` / `W3xEmitterRig` / 編輯器預覽都走它）。⛔ 584 份 vfx 文件一個數字都沒改。

**「一定要清理乾淨」**：夾完之後 `lifetimeSec.max = 身體 + 上限`，alpha 歸零之後還活著的那一段整個丟掉；`W3xEmitterRig` 的 `maxLifeSec`（效果何時 `release()`）也改吃夾過的壽命 —— 發射器與 mesh 在粒子真的消失那一刻還回池子，⛔ 不是 8 秒後。

### 逐份列名：出貨樹上尾段 > 0.5 秒的 **87** 份

尾段定義 = alpha 梯度上「最後一個還看得見的關鍵格 → 它後面第一個歸零的關鍵格」× `lifetimeSec.max`。

| # | vfx id | 原壽命(s) | 原尾段(s) | 解析後壽命(s) | mode |
|---:|---|---:|---:|---:|---|
| 1 | `fx.w3x.particle.sephboom.p01` | 8 | 7.84 | 0.66 | continuous |
| 2 | `fx.w3x.particle.sephboom.p02` | 8 | 7.84 | 0.66 | continuous |
| 3 | `fx.w3x.particle.sephboom.p00` | 8 | 7.6 | 0.9 | continuous |
| 4 | `fx.w3x.particle.sephboom.p03` | 7 | 6.3 | 1.2 | continuous |
| 5 | `fx.w3x.particle.sephboom.p04` | 6.5 | 6.175 | 0.825 | continuous |
| 6 | `fx.w3x.particle.sephboom.p05` | 6.5 | 6.175 | 0.825 | continuous |
| 7 | `fx.w3x.particle.lasercannonfinalred.p07` | 5 | 4.95 | 0.55 | continuous |
| 8 | `godie-lasercannonfinalred-p7` | 5.0 | 4.95 | 0.55 | continuous |
| 9 | `fx.w3x.particle.lasercannonfinalred.p05` | 6 | 4.2 | 2.3 | continuous |
| 10 | `godie-lasercannonfinalred-p5` | 6.0 | 4.2 | 2.3 | continuous |
| 11 | `fx.w3x.particle.lasercannonfinalred.p04` | 5 | 4.0 | 1.5 | continuous |
| 12 | `godie-lasercannonfinalred-p4` | 5.0 | 4.0 | 1.5 | continuous |
| 13 | `fx.w3x.orb.demonfilth.p00` | 3 | 2.7 | 0.8 | continuous · ambient |
| 14 | `godie-demonfilth-p0` | 3.0 | 2.7 | 0.8 | continuous |
| 15 | `fx.w3x.orb.demonfilth.p02` | 5 | 2.5 | 3.0 | continuous · ambient |
| 16 | `fx.w3x.particle.flamessmoke.p03` | 5 | 2.5 | 3.0 | continuous |
| 17 | `godie-demonfilth-p2` | 5.0 | 2.5 | 3.0 | continuous |
| 18 | `godie-flamessmoke-p3` | 5.0 | 2.5 | 3.0 | continuous |
| 19 | `fx.w3x.particle.blackhole1.p00` | 3.5 | 2.1 | 1.9 | continuous |
| 20 | `fx.w3x.particle.blackhole1.p01` | 3.5 | 2.1 | 1.9 | continuous |
| 21 | `godie-blackhole1-p0` | 3.5 | 2.1 | 1.9 | continuous |
| 22 | `godie-blackhole1-p1` | 3.5 | 2.1 | 1.9 | continuous |
| 23 | `fx.w3x.particle.flamessmoke.p02` | 4 | 2.0 | 2.5 | continuous |
| 24 | `godie-flamessmoke-p2` | 4.0 | 2.0 | 2.5 | continuous |
| 25 | `godie-lasercannonfinalred-p3` | 4.0 | 2.0 | 2.5 | continuous |
| 26 | `fx.w3x.particle.lasercannonfinalred.p01` | 2 | 1.8 | 0.7 | continuous |
| 27 | `godie-lasercannonfinalred-p1` | 2.0 | 1.8 | 0.7 | continuous |
| 28 | `fx.w3x.particle.blackhole1.p02` | 3.5 | 1.75 | 2.25 | burst |
| 29 | `godie-blackhole1-p2` | 3.5 | 1.75 | 2.25 | burst |
| 30 | `fx.w3x.orb.1hswd-01.p02` | 2 | 1.5 | 1.0 | continuous · ambient |
| 31 | `fx.w3x.orb.demonfilth.p01` | 3 | 1.5 | 2.0 | continuous · ambient |
| 32 | `godie-1hswd-01-p2` | 2.0 | 1.5 | 1.0 | continuous |
| 33 | `godie-demonfilth-p1` | 3.0 | 1.5 | 2.0 | continuous |
| 34 | `fx.w3x.particle.lasercannonfinalred.p00` | 1.5 | 1.35 | 0.65 | continuous |
| 35 | `godie-lasercannonfinalred-p0` | 1.5 | 1.35 | 0.65 | continuous |
| 36 | `fx.w3x.orb.magical-sword.p00` | 2.5 | 1.25 | 1.75 | continuous · ambient |
| 37 | `godie-magical-sword-p0` | 2.5 | 1.25 | 1.75 | continuous |
| 38 | `fx.w3x.particle.lasercannonfinalred.p02` | 6 | 1.2 | 5.3 | continuous |
| 39 | `godie-lasercannonfinalred-p2` | 6.0 | 1.2 | 5.3 | continuous |
| 40 | `fx.w3x.orb.1hswd-01.p01` | 1.5 | 1.125 | 0.875 | continuous · ambient |
| 41 | `godie-1hswd-01-p1` | 1.5 | 1.125 | 0.875 | continuous |
| 42 | `fx.w3x.particle.blackhole.p00` | 1.6 | 1.12 | 0.98 | continuous |
| 43 | `godie-blackhole-p0` | 1.6 | 1.12 | 0.98 | continuous |
| 44 | `godie-bladestorm-swordeffect-p0` | 2.1 | 1.05 | 1.55 | continuous |
| 45 | `godie-earthtornado2-p0` | 2.1 | 1.05 | 1.55 | continuous |
| 46 | `godie-herohimurakenshin-p1` | 2.1 | 1.05 | 1.55 | continuous |
| 47 | `godie-lightningtornado-p0` | 2.1 | 1.05 | 1.55 | continuous |
| 48 | `fx.w3x.particle.blackhole.p04` | 2 | 1.0 | 1.5 | continuous |
| 49 | `fx.w3x.particle.flamessmoke.p00` | 2 | 1.0 | 1.5 | continuous |
| 50 | `fx.w3x.particle.flamessmoke.p01` | 2 | 1.0 | 1.5 | continuous |
| 51 | `fx.w3x.particle.sephboom.p06` | 2 | 1.0 | 1.5 | continuous |
| 52 | `godie-blackhole-p4` | 2.0 | 1.0 | 1.5 | continuous |
| 53 | `godie-bulbasaur-p0` | 2.0 | 1.0 | 1.5 | continuous |
| 54 | `godie-flamessmoke-p0` | 2.0 | 1.0 | 1.5 | continuous |
| 55 | `godie-flamessmoke-p1` | 2.0 | 1.0 | 1.5 | continuous |
| 56 | `fx.w3x.particle.blackhole.p05` | 1 | 0.9 | 0.6 | continuous |
| 57 | `godie-blackhole-p5` | 1.0 | 0.9 | 0.6 | continuous |
| 58 | `godie-tectonicfury-p0` | 1.8 | 0.9 | 1.4 | continuous |
| 59 | `fx.w3x.particle.oblivionaura.p00` | 3 | 0.84 | 2.66 | continuous |
| 60 | `godie-oblivionaura-p0` | 3.0 | 0.84 | 2.66 | continuous |
| 61 | `godie-meteor-p6` | 1.6 | 0.8 | 1.3 | continuous |
| 62 | `fx.w3x.orb.1hswd-01.p00` | 1 | 0.75 | 0.75 | continuous · ambient |
| 63 | `godie-1hswd-01-p0` | 1.0 | 0.75 | 0.75 | continuous |
| 64 | `godie-aquaspikeversion2-p1` | 1.5 | 0.75 | 1.25 | continuous |
| 65 | `godie-aquaspikeversion2-p2` | 1.5 | 0.75 | 1.25 | continuous |
| 66 | `godie-meteor-p4` | 1.5 | 0.75 | 1.25 | continuous |
| 67 | `fx.w3x.locust.darkraor.p01` | 1 | 0.7 | 0.8 | continuous · ambient |
| 68 | `fx.w3x.locust.frostnova.p03` | 1.4 | 0.7 | 1.2 | continuous |
| 69 | `godie-darkraor-p1` | 1.0 | 0.7 | 0.8 | continuous |
| 70 | `godie-frostnova-p3` | 1.4 | 0.7 | 1.2 | continuous |
| 71 | `godie-fireblast-p2` | 0.9 | 0.675 | 0.725 | continuous |
| 72 | `godie-netherstrike-p2` | 0.9 | 0.63 | 0.77 | continuous |
| 73 | `fx.w3x.locust.darkraor.p02` | 1.2 | 0.6 | 1.1 | continuous · ambient |
| 74 | `fx.w3x.orb.darkbreathdamage.p00` | 1.2 | 0.6 | 1.1 | continuous · ambient |
| 75 | `fx.w3x.particle.blackhole.p02` | 1 | 0.6 | 0.9 | continuous |
| 76 | `fx.w3x.particle.lavabreathdamage.p00` | 1.2 | 0.6 | 1.1 | continuous |
| 77 | `godie-blackhole-p2` | 1.0 | 0.6 | 0.9 | continuous |
| 78 | `godie-darkbreathdamage-p0` | 1.2 | 0.6 | 1.1 | continuous |
| 79 | `godie-darkraor-p2` | 1.2 | 0.6 | 1.1 | continuous |
| 80 | `godie-lavabreathdamage-p0` | 1.2 | 0.6 | 1.1 | continuous |
| 81 | `godie-tectonicfury-p1` | 1.2 | 0.6 | 1.1 | continuous |
| 82 | `godie-netherstrike-p3` | 0.9 | 0.585 | 0.815 | continuous |
| 83 | `godie-aquaspikeversion2-p9` | 1.1 | 0.55 | 1.05 | burst |
| 84 | `godie-meteor-p3` | 0.9 | 0.54 | 0.86 | burst |
| 85 | `fx.fam.cloud.physical.s120` | 1.312 | 0.525 | 1.2872 | burst |
| 86 | `fx.fam.cloud.void.s180` | 1.312 | 0.525 | 1.2872 | burst |
| 87 | `fx.fam.cloud.wind.s120` | 1.312 | 0.525 | 1.2872 | burst |

中位數：原壽命 2 秒 → 解析後 1.25 秒。
另外 79 份 alpha 從不歸零（硬切，沒有尾段）—— 一個位元都沒動；497 份本來就合規，走 identity 快速路徑（⛔ 連一次物件配置都沒有）。
### ⚠️ 兩個天花板疊在一起（寫進後台說明了）

`oneShotMaxLifeSec`（特效鍛造頁，出貨 0.6 秒）與 `vfxFadeOutMaxSec`（0.5 秒）**比較嚴的那個贏**。
一份「整段都在淡出」的文件（很多匯入的 w3x 是這樣）尾段就是它的全部壽命，所以把餘燼壽命上限
拉到 2 秒而這一格還是 0.5，看到的仍然是 0.5。⇒ 要長餘燼**兩格一起調**。
這句話逐字寫進 `apps/admin/src/configForms.ts` 的 `vfxFadeOutMaxSec` 說明，⛔ 不是只寫在這裡。

---

## ② 莉娜的「紅色粒子飄上天」——**不是**尾段，是**生成窗口**

⭐ 量完才說（任務要求）：

| 候選 | 是什麼 | 量到的 | 判定 |
|---|---|---|---|
| (a) **施法光柱的上升餘燼** | `CastPillarFx` 每 150ms 補一發 `moteSpec`，往上飛（`gravityY` 反轉）、顏色 = 技能元素 | 單顆壽命 **0.175–0.35 秒**（GH#494 已砍過一次）；但**補滿整段施法時間** | ⭐ **就是它** |
| (b) `fx.fam.dissipate.w3x-ff0000.s85` | 莉娜 Q/E 的家族美術，tint 逐字 `[255,0,0]`、`gravityY +0.4`（會上飄） | 文件壽命 1.107s，尾段 0.443s（**沒超標**）；而且走 `frontLoadDoc` 已被夾到 0.6s | ⛔ 不是它 |
| (c) `fx.firestorm`（Q 的 `vfxKey`） | 火焰錐、`gravityY +2.5` 往上 | 壽命 0.6s、尾段 0.51s | ⛔ 太短，不是它 |

**為什麼「特別是莉娜」**——她四支技能的施法時間**全部**高於中位數（全 262 支帶 `castTimeSec` 的技能中位數 **0.667 秒**）：

| 技能 | castTimeSec | 紅色粒子在畫面上的總時間（窗口 + 單顆壽命 0.35） |
|---|---:|---:|
| Q 04-01 火球術 | 0.767 | **1.12 秒** |
| E 04-03 龍破斬 | 1.233 | **1.58 秒** |
| W 04-02 炸彈陣 | 1.433 | **1.78 秒** |
| R 04-04 神滅斬 | 2.000 | **2.35 秒**（全場第 8 長的吟唱） |

⇒ 這**不是**「尾段 fade」，是**整體存在時間**，所以照任務指示做成**另一格**：
`config.vfx-cleanup@1.castMoteEmitShare`（出貨 **0.5** = owner 的「減半」，三個住處齊全）。
餘燼只在施法窗口的**前 50%** 補；莉娜 R 從 2.35 秒 → **1.35 秒（−43%）**。

⛔ 光柱本體（核心／外殼／地面光暈）**一格都沒動** —— 它是「還要吟唱多久」的讀數，
砍它等於拿掉玩家判斷閃避的訊號。
⚠️ 要吃到完整的「減半以上」還差最後一段：單顆餘燼壽命 `feel-fx.castMotes.lifetimeMaxSec`
（0.35 → 0.175）—— **那份 config 在本 lane 的柵欄外**（另一條 lane 佔用），所以沒動。

---

## ③ GH#567 守衛物件的攻擊指引（owner 指定的做法，⛔ 沒有自己設計別的）

| owner 的字 | 落在哪 |
|---|---|
| **伸縮抖一下** | `guardianVolley.recoilScale()`（前 45% 蹲下蓄力、後 55% 抽長彈回，體積大致守恆）→ `guardianRecoilBus`（entityId → 脈衝，自己過期）→ `GuardianView.update()` 乘在 `restScale` 上 |
| **投射物飛向被攻擊方** | `GuardianVolleyFx`：共用來源球 + `InstancedMesh`，中立琥珀色（⛔ 不是敵方紅），拋物線，上限 24 顆，到站即 `dispose()` |
| 時序對得上 `impactTick` | `volleyTiming(windupMs)` 把窗口切成 蓄力 22% + 飛行 78%，**兩段加起來恰好等於預告圈填滿的時間** ⇒ 球在傷害落地那一幀到站 |
| `guardianWake` 零消費端 | 接上了：醒來播**半幅**的同一條曲線（狀態改變，⛔ 不可以看起來像一次攻擊） |
| 預告圈顏色 | ⛔ 一個位元都沒動（中立琥珀是刻意的） |

回收：`resetForRound()` / `dispose()` 兩邊都丟 instance 並 `clearGuardianRecoils()`。

---

## 守衛與突變

| 檔 | 驗什麼 |
|---|---|
| `apps/client/src/vfx/fadeOutTail.test.ts` ① | **掃全樹** 584 份：解析之後尾段 ≤ 後台那一格、且透明之後不再活著。上限**從 `content/config/vfx-cleanup.json` 推導**，⛔ 不抄 0.5 |
| 同上 ② | **被測的是出貨的那一個**：真的走 `toParticleSystem` |
| `apps/client/src/vfx/guardianVolley.test.ts` | `guardianMark` 進來 ⇒ 場上**同時**有落點圈與一顆從守衛飛向目標的球 + 守衛自己動了；`guardianWake` 有消費端且脈衝會過期 |

**突變（一批一條，挑最承重的）**：把 `toParticleSystem` 的
`const doc = clampFadeOutTail(...)` 換成 `const doc = rawDoc` ⇒
`fadeOutTail.test.ts` ② **紅**：`expected 8 to be less than or equal to 0.9001`。
⭐ 而 ①（純函式掃全樹）在突變下**仍然是綠的** —— 這正是為什麼②必須存在（失敗形態⑤）。
用 `Edit` 改回，⛔ 沒有 `git checkout`。

---

## ⚠️ 柵欄外的三處（逐檔列名，全部是最小必要）

| 檔 | 為什麼非動不可 | 改了多少 |
|---|---|---|
| `apps/admin/src/configForms.ts` | `configForms.test.ts` 的「schema 的每一個可編輯葉節點都**恰好**有一筆標籤」是雙向的 —— 新增 config 欄位而不補標籤**一定紅**；而第一守則本來就要求第三個住處 | `VFX_CLEANUP_SPEC.fields` 加兩列 |
| `apps/client/src/render/views/GuardianView.ts` | 「伸縮抖一下」動的是**模型**，而 `VfxContext` 只給得到座標、給不到 `TransformNode`；特效層畫不出這件事 | 一個欄位（`entityId`）+ 一個欄位（`restScale`）+ `update()` 裡三行 |
| `apps/editor/src/preview3d/particles.test.ts` | 它是同一支 factory 的鏡像測試（preview == ship），不改就紅 | 一處斷言改成從那一格推導 |

## ⚠️ 工作樹上**不是我造成**的紅（跑之前就在）

- `packages/shared/src/sim/mobs.ts` — `installKingKit` 未定義 + `ChampionId`/`AbilityInstance` 型別（另一條 lane 在飛）
- `apps/client/src/ui/components/AbilityBar.tsx(656,37)` — `Cannot find name 'key'`（連帶 11 條 `apps/client/src/ui/**` 測試紅）
- `apps/admin/src/navSections.test.ts` — `NAV 多了基準線沒有的頁面：uiCues`
- `packages/shared` 的 20 個 `*Fresh` / bundle 類守衛 —— 其中 `shippedBundleIsCurrent` 是因為我改了 `content/config/vfx-cleanup.json` 而**本 lane 禁止跑 `content:build`**，⭐ 由主 session 統一跑一次；其餘是別的 lane 的產生器鏈
