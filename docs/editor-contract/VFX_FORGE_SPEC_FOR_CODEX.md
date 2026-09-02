# 特效工坊（VFX Forge）· 技術規格 —— 給 Codex

狀態：**Revision 10 — 2026-09-02 14:00 CST，以 `origin/main@29f8628f`（含 v0.35.15）與 `feat/vfx-forge-codex` 程式／隔離測試重驗**

> 本文保留 2026-08-31 的出發點，但「缺口」必須以各節的目前狀態為準；不可把舊基線當成今天的待辦。

> ⭐ owner 2026-08-31 逐字：
> 「[三招驗收] **給 codex 編輯器做**，你到時候參考就好，
>  但你要**寫好技術規格包含驗收圖跟契約 md** 給 codex 可以參考」
>
> ⇒ ⭐ 這一份是**規格**，⛔ 不是願景。每一個「已有」都指得到檔案，
> 每一個「缺」都指得到一行。

---

## 0. ⭐ owner 的原話（⛔ 這是需求，其餘都是我的推導）

> 「特效工坊 => 各種特效標籤、model/粒子資源、表示形選項及參數來微調逼近真實，
>  **儲存成 JSON** 來完成校正，並用容易操作的 UI 如 **slider**、各種**拖曳所見即所得**⋯
>  我要可以**拖拉 model、粒子特效進編輯器模擬遊戲畫面**，
>  用 slider 調**大小、透明度、顏色、轉向、高度、動畫速度**等各種連續參數，
>  盡量**人類友善視覺直覺**的操作方式來設定及模擬觀看全程」（2026-08-28）

> 「特效工坊 · 演出腳本 應該也是**後台其中一頁**對吧 也是一樣的機制，
>  編輯儲存完後可以**回存到主線甚至間接到 github**」（2026-08-28）

### ⭐ 驗收（owner 後續擴充為八招）

| 編號 | 技能 |
|---|---|
| **04-03** | 龍破斬 |
| **04-04** | 神滅斬 |
| **01-04** | 超究武神霸斬 |
| **08-04** | 阿邦快速劍X |
| **08-03** | 龍鬥氣砲咒文 |
| **09-04** | 龜派氣功 |
| **20-002** | 理想鄉EX |
| **48-04** | 騎英之手綱 |

⚠️ 這八招是 **Editor 表達能力 fixture**，不是要直接覆蓋遊戲 Main 的八份成品，也永久不可 Promote。
每招必須從空白畫布實際操作重建，用 Owner 最新目標、目前 Main 與 JASS／w3x 蝗蟲群三方對照；能 1:1
翻譯的逐動詞翻譯，為可讀性做的改編或 Main 尚缺的積木都要明寫，不能把近似冒充原作。任何 AI 候選仍須進
後台人工批核；Editor fixture 只能 pass／fail 驗收工坊能力，不能套入正式內容。

---

## 1. ⭐⭐ main 已經做好的（⛔ **不要重做**）

⚠️ 這一節是這份規格最重要的部分。2026-08-31 逐項量到：

| 層 | 狀態 | 住處 |
|---|---|---|
| **存檔格式** `vfx-script@1` | ⭐ **已出貨** | `packages/shared/src/content/schema/vfxScript.ts:239` |
| **播放器** `VfxScriptPlayer` | ⭐ **已出貨** | `apps/client/src/vfx/VfxScriptPlayer.ts` |
| **接線點** | ⭐ **已接** | `apps/client/src/vfx/VfxSystem.ts` 的 `abilityCast` case |
| **出貨腳本** | ⭐ **10 份** | `content/vfx-scripts/` |
| **守衛** | ⭐ 在 | `vfxScriptShippedChain.test.ts` · `animPulseSegment.test.ts` |
| **後台骨架** | ⭐ 1,508 + 662 行 | `apps/admin/src/vfxForge.ts` · `vfxLayers.ts` |

### ⭐ 今天已經有腳本的 10 支技能

`godie-e002.ex` · `godie-e00l.ex` · `godie-h020.e` · **`godie-hart.r`（超究武神霸斬）** ·
`godie-hjai.e` · `godie-n01c.r` · `godie-nbbc.r` · `godie-o00x.r` · `godie-ogrh.r` · `godie-udea.r`

⇒ ⭐ **超究武神霸斬已經有一份可讀的範本** —— 照它的形狀做，⛔ 不要另外發明。

### ⭐ `vfx-script@1` 目前支援的（2026-09-02 實讀 schema）

| 軸 | 值 |
|---|---|
| **觸發器** `on` | `castStart` · `castEffect` · `strike`（帶 `strikeIndex`）· `projectileSpawn` · `projectileHit` · `reflectSuccess` |
| **表示形** `kind` | `modelFx` · `vfx` · `screenFlash` · `screenShake` · `floatingText` · `sound` · `anim` · `hideBody` · `bodyMove` |

---

## 2. Editor 工作面的目前狀態

### 2.1 ⭐ 編輯器本體（owner 原話裡的每一個詞）

| owner 的詞 | 要什麼 | 目前 feature branch |
|---|---|---|
| 「**拖拉 model、粒子特效進編輯器**」 | 資源池 → 拖進畫布／時間軸 | ✅ `VfxAssetPalette`＋安全收據；未驗證或不安全素材不可拖入；首次雙擊走同一條去背 gate，安全才加入，並顯示通過／檢查中／禁止／待驗證統計 |
| 「**模擬遊戲畫面**」 | 真 `CameraRig`＋真地板＋雙方角色＋frame-step | ✅ `VfxForgeStage`／`VfxForgePreview`；可切完整 runtime 或只看 script |
| 「**slider** 調大小/透明度/顏色/轉向/高度/動畫速度」 | schema 驅動連續參數表單 | ✅ `SegmentInspector`＋共用 `FormRenderer`；上下界來自共用 schema，不抄常數 |
| 「**所見即所得**」 | 改一格 → 同一份 draft 即時重播 | ✅ draft、預覽、時間軸與送審 hash 共用同一 JSON |
| 「**觀看全程**」 | 播放、scrub、1/60 frame-step、精確秒數 | ✅ 並可對每張送審關鍵格重跑 framebuffer 稽核 |
| 「**回存到主線甚至 github**」 | AI 候選 → 後台人工批核 → Promote | ✅ Forge 只能投 proposal；不直接寫 ability，也不讓 fixture Promote |

上述六項是 Editor 已完成的 UI／接縫，不應再交給 Main 重做。Main 只提供 schema、播放器、權威事件、
可重用 VFX／actor 積木與安全限制；Editor 用它們拼成品。

### 2.2 2026-08-31 的四個機制缺口已如何落地

| # | 目前狀態 | 住處／誠實邊界 |
|---|---|---|
| **M1 逐刀瞬移** | ✅ `bodyMove`＋`strikeIndex` | 純演出位移，不改 sim 判定框／碰撞 |
| **M3 升空曲線** | ✅ `bodyMove.mode:"arc"` 與 `modelFx.heightKeys` | 視覺曲線；權威位移仍留 ability JSON |
| **M4 定格／逐段速度** | 🟡 `anim.clipWindowMs`＋逐段 segment 可表達 | pulse 仍只有 `attack/cast/hurt`，強制 death clip 不是 1:1，必須明寫偏離 |
| **反彈成功** | ✅ 正式名稱是 `reflectSuccess` | 由帶 ability provenance 的真反彈事件觸發；不能用計時器猜 |

目前真正會阻塞 Editor 的 Main 接縫已集中在
[`MAIN_EDITOR_HANDSHAKE_REQUEST_20260902.md`](MAIN_EDITOR_HANDSHAKE_REQUEST_20260902.md)：有效 yaw resolver、
單發 `single-arc`、迴避來源 provenance、actor-aware 預設演出 resolver、`combo-finisher` capability 漏報，
以及仍會讓素材安全閘阻擋的實際 framebuffer 問題。不要在本節重新維護第二份票單。

Main `daf9e2bb`／`29f8628f` 新增共用替身英雄棘輪，並把先前誤報的 4 位更正為實際 resolver 判定的
18 位；Editor 的視覺證據仍逐位讀 `resolved-appearance@1.isStandIn` fail closed，不把這個數量抄成常數。
這兩個 commit 只補外觀證據與修復順序，沒有新增 VFX／actor 積木；本節六個阻塞經 13:22 的關鍵指令重跑
仍未改變。

### 2.3 表示形的單一住處

舊表把 `beam`、`ribbon`、ground decal 與 billboard 都當成新的 script `kind`，現在已證明那會複製第二套
詞彙。Script 只負責「何時／掛哪」：橫向 beam 由 `model@1.fxLongAxis` 與 `modelFx` 參數表示；粒子／stretched
billboard／`ribbon@1` 都由 `vfx` 集合文件表示；地面痕跡走引擎既有 decal 家族。Editor 資源池與表單讀這些
共用文件，不再自行發明 `beam` 或 `billboard` segment kind。

若 JASS 語意仍無任何正式積木能表達，才依下列規則開 Main 票；不得在 Editor 複製 renderer。

⭐ **判準（owner 的方法論，逐字）**：

> 「你應該做的事情是 **翻譯 JASS to 編輯器 JSON**，
>  如果 **JSON 沒支援的標籤或邏輯則去實作**才對阿」

⇒ ⛔ **禁止「用現有參數湊一個看起來像的」**。翻不過去 ⇒ 開票要 main 實作那個標籤。

---

## 3. ⭐ 檔案格式（照這一份寫，⛔ 不要另外發明）

```jsonc
{
  "id": "godie-hart.r",
  "schema": "vfx-script@1",
  "abilityId": "godie-hart.r",
  "notes": "⭐ 出處：JASS A077 · war3map.j 33759–33944。⛔ 每一段都要指得到行號",
  "segments": [
    { "on": "castStart", "atMs": 0, "kind": "modelFx",
      "modelKey": "...", "at": "self",
      "scaleAxis": [1,1,1], "tint": [255,255,255], "alpha": 1, "clipTimeScale": 1 },
    { "on": "strike", "index": 3, "kind": "vfx", "vfxId": "...", "at": "target" }
  ]
}
```

### ⛔⛔ 三條硬規則

| # | 規則 | 為什麼 |
|---:|---|---|
| **①** | ⛔ **編輯器不可以寫 `content/abilities/*.json`** | ⭐ 那些是 `skillremake:json` 的**產物**，genguard 會擋，下一次 sync 打回來 |
| **②** | ⭐ **行為的真相仍在 ability JSON** —— script 只管「**畫什麼 · 掛哪 · 何時**」 | 第〇·四守則：傷害/次數/時序**不可以有第二個住處** |
| **③** | ⭐ 有 script 的技能**取代**預設綁定，⛔ **不疊加** | ⚠️ 真的踩過：`godie-hart.r` 曾經 sim 送一發、腳本再播一發 ⇒ **每一刀生兩發**，錨點還不一樣（胸口 vs 腳下） |

### 3.0 人工批核材料也屬於候選契約（2026-09-02）

VFX Forge 每次新送審都必須附 `ggd-vfx-visual-audit@3`：完整 runtime
時間軸的採樣格數、最差時間點、粒子／系統峰值、亮區與白底比例、紅／紫／藍
診斷棋盤比例及疑似來源；送審的每一張關鍵格還必須附同一瞬間的 `frameAudit`。
時間軸抽樣可能跨過只存在一格的壞貼圖，因此逐張精確讀回是獨立硬閘，不能用
15 Hz 掃描的安全收據代替。
後台裁決與 Promote 同時比對兩個 hash：

- `candidateHash`：候選 JSON。
- `reviewHash`：候選 JSON hash、Base hash、用途、摘要、文字證據、實際擷圖、
  自動分數與 GPU 稽核收據。

只換擷圖、稽核結果或說明也會令舊裁決失效，必須重新人工檢視。`@1`、`@2`
以及缺少任一逐張 `frameAudit` 的 `@3` 只可保留作失敗證據：後台允許
fail／reject，但禁止 pass／approve／Promote。不得替舊核准補欄位或偽造
稽核升級；素材修正後必須由 Forge 重新播放、精確擷取與送審。

### 3.1 角色動作與斬擊模板原則（2026-09-02）

1. 任何主動技能都要有施法者綁在 `castStart`／`castEffect` 的 `anim`；後續 `strike`、反彈或目標受擊動作不能冒充施展動作，也不能用粒子代替角色起手。
2. 時間軸技能在每個 `strike`、`bodyMove` 起點與終結間隔都要有覆蓋該時間窗的角色動作；權威 `strike` 同時要求施法者攻擊與目標受擊反應。一段動作結束後仍在播特效，視為缺件。
3. 普通近戰的一個傷害節點＝一個角色攻擊動作＋一個主斬弧。不得用多個月牙堆出「看似有動畫」的扇形。
4. 只有 ability JSON 的權威 `comboStrikes` 證明它是極速連斬（例如九頭龍閃、三千世界）才能例外；VFX 自己排出三個月牙、技能名稱或備註都不能替自己取得豁免。例外內仍要求至少三個、小型、分時出現的單弧，而不是同幀重疊。
5. `fx.prim.*.slash*` 現有每份都是 `burstCount:26`，一個 segment 本身就會噴 26 個月牙；Editor 對普通斬擊一律阻擋。Main 需提供可調色／大小／方向、一次只畫一弧的 `single-arc` 積木，Editor 才能按第 3、4 點組合。

對應的可執行守衛與自動補動作住在
`apps/editor/src/vfx-forge/actionAnimationPrinciples.ts`；recipe API 強制要求呼叫端傳入 runtime 的 active/passive mode，
守衛也會直接消費真 SimWorld 排程的 `strike`／`projectileHit` cue；即使作者沒有在該傷害點放任何可見 VFX，
仍然要求對應的攻擊者／受擊者動作。真 trace 尚未完成、IntentFrame 被拒、試放失敗或 reactive provenance
無法被 Main runtime 消費時，擷取與送審一律 fail closed；切換技能時也會立即清除上一招的 trace，不能沿用舊收據。
八招目前來源 fixture 全數通過同一條守衛，沒有技能專用豁免。舊送審物則揭露兩個不可回填的歷史缺陷：
`godie-e002.ex` 的 `@1` 第七刀後段缺目標反應，`godie-hart.r` 只有逐刀攻擊而沒有真正的
`castStart`／`castEffect` 施展動作。兩份 JSON／擷圖都保留為失敗證據，禁止把舊擷圖配上補動作後的新 JSON。
Main 共用積木到位後必須從 Forge 重新播放、擷取並產生新的完整 `@3` 收據。

### 3.2 被動技能演出模板原則（2026-09-02）

被動技能不補假的 `castStart`／`castEffect`。Editor 先讀 ability JSON 的真正觸發來源，再把演出放回同一條權威事件：

1. `onBasicAttack`／on-hit：普攻本身已提供攻擊動作；額外命中光、音效、浮字放在同一個 `hook.effects`，不能另造一發施法。
2. 暴擊：普攻本身提供攻擊動作，runtime 既有 crit hitstop、重擊火花與暴擊數字是預設演出；來源專屬 VFX 直接放在 `onDamageDealt` hook，使用 `damageCrit:"crit"`＋`critSource:"thisSource"` 綁回真正觸發的 grant，不另擲一次機率，也不需要 Main 新欄位。
3. 格擋：使用 `block.vfxId/vfxScale/vfxTint`，掛在防禦者並取代泛用格擋火花；不與泛用效果疊兩次。
4. 反彈：使用權威 `onReflectSuccess` hook 或 `vfx-script reflectSuccess`；Editor 對 vfx-script 的真正反彈節點自動補防禦動作，可再組接觸火花及反擊時間軸，但不得改寫成假的 cast 觸發。
5. 迴避：runtime 已有 `evade` 結果與 MISS 提示；在事件仍無來源 grant provenance 前，Editor 不得把某支被動的專屬閃身／殘影綁上去冒充正確歸屬。
6. 週期、受傷、低血、護盾等：只有玩家需要辨識那次觸發時才補短演出，且必須位於對應的 `onInterval`／`onDamageTaken` 效果鏈；不要求每個純數值被動持續噴粒子。

槽位不能單獨代替啟用方式：Main 目前有 34 份 `slot:"PASSIVE"`、但明確為
`innateKind:"active"` 的可施放天生技。Editor 逐字鏡像 Main cast ladder：PASSIVE slot 只有
`innateKind:"active"` 能施放；Q/W/E/R/EX 則以 `passive` rank block 與實際 active effects 判斷，
有被動區塊且 effects 為空才是純被動。純被動禁止 `castStart/castEffect`，混合技能則同時顯示
主動動作守衛與被動事件演出計畫。`innateKind` 依 schema 不得出現在其他槽位，遇到畸形輸入也不得
讓這個 stray field 改寫 castability。

Editor 另以精確首行 `[主動]`／`[被動]` 做唯讀衝突守衛：它不以文案改寫 runtime，也不猜
`[主動攻擊]`、`[輔助]` 等舊標籤；只有說明明確宣告與 Main cast ladder 相反時，允許真 runtime 預覽但禁止
送審，等待能力機制或標籤在來源端對齊。目前 Main 有 27 份此類明確衝突，包含 `godie-o030.ex`；Editor
不會默默把它們當成另一種技能，也不會修改 Owner 原文。

機器判斷住在 `apps/editor/src/passivePresentationPrinciples.ts`，鑄技工坊與 VFX Forge 都顯示同一份自動演出計畫。`authored`、runtime 預設、可用現有積木補完、缺 Main 事件歸屬四種狀態分開呈現，不由 LLM 猜測。

---

## 4. ⭐ 驗收圖 —— 素材已經在 repo 裡

### 4.1 原作參考擷圖（⛔ 不要自己找）

```
docs/_reference/w3x-shots/{saber,eva01,evangeline,lina}/
```

⭐ 例：`saber/WC3ScrnShot_082226_142132_27.jpg` 起連續 5 張。

### 4.2 GGD 側的連續擷圖（⭐ 天譴那一套，已有五份前例）

```
docs/_reports/beamshape_visual-proof_20260827-0600/
    2003_f00_precast.png · f01_t31 · f02_t34 · f03_t38 · f04_t43 · f05_t50
docs/_reports/audition-ruler-selfcert_visual-proof_20260829-2153/
```

### 4.3 ⛔⛔ **量尺必須先自證**（⭐ 這一條踩過三次）

| 陷阱 | 症狀 |
|---|---|
| canvas 背後緩衝 300×150 | 量到的不是畫面 |
| `readPixels` 讀到上一幀 | 結論相反 |
| ⭐ `engine.readPixels()` 在**滿版亮幀回 0**（GH#768） | ⛔ 而結論照樣被採用 |

⇒ ⭐ **`calibrate()` 要驗兩個方向**：已知**亮**的 control 量得到 **且** 已知**暗**的量不到。
⛔ 單邊校準的尺會在它最需要說話的時候沉默。

### 4.4 ⭐ 驗收物的形狀

一份 `docs/_reports/<主題>_visual-proof_<時間戳>/`，內含：
① 關鍵格／連續影格 PNG ② 一份 `.md` 逐格對 Owner、Main、JASS／w3x 時間軸 ③ `calibrate()` 的兩方向紀錄
④ 每張圖的 `ggd-vfx-visual-audit@3.frameAudit` ⑤ 完整時間軸掃描與候選／Base hash。八招還必須留下「從空白
重建」操作證據，且用途固定為 `editor-capability-fixture`。

---

## 5. ⭐ 契約（⛔ 這是唯一的真相來源）

| 檔 | 回答什麼 |
|---|---|
| `docs/editor-contract/ggd-editor-coverage.json` | 目前 **4,943 格 required**；由產生器輸出，不能手改 |
| `docs/editor-contract/ggd-runtime-capabilities.json` | 目前 47 effect kinds · 33 hooks · 261 effect fields · 420 nested paths |
| `docs/技能標記機制與效果規則.md` | 「**它怎麼用**」—— 參數與上下界 |
| `docs/editor-contract/README_CODEX_開工清單.md` | ⭐ **索引 ＋ 14 個坑** |

⭐ 2026-09-02 12:06 CST 的收據：`fingerprint = 71b5be5a4f57`、
`capabilityFingerprint = 111434fa`。兩者答不同的問題，也都是易變收據；每次開工先跑產生器的 `--check`，
不能把這兩串編進 Editor 常數。現有雙向測試另抓到 Main 漏報 `templateFamily/combo-finisher`；修正前即使
`caps:check` 綠燈也不能宣稱契約完整。

---

## 6. ⭐ rollback（owner 常設指令：自己判斷但**留開關**）

`vfx-scripts.enabled`（三個住處，預設 **on**）——
⭐ 關掉 ⇒ 有 script 的技能退回預設綁定，**逐位元同今天**。

⛔ **一批成果要登記進驗收頁，必須寫得出自己的 rollback 開關**（config id ＋ 欄位名）。
寫不出來 ＝ 違反常設指令 ＝ 不准登記。

---

## 7. ⭐ 建議的做法順序

| 步 | 做什麼 | 誰 |
|---:|---|---|
| **1** | 讀當前 Main 的能力／素材／限制 receipts；過期或不完整就 fail closed | Codex |
| **2** | 玩家／AI 從空白用資源、recipe、slider 與時間軸組合 `vfx-script@1` | Codex Editor |
| **3** | 真 CameraRig＋runtime replay＋精確 keyframe／完整時間軸視覺守衛 | Codex Editor |
| **4** | 撞到表達不了的 ⇒ 只開可重用積木／事件票，不用近似冒充 | Codex → Main |
| **5** | Main 出積木與機器契約；Editor 讀新 receipt 後解鎖對應控制 | Main → Codex |
| **6** | 八招從空白驗收工坊能力；AI 候選進後台逐張人工批核 | Owner／Reviewer |
| **7** | 正式玩家成品另走 production-candidate＋Approve＋Promote；fixture 永久禁止 Promote | Admin／Main |

目前 Editor 程式面已完成步 1–4 的通用流程；八招仍因 Main 的共用積木／素材安全問題保持隔離與拒絕通過，
不能把「UI 已完成」誤寫成「八招視覺品質已驗收」。
