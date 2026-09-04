# VFX visual review: godie-h02u.ex

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.47s
- Source digest: `26a7f394535521dbc3ccbc6d4841c15711b489f94d08a24dd0549f6c1ef712d0`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2, 3, 4, 5, 6, 7 | 紅色方塊效果有出現。 |
| familyMatch | uncertain | — | 未提供預期的VFX類型，無法判斷。 |
| colorMatch | uncertain | — | 預期視覺未提及特定顏色，無法評估。 |
| spawnOrigin | uncertain | — | 未提供特定來源要求，無法判斷。 |
| impactPlacement | uncertain | — | 未提供命中位置要求，無法評估。 |
| temporalOrder | fail | 7 | Candidate 7 (21秒) 效果仍在殘留，排程結束後未消失。 |
| clipping | pass | 1, 2, 3, 4, 5, 6, 7 | 未觀察到明顯穿模或裁切問題。 |
| readability | pass | 1, 2, 3, 4, 5, 6, 7 | 效果與角色關係清楚。 |

## Model notes

- 在第21秒仍有效果存在，違反『不得在排程結束後殘留』的條件。
