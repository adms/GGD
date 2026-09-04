# VFX visual review: godie-e00l.ex

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.08s
- Source digest: `0c98b121b237882790a6107f8e4a66511fe3a756506819108a0a95dd223011d9`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 0, 1, 2, 3, 4, 5, 6, 7, 8 | 預期七斬與終結砲未完整播放，未見終結砲。 |
| familyMatch | uncertain | — | 未提供機制描述與相關證據作比較。 |
| colorMatch | uncertain | — | 無提供特定顏色要求。 |
| spawnOrigin | uncertain | — | 無明確原點要求。 |
| impactPlacement | uncertain | — | 無特定命中位置要求。 |
| temporalOrder | fail | — | 未見終結砲，時序無法成立。 |
| clipping | pass | 0, 7 | 未見明顯穿模或裁切。 |
| readability | pass | 0, 7 | 效果與角色關係清楚。 |

## Model notes

- 畫面中僅有七斬（Candidate 7），但未見終結砲，故效果呈現不完整。
