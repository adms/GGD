# 37 英雄固定版本材料

37 名／222 槽在同版隔離服務完成重建、投稿、核准發布、普通對局、重連、結算與固定重播。Main 已將程式修正落地 `6efdd3bfb`。這份收據只證明投稿流程；37 名原設計機制仍未完成，見 [#1132](https://github.com/adms/GGD/issues/1132)。布局、電力、線索仍有錯配，禁止據此宣稱正式交付。

`version-index.json` 保留每名指定名稱、來源設定、目前封包／原文摘要、生成器／服務版本，以及精確 S3 成員路徑。37 份可維護原始配方仍在 `materials/community-hero-forge/recipes/`，模型綁定與轉換程式仍在 `tools/community-hero-forge/`。完整執行期快照是部署與驗收封存，不是另一套可編輯來源。

此處只保留 manifest、S3 位置、版本索引與傳輸／還原收據。原 ZIP、圖示載荷、重播、歷史版本庫素材：6 分段、200,332,478 bytes，2,202 檔。以指定 `vibe-coding` profile 實際上傳並全新下載核對，舊物件未覆寫。

原還原收據記錄的 2,445 份版本庫 JSON 已移至 [證據封存](../release-evidence-c2487661f/README.md)。重組完整 4,534 檔版本庫時，從證據封存取出 `materials/community-hero-forge/supplements/release-13956d93b/control/`，把其內容複製到本封存還原目錄。兩份封存與收據均保留，不刪除歷史。

使用既有 `materials/community-hero-forge/restore.py --manifest-dir <此目錄> --download --parts-dir <新的外部快取> --output <新的還原目錄>`。這是管理者材料還原，不是玩家投稿 UI。正式部署後仍須依實際服務目標重建並正式投稿。
