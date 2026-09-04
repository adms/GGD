# VFX visual review: godie-e00s.r

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.17s
- Source digest: `01446ad317d8940c12b289e4052a160da23c67516b8b87143d80b66b4cd92641`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 6, 7 | 未見樹精生成，只有紅色法陣與模糊紅色效果 |
| familyMatch | fail | 1, 2, 6, 7 | 可見效果不似樹精，更像血紅色特效或法陣 |
| colorMatch | uncertain | — | 未提供預期顏色 |
| spawnOrigin | uncertain | — | 未見樹精，無法確認生成位置 |
| impactPlacement | uncertain | — | 無明確範圍傷害特效或受擊表現 |
| temporalOrder | uncertain | — | 未見樹精與八秒後清除之流程 |
| clipping | pass | 2, 6, 7 | 可見紅色特效未見明顯穿模 |
| readability | pass | 2, 6, 7 | 特效與角色及地面相對關係清晰 |

## Model notes

- 畫面中出現紅色法陣與殘影效果，無樹精模型或特效。
- 無法從畫面判斷數量 4/6/8 或定身狀態。
