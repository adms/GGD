# 工作流入口

完整合併文件：

[GGD社群英雄完整上傳內容與工作流交接_37名.md](../GGD社群英雄完整上傳內容與工作流交接_37名.md)

## 目前完成與使用方式

- 37 份正式 `ggd-hero-project@2` 草稿，方案採當前 `ggd-hero-plan@2`；222 槽逐一套用真實 enabled 模板與參數。
- 每名英雄有完整 upload-recipe.json 與獨立投稿文字，保留原設計全文和模板替代差異。出身決定三圍／成長，11 項屬性採級距微調。
- 185 支主動技能有具體 VFX 腳本；被動未掛無法歸屬的假施法事件。模型、六種基本動作及圖示用已出貨 GGD 代理資產，專屬角色造型與動作仍待製。
- 本地驗證：37/37 schema、37/37 compiler、37/37 基本 SimWorld kit、37/37 原始資產 ZIP 往返通過。正式原設計機制和畫面未因此通過；共有 220 槽明列具體差異。
- ZIP 在 `packages-local-preview/`，可供離線內容／編輯格式查驗；`gameRevision=offline-community-handoff-20260907` 是明示離線標記。本次未取得活動服務 target，工作流須對當下 target **重建**後投稿，不能只替換 manifest 的版本字串。
- 本次完成交接檔案；沒有修改 GGD 程式、git 分支、提交、推送、合併 PR 或投稿審查。

## 檔案入口

| 檔案 | 用途 |
| --- | --- |
| `GGD社群英雄上傳內容_37名/index.json` | 37 名角色與正式英雄檔／配方／預覽包索引 |
| `projects/01.hero-project.json`～`37.hero-project.json` | 正式 HeroProject，sourceLock 先為 null，不捏造既有作品 ID |
| `recipes/*.upload-recipe.json` | 原文、映射、微調、有效屬性、實際效果及資產 manifest |
| `upload-text/*.md` | 個別英雄可讀投稿內容與逐槽審查 |
| `機制補強與驗收.md` | 共用機制的具體參數、適用者與失敗條件 |
| `review-matrix.csv` | 222 槽的原設計／目前行為／補強／驗收狀態 |
| `runtime/*.compiled.json` | 由當前 GGD 規則產生的英雄與技能結果 |
| `evidence/report.json` | 各英雄編譯、模擬、ZIP 摘要與雜湊 |
| `evidence/*.simulation.json` | 真實基本場景紀錄，不代表所有目標機制通過 |
| `evidence/template-catalog.json` | 所用模板、參數契約及來源 digest |
| `來源查證補充.md` | 官方／二手／未逐頁確認的來源界線 |

以上相對路徑以 `/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD社群英雄上傳內容_37名` 為資料包根目錄。

## 主工作流執行要求

先以 HeroProject 重用既有英雄鑄造流程，核對每槽 currentBehavior 與 ownerDescription。必須處理 requiredRefinement，或由正式審查明示接受替代方案；不能將護盾當成吸收、暈眩當成時停、固定招當成複製、回血當成死亡回歸。

以正式 schema/compiler/SimWorld/capability 為準；通用機制可用現行 effects 組合時先重用。完成機制後再對模型、技能事件與 VFX 同步驗收，最後重建當下目標 ZIP 並走社群審核。不要依角色名稱新增引擎特判，也不要覆蓋已存在的安茲／飛鼠等正式內容。


## 本地重建

從現有 GGD-community-hero-forge 目錄執行（只寫這份交接目錄）：

```sh
node --import tsx '../GGD社群英雄上傳內容_37名/build.mts'
node --import tsx '../GGD社群英雄上傳內容_37名/finalize.mts'
```

此命令不投稿、不修改程式、不改 git。當 template／來源檔變更，重建會重新驗證，不沿用舊通過結果。離線包要投到服務時，須由既有包管線取得真實 target 並重新建置。
