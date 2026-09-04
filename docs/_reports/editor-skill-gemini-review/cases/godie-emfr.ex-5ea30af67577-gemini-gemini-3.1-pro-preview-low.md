# VFX visual review: godie-emfr.ex

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 5.87s
- Source digest: `5ea30af675778c5860b8ab0682596d129542b4a9e499dc41bb4b8a09e1a41a9d`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2 | 可見角色周圍出現紫色光圈與紅色特效。 |
| familyMatch | uncertain | — | 未提供預期的 VFX 類型要求。 |
| colorMatch | uncertain | — | 未提供特定的顏色要求。 |
| spawnOrigin | uncertain | — | 未提供特定的來源要求。 |
| impactPlacement | uncertain | — | 未提供特定的命中位置要求。 |
| temporalOrder | pass | 1, 2 | 特效隨時間展開。 |
| clipping | pass | 1, 2 | 未見明顯的穿模或裁切問題。 |
| readability | pass | 1, 2 | 主效果與角色/地面關係清楚。 |

## Model notes

- 圖片中呈現紫色光圈和紅色粒子效果，對應敵彈吸收陣的預期。
