> 原始素材／半成品另備份於 `s3://ggd-390630837668-ap-east-2-an/legacy/ggd-asset-library/`；僅限備份或人工明確許可使用，其他程序不得自動取用。

> 本頁為本機來源／候選資料。已標準化共享成品的固定入口：`s3://ggd-390630837668-ap-east-2-an/GGD-Asset-Library/`，以其中 current.json／catalog.json 為準。

# 本機 LoL 模型與英雄工坊驗收素材

原始擷取、251 段轉換結果、42 段裁剪結果、精簡候選及實際姿態比較均保留。最新遊戲用候選在 `ggd-runtime-candidate/`；七位合計 14,132,584 bytes。

`forge-preview/` 保留七份 model 文件、14 張原生待機／Q 施法 JPEG、後台核准三態往返、程式版本與原始測試紀錄。完整說明及隔離治具啟動方式見該目錄的 README。

本備份沒有 `node_modules`。重跑 optimizer 須先依 `optimizer/package-lock.json` 安裝依賴；不要把缺少依賴的失敗當成模型比較通過。LoL 原始 bytes 未放入 GGD 出貨素材清單。

`files.json` 只涵蓋本素材備份樹，與 Git repo 的報告索引各自計算。
