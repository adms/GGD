# VFX visual review: godie-ogrh.r

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.78s
- Source digest: `ef4b0363ab0209101c4020b727fd12ff7f3b198cb672a671260263f82e5cbd42`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 2, 3 | 未見橘色橫向光束 |
| familyMatch | fail | 1, 2, 3 | 不是光束效果 |
| colorMatch | fail | 1, 2, 3 | 沒有橘色光束 |
| spawnOrigin | fail | 1, 2, 3 | 沒有從施法者發出光束 |
| impactPlacement | uncertain | — | 沒有命中效果 |
| temporalOrder | fail | 1, 2, 3 | 沒有正確的蓄力發射流程 |
| clipping | pass | 1, 2, 3 | 未見穿模現象 |
| readability | fail | 1, 2, 3 | 主效果未顯示，無法辨識 |

## Model notes

- 畫面中出現了一些橫向的線條與塵土，但不符合預期中的'橘色橫向光束'。
- 沒有明顯的龜派氣功視覺特徵。
