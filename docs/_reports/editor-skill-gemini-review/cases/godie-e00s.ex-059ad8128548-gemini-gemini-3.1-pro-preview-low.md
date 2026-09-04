# VFX visual review: godie-e00s.ex

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.09s
- Source digest: `059ad8128548a4812b03b9aad0bc65cb16d6ace4647a9a5e2de1e81db3a9b1a7`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | uncertain | — | 未提供明確的主效果視覺預期 |
| familyMatch | uncertain | — | 沒有指定預期 VFX 類型 |
| colorMatch | uncertain | — | 未提供顏色要求 |
| spawnOrigin | uncertain | — | 未提供來源位置要求 |
| impactPlacement | uncertain | — | 未提供命中位置要求 |
| temporalOrder | uncertain | — | 預期只有觸發條件，無法從單一展示確認 |
| clipping | pass | 0, 1 | 光柱與地面/角色關係未見明顯不自然穿模 |
| readability | pass | 0, 1, 2, 3 | 光柱特效與周圍綠色氣團清晰可見 |

## Model notes

- 預期文字為條件判斷邏輯（僅在施放千年練成時發動），無法單憑圖片判斷整體是否符合該邏輯
- 畫面上可見紫白光柱以及後續綠色氣團散開的特效
