# VFX visual review: godie-ogld.ex

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.33s
- Source digest: `1d4db77dc824b3e5e886cafc0d89183a88aaf9b4ec17a084354247857e690ee0`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 3, 4, 5, 6, 7 | 未見衛星殞落效果 |
| familyMatch | fail | 1, 2, 3, 4, 5, 6, 7 | 只有紅色光圈與碎屑，不符衛星 |
| colorMatch | uncertain | — | 規格未提供 |
| spawnOrigin | uncertain | — | 未提供 |
| impactPlacement | fail | 1, 2, 3, 4, 5, 6, 7 | 未見衛星落點 |
| temporalOrder | fail | 1, 2, 3, 4, 5, 6, 7 | 無衛星殞落過程 |
| clipping | pass | 1, 2, 3, 4, 5, 6, 7 | 現有效果無明顯穿模 |
| readability | pass | 1, 2, 3, 4, 5, 6, 7 | 現有效果可見度可 |

## Model notes

- 畫面僅見角色身上的紅圈及特效碎屑，無任何衛星殞落的視覺表現。
