# S3 素材與 Git 管理資料核對

本次範圍為固定資源庫已登記的四批來源、intake／staging、ready 素材及社群英雄交付目錄；不把整台 Mac 或其他 AI 訓練工作區宣稱為已備份。

- 來源區 233,280 檔逐檔重新計算 SHA-256：233,273 檔一致；差異只有 7 份修正 legacy 路徑的文件／腳本。沒有新增或遺漏素材。
- 社群英雄交付目錄的 14,554 份模型、圖片、音效、影片及 ZIP，全部與其 S3 封存清單雜湊一致。該封存位於 bucket 的 community-hero-forge/，與 legacy/ 備份共同覆蓋現有交付材料。
- ready 內 12 份實體貼圖（含舊版本副本）都由目前正式 S3 版本內容覆蓋。
- 原始備份上傳時全部分段讀回比对 SHA-256；本次重驗 S3 清單、15 份逐檔索引雜湊與全部分段大小，沒有再下載 47.7 GiB 的全部分段。
- 另有 3 份可重建的 Platform 測試執行檔未封裝；它們不是模型、動作、音效或特效，排除原因見報告。

## 存放責任

素材、原始下載、半成品與封存放 S3，本機保留。管理腳本、索引、配方、GGD 定義 JSON 與文件由 Git 保管；S3 必要的 runtime JSON／查詢索引仍可隨成品發布。原生格式解析輸出的約 3.9 萬份 JSON 目前隨素材備份，與管理資料分開記錄，不聲稱已全部進 Git。

備份只能在人工明確許可後取用。禁止其他工作流自動取用 legacy/。

機器證據：[storage-completeness.json](backups/storage-completeness.json)、[逐檔來源核對](backups/current-coverage-audit.json)、[S3 核對](backups/current-s3-presence-audit.json)、[社群素材核對](backups/community-asset-coverage-audit.json)。
