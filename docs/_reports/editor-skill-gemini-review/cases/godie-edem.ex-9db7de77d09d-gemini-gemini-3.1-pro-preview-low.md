# VFX visual review: godie-edem.ex

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.80s
- Source digest: `9db7de77d09d9c79b25cdd0ef7114d84fe8b12a8fa0364c463d3319505f1b36d`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2, 3, 4, 5, 6, 7 | 紅色特效持續出現 |
| familyMatch | uncertain | — | 未提供機制描述，無法確認是否符合 |
| colorMatch | uncertain | — | 未提供顏色要求 |
| spawnOrigin | uncertain | — | 未提供來源要求 |
| impactPlacement | uncertain | — | 未提供命中位置要求 |
| temporalOrder | pass | 1, 2, 3, 4, 5, 6, 7 | 特效持續至結尾幀 |
| clipping | pass | 1, 2, 3, 4, 5, 6, 7 | 未見明顯穿模 |
| readability | pass | 1, 2, 3, 4, 5, 6, 7 | 主效果與角色關係清楚 |

## Model notes

- 未提供機制描述與具體顏色/位置要求，相關項目標記為uncertain。
