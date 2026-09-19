# J-Stars RPCS3 記憶體擷取準備收據

本收據由 `build_inventory.py` 產生。RPCS3 PINE 管線只讀取客體記憶體，限定 `BLUS31519`，不寫入遊戲記憶體。

- 優先角色：4（017 小傑、041 神眉、037 幸運超人、012 飛影）
- 已保存角色原始容器：356 檔
- ISO 啟動輸入驗證：通過
- RPCS3 套件：`verified`
- RPCS3 解包與 CLI 探測：通過
- Firmware 4.70 與 PINE 設定：通過
- 記憶體擷取收據：1
- 指定角色擷取收據：0
- 標題畫面 baseline：268,369,920 bytes，62,592 個未映射 4 KiB page，0 STPK；逐 page 明細只留本機收據。
- 模型／動作／特效轉換：0／0／0；目前不能寫成已上架。
- 既有 1,596 段優先角色音訊不重跑。

## 階段

| 階段 | 狀態 | 原因 |
|---|---|---|
| `source-preservation` | `complete` | — |
| `rpcs3-tool` | `complete` | — |
| `firmware-install` | `complete` | — |
| `character-load` | `pending` | runtime setup is complete, but each priority character must be selected and fully loaded before a tagged capture |
| `guest-memory-capture` | `pending` | title-screen baseline receipts=1; character-tagged receipts=0 |
| `stpk-srd-conversion` | `pending` | captured STPK/SRD members are not yet converted to runtime GLB |
| `runtime-registration` | `pending` | no validated model/motion/VFX output exists |

## 角色

| 原生 ID | 角色 | 原始容器 | 模型 | 動作 | 特效 |
|---|---|---:|---|---|---|
| `017` | 小傑·富力士 | 89 | 待 RPCS3 擷取轉換 | 待 RPCS3 擷取轉換 | 待 RPCS3 擷取轉換 |
| `041` | 鵺野鳴介／神眉 | 89 | 待 RPCS3 擷取轉換 | 待 RPCS3 擷取轉換 | 待 RPCS3 擷取轉換 |
| `037` | 幸運超人 | 89 | 待 RPCS3 擷取轉換 | 待 RPCS3 擷取轉換 | 待 RPCS3 擷取轉換 |
| `012` | 飛影 | 89 | 待 RPCS3 擷取轉換 | 待 RPCS3 擷取轉換 | 待 RPCS3 擷取轉換 |
