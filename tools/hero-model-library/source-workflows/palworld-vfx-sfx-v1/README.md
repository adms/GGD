# Palworld 三名技能 VFX／SFX 工作流

這個工作流只讀處理使用者擁有的 Windows Steam Palworld 安裝，或已由使用者合法解包的目錄。它將空渦龍 `JetDragon`、枯星龍 `WorldTreeDragon`、搗蛋貓 `PinkCat` 的技能代碼與 package 路徑、UE 依賴及 Wwise 候選建立關係；不從動作名猜出不存在的 VFX，也不把一般叫聲綁成技能音效。

Windows 容器盤點：

```powershell
powershell -ExecutionPolicy Bypass -File .\scan_palworld_packages.ps1
```

腳本只雜湊 `.pak/.utoc/.ucas/.sig`。如果 PATH 內已有 `UnrealPak.exe`，才會額外執行標準 `-List`；失敗輸出仍保留供判斷版本或容器限制。腳本不找 AES key、不繞過加密、不修改遊戲。

已有解包目錄或 package list 時：

```sh
python3 scan_extracted_assets.py --root /path/to/extracted/Pal --out scan.json
python3 scan_extracted_assets.py --package-list package-list.txt --out scan.json
```

掃描結果只有 candidate 層級。要升級為成品，仍須：

1. 解析 Blueprint／Niagara／材質／貼圖或 Wwise bank-event-media 的完整依賴。
2. VFX 轉成 GGD 現行文件與 256px 貼圖限制並做瀏覽器視覺驗收。
3. 音訊保留原容器與母檔，再產生遊戲格式；逐項聽審核准前 `runtimeBinding=false`。
4. 更新來源、轉換參數、工具版本、逐檔 SHA-256、Git/S3 位置與讀回收據。

中央索引重建與檢查：

```sh
python3 tools/hero-model-library/source-workflows/palworld-vfx-sfx-v1/build_inventory.py
python3 tools/hero-model-library/source-workflows/palworld-vfx-sfx-v1/build_inventory.py --check
python3 -m unittest discover -s tools/hero-model-library/source-workflows/palworld-vfx-sfx-v1 -p 'test_*.py'
```
