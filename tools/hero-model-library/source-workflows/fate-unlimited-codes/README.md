# Fate/unlimited codes 來源處理紀錄

這裡保留第一、二批實際使用的解析、轉換、驗證程式與 SHA-256，供其他工作流共編。它們是當批次的處理腳本，部分仍使用該批次本機／暫存絕對路徑；執行前先核對輸入、輸出及來源版本，不能當作通用下載命令直接重跑。程式、驗證控制紀錄及文件放 Git；完整原包、解析中間檔與尚未驗收的轉換候選保留本機，歸入 S3 legacy 備份。

查詢入口：`materials/hero-model-library/全角色模型盤點.md`、`角色語音索引.md`、`download-sources.json`。候選模型的標準 GLB 格式檢查不代表 GGD 動作綁定、畫面、下拉選單或執行時已驗收。這兩批 MOD 的 PSP／PS2 原始來源平台尚未證明，不能冒充 PSP 原生 FPK／GMO、原作動作或特效已取得。

FPKCodes 的原始授權與 README 一併保存在 first-batch；其程式的 FPK／PRS 格式路徑目前只有人工構造樣本驗證，尚未用真正 Fate PSP 原生包驗證。其餘腳本的原始位置和位元組雜湊見 files.sha256.json。
