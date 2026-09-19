# J-Stars RPCS3 記憶體擷取管線

此管線處理 `$CH0` 解壓器缺口：讓 RPCS3 載入遊戲與指定角色後，透過 RPCS3 內建 PINE IPC 的唯讀 opcode 擷取 PS3 客體記憶體，再從記憶體中切出通過 STPK table／bounds 驗證的容器。它不讀取其他程序的 macOS 主機記憶體，不需要 Codex 的「完整磁碟取用」，也不寫入遊戲記憶體。

優先角色固定為：017 小傑、041 鵺野鳴介／神眉、037 幸運超人、012 飛影。既有 1,596 段已解碼音訊不會重跑。

## 準備

1. RPCS3 官方 macOS arm64 包必須完整符合 `build_inventory.py` 內的固定 bytes／SHA-256。
2. 唯讀掛載的 `/Volumes/PS3VOLUME` 提供 `EBOOT.BIN`、`PARAM.SFO` 與光碟內 `PS3UPDAT.PUP`；三者都會逐檔驗證。

掛載存在時先把三項啟動輸入留底並讀回驗證，之後不依賴掛載持續存在：

```bash
python3 tools/hero-model-library/source-workflows/jstars-rpcs3-memory-capture-v1/preserve_boot_inputs.py
```
3. RPCS3 的 macOS `~/Library/Application Support/rpcs3/ipc.yml` 設定：

```yaml
IPC Server enabled: true
IPC Port: 28012
```

可由腳本保存舊檔後設定；macOS 使用本機 Unix domain socket，不開對外網路埠：

```bash
python3 tools/hero-model-library/source-workflows/jstars-rpcs3-memory-capture-v1/configure_ipc.py
```

4. 先安裝光碟內 4.70 firmware，再啟動 `/Volumes/PS3VOLUME/PS3_GAME/USRDIR/EBOOT.BIN`。本次固定 build 的 `--help` 雖同時列出 `--headless` 與 `--installfw`，實測組合後在安裝檔案後發生 teardown error；因此後續只在 firmware 未驗證時使用 `--installfw` 的 GUI 確認流程，不重跑 headless 安裝。

RPCS3 套件完成後由固定 SHA 的腳本解包：

```bash
python3 tools/hero-model-library/source-workflows/jstars-rpcs3-memory-capture-v1/setup_rpcs3.py
```

腳本拒絕不完整或不同版本的壓縮包、拒絕覆蓋既有輸出，並保存解包工具、版本探測與檔案總數收據。
若只需依現有固定解包結果重新探測 CLI 並更新收據，使用 `setup_rpcs3.py --refresh-receipt`；這不會重新解壓或覆蓋 RPCS3.app。

解包收據會產生完整 argv；安裝與啟動命令為：

```bash
"<RPCS3.app>/Contents/MacOS/rpcs3" --installfw \
  "../GGD-Asset-Library/intake/owner-jstars-victory-vs-plus-20260917/boot-inputs/PS3_UPDATE/PS3UPDAT.PUP"
"<RPCS3.app>/Contents/MacOS/rpcs3" --no-gui \
  "/Volumes/PS3VOLUME/PS3_GAME/USRDIR/EBOOT.BIN"
```

戰鬥場景需要畫面操作，啟動遊戲使用 `--no-gui`。PINE 設定的邏輯 port 是 `28012`，macOS 實際讀取 `$TMPDIR/rpcs3.sock`，不對外開 TCP port。安裝後用下列命令驗證 `release:04.7000`、firmware 檔案樹與 IPC 設定：

```bash
python3 tools/hero-model-library/source-workflows/jstars-rpcs3-memory-capture-v1/verify_runtime.py
```

## 每角擷取

角色在戰鬥場景完整載入後，每角用獨立輸出目錄執行：

```bash
python3 tools/hero-model-library/source-workflows/jstars-rpcs3-memory-capture-v1/pine_dump.py \
  --character-native-id 017 \
  --output "../GGD-Asset-Library/conversions/jstars-rpcs3-memory-capture-v1/017-gon-YYYYMMDD-HHMMSS"
```

腳本會先詢問 RPCS3 的 title ID；不是 `BLUS31519` 就拒絕。預設讀取 `0x00010000:0x10000000`，以零保留不可讀區段，輸出原始記憶體檔、逐檔 SHA-256、失敗區段、table-valid STPK，以及依 STPK table 安全拆出的 SRD／SRDI／SRDV 等原生成員。後續仍需把這些原生成員轉成 GLB、驗收並註冊，不能把記憶體擷取寫成已上架。

2026-09-19 實機 title-screen baseline 已通過 PINE 確認 `J-STARS Victory VS+ / BLUS31519 / 01.00`，並保存 268,369,920-byte 客體記憶體檔。該畫面收據為 0 STPK，因此不可當成四角擷取；完整 62,592 筆未映射 page 明細只留在 `GGD-Asset-Library` 本機收據，Git 索引只收摘要、雜湊與絕對路徑。目前唯一 runtime 輸入缺口是在遊戲中逐一載入 017／041／037／012，再生成有 `characterNativeId` 的獨立收據。

## 更新收據與測試

```bash
python3 tools/hero-model-library/source-workflows/jstars-rpcs3-memory-capture-v1/build_inventory.py
python3 tools/hero-model-library/source-workflows/jstars-rpcs3-memory-capture-v1/build_inventory.py --check
python3 -m unittest \
  tools/hero-model-library/source-workflows/jstars-rpcs3-memory-capture-v1/test_pine_dump.py \
  tools/hero-model-library/source-workflows/jstars-rpcs3-memory-capture-v1/test_build_inventory.py
```
