# VFX visual review: godie-hart.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 8.18s
- Source digest: `76497162c85ece0b1e52712c30b40bb1d50cacdd224b22789528ad30b534132d`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 3, 4, 5, 6, 7 | 可見單一揮砍刀光與最後的黃藍光柱，無七次傷害逐擊對齊施法者揮砍。 |
| familyMatch | pass | 1, 7 | 包含刀光與光柱，符合預期類型。 |
| colorMatch | pass | 7 | 終結光柱呈現黃藍色。 |
| spawnOrigin | uncertain | — | 未提供明確的生成位置要求。 |
| impactPlacement | uncertain | — | 未提供明確的命中位置要求。 |
| temporalOrder | fail | 1, 2, 3, 4, 5, 6, 7 | 未見七次逐擊對齊，只有一次刀光和最後的光柱。 |
| clipping | pass | 7 | 光柱未見明顯穿模或裁切問題。 |
| readability | pass | 1, 7 | 主效果與角色/地面關係清楚。 |

## Contract warnings

- internally inconsistent: familyMatch passed while effectPresence failed

## Model notes

- 預期應有七次揮砍與受擊特效對齊，但畫面僅捕捉到一次持續存在的刀光與最終光柱。
- 無法從畫面確認七次傷害的逐擊對齊。
