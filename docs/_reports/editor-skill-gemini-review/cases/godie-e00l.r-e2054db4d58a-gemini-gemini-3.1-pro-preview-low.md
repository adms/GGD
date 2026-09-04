# VFX visual review: godie-e00l.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.58s
- Source digest: `e2054db4d58a4be5f6d3284f7b4847af5ea101af7e410148796d0ef009cdbe53`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1 | 可見角色周圍出現反彈或護盾效果。 |
| familyMatch | pass | 1 | 光圈或齒輪狀光效符合防禦/反彈技能印象。 |
| colorMatch | uncertain | — | 未提供顏色要求。 |
| spawnOrigin | uncertain | — | 未提供發射位置要求。 |
| impactPlacement | uncertain | — | 未提供命中位置要求。 |
| temporalOrder | pass | 0, 1, 2 | 無效果、出現效果、效果消散，時序合理。 |
| clipping | pass | 1, 2 | 特效與角色及環境無明顯穿模。 |
| readability | pass | 1, 2 | 特效與角色的重疊狀態清晰可辨。 |

## Model notes

- 預期文字只提到啟動反彈狀態和反彈機制，無特定視覺要求，故僅檢查是否有特效及基本表現合理性。
