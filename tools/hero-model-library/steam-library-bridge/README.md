# Steam 遠端唯讀素材庫

當 Steam 遊戲庫分散在多顆 Windows 硬碟時，每個 `steamapps` 以獨立 SMB share 提供給同一局域網的素材處理 Mac。來源端權限為唯讀；Mac 先建立遊戲與版本清單，有需要時才將指定遊戲複製到 `GGD-Asset-Library/intake/`。

Windows 上將這個資料夾複製過去後，雙擊 `launch_steam_bridge_gui.cmd`。啟動器會開啟 `steam_bridge_gui.ps1`，Windows 顯示 UAC 時按「是」。GUI 可以自動掃描或手動新增 SteamLibrary，勾選後套用唯讀分享，並顯示當前 SMB 連線、開啟檔案、網卡即時速率、中央已掃描／已擷取／已登記數量與 JSONL 歷史。遊戲 share 是唯讀；`GGDSteamStatus` 只存放 Mac 回寫的小型 `usage.json`。

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
