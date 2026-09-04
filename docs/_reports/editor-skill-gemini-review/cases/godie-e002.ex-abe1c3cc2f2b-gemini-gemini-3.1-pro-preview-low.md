# VFX visual review: godie-e002.ex

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 8.49s
- Source digest: `abe1c3cc2f2b0b0fa2fea2c5a8e9fd50bd172c85bc58d311e21dbb209a836697`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 6, 7 | 直線性終結砲效果可見 |
| familyMatch | uncertain | — | 未提供預期的 VFX 類型 |
| colorMatch | uncertain | — | 未提供特定的顏色要求 |
| spawnOrigin | uncertain | — | 未提供特定的來源要求 |
| impactPlacement | uncertain | — | 未提供特定的命中位置要求 |
| temporalOrder | fail | 0, 1, 6, 7 | 未見七斬逐擊與反彈，直接施放砲擊 |
| clipping | pass | 6, 7 | 未見明顯穿模 |
| readability | pass | 6, 7 | 特效與角色關係清楚 |

## Model notes

- 預期應先有反彈與七斬，但畫面只有最後的砲擊
