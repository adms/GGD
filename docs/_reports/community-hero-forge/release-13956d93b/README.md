# 整合後 37 名英雄同版服務驗收

37／37 名、222 槽完成目前 Editor 生成器採用、伺服器重建 ZIP、雲端草稿保存、正常投稿、管理員原子核准發布。此處是已獲授權的 **127.0.0.1 隔離驗收**，未部署正式站。

固定服務來源 `13956d93bb3e5f583c78296009ffc5db71a99dd3`；內容 `cv_720a022a110a`、migration `4d3fea0bcc0d`、processor `f8ae3104cbe5`，generator `1476928e88c1067f68ccebe06be254940d6ff95f6cf7cd7ee29807adecdf8597`。後續合入 main `7778c10c5` 僅為素材工具與文件，不改本批遊戲／生成器來源。帳號在全新資料目錄建立，歷史 importer 的 46,752 份檔案先複製並核對原始 SHA；原驗收服務資料未改動。

| 項目 | 實際結果與證據 |
| --- | --- |
| 37 名建包 | `rebuilt-37-attempt2/report.json`：37 通過；指定名稱、完整原文、sourceLock、requiredRefinement、固定模板定義及微調逐份保存。全部模型、動畫與圖示載荷與前一版逐位元組相同。每名保存 before／after project 及伺服器 validation。 |
| 草稿與投稿 | `submission-37/report.json`：正常作者先保存雲端草稿與模型，再提交 37 份 ZIP；37 份可同時待審。隔離設定為每日 100、Power User 200、同時待審 50。 |
| 審查發布 | `publication-37-attempt2/report.json`：正常管理員 37 次核准並發布，逐份比對來源快照、ZIP SHA、版本及操作歷史；一般已發布名單完整包含 37 名。 |
| 普通對局 | `evidence/match.json`：房間未帶社群開關，兩位玩家使用武藤遊戲及安茲，37 份固定版本與 146 份去重素材實際下載／驗證；內容準備完成前選角時鐘不動。選角、真實 W 施放、快照推進與重連通過。正常結算後房間消失、兩位玩家場次各 +1。 |
| 固定重播 | `evidence/replay.json`：使用正常 admin ticket、重新下載 37 固定 ZIP、重播 socket 核對至封存尾端；沒有版本拒絕或 deterministic divergence。詳見該收據的 verifiedThroughTick／lastStatus。 |
| 未上架英雄還原 | `evidence/legacy-restore.json`：既有歷史英雄「皇者 - 騜」HP 150→隔離測試微調 151→真 Content API 預覽與 CAS 還原為 150。完整目標符合預覽、另 118 名英雄與 1,394 份共用定義不變，依賴實體獨立，仍未上架。 |
| 阿薩謝爾 | `evidence/azazel-package-proof.json`：當前 ZIP 的 THE END OF SON〔終章〕在本來源 R 詛咒有效時反轉增益、沒有普通 EX 傷害；過期、未命中與資源不足分支各驗證。`logs/azazel-regression.log` 另有 15 項既有回歸通過。 |

## 畫面沿用與實際差異

`evidence/evidence-reuse.json`、`compiled-equivalence.json`、`compiled-leaf-differences.json` 明列逐份比較。37 名模型／動畫／圖示 bytes 相同，VFX／模型／投射物定義未變；沿用既有逐槽美術審查，不宣稱重新取得全部畫面。10 名、12 槽的可執行差異是 AP 係數或 includeOrigin；新套件已重跑伺服器編譯／模擬，不能稱整包 runtime 等同舊版。依賴 Sela／Thorne 也有係數或模板出處更新。

本輪 37 包由既有 Editor adoptHeroGenerator 函式與正常服務 API 處理，**不是 37 次瀏覽器點擊錄影**。CUA 的檔案選擇器無法交付事件，因此未冒稱新畫面驗收；#1120 新變身模板另有實際 Editor 第 1／4 階 UI 收據。這 37 份設計本身沒有使用新 championForm 對應體。代理／風格替代模型仍明示，不能稱原作設計全部還原。兩位玩家的 W 與一場對局不代表 222 槽全部在連線對局施放，也不是 iPad FPS 實測。

## 失敗與修正範圍

- 初次建包只因驗收腳本 SHA 前綴比較錯誤而中止，未改動伺服器；修正後完整 37 份通過。
- 舊 `/decide approved` 呼叫被現行 API 拒絕，全部仍待審；改走現有原子「核准並發布」接口，37 份成功。
- 第一次開房因遊戲在隔離設定更新前啟動，仍持有舊內容版本而被相容性檢查拒絕。重啟本次隔離服務讀入同一 overlay 後，原 37 份 ZIP 不重送即可通過。
- 重播驗收原把結算後 transport tick 當錄影尾端，又曾讀錯 summary 欄位；後以封存完成標記、summary ticks、結算事件邊界及最後 checkpoint 核對。修正同步回既有 `tools/community-hero-forge/local-replay-proof.mts`，保留嘗試紀錄。
- 歷史還原初次只因驗收腳本把語音索引也算成英雄而誤報，改用服務實際英雄清單。產品還原未跨英雄污染。

上述修正屬隔離環境或驗收腳本，沒有為通過而放寬相容性、權限、原文或版本隔離條件。原始成功／失敗收據及實際腳本一併保留。

## 提交檢查與 CI

同批 `skills:check`、`editor:accept:release`、`coord:check` 完整通過（Editor 592 項、型別、正式建置；coord 21 份），見 `evidence/delivery-checks.json` 與 `logs/delivery-*.log`。

GitHub run 34257737632 的 contract／go-platform／vuln 通過，unit 原有四個失敗。兩個過期 profile 檢查已用官方 `pnpm content:build` 修正，只更新編譯器與 profile 指紋，內容版本未變；main 帶入的 Mac 暫存路徑改用通用目錄及顯式覆寫。只重跑四個失敗檔案：**3 檔／9 項通過，1 檔／1 項仍失敗**。剩餘是 v0.41.5 缺玩家公告紀錄，公告帳本與 main `7778c10c5` 完全相同；沒有發公告或填造紀錄。見 `ci-status.json`、`logs/ci-unit-before.log`、`logs/ci-targeted-after.log`。不能宣稱整體 CI 綠，合併前仍須釐清此發布帳本問題。

原始 log 的尾端空白保留以維持 SHA 證據；其他新增來源／文件通過 whitespace 檢查。

## 材料與剩餘工作

`evidence-manifest.json` 核對 Git 的來源、設定與收據。新版 37 ZIP、帶二進位圖示的原始 inspection／snapshot、封存重播及本次歷史版本庫素材存於 [S3 材料清單](../../../../materials/community-hero-forge/supplements/release-13956d93b/README.md)。版本庫 JSON 保留於 Git，還原時和 S3 素材合併；不保存帳號資料庫、密碼、JWT 或服務金鑰。

正式上線尚待 Main 審查合併 #1123、部署相容服務，再依正式服務目標重建／投稿／審查發布 37 名；隔離版本摘要不能作為正式部署收據。只透過原 PR 交付本批工作，未轉派其他任務。
