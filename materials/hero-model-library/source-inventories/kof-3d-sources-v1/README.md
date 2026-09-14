# KOF 3D 來源實檔與轉換盤點

> 由 `build_inventory.py` 重建；盤點日：2026-09-14。不可手動改這份生成檔。

## 狀態定義

來源路徑已列出、檔案已擷取、GLB 已轉換、後台可選和正式站已部署是五個不同狀態。這份盤點不把 WAD 列檔、FBX 或備份收據寫成「已上架」。

## THE KING OF FIGHTERS XIV

- `assets.wad` 列檔：39,889 筆，17,869,428,992 bytes，80 個 `Chara/<ID>` 原生目錄。
- 已取得並逐檔重驗：MAI（不知火舞）、IOR（八神庵）、KYO（草薙京），1,088 檔，424,539,810 bytes。
- 逐檔 SHA-256：PASS。
- 模型／骨架／動作：18 個代表容器已固定檔頭、bytes、SHA 並以 Assimp 0/18 實際讀取；OBAC、OMIR、OSEC、OTRA 仍無可用 reader。Blender 5.2.1 background probe 在列舉 importer 前即崩潰（exit -11），所以沒有把 Blender 安裝當成已可轉換。
- 貼圖：已將 1P 根目錄的 14 張 COL DDS 轉為可重建的 256px PNG（1,878,218 bytes），S3 完整讀回與逐檔 SHA：PASS；它們是待材質映射與視覺驗收的獨立候選，不是模型成品。
- 音訊：474 個 OGG 已在既有交付中解碼驗證；逐段說話者、語言和事件綁定待聽審。
- 完整 WAD 當前沒有保留於 Mac 或已驗證 S3；其餘原生 ID 只有列檔資料，不計取得。

三個已取得 ID 的容器數：

| ID | 角色 | 檔案 | 模型容器 | 動作容器 | 貼圖 | VFX 容器/依賴 | 音訊/中繼資料 |
|---|---|---:|---:|---:|---:|---:|---:|
| `MAI` | 不知火舞 / Mai Shiranui | 369 | 47 | 9 | 116 | 54 | 157 |
| `IOR` | 八神庵 / Iori Yagami | 365 | 29 | 9 | 110 | 66 | 161 |
| `KYO` | 草薙京 / Kyo Kusanagi | 354 | 22 | 9 | 93 | 56 | 177 |

## THE KING OF FIGHTERS XV

- 中央索引已登記 11 個來源版本，角色為 Ash Crimson、八神庵和不知火舞。
- 本機找到 6 個索引指定的 GLB 實檔；後台已驗證可選為 0 個。
- Ash 四個全解析度 GLB 為左／右髮與材質修訂版，零原生遊戲動作，仍待 runtime 與視覺驗收。
- 新增兩個 Ash 預算候選：7,869／7,868 面，貼圖上限 256，258 joints；現行 guard 實跑均為 `over`：18 draw calls 超過警戒 3／硬上限 6，所以只是「已轉換的待解決候選」。
- 兩個候選的 S3 完整讀回：PASS。
- 8,575 面的首次超標輸出、7,869/7,868 面候選與 atlas 失敗 manifest 均已獨立備份到 S3 `legacy/conversion-stages/`，三筆都通過完整讀回與逐檔 SHA-256。
- 不知火舞與八神庵的原生 FBX 及貼圖已取得；Assimp 產物因外部貼圖 URI、材質映射和高面數而被拒絕，不是可上架 GLB。
- Ash 音訊：86 個 Float32 WAV 已轉為本機 MP3 審查候選並全檔解碼；逐段語言、說話者、類別與事件確認均為 0，沒有 runtime 綁定或部署。
- 沒有在 Windows Steam inventory 找到 KOF XV 安裝目錄，所以當前不是完整原作遊戲包盤點。

## KOF Maximum Impact 系列

- Windows inventory 符合遊戲名的實檔：0 筆。
- Maximum Impact、Maximum Impact 2、Regulation A 皆只有來源線索，沒有 ISO／遊戲目錄／逐檔 SHA／模型成品。
- `RetroGameLocalization` 是 PAK／PKLZ／貼圖工具線索；尚未對授權遊戲實檔驗證模型、骨架或動作轉換。

## KOF 2002 Unlimited Match（分開記錄）

- 這筆不計入 KOF 3D 模型總數。
- `voice.dat` 已抽出 2,687 個 RIFF/WAV，來源容器與 S3 讀回收據已在中央索引；角色、語言與事件綁定待聽審。

## 本批可機器驗證結論

- 有預期 SHA 的模型實檔：8 個，失敗 0 個。
- XIV 選定角色抽取檔逐檔 SHA：PASS。
- 後台可選模型：0 個。
- 正式部署驗證：未完成。

原始逐 ID 盤點及所有絕對路徑、SHA-256、來源版本、S3 收據和下拉狀態見同目錄 `inventory.json`。
