# VFX visual review: godie-ogld.ex

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.03s
- Source digest: `32d5f8d95dc59fae8a816948df0d360f8e9001d2b7af1d08809ea450ca1e2468`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 0, 1 | 未見預期的衛星殞落效果 |
| familyMatch | fail | 0, 1 | 未見符合衛星殞落的主效果 |
| colorMatch | uncertain | — | 未提供顏色規格且無主效果 |
| spawnOrigin | uncertain | — | 未見主效果 |
| impactPlacement | uncertain | — | 未見主效果與落點 |
| temporalOrder | fail | 0, 1 | 缺少預期的連續落點效果 |
| clipping | uncertain | — | 未見主效果，無法判斷 |
| readability | uncertain | — | 未見主效果，無法判斷 |

## Model notes

- 畫面僅見些微星星粒子，未見衛星殞落或連續範圍打擊
- 提供的圖片無法證明技能有發動預期的效果
