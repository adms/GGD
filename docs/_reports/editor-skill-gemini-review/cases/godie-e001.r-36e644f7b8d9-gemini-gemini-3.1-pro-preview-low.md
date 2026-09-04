# VFX visual review: godie-e001.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.37s
- Source digest: `36e644f7b8d950f1c9575471135763b14bdcc7eeb91699d62c411f10cc1984f4`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2, 3, 4, 5, 6, 7 | 紅色特效可見 |
| familyMatch | uncertain | — | 未提供預期特效類型 |
| colorMatch | uncertain | — | 未提供顏色要求 |
| spawnOrigin | uncertain | — | 未提供生成位置要求 |
| impactPlacement | uncertain | — | 未提供命中位置要求 |
| temporalOrder | uncertain | — | 無法確認結束後復原 |
| clipping | pass | 1, 2, 3, 4, 5, 6, 7 | 未見穿模或裁切 |
| readability | pass | 1, 2, 3, 4, 5, 6, 7 | 主效果與角色關係清楚 |

## Model notes

- 無法從圖片確認結束後是否完整復原
