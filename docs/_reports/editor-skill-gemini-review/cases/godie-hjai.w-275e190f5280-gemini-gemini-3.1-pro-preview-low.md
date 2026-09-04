# VFX visual review: godie-hjai.w

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.41s
- Source digest: `275e190f52802986ec0944c1e252477bf611c244489760195ac52d975e7f01af`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 3, 4, 5 | 未見預期持續五秒週期傷害的殘留DoT效果 |
| familyMatch | uncertain | — | 缺乏機制描述與明確類型要求 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未提供來源要求 |
| impactPlacement | uncertain | — | 未提供命中位置要求 |
| temporalOrder | fail | 1, 2, 3, 4, 5 | 未見殘留DoT |
| clipping | pass | 0, 1 | 無穿模現象 |
| readability | pass | 0, 1 | 可見效果與地面/角色關係清楚 |

## Model notes

- 畫面僅短暫出現紅色方塊特效後即消失，無後續殘留DoT特效
