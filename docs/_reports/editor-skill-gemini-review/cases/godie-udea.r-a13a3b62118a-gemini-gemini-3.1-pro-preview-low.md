# VFX visual review: godie-udea.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 7.37s
- Source digest: `a13a3b62118afb357203fdd8838e9c556105c4e7bbfef189cf0c05ca2b100017`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | uncertain | 1, 2, 3, 4 | 主效果為連鎖，圖片中僅見散落的小圓點，未見明顯的連鎖光束或路徑。 |
| familyMatch | uncertain | — | 未提供明確的 VFX 類型以供比對。 |
| colorMatch | uncertain | — | 未提供特定顏色要求。 |
| spawnOrigin | uncertain | — | 未提供特定來源要求。 |
| impactPlacement | uncertain | — | 未提供命中位置要求。 |
| temporalOrder | uncertain | — | 無法確認連鎖過程，時間順序不明。 |
| clipping | pass | 1, 2, 3, 4 | 未見明顯穿模或裁切問題。 |
| readability | pass | 1, 2, 3, 4 | 特效與角色及地面的相對關係清楚可辨。 |

## Model notes

- 預期文字中提到的連鎖效果在候選圖片中無法明確識別，只有類似氣泡或小圓點的特效。
- 缺乏更明確的視覺特徵描述，使得比對困難。
