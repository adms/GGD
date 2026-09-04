# VFX visual review: godie-hvsh.e

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.42s
- Source digest: `40953e20dc9f4d6189765d5739111434e795fbff61da44eb100ce68d1fc7904d`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2, 3, 4, 5, 6, 7 | 領域效果可見 |
| familyMatch | pass | 1, 2, 3, 4, 5, 6, 7 | 呈現為範圍領域效果 |
| colorMatch | uncertain | — | 未提供顏色要求 |
| spawnOrigin | uncertain | — | 未提供發生位置要求 |
| impactPlacement | uncertain | — | 未提供命中位置要求 |
| temporalOrder | pass | 1, 2, 3, 4, 5, 6, 7 | 效果持續出現並隨時間變化 |
| clipping | pass | 1, 2, 3, 4, 5, 6, 7 | 無明顯穿模 |
| readability | pass | 1, 2, 3, 4, 5, 6, 7 | 領域範圍與角色關係清晰 |

## Model notes

- 預期中的治療、傷害與增益效果無法由單純視覺判斷。
