# 逐則對票 · owner 原話全文 2026-09-14

> ⭐ `docs/_daily/2026-09-14.md` 的表格那一格是**截斷**過的,全文在這裡。
> 由 `scripts/message-ledger.sh` 從 session transcript 產生 —— ⛔ 不要手改。
> `scripts/asked-before.sh` 會 grep 這一份找 owner 的原話。

## 00:37

阿結果呢？

## 00:48

你先解釋 但我的原則是什麼你知道嗎?

## 00:53

我是說改公式的原則

## 00:57

我喜歡 公式 一致 簡潔 不要複雜難懂難維護 所以我才發明五級距 整數靠攏 系統倍率 等規則

## 00:59

你會搞出這一系列問題 就是沒掌握 一致簡潔容易維護的原則 導致 loop 修改 不斷追求中位數 前後規則不一致 數值零碎 等問題

## 01:06

好了請你重新思考這一切 如何符合原則 一勞永逸 不是改來改去沒完沒了

## 01:31

go

## 01:42

在這個期間 你可以派獨立工作流 去檢查 大廳英靈殿 是否包含所有英雄角色介紹 包含隱藏人物

## 02:20

隱藏角色要顯示 黑化Saber可以上架

英靈殿一堆無法顯示 3d model 請開票修正

記得這幾天對話開票記錄要更新

## 02:44

B 開沒關係 繼續

## 03:17

已完成清單更新、commit、push、同步最新 Main，並建立合併票。

* 四日完整清單：[2026-09-11～2026-09-14 新增模型、動作、特效與語音清單](/Users/Takuro/Dropbox/我的 Mac (Moriya.local\)/Documents/ABxVFX_EDIT/GGD-pr1152-next/materials/hero-model-library/近四日新增模型動作特效清單.md)
* PR：[PR #1152](https://github.com/adms/GGD/pull/1152)
* Main 合併票：[Issue #1252](https://github.com/adms/GGD/issues/1252)
* 遠端分支：`codex/hero-model-library-options`
* 遠端 HEAD：`9c8783d0e0236d7230bb650dd8b08a81652c5b0b`

本次 commits：

* `49fed2882`：主要素材、模型、轉換器、索引與審查流程
* `36a039a77`：四日清單與 S3 commit 備份收據
* `9c8783d0e`：合併最新 `origin/main` 並解決 append-only ledger 衝突

GitHub 現在回報 PR 為 `mergeable: MERGEABLE`；`BLOCKED` 是等待審查或分支保護條件，已不是 Git 衝突。
37 位英靈殿角色已逐一列入清單：

* 37/37 已找到作用中模型。
* 37/37 已轉換並有 Git 實體 GLB。
* 37/37 有 `model@1`、champion 文件與六態映射。
* 合計保留 139 個 `modelVersions`。
* 37/37 已註冊並推送至功能分支。
* 何布明列 10 個版本，Kagayaki PN020/02 已採手動預設。
* Main 尚未合併、正式站尚未部署，因此目前仍不能寫成「英靈殿正式上架」。Issue #1252 已要求 Main 合併後逐一驗證 3D 載入、路由及後台切換。

其他主要結果：

* 四顆歷史 GLB 已完成 4/4 非預設選項註冊。
* 枯星龍新增 7,996 面候選，原始 23,928 面版本完整保留；5/5 原生動作及 15 組三視角 A/B 通過，Khronos 0 errors，最差像素差異 4.490156%。
* LOL 七角色語音 311/311 已依聽審結果註冊。
* 波普 VFX 相依 package 已補齊 309/309；但 UModel 對 17/17 根節點仍輸出 0，所以 GGD 特效成品及 runtime 綁定仍是 0。
* 帕魯三名已有 3/3 Hero Forge 六槽英雄套件及本機下拉選項；原作影音完整度仍是 0/3，18 個音訊及 18 個動作候選待審。
* SSBU 的 16 名已更正為 Ultimate14 MOD 路徑；NSandNS2 目前只有容器索引，payload、角色、模型及動作辨識仍是 0。

驗證結果：

* `pnpm content:validate`：3,343 documents，`cv_d3ff2f01276a`，通過。
* Hero Forge strict：34 heroes、204 slots、34 packages，0 blocked、0 failed、0 warnings。
* 模型政策：67 passed、2 skipped；typecheck 通過。
* 中央索引：1,004 個 `model@1`、544 個實際可選 model keys。
* 註冊旗標不一致：0。
* 註冊引用缺少模型文件：0。
* Popp、Palworld、SSBU、歷史模型、inventory、dropdown audit、design backlog 的生成檢查均通過。
* `git diff --check` 通過。

目前完整 `pnpm content:build` 仍被 9 個 `MODEL_TEXTURE_BACKDROP` 問題阻擋，其中枯星龍候選有兩個 emissive bright-matte 診斷；另外 `models:check` 有 9 個既有殘留幾何問題。沒有加入豁免或放寬限制，Issue #1252 已明列給 Main。
S3 備份均完成讀回及逐檔 SHA-256 驗證：

* Git commit `49fed2882`：84 檔，archive `1cffaa0f…`
* 枯星龍完整轉換目錄：91 檔，archive `ffb84140…`
* 波普 VFX closure：700 檔，archive `fff80964…`

三份原有未追蹤 design-backlog 輸入仍完整保留，沒有加入 commit 或被覆蓋。

## 03:27

你要不要先 BMPNDD

## 03:28

那把你該開的票都開一開
