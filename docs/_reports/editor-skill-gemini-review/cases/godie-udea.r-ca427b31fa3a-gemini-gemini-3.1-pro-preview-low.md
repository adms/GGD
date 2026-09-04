# VFX visual review: godie-udea.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.50s
- Source digest: `ca427b31fa3a961f8663e3b679c63852923367026a6dea7b53874078b2842d88`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | uncertain | 1, 2, 3, 4 | 未見獨立連鎖效果 |
| familyMatch | uncertain | — | 未提供預期效果類型 |
| colorMatch | uncertain | — | 未提供預期顏色 |
| spawnOrigin | uncertain | — | 未提供預期發生起點 |
| impactPlacement | uncertain | — | 未提供預期命中位置 |
| temporalOrder | uncertain | 1, 2, 3, 4 | 連鎖效果未明確發生，難以確認時序 |
| clipping | pass | 1, 2, 3, 4 | 未見明顯穿模 |
| readability | pass | 1, 2, 3, 4 | 目前可見效果與角色關係清楚 |

## Model notes

- 畫面中出現類似冰霜碎裂的效果，未見明確的『連鎖』特效。
