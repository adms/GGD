# J-Stars 第一優先六名管線

本 lane 只處理坂田銀時、鵺野鳴介／神眉、小傑、奇犽、幸運超人、飛影。它協調既有 J-Stars 共用轉換管線、各模組 checked binder 與模型版本服務，不從檔名猜原生角色 ID，也不因「有來源檔」就聲稱已上架。

## 順序與閘

1. 讀 `ggd.jstars-extraction-receipt@1`。角色必須有 `identityVerified=true`，且 `heroId` 是本 lane 固定的 GGD 目標 ID。owner archive receipt 若仍是 `blocked-archive-not-found` 或 `blocked-archive-listing-failed`，六名全部輸出 blocked。
2. 呼叫 `jstars-conversion-runtime-v1/pipeline.py`。模型只在來源超過 10,000 面時減面，減面結果須低於 8,000 面；貼圖上限 256px；骨架與所有 primitive 蒙皮須通過正式檢查；動作必須明列 `idle/run/attack/cast/hurt/death` 六態。
3. VFX、SFX、voice 必須各有同角色 checked-binder 收據，`status=runtime-bound-and-verified`，且 `boundArtifactSha256` 要逐一等於來源 receipt 的完整檔案集合。不能用檔案數相同取代 SHA-256 對應。
4. SFX 與 voice 的每一個來源檔必須有 `ownerReview`：`reviewer=owner`、`decision=approve`、已確認 `event`；voice 另需 `speaker` 與 `language`。一檔未核准就阻擋該角色預設採用。
5. 共用管線先以 `automaticEligible=false` 註冊獨立模型選項。七個模組與註冊 gate 全通過後，`pipeline_promote.mts` 才新增可自動選用的不可變模型版本。若英雄目前是 `modelSelectionMode=manual`，作用中的 `modelKey` 保持不變；若為 automatic，J-Stars canonical-game 版本才成為預設。

`moduleEvidence` 是來源 receipt 每個角色上的 checked-binder 索引，格式如下：

```json
{
  "moduleEvidence": {
    "vfx": {
      "status": "runtime-bound-and-verified",
      "boundArtifactSha256": ["<exact source sha256>"],
      "runtimeBindingCount": 1
    },
    "sfx": {
      "status": "runtime-bound-and-verified",
      "boundArtifactSha256": ["<exact source sha256>"],
      "runtimeBindingCount": 1
    },
    "voice": {
      "status": "runtime-bound-and-verified",
      "boundArtifactSha256": ["<exact source sha256>"],
      "runtimeBindingCount": 1
    }
  }
}
```

SFX／voice 檔案列的 owner 審查格式：

```json
{
  "path": "extracted/018/voice/attack.wav",
  "bytes": 12345,
  "sha256": "<sha256>",
  "ownerReview": {
    "reviewer": "owner",
    "decision": "approve",
    "event": "attack",
    "speaker": "Killua Zoldyck",
    "language": "ja"
  }
}
```

## 執行

先規劃。沒有 archive／來源收據時仍會寫 `pipeline-receipt.json`，狀態是 blocked，退出碼為 0，方便排程重跑：

```bash
python3 tools/hero-model-library/source-workflows/jstars-priority-six-v1/pipeline.py \
  --source-receipt materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/receipt.json \
  --output materials/hero-model-library/priority-evidence/jstars-priority-six-v1 \
  --mode plan
```

來源、轉換器、checked-binder 收據都齊全後才可 apply：

```bash
python3 tools/hero-model-library/source-workflows/jstars-priority-six-v1/pipeline.py \
  --source-receipt /absolute/path/jstars-extraction-receipt.json \
  --output /absolute/path/jstars-priority-six-output \
  --mode apply \
  --content content
```

`--conversion-receipt` 只供重跑與測試使用，可跳過已完成的共用轉換步驟；它不跳過任何模組、註冊或預設 gate。

## 驗證

```bash
python3 -m unittest tools/hero-model-library/source-workflows/jstars-priority-six-v1/test_pipeline.py
python3 tools/hero-model-library/source-workflows/jstars-priority-six-v1/pipeline.py \
  --source-receipt materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/receipt.json \
  --output materials/hero-model-library/priority-evidence/jstars-priority-six-v1 \
  --mode plan
```

本 lane 的 `productionDeploymentVerified` 永遠是 false；內容分支完成註冊與預設選用，仍不等於 Main 已合併或正式服務已部署。
