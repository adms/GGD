# VFX visual review: godie-nbbc.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 5.76s
- Source digest: `b41ae50fb4052c2e6c55b66409dc6bc08c745ce14e0aa16639052bd7afc56dfd`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | — | 未見直線衝擊波與瞬移斬擊的完整表現 |
| familyMatch | uncertain | — | 未提供預期 VFX 類型 |
| colorMatch | uncertain | — | 未提供特定顏色要求 |
| spawnOrigin | uncertain | — | 未提供來源要求 |
| impactPlacement | uncertain | — | 未提供命中位置要求 |
| temporalOrder | fail | — | 未見 A 式先發生與 B 式再瞬移斬擊的順序 |
| clipping | pass | 0, 1, 2, 3, 4 | 可見畫面未見明顯穿模 |
| readability | fail | — | 主效果未完整呈現，關係不清楚 |

## Model notes

- 畫面僅見角色瞬移與受擊，未見預期的直線衝擊波與交叉點傷害。
