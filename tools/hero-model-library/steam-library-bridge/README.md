# Steam 遠端唯讀素材庫

當 Steam 遊戲庫分散在多顆 Windows 硬碟時，每個 `steamapps` 以獨立 SMB share 提供給同一局域網的素材處理 Mac。來源端權限為唯讀；Mac 先建立遊戲與版本清單，有需要時才將指定遊戲複製到 `GGD-Asset-Library/intake/`。

Windows 上將這個資料夾複製過去後，雙擊 `launch_steam_bridge_gui.cmd`。啟動器會開啟 `steam_bridge_gui.ps1`，Windows 顯示 UAC 時按「是」。GUI 可以自動掃描或手動新增 SteamLibrary，勾選後套用唯讀分享；取消勾選再套用會只停用對應 share，不會刪除資料夾或遊戲檔。畫面會顯示當前 SMB 連線、開啟檔案、網卡即時速率、中央已掃描／已擷取／已登記數量與 JSONL 歷史。遊戲 share 是唯讀；`GGDSteamStatus` 只存放 Mac 回寫的小型 `usage.json`。

如果只需要無 GUI 設定，以系統管理員 PowerShell 執行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\setup_windows_steam_shares.ps1
```

腳本自動讀 Steam 安裝路徑與 `libraryfolders.vdf`，建立 `GGDSteam01`、`GGDSteam02` 等唯讀、SMB 加密 share。Windows 防火牆只允許 Private 網路的 `LocalSubnet` 連入 TCP 445。產生的 `GGD-Steam-Shares.json` 在桌面，保留實際磁碟、share 與 UNC 對應。

Mac 上在 Finder 按 `Cmd-K`，依收據連線 `smb://<Windows-IP>/GGDSteam01` 等 share，用 Windows 帳號登入並將密碼保存到 Keychain。不要把密碼寫進 Git、聊天或清單。

四個 share 掛載到 `/Volumes/GGDSteam01` 等路徑後，只建清單：

```bash
python3 tools/hero-model-library/steam-library-bridge/scan_mounted_steam.py \
  --mount /Volumes/GGDSteam01 \
  --mount /Volumes/GGDSteam02 \
  --mount /Volumes/GGDSteam03 \
  --mount /Volumes/GGDSteam04 \
  --output GGD-Asset-Library/intake/remote-steam/library-index.json \
  --usage-output /Volumes/GGDSteamStatus/usage.json
```

相同 App ID 的多個安裝會保留為獨立記錄並標示 `duplicateInstall=true`；不會因去重而遺失來源硬碟或 build ID。

若 macOS 應用程式隔離不允許直接遍歷 SMB 卷宗，改在 Windows PowerShell 直接掃本機路徑，不需把 SMB 密碼交給整合工作流：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scan_windows_game_inventory.ps1 `
  -SteamRoot 'F:\SteamLibrary\steamapps\common' `
  -GameRoot 'E:\Game\單機遊戲'
```

產生的 ZIP 只含 Steam 目錄、appmanifest、遊戲目錄、ROM／封裝候選與掃描收據，不讀 ROM／PAK 內容。交付 ZIP 後用 `build_windows_game_inventory.py` 正規化；Git 的 `materials/hero-model-library/source-inventories/windows-game-library.json` 是共編查詢入口，原始 CSV 與 ZIP 留在本機素材庫及待辦 S3 `legacy/` 備份。

目前索引內的 `sourceCoverage` 是實際掃描範圍，不以使用者口述或掛載名稱補數。2026-09-12 第一份收據只涵蓋 `F:\SteamLibrary\steamapps\common` 與 `E:\Game\單機遊戲`；Palworld 本體與 Dedicated Server 已分開建檔，但其他三顆 Steam 硬碟仍要由下方第二階段自動發現掃描補齊。

第一次清單只證明遊戲／ROM 入口存在。要徹查每個遊戲使用哪種素材容器，再執行第二階段的唯讀 metadata 掃描：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scan_windows_asset_containers.ps1 `
  -GameRoot 'E:\Game\單機遊戲'
```

腳本預設從 Steam Registry 與 `libraryfolders.vdf` 自動發現分散在四顆硬碟的所有 SteamLibrary；找不到時才需要用 `-SteamRoots @('F:\SteamLibrary\steamapps\common', ...)` 手動指定。它會輸出每個遊戲的檔案數、總大小、前 25 種副檔名、引擎線索，以及 `.pak/.utoc/.ucas/.uasset`、Unity、Wwise、FMOD、CRIWARE、模型和動作候選的逐檔路徑與大小。它不讀取容器內容、不計大檔雜湊、不複製遊戲，也不變更分享權限；`payloadBytesRead=0`。交付 `GGD-Asset-Container-Inventory-*.zip` 後，整合工作流才能把 Palworld 本體與其他遊戲從「已安裝」提升為「容器已盤點」，再按角色需求選擇性複製和解包。

解壓回傳 ZIP 後，以原始第一階段索引為輸入合併；Git 只保存逐遊戲摘要，完整逐檔候選保留為本機壓縮 JSONL，連同原始 ZIP／CSV 進 S3 `legacy/`：

```sh
python3 tools/hero-model-library/steam-library-bridge/merge_windows_asset_container_inventory.py \
  --base-json materials/hero-model-library/source-inventories/windows-game-library.json \
  --scan-dir <解壓後目錄> \
  --source-zip <GGD-Asset-Container-Inventory-*.zip> \
  --local-output <GGD-Asset-Library/intake/remote-game-libraries/current> \
  --git-json materials/hero-model-library/source-inventories/windows-game-library.json \
  --git-markdown materials/hero-model-library/source-inventories/windows-game-library.md
```

合併器依 Steam App ID 與完整安裝路徑對應多硬碟重複安裝；逐檔資料寫入 `asset-container-files.jsonl.gz`，不塞進 Git 摘要。若尚未完成 S3 備份，`s3Backup` 保持空值，不能把預定位置寫成已上傳。

《Infinity Strash》優先來源可使用 `RUN_INFINITY_STRASH_PROBE.cmd`。它固定從 `F:\SteamLibrary\steamapps\common\Strash` 唯讀雜湊 Unreal 容器、量實際讀取速度；同資料夾、桌面或 Downloads 若有官方 `umodel.exe`，另以 `-list *.uasset` 產生 package 清單，不匯出或複製遊戲內容。用 `build_infinity_strash_probe_bundle.py` 可重建給 Windows 使用的小型 ZIP。探測結果只提升到「容器已雜湊／package 已列舉」，仍不能算角色已擷取、身份已確認、已轉換或已上架。
