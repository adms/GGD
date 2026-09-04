# VFX visual review: godie-nbbc.w

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 5.61s
- Source digest: `4189a4a0c57116be291922cf7c584c027b04be24ff46e14236fd246dff24a090`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 0, 1 | 未見雷擊等第二個範圍效果 |
| familyMatch | uncertain | — | 未提供特效種類要求 |
| colorMatch | uncertain | — | 未提供顏色要求 |
| spawnOrigin | uncertain | — | 未提供發生源要求 |
| impactPlacement | uncertain | — | 未提供命中位置要求 |
| temporalOrder | fail | 0, 1 | 缺少雷擊效果，無法確認時序 |
| clipping | pass | 1 | 未見明顯穿模 |
| readability | pass | 1 | 效果與角色關係清楚 |

## Model notes

- 預期的雷擊範圍效果未出現
- 只有斬擊特效可見
