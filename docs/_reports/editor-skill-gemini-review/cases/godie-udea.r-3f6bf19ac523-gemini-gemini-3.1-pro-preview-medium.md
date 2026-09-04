# VFX visual review: godie-udea.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 6.58s
- Source digest: `3f6bf19ac523bb6a291818142ef2e580011a3bc34213d80bd68d972121e1daca`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | uncertain | 1, 2, 3, 4 | 預期效果為起點連鎖，未見明確的連鎖特效。 |
| familyMatch | uncertain | — | 未提供機制描述或具體樣式，無法判定符合與否。 |
| colorMatch | uncertain | — | 未提供顏色要求。 |
| spawnOrigin | uncertain | — | 無法確認起點位置是否符合預期。 |
| impactPlacement | uncertain | — | 沒有明確的命中效果或目標。 |
| temporalOrder | uncertain | — | 未能辨識出連鎖、追加傷害等預期的時序。 |
| clipping | pass | 1, 2, 3, 4 | 未見明顯穿模或裁切問題。 |
| readability | pass | 1, 2, 3, 4 | 畫面上現有粒子特效與角色關係清楚。 |

## Model notes

- 畫面可見到有冰晶狀粒子特效從施法者周圍往目標飛去，並帶有些許拖尾，但與預期中的「連鎖」文字難以對應，故 effectPresence 判定為 uncertain。
