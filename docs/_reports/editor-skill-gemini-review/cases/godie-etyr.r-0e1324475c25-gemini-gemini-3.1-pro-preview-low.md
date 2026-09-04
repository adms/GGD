# VFX visual review: godie-etyr.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.00s
- Source digest: `0e1324475c25ed78b54e0d6e6fadd7507cce0ae3d17b315d3cc6674618f34132`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 2, 3 | 召喚了第三個角色作為式神，且有範圍傷害 |
| familyMatch | uncertain | — | 未提供預期 VFX 類型 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未提供特定來源要求 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求 |
| temporalOrder | uncertain | — | 無法確認式神是否維持八秒 |
| clipping | pass | 2, 3 | 未見明顯穿模 |
| readability | pass | 2, 3 | 主效果與角色關係清楚 |

## Model notes

- 預期描述要求召喚的第三個角色維持八秒，但 Candidate 圖片跨度至 20547ms (Candidate 7) 時該角色已消失，無法確切確認維持時間是否為八秒，因此 temporalOrder 為 uncertain。
