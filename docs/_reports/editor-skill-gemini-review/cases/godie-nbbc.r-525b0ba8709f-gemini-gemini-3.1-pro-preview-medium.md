# VFX visual review: godie-nbbc.r

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: medium
- Response channel: gemini-candidate
- Inference: 12.09s
- Source digest: `525b0ba8709f54979e12440de0c44bebdd9f6325ec8cc7d56bc0efd3cd45af83`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2 | 未見直線衝擊波與交叉點範圍特效 |
| familyMatch | uncertain | — | 預期特效缺失，無法判斷類型 |
| colorMatch | uncertain | — | 規格未提供預期顏色 |
| spawnOrigin | uncertain | — | 規格未提供特定來源要求 |
| impactPlacement | uncertain | — | 規格未提供特定命中位置要求 |
| temporalOrder | fail | 1, 2 | 部分特效缺失，無法確認先後順序 |
| clipping | pass | 1, 2, 3 | 未見明顯穿模或裁切現象 |
| readability | pass | 1, 2, 3 | 現有特效與角色位置關係清楚 |

## Model notes

- 畫面中僅觀察到疑似瞬移殘影及斬擊特效，未見明顯的直線衝擊波及交叉點額外傷害特效。
