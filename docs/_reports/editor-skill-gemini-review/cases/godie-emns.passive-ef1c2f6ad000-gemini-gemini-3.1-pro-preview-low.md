# VFX visual review: godie-emns.passive

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.03s
- Source digest: `ef1c2f6ad000ffd63278436116244c269df383e8fc9f18d012ae9b4f33edf788`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1 | 被動技能不應顯示主動施法效果 |
| familyMatch | uncertain | — | 未提供預期效果類型 |
| colorMatch | uncertain | — | 未提供預期顏色 |
| spawnOrigin | uncertain | — | 未提供預期生成位置 |
| impactPlacement | uncertain | — | 未提供預期命中位置 |
| temporalOrder | uncertain | — | 無可用的時間順序資訊 |
| clipping | pass | 0, 1 | 未見穿模/裁切 |
| readability | pass | 0, 1 | 主效果與角色/地面關係清楚 |

## Model notes

- 被動技能不應顯示主動施法效果，但 Candidate 1 顯示了主動施法效果。
