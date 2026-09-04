# VFX visual review: godie-o00k.e

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 6.57s
- Source digest: `25d6e3c4077b7b1e5835ffdb3fd6a7de9d12c29091c2ad917e97ec628c57f1a0`
- Confidence: 0.500 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | — | 未見符合預期之前方直線積木主效果 |
| familyMatch | uncertain | — | 未提供特定來源或特效家族要求 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未提供發生位置要求 |
| impactPlacement | uncertain | — | 未提供命中位置要求 |
| temporalOrder | fail | — | 主效果未現，無法確認時間順序 |
| clipping | pass | 1, 2, 3, 4, 5, 6, 7 | 未見穿模/裁切 |
| readability | fail | — | 主效果未現，無法確認關係 |

## Model notes

- 預期要求 Editor 顯示衝突並允許換成直線積木，但畫面顯示為瞬發範圍特效
- 因主效果不符，判斷為 fail
