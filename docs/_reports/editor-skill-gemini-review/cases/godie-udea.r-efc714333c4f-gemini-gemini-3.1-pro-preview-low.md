# VFX visual review: godie-udea.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.99s
- Source digest: `efc714333c4fa2a4c07b917fe5ba998e6b240c1eb05aa4eb7fbefc23d91256bf`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 3, 4 | 未見預期的連鎖效果，僅見小光點與橫向光暈 |
| familyMatch | uncertain | — | 未提供預期的VFX類型 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未提供明確的起點要求 |
| impactPlacement | uncertain | — | 未提供明確的命中位置要求 |
| temporalOrder | fail | 1, 2, 3, 4 | 未見預期的連鎖效果 |
| clipping | pass | 1, 2, 3, 4 | 未見明顯穿模 |
| readability | pass | 1, 2, 3, 4 | 效果與角色關係清楚 |

## Model notes

- 預期天譴的『連鎖』效果未見，只有一些小光點與橫條光暈，不符合『二十個起點開獨立連鎖』的描述。
