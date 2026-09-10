# 已取得模型待設計英雄：維護入口

共編文件固定在 `materials/hero-model-library/已取得模型待設計英雄.md`，同名 JSON 保留所有候選版本、本機路徑、來源與判定證據。從目前要提交的 GGD checkout 根目錄執行，不要把另一個 checkout 的英雄定義當作本分支狀態。

來源盤點以角色身份分組；跨庫同角色與特殊形態可能仍分列，筆數不是去重後的新英雄數。借用某角色模型不代表原角色已實作。名稱相似或未命名網格要留在身份待確認，不能自動認定為新英雄。

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
python3 tools/hero-model-library/design-backlog/audit_community.py \
  --repo . --workspace .. --output /private/tmp/ggd-design-sources-community.json
```

檢查輸出後更新 `materials/hero-model-library/design-backlog/sources-300-mba.json`／`sources-community.json`。新增來源尚未受來源掃描器支援時，保留完整個別來源收據，透過 `sources-supplemental.json` 登記，避免重掃時消失。隨後重跑上述英雄核對與主清單產生器，將來源索引、生成文件與工具一起提交同一分支／PR。

Git 備份工具為 `tools/hero-model-library/backup_git_assets.py`；`--base` 只接受已有完整 S3 讀回驗證收據的祖先版本。備份增量會記錄移除路徑，S3 原備份仍保留。來源包的 S3 備份收據與 Git 版本備份分開核對。
