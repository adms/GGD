# 原始驗收與版本快照封存

Main 在 [#1123 審查](https://github.com/adms/GGD/pull/1123#issuecomment-5589634372) 已收錄程式，拒絕把大量原始傾印與重複版本快照帶入 main。此處只保留索引與收據；完整 2,840 檔／46,707,219 bytes 已封存至指定 S3，一分段 8,099,966 bytes。

`source-verification.json` 證明每份位元組與公開原提交 `c2487661f` 一致；原分支歷史保留，沒有 force push 或重新寫歷史。`s3-upload-receipt.json` 核對遠端大小、SHA-256；`s3-restore-receipt.json` 確認從 S3 重新下載後逐檔還原。密碼、JWT、私有帳號 DB 不在清單中。

封存保留完整原始成功／失敗 logs、已執行腳本快照、37 名 before／after project、不可變投稿與版本控制資料、逐份比較及驗收文字。這些是固定歷史證據；可維護的解析／轉換程式、原始英雄與技能設定仍在主樹 Git 中。

使用既有 `materials/community-hero-forge/restore.py --manifest-dir <此目錄> --download --parts-dir <新的外部快取> --output <新的還原目錄>`。manifest 含精確原始相對路徑，可與 [37 名封包封存](../release-13956d93b/README.md) 合併還原。不能從「封存中存在」推論素材已在正式網站逐檔提供；網站資源另依既有 `assets/<sha>/` 機制處理。

目前證明的是隔離服務流程及證據完整性；正式上線、原作素材完整還原及實機 FPS 沒有在此宣稱完成。
