# VFX visual review: godie-ogld.ex

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.32s
- Source digest: `d6e4714cf9301f56681a493d9ecf285a1d2c6718df334bf3fec96a99412fe4f7`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | — | 未見衛星殞落效果 |
| familyMatch | fail | — | 無可見特效，無法匹配 |
| colorMatch | uncertain | — | 未提供顏色規格且無特效 |
| spawnOrigin | uncertain | — | 未提供來源規格 |
| impactPlacement | uncertain | — | 未見落點 |
| temporalOrder | fail | — | 未見連續落點效果 |
| clipping | uncertain | — | 無特效可檢查 |
| readability | uncertain | — | 無特效可檢查 |

## Model notes

- 預期為『三十秒內每秒一個隨機落點，共三十次』，但提供的畫面完全沒有任何衛星落下或落點特效，只看到兩名角色腳底的紅藍圈
- effectPresence 和 temporalOrder 皆為 fail
