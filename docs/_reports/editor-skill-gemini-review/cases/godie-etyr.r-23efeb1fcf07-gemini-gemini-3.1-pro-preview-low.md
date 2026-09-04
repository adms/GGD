# VFX visual review: godie-etyr.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.25s
- Source digest: `23efeb1fcf078143dd5dfeb4529587cbb7340893f3bb79a4631d2cb5f1180967`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | uncertain | 1 | 缺少召喚瞬間範圍傷害及到期後消失的證據 |
| familyMatch | pass | 1 | 第三個角色做為召喚物 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | pass | 1 | 第三個角色在場中出現 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求 |
| temporalOrder | uncertain | 1 | 缺少到期後消失的畫面 |
| clipping | pass | 0, 1 | 未見穿模或裁切 |
| readability | pass | 0, 1 | 角色與效果關係清楚 |

## Model notes

- 預期要求維持八秒並消失，但提供的圖片僅有 180ms 和 847ms，無法確認到期後是否消失
- 召喚瞬間的範圍傷害在現有圖片中並不明確
