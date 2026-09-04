# VFX visual review: godie-nbbc.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.96s
- Source digest: `525b0ba8709f54979e12440de0c44bebdd9f6325ec8cc7d56bc0efd3cd45af83`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 0, 1, 2, 3, 4 | 未見A式直線衝擊波，只有人物位移。 |
| familyMatch | uncertain | — | 沒有提供具體的 VFX 類型要求。 |
| colorMatch | uncertain | — | 沒有提供特定顏色要求。 |
| spawnOrigin | uncertain | — | 沒有提供特定來源要求。 |
| impactPlacement | uncertain | — | 沒有提供特定命中位置要求。 |
| temporalOrder | fail | 0, 1, 2, 3, 4 | 未觀察到A式與B式的先後順序。 |
| clipping | pass | 0, 1, 2, 3, 4 | 畫面上未見穿模或裁切。 |
| readability | pass | 0, 1, 2, 3, 4 | 人物關係清楚。 |

## Model notes

- 未見預期的直線衝擊波及交叉點額外範圍傷害。
