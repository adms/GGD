# VFX visual review: godie-ogrh.r

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.45s
- Source digest: `e647ac1cf7ab528ee60aeee2f3a9ba1236bc86736545c1a4b7b6e6b0489a5160`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 0, 1, 2, 3 | 未見橘色橫向光束主效果 |
| familyMatch | fail | 0, 1, 2, 3 | 未見符合預期光束特效的形狀 |
| colorMatch | fail | 0, 1, 2, 3 | 未見預期的橘色光束 |
| spawnOrigin | uncertain | — | 缺乏主光束，無法確認起點 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求 |
| temporalOrder | fail | 0, 1, 2, 3 | 未見蓄力與發射過程 |
| clipping | pass | 0, 1, 2, 3 | 畫面中無明顯穿模 |
| readability | uncertain | — | 主效果不存在，無法評估 |

## Model notes

- 畫面僅見背景些微光流及少許塵土效果，完全不符合龜派氣功的視覺描述。
