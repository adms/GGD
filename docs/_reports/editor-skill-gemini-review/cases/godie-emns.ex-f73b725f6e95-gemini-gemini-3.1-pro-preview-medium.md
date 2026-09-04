# VFX visual review: godie-emns.ex

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 13.84s
- Source digest: `f73b725f6e9526cb8d6e6858f06f816322fa8aac92528dcdc4e5ec9c2362e0d0`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 0, 1, 2 | 可見連線與紅色像素方塊特效 |
| familyMatch | uncertain | — | 未提供預期特效類型 |
| colorMatch | uncertain | — | 未提供預期特效顏色 |
| spawnOrigin | uncertain | — | 未提供預期生成位置 |
| impactPlacement | uncertain | — | 未提供預期命中位置 |
| temporalOrder | uncertain | — | 未提供預期特效時序 |
| clipping | pass | 0, 1, 2, 5 | 未見明顯穿模 |
| readability | pass | 0, 1, 2, 5 | 特效與角色位置關係清楚 |

## Model notes

- 預期文字多為數值與機制描述，無法僅憑畫面確認生命值交換細節
- 可見雙方有連線及紅色像素特效
