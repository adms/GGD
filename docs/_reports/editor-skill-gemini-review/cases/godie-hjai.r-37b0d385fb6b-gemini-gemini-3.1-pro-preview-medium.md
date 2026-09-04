# VFX visual review: godie-hjai.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 15.04s
- Source digest: `37b0d385fb6b7d38233e91c29e00cc420b8ff2c8c2916c76baa3dc81738da647`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2 | 可見角色衝刺及後續的暗色斬擊特效 |
| familyMatch | uncertain | — | 未提供特定 VFX 類型要求 |
| colorMatch | uncertain | — | 未提供明確的色碼或嚴格顏色要求 |
| spawnOrigin | uncertain | — | 未提供特效生成位置要求 |
| impactPlacement | fail | 2 | 斬擊特效位置過高，未落在目標命中點上 |
| temporalOrder | pass | 1, 2 | 角色先衝向目標後才出現斬擊特效 |
| clipping | pass | 1, 2 | 未見明顯穿模或不當裁切 |
| readability | pass | 2 | 主效果與角色、地面關係清楚可辨 |

## Contract warnings

- overall failed without a required visual check failure

## Model notes

- 斬擊特效出現於畫面上方，偏離目標角色甚多
- 無法從視覺畫面確認傷害與暈眩的相關數值或判定
