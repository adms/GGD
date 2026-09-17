# J-Stars 轉換、設定與上架管線

這條 lane 只處理已擷取的 J-Stars 素材，不維護角色名單，也不讀遊戲封包或把檔名猜成角色。輸入可以是本 lane 的 `ggd.jstars-extraction-receipt@1`，或 owner archive lane 的 `ggd.jstars-owner-archive-extraction-receipt@1`。

owner archive lane 的 `blocked-archive-not-found`／`blocked-archive-listing-failed` 會原樣傳成九階段 blocked，排程可直接重跑，不會變成 schema failure。封包可見後，archive listing 的原生 token 與 member path 會正規化為 conversion input；只有 member path 時仍是 `container-members-normalized-identity-pending`，不算已解包。上游日後加入逐檔 bytes、SHA-256、`assetKind` 與 materialized path 後，會自動歸入 model／texture／skeleton／motion／VFX／SFX／voice。角色身份與 runtime GLB 仍須另外驗證。

## 階段

`pipeline.py` 依序處理 extraction、model、texture、skeleton、motion、VFX、SFX、voice、model-registration：

- `runtimeGlb` 必須是上游轉換器產生的綁骨架、有動作 GLB。只有原生模型容器或拆出的 member 時，模型階段保持 blocked，不把「已擷取」寫成「已轉換」。
- `prepare_runtime_candidate.mts` 從正式常數讀有效政策：來源超過 10,000 面才調用 `tools/model-budget/optimize.ts` 的 skin-aware geometry 路徑，候選必須低於 8,000 面（現行程式上限 7,999）；貼圖經正式 upload normalization 限到 256px。數字不在本 lane 另存一份。
- 動作必須明列 idle/run/attack/cast/hurt/death 六態。死亡可由上游依 owner 政策明列 hurt fallback，但這條 lane 不自行猜索引。
- `prepareUploadedHeroModel`、`verifyUploadedHeroModel` 驗證可見網格、骨架、所有 primitive 蒙皮、六態 clip map、貼圖、通道與正式預算。
- VFX 只固定與列出已驗證來源／候選；沒有逐事件 checked binder 時不寫 runtime 綁定。
- SFX／voice 預設為未聽審候選。即使收據附逐檔核准，本通用 lane 也只交給各作品既有 checked binder，不直接猜技能事件，因此 `runtimeBindingsWritten` 固定為 0。
- `register_model_option.mts` 只在明確 `--content` 時透過 `ModelVersions.prepare` 與 champion 內容契約註冊獨立選項，固定 `automaticEligible=false`，不改預設模型，也不宣稱正式站已部署。

## 使用

只規劃；沒有收據時會輸出精確 blocked 收據並以 0 結束，方便排程重跑：

```bash
python3 tools/hero-model-library/source-workflows/jstars-conversion-runtime-v1/pipeline.py \
  --receipt /path/to/jstars-extraction-receipt.json \
  --output /path/to/jstars-runtime-output \
  --mode plan
```

轉換但不登記內容：

```bash
python3 tools/hero-model-library/source-workflows/jstars-conversion-runtime-v1/pipeline.py \
  --receipt /path/to/jstars-extraction-receipt.json \
  --output /path/to/jstars-runtime-output \
  --mode apply
```

轉換並在目前 checkout 註冊非預設模型選項：

```bash
python3 tools/hero-model-library/source-workflows/jstars-conversion-runtime-v1/pipeline.py \
  --receipt /path/to/jstars-extraction-receipt.json \
  --output /path/to/jstars-runtime-output \
  --mode apply \
  --content content
```

`--content` 只能指向同一 checkout 的正式 `content/`。產物收據是 `OUTPUT/pipeline-receipt.json`；它區分已擷取、已轉換、已驗收、已註冊及正式部署。

## 驗證

```bash
python3 -m unittest tools/hero-model-library/source-workflows/jstars-conversion-runtime-v1/test_pipeline.py
python3 tools/hero-model-library/source-workflows/jstars-conversion-runtime-v1/pipeline.py \
  --receipt /private/tmp/does-not-exist-jstars-receipt.json \
  --output /private/tmp/jstars-conversion-runtime-v1-dry-run \
  --mode plan
```
