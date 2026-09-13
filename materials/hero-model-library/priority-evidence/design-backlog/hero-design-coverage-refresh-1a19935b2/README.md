# 英雄設計覆蓋率刷新證據

本批以 Git commit `1a19935b2b46d2d11c4af0ce627c4ed11f6f0917` 的英雄定義與獨立技能檔重新執行既有分析器及中央待設計英雄索引產生器。

- `generation-receipt.json`：S3 分析封存時的輸入、指令、雜湊、計數與證據邊界；其 MD 輸出雜湊是修正文案前的版本。
- `s3-backup-receipt.json`：大型解析 JSON、前一版 compact 快照與本批 compact 輸出的 S3 `legacy/` 備份及完整讀回結果。
- `final-index-receipt.json`：修正產生器維護文案後，實際提交之中央 JSON／MD、產生器及維護說明的最終雜湊與語意差異檢查。

這批只更新英雄定義／技能覆蓋證據；不代表模型已取得、已轉換、已驗收、可切換或已部署。
