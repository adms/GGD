# VFX visual review: godie-nbbc.e

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.06s
- Source digest: `ea16e5dd478b06d5e9d4c85dd0f1e2a6f92fb136cb39b12351c8c63b09df21ef`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | pass | 1, 2 | 可見角色前方有藍色橫向氣功效果 |
| familyMatch | pass | 1, 2 | 可見橫向氣功的 VFX，符合預期 |
| colorMatch | pass | 1, 2 | 主效果為藍色 |
| spawnOrigin | pass | 1 | 氣功從施法者前方發射 |
| impactPlacement | fail | 1, 2 | 氣功效果未見擊中目標，而是穿過 |
| temporalOrder | pass | 0, 1, 2 | 先施法後出現氣功，順序合理 |
| clipping | pass | 1, 2 | 未見明顯穿模 |
| readability | pass | 1, 2 | 效果與角色關係清楚 |

## Model notes

- 預期為前方發射且碰撞一致，但畫面上氣功直接越過目標，未見碰撞效果，故 impactPlacement 判定為 fail。
