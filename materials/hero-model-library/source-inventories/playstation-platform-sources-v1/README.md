# PlayStation 平台遊戲與素材來源盤點

> 由 `build_inventory.py` 生成；請不要只手改本檔。Fate/unlimited codes、J-Stars 與 Smash legacy 已有獨立批次，本頁不重複計入。

## Windows 遊戲容器（metadata only）

| 平台 | 清單列 | 邏輯來源 ID | 報告大小 | 已讀 payload | 已轉換 |
|---|---:|---:|---:|---:|---:|
| PlayStation | 18 | 18 | 4395842796 | 0 | 0 |
| PSP | 64 | 51 | 37972055005 | 0 | 0 |
| PS Vita | 0 | 0 | 0 | 0 | 0 |
| PlayStation 2 | 1 | 1 | 1244856320 | 0 | 0 |
| PlayStation 3 | 2 | 1 | 4656171149 | 0 | 0 |

85 列全部為 `ContentRead=False`、SHA-256 空白。檔名、路徑與 Windows 報告大小已保留，但不視為已取得遊戲位元組。PSP 另排除 2 列 Fate/unlimited codes，交由專屬平台索引。

## 本機已驗證素材

| 來源 | 平台 | 已驗檔案 | 模型／動作／音訊 | 目前狀態 |
|---|---|---:|---|---|
| `github-neztypezero-psp-gmo-loader-f346daec` | PSP | 548 | 21 GMO／258 native Motion blocks／116 GIM | 原作與版本待確認 |
| `psp-cloud-native-motion-batch4` | PSP | 48 | Cloud GLB／13 clips | 轉換候選，runtime 尚未驗收 |
| `gamebanana-cloud-english-voice` | PS4 | 53 | 1 NUS3AUDIO／49 WAV | 待逐段聽審與事件綁定 |

Cloud 即時量測：1881 三角面、4 meshes、貼圖最長邊 256 px、單 clip 最大 162 動畫通道。執行期 gate 結果為 `warn`（mesh 警戒）；容量量測不等於身分、動作語意、後台播放或上線驗收。

## 精確缺口

- The Windows game shares are not currently mounted at /Volumes/common or /Volumes/game, so the 85 game-container rows remain metadata-only and cannot receive SHA-256 or extraction results.
- No PS Vita game or acquired asset source exists in the current Windows inventory, mounted volumes, central source index or GGD-Asset-Library evidence.
- PSP GMO author samples have exact PSP headers, but their source game/version and filename-only character identities remain unverified.
- Cloud has 13 converted native-ID clips, but semantic action mapping, metric scale, exact source game, four non-TRS channels and backend playback remain unresolved.
- PS4 Cloud audio has decoded WAV files, but clip-level speaker/language/event review remains incomplete; no runtime binding is claimed.

## 重建與查詢

```bash
node --import tsx tools/hero-model-library/source-workflows/playstation-platform-sources-v1/audit_cloud_candidate.mts --check
python3 tools/hero-model-library/source-workflows/playstation-platform-sources-v1/build_inventory.py --check
python3 tools/hero-model-library/source-workflows/playstation-platform-sources-v1/query.py cloud
python3 -m unittest tools/hero-model-library/source-workflows/playstation-platform-sources-v1/test_inventory.py
```
