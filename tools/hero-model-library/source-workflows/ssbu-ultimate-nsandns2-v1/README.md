# Ultimate14／NSandNS2 只讀核對工具

共享證據在 [reconciliation.json](../../../../materials/hero-model-library/priority-evidence/ssbu-ultimate-nsandns2-20260914/reconciliation.json)。角色、配色、片段的權威來源仍是既有 `materials/hero-model-library/source-inventories/ultimate14-native-motions.json`；Windows 遠端檔案入口仍是 `windows-game-library.json.gz`。這個流程只建立精簡核對證據，不另建角色主清單。

Git checkout 內的最小驗證只需 Python 3 標準函式庫，不需本機原始素材：

```sh
python3 tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/publish_evidence.py --check
```

它核對兩個固定索引 SHA、16 名的各類路徑數、target／costume、NSP／ZIP 大小與 metadata-only 狀態，以及 README 與精簡 JSON 的一致性。`reconciliation.json → sourceStageCounts` 是中央機器讀入口，分開記錄 Ultimate14 MOD、Worldblender body 候選與 NSandNS2 遊戲容器；NSandNS2 payload 未讀取時，角色、模型、動作、轉換、驗收與後台選項必須維持 0。

完整本機重新核對要顯式提供素材 workspace，輸出只能是 Git checkout 外的一個**新目錄**：

```sh
python3 tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/audit_local_source.py \
  --workspace '/absolute/path/to/ABxVFX_EDIT' \
  --output-dir '/absolute/path/to/ABxVFX_EDIT/GGD-Asset-Library/intake/new-ultimate-audit'
```

它重新 SHA 驗證 Ultimate14 原包與既有 manifest 中 1,071 個檔案、比對435個NUANMB aliases，讀取已保存的 Windows inventory ZIP 和5個成員，核對128個Worldblender body候選的存在及大小。這個掃描步驟本身不重算128個body的SHA、不做轉換、不讀遠端ROM payload；已選 c00 的後續標準化由下方獨立流程記錄。新目錄內的完整報告、大型逐檔 JSON 留作本機及 legacy 備份材料。

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

Worldblender c00 的固定轉換先以 `ssbu-models-v1/convert_blend_component.py` 透過 Blender 4.5.13 匯出，再依角色使用減面、同渲染狀態合併與 256px atlas，最後跑 Khronos、GGD 預算、finite accessor、雙重建 SHA 及 WebGL 三視圖。卡比使用獨立整合器；後續三角批次使用 `run_worldblender_c00_batch*.py`、`freeze_worldblender_c00_batch*.py` 及對應 `integrate_worldblender_c00_batch*.py`，把成品、S3 收據與來源關係寫回固定索引。卡比入口如下：

```sh
python3 tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/integrate_kirby_c00.py \
  --final-root '/absolute/path/to/GGD-Asset-Library/conversions/ssbu-kirby-c00-blender4513-v1' \
  --rebuild-root '/absolute/path/to/GGD-Asset-Library/rebuilds/ssbu-kirby-c00-rebuild-v1' \
  --write
python3 tools/hero-model-library/build_model_design_backlog.py --workspace ..
```

目前有 10 個唯一 c00 來源槽完成靜態蒙皮元件驗收：Kirby、Mario、Link、Sonic、Chrom、Ganondorf、Lucina、Daisy、Peach、Toon Link；同一來源槽的修訂版都保留但不重複計數。Mario、Link、Sonic、Chrom、Ganondorf、Lucina、Daisy、Peach 與 Toon Link 已重建為黑底修復版：來源的眼睛雙貼圖／雙 UV Mix 烘焙為不透明 Base Color，並通過 alpha audit、Khronos、兩次位元組一致重建與 WebGL 三視圖；Kirby 的來源貼圖全不透明，不需此修正。Sonic 另由固定 material-weighted 流程從 8,980 面減至 7,900 面，兩次輸出 SHA 相同，三視圖 A/B 變化像素 0.85%～1.41%，正式採用幾何門檻與視覺元件驗收均通過；舊 8,980 面版本完整保留。所有 c00 元件仍是 0 動作；Sonic 沒有對應 GGD 英雄定義，未杜撰綁定，後台選項與部署仍為 0。其餘 118 份 body 仍只有存在與大小證據。Toon Link 的表情 eyelid 排除已列為表情缺口，不能把結構通過寫成原作 shader 完整。

Sonic 正式減面可重建與凍結入口：

```sh
python3 tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/run_sonic_formal_decimation.py \
  --asset-root '../GGD-Asset-Library'
python3 tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/integrate_sonic_formal_decimation.py \
  --asset-root '../GGD-Asset-Library'
```

JUMP FORCE／J-STARS、KOF、Fate/unlimited codes 與 NSandNS2 的10筆優先來源存取快照可重建及核對：

```sh
python3 tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/audit_priority_game_sources.py --write
python3 tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/audit_priority_game_sources.py
```

共享收據位於 `materials/hero-model-library/priority-evidence/priority-game-sources-20260914/source-access.json`；目前 common 3筆、game 7筆都因分享未掛載受阻，既有清單仍是0 payload bytes read、0解包、0轉換、0登記。

工具不連 S3、不下載、不建立 GGD 英雄 ID、不註冊後台選項、不提交或推送 Git。來源快照存在不代表已擷取、驗收、可切換或已部署。
