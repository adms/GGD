# VFX visual review: godie-nbbc.w

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.61s
- Source digest: `3b53b23101f2abe1c78a45cc48cf058fb8215ace38b00d9f4cfd632a3622280a`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 3, 4, 5, 6, 7 | 未見雷擊等第二個範圍效果 |
| familyMatch | uncertain | — | 未提供特定預期VFX類型 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未提供特定來源要求 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求 |
| temporalOrder | uncertain | — | 由於缺乏雷擊效果，無法確認時序 |
| clipping | pass | 1, 2, 3, 4, 5, 6, 7 | 未見明顯穿模或裁切 |
| readability | pass | 1, 2, 3, 4, 5, 6, 7 | 主效果與角色關係清楚 |

## Model notes

- 畫面中僅見瞬移及紅色斬擊效果，無雷擊效果。
