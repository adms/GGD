# VFX visual review: godie-e00l.ex

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.43s
- Source digest: `61b38e1b0193a8ba6786c9a63f42dfa00b8dceff8937ac9964113d21507e6831`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2, 3, 4, 5, 6, 7 | 可見連續斬擊與衝刺特效 |
| familyMatch | uncertain | — | 無要求 |
| colorMatch | uncertain | — | 無要求 |
| spawnOrigin | uncertain | — | 無要求 |
| impactPlacement | uncertain | — | 無要求 |
| temporalOrder | pass | 2, 3, 4, 5, 6, 7 | 先出現斬擊再發動衝刺 |
| clipping | pass | 1, 2, 3, 4, 5, 6, 7 | 無穿模 |
| readability | pass | 1, 2, 3, 4, 5, 6, 7 | 角色與特效分明 |

## Model notes

- 未提供 reference 因此無法判斷與 godie-e002.ex 的差異。
- 有看到七斬的一部份與突進，但無法確認反彈事件。
