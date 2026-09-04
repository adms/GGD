# VFX visual review: godie-e00s.ex

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.71s
- Source digest: `1a355fd4a735da1e4e62c0833ff18903b05e34ca7f36095a4e22d92550aa1cce`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 0, 1, 2, 3 | 主效果為光柱與綠色煙霧，均可見於畫面中。 |
| familyMatch | uncertain | — | 未提供特定VFX類型要求。 |
| colorMatch | uncertain | — | 未提供特定顏色要求。 |
| spawnOrigin | uncertain | — | 未提供特定來源要求。 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求。 |
| temporalOrder | pass | 0, 1, 2, 3 | 光柱先出現，隨後產生綠色煙霧，順序合理。 |
| clipping | pass | 0, 1, 2, 3 | 未見明顯穿模或裁切問題。 |
| readability | pass | 0, 1, 2, 3 | 特效與角色及地面的關係清晰可辨。 |

## Contract warnings

- Google Gemini positive verdict is not calibrated; forced to human review

## Model notes

- 根據提供的圖片，光柱與綠色煙霧效果均有正常顯示。
