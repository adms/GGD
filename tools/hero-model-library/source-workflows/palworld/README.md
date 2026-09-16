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

## 完整原生動作庫選項

空渦龍 29 條與搗蛋貓 33 條的 256px 成品元件以非預設 Hero Forge 選項登記。六態動作對照沒有重新猜測：產生器要求每一條被引用的原生 clip，其目標 node、path、interpolation 及 input/output accessor 取樣位元必須與既有已驗證模型完全一致。現有預設不變。

枯星龍的舊 256px 獨立元件只有 `Idle` 與 `Walk`，所以仍獨立保留而不填入偽造對照。`astralym-full58-decimation-v1/` 另由完整來源重建 7,896 面、256px、58 條原生動作候選；逐動作 accessor 位元、骨架、Khronos、現行 budget 與五段三視角 A/B 驗收通過後，以第三個非預設選項登記。來源沒有原生 `Death`，仍明列 `Damage` 加升天淡出的授權替代演出。

```sh
node --import tsx tools/hero-model-library/source-workflows/palworld/validate_full_motion_options.mts --write
python3 tools/hero-model-library/source-workflows/palworld/register_full_motion_options.py --write
node --import tsx tools/editor-acceptance/acquired-heroes-check.ts --mode strict --out /private/tmp/ggd-palworld-full-motion-options-accept
python3 tools/hero-model-library/sync_palworld_hero_integration.py --acceptance-dir /private/tmp/ggd-palworld-full-motion-options-accept
python3 tools/hero-model-library/build_palworld_index.py --workspace ..
python3 tools/hero-model-library/current_resource_index.py
python3 tools/hero-model-library/audit_model_dropdown_coverage.py
python3 tools/hero-model-library/source-workflows/palworld-av-review-v1/build_review.py
python3 tools/hero-model-library/source-workflows/palworld/update_four_day_report.py --write
```

不帶 `--write` 的驗證器與登記器會比對現有成品。機器收據為 `materials/hero-model-library/priority-evidence/palworld-full-motion-options-v1/validation.json` 與 `registration.json`。兩顆 GLB 的原始轉換階段已有 S3 legacy 完整讀回收據；本次只新增 Git 模型文件、候選關係與產生索引，沒有重複上傳未改變的大型位元。
