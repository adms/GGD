# GH#838 特效工坊 —— 第一片：能力盤點 ＋ 最簡單一招的 JSON 需求

> lane `vfx-workshop-838` · 2026-09-19 · 基準 `main` @ `4b8ad9a38`
> ⭐ 收尾時 HEAD 已被別條 lane 推進到 `9f1c4dd99` —— **每一項關鍵量測都在新 HEAD 重跑過**
> （`modelFxArrive` 0 筆 · `spawnModelFx` 單一 emit · 6 個觸發器 · 230 支腳本 · `apps/editor/src/vfx` 仍不存在），結論不變。
> ⚠️ 本報告只做**唯讀量測**，⛔ 沒有動任何出貨內容。
> ⚠️ 下面每一個數字都附**重量指令** —— 這份散文會過期，指令不會。

---

## 0. ⭐ 最重要的發現：#838 的票文前提**整批過期**

票文的「開發順序」把四件事列成待做，⭐ **四件今天全部在庫**。
⚠️ 這不是小幅漂移 —— 是**整張票的第 1、2 階段都已落地**，而票還開著。

| 票文說「要做」 | 今天量到 | 重量指令 |
|---|---|---|
| `vfx-script@1` schema（新） | ⭐ **在庫** `packages/shared/src/content/schema/vfxScript.ts` | `ls packages/shared/src/content/schema/vfxScript.ts` |
| `VfxScriptPlayer`（新機制） | ⭐ **在庫** `apps/client/src/vfx/VfxScriptPlayer.ts`（＋6 支守衛） | `ls apps/client/src/vfx/VfxScriptPlayer*.ts` |
| `content/vfx-scripts/`（新集合） | ⭐ **230 份出貨腳本** | `ls content/vfx-scripts/*.json \| grep -vc _index` |
| 編輯器頁（資源池／參數表單／時間軸） | ⭐ **在庫** `apps/editor/src/vfx-forge/`（29 個模組＋**24 支守衛**） | `ls apps/editor/src/vfx-forge/` |
| 「逐段 strike 事件不存在」 | ⛔ **已存在** —— `on:"strike"` 在 trigger enum，player 有 `case "comboStrike"` | `grep -n 'case "comboStrike"' apps/client/src/vfx/VfxScriptPlayer.ts` |
| 「三招要用編輯器產出」 | ⭐ **三招的 script 都已出貨** | 見 §3 |

⇒ ⭐ **這張票今天的 delta 不是「做一座編輯器」，是「補最後幾個表達不了的標籤」。**
⚠️ 誰照票文的「開發順序」開工，第一個動作就會是**重做一次已經在庫的東西** ——
這正是 owner 2026-08-30 說的「重複做已經做好的」。

---

## 1. 今天編輯器已經有的特效能力（量到的，⛔ 不是讀文件）

### 1.1 表示形（segment kinds）：**9 種**

`grep -c 'kind: z.literal(' packages/shared/src/content/schema/vfxScript.ts` → **9**

| kind | 做什麼 | 對應票文 MISSING |
|---|---|---|
| `modelFx` | glb 模型（scale／scaleAxis／tint／alpha／clip／clipTimeScale／spin／heightU） | — |
| `vfx` | 粒子／特效資產（`at: self`/`target`/`point`/`bone` ＋ attach） | ⭐ **M0 已落地**（`at:"bone"` 掛受擊者） |
| `floatingText` | 浮動文字 | ⭐ **M7 已落地**（`velocityAngle`） |
| `screenFlash` / `screenShake` | 畫面閃／震 | — |
| `anim` | 身體剪輯脈衝（`AnimPulse`） | ⭐ **M4 已落地** |
| `bodyMove` | 位移演出（`mode: teleport｜arc`） | ⭐ **M1／M3 已落地** |
| `hideBody` | 本體隱藏 | — |
| `sound` | 逐段音效 | ⭐ **M6 已落地** |

### 1.2 觸發器：**6 個**（`VFX_SCRIPT_TRIGGERS`，schema 第 68–95 行）

`castStart` · `castEffect` · `strike`（＋`strikeIndex` 第 N 段） · `projectileSpawn` · `projectileHit` · `reflectSuccess`

⭐ `reflectSuccess` 是 GH#885 為**理想鄉EX**加的 —— ⛔ 票文說它「寫不出來」，那句話 2026-08-31 起就不成立了。
⭐ schema 裡逐字記著**為什麼沒有 `blockSuccess`**（歸屬會掛錯人，正解在 GH#650）—— 這是一格**量過才不加**的缺席，⛔ 不是漏掉。

### 1.3 連續參數（owner 要的 slider 那一族）

`scale` · `scaleAxis`（三軸，非等向） · `tint` · `alpha` · `spinDegPerSec` · `heightU` · `heightKeys`（高度曲線） · `clipTimeScale` · `trailVfxId`＋`trailIntervalSec` · `atMs`。
⇒ ⭐ 票文 MISSING 表的 **M0／M1／M3／M4／M6／M7／M10／M11 八項全部在庫**。

### 1.4 ⭐ 積木（subtype）—— owner「像 JASS 一樣可以呼叫設定」那一條

| | |
|---|---|
| schema | `packages/shared/src/content/schema/vfxSubtype.ts`（`vfx-subtype@1`） |
| 展開器 | `packages/shared/src/content/vfxSubtypes/expand.ts` |
| 出貨積木 | ⭐ **只有 4 塊**：`sub.doom-mark-cast` · `sub.bladestorm-8hit` · `sub.dive-dash-thunder` · `sub.forward-twin-blast` |
| 編輯器側 | `apps/editor/src/vfx-forge/subtypeAuthoring.ts`（`authoredTimeline` 保留呼叫不展開） |

⭐ 每塊積木的 `params[*]` 都帶 `origin`（`census:vfx-scripts/<id>#<段>.<欄位>`）——
⚠️ 這正好滿足 CLAUDE.md「模板 `params[*].default` 每一格都要引用得到出處」那條閘。

⭐ **這是今天最大的槓桿**：230 支腳本只抽出 4 塊積木。
owner 要的是「拼湊組合、⛔ 並非每個技能都一個特定特效」——
⇒ 下一批最該做的是**盤點 230 支腳本裡的重複段落**，⛔ 不是再做編輯器 UI。

### 1.5 ⭐ 擁有權分界是乾淨的（跑 genguard 驗過，⛔ 不是讀路徑猜的）

```
bash scripts/genguard.sh content/vfx-scripts/godie-hjai.e.json
  → ✓ 沒有產生器擁有者               ⇒ ⭐ 編輯器可以寫

bash scripts/genguard.sh content/abilities/godie-hjai.e.json
  → ⚠️ 正規化器 castderive:build:raw 就地改欄位 ⇒ ⛔ 行為軸不是編輯器的
```

⇒ ⭐ 票文「演出軸分離成編輯器唯一擁有的集合」這個設計**成立且已落地**。

---

## 2. 三招裡**最簡單的一招**＝ 04-03 龍破斬（`godie-hjai.e`）

### 選它的理由（量到的，⛔ 不是印象）

| 招 | id | 出貨 script 大小 | 已知阻塞 |
|---|---|---:|---|
| ⭐ **04-03 龍破斬** | `godie-hjai.e` | **878 B** | ⭐ **無**（不在 SOLID_BEAM_GAP 名單上） |
| 01-04 超究武神霸斬 | `godie-hart.r` | 4,774 B | ⛔ 實心寬光束缺積木 |
| 20-002 理想鄉EX | `godie-e002.ex` | 1,308 B | ⛔ 實心寬光束缺積木 |

`apps/editor/src/vfx-forge/acceptanceVisualGaps.ts` 逐字列出 7 支受
`SOLID_BEAM_GAP`（「Main 缺少可重用、透明安全的連續實心寬光束視覺積木」）阻塞 ——
⭐ **龍破斬不在裡面**，另外兩招都在。⇒ 它是唯一「今天就能收尾」的一招。

### JASS 底稿（票文 §2，A04R · war3map.j 29886–30160）

詠唱 5 句（0.2s 隔）→ 施法點 DoomTarget ＋ h013 聚氣陣 230%
→ **0.96s 後**火球（FireBlast 4.5）1500u/s 直線＋每 tick 拖尾
→ 爆炸：18 具 WarStomp 環（r325／20°）＋450 範圍結算

### 逐項需求表：要哪些標籤／資源／表示形／參數，引擎有沒有

| # | JASS 動詞 | GGD 表示形 | 住哪 | 引擎有嗎 |
|---|---|---|---|---|
| 1 | 詠唱 5 句（0.2s 隔） | `floatingText` ×5 | ⭐ **ability JSON**（`delayed` 0/0.2/0.4/0.6/0.8） | ⭐ **有，已出貨** |
| 2 | 施法點 DoomTarget 魔法陣 | `modelFx` | vfx-script `sub.doom-mark-cast` 段 0 | ⭐ **有，已出貨** |
| 3 | h013 聚氣陣 230% | `vfx` ＋ `scale` | vfx-script `sub.doom-mark-cast` 段 1 | ⭐ **有，已出貨** |
| 4 | 家族預設光柱要讓路 | `yields:["caster.castFx"]` | vfx-script doc-level | ⭐ **有，已出貨**（GH#1000） |
| 5 | 火球本體直線飛行 | `spawnModelFx` `tpl-line-blast` | ⭐ **ability JSON**（行為，speed/distance） | ⭐ **有，已出貨** |
| 6 | 每 tick 拖尾 | `trailVfxId`＋`trailIntervalSec` | vfx-script `modelFx` 段 | ⭐ **有**（schema:182–184）—— ⚠️ **出貨腳本還沒填** |
| 7 | 落點爆炸視覺 | `spawnVfx fx.prim.fire.explosion-lg` | ⭐ **ability JSON 的 `onArrive`** | ⭐ 有，但 ⛔ **不在編輯器手上**（見 §3） |
| 8 | 18 具 WarStomp 環（r325／20°） | `modelFx` `count`＋`spacing` 或一塊新積木 | ⛔ **應該住 vfx-script** | ⛔ **表達不了**（見 §3） |
| 9 | 450 範圍結算 | `damageArea` | ⭐ **ability JSON**（純行為） | ⭐ **有，已出貨** |

### ⚠️ 出貨腳本的 `notes` 有一句**已經過期**

`content/vfx-scripts/godie-hjai.e.json` 的 notes 逐字寫著「缺口：**M11 拖尾**、到達觸發器」。
⇒ ⭐ **M11 早就落地了**（`trailVfxId` 在 schema 第 182 行、player 第 616 行讀它）——
⚠️ 真正的缺口只剩**到達觸發器**那半句。
⛔ 這句過期的 notes 會讓下一輪以為要先做 M11（第三守則：註解會說謊）。

---

## 3. ⭐⭐ 唯一真缺口：**沒有「模型特效抵達」這個觸發器**

### 量到的事實

| 問題 | 答案 | 重量指令 |
|---|---|---|
| `spawnModelFx` 發什麼事件？ | ⭐ 只有 `modelFxSpawn`（**出膛**那一刻） | `grep -n 'emit("modelFx' packages/shared/src/sim/effects/spawnModelFx.ts` → 第 326 行，**全檔只有這一個 emit** |
| 有抵達事件嗎？ | ⛔ **零個** | `grep -rn 'modelFxArrive' --include='*.ts' packages apps` → **0 筆** |
| `projectileHit` 能用嗎？ | ⛔ **不能** —— 它只由 `spawnProjectile` 與 `BasicAttackSystem` 發，⛔ 火球走的是 `spawnModelFx` | `grep -rn 'emit("projectileHit' packages/shared/src/sim/` → 只在 `ProjectileSystem.ts:160` |
| `modelFxSpawn` 在 trigger enum 裡嗎？ | ⛔ **不在**（6 個觸發器沒有它） | schema 第 68–95 行 |

### ⛔ 為什麼「用 `castEffect` ＋ `atMs` 湊一個」是錯的

出膛可以用 `castEffect`（同一 tick 解算）錨到。⭐ **抵達不行**，而理由是結構性的：

```
抵達時刻 = distance / speed
  tpl-line-blast 預設：distance 12u ÷ speed 27.5u/s = 0.436 s = 436 ms
  可調範圍：distance 1–48u · speed 1–200u/s  ⇒ 抵達時刻 5 ms – 48,000 ms
```
（`content/ability-templates/tpl-line-blast.json` 的 `params.speed` / `params.distance`）

⇒ ⭐ 在 vfx-script 寫 `atMs: 436` ＝ 把一個**從行為資料算出來的數字**抄成第二份
（⛔ **第〇·四守則**：值只有一個住處）。
⚠️ 而它壞掉的樣子**最難發現**：owner 到後台把 `speed` 從 27.5 調成 40，
火球 0.3 秒就到，⭐ **而爆炸演出仍然在 436 ms 播** —— 畫面不報錯、測試不會紅、
沒有任何東西說「這兩個數字應該相等」。這正是本 repo 記過的「壞掉跟正常長得一模一樣」。

⇒ ⭐ **正解是實作那個標籤**（owner 2026-08-26 方法論：翻譯 JASS→JSON，
JSON 沒支援的標籤則**去實作**），⛔ 不是用現有參數湊。

### 建議形狀（⛔ 我沒有實作它 —— 不在本 lane 柵欄內）

| 層 | 要動什麼 |
|---|---|
| ① sim | `spawnModelFx.ts` 在抵達那一 tick 多發一個 `modelFxArrive`，payload **型別住 emit 站旁**（⛔ 不是 `as never`；本 repo 失敗形態⑧一天中五次） |
| ② 協定 | `eventFanout.ts` 白名單加 `modelFxArrive`（⛔ **只加事件名，不動 `defineTypes`**） |
| ③ schema | `VFX_SCRIPT_TRIGGERS` 加 `"modelFxArrive"` |
| ④ player | `VfxScriptPlayer` 加對應 case |
| ⑤ 守衛 | 出貨內容 → 真 SimWorld 施放 → 真事件 → 真 player，斷言 segment 落在**抵達那一 tick**；突變：把 `distance` 調成兩倍 ⇒ 期望 tick 跟著變（⛔ 寫死 436 就紅） |

⭐ 這一顆機制**同時解鎖另外兩招**（超究武神霸斬的第七刀急墜落點、理想鄉EX 的劍光柱落點），
⇒ 照第〇·五守則「按擋住支數排序」，⭐ 它是三招裡**最該先做的一顆**。

⚠️ ⛔ 但它**全部在本 lane 柵欄外**（`packages/shared/**` · `apps/client/**` · `apps/game-server/**`）
⇒ 要主線重派一條 lane。

---

## 4. 本 lane 的柵欄問題（⛔ 沒有猜相近路徑）

| 派給我的路徑 | 狀態 |
|---|---|
| `apps/editor/src/vfx/**` | ⛔ **不存在，而且從來沒存在過**（`git log --all --diff-filter=D` 零筆） |
| `apps/editor/src/ai/**`（不含 `structuredJson.ts`） | ⭐ 存在 —— ⛔ 但**與本票無關**（見下） |
| `docs/_reports/` | ⭐ 存在 ⇒ 本報告 |

⭐ **真正的編輯器特效碼住 `apps/editor/src/vfx-forge/`**（29 模組＋24 守衛，`VfxForgePage.tsx` 84 KB、`VfxForgeStage.ts` 126 KB）。
⛔ 我**沒有**把它當成「相近路徑」去寫 —— 依 lane 規則第 3 條回報，請主線決定是否重派。

### ⛔ 為什麼我**沒有**在 `apps/editor/src/ai/` 硬塞一個「校正器」

`apps/editor/src/ai/` today ＝ 圖示生成（`prompt.ts`／`accept.ts`／`AiIconPanel.tsx`）
＋ 文字填空（`AiFillContext.tsx`）＋ `aiFillJson`（⚠️ 量到：**production 零呼叫端**，
只有 `structuredJson.test.ts` 在叫它 —— GH#1108 接線未完）。

⇒ 把一個 VFX JSON 校正器塞進 AI 模組有**兩個問題**：
1. ⛔ 它會是**第二個住處** —— 校正規則已經住在 `vfxScript.ts` 的 Zod `superRefine`
   （`heightKeys` 遞增、`trailIntervalSec` 沒有 `trailVfxId` 就沒人讀⋯）。再寫一份必然漂。
2. ⛔ 它**違反 owner 對這張票的逐字裁決**：
   > 開放讓玩家自己設計 英雄、技能、特效，**不是靠 AI 無止境的逼近太沒效率**

⇒ ⭐ 依「⛔ 禁止的第三條路：用現有參數湊一個看起來像的」，我**停手並回報**，
⛔ 而不是為了交出一個檔案去做一件會腐爛的事。

---

## 5. 給主線的三件事（按價值排序）

1. ⭐⭐ **票文前提要更新** —— #838 的「開發順序」1、2 階段已完成。
   ⛔ 照原文開工＝重做在庫的東西。建議把票縮成「**`modelFxArrive` 觸發器 ＋ 實心寬光束積木**」兩顆。
2. ⭐ **重派一條 lane 做 `modelFxArrive`**（柵欄：`packages/shared/src/sim/effects/spawnModelFx.ts` ·
   `packages/shared/src/content/schema/vfxScript.ts` · `apps/game-server/src/net/eventFanout.ts` ·
   `apps/client/src/vfx/VfxScriptPlayer.ts`）。⭐ 它一顆解鎖三招。
3. ⭐ **積木盤點批**：230 支腳本只抽出 4 塊 subtype。
   owner 要的「拼湊組合」今天覆蓋率極低 —— 這是比做 UI 更高槓桿的下一批。

### ⚠️ 兩處今天就該修的過期散文（⛔ 都在我柵欄外）

| 檔 | 過期的話 | 實際 |
|---|---|---|
| `content/vfx-scripts/godie-hjai.e.json` 的 `notes` | 「缺口：**M11 拖尾**、到達觸發器」 | M11 已落地（schema:182）⇒ 只剩到達觸發器 |
| GH#838 票文 MISSING 表 | M0／M1／M3／M4／M6／M7／M10／M11 列為缺 | ⭐ **八項全部在庫** |
