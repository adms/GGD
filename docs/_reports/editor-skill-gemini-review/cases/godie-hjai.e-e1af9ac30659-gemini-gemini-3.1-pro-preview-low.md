# VFX visual review: godie-hjai.e

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.12s
- Source digest: `e1af9ac30659c91205bc1553166fa14647a1ef683b4a918250ef5b4a59e2e17f`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 3 | 未見投射物飛行，只有遠端爆炸 |
| familyMatch | uncertain | — | 未提供預期 VFX 類型 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未提供特定來源要求 |
| impactPlacement | uncertain | — | 未提供命中位置要求 |
| temporalOrder | fail | 1, 2, 3 | 沒有先飛行再爆炸的過程 |
| clipping | pass | 3 | 可見爆炸效果未見嚴重穿模 |
| readability | pass | 3 | 爆炸效果與環境區分清楚 |

## Model notes

- 畫面中直接在遠端出現爆炸，缺少投射物飛行的過程，違反了『先飛行再於遠端爆炸』的預期。
