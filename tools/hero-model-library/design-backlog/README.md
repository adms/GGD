# 已取得模型待設計英雄：維護入口

共編文件固定在 `materials/hero-model-library/已取得模型待設計英雄.md`，同名 JSON 保留所有候選版本、本機路徑、來源與判定證據。從目前要提交的 GGD checkout 根目錄執行，不要把另一個 checkout 的英雄定義當作本分支狀態。

來源盤點以角色身份分組；跨庫同角色與特殊形態可能仍分列，筆數不是去重後的新英雄數。借用某角色模型不代表原角色已實作。名稱相似或未命名網格要留在身份待確認，不能自動認定為新英雄。

## 人物與作品中文名稱

中文對照固定維護在 `materials/hero-model-library/design-backlog/localization-zh-TW.json`：`names` 以來源身份 ID 為 key，`works` 以原始作品字串為 key，附翻譯依據。清單以中文優先並保留原文；新增來源時一起補中文，避免其他工作流重新產生清單後退回只有英文。身份不明的檔名以中文描述並標明待確認，不能用翻譯修改角色對應或設計判定。

只修改名稱時執行 `python3 tools/hero-model-library/build_model_design_backlog.py --workspace ..`，再執行同一指令加 `--check`。同名 JSON 保留原始 `name`／`work`，並提供 `nameZh`／`workZh` 與 `displayName`／`displayWork` 供其他工作流使用；產生器也會同步工作區及本機素材庫的 MD。

## 全來源與五類素材

範圍包含所有已取得來源，不限 81 名英雄或未上架英雄。`design-backlog/resource-coverage.json` 維護來源取得程度、原生動作索引與已核對的角色音訊群組。各角色同時展示模型、動作、特效、音效、語音；已有設計的英雄另列保留全部來源版本。只有音訊或動作補充包的角色列在儲備區，不能計為已取得角色本體。

音訊只自動串接完全相同的角色來源 ID；跨來源與多人共用包須有明確 `voiceGroupIds` 對照。同來源包的未分配音訊另標為待核，不能從借用模型的英雄 ID 推認說話者。來源包含特效也不等於每個角色都有已轉換特效。新來源入庫時更新五類素材欄位與本機索引；尚未取得或待擷取如實保留。

## 英雄定義或技能更新

先重生全角色模型盤點，再使用真實 schema 與模板展開器核對所有英雄的技能。缺少可選的 PASSIVE／EX 不必然是缺口；已有機制資料也不等於玩法、平衡、原作忠實度或正式站驗收完成。

```bash
python3 tools/hero-model-library/inventory.py --workspace ..
mkdir -p ../GGD-Asset-Library/intake/design-backlog
node --import tsx tools/hero-model-library/design-backlog/analyze_abilities.mts ../GGD-Asset-Library/intake/design-backlog/ability-analysis.json
python3 tools/hero-model-library/design-backlog/audit_design.py \
  --analysis ../GGD-Asset-Library/intake/design-backlog/ability-analysis.json \
  --output ../GGD-Asset-Library/intake/design-backlog/hero-design-coverage-full.json \
  --compact materials/hero-model-library/design-backlog/hero-design-coverage.json
python3 tools/hero-model-library/build_model_design_backlog.py --workspace ..
python3 tools/hero-model-library/build_model_design_backlog.py --check
python3 tools/hero-model-library/current_resource_index.py
```

產生器會核對英雄、技能、模板、schema 與解析器的 SHA。輸入變更時必須重新跑 coverage，不可只保留過期的「已設計」判定。上架欄位採既有白名單快照，沒有即時部署驗證。

## 新來源入庫

原始檔、貼圖、解析資料、半成品與完整稽核報告保留於本機並備份到 S3 `legacy/`。可直接選用的成品及共編程式／索引進 Git，另有版本化 S3 備份。來源可保留為待轉換，不能只因檔案存在就標成後台已可選。

300／MBA 的來源盤點可重新產生，再驗證實際模型路徑、GLB 結構與已有轉換檔 SHA：

```bash
node --import tsx tools/hero-model-library/design-backlog/source_ability_check.mts /private/tmp/ggd-design-source-abilities.json
GGD_DESIGN_SOURCE_ABILITY_CHECKS=/private/tmp/ggd-design-source-abilities.json \
GGD_DESIGN_SOURCE_OUTPUT=/private/tmp/ggd-design-sources-300-mba.json \
python3 tools/hero-model-library/design-backlog/audit_300_mba.py
python3 tools/hero-model-library/design-backlog/validate_300_mba.py \
  --audit /private/tmp/ggd-design-sources-300-mba.json \
  --abilities /private/tmp/ggd-design-source-abilities.json
```

社群、MOD、論壇與主機模型的盤點工具：

```bash
python3 tools/hero-model-library/source-workflows/fateubw-minecraft-v1/sync_backlog_resources.py --workspace ..
python3 tools/hero-model-library/design-backlog/audit_community.py \
  --repo . --workspace .. --output /private/tmp/ggd-design-sources-community.json
```

檢查輸出後更新 `materials/hero-model-library/design-backlog/sources-300-mba.json`／`sources-community.json`。新增來源尚未受來源掃描器支援時，保留完整個別來源收據，透過 `sources-supplemental.json` 登記，避免重掃時消失。隨後重跑上述英雄核對與主清單產生器，將來源索引、生成文件與工具一起提交同一分支／PR。

FateUBW 同步器從 `download-sources.json` 的已驗證標準化嘗試重建 14 名英靈的逐角動作摘要；Heracles 的未被動作命中末端旋轉骨採獨立休息姿勢烘焙及完整逆綁定流程，並保留公式／無時長片段缺口。可用 `sync_backlog_resources.py --workspace .. --check` 驗證，不能用手改摘要把本機／S3 儲備誤寫成後台可選或已部署。

Git 備份工具為 `tools/hero-model-library/backup_git_assets.py`；`--base` 只接受已有完整 S3 讀回驗證收據的祖先版本。備份增量會記錄移除路徑，S3 原備份仍保留。來源包的 S3 備份收據與 Git 版本備份分開核對。
