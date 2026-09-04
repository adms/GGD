# VFX visual review: godie-hjai.e

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 15.99s
- Source digest: `4306ea768b95381d5001ee0296bd9e6207e2f2abd216135bfeafa810a96bac06`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | uncertain | 1, 2, 3 | 可見飛行與爆炸，但無法從靜態圖確認震動 |
| familyMatch | pass | 1, 2, 3 | 火焰與爆炸特效符合預期風格 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未提供特定來源要求 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求 |
| temporalOrder | uncertain | 1, 2, 3 | 可見先飛行後爆炸，但無法確認傷害點對齊 |
| clipping | pass | 1, 2, 3 | 未見明顯穿模或裁切 |
| readability | pass | 1, 3 | 特效與角色及背景關係清楚可辨 |

## Model notes

- 震動與傷害點屬於無法單憑靜態圖片確認的項目
