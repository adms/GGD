> 原始素材／半成品另備份於 `s3://ggd-390630837668-ap-east-2-an/legacy/ggd-asset-library/`；僅限備份或人工明確許可使用，其他程序不得自動取用。

> 本頁為本機來源／候選資料。已標準化共享成品的固定入口：`s3://ggd-390630837668-ap-east-2-an/GGD-Asset-Library/`，以其中 current.json／catalog.json 為準。

# 魔法少女武鬥祭：GGD 候選素材

已取得並擷取 **Magical Battle Arena Complete Form 1.60+**，基礎光碟為 1.60，追加版本由補丁內的 `パッチ導入方法.txt` 確認。来源為 [My Abandonware 社群存檔](https://www.myabandonware.com/game/magical-battle-arena-yqh)，完整 ZIP 與 ISO 保存在 [downloads](downloads/)。

| 素材 | 數量 | 入口 |
|---|---:|---|
| 原生 3D 模型（含角色、武器、場景、特效） | 224 | [模型清單](indexes/models.jsonl) · [原始模型](raw/Model/) |
| 含骨架／動畫及內嵌 PNG 貼圖的 GLB | 223 | [GLB 模型](models/Model/) |
| 角色／形態定義 | 21 | [角色候選 CSV](character-candidates.csv) · [JSON](character-candidates.json) |
| 角色主模型動畫片段 | 1552 | 各角色 GLB 內的動畫集合 |
| 所有模型動畫片段（含武器／場景等） | 1614 | [動作索引 CSV](models/animation-clips.csv) |
| 原生特效設定與 shader | 423 | [特效清單](indexes/vfx.jsonl) |
| 貼圖 | 808 | [貼圖清單](indexes/textures.jsonl) |
| 可播放 WAV／OGG 音效、語音、音樂 | 640 | [音訊清單](indexes/audio.jsonl) · [Sound](raw/Sound/) |

共 2,385 個去重後的原生檔案，包含 10 種 GDP 包（補丁版本覆蓋前的原檔另存備份）；擷取錯誤 0，GLB 轉檔失敗 1，GLB 未找到貼圖 0。

`raw` 保留遊戲原檔；`models` 是 Assimp 6.0.5 轉出的 GLB，骨架和動畫已保留，DDS 貼圖轉成 PNG 並內嵌。部分模型本身沒有骨架或動畫。尚未對每個角色逐動作做視覺驗收或重綁 GGD 骨架。`.efc` 仍是原生特效設定，未重建成 GGD 特效。

角色主模型已對應 21/21 份定義，原生主模型缺件 0；GLB 成功 20 份，角色轉換失敗：['ククリ']。1.60+ 追加包來源：[社群分享頁](https://kazasou.wordpress.com/2011/05/19/doujin-game-magical-battle-arena/)；驗證見 [補丁下載紀錄](../evidence/mba-patch160-download.json)。

**版本範圍：本批為 Complete Form 1.60+，未包含 1.70 追加的魔法騎士內容。** 社群 1.70 連結已有失效、等待限制及瀏覽器封鎖，詳見 [來源檢查紀錄](../evidence/mba-patch-source-status.json)。

下載 ZIP 已通過 CRC 檢查；ZIP／ISO 的 SHA-256 保存在 [下載驗證](../evidence/mba-download-verified.json)。GDP 格式依 [Acewell 公開的格式說明](https://zenhax.com/viewtopic.php%40t%3D7163.html) 擷取，逐筆檢查名稱與位址範圍，原生檔案 SHA-256 保存在 [全素材清單](asset-index.jsonl)。

工具：`../tools/extract_mba_gdp.py`、`../tools/convert_mba_models.py`、`../tools/build_mba_catalog.py`、`../tools/import_mba_patch160.py`。完整解包的遊戲檔案在 [client](client/)，本次沒有啟動遊戲或執行其安裝程式。
