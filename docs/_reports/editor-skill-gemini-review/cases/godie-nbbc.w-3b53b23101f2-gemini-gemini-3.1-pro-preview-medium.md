# VFX visual review: godie-nbbc.w

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 15.11s
- Source digest: `3b53b23101f2abe1c78a45cc48cf058fb8215ace38b00d9f4cfd632a3622280a`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | uncertain | 1, 2 | 可見瞬移與斬擊，但未見明確雷擊特徵 |
| familyMatch | uncertain | — | 未提供預期特效類型 |
| colorMatch | uncertain | — | 未提供預期顏色 |
| spawnOrigin | uncertain | — | 未提供預期生成位置 |
| impactPlacement | uncertain | — | 未提供預期命中位置 |
| temporalOrder | uncertain | 1, 2 | 無法確認第二效果是否為雷擊 |
| clipping | pass | 1, 2, 3, 4 | 未見明顯穿模或裁切 |
| readability | pass | 1, 2, 3, 4 | 特效與角色關係清楚 |

## Model notes

- 畫面中出現第二個紅黑色方塊特效，但不具備一般雷擊特徵
