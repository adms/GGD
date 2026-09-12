# Fate/unlimited codes 來源工作流交付

此工作流主責 PSP 原生模型、骨架、動作、特效、聲效與語音。PS2 分開歸檔。已下載 MOD 與語音包為可用補充；**目前仍未取得 PSP 完整原生 FPK/GMO 庫，不能宣稱全素材擷取完成**。

本批五個原包均已完成安全解包與驗證，來源資料夾已凍結；沒有背景 Fate 下載仍在執行。

查詢最新不可變快照 `handoff-*.json`；`/private/tmp/ggd-fate-unlimited-codes-report.json` 是便於主流程讀取的最新報告副本。各來源只有 `files.sha256.json` 標記 `complete-frozen` 後才可當作本機交付。凍結來源不覆寫；後續版本另建來源目錄。

| 來源 | 平台證據 | 實際材料與用途 |
| --- | --- | --- |
| GameBanana 493444 Zero Lancer | 作者未指明 PSP／PS2；PC BRC MOD | 原 7z／UnityFS 包、1 mesh、59 關節 MOD 骨架、P1／P2 兩款內嵌貼圖 GLB、13 PCM WAV。0 動作／0 VFX，仍待 GGD 驗收。 |
| Sprite Database 4521 Archer | PS2 | 完整 RAR、180 原 PCM WAV；115 VOICE_ 標籤、65 DATA_ 待分類。 |
| Sprite Database 4520 Shirou | PS2 | 完整 RAR、222 PCM WAV；169 VOICE_ 標籤、53 DATA_ 待分類。 |
| Sprite Database 4522 Saber | PS2 | 完整 RAR、251 PCM WAV；138 VOICE_ 標籤、113 DATA_ 待分類。 |
| GameBanana 62195 Fate BGM | 原作平台未確認；PC DNF Duel MOD | 完整 ZIP、PAK/SIG、104 Unreal native 檔、30 OGG 音樂流及對應 PCM16 WAV；音樂不得作為角色語音。 |
| Fate-AI-HD-Team/UnlimitedCodes-HD | PSP USA／Europe | 701 檔完整 tree metadata／640 MB 類型清單；大 ZIP／Git transport 中斷。現存部分 ZIP 不可使用，未列作已取得完整貼圖包。 |

模型與語音查詢入口分別為各來源的 `candidate-manifest.json`、`audioFileIndex.json`。檔案索引以來源 `localRoot` 為根，`files[].path` 為相對路径，附 bytes／SHA-256；音訊附 seconds。語音身份與 DATA_ 分類未人工逐段核對；不得把技術解碼成功等同語音合成已就緒。模型候選尚未寫入後台預設；主流程負責中央索引／Git／S3，其他工作流可以先讀已凍結本機路徑。

所有原包、解包組件及標準化產物均保留。原遊戲與 MOD 來源分開標示，MOD 骨架不冒認原始 PSP 骨架。Source 原始 VOICE_ 名稱與作者角色名稱只作來源標籤，不冒認人工聲紋確認。作者說明及限制記錄在各 source metadata，不推定額外權利。

## PSP 原生素材缺口

本機只掃描素材目錄與 outputs 共 414,648 檔，没有找到 Fate ISO/CSO/FPK/GMO；唯一 ISO 是 MBA，未引用。PSP Saber 模型站／Sketchfab Rider2 等正常入口回覆 403 即停止。Sakai Caster 作者公開三入口都轉入同一 Linkvertise 頁，尚未取得作者原檔。ZenHax 8190 曾分享 FPK sample，但目前存檔沒有附件。fuc-recomp 明確不含遊戲素材，因此不列作資產來源。

已保留 [FPKCodes 作者原始碼](https://github.com/shadow-nero/FPKCodes)，固定 commit `2b18af9390ca80eddee47ab7c4affbaf82a873c8`。`tooling/extract_fate_fpk.py` 可先做只讀目錄解析，選擇 `--extract-to` 才解包；不重打包、不修改 EBOOT、不處理 DRM。PRS 分支、拒絕錯誤參照／截斷／路徑穿越的 8 項合成檢查通過，**沒有真正 Fate FPK 的轉換驗證**。取得合法原生來源後先保留全包、再分類實際 mesh／animation／VFX／audio，不按檔名直接升級可用狀態。衍生程式沿用 FPKCodes GPL-3.0，發佈時一併保留 `FPKCodes-LICENSE` 與原始碼署名。

## 可恢復處理

使用 `/private/tmp/ggd-public-model-venv/bin/python -P`；`-P` 避免 `/private/tmp/inspect.py` 蓋掉 Python 標準函式庫。解包／Unity 轉換依賴既有 `GGD-hero-model-options/tools/hero-model-library/` 程式與 UnityPy 1.25.3，FFmpeg 為 `/usr/local/bin/ffmpeg`。

- `tooling/ggd-fuc-resume-public-downloads.py`：只續傳已授權 Saber／Shirou PS2 包，最多兩個下載；先檢查 lsof 防止原下載仍在寫同檔。403／登入或其他明確 HTTP 拒絕即停止，不更換憑證或繞限制。
- `tooling/ggd-fuc-process-ps2-audio.py archer|shirou|saber`：完整包大小／SHA 經 acquisition 確認後，安全解包與逐檔 PCM frame＋FFmpeg 完整解碼，產生不可變檔案／音訊索引；已凍結即拒絕覆寫。
- `tooling/ggd-fuc-download-hd-tree.py --limit 64`：以正常公開作者 raw URL 先取有界素材子集；`--all` 才取完整 701 檔。各檔比對 Git blob SHA-1 與大小，完成後記錄 SHA-256；大小寫衝突各自保留。此續傳腳本只完成語法及 701 個安全實體路径驗證，本輪未執行下載。
- `tooling/ggd-fuc-build-handoff.py`：產生新的不可變快照，保留舊快照；主流程依完成標記整合。

凍結資料夾勿再執行 Zero Lancer/BGM 轉換腳本，除非另建新 intake。這些脚本僅作可重現原始碼交付。沒有執行下載遊戲／MOD 程式，沒有改中央索引、預設、Git 或 S3。
