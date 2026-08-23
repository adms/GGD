# D8 · 舊票 `<#300` 逐張複驗（108 張）

> 2026-08-23 · 唯讀複驗（⛔ 本 lane 未執行任何 `gh` 寫入、未動任何程式檔）
> owner 逐字：「**延伸的舊票(<#300)可以修但盡量以註解關閉**有必要的話**開新票為主**」
>
> 承接 C1 lane 的移交：「延伸舊票 `<#300` 共 108 張，⛔ 不建議機械篩批次關閉。」
> ⇒ 這一輪**逐張讀 body ＋ 逐張回查 HEAD**，每一筆判定都帶檔:行 / commit / 量到的數字。

---

## 0 · 結論一句話

**108 張裡只有 9 張關得掉，其餘 99 張是真的還開著。**
C1 的保留是對的 —— 「近三週沒人動」在這個 repo 裡**完全不等於過期**：
這批票絕大多數是 2026-07-28 那次逐行稽核產出的，它們的證據到今天（640 個 commit 之後）**逐條仍然成立**。

| 判定 | 張數 | 票號 |
|---|---:|---|
| ✅ **已經做完** | **6** | #19 · #78 · #206 · #215 · #230 · #248 |
| ♻️ **已經過期／被取代** | **2** | #175 · #243 |
| 🔁 **重複** | **1** | #128 → #96 |
| 🟡 **還沒做但仍然有效** | **99** | 其餘全部 |

⚠️ **這一輪最重要的發現（比關票重要）**

> **#173 從「還沒炸」升級成「已經可以炸」。**
> 該票 2026-07-28 的結論是「模板展開晚於引用檢查，**但目前沒有任何內容文件採用 template，所以還沒炸**」。
> 今天 `content/ability-templates/` 裡已經有真的模板（`tpl-barrier-domain.json` · `tpl-beam-roll.json` …），
> 而 `packages/shared/src/content/loader.ts:173 / :195 / :209` 的 `validateReferences(store)`
> **仍然全部早於** `registries.ts:154-158` 的 `expandStandalone` / `expandEmbedded`。
> ⇒ 模板展開出來的 `projectileId` 今天**真的**逃得過引用檢查，而 `refs.ts` 對 `template` 欄位仍零認知。
> **這張票的優先序應該往上調，⛔ 不是往下。**

### 這一輪的兩個共同前提變動（讀任何一張舊票前都要先知道）

1. **內容瘦身**：`content/champions/` **116 → 72**、`content/abilities/` **673 → 422**，
   下架的 48 隻英雄 / 276 支技能搬到 `content/_legacy/`（`docs/legacy-index.md`，440 檔）。
   ⇒ 舊票裡「115 隻」「674 份」這類**分母全部作廢**，但被點名的檔案多半只是換了住處，結論不變。
2. **白名單** 53 → **49** 隻（`data/curation/whitelist.json`）。

---

## 1 · ✅ 已經做完（6 張，關）

| 票 | 判定證據（回查 HEAD） |
|---|---|
| **#19** 殭屍跨回合 100 隻召喚殭屍王 | `content/config/arena-rules.json` `mobWaves.boss`：`killThreshold: 100` · `hpMult: 100` · `sizeMult: 5` · `championSource: "random"`（owner 的「帶入英雄 3D model」）· `king.innateAbilityId: "godie-zombieking.passive"`。火圈延後：`content/config/config.match.json` `match.fireRing.boss.delayFireRingSec: 180`（＝ owner 的「延後 3 分鐘」）＋ `extendCombatSec: 180`。三個住處齊（content ＋ `schema/config/arenaRules.mobWaves.ts` ＋ `apps/admin/src/mobWaves.ts:274`） |
| **#78** T2 語音 jump / knockdown | `apps/client/src/audio/spatialPolicy.ts`：`"jump"` 與 `"knockdown"` **兩個都已是 `dispatched: true`**，reason 逐字寫「GH#441 —— 由 ENTITY_FLAG.AIRBORNE 的上升緣說（#247 的 leap 在飛）」／「由 `knockdown` 事件的受害者說（GameApp.dispatchContextualVoice）」。該票要的正是這兩個 flag 翻面，而 `spatialPolicy.test.ts` 的 dormant 守衛會擋住假宣稱 |
| **#206** v0.9.13 殭屍規格全面改版 | 三段全部落地：① **傷害比例分紅（可超過總額）**＝ `arena-rules.json:312 / :362` `"lastHitMode": "bonus"`（owner 的語意當預設，`"weight"` 保留為開關；`arenaRules.mobWaves.ts:520` 的欄位說明逐字引用「owner 2026-07-29, GH#206」）② **獎勵數值**＝ special `bountyGold 5000` / `bountyLevels 5`、boss `bountyGold 30000` / `bountyLevels 50` ③ **從英雄推導 + 隨機選英雄**＝ `championSource: "random"` · `heroHpMult` · `heroDamageMult` · `splitByDamage: true` |
| **#215** 衝擊波環資產優先 | `content/vfx/` 已有整族 `fx.fam.shockwave-ring.{arcane,earth,fire,holy,ki,lightning,physical}.s{100,150}.json`；`content/config/vfx-families.json` 對 `shockwave` **94 處**引用，`warstomp` / `thunderclap` 各有對應。＝ 該票要的「一個環 ＋ 每次呼叫的 scale / tint / alpha」已是一個模板家族。後續調校已由 **#617**（owner「硬加的·太亮太搶眼」＋「散開要夠快」）承接 |
| **#230** 特殊殭屍出現頻率太高 | `arena-rules.json` `mobWaves.special.chancePercent: 1.25`，三個住處齊：Zod `arenaRules.mobWaves.ts:909` `z.number().min(0).max(100)`（**有上界**，符合 #277 的教訓）＋ admin `apps/admin/src/mobWaves.ts:274` `chancePercent: 1.25` ＋ 欄位 union `:423` |
| **#248** 每回合硬上限 5 分鐘 | `content/config/config.match.json` `match.fireRing.roundHardCapSec: 300`；Zod `schema/config/match.ts:231` `z.number().min(20).max(1800).default(300)`；admin `apps/admin/src/matchConfig.ts:365 / :557`。⭐ 5 分鐘是**預設值**不是寫死（正是該票的驗收條件） |

---

## 2 · ♻️ 已經過期／被取代（2 張，關）

| 票 | 取代它的是什麼 |
|---|---|
| **#175** #248 §6「暴擊歸零」 | 出貨值確實沒動（`content/champions/` **71 隻仍全部 `critDamage: 1.75`**），但**這個前提已經被明文推翻**：`content/items/godie-i06d.json` 的 `authoringNote`（2026-08-18 雙向逐句稽核）逐字寫「出貨的每一張英雄卡 `baseStats.critDamage` 都是 **1.75**⋯**⛔ 把它「修好」成 2.0 會變成 3.75 倍**」；`godie-i01n` 更已整條改寫成 `critStrike`（`sim/combat/critStrike.ts`），不再是該票列的 `+48.25` 差值。⇒ §6 要的「全體歸零 + 四件傳說裝改差值」與現行出貨設計**直接衝突**，⛔ 照做會壞掉四件裝的卡面算術。要重開必須是一張新的平衡票（而平衡公式已定 —— CLAUDE.md 第一守則） |
| **#243** 46 支技能完全沒有任何 effect | 重跑同一條普查：422 份 ability doc 裡，`effects` ＋ `passive` 遞迴掃完**一個內容都沒有的只剩 1 支** —— `godie-hapm.passive`（52-00 十二道試煉）。原票舉的 `godie-e002.passive` / `godie-e008.passive` / `godie-emns.w` 今天分別是 `block{magic,0.3,1.0}` / `vision{trueSightRadius 9.17}` / `attributes{int 7/12/17/22}` 的真被動。「46 支」這個數字作廢。⚠️ 剩下那 1 支正是 CLAUDE.md 第〇·五守則拿來當範例的那支，**建議開新票單獨追**，⛔ 不要留著這張分母錯的傘票 |

---

## 3 · 🔁 重複（1 張，關）

| 票 | 主票 | 理由 |
|---|---|---|
| **#128** 批次四未動工：faceColors 沒接到臉部 decal | **#96** | 兩張是同一批工作（體素批次四）、同一個斷點（`paint.ts:676` 把 barcode 交給 `paintBarcodeBase`，`:677` 的 `paintFaceDecals(s, recipe, p)` 不收 barcode）。今日回查 `packages/shared/src/content/voxelSkin/paint.ts` 對 `faceColors` **仍 0 命中**、`nose` 只有一句註解 —— 兩張都還開著，但只需要一張。#128 多出來的那個發現（**沒有鼻子筆刷可以接**）要在關票留言裡搬進 #96 |

---

## 4 · 🟡 還沒做但仍然有效（99 張）

> 每一列的「證據」都是**今天在 HEAD 上量的**，⛔ 不是轉抄票裡的舊行號。

### 4.1 安全（8 張）—— 全部一字未改，連行號都還準

| 票 | 在等什麼 | 證據 |
|---|---|---|
| #81 CSP | 一份完整政策 | `nginx/nginx.conf:255` 與 `:347` 仍只有 `frame-ancestors 'none'` |
| #82 refresh token in localStorage | httpOnly cookie（或明文承擔） | `apps/client/src/ui/platform/session.ts:33` 仍 `localStorage.getItem`；`apps/platform` 全樹 0 個 `SetCookie` |
| #84 X-Real-Ip 繞限流 | trusted-proxy CIDR 設定 | `apps/platform/internal/httpx/middleware.go` `ClientIP()` 第一行仍是無條件 `r.Header.Get("X-Real-Ip")` |
| #87 平台 http.Server 無 timeout | 保守的三個 timeout ＋ WS 分流 | `apps/platform/cmd/platform/main.go:94` 仍**只有** `ReadHeaderTimeout` |
| #88 Lobby WS 無 per-account 上限 | hub 加閘 ＋ 兩份 nginx 的 `/api/` 加 `limit_conn` | `nginx/nginx.conf` 與 `deploy/helm/ggd/files/nginx.conf` 的 `limit_conn` **都仍只在 `:513` / `:527`** |
| #89 access token 走 URL query | 把 fallback 縮到 WS handshake | `apps/platform/internal/auth/middleware.go` `BearerToken()` 最後一行仍 `return r.URL.Query().Get("token")` |
| #90 vite content handler 無 realpath | `realpathSync` 再檢一次 | `apps/client/vite.config.ts` / `apps/admin/vite.config.ts` `realpath` **0 命中** |
| #164 vite handler 無 nosniff | 兩份 handler 加 header | 同上兩檔 `nosniff` **0 命中** |

### 4.2 特效／打擊感（12 張）

| 票 | 證據 |
|---|---|
| #38 體素碎塊 | `apps/client/src/vfx/` 仍無任何 `Debris*` 檔 |
| #39 刀光只綁 9 個模型 | ⭐ `content/config/ambient-vfx.json` 的 bindings **9 → 22**（多出 `attach.godie-e00x.awing` 等三筆變身附掛），⛔ 但 `VfxSystem.ts:1779` 的 `case "basicAttack" / "attackWindup"` 仍**沒有** RibbonTrail —— 該票要的「改成由攻擊事件觸發」未動 |
| #41 打擊音效分層 | `apps/client/src/audio/combatSfx.ts` 對 `hit-light` / `hit-heavy` / `tier` **全部 0 命中**（clip 與 audio-map 仍在，仍無呼叫者） |
| #42 EX 畫面變暗／去飽和 | `apps/client/src/vfx/CombatPostFx.ts` 對 `desatur` / `darken` / `dim` / `saturation` **全部 0 命中** |
| #43 被格擋仍閃受傷紅 | `combatFeedback.ts` 的 `resolveVictimFlash()` 仍是三行、仍不讀 `profile.isBlock`（而 `isBlock` 就在同一個 plan 的 `:465`） |
| #44 兩處尾巴超過 0.25s | `vfxPresets.ts:770` 命中煙仍 `{min:0.4, max:0.6}`。⭐ 投射物拖尾**已改成可調**（`ProjectileView.ts:245-246` 讀 `projectileArt.ts:247` 的 `trailLife`），但 0.25s 契約仍**沒有任何守衛** |
| #61 ability@1 缺三圖層 | `schema/ability.ts` 對 `attachedModels` / `missile` / `beam` / `vfxKeys` **全部 0 命中**（仍 `.strict()`） |
| #62 假特效 vfxKey 設回 null | 422 份 ability 裡顯式 `null` 仍是 **0**；`fx.prim.*` 343 份。⚠️ 與 **#529**（「89% 綁通用原型，110 份沒人用」）是同一片戰場的兩個方向，關票前要先跟 #529 對齊 |
| #64 JASS 掃描沒追 EnableTrigger | `tools/w3x-import/` 只有 `extract_jass_spells.py:200` 的一句**註解**提到 EnableTrigger，無遞移追蹤 |
| #65 216 份發射器用代用貼圖 | `content/assets/textures/particles/wc3/` 仍**只有 8 個 PNG** |
| #131 Asph 球體附掛 | ⭐ 已補 3 筆（`attach.godie-e00x.awing` / `attach.godie-u01u.poweraura` / `attach.godie-o00x.hands`），F1 的 14 筆仍未補齊 |
| #200 特效壽命 ≤3s ＋ 密度 ×5 | 584 份 vfx 仍有 **30 份** `lifetimeSec.max > 3`（最長 **8s**：`fx.w3x.particle.sephboom.p00/p01`）；`burstCount` 中位 32 → **36**（⛔ 不是 ×5）。⭐ 壽命夾子已是後台一格（`content/config/vfx-families.json` `oneShotMaxLifeSec: 0.6`），所以剩下的是**連續模式那條路**與密度 |

### 4.3 語音／音訊（8 張）

| 票 | 證據 |
|---|---|
| #69 .hash ＋ audio-manifests 出貨 | **變大了**：`.hash` 877 → **893** 檔；`content/audio-manifests/` 7 → **9** 檔 |
| #71 victory-taunts 抓兩次 | `apps/client/src/audio/victoryTaunt.ts:313` 仍 `this.fetchJson(VICTORY_TAUNTS_PATH)`，全檔仍無 ContentDb import |
| #72 godie-e00j.name.mp3 | 檔案仍不在磁碟；`nameVoice.ts` 對 `EXCLUDED_NAME_CLIPS` 仍 0 命中（confirm 呼名路徑仍沒套排除） |
| #73 mp3 gapless 三件收尾 | `apps/client/src` ＋ `tools/audio-optimize` 對 `gapless` / `Xing` / `encoderDelay` **0 命中** |
| #74 §9 分離度 QC 閘 | `separation-qc-gate` 仍**沒有任何 .py/.ts 讀它** |
| #76 7 位 cry 英雄選角確認 | `apps/client/src/audio/nameVoice.ts` `cry` **0 命中**，仍綁 `quotes.json` |
| #77 P6 人耳聽測 | `git ls-files \| grep voice-separation-audition` → **0**（表仍從未進版控） |
| #79 T3 狀態語音 | `protocol/schema.ts` 對 `POISONED` / `BLINDED` / `CONFUSED` / `PARALYZED` **全部 0 命中**；`spatialPolicy.ts` 四類仍 `dispatched: false`。⚠️ `ENTITY_FLAG_FREE_BITS` 只剩 **5** 格（CLAUDE.md 寫 11）—— 開這四個位元要先算格數 |
| #169 T4 comms／ping 輪盤 | `retreat` / `love` / `puzzled` / `respond.ok` / `respond.no` 五類**全部仍 `dispatched: false`** |
| #171 語音空間混音試聽頁 | `apps/admin/src/config.ts` 與 `AudioAuditionPage.tsx` 對 `spatial` **0 命中** |

### 4.4 體素條碼（5 張）

| 票 | 證據 |
|---|---|
| #94 條碼執行期沒被吃到 | ⭐ `voxelSkinTexture.ts` **已經**收 `barcode?` 並算進 cache key（`:73` `voxelSkinCacheKey`、`:100` `paintVoxelAtlas(recipe, barcode ?? null)`），⛔ **但唯一的呼叫端 `ChampionView.ts:555` 是 `acquireVoxelSkinTexture(scene, skin)` —— 沒有第二個參數**，而 `ContentDb.ts:251-256` 只載 `_standin-overrides.json` 與 `_voxel-skins.json`，**沒有** `_voxel-barcodes.json`。⇒ 這正是該票點名的「optional 參數所以 typecheck 永遠不會抓到」的同一個洞，只是往下游移了一格 |
| #96 faceColors 是死欄位 | `paint.ts` 對 `faceColors` **0 命中** |
| #97 voxel:extract 只解 PNG | `tools/voxel-gen/` 仍只有 `pngRead.ts`；裁決表仍 114 列 |
| #172 批五未開工 | `content/models/_voxel-barcodes.json` 仍**只有 3 筆**；`content/config/voxel-barcodes.json` 的 overlay 仍 **0 筆** |

### 4.5 內容／技能引擎（14 張）

| 票 | 證據 |
|---|---|
| **#173 模板展開晚於引用檢查** | ⭐ **見第 0 節：已從「還沒炸」升級成「可以炸」** |
| #34 一護兩套身體 | `tools/w3x-import/strip_geoset_prims.py` 的 JOBS 仍無 `heroichigo` |
| #62 / #65 / #61 / #64 | 見 4.2 |
| #67 6 支閃避技能 | `godie-hvsh.w` / `godie-u00l.w` / `godie-umal.w` 仍 **0 個 evasion**；`godie-h02k.r` 已補（3 處）；`godie-obla.r` 與 `godie-ewrd.ex` **已下架到 `content/_legacy/`** ⇒ 剩 3 支 |
| #103 語意色彩全鏈路 | `content/` 對 `descriptionRoles` 仍 **0 份**；渲染鏈仍在（`schema/ability.ts` 有欄位） |
| #132 22 份第二形態逐一比對 | `docs/_transform-forms-249.md` 仍 **26 個 `- [ ]`、0 個 `- [x]`** |
| #135 championForms 加「實際可達等級」 | `championForms.ts` 對 `maxReachableLevel` **0 命中** |
| #136 黑人牙膏缺天生技 | `content/abilities/godie-ogld.passive.json` **仍不存在**（只有 q/w/e/r/ex）；`content/champions/godie-ogld.json` 仍無 `passiveAbility` 欄 |
| #147 三條描述↔JASS 衝突 | ⭐ **A0L6 已落地**（`godie-u00v.r.json` 現在有 `{"kind":"knockback","distanceTier":"極大","distance":8}` ＝ JASS 的 800）；A0JD 已在 90 支重製中改寫成 `evasion 0.1` ＋ `onEvade` hook；**A091 的 `godie-h021` / `godie-hblm` 已下架到 `_legacy`**。⚠️ 這張 `updatedAt` 是 **2026-08-22** —— 活票，⛔ 不要在這一輪碰它 |
| #208 巴恩：變身為非英雄單位 | 抽取器仍只抽 hero→hero 配對 |
| #209 魔法老師：技能書 | 無 spell book 資料模型 |
| #214 悟空超賽 3 | 同族，未動工 |
| #273 效果標籤詞彙表 v2 | owner 十條裁決的追蹤票（活） |
| #278 技能 ABCD 13 批 | 總追蹤票（活） |
| #244 JASS 技能模板計畫 | ⭐ body 最上面就是 **2026-08-23 owner 的逐字更正**（「表二：技能模板群組 1~9 盡快做完上線 等很久了」）—— ⛔ **最活的一張** |

### 4.6 戰鬥／模擬（9 張）

| 票 | 證據 |
|---|---|
| #45 6 位近戰普攻只剩 14~43% | `BasicAttackSystem.ts:543` 註解仍逐字寫「is NOT refunded」；`ab.windup = null` 仍 8 處 |
| #143 節拍兩條軸 | `mobs.ts` 的唯一 `world.stats.set` 是**殭屍王專用**（`boss.championId` 那一格），一般小怪仍無 StatsComp；`effectRunner.ts` 對 `attackerBeat` / `victimStacks` **0 命中**；`feat/260-beat-two-axes` 分支仍在、仍未併 |
| #160 友軍傷害根因 | `OrderSystem.ts` 唯一的 `world.team` 仍是 seat→entity 索引，`attackTarget` 仍無隊伍驗證 |
| #177 四隻回復力離群 | `godie-o02o` / `godie-u01f` **已下架**；`godie-huth`（12）與 `godie-u00k`（8）**仍在白名單且仍是離群**；`content/config/stat-caps.json` 的 `healthRegen` 是 `base = unlocked = 1366` ⇒ 仍**沒有任何有效的回復上限** |
| #178 負護甲顯示規則 | `statDisplay.ts` 仍無任何下限規則 |
| #194 王＋特殊殭屍要會施法 | ⭐ **王已經會了**（`mobs.ts:2878` ＋ `MobSystem.ts:774` 的 `innateAbilityId`），⛔ **特殊殭屍仍沒有** |
| #197 「打就站定 v2」6 條驗收 | ⚠️ **前提漂移**：`apps/game-server/src/ai/kiting.ts` **已不存在**，`Tier0Brain.ts` 對 `closingOnTarget` / `WALK_EPS` 0 命中 ⇒ R1（89.5% 衰退）與 R3 的座標作廢，要**重量一次**才能動手 |
| #231 單場 30 萬傷害分析 | `matchStats.ts` 仍無 `mobKills` 欄 ⇒ 「打小怪算不算進 damageDealt」這個問題仍**沒有答案** |
| #280 / #281 / #283 N1/N2/N4 | #280：`castType:"targeted"` ＋ `targetsEnemies:false` 的技能仍有 **5 支**（10 → 5 是下架造成的），而 `GameApp` / `AimResolver` / `TouchInput` / `GamepadInput` / `Tier0Brain` **五個檔全部 0 個 ally 目標路徑**。#281：`abilitySystem.ts` 的 `case "skillshot"` 仍**只寫 `direction`**，離開 switch 時 `targets` 仍是空陣列。#283：`castabilitySweep.test.ts` 仍有 36 處手刻 ally |

### 4.7 UI／HUD／結算（12 張）

| 票 | 證據 |
|---|---|
| #14 即時回合分數＋排名 | `apps/client/src/ui/panels/teamLedger.ts` 檔頭仍逐字寫「`rankScore` (#25) ⋯ 那份資料整場只在 `matchSettlement` 這一則 one-shot 事件裡到過客戶端」；`ui/hud/` 無對應元件 |
| #101 rr-20 中場戰報 | `roundReport.ts` 對 `RoundStatDelta` / `roundStats` **0 命中**；`roundSettlement` 全 repo **0 命中**（後半仍缺） |
| #104 選人「鎖定」只有 client | `MatchController.selectChampion` 的閘裡仍**沒有 locked**（22 處 `locked` 全是別的語意：`unlocked` / `lockedManually`）；`Seat.ts` 仍無 `locked` 欄 |
| #107 屬性強化歸零提示 | ⭐ **一半已修**：`atRisk` 已有真消費端（`MerchantShop.tsx:1063`，#211；檔內註解自陳「`atRisk` had NO consumer anywhere in the client before #211」）。⛔ 剩下的「**當下**的提示音／toast」仍未做 |
| #119 冷卻圈等一趟 RTT | `cooldownView.ts` 對 `optimistic` / `predicted` / `performance.now` **全部 0 命中** |
| #146 中央底部 chrome 無幾何守衛 | `hudLayout.ts` 對 `TouchControls` / `ready-button` / `phase-timer` **全部 0 命中** |
| #156 守護塔／治療花血條顏色 | `WorldAnchorLayer.tsx:246` 仍 `teamCss(anchor.teamId)`，全檔 `anchor.color` **0 命中** |
| #157 結算頁沒有守護塔那一列 | `matchStats.ts` 對 `guardiansSlain` / `guardianDamage` **0 命中** |
| #161 賞金完全不可見 | `matchStats.ts` 對 `bountyGold` **0 命中**（`bountyGold` 只活在 `arenaRules.mobWaves.ts` 的殭屍波，不是擊殺賞金） |
| #162 enemy-team 侵入下緣 6px | `hudLayout.ts:287` 仍 `touchHeight: 66`；`versionBadgeBand.test.ts` 仍留著 `GUTTER_INTRUDERS` 與那條「the listed gutter intruder is REAL, is the only one」的登記測試 |
| #183 死亡觀戰全黑 / #184 PRISMATIC 空盤 / #185 敵方魔力負數 | ⚠️ **三張都仍未定位**（票裡自己就寫「未定位」）。它們是 v0.9.11 實打回報，⛔ 沒有任何 commit 宣稱修過 |
| #204 右鍵攻擊回饋 | `castFeedback.ts` 對 `attackTarget` / `紅圈` **0 命中** |

### 4.8 守護塔（5 張）

| 票 | 證據 |
|---|---|
| #153 arena.castle 面孔未決定 | `GuardianSystem.ts` 仍只有 3 張臉 |
| #154 五張臉 arena↔model 對應 | 同上；石頭人/骷髏/巨獸人的 mapping 仍未重排 |
| #155 樹人三件式 | `content/models/prop.guardian.treant.json` 對 `roots` / `crown` **0 命中**（仍只有 `guardian_treant_trunk.glb`） |
| #156 / #157 | 見 4.7 |
| #158 kill-bounty.md 自稱 final spec | `docs/kill-bounty.md` 對 `superseded` / `SUPERSEDED` / `已被取代` **全部 0 命中**；`progression.ts` 仍 `killBounty: 100`（doc §3.1 要 300） |

### 4.9 工具／流程／後台（13 張）

| 票 | 證據 |
|---|---|
| #30 /editor/ 搬進 admin | ⭐ admin 已長出 `ContentPage` / `ContentOverlayPage` / `HeroForgePage` / `VfxForgePage`，⛔ 但 `docker/edge.Dockerfile:108` 仍 `GGD_INCLUDE_EDITOR="0"`，且 `App.tsx:505 / :543` 的 DEV 閘仍在（＝ #167）⇒ 線上仍到不了 |
| #35 模型預算頁沒有 LOD 欄 | `content/assets/model-budget/report.json` 的 `"lod"` **0 命中**；`ModelBudgetPage.tsx` 同樣 0 |
| #54 後台戰鬥系統 override 隱形 | `apps/admin/src/combatEnv.ts` 對 `override` / `蓋掉` **0 命中**；`defaultForKey` 仍是「重設」的來源（＝仍會靜默改平衡） |
| #56 跑測試弄髒版控產物 | ⭐ **此刻就在發生**：`git status` 顯示 `content/assets/model-budget/report.json` 是 **M** |
| #91 contentBus 沒訂 content-overlay | `contentBus.ts:94` 的 `CONTENT_KINDS` 仍是三項，仍不含 `"content-overlay"` |
| #102 security.md 停更 | `docs/todo/security.md` 仍有 **8 筆 `in-progress`**；而 #84 確實仍真的開著 |
| #106 需求狀態動態頁 | ⭐ `gen_status.py --check` **現在是綠的**（286 筆），⛔ 但 `docs/requirements-status.md` 仍 **5,465 行**且仍內嵌 `_requirements-audit-gaps.md` 的複本；admin 導覽列仍無需求狀態頁 |
| #116 S12 CI 守衛 | `eventFanout.test.ts` 對 `S12` **0 命中**（反方向的 client→server 守衛仍在，這一方向仍空） |
| #117 帳本對帳守衛 | `gen_status.py` 對 `_suspicious-verification-list` **0 命中** |
| #121 bot 局伺服器權威的裁定寫進註解 | `RoomConnection.ts` 與 `MatchRoom.ts` 對 `伺服器權威` / `不要重新提案` **各 0 命中** |
| #127 新技能玩家看不到 | `edge.Dockerfile:108` `GGD_INCLUDE_EDITOR="0"` 原封不動 |
| #148 ggd-assets.sh bytes_of 吞錯誤 | `tools/deploy/ggd-assets.sh:80-82` **一字未改**；全檔對 `-readable` / `EACCES` 0 命中 |
| #165 逐隻執行時視覺驗收 | root `package.json` 對 `playwright` / `puppeteer` / `screenshot` **全部 0 命中**；`docs/screenshots/` 仍只有 `267/` |
| #166 手把按鍵對應＋連殺 combo | ⭐ **一半落地**：`config.gamepad@1`「手把手感」10 格已進後台（GH#520，三個住處齊：`content/config/gamepad.json` ＋ Zod ＋ `configForms.ts` 的 `GAMEPAD_SPEC`）。⛔ **但 `SLOT_BY_BUTTON`（A→Q · B→W ⋯）仍是 `GamepadInput.ts` 的編譯期常數**（3 處），連殺 combo 仍只在 `schema/config/feelFx.ts` 有一處 |
| #167 正式 build 折掉 9 個內容頁 | `App.tsx:505 / :543` 兩處 `if (!import.meta.env.DEV) return;` 原封不動；`contentGate.test.ts` 仍用 24 條 `not.toContain` 把它釘死 |
| #207 對戰資料記錄＋覆盤分析頁 | `apps/admin/src/ui/MatchesPage.tsx` 對 `勝率` / `選取率` / `pickRate` **0 命中** |
| #237 worktree 收債 | ⚠️ **數字作廢**：現在 **52 棵 worktree · 11 個 `rescue/*` · 171 個分支**（票裡是 48 / 10 / 9）。**#601** 是它的現代版（「48 個 worktree 閒置三週」）⇒ 建議併過去 |
| #242 線上流暢度六個方向 | ⚠️ **已被拆成量過的分身**：#614（第一回合就 lag，成本在客戶端）· #620（60 條殭屍血條每幀重跑整棵 React）· #561（地面貼圖快取無上限）· #538（名單預載）。這張現在是傘票 |
| #224 角色名單重複太多 | ⚠️ 分母作廢（白名單 53 → **49**）；**#599 / #600** 是變身態那一半的現代票 |

---

## 5 · 可直接執行的關票指令（⛔ 本 lane 未執行）

> 全部是 `--comment` ＋ `close`，理由與證據逐條寫在留言裡（owner：「盡量以註解關閉」）。
> ⚠️ 執行前建議先確認沒有別的 lane 正在動這幾張。

```bash
# ── ✅ 已經做完（6 張）─────────────────────────────────────────────────────
gh issue close 19 --reason completed --comment '✅ 已完成（2026-08-23 唯讀複驗，逐項回查 HEAD）

· 100 隻召喚：`content/config/arena-rules.json` → `mobWaves.boss.killThreshold: 100`
· 帶入英雄 3D model：同節 `championSource: "random"`（王每次借當回合抽到的那位英雄的臉／模型／數值）
· 體型／能力放大：`sizeMult: 5` · `hpMult: 100` · `heroHpMult: 20` · `hpFlatBonus: 100000`
· 會施法：`boss.king.innateAbilityId = "godie-zombieking.passive"`（消費端 `packages/shared/src/sim/mobs.ts:2878` + `systems/MobSystem.ts:774`）
· ⭐ 火圈延後 3 分鐘：`content/config/config.match.json` → `match.fireRing.boss.delayFireRingSec: 180`（另有 `extendCombatSec: 180`）

三個住處齊（第一守則）：`content/config/arena-rules.json` + Zod `packages/shared/src/content/schema/config/arenaRules.mobWaves.ts` + admin `apps/admin/src/mobWaves.ts:274`（欄位 union `:423`）。
⇒ 每一格都是後台可調，⛔ 沒有寫死的數字。'

gh issue close 78 --reason completed --comment '✅ 已完成（2026-08-23 唯讀複驗）

`apps/client/src/audio/spatialPolicy.ts` 兩個 category 都已從 `dispatched: false` 翻成 **`dispatched: true`**：
· `"jump"` → reason 逐字「GH#441 —— 由 ENTITY_FLAG.AIRBORNE 的上升緣說（#247 的 leap 在飛）；它屬於一具身體」
· `"knockdown"` → reason 逐字「GH#441 —— 由 `knockdown` 事件的受害者說（GameApp.dispatchContextualVoice）」

該票要的就是這兩格翻面，而 `spatialPolicy.test.ts` 的 dormant 守衛會掃 GameApp/AudioDirector 原始碼，假宣稱會紅 ⇒ 這不是「宣稱做完」，是有閘在守的做完。
接續工作在 **#441**（英雄語音普查：仍有 11 類無觸發點）。'

gh issue close 206 --reason completed --comment '✅ 已完成（2026-08-23 唯讀複驗，三段逐段對）

一、**傷害比例分紅（可超過總額）** —— `content/config/arena-rules.json:312` 與 `:362` 皆 `"lastHitMode": "bonus"`，正是 owner 的語意當**預設**；`"weight"`（守恆）保留為後台另一個選項。欄位說明 `schema/config/arenaRules.mobWaves.ts:520` 逐字引用「owner 2026-07-29, GH#206」。另有 `splitByDamage: true` / `countOverkill: false`。
二、**獎勵數值** —— 特殊殭屍 `bountyGold 5000` / `bountyXp 200` / `bountyLevels 5`；殭屍王 `bountyGold 30000` / `bountyXp 1200` / `bountyLevels 50`。
三、**從英雄推導 + 隨機選英雄** —— `championSource: "random"`、`heroHpMult` / `heroDamageMult` / `heroLevelSource: "curve"` + `levelCurve`。

三個住處齊：content + Zod `arenaRules.mobWaves.ts` + admin `apps/admin/src/mobWaves.ts`。'

gh issue close 215 --reason completed --comment '✅ 大部分已完成（2026-08-23 唯讀複驗），剩餘調校已由 #617 承接

owner 要的「一個環 + 每次呼叫的 scale / tint / alpha」已經做成**模板家族**（第〇·五守則的形狀）：
· `content/vfx/fx.fam.shockwave-ring.{arcane,earth,fire,holy,ki,lightning,physical}.s{100,150}.json`
· `content/config/vfx-families.json` 對 `shockwave` 有 **94 處**引用，`warstomp` / `thunderclap` 各有對應

⇒ 該票量到的「兩個衝擊波環佔全部特效引用 13.6%」這個 CP 值已經兌現。
剩下的是**觀感調校**，而它已經是一張活票：**#617**（owner「硬加的·太亮太搶眼」+「散開要夠快才有力量感」）。
⚠️ 票裡另外提到的「莉娜龍破斬 / 依文 EX」已各自有票：#543（三支驗收技能的動畫特效）、#566（圓周噴發）、#417（龍破斬 8.25 vs 6.0 兩份文件不一致）。'

gh issue close 230 --reason completed --comment '✅ 已完成（2026-08-23 唯讀複驗）

`mobWaves.special.chancePercent` 已是後台一格，出貨值 **1.25%**，三個住處齊（第一守則）：
1. `content/config/arena-rules.json` → `mobWaves.special.chancePercent: 1.25`
2. Zod `packages/shared/src/content/schema/config/arenaRules.mobWaves.ts:909` → `z.number().min(0).max(100)` —— ⭐ **有上界**（#277 的教訓）
3. admin `apps/admin/src/mobWaves.ts:274`（SHIPPED）+ 欄位 union `:423`

⇒ 「頻率太高」現在是 owner 改一格下拉的事，⛔ 不是一次部署。'

gh issue close 248 --reason completed --comment '✅ 已完成（2026-08-23 唯讀複驗）

`match.fireRing.roundHardCapSec` 已落地，出貨值 **300 秒 = 5 分鐘**（owner 給的預設，⛔ 不是寫死）：
1. `content/config/config.match.json` → `"roundHardCapSec": 300`
2. Zod `packages/shared/src/content/schema/config/match.ts:231` → `z.number().min(20).max(1800).default(300)`（上下界齊）
3. admin `apps/admin/src/matchConfig.ts:365`（欄位）與 `:557`（順序）

另有跨欄位守衛：`match.ts:217` 斷言 `roundHardCapSec >= startSec + shrinkSec`（⇒ 硬上限不會小到讓火圈流程走不完）。
`packages/shared/src/roomSettings.ts:91` 也記著「硬底線 `roundHardCapSec` 本來就會先收掉」。'

# ── ♻️ 已經過期／被取代（2 張）───────────────────────────────────────────
gh issue close 175 --reason "not planned" --comment '♻️ 過期關閉：前提已被 2026-08-18 的逐件稽核推翻（2026-08-23 唯讀複驗）

出貨值確實沒動（`content/champions/` 現存 71 隻**全部**仍 `critDamage: 1.75`），⛔ **但這已經不是缺口，而是被明文批准的基準**：

· `content/items/godie-i06d.json` 的 `authoringNote`（2026-08-18 雙向逐句稽核）逐字寫：
  「⚠️ 那個 0.25 看起來像打錯，它不是⋯出貨的每一張英雄卡 `baseStats.critDamage` 都是 **1.75**⋯
   **⛔ 把它「修好」成 2.0 會變成 3.75 倍**」
· `content/items/godie-i01n.json`（天堂之劍）已整條改寫成 `critStrike`（`sim/combat/critStrike.ts` 的 `CritStrikeGrant`），
  authoringNote 逐字記著它**取代**了舊的 `critChance 0.06 + critDamage 8.25`，並寫下那個寫法的兩個修不掉的缺陷。

⇒ #248 §6「全體 critDamage 歸零 + 四件傳說裝改差值」與**現行出貨設計直接衝突**，照做會壞掉四件裝的卡面算術。
⚠️ 而且平衡公式已定（CLAUDE.md 第一守則：「不要再叫我調整了，公式已定好」），⛔ 這不該是一張技術債票。
要重開請開**新的平衡票**，並帶上 owner 的一句原話。'

gh issue close 243 --reason "not planned" --comment '♻️ 過期關閉：46 這個數字作廢（2026-08-23 重跑同一條普查）

用票裡同一個方法（`effects` + `passive` 遞迴掃 `kind`）在今天的 HEAD 重跑：
· `content/abilities/` 現在 **422 份**（下架的 276 份在 `content/_legacy/abilities/`）
· 真正「按下去什麼都不會發生」的只剩 **1 支**：`godie-hapm.passive`（52-00 十二道試煉）

票裡舉的例子今天都已經有內容（我的粗篩一開始也誤判了它們，逐份打開才看清）：
· `godie-e002.passive` → `passive.ranks[0].block = {damageTypes:["magic"], chance:0.3, fraction:1.0}`
· `godie-e008.passive` → `passive.ranks[0].vision = {trueSightRadius: 9.17}`
· `godie-emns.w` → `passive.ranks[].attributes.int = 7/12/17/22`

⇒ 這張傘票的分母已經不對，留著只會讓下一輪照著錯的數字排工。
⚠️ **剩下那 1 支要另開票**：52-00 十二道試煉正是 CLAUDE.md 第〇·五守則拿來當範例的那支
（「12 層標記 × 免死 × 無敵 1.5 秒 × 回復 50%」），它缺的是**機制**不是內容。
同族的現代票：**#563**（四張上架卡承諾了傷害而 effects 是空陣列）。'

# ── 🔁 重複（1 張）───────────────────────────────────────────────────────
gh issue close 128 --reason "not planned" --comment '🔁 重複，主票是 **#96**（2026-08-23 唯讀複驗）

兩張是同一批工作（體素批次四）、同一個斷點：
`packages/shared/src/content/voxelSkin/paint.ts` 把 barcode 交給 `paintBarcodeBase(s, barcode)` 之後，
下一行的 `paintFaceDecals(s, recipe, p)` **不收 barcode** —— 顏色到這裡就斷了。
今天回查：`paint.ts` 對 `faceColors` 仍 **0 命中**（兩張都還開著，但只需要一張）。

⭐ 這張多出來的那個發現要保留，已搬進 #96：
**「沒有鼻子筆刷可以接」** —— `paint.ts` 的 `nose` 只有一句註解（`:213`），
`r.face` 的 switch 只有 eye / mouth / mark 三段。
⇒ `faceColors.nose` 不是「沒接線」，是**接點本身不存在**，做批四時要先加筆刷。'
```

---

## 6 · 給主 session 的三個建議（⛔ 不是我的裁決）

1. **#173 應該往前排。** 它是這一輪唯一一張「**風險變高了**」的票：`content/ability-templates/` 已經有真的模板，
   而 `loader.ts` 的引用檢查仍早於展開。⇒ 一支採用 template 的技能今天就能把壞掉的 `projectileId` 送上線。
2. **#237 併進 #601、#242 併進 #614/#620/#561/#538、#224 併進 #599/#600。**
   三張的**數字全部作廢**（worktree 48→52、白名單 53→49），而現代票是量過的。
   ⛔ 我沒有自己關它們 —— 併票是排序，而排序是 owner 的（第零守則⑧）。
3. **兩張「一半已修」的票值得單獨處置**（owner：「有必要的話開新票為主」）：
   · **#107** —— `atRisk` 死程式碼那一半已由 #211 修好，剩「當下的提示音／toast」（體驗層小項）
   · **#166** —— 手把「手感」10 格已進後台（GH#520），剩「按鍵對應 `SLOT_BY_BUTTON`」與「連殺 combo」

---

## 7 · 本輪的方法與限制

· **唯讀**：本 lane 未執行任何 `gh` 寫入、未修改任何程式或內容檔，只寫這一份報告。
· **判準**：「做完了」必須拿得出**檔:行 / commit / 量到的數字**。⛔ 「看起來應該做完了」一律判成仍然有效。
  這一輪真的攔到兩次：**#94**（`voxelSkinTexture` 已經收 barcode 了，但唯一呼叫端沒傳）
  與 **#143**（`mobs.ts` 真的出現了 `world.stats.set`，但那是**殭屍王專用**的一格）——
  兩者只看 grep 命中都會誤判成已完成。
· **限制**：#183 / #184 / #185 三張是 v0.9.11 的實打回報且票裡自陳「未定位」，
  我只能證明**沒有人宣稱修過**，⛔ 不能證明它今天還會重現。
