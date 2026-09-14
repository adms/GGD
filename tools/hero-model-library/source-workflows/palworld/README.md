# Palworld 素材與設定維護

固定查詢文件：`materials/hero-model-library/palworld/帕魯三角色素材索引.md`，同名 JSON 提供全部模型版本、音訊事件、本機位置與 S3 收據。

本批角色為空渦龍（Jetragon／JetDragon）、枯星龍（Astralym／WorldTreeDragon）、搗蛋貓（Cattiva／PinkCat）。原始與半成品保留在 `GGD-Asset-Library/intake/public-models-20260911/`，使用各來源封存收據。轉換不得覆寫已凍結 intake。

設定資料由 5 份 PalDB HTML 解析，僅為社群資料快照；不等於原始遊戲 DataTable，也不會自動生成 GGD 英雄或技能。

```sh
python3 tools/hero-model-library/source-workflows/palworld/parse_character_settings.py --source-root ../GGD-Asset-Library/intake/public-models-20260911/palworld-three-character-settings --output /private/tmp/palworld-settings-replay.json
python3 tools/hero-model-library/build_palworld_index.py --workspace ..
python3 tools/hero-model-library/build_palworld_index.py --check
python3 tools/hero-model-library/query_voice.py gamevault-palworld-jetragon-cries --files --json
```

新增來源先更新中央 `download-sources.json`、`public-source-files.json` 與 `design-backlog/sources-supplemental.json`，保留全部模型候選。英雄設計清單的技能核對與重生步驟見 `tools/hero-model-library/design-backlog/README.md`。新成品需另通過材質、骨架、動作與 GGD 驗收，才可登記為可切換選項。

`acquisition-replays/` 為已封存取得／解析腳本的逐位元組副本，SHA 與原路徑在 `source-files.json`。部分腳本保留當時工作站路徑，重跑前需依來源目錄調整參數；不要對已凍結來源直接執行會寫回的腳本。第三方解碼器授權檔同時保留。

叫聲各 6 段，非人類對白。音訊索引保留事件名稱，並以 `sound-effect` 排除語句合成輸入。共用原始封包的模型來源用 `audioIndexedBySourceId` 指向唯一音訊來源，避免同一段叫聲重複計數；路徑欄位正規化必須符合原始 SHA 與相同來源根目錄。
