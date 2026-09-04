# VFX visual review: godie-hart.r

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 8.19s
- Source digest: `c3802edc3adca3ee87870ae885e939bb181afae7139f13833ef6dd150ec2fa43`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 3, 6, 7 | 可見大量月牙特效代替角色揮砍動作，違反預期 |
| familyMatch | uncertain | — | 未提供特定家族要求 |
| colorMatch | pass | 7 | 終結光柱呈現黃藍色 |
| spawnOrigin | uncertain | — | 未提供特定來源要求 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求 |
| temporalOrder | pass | 7 | 最後才播放黃藍終結光柱 |
| clipping | pass | 0, 1, 2, 3, 4, 5, 6, 7 | 未見明顯穿模或裁切 |
| readability | pass | 0, 1, 2, 3, 4, 5, 6, 7 | 特效與角色關係清楚，無明顯遮擋 |

## Model notes

- 畫面中出現大量月牙特效取代揮砍動作，與預期不符。
- 七次傷害是否逐擊對齊無法從現有圖片完整確認，但月牙使用已判定失敗。
