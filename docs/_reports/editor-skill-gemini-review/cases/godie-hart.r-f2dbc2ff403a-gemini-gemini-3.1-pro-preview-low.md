# VFX visual review: godie-hart.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.15s
- Source digest: `f2dbc2ff403a8261294d3501dbe93c5b5c632eee4be02ea620515dd0c93e76ff`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2, 3, 6, 7 | 斬擊特效與黃藍光柱可見 |
| familyMatch | uncertain | — | 未提供預期家族 |
| colorMatch | uncertain | — | 未提供預期顏色 |
| spawnOrigin | uncertain | — | 未提供預期出生點 |
| impactPlacement | uncertain | — | 未提供預期命中位置 |
| temporalOrder | uncertain | 1, 2, 3, 6, 7 | 無法確認是否有七次傷害及對齊 |
| clipping | pass | 1, 2, 3, 6, 7 | 未見明顯穿模 |
| readability | pass | 1, 2, 3, 6, 7 | 特效與角色關係清楚 |

## Model notes

- 斬擊特效數量及時序無法完全確認是否符合七次。
