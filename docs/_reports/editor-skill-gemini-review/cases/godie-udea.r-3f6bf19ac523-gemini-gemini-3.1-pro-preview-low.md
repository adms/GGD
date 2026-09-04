# VFX visual review: godie-udea.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.45s
- Source digest: `3f6bf19ac523bb6a291818142ef2e580011a3bc34213d80bd68d972121e1daca`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 3, 4 | 未見符合連鎖特徵的效果 |
| familyMatch | uncertain | — | 未提供預期特效類型 |
| colorMatch | uncertain | — | 未提供預期顏色 |
| spawnOrigin | uncertain | — | 未明確要求起點與畫面關係 |
| impactPlacement | uncertain | — | 未明確要求受擊位置 |
| temporalOrder | fail | 1, 2, 3, 4 | 缺乏連鎖或多次跳躍的時序特徵 |
| clipping | pass | 1, 2, 3, 4 | 未見明顯穿模 |
| readability | pass | 1, 2, 3, 4 | 特效與角色關係清楚 |

## Model notes

- 畫面中出現的是圓圈陣列及隨後往左飄散的氣流，不符合連鎖及追加傷害的視覺描述。
