# 資源庫文字來源快照

本目錄保留封存當時資源庫的 156 份工具、規則、索引、JSON 資源定義及說明，合計 1,090,722 bytes。source-manifest.json 逐檔保存原始 SHA-256；來源以原工作區相對結構保存，未修改原本工作庫。

2026-09-08 已協調由「建立GGD角色素材候選庫」任務統一維護共用素材庫規則、索引及解析／轉換程式。本目錄是歷史快照，不再同步演進；內部的 `pending user choice` 等文字僅代表封存當時狀態，保留原始位元組與雜湊。

已確認的分工：原始模型、動畫與大型原生解析 JSON 以 S3 為主要存放位置；解析／轉換程式、英雄與技能設定 JSON、版本清單、SHA-256 及文件由 Git 管理。必要的設定與文件仍可隨 S3 成品發布。`legacy/` 仍僅供備份及人工許可取用；存放完成不代表已通過 GGD 匯入、骨架重綁或視覺驗收。

維護中的 Git 來源已推送至 [PR #1119](https://github.com/adms/GGD/pull/1119)，分支 `codex/asset-library-management`，固定提交為 `3a0c3bf7ebf19bd63c7932bc65bb35b64158a61d`。[管理目錄](https://github.com/adms/GGD/tree/3a0c3bf7ebf19bd63c7932bc65bb35b64158a61d/materials/asset-library) 為 `materials/asset-library/`，來源鏡像為 `materials/asset-library/source/`，共 620 份來源。已從 GitHub 核對固定提交的清單、原生解析程式 SHA-256 與已確認的存放規則；不再是僅本機提交。PR 尚未合併，CI 與審查結果以該 PR 為準。此來源包含 `outputs/game-asset-library-20260907/tools/index_300_models.py`、轉換程式、所需的本機 C 來源及相依說明；完整轉換仍需要文件列出的外部執行環境。

37 名英雄配方與工作流、此歷史快照及素材補漏收據繼續由 PR #1118 維護；共用素材庫內的配方副本只作來源快照，避免兩邊分別修改同一份設計。

包含 ASSET_LIBRARIES.md、GGD-Asset-Library 的發布／備份／驗證／查詢工具、正式與備份規則、目前入庫定義及原候選庫查詢工具。實際模型、動作、音效及貼圖由 S3 保存；本目錄沒有二進位素材。

這是固定來源快照，不將複製進來的檔案當作已安裝的完整素材庫。工具原本以 GGD-Asset-Library 為工作根；使用時將此相對結構放到自己的工作區，依固定 S3 入口取得資源，再讀取工具說明。保留既有人工許可備份規則；不因來源已在 Git 就自動匯入原始素材。歷史大批備份的逐檔索引、原始回執仍位於既有 S3 快照，並非每份歷史 JSON 都複製進這份目前來源快照。
