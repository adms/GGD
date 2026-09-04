# VFX visual review: godie-nbbc.w

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 5.63s
- Source digest: `9c27f3c703624d97192482740d499f93e7291cf6adebe6fa4a9ca0ad67bccec0`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 0, 1 | 未見瞬移至身前斬擊及附近雷擊效果 |
| familyMatch | fail | 0, 1 | 無斬擊與雷擊相關VFX出現 |
| colorMatch | uncertain | — | 未提供顏色要求 |
| spawnOrigin | uncertain | — | 未提供來源要求 |
| impactPlacement | uncertain | — | 未提供命中位置要求 |
| temporalOrder | fail | 0, 1 | 缺乏斬擊及雷擊等效果，無法判斷順序 |
| clipping | uncertain | 0, 1 | 因無明顯主效果，無法判斷 |
| readability | uncertain | 0, 1 | 缺乏主效果，無法確認關係 |

## Model notes

- 畫面中僅見角色移動，未出現任何預期的斬擊及雷擊特效。
