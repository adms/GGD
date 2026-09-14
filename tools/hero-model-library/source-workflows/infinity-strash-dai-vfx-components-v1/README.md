# Infinity Strash 達伊 VFX 支援元件小批

本流程從已驗證的 PN010／EN801 175 組來源索引中，固定選出六個名稱與角色身份最明確的達伊 PN010 NiagaraSystem 根：`Skl01_Flash`、`Special02_Flash`、`Special03_Slash`、`Special03_EnergyThunderA`、`Special03_Jump` 與 `Special03_Shuchusen`。

`extract_closure.py` 以 PAK manifest、Repak index 與既有唯讀 extractor 建立遞迴非腳本 package 閉包，保存來源 package path、身份、形態、逐檔 SHA-256 與 UE4.26 import/export 結構。大型原始閉包只留在 `GGD-Asset-Library/intake/`，S3 狀態維持 pending。

`build_candidates.py` 用專案保存的兩顆 patched UModel 匯出貼圖與 StaticMesh；貼圖依呼叫端傳入的現行上限轉為 PNG，StaticMesh 經 Assimp 轉成自含 GLB。`build.mts` 是正常入口：它從 `tools/model-budget/limits.ts` 的 live `vfx-model` gate 讀出貼圖上限，並用同一套 `measureGlb`／`scoreAgainst` 量測 GLB。數字不另抄在本流程裡。

```sh
python3 tools/hero-model-library/source-workflows/infinity-strash-dai-vfx-components-v1/extract_closure.py --check
node --import tsx tools/hero-model-library/source-workflows/infinity-strash-dai-vfx-components-v1/build.mts
python3 -m unittest tools/hero-model-library/source-workflows/infinity-strash-dai-vfx-components-v1/test_workflow.py
```

要從已保存的原始 package 重建低體積成品與證據，執行：

```sh
node --import tsx tools/hero-model-library/source-workflows/infinity-strash-dai-vfx-components-v1/build.mts --write
```

輸出狀態刻意分開：

- 來源 package 閉包完成。
- 可讀貼圖與 StaticMesh 支援元件已轉換並以 live policy 檢查。
- Niagara emitter 執行順序、burst／spawn 時序、life、曲線語意、材質動態參數與 renderer binding 未可靠重建。
- 視覺頁只供靜態元件審查；完整 GGD VFX、技能綁定、runtime 選用與正式站部署均為 0。
