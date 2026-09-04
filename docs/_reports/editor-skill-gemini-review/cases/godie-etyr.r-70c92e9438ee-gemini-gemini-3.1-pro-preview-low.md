# VFX visual review: godie-etyr.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.29s
- Source digest: `70c92e9438ee9caf54a1af550acdbf485492e979dd154e8e2dbf4328d7072c60`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 2, 3, 4, 5, 6, 7 | 未見第三個角色維持八秒，只有短暫特效 |
| familyMatch | uncertain | — | 無明確 VFX 類型規範 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未提供明確來源要求 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求 |
| temporalOrder | fail | 2, 7 | 第三個角色未維持預期時間 |
| clipping | pass | 1, 2, 3 | 未見明顯穿模 |
| readability | pass | 1, 2 | 特效與角色關係清楚 |

## Model notes

- 預期應有第三個角色維持八秒
- 畫面中出現的第三個角色在 Candidate 7 已消失，不符合維持八秒的預期
