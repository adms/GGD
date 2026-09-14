# 帕魯三名已核准素材整合

這個 checked integration 讀取素材審查中心的 owner 收據，逐一驗證 18 個動作語意狀態、18 個非語言叫聲、模型文件、GLB 動作名稱與 Hero Forge 下拉選項。

目前三名英雄的模型與六格 `clipMap` 已經在本機 Hero Forge 下拉選單生效，因此 18 個動作語意狀態可標為本機 runtime selectable。14 個通用語意綁定由現行 `clipMap` 直接到達；4 個 owner 核准的逐技能覆寫從同一份 manifest 產生 ability-id → `attack|cast` 路由表，由 `EntityViewRegistry` 在權威 `abilityCast` 事件上消費。

18 個核准叫聲以來源位元組原樣複製進 Git 證據區與 `content/assets/audio/voices/palworld/`。產生器把 owner 核准的抽象事件轉為現行 contextual voice 類別，再由既有 `championId + category` 路由消費；18 個來源叫聲都已有 runtime 綁定，共對應 42 條 runtime 類別路徑。來源仍是非語言叫聲，不冒稱日文或已核實說話者。

本批是「已綁定待 Main 合併與正式站驗證」；`productionDeploymentVerifiedHeroes` 仍為 0。帕魯原生獨立 VFX 與技能特定 SFX 仍是缺口。

```bash
python3 tools/hero-model-library/source-workflows/palworld-approved-runtime-v1/integrate.py
python3 tools/hero-model-library/source-workflows/palworld-approved-runtime-v1/integrate.py --check
python3 -m unittest tools/hero-model-library/source-workflows/palworld-approved-runtime-v1/test_integrate.py
node --import tsx tools/voice-gen/index-lines.mjs --check
pnpm combat:check
pnpm --filter @ggd/client exec vitest run src/render/palworldApprovedRuntime.test.ts
pnpm --filter @ggd/client typecheck
```
