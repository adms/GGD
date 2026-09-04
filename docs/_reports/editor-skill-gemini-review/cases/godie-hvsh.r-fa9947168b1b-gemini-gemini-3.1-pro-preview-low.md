# VFX visual review: godie-hvsh.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.35s
- Source digest: `fa9947168b1b093b399c79e18b9e1faeb4ac403bb16e03ba7730e0ed774ccd63`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 3 | 未見飛馬與藍色橫向砲 |
| familyMatch | fail | 1, 2, 3 | 只看到特效齒輪與線條 |
| colorMatch | uncertain | — | 未見藍色橫向砲 |
| spawnOrigin | uncertain | — | 未提供起點規格 |
| impactPlacement | uncertain | — | 未提供命中位置規格 |
| temporalOrder | fail | 1, 2, 3 | 未見衝刺後接砲的時序 |
| clipping | pass | 1, 2, 3 | 可見效果未穿模 |
| readability | pass | 1, 2, 3 | 角色與可見效果關係清晰 |

## Model notes

- 畫面未出現預期的飛馬及藍色砲擊。
