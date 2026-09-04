# VFX visual review: godie-h01n.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.33s
- Source digest: `d2def1a475e9884291e2bfa795d209cc4c1341179c7cb51148416eab781d7ad8`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2 | 變身特效可見 |
| familyMatch | uncertain | — | 無明確指定特效類型要求 |
| colorMatch | uncertain | — | 未提供顏色要求 |
| spawnOrigin | uncertain | — | 未提供發生位置要求 |
| impactPlacement | uncertain | — | 無命中相關要求 |
| temporalOrder | uncertain | — | 無法從畫面確認冷卻規則及八秒後狀態 |
| clipping | pass | 1, 2 | 未見明顯穿模 |
| readability | pass | 1, 2 | 特效與角色關係清楚 |

## Model notes

- 預期文字包含數值冷卻與時間長度等無法透過視覺單一畫面判斷的條件，故整體及時序無法完全確認。
