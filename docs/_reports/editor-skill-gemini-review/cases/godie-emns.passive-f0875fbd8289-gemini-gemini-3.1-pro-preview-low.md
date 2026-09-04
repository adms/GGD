# VFX visual review: godie-emns.passive

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.63s
- Source digest: `f0875fbd8289dd16fddf5c1d911d1ca20b583f08c559680e9592bf76ceba811f`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | uncertain | 1, 2, 3 | 畫面中僅見紅色格紋方塊特效，無法判斷魔力屏障或抵傷效果 |
| familyMatch | uncertain | — | 未提供預期特效類型 |
| colorMatch | uncertain | — | 未提供預期特效顏色 |
| spawnOrigin | uncertain | — | 未提供預期特效來源位置 |
| impactPlacement | uncertain | — | 未提供預期命中位置 |
| temporalOrder | uncertain | — | 無法從畫面確認主動施法或先後順序 |
| clipping | pass | 1, 2, 3 | 可見特效未見明顯穿模 |
| readability | pass | 1, 2, 3 | 角色與特效關係清楚 |

## Model notes

- 預期的魔力屏障與抵傷邏輯為數值規則，難以單從這些特效畫面直接確認。
