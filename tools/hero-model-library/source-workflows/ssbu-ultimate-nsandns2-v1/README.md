# Ultimate14／NSandNS2 只讀核對工具

共享證據在 [reconciliation.json](../../../../materials/hero-model-library/priority-evidence/ssbu-ultimate-nsandns2-20260914/reconciliation.json)。角色、配色、片段的權威來源仍是既有 `materials/hero-model-library/source-inventories/ultimate14-native-motions.json`；Windows 遠端檔案入口仍是 `windows-game-library.json.gz`。這個流程只建立精簡核對證據，不另建角色主清單。

Git checkout 內的最小驗證只需 Python 3 標準函式庫，不需本機原始素材：

```sh
python3 tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/publish_evidence.py --check
```

它核對兩個固定索引 SHA、16 名的各類路徑數、target／costume、NSP／ZIP 大小與 metadata-only 狀態，以及 README 與精簡 JSON 的一致性。

完整本機重新核對要顯式提供素材 workspace，輸出只能是 Git checkout 外的一個**新目錄**：

```sh
python3 tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/audit_local_source.py \
  --workspace '/absolute/path/to/ABxVFX_EDIT' \
  --output-dir '/absolute/path/to/ABxVFX_EDIT/GGD-Asset-Library/intake/new-ultimate-audit'
```

它重新 SHA 驗證 Ultimate14 原包與既有 manifest 中 1,071 個檔案、比對435個NUANMB aliases，讀取已保存的 Windows inventory ZIP 和5個成員，核對128個Worldblender body候選的存在及大小。**不重新 SHA 這128個body，不做模型／動作轉換，不讀取遠端ROM payload。** 新目錄內的完整報告、大型逐檔 JSON 留作本機及 legacy 備份材料。

要更新共享證據，使用上述重跑產生的完整報告；不要只手改生成 README：

```sh
python3 tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/publish_evidence.py \
  --build-from '/absolute/path/to/new-ultimate-audit/reconciliation.json'
```

Windows helper 使用 UTF-8 BOM，兼顧 Windows PowerShell 5.1。它只讀既有 NSandNS2 目錄內 Smash 命名的頂層檔案，輸出至新的 Desktop 資料夾，不需修改來源、分享、ACL或登入設定：

```powershell
.\inspect_nsandns2_readonly.ps1
# 可選：只讀 ZIP central directory 與 NSP PFS0 表頭／檔案表
.\inspect_nsandns2_readonly.ps1 -InspectContainers
# 可選：額外完整讀取每個命中檔案計算 SHA-256
.\inspect_nsandns2_readonly.ps1 -InspectContainers -HashPayload
```

預設來源為 `E:\Game\單機遊戲\模擬器\NSandNS2`，可用 `-SourceRoot` 指定已獲授權的其他來源。表頭不是 PFS0 時只報 unknown，不解密；ZIP 不解包、不執行任何成員。Helper 已靜態審查，這次未在 Windows 執行。遇到權限問題照實回報，不改 ExecutionPolicy、分享或ACL來繞過。

工具不連 S3、不下載、不建立 GGD 英雄 ID、不註冊後台選項、不提交或推送 Git。來源快照存在不代表已擷取、驗收、可切換或已部署。
