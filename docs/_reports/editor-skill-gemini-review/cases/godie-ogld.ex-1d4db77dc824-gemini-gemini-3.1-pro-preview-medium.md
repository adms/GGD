# VFX visual review: godie-ogld.ex

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 7.53s
- Source digest: `1d4db77dc824b3e5e886cafc0d89183a88aaf9b4ec17a084354247857e690ee0`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 3, 4, 5, 6, 7 | 未見落點或衛星殞落的視覺表現 |
| familyMatch | fail | 1, 2, 3, 4, 5, 6, 7 | 可見的紅色網點非衛星或隕石 |
| colorMatch | uncertain | — | 未提供預期顏色 |
| spawnOrigin | uncertain | — | 無隨機落點產生 |
| impactPlacement | uncertain | — | 未見落點 |
| temporalOrder | uncertain | — | 未能觀察三十秒內的週期表現 |
| clipping | pass | 1, 2, 3, 4, 5, 6, 7 | 未見穿模或裁切 |
| readability | pass | 1, 2, 3, 4, 5, 6, 7 | 角色與特效相對關係清楚 |

## Model notes

- 預期為『億萬衛星殞落』，但畫面僅顯示紅色網點纏繞
- 無每秒隨機落點與範圍判定的視覺
