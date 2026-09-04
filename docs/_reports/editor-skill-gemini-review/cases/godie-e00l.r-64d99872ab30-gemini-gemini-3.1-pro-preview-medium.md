# VFX visual review: godie-e00l.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 6.14s
- Source digest: `64d99872ab30d265507e24d4b918e7733b3f8c76a3fa880f1add5a9fc697c14e`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2 | 可以看到反彈狀態的光效 |
| familyMatch | uncertain | — | 未提供預期的 VFX 類型 |
| colorMatch | uncertain | — | 未提供預期的顏色 |
| spawnOrigin | uncertain | — | 未提供預期的生成位置 |
| impactPlacement | uncertain | — | 未提供預期的命中位置 |
| temporalOrder | pass | 1, 2 | 狀態光效按順序出現 |
| clipping | pass | 1, 2 | 未見穿模或裁切 |
| readability | pass | 1, 2 | 主效果與角色關係清楚 |

## Model notes

- 預期提到反彈狀態，畫面可見發光圈圈特效
- 因缺乏詳細設定，部分非必要檢查無法給出 pass
