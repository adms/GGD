> 原始素材／半成品另備份於 `s3://ggd-390630837668-ap-east-2-an/legacy/ggd-asset-library/`；僅限備份或人工明確許可使用，其他程序不得自動取用。

> 本頁為本機來源／候選資料。已標準化共享成品的固定入口：`s3://ggd-390630837668-ap-east-2-an/GGD-Asset-Library/`，以其中 current.json／catalog.json 為準。

# GGD 角色候選素材庫

更新：2026-09-08T10:38:13+0800。本批以取得素材為主，角色出處沿用先前對照表。

## 已取得的《300英雄》素材

| 項目 | 數量 | 入口 |
|---|---:|---|
| 原始資源檔 | 111,198 | [raw](300heroes/raw/) |
| 原生 3D 容器（含角色、場景與特效模型） | 32,012 | [模型清單](300heroes/indexes/models-native.jsonl) |
| 角色 OBJ 靜態模型 | 2,366 | [模型及動作資料夾](300heroes/models/data/character/roleaction/) |
| 特效資源（含模型、貼圖、設定） | 58,922 | [Effect](300heroes/raw/data/effect/) · [Magic](300heroes/raw/data/magic/) |
| 已辨識角色動作片段 | 36,924 | [角色動作索引 CSV](300heroes/models/character-animation-clips.csv) |
| 全部動作片段（含怪物及特效） | 47,332 | [完整動作索引 CSV](300heroes/models/animation-clips.csv) |
| 拆出的角色動畫關鍵影格二進位檔 | 2,370 | 各模型目錄的 `animation-data.bin` 與 `model.json` |
| 獨立動畫檔（含 Live2D MTN） | 157 | [動畫檔清單](300heroes/indexes/animation-files.jsonl) |
| 可播放音效／語音／音樂 | 70,395 | [音訊資料夾](300heroes/audio/) · [音訊清單](300heroes/indexes/audio-playable.jsonl) |
| 原始音訊容器與檔案 | 2,044 | [原始音訊清單](300heroes/indexes/audio-native.jsonl) |
| 角色演出／過場影片 | 23 | [影片清單](300heroes/indexes/cutscene-video.jsonl) |

分類有重疊，例如特效模型同時包含在 3D 容器和特效資源數量內；這些不是角色數量。

## 魔法少女武鬥祭

已取得 **Complete Form 1.60+**，完成 10 個 GDP 包擷取：**223 個 GLB、1552 個角色主模型動畫片段、640 段音訊、423 個特效設定／shader**。

[魔法少女武鬥祭素材入口](magical-battle-arena/ASSET_LIBRARY.md) · [角色候選清單](magical-battle-arena/character-candidates.csv)

本批為 Complete Form 1.60+，尚未包含 1.70 追加的魔法騎士內容。

## 挑選角色

先開啟 [角色候選清單 CSV](300heroes/character-candidates.csv) 或 [JSON](300heroes/character-candidates.json)，用 ID 尋找 `roleaction` 與 `audio/data/audio/hero` 下的同編號素材。造型以檔名前綴協助歸組；其他命名的素材仍完整保留在全資源清單。

角色與動漫／作品出處見 [原有名冊](character-rosters.md)。這一輪沒有繼續校正出處。

## 檔案怎麼用

- `raw` 保留解包後的原始路徑與內容；不要只搬模型而漏掉相鄰貼圖、特效設定和引用檔。
- JUMPX 的 `.x` 是遊戲自訂容器。`mesh.obj` 可作靜態幾何預覽；骨架、動作、粒子與完整材質仍以原 `.x` 為準。OBJ 不含動畫，材質對應僅為初步轉出。
- OBJ 已連結能唯一辨識的現有貼圖，路徑與副檔名替代規則記在各模型的 `materials.json`；缺失或歧義引用見 [材質對應結果](evidence/300-material-resolution.json)。
- `model.json` 包含骨架、反向綁定矩陣、動作區段及關鍵影格位址。`bones[].exported_channels` 對應同目錄 `animation-data.bin`，保留原始數值和壓縮編碼；尚未轉成 FBX／GLB 動畫或 GGD 骨架，未自行假定 FPS。
- EG3D `.model` 拆出的 `eg3d-metadata.json` 與 `eg3d-buffer.bin` 保留模型、骨架及動畫資料；標準格式轉換尚未完成。
- Vorbis 音訊重建為 OGG；FADPCM 解碼為 PCM16 WAV。每個音效包目錄的 `samples.json` 記錄原名稱、取樣率、聲道與 SHA-256。

## 完成範圍與剩餘項目

- 完整官方 ZIP：已下載；已解開 9 個 JMP 包。包內資源 MD5 不符 0，解包失敗 0。
- 尚有 4 段音訊未成功轉成可播放格式，保留原 BANK 及獨立編碼 payload，見 [未解碼清單](300heroes/indexes/audio-undecoded.json)。
- 模型索引／OBJ 轉出問題 4 項，原檔均保留，見 [處理結果](evidence/300-model-extraction.json)。
- 音訊已做 OGG／WAV 抽樣解碼檢查；OBJ 有幾何數值與索引邊界檢查，未逐角色做外觀驗收。
- 《魔法少女武鬥祭》Complete Form 1.60+ 本體與素材已取得；1.70 更新尚未取得，版本與來源限制見該作素材入口。
- 目前是候選素材庫，尚未匯入 GGD、重綁骨架或重建遊戲特效。

## 來源與可重跑工具

《300英雄》來源：[官方下載頁](https://300.jumpw.com/download.html)、[本次 ZIP](https://dl3.jumpw.com/300hero_v202609021.zip)、官方更新 CDN 主清單與非同步清單（保存在 `evidence`）。《魔法少女武鬥祭》來源：[官方頁面](https://area-zero.net/product/mba/)。

工具與授權保存在 `tools`。模型格式參考 [JumpXToolchain](https://github.com/Gamepiaynmo/JumpXToolchain)；音訊使用 [python-fsb5](https://github.com/HearthSim/python-fsb5) 及 [vgmstream FADPCM 格式實作](https://github.com/vgmstream/vgmstream/blob/master/src/coding/fadpcm_decoder.c)。

流程：`download_300_ranges.py` → `extract_300_packages.py` → `sync_300_assets.py` → `extract_300_audio.py`／`index_300_models.py` → `build_asset_catalog.py`。音效工具需以 `arch -x86_64 /usr/local/bin/python3` 執行，使用本機已安裝的 Ogg／Vorbis 函式庫。

[機器可讀摘要](asset-library-summary.json) · [全資源清單](300heroes/asset-index.jsonl) · [官方清單比對](evidence/300-manifest-audit.json)
