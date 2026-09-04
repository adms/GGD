# VFX visual review: godie-hart.r

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.59s
- Source digest: `1876ede45bec92f6ea3a88ec67fa668ab0a621b97f111f1758dd36fb0bb1833d`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 1, 3, 5, 7 | 只有大量月牙和一次光柱，未見七次對齊揮砍 |
| familyMatch | uncertain | — | 未提供 |
| colorMatch | pass | 7 | 可見黃藍終結光柱 |
| spawnOrigin | uncertain | — | 未提供 |
| impactPlacement | uncertain | — | 未提供 |
| temporalOrder | fail | 1, 2, 3, 4, 5, 6, 7 | 未見七次傷害對齊，只有大量月牙 |
| clipping | pass | 1, 7 | 未見明顯穿模 |
| readability | pass | 1, 7 | 光柱和月牙與角色關係清楚 |

## Model notes

- 畫面中出現大量月牙代替揮砍動作，違反了不得用大量月牙代替的規定
- 未見七次逐擊對齊施法者揮砍與目標受擊的表現
- 最後確實有播放黃藍光柱
