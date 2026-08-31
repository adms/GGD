# 特效工坊（VFX Forge）· 技術規格 —— 給 Codex

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

### ⭐ 驗收（owner 指名的三招）

| 編號 | 技能 |
|---|---|
| **01-04** | 超究武神霸斬 |
| **04-03** | 龍破斬 |
| **20-002** | 理想鄉EX |

⚠️ ⭐ 驗收**不是**「編輯器存在」——是**用它**把三招的全動畫特效做到可上線，
全程 **JASS 一比一**（⛔ 不亂猜 —— 逐動詞翻譯）。

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

### ⭐ schema 今天支援的

| 軸 | 值 |
|---|---|
| **觸發器** `on` | `castStart` · `strike`（帶 `index`）· `projectileHit` |
| **表示形** `kind` | `modelFx` · `vfx` · `screenFlash` · `screenShake` · `floatingText` · `sound` |

---

## 2. ⛔ 缺的（⭐ 這才是 Codex 的工作面）

### 2.1 ⭐ 編輯器本體（owner 原話裡的每一個詞）

| owner 的詞 | 要什麼 | main 今天 |
|---|---|---|
| 「**拖拉 model、粒子特效進編輯器**」 | 資源池 → 拖進畫布 | ⛔ 無 |
| 「**模擬遊戲畫面**」 | ⭐ **真 CameraRig ＋ 真地板 ＋ frame-step** | ⛔ 無 |
| 「**slider** 調大小/透明度/顏色/轉向/高度/動畫速度」 | 連續參數表單 | ⛔ 無（`vfxForge.ts` 是資料層，⛔ 不是 UI） |
| 「**所見即所得**」 | 改一格 → 畫面即時重播 | ⛔ 無 |
| 「**觀看全程**」 | 時間軸播放器（含 scrub） | ⛔ 無 |
| 「**回存到主線甚至 github**」 | 寫回 middleware → PR | ⛔ 無 |

### 2.2 ⛔ 機制缺口（票 §MISSING 自己列的，⭐ 這些要 main 做）

| # | 缺什麼 | 擋住哪一招 |
|---|---|---|
| **M1** | 逐刀瞬移 | 超究武神霸斬 |
| **M3** | 升空曲線 | 同上（今天用「取半高」近似，⛔ 那是偏離） |
| **M4** | 受害者定格 ＋ ⭐ **逐段加速**（`SetUnitTimeScalePercent(SupI×100)`，段數越後越快） | 同上 —— ⛔ `clipWindowMs` 是固定值，表達不了 |
| **M-防禦** | `defenseSuccess` 觸發器（反彈/格擋成功） | ⭐ **理想鄉EX**（它由反彈成功觸發） |

⚠️ ⭐ **`defenseSuccess` 今天不在 schema 的 `on` 列舉裡** ⇒ 理想鄉EX **寫不出來**。
⇒ ⭐ 這一條是 main 的前置，⛔ Codex 做不了。**要它就開一張票**，main 一天內給。

### 2.3 ⛔ 表示形缺口

票列的完整表示形清單 vs schema 今天有的：

| 有 | ⛔ 缺 |
|---|---|
| modelFx · vfx · screenFlash · screenShake · floatingText · sound | **beam**（`fxLongAxis`）· **ribbon/trail** · **ground ring/decal** · **billboard** |

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
① 連續影格 PNG ② 一份 `.md` 逐格對 JASS 時間軸 ③ `calibrate()` 的兩方向紀錄。

---

## 5. ⭐ 契約（⛔ 這是唯一的真相來源）

| 檔 | 回答什麼 |
|---|---|
| `docs/editor-contract/ggd-editor-coverage.json` | ⭐ **546 格必畫**（含 `vfxField` 45 · `modelField` 30 · `projectileField` 12 · `skinField` 9） |
| `docs/editor-contract/ggd-runtime-capabilities.json` | 46 effect kinds · 33 hooks · 260 effect fields |
| `docs/技能標記機制與效果規則.md` | 「**它怎麼用**」—— 參數與上下界 |
| `docs/editor-contract/README_CODEX_開工清單.md` | ⭐ **索引 ＋ 14 個坑** |

⭐ 今天的指紋：`fingerprint = 60ddb509bf66`（⛔ 與 `capabilityFingerprint` 不同，兩者答不同的問題）。

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
| **1** | ⭐ 讀 `content/vfx-scripts/godie-hart.r.json` —— **超究武神霸斬已經有範本** | Codex |
| **2** | 編輯器讀寫 `vfx-script@1`（⛔ 不碰 ability JSON） | Codex |
| **3** | 真 CameraRig ＋ frame-step 預覽 ＋ slider 表單 | Codex |
| **4** | ⭐ 撞到表達不了的 ⇒ **開票**（⛔ 不要近似） | Codex → main |
| **5** | `defenseSuccess` 觸發器 ＋ M1/M3/M4 機制 | ⭐ **main** |
| **6** | 三招逐格對 JASS ＋ 連續擷圖 | owner 操作 |

⚠️ ⭐ **步 5 是 main 的前置** —— ⛔ 理想鄉EX 在它落地之前寫不出來。
