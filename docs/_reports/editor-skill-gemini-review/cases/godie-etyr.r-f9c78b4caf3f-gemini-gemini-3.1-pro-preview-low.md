# VFX visual review: godie-etyr.r

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.75s
- Source digest: `f9c78b4caf3fe90183a0e62b47fa5862d2f3e94762fd6ebc6e2d1d894f61c984`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 0, 1, 2, 3, 4, 5, 6 | 未見召喚式神 |
| familyMatch | uncertain | — | 主效果不存在無法比對類型 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未提供特定來源要求 |
| impactPlacement | uncertain | — | 主效果不存在 |
| temporalOrder | fail | 0, 1, 6 | 無召喚瞬間及清理過程 |
| clipping | uncertain | — | 主效果不存在，無法判定 |
| readability | uncertain | — | 主效果不存在，無法判定 |

## Model notes

- 畫面中僅見紅色特效與光圈，未見預期的式神召喚
- 因缺乏式神本體，無法確認維持時間與死亡清理
