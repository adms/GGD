# VFX visual review: godie-e00l.passive

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.98s
- Source digest: `8dcd702172f674fbbb8f3d07d7a49ff10e9f2fb34b2fb4e7779d50cf4fe92a58`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 0, 1 | 未見銀色甲冑或減傷盾效果，僅見紅色受擊特效 |
| familyMatch | fail | 0, 1 | 可見效果不符護盾或甲冑特徵 |
| colorMatch | fail | 0, 1 | 效果為紅色，不符銀色預期 |
| spawnOrigin | uncertain | — | 無指定位置 |
| impactPlacement | uncertain | — | 無指定位置 |
| temporalOrder | uncertain | — | 主效果未出現，無法判斷時序 |
| clipping | pass | 0, 1 | 未見明顯穿模 |
| readability | pass | 0, 1 | 現有效果尚算清晰 |

## Model notes

- 畫面中僅見紅色血液/受擊特效，未見任何類似銀色甲胄或護盾的視覺效果。
- 無法從視覺判斷機率或數值條件。
