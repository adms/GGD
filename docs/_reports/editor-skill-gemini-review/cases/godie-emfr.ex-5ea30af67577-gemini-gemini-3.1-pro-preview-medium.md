# VFX visual review: godie-emfr.ex

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 12.39s
- Source digest: `5ea30af675778c5860b8ab0682596d129542b4a9e499dc41bb4b8a09e1a41a9d`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2 | 可見角色腳下生成陣法光圈 |
| familyMatch | uncertain | — | 未提供預期風格要求 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未指定特效生成位置 |
| impactPlacement | uncertain | — | 未指定命中判定位置 |
| temporalOrder | pass | 1, 2 | 光圈隨時間逐漸擴大 |
| clipping | pass | 1, 2 | 未觀察到明顯穿模現象 |
| readability | pass | 1, 2 | 特效與角色及地面相對關係清楚 |

## Contract warnings

- Google Gemini positive verdict is not calibrated; forced to human review

## Model notes

- 預期文字主要為數值機制，圖片僅呈現陣法展開的視覺效果
