# Codex 編輯器 · 開工文件清單（2026-08-31）

> ⛔ **與根目錄 `AGENTS.md` 衝突時以 `AGENTS.md` 為準**（GH#988）—— 這一份是背景與細節，⛔ 不是規則的來源。

> ⭐ 這一份是**索引**：哪些檔要讀、讀哪一段、⛔ 哪些**不可以改**、以及每一份的陷阱。
> ⚠️ 每個數字都是 2026-08-31 **量出來的**，⛔ 不是憑印象寫的。

---

## 0. ⭐ 三十秒版：先讀這四份

| 順 | 檔 | 行數 | 回答什麼 |
|---:|---|---:|---|
| **1** | `CODEX_COORDINATION_20260831.md` | 155 | ⭐ **誰擁有什麼 · 接縫在哪 · 12 個坑** |
| **2** | `CODEX_CATCHUP_20260830.md` | 398 | ⭐ **現在差多少**（逐項列名） |
| **3** | `ggd-runtime-capabilities.json` | 1,294 | ⭐ **機器可讀的真相來源**（名詞層） |
| **4** | `ggd-editor-coverage.json` | — | ⭐ **驗收清單**（**546** 格必畫，⭐ 含視覺特效面） |

⭐ **開工前跑這三行**：

```bash
git fetch origin && git log --oneline origin/main -5
pnpm caps:check && npx vitest run packages/shared/src/ops/editorCoverageFresh.test.ts
python3 -c "import json;print(json.load(open('docs/editor-contract/ggd-editor-coverage.json'))['fingerprint'])"
```

⭐ 今天的指紋：

| 欄位 | 值 | 回答什麼 |
|---|---|---|
| `fingerprint` | **`60ddb509bf66`** | ⭐ 「**編輯器要做的事**變了嗎」（從 `required`+`notRequired` 的內容算） |
| `capabilityFingerprint` | `f3f4185c` | 「**引擎有哪些名詞**變了嗎」 |

⚠️ ⭐ **兩者刻意分開** —— 2026-08-31 量到:補上視覺特效面之後 `required` 從 **450 → 546**，
⛔ 而舊的 `fingerprint`（抄 capability manifest 的）**一格都沒動**
⇒ ⭐ 那是一條**永遠不會紅的閘**（失敗形態⑨），⛔ 而它當時是寫在對外合約裡的驗收方式。
⇒ ⭐ 現在 `fingerprint` 從清單**內容**算，清單一變它就變（突變驗過）。

---

## 1. ⭐ 契約（機器可讀 —— **這是真相來源**）

### `ggd-runtime-capabilities.json` — 「**這個名字存不存在**」

| 區 | 量到的 |
|---|---:|
| `effectKinds` | **46** |
| `hookEvents` | **33** |
| `conditionLeafKinds` | **5** |
| `conditionLeafFields` | **13** |
| `hookFields` | **21** |
| `effectFields` | **260** |

⛔ **產物** —— `pnpm caps:export` 產生（genguard **會擋你**）。
⚠️ 同名的 `.md`（411 行）是**同一份資料的人讀版**，⭐ 機器要讀 `.json`。

⭐ **它兩個方向都關**（`editorCapabilities.test.ts`）：
宣告 unsupported 而引擎其實有 → 紅（你白白繞路）；
宣告 supported 而其實沒有 → 紅（你做出上線就是死的內容）。

### `ggd-editor-coverage.json` — 「**編輯器要蓋到哪些欄位**」

`required` **546** 筆 · `notRequired` **15** 筆 · `fingerprint` **`60ddb509bf66`**

⚠️⚠️ ⭐ **`notRequired` ⛔ 不是「不要求實作」** —— owner 2026-08-31 逐字更正：

> 「另有 15 項明確不要求實作⋯ **=> 之後會實作**」

⇒ ⭐ 它的意思是「**今天的引擎做不到，所以這一版先不要做**（做出來的內容上線就是死的）」，
⭐ 而它們是 **main 的待辦** —— ⛔ 不是永久的範圍外。
⭐ 機制做出來的那一天，該筆會**自動離開這張清單**（清單從註冊表推導）。

⭐ 今天在裡面的（節錄）：傷害轉移 · 儲存／釋放傷害 · 位置交換 · 回溯狀態 ·
動態建立地形／傳送門 · 道具進化／犧牲 · 普攻衝刺 · 通用控制限制模型。

⇒ ⭐ **Codex 現在不做它們，⛔ 但也不要把它們設計掉** —— 之後會回來。

| group | 格數 | 是什麼 |
|---|---:|---|
| `effectKind` | 46 | — |
| `effectField` | 260 | — |
| `hookEvent` | 33 | — |
| `hookField` | 21 | — |
| `abilityField` | 38 | — |
| `auraField` | 8 | — |
| `templateFamily` | 26 | — |
| `conditionLeaf` | 5 | — |
| `conditionLeafField` | 13 | — |
| `vfxField` | 45 | — |
| `modelField` | 30 | — |
| `projectileField` | 12 | — |
| `skinField` | 9 | — |

⚠️⚠️ ⭐ **陷阱**：`bash scripts/genguard.sh` 對它回「**沒有產生器擁有者**」——
⛔ **而它是產物**（`tools/editor-contract/gen_editor_coverage.ts`）。
⇒ ⭐ 手改它 ⇒ `editorCoverageFresh.test.ts` 紅。
⭐ **判準**：genguard 說「不擋你」**不代表**沒有上游 —— 再 `grep -rl "<basename>" tools/` 問一次。

---

## 1.5 ⭐⭐ 視覺特效面（owner 2026-08-31 點出的缺口）

> owner 逐字：「技能機制契約大致追平，但**視覺特效編輯器**還沒有追平 GGD main，
>  你應該還缺少視覺特效部分」

⭐ **他是對的，而且缺口是結構性的**（2026-08-31 量到）：

| | 量到的 |
|---|---|
| 補之前 `required` 450 格裡與視覺沾邊的 | ⛔ **18 格** |
| 46 個 effect kind 裡視覺類 | ⛔ **4 個**（`spawnVfx` · `spawnModelFx` · `screenFlash` · `screenShake`） |
| ⇒ 契約只涵蓋 | ⭐ 「**技能怎麼呼叫特效**」，⛔ **完全沒有「特效本身長什麼樣」** |

### ⭐ 現在補進去的（**從 Zod schema 推導**，⛔ 不是手寫清單）

| group | 格數 | 對應 collection | main 出貨份數 |
|---|---:|---|---:|
| `vfxField` | **45** | `vfx@1` | **649 份** |
| `modelField` | **30** | `model@1` | **149 份** |
| `projectileField` | **12** | `projectile@1` | 21 份 |
| `skinField` | **9** | `skin@1` | 5 份 |

⭐ **含變體**：`emitter` 是 4 變體的 discriminatedUnion ⇒
`emitter.shape=cone.angleDeg` · `=ring.fill` · `=ring.spread` · `=sphere.radius` … 都在清單裡。

⚠️ ⭐ **第一版漏了它們** —— `variants` 是 `{tag, fields}` ⛔ 不是 UINode，
走錯型別 ⇒ emitter 只留下自己的名字一格。⇒ 讀清單時看到 `=` 就是**變體條件欄位**。

### ⛔ 這一節**不涵蓋**什麼（⭐ 誠實的界線）

| 東西 | 為什麼不在 `required` 裡 |
|---|---|
| `content/config/vfx-families.json`（242 列） | ⭐ **產物**（`pitch:build`）—— ⛔ 沒有人手寫它 |
| `content/config/vfx-ability-art.json`（357 列） | ⭐ **證據檔**，由 w3x 普查產生 |
| `content/config/ability-vfx-bindings.json`（156 列） | ⭐ **產物**（`vfxbind:build`） |
| `content/vfx-scripts/`（10 份） | ⚠️ ⭐ 其 `_index.json` 今天是**零作者孤兒**（GH#883） |

⇒ ⭐ **判準**：`required` 只放「**編輯器要讓作者填得到**」的東西。
⛔ 產物不該讓人填 —— 讓人填產物，就是下一次 sync 把他的工作刪掉。

### ⚠️ ⭐ 兩個 Codex 一定會撞到的 VFX 陷阱

| # | 坑 |
|---|---|
| ⑬ | ⭐ **同一顆 mdx 有兩種合法表達**：`model@1`（走 `spawnModelFx`）與 `vfx@1`（走 `spawnVfx`）。⛔ 找不到 `content/models/x.json` **不代表**那個素材不存在 —— 先問「**哪一行程式會讀它**」（`zRef("vfx")` vs `zRef("model")`） |
| ⑭ | ⭐ `spawnVfx` 的 `at:"bone"` 與 `self` **同路：錨定單位是施法者**（`spawnVfx.ts:51`）。⚠️ 而原作 JASS 有一半是掛在**受擊者**身上（量到 316 次呼叫中 施法者 124 : 受擊者 124）⇒ ⛔ 出貨機制**正好覆蓋一半** |

---

## 1.6 ⭐⭐ 素材面：查詢 → 綁定 → 版本引用（GH#1127／#1128）

> ⚠️ 這一節每個數字都是 **2026-09-19 量出來的**，⛔ 不是抄票上的。

### ⭐ 結論先講：這三件事**引擎側已經有契約**，⛔ 但它**不叫** #1128 契約表那些名字

| # | Codex 要做的 | ⭐ 今天真的有的住處 | ⭐ 它的名字 |
|---|---|---|---|
| ① **查詢** | 列出可以綁的素材 | `content/assets-manifest.json` —— **3,191 筆**，schema `ggd-assets-manifest@1` | 每筆 `path` · `bytes` · `sha256` · `contentType` · `kind` · `refs` |
| ② **綁定** | 把素材寫進英雄／技能 | 邏輯路徑**就是** `path`（`assets/...`）；讀取端 `GET /content-api/assets/*`（唯讀，編輯器預覽在用） | ⭐ `path`，⛔ 不是 `logicalPath` |
| ③ **版本引用** | 釘住版本 | ⭐ **內容定址** —— `sha256` 自己就是版本。整包的身分是 `assetManifestDigest`（今天 `351c2899b704`）＋ `contentVersion`（`cv_3120c9ef725d`） | ⛔ 不是 `${assetId}@${version}` |

### ⛔⛔ #1128 契約表的六欄，**只有兩欄對得上出貨程式**

| #1128 契約表 | 全 repo 程式碼命中（`apps`/`packages`/`tools`/`content`） | ⭐ 出貨實際用的 |
|---|---|---|
| `assetId` | ⛔ **0**（有 9 個檔出現這個字，⭐ 全是區域變數與錯誤訊息參數，⛔ 不是素材身分欄位） | `path` |
| `version` | ⛔ **沒有獨立欄位** | `sha256`（內容定址） |
| `objectKey` | ⛔ **0 個檔** | S3 key 是**推導**的：`assets/<sha256[0:2]>/<sha256><ext>` |
| `sha256` | ✅ 有 | ⭐ 同名 |
| `kind` | ✅ 有 | ⭐ 同名 |
| `logicalPath` | ⛔ **0 個檔** | `path` |
| API 回應 `{ url, sha256, expiresAt }` | ⛔ 這條路**已被 owner 作廢**（見下） | —— |

⇒ ⭐ **照 #1127「欄位名逐字照 #1128 契約表」做出來的 `assets[]`，今天沒有任何一行 main 的程式讀得懂。**

### ⛔ 為什麼會這樣：那張契約表是**簽署網址架構**的產物，而那條路已經關掉了

> 不對，是跟往常一樣CF直接接原站ggd.adms.ai就好了 根本沒差，而S3變成純備份了

—— owner 2026-09-09（`docs/素材庫與-S3-統一資源庫.md` 第八·四節）

⇒ `objectKey`／`expiresAt`／簽署網址 這一組，是**為了讓瀏覽器直連 S3** 才需要的。
CF 接原站之後素材走的是**站台自己的邏輯網址** ⇒ ⭐ `path` ＋ `?h=<contentVersion>` 就夠了。
⚠️ 同一份文件的第十三、十六節（簽署網址／CORS）**自己標著「已被第八·四節作廢」** —— ⛔ 不要照那兩節做。

### ⛔⛔ 對外契約今天**漏掉**的（⭐ 這才是 #1127／#1128 真正的缺口）

grep `docs/editor-contract/` 全部 43 份量到：

| 名詞 | 命中 |
|---|---|
| `assets-manifest.json` 的 schema 與六個欄位 | ⛔ **0** —— ⭐ 3,191 筆素材的清單格式，對外契約**一個字都沒寫** |
| `assetManifest`／`assetManifestDigest`（`content/editor-target-profile.json` 裡**已經有**） | ⛔ **0** |
| `GET /content-api/assets/*` | ⛔ **0** |
| 素材庫查詢（正式入庫 vs 待處理候選，今天是 **1 : 341**） | ⛔ **0** |
| 「五道界線」（檔案存在／GLB 轉換／已標準化入庫／畫面驗收／正式發布） | ⛔ **0** |
| `requiredRefinement`（綁定後**不可被「已綁定」蓋掉**的未完成狀態） | ⚠️ **1 份 1 次**，而且在計畫書裡 —— ⛔ 不是契約 |

### ⭐ 要補進**機器可讀**契約的話，改這三支的**來源**（⛔ 不是手改產物）

| 要補什麼 | 產生器 | 來源檔 |
|---|---|---|
| `ggd-runtime-capabilities.json` 增一段素材契約 | `caps:export` | `tools/capability-export/export.ts` |
| `ggd-editor-coverage.json` 把素材欄位列進必畫清單 | `editorcov:build` | `tools/editor-contract/gen_editor_coverage.ts` |
| `content/assets-manifest.json` 本身 | `assets:manifest` | `tools/asset-manifest/gen.ts` |

⛔ 這三份**都是產物** —— 動之前一律 `bash scripts/genguard.sh <path>`。

### ⚠️ 順帶：票上那條驗收閘**不存在**

#1127 的驗收②與 #1128 六項的第 1 項都寫著「通過 Main 的 assetpin:check」——
⭐ 那支指令**全 repo 不存在**（已記進 `docs/守則犯錯.md`；抓到它的是 `docsCiteRealCommands.test.ts`）。
⇒ ⛔ 不要等它。⭐ 今天驗素材身分的真閘是 `assets:manifest:check`（逐筆重算 `sha256` 比對）。

---

## 2. 計畫與追平

| 檔 | 行數 | 是什麼 | 可改嗎 |
|---|---:|---|---|
| `CODEX_COORDINATION_20260831.md` | 155 | ⭐ 分工 · 接縫 · 陷阱 · 分支政策 | 手編 |
| `CODEX_CATCHUP_20260830.md` | 398 | 追平清單：effect kind **+9** · hook 事件 **+14** · 模板家族 **+9** · ability 欄位 **+38** · aura **+8** · 條件葉 **+1** · effect 欄位 **+70** | 手編 |
| `docs/玩家UGC No Code 視覺化遊戲引擎編輯器計畫.md` | 285 | 全盤計畫（owner 的方向：**開放玩家自己設計**，⛔ 不靠 AI 無止境逼近） | 手編 |

⚠️ ⭐ `CODEX_CATCHUP` 第 24 行起有一段 **「⛔⛔ 更正（2026-08-31 對抗式稽核）」** —— ⭐ **先讀那一段**，
它推翻了同一份文件前面的部分結論。⛔ 不要只讀第 82 行的「基線落差」就開工。

---

## 3. 內容規格（要寫技能／特效才需要）

| 檔 | 行數 | 回答什麼 | ⛔ |
|---|---:|---|---|
| `docs/技能標記機制與效果規則.md` | 4,575 | ⭐ **「它怎麼用」** —— 每個 effect 的參數與上下界、範例 | **產物**（`pnpm spec:build`） |
| `docs/技能編輯器引擎須知 20260811.md` | 12,731 | 引擎須知 · §13.10 是 90 支的完整 JSON | **產物** |
| `docs/英雄技能第一批重製-90支.md` | 11,655 | owner 規格 ↔ JSON 並排 | **產物** |
| `ggd-skill-shapes.md` | 333 | 技能的形狀分類 | **產物** |
| `ggd-skill-tiers.md` | 478 | 五級距 | **產物** |
| `ggd-ability-prose.json` | 419 | 說明文案的佔位符 | **產物** |
| `ap-damage-scaling.md` | 102 | AP 換算 | **產物** |

⛔ **這七份 Codex 一律不可手改。** 紅了跑 `pnpm skills:sync` 然後 `git add`。

⭐ **分工**：`ggd-runtime-capabilities` 答「**名字存不存在**」，`技能標記機制與效果規則` 答「**怎麼用**」。
兩者共用同一個 `buildCapabilityManifest()` ⇒ 名詞那一層不可能互相矛盾。

---

## 4. ⛔⛔ 十二個坑（⭐ 全部是真的踩到過的）

### 契約層（本文件新增的三個）

| # | 坑 |
|---|---|
| ⑩ | ⭐ **兩個 schema tag 名字只差一個詞**：`ggd-`**`content`**`-target-profile@1`（live 端點）vs `ggd-`**`editor`**`-target-profile@1`（出貨檔）。⭐ 後者的 **17 個鍵**裡，前者的 **9 個必填欄位一個都沒有**。⚠️ 讀檔前先看 `schema` 那一格 |
| ⑪ | content-api 是 **loopback-only**；六條 route 裡 **importer 那組全回 501**（刻意的），`/capabilities` `/authoring-rules` `/active/target-profile` `/health` 才是真的 |
| ⑫ | 在 `zEffectDef` 外面包 `superRefine`/`z.any()` ⇒ `walkZod` 看到 `unknown` ⇒ ⭐ **46 種 effect kind 全部走不到，而 `tsc` 是綠的** |

### repo 層（`CODEX_CATCHUP` §4 的九個）

① 產物不可手改（genguard **會擋你**）· ② 改 `content/` 要 `content:build` **且來源檔也要進版控** ·
③ `shape:"circle"` 一定要有字面 `radius` · ④ `damageTier` 與 `flat` ⛔ 不可同時填 ·
⑤ `sim/**` 是純函式區 · ⑥ Colyseus `defineTypes` 是 **APPEND-ONLY** ·
⑦ ⭐ `「…」` 裡是**角色對白** ⛔ 不是效果 · ⑧ 新增 `content/config/*.json` 會動到**兩個共用檔** ·
⑨ `pnpm skills:sync` 是**全域鎖**

---

## 5. ⭐ 開發守則裡 Codex 一定要知道的五條

| 條 | 一句話 |
|---|---|
| **第〇·四** | ⭐ 值**在載入時從共用表解析**，⛔ 不烘進每一份文件。同一個節點⛔ 不可以同時有級別與算好的值 |
| **第〇·五** | ⭐ 技能 ＝ JSON 模板組合，**沒有例外**。⛔ 看到「為某支技能寫一個 if」就是越線 |
| **第〇·六** | ⭐ 衝突的優先序：**新版說明 > 編輯器 JSON > JASS > w3x 說明 > w3x 設定** |
| **第一** | ⭐ 所有功能做成**後台可調**，尤其**決策點**。寫死才需要理由 |
| **第一·五** | ⭐ 卡片上⛔ 不可以有「說了但不會發生」的字 |

⛔ **契約紅了不要改測試** —— 跑產生器然後 `git add`。

---

## 6. ⭐ 分工邊界（owner 2026-08-31 逐字）

> 「不用管 codex branch，**以遊戲主程式 main 為主**，我再讓 codex 配合」

> 「`feat/ability-review-authoring` 是 codex 的 branch，你可以**參考思路**，
>  但**獨立編輯器 桌面版 Electron 還是 codex 的獨立工作**喔」

| 東西 | 誰 |
|---|---|
| `main` 的遊戲程式 · `content/**` · `packages/shared` schema · `apps/admin` · `apps/content-api` | **main** |
| **Electron 桌面版獨立編輯器** · `feat/ability-review-authoring` | ⭐ **Codex** |

⭐ **「編輯器連遠端 Base」五項的歸屬**（2026-08-31 量過）：
`targetProfileOverride`（main 零命中）· `editor-authoring` sidecar（`apps/` 七個裡沒有）·
遠端素材快取（⛔ **0 個檔**提到遠端 base）· `remoteAsset.test.ts` ⇒ **Codex**。
`GET /content-api/editor-source` ⇒ **main 做，但等 Codex 開票再做**
（⛔ 一條零呼叫端的 route 是複雜度不是功能；⭐ 票裡寫三件：回傳什麼欄位 · 哪一行程式會讀它 · 認證怎麼過）。

#### ⛔⛔ 更正（2026-09-19 重量）：上面那五項裡**三項已經在 main 了**

⚠️ 上面那一段的分母是 **2026-08-31** 量的。⭐ 今天重量，結論變了：

| 2026-08-31 說的 | ⭐ 2026-09-19 量到 |
|---|---|
| 「Electron 桌面版獨立編輯器 ⇒ Codex」 | ⛔ ⭐ **`apps/editor-desktop/` 已經在 main**（另有 `apps/editor/`） |
| 「遠端素材快取 —— **0 個檔**提到遠端 base」 | ⛔ ⭐ **在 main**：`apps/content-api/src/server.ts` 的 `remoteAssets`（含 `assetManifest` 與逐檔 `sha256` 核對）· `apps/editor-desktop/src/remoteWorkspace.ts` |
| 「`remoteAsset.test.ts` ⇒ Codex」 | ⛔ ⭐ **在 main**：`apps/content-api/src/remoteAsset.test.ts` |
| 「`GET /content-api/editor-source` ⇒ 等 Codex 開票再做」 | ⛔ ⭐ **已經做了**：`apps/content-api/src/editorSourceRoutes.ts` |
| 「`targetProfileOverride`（main 零命中）」 | ✅ **仍然 0** —— ⭐ 但 `content/editor-target-profile.json` 已出貨（唯讀、給外部編輯器 pin base 用） |

⇒ ⭐ **開工前先量一次，⛔ 不要照這一節的 08-31 分母派工** —— 五項裡四項的狀態已經變了。

---

## 7. ⛔ 兩邊都不要做的

| ⛔ | 為什麼 |
|---|---|
| 手改 `docs/editor-contract/*` 裡**屬於產物**的那些，與第 3 節那七份 | ⭐ 改 main 的 schema／產生器來源再重跑產生器。⚠️ ⭐ **2026-09-19 量到：這個目錄頂層 43 份裡 22 份是產物、21 份是手編**（例如本檔與 `CODEX_*.md` 就是手編）⇒ ⛔ **不要照路徑判斷**，一律 `bash scripts/genguard.sh <path>` 問它 |
| 在 `packages/shared/src/sim/**` 用 `Math.random` / `Date.now` | `sim/purity.test.ts` 會紅 |
| `git add -A` · `git commit --amend` · `git checkout <檔>` | ⭐ 併行時它們動到的是**別人的**東西 |
| 為了讓契約過關而改測試 | ⭐ 跑產生器 ＋ `git add`，⛔ 不是改斷言 |
