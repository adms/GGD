# LoL 第二批：11 份本機模型交接

`handoff-manifest.json` 是採用入口：11 個實際 modelKey、model document、GLB 完整 SHA、原始 WAD SHA、骨架、片段、fallback、警戒與驗證證據均逐名列出。成品住 `ready/<native-id-lowercase>/`，每名有 `body.glb`、`model.json`、`uploaded-model.json`、`receipt.json`、`motion.json`。

11/11 通過既有 `finalize-library-body.mts`（含共享 upload prepare/verify）；11/11 通過既有 `inspect-library-motion.mjs` 的 CPU 蒙皮檢查。沒有做視覺、貼圖觀感、裝置效能或英雄玩法驗收，沒有投稿、正式服務匯入或發布。

每名都是六個合法 GGD bindings、五個獨立原生 clips。**11 名的 hurt 都重用 idle**，不是六類原作動作全齊。Sett / FiddleSticks / Ornn / Ahri / Thresh 的最大通道為 411 / 378 / 351 / 353 / 345，通過 500 上限並保留 300 警戒。

## 保留的來源與修正

- `inventory/`：依原生 ID 查出的模型、原生 WAD 成員及音訊候選。音訊未聽審或綁定遊戲事件，不能視為已採納音效。初始一般模型搜尋的模糊同名字串命中沒有被當作角色 identity。
- `extracted/`：由本機正式 WAD 解出的原始 SKN、SKL、DDS、全部基礎造型 ANM。`extraction-manifest.json` 逐檔記 WAD member、SHA 和原始檔路徑；没有下載素材。
- `skin-config/`：原始 skin0.bin 和其解析 JSON。貼圖綁定直接採用 skin0 的原生材質映射，沒有重配角色。
- `converted/`：既有 lol2gltf 的完整轉換候選，已保留各部件與所選原生動畫。
- `native-visible/`：只移除原生 initialSubmeshToHide 對應 primitive；Sett 2、FiddleSticks 4、Ornn 3、Ahri 1。Ahri 的 Body_Proxy 本來不在 SKN。`native-visibility-receipt.json` 證明只改 primitive 列表，其餘 JSON 與 binary chunk 不變。
- `accessor-repaired/`：沿 Main 原始 `repair_glb_accessors.py` 修復不合法四元數／既有權重 metadata，工具副本及所有備份都在本 tmp 樹。
- `texture256/`：現有 `model-budget/optimize.ts` 僅縮貼圖至出貨上限 256；11 份 geometryDiff 均過。未減面。
- `ggd-runtime-candidate/`：只對 Chogath、Ashe、Blitzcrank、Ahri、Malphite 跑先前 LoL 已使用的 compact-ggd；省去無渲染後代的 attachment 軌與常數軌，resample tolerance 1e-5。完整候選仍保留，不宣稱保留原作所有動態 attachment 表現。
- `canonical-skin/`：四名舊角用同鎖版 glTF-Transform `sortPrimitiveWeights` 的無上限模式正規化零權重 joint 索引。未丟失非零影響，核對的最大有效權重差小於 3e-8；Ahri 直接沿用壓縮結果。未放寬 Khronos maxIssues。

## 可重建入口

原生 converter 命令逐名住 `conversion-recipes.json`，可執行批次住 `convert.sh`。當時使用本機已快取 .NET 8 arm64 image，`--network none --pull never`，只掛載 readonly converter 及本次 tmp output。

**前置缺口須保留**：轉換成功之後，舊 `/private/tmp/ggd-lol-models/tool/lol2gltf` 及 `/private/tmp/ggd-lol-assets-venv` 的 cdtb module 消失。原生轉換版本依既有來源為 `lol2gltf d36a532 + ImageSharp 3.1.12, linux-arm64`；抽取為 `cdtb==1.3.0`。重新從 WAD 轉起需要先恢復這些精確工具。不能把不存在的舊入口宣稱現在可直接執行。

已保留的 `converted/*.glb` 不依賴上述消失工具。從這些固定 SHA 中間來源重建採用成品：

```sh
python3 /private/tmp/ggd-lol-batch2-assets/rebuild-from-converted.py \
  /private/tmp/ggd-lol-batch2-assets \
  /private/tmp/ggd-lol-batch2-rebuild-new \
  '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-lol-batch2'
```

此固定批次 glue script 沿用現有工具，要求新輸出目錄，核對原始 converter GLB SHA、工具 SHA、最後 body SHA 與 modelKey。組成命令本次已實跑；組合重播腳本只做語法解析，依範圍沒有為已通過成品再跑一次。需要 manifest 記錄版本的 repo、其 pnpm dependencies、Python3、Node、ffmpeg，以及本資料夾 optimizer dependency tree。

`optimizer/package.json` 與 `optimizer/package-lock.json` 是前批原檔複本。此次只在本 tmp tree 執行 `npm ci --ignore-scripts --no-audit --no-fund`，沒有更新鎖檔或改中央庫。core/functions 固定 4.4.1；extensions 是原鎖檔既有 4.5.0（含其 4.5.0 core 子依賴），完整 resolved URL/integrity 以鎖檔為準。復建依賴也應使用 `npm ci`，不可換版本。

`logs/` 保留首次失敗、修正後成功與 CPU motion 原始結果。`files.sha256.json` 排除 npm 安裝目錄與 cache；所有正式成品 SHA 以 handoff manifest 為準。
