# VFX visual review: godie-u00v.r

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.03s
- Source digest: `777f8aab01cd2cd0d07353c9bdccafb492935828cb696e9c57dd23f65a9d0eb4`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 0, 1 | 未見預期的飛奔衝鋒過程，角色直接出現在目標位置 |
| familyMatch | uncertain | — | 未提供預期 VFX 類型 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未提供來源要求 |
| impactPlacement | uncertain | — | 未提供命中位置要求 |
| temporalOrder | fail | 0, 1 | 缺乏衝鋒過程，時序不完整 |
| clipping | pass | 1, 2, 3 | 未見明顯穿模 |
| readability | pass | 1, 2, 3 | 效果與角色關係清楚 |

## Model notes

- 畫面顯示角色從 Candidate 0 直接 blink 到 Candidate 1 的位置，未見衝鋒過程。
