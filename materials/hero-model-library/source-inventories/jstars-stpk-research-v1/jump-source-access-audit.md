# JUMP FORCE／J-Stars 來源盤點收據

本批以固定 Windows inventory、JUMP FORCE PAK 索引及中央來源表交叉核對。這份收據不把歷史 metadata 或容器路徑當成本批重新讀取。

## 即時存取

- `/Volumes/common`：未掛載
- `/Volumes/game`：未掛載
- 因兩個 mount 均未掛載，本批沒有重新讀取 owner JUMP FORCE PAK 或 PSV ROM payload，也沒有產生新的 owner 檔案 SHA。

## 已有 JUMP FORCE 證據

- Steam App 816020，build 8523149；歷史掃描 3,466 檔、23,856,777,652 bytes、240 個素材容器候選。
- 六個加密 PAK 已有逐檔 SHA 與解密索引；共 221,877 unique paths。索引不等於全部素材已擷取或轉換。
- 既有小呆 chr0430 模型／貼圖、Streaming AWB 解碼與公開音訊批次沿用中央來源記錄；本批不重複下載。

- 公開音訊目錄已由五個不可變交付批次核對為 58 個不同原包；逐段說話者、語言、事件與聽審仍待完成。

## 本批 J-Stars 推進

- 新增原生 ID 000、013、014、018 的 PAK／RAM-dumped STPK 對照研究樣本。
- 12 個 STPK 已通過 table/bounds 檢查並安全拆分；輸出仍為 SRD／SRDI／SRDV，不是 GLB。
- `$CLH` 的 `$CH0` 階段、PS3 幾何配置及貼圖 swizzle 仍缺少本機已驗證轉換器；模型、骨架、動作、VFX、音訊、視覺驗收、英雄綁定與後台選項皆為未完成。

## owner ROM 缺口

- `E:\Game\單機遊戲\模擬器\PSV\J-STARS Victory VS (PCSE00595) (NTSC).7z`：1,755,203,440 bytes；目前只有 inventory metadata，`contentHash=null`、`contentInspected=false`。
- `E:\Game\單機遊戲\模擬器\PSV\J-STARS Victory VS+ [PCSE00595] (v01.00) .vpk`：1,523,427,255 bytes；目前只有 inventory metadata，`contentHash=null`、`contentInspected=false`。

完整機器可讀證據見同目錄 `jump-source-access-audit.json`。
