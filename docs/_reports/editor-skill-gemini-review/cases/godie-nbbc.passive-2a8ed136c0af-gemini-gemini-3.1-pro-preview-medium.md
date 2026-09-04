# VFX visual review: godie-nbbc.passive

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 12.44s
- Source digest: `2a8ed136c0af0da2861df855e8c4fcccb5190817ccdd8cfed2cc915e4560339e`
- Confidence: 0.500 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | uncertain | 1, 2 | 無法從畫面確認暈眩與覺醒特效 |
| familyMatch | uncertain | — | 未提供特定特效類型要求 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未提供特定來源要求 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求 |
| temporalOrder | uncertain | 1, 2 | 無法確認暈眩與覺醒的觸發順序 |
| clipping | pass | 1, 2 | 未見明顯穿模或裁切 |
| readability | pass | 1, 2 | 主效果與角色關係清楚 |

## Model notes

- 圖片中可見紅色斬擊與紅色光環，但無法確認是否為暈眩或覺醒
- 屬性增加與刷新機制無法由單純畫面驗證
