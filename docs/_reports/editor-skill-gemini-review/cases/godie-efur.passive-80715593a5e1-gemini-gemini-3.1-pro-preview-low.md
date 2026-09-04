# VFX visual review: godie-efur.passive

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 6.78s
- Source digest: `80715593a5e124ba118e73f18c6460d32515346a4f1e65e18849bd14f847e90e`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | uncertain | 0, 1 | 僅見重複的紅色特效，無法確認循環四階段是否發生 |
| familyMatch | uncertain | — | 未提供預期的效果類型，無法比對 |
| colorMatch | uncertain | — | 未提供特定顏色要求，無法檢查 |
| spawnOrigin | uncertain | — | 未提供特定來源要求 |
| impactPlacement | uncertain | — | 未提供特定命中位置要求 |
| temporalOrder | uncertain | 0, 1 | 缺少足夠幀數以確認循環順序，且圖片雷同 |
| clipping | pass | 0, 1 | 未見明顯穿模或不當裁切 |
| readability | pass | 0, 1 | 特效與角色的關係尚可辨識 |

## Model notes

- 候選圖片中只有相同的紅色特效出現（分別在 547ms 和 1680ms）。
- 由於文字描述提及有四種不同狀態（AP、AD、防禦、魔抗）循環且可並存，但畫面中並未出現區分這四種狀態的視覺特效，因此判斷 uncertain。
