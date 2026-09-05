# 🧑‍🎨 社群英雄創作與審核發布 —— 低維護版規劃（分析，⛔ 不實作）

> ⭐ **基準**：`origin/main` = `64f44999b`，工作樹乾淨。
> ⭐ 這份文件的**每一個結論都附 `檔案:行號`**，⛔ 不引用任何舊對話的數字、指紋或完成度。
> ⛔ 這一輪**只做分析**，等 owner 確認後才動工（owner 2026-09-05 逐字：「先完成以上分析後停下」）。

---

## 一、⭐ 最重要的一句：**投稿的伺服器端已經存在**，⛔ 不要重做

owner 說「先確認現有能力，不重做」。量到的結果比預期多：

### 1-A ✅ 可以沿用的（**每一項都在跑**）

| 能力 | 住哪 | 證據 |
|---|---|---|
| ⭐ **投稿端點**（帶 JWT 身分） | Go platform，⛔ **不是** content-api | `apps/platform/internal/submissions/handlers.go:85` · 身分 `auth/middleware.go:108-120` · 掛載 `server/server.go:622` |
| ⭐ **配額**：每人 20 份待審 · payload ≤ 512 KB | 同上 | `submissions.go:51-53`（強制點 `:249`）· `submissions.go:50`（`handlers.go:117`） |
| ⭐ **「內容變了就作廢舊核准」** | 同上 | `submissions.go:222-226` · `:148` |
| ⭐ **裁決有真名與時間** | 同上 | `DecidedBy` / `DecidedAt`：`submissions.go:122` · `:267` |
| ⭐ **後台審核頁已存在** | admin | `SubmissionsReviewPage.tsx:1-26`；註冊 `apps/admin/src/ui/App.tsx:1260` |
| ⭐⭐ **package digest**（正是 owner 要的那一種） | shared | `sha256(JCS(語意投影))` `packages/shared/src/content/import/digest.ts:128`；投影 `:105`；排除鍵 `:62`；⛔ 明文拒 md5/sha1/crc32 `:42` |
| ⭐ **匯出已用共用 validator** | editor | `validateDoc` `exportBuilder.ts:472` · 整包 `zEditorImportPackage` `:390` · ZIP `zPackageManifest` `:621` · zip 安全 `:629` |
| ⭐ **逐份驗證**（⛔ 不必對整棵樹） | content-api | `server.ts:751`（單 doc dry-run）· `importRoutes.ts:865`（`/validate-single`） |
| ⭐ **產物寫入保護** | content-api | `registerProductWriteGuard` `editorSourceRoutes.ts:182`；註冊 `server.ts:959`；409 `GENERATOR_OWNED_PRODUCT` |
| ⭐ **耐久覆蓋層**（後台編輯唯一活得下來的地方） | Go platform | `contentoverlay.go:1-46`；merge 在消費端 `:13-19`；**稽核失敗就拒絕寫入** `:600-630`；版本歷史走 go-git `versions.go:23-35` |
| ⭐ **上下架已有一頁**，寫進覆蓋層 | admin | `RosterPage.tsx:113-120` |
| ⭐⭐ **「對局不中途換版」今天已經成立** | game-server | 白名單在**開房那一刻**取快照 `MatchRoom.ts:465-471` · `MatchController.ts:1050-1054`；雙向釘死 `curation/liveRefresh.test.ts:57-80` |
| ⭐ **回放已記錄「當時是哪一版」且不符拒播** | game-server | header `replay/format.ts:85`（cv）`:97`（registryFingerprint）`:99`（buildStamp）；拒播 `replay/Player.ts:361-372` |
| ⭐ **schema 版本標記 ＋ 逐份隔離** | shared | `z.literal("champion@1").strict()` `schema/champion.ts:442-444`；隔離 `loader.ts:150-160`；連坐移除 `:277-292`；集中大量失敗才 fail-closed `:245-268` |
| ⭐ **頭圖已有落地 ＋ 去重 ＋ 三種限制** | content-api / shared | 落地 `iconLanding.ts:84-113`；sha 相同就跳過 `:97-103`；格式由 **magic bytes** 嗅出 `encodeIcon.ts:58-62`；像素 ≤ 4096² `schema/config/iconUpload.ts:47-50`；輸出固定 128² webp q90 `encodeIcon.ts:32-37` |
| ⭐ **冪等鍵**（import 側） | content-api | `x-ggd-operation-id` `importRoutes.ts:937` · 重放查詢 `:953-960` |

### 1-B ⛔ 真正缺少的（**12 個，逐項附證據**）

| # | 缺口 | 證據 | 嚴重度 |
|---|---|---|---|
| **G1** | ⭐⭐ **投稿的 digest 是「客戶端自稱的」** —— 伺服器只檢查非空字串 | `submissions.go:177`；全 package grep `sha256\|hash` 零筆非測試命中 | 🔴 **它讓「核准的是不是同一份」整條失效** |
| **G2** | ⭐ `Promote` **一律 503** —— 沒設 `GGD_CONTENT_API_URL` | `server/playercontent.go:126-129`；重驗實作 `submissions/revalidate.go:34,44` | 🔴 發布那一半今天走不通 |
| **G3** | ⭐ **Editor 沒有 autosave**，草稿只在記憶體 | 寫 `apps/editor/src/store.ts:126-138`；讀 `views/EditorView.tsx:30`；⛔ 全樹無 `autosave/beforeunload` | 🔴 **owner 的驗收「Editor 更新不丟草稿」今天根本不成立** |
| **G4** | ⭐ **Editor 沒有自動更新** | `apps/editor-desktop/package.json` 依賴全清單無 `electron-updater`；`"build"` 無 `publish`；全 repo grep `electron-updater\|autoUpdater\|app-update.yml` **0 命中** | 🟠 owner 明列的功能 |
| **G5** | ⭐ **匯出包只含 `abilities` + `items`** | `exportBuilder.ts:28`（`RuntimeAuthoringCollection`）；champion 只以 icon owner 出現 `:66-77` | 🔴 **「投稿一個英雄」今天包不起來** |
| **G6** | content-api **零身分驗證**，且是 `profiles:["dev"]` | grep `authorization\|bearer\|jwt` 於 `apps/content-api/src` **零命中**；`guard.ts:194-211` 靠 loopback＋Origin；`docker/compose.yaml:321` | 🟠 owner 也明說「⛔ 不要把本機開發 API 當公開投稿服務」 |
| **G7** | ⭐ **沒有任何一頁把「裁決」與「上架」接在同一次操作** | `SubmissionsReviewPage.tsx:1-26` 逐字說「通過」與「套用」刻意是兩個按鈕 | 🟠 owner 要「一步完成」 |
| **G8** | ⭐ **覆蓋層改動沒有熱生效** | `contentBus.ts:203-210` 逐字 `run: async () => ({ ok: false })` ＋「這一台 shard 到重啟為止都不會用」 | 🔴 **按下發布之後，什麼時候到玩家眼前 —— 量不到** |
| **G9** | ⛔ **沒有社群房／官方房的區別** | `roomSettings.ts:1-8` 不含「用哪份內容」；`apps/platform`/`game-server`/`shared` 無 `roomType` | 🟠 owner 建議「社群內容預設只進社群房」 |
| **G10** | ⛔ **沒有物件儲存**；頭圖進 git | 全樹 grep `minio\|@aws-sdk\|s3://` 零命中；落點 `content/assets/icons/…` | 🟡 首版可接受，⭐ 但「圖片共用不可變儲存」做不到 |
| **G11** | ⭐ 客戶端**不讀** `MatchState.contentVersion` | 欄位在 `protocol/schema.ts:840`，而 `apps/client/src` 零讀取 | 🟠 新舊樹 join 時**沒有任何人比對** |
| **G12** | 功能批核的「**誰**」沒有人寫 | `by` 在白名單 `tools/review/stores.mjs:56`，而寫入端 `features.mjs:489-494` 不填它 | 🟡 |

⭐ **G1 + G2 + G8 是同一條線上的三個洞**：投稿收得進來、核准按得下去，⛔ 而「核准的是不是同一份」與「發布之後有沒有生效」今天**都沒有答案**。

---

## 二、最小流程與資料關係

### 2-A 玩家流程（⭐ 五步，⛔ 不出現版本管理字眼）

```
建立／編輯作品 → （自動儲存） → 預覽 → 投稿 → 查看結果
```

- **建立／編輯**：沿用 Editor 既有表單（`EditorView.tsx:69` 的同一份 Zod）
- **自動儲存**：⛔ **G3，今天沒有** —— 首版要做（見階段 P1）
- **預覽**：沿用既有 3D 預覽（`preview3d/`）與 sim preview
- **投稿**：`POST /api/v1/submissions`（既有，帶 JWT）＋ ⭐ **伺服器重算 digest**（修 G1）
- **查看結果**：`GET /submissions/pending` 既有（`handlers.go:89`），⛔ 缺玩家端 UI

三種投稿情境**共用同一條路**，差別只在一個欄位：

| 情境 | 欄位 | 規則 |
|---|---|---|
| 新英雄 | `derivedFrom: null` | —— |
| 更新自己的 | `workId` 已存在且 `author == 我` | ⛔ 不能改別人的 |
| 另存改編版 | `derivedFrom: {workId, version, author}` | ⭐ **新的 `workId`**，⛔ 不覆寫來源 |

### 2-B 後台流程（⭐ 一個列表 ＋ 一個詳情頁）

```
待審列表 → 詳情頁（頭圖 · 技能說明 · 變更摘要 · 驗證結果 · 試玩）
        → 「通過並發布」／「退回修改」／「拒絕」
```

⭐ 沿用 `SubmissionsReviewPage`，⛔ 不新開一頁。
⚠️ 而「通過並發布」要把今天的**兩個按鈕**合成一個**動作**（G7），
⭐ 內部仍分「核准」與「發布成功」兩個狀態（owner 明確要求）。

### 2-C 資料關係（⭐ 最小集合）

```
Work（作品）           workId · author · createdAt · derivedFrom? · remixPolicy
  └─ Version（快照）   versionNo · packageDigest ★ · payload · createdAt
        └─ 不可變。⭐ 送審那一刻固定，⛔ 發布時不重組
  ├─ Candidate         ⭐ 每個 Work 最多一份待審（重投取代，保留歷史）
  ├─ Release history   versionNo → publishedAt · publishedBy · overlayGeneration
  └─ Current           目前上架的 versionNo（⛔ 可為空 ＝ 已下架）

Verdict（外層，⛔ 不回寫快照）
  reviewOf: packageDigest ★ · decision · reason · decidedBy · decidedAt
```

⭐ `packageDigest` 是**唯一的接縫**：投稿、核准、發布、回放全部指向同一個字串。
⛔ 而今天它是客戶端自稱的（G1）⇒ ⭐ **那是第一件要修的事**。

---

## 三、分階段順序 · Main／Codex 責任 · PR 切分

⭐ 依 `.github/CODEOWNERS` 分工，⛔ 不跨界。

| 階段 | 做什麼 | 誰 | PR |
|---|---|---|---|
| **P0** ⭐ 先補「同一份」 | 伺服器**重算** `packageDigest` 並與客戶端宣稱的比對，不符 → 400（修 **G1**）；`GGD_CONTENT_API_URL` 接上讓 `Promote` 不再 503（修 **G2**） | **Main** | 1 |
| **P1** ⭐ 草稿不丟 | Editor autosave → IndexedDB（沿用既有 `local-icons/storage.ts:9` 的模式），含關頁保護（修 **G3**） | **Codex** | 1 |
| **P2** 包得起一個英雄 | `RuntimeAuthoringCollection` 擴到 `champions` / `vfx`（＋必要的固定資源引用）（修 **G5**）。⚠️ schema 那一半是 Main | **Codex**（匯出）＋ **Main**（schema／validator） | 2（先 Main 後 Codex） |
| **P3** 一步發布 | 「通過並發布」＝ 一個動作、兩個狀態；冪等鍵防重複；失敗可重試不影響舊版（修 **G7**） | **Main** | 1 |
| **P4** 發布真的生效 | 覆蓋層熱生效（修 **G8**）或**明說**「下一場才生效」並在 UI 顯示 | **Main** | 1 |
| **P5** 社群房 | `roomSettings` 加一格 `contentPool`（三個住處），社群內容預設只進社群房（修 **G9**） | **Main** | 1 |
| **P6** Editor 自動更新 | `electron-updater` ＋ 一個正式通道 ＋ 來源／完整性驗證 ＋ 更新失敗保留草稿（修 **G4**） | **Codex** | 1 |
| **P7** 收尾 | 客戶端讀 `MatchState.contentVersion` 並在不符時說話（修 **G11**）；批核的「誰」補上（**G12**） | **Main** | 1 |

⭐ **P0 必須第一個** —— 其餘每一階段的正確性都建立在「核准的是同一份」之上。
⛔ P6 可以與 P2–P5 平行（不同目錄）。

---

## 四、關鍵驗收案例（⭐ 少量，逐條對應 owner 的驗收重點）

| # | 案例 | 怎麼驗 |
|---|---|---|
| **V1** | 作品能投稿並上架 | 投一份 → 後台按「通過並發布」→ ⭐ **下一場**選得到 |
| **V2** | 更新不污染舊版 | 發 v2 → ⭐ v1 的**快照位元組不變**（比 `packageDigest`） |
| **V3** | 改編不覆寫來源 | 另存改編 → ⭐ 來源 `workId` 的 `current` **不動**，改編是新的 `workId` |
| **V4** | ⭐⭐ **審核的是實際發布的內容** | 投稿後**竄改 payload** ⇒ 伺服器重算的 digest 不符 ⇒ **400**（⭐ 這條直接驗 G1） |
| **V5** | 發布失敗與重試安全 | 讓 promote 失敗 ⇒ ⭐ **舊版不受影響**、狀態顯示可重試、重按不產生第二次發布 |
| **V6** | 對局不中途換版 | 開局後改內容 ⇒ ⭐ 那一場**逐 tick 相同**（沿用 `liveRefresh.test.ts:57-80` 的形狀） |
| **V7** | Editor 更新不丟草稿 | 編到一半 → 觸發更新 → 重啟 ⇒ ⭐ 草稿還在 |

⛔ **不建立龐大驗收矩陣** —— 七條，每條一個承重斷言 ＋ 一次突變。

---

## 五、需要 Owner 決定的三題（⭐ 各附建議預設）

### Q1 ⭐ 社群內容要不要**只**進社群房？

- **建議預設：是** —— `roomSettings` 加一格 `contentPool: "official" | "community"`，
  社群作品**只**出現在 `community`，⛔ 不進隨機池與競技名單。
- 為什麼：`randomChampionPool()` 今天直接吃白名單（`MatchController.ts:1637-1650`）
  ⇒ ⛔ 不分房型的話，一份剛過審的社群英雄**當天就會被隨機抽到別人頭上**。
- 回頭的開關：那一格本身（三個住處，預設 `official`）。

### Q2 ⭐ 改編（remix）預設開還是關？

- **建議預設：開，但作者可關** —— `Work.remixPolicy: "allow" | "deny"`，預設 `allow`。
- 為什麼：owner 說「改編權限依來源作品的使用規則判定」⇒ ⭐ 那是**作者的**決定，
  ⛔ 不是系統的。而預設關會讓這個功能第一天就沒人用得到。
- 回頭的開關：全域一格 `ugc.remixDefault`（⭐ owner 可以一鍵把全站預設改成 `deny`）。

### Q3 ⭐ 「發布之後多久生效」要做熱生效，還是**明說**下一場？

- **建議預設：明說「下一場生效」，⛔ 首版不做熱生效。**
- 為什麼：覆蓋層今天**沒有**熱生效（`contentBus.ts:203-210` 自陳 `ok:false`）
  ⇒ 做它是一個獨立工程；⭐ 而「下一場生效」對玩家是可接受的，
  ⛔ 只要 UI **說出來**（⛔ 不可以讓管理員以為按完就上了）。
- ⚠️ 但這一格有一個**今天就存在的坑**：`contentBus` 的 overlay refresher 回 `ok:false`
  意思是「**到重啟為止都不會用**」—— ⭐ 那比「下一場」更久。⇒ 首版至少要讓它**下一場**生效。

⛔ **這三題只問產品偏好** —— 技術選型、數值與公式我不推給 owner。

---

## 六、⛔ 首版明確不做（照 owner 的界線）

獨立技能／特效市場 · 複雜分支合併 · 多人即時協作 · 多級審核 · 排程發布 ·
多更新通道 · 排行榜與推薦 · 通用檔案平台 · 契約熱更新平台 · 物件儲存。

⭐ 上傳只開**頭圖**；VFX 只用既有積木與核准資源。

---

## ⚠️ 七、四條 lane「查了但沒找到」的東西（⭐ 與找到的一樣重要）

- content-api → platform 的任何呼叫（只有反方向 `revalidate.go:44`）
- 玩家端的投稿 UI（`GET /submissions/pending` 存在，⛔ 沒有前端）
- schema 的 `@2` 與任何 migration 路徑（schema 目錄零命中）
- 官方房／社群房的任何欄位
- 物件儲存（S3／MinIO）
- Editor 呼叫 `/backups` 或 `/restore` 的地方（⭐ 伺服器端 `backup.ts:1-37` 有，UI 沒接）
- editor-desktop 的 release／publish CI（`.github/workflows` 只有三支）
