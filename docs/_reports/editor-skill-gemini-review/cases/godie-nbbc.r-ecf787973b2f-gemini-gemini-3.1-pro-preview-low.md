# VFX visual review: godie-nbbc.r

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.55s
- Source digest: `ecf787973b2fd75e6db3d2080e5fd04776bcbe76eaa2c69f13e614379631ae8e`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 3, 4 | 未見A式直線衝擊波與額外範圍傷害。 |
| familyMatch | uncertain | — | 未提供特定VFX類型要求。 |
| colorMatch | uncertain | — | 未提供特定顏色要求。 |
| spawnOrigin | uncertain | — | 未提供特定產生位置要求。 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求。 |
| temporalOrder | fail | 1, 2, 3, 4 | 未見先發生A式再發生B式的順序。 |
| clipping | pass | 1, 2, 3, 4 | 未見明顯穿模或裁切。 |
| readability | pass | 1, 2, 3, 4 | 角色與可見效果關係清楚。 |

## Model notes

- 預期中的A式直線衝擊波及額外範圍傷害並未在提供的候選圖片中看到。
