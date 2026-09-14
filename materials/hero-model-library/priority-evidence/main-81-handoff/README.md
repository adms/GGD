# 81 英雄合併驗證

Main 入口為 [81 英雄清單](../../81英雄優先合併清單.md) 與 [機器索引](../../priority-81-handoff.json)。此目錄只保留本次驗證證據；最新檢查讀 `validation.json`。

- `merge-resolution.json`：原81英雄預設不變，Main新增60個版本引用，雙方原版本均保留。
- `final-integrity.json`：實際 ModelVersions.verify、文件/GLB SHA、282版本、15手動與11加工預設。
- `registration-before-merge.json`：222版本的合併前快照，現況見上層 priority-registration.json。
- `audio/`：來源工作流凍結的音訊稽核，內容逐字保留；`audio-postmerge-check.json` 再核對目前工作樹的音訊與綁定。
- `merge-review.json`／`merge-review-evidence/`：JPEG MIME和動作索引修復的前後重現證據。
- `release-gates/`：完整提交前測試日誌，未刪除失敗記錄。

音訊稽核工具存於 `tools/hero-model-library/source-workflows/priority81-audio-audit/`。凍結收據中的本機 outputs 路徑指產生時的原始位置，本機仍保留；本目錄是同位元組的 Git 副本。已上架用的音訊以機器索引 `audio.mainCommittedFiles[].gitPath` 定位，儲備音訊仍以原本機絕對路徑讀取。原始收據的時間與來源身分標記不因搬入 Git 改寫。

使用者續指示：如月列車 taunt／victory 採 JR 山手線廣播與發車配樂；本次驗證時尚在取得，後續同 PR 追加，未計入上述 1,016 檔。
