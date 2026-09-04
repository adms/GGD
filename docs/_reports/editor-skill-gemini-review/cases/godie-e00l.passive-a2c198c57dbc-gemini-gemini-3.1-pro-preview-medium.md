# VFX visual review: godie-e00l.passive

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 11.75s
- Source digest: `a2c198c57dbc8c903eef6cb67e007d0ca31a5c35fed2ae106bee4ae89be76510`
- Confidence: 0.500 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | uncertain | — | 畫面中未能明確辨識出預期的減傷盾特效 |
| familyMatch | uncertain | — | 未提供明確的 VFX 類型規格 |
| colorMatch | uncertain | — | 未提供明確的顏色規格 |
| spawnOrigin | uncertain | — | 未提供明確的發生位置規格 |
| impactPlacement | uncertain | — | 未提供明確的命中位置規格 |
| temporalOrder | uncertain | — | 無法從現有幀確認特效的完整時序 |
| clipping | pass | 0, 1 | 未見明顯穿模或裁切 |
| readability | pass | 0, 1 | 可見特效與角色/地面關係清楚 |

## Model notes

- 預期文字主要為數值機制，無法僅由畫面確認
- 畫面可見灰色擴散環與紅色特效，難以確定是否為減傷盾
