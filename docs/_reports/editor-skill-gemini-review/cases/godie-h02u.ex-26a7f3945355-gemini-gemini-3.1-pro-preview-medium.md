# VFX visual review: godie-h02u.ex

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 12.21s
- Source digest: `26a7f394535521dbc3ccbc6d4841c15711b489f94d08a24dd0549f6c1ef712d0`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2, 3, 4, 5, 6 | 主效果可見 |
| familyMatch | uncertain | — | 未指定具體特效類型 |
| colorMatch | uncertain | — | 未指定特效顏色 |
| spawnOrigin | uncertain | — | 未指定生成位置 |
| impactPlacement | uncertain | — | 未指定命中位置 |
| temporalOrder | fail | 7 | 六秒排程結束後，特效依然殘留 |
| clipping | pass | 1 | 未見明顯穿模 |
| readability | pass | 1 | 特效與角色關係清楚 |

## Model notes

- 在第21147ms（Candidate 7）仍可見特效殘留，違反排程結束後不殘留之預期。
