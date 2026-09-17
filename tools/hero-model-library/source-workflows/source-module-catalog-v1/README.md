# 多來源模組候選總表

此聚合器合併 300英雄、Magical Battle Arena、任天堂大亂鬥、KOF 與 J-Stars 的角色級候選片段，產生含輸入 SHA-256 的中央 catalog，並更新 2026-09-11～2026-09-17 素材主清單的標題與固定 generated 區塊。逐候選細節保留在三份來源 JSON，不在 `catalog.json` 重複一份。

```bash
PYTHONDONTWRITEBYTECODE=1 python3 tools/hero-model-library/source-workflows/jstars-owner-archive-v1/build_plan.py
PYTHONDONTWRITEBYTECODE=1 python3 tools/hero-model-library/source-workflows/jstars-priority-six-v1/source_inventory.py
PYTHONDONTWRITEBYTECODE=1 python3 tools/hero-model-library/source-workflows/jstars-priority-six-v1/pipeline.py --source-receipt materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/receipt.json --output materials/hero-model-library/priority-evidence/jstars-priority-six-v1 --mode plan
PYTHONDONTWRITEBYTECODE=1 python3 tools/hero-model-library/source-workflows/source-module-catalog-v1/sources/300-mba.py
PYTHONDONTWRITEBYTECODE=1 python3 tools/hero-model-library/source-workflows/source-module-catalog-v1/sources/ssbu.py
PYTHONDONTWRITEBYTECODE=1 python3 tools/hero-model-library/source-workflows/source-module-catalog-v1/sources/kof-jstars.py
PYTHONDONTWRITEBYTECODE=1 python3 tools/hero-model-library/source-workflows/source-module-catalog-v1/build_catalog.py
PYTHONDONTWRITEBYTECODE=1 python3 tools/hero-model-library/source-workflows/source-module-catalog-v1/build_catalog.py --check
```

`count: null` 表示現有證據無法建立可靠的逐角色數量，不可當成零。來源檔存在、已解包、已轉換、已驗收、已註冊、可切換與正式部署均維持不同狀態。
