# VFX visual review: godie-hjai.r

- Classification: **ai-rejected**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.19s
- Source digest: `340ee85759bfc91295afbe7a5f15aa83285596cd2b39d2d4d77327fa592427fd`
- Confidence: 0.900 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | fail | 2 | 未見黑色光刀斬擊，僅見部分粒子與紫色弧光 |
| familyMatch | fail | 2 | 未見斬擊刀光，僅見紫色弧光 |
| colorMatch | fail | 2 | 弧光為紫色而非黑色 |
| spawnOrigin | uncertain | — | 無明確來源要求 |
| impactPlacement | uncertain | — | 未見明確斬擊命中目標 |
| temporalOrder | uncertain | — | 特效缺失，無法確認時序 |
| clipping | pass | 0, 1, 2 | 未見明顯穿模 |
| readability | pass | 2 | 特效與角色關係清楚 |

## Model notes

- 未見預期的黑色光刀斬擊效果
- Candidate 2 僅出現不相關的紫色弧光
- 無法確認傷害或暈眩等非視覺效果
