# VFX visual review: godie-hjai.e

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.31s
- Source digest: `bd8a0a9ee5bd539f156903cef235da743395da8f0ba4534cef303f26b7aebcd7`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 3 | 遠端爆炸效果存在 |
| familyMatch | pass | 3 | 可見爆炸效果符合預期 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未提供特定來源要求 |
| impactPlacement | uncertain | — | 未提供命中位置要求 |
| temporalOrder | fail | 1, 2 | 未見投射物飛行 |
| clipping | pass | 3 | 未見明顯穿模 |
| readability | pass | 3 | 效果與場景關係清楚 |

## Model notes

- 畫面中出現遠處的爆炸，但缺乏投射物飛行的過程
