# VFX visual review: godie-nbbc.passive

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.64s
- Source digest: `910c9a9f349cdbd7471a9998d61998879bf7e2f8e90b263e72045d8fd6856f0c`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | uncertain | 1, 2 | 畫面中僅見紅色方塊破裂特效，無法確認是否為暈眩覺醒特效。 |
| familyMatch | uncertain | — | 未提供預期VFX類型，無法比對。 |
| colorMatch | uncertain | — | 未提供特定顏色要求。 |
| spawnOrigin | uncertain | — | 未提供來源位置要求。 |
| impactPlacement | uncertain | — | 未提供命中位置要求。 |
| temporalOrder | uncertain | — | 無從確認各階段是否符合預期。 |
| clipping | pass | 1, 2 | 紅色方塊特效未見明顯穿模。 |
| readability | pass | 1, 2 | 特效與角色關係清楚可見。 |

## Model notes

- 畫面中的特效無法確認是否對應『被暈眩時覺醒』，且無法從畫面上確認數值增加或刷新狀態。
- 整體畫面難以與預期文字進行精確比對。
