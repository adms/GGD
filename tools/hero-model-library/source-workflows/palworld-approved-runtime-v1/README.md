# 帕魯三名已核准素材整合

這個 checked integration 讀取素材審查中心的 owner 收據，逐一驗證 18 個動作語意狀態、18 個非語言叫聲、模型文件、GLB 動作名稱與 Hero Forge 下拉選項。

目前三名英雄的模型與六格 `clipMap` 已經在本機 Hero Forge 下拉選單生效，因此 18 個動作語意狀態可標為本機 runtime selectable。14 個通用語意綁定可由現行 `clipMap` 直接到達；4 個逐技能建議仍需要 skill-to-motion router。

18 個核准叫聲以來源位元組原樣複製進 Git 成品區並保留容器、SHA-256 與 owner 核准事件。現行 runtime 沒有「每個 Hero Forge 角色的戰鬥叫聲」路由，因此本批不把叫聲冒稱已綁定或已部署。

```bash
python3 tools/hero-model-library/source-workflows/palworld-approved-runtime-v1/integrate.py
python3 tools/hero-model-library/source-workflows/palworld-approved-runtime-v1/integrate.py --check
python3 -m unittest tools/hero-model-library/source-workflows/palworld-approved-runtime-v1/test_integrate.py
```
