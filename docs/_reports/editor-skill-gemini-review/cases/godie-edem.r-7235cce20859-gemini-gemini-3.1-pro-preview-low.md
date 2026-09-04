# VFX visual review: godie-edem.r

- Classification: **needs-human-review**
- Authority: **advisory-only** (not gameplay truth or human acceptance)
- Provider: **google-gemini**
- Model: `gemini-3.1-pro-preview`
- Reasoning effort: low
- Response channel: gemini-candidate
- Inference: 5.96s
- Source digest: `7235cce20859da9081e696de8c79346d545ac404e6f3501ca64fde21583a98c4`
- Confidence: 0.800 (minimum 0.85)

## Checks

| Check | Status | Evidence frames | Reason |
| --- | --- | --- | --- |
| effectPresence | uncertain | — | 無法從畫面判斷千鳥命中及敵人的燃燒標記。 |
| familyMatch | uncertain | — | 無法確認特效是否為麒麟。 |
| colorMatch | uncertain | — | 未提供顏色要求。 |
| spawnOrigin | uncertain | — | 未提供來源要求。 |
| impactPlacement | uncertain | — | 未提供命中位置要求。 |
| temporalOrder | uncertain | — | 缺乏足夠幀判斷觸發條件的時序。 |
| clipping | pass | 0, 1 | 畫面中未見明顯穿模。 |
| readability | pass | 0, 1 | 主效果與角色關係清楚。 |

## Model notes

- 預期條件包含『千鳥命中帶燃燒標記的敵人』與『引發麒麟』，無法僅從圖片確認。
- 整體結果因多個必要檢查為 uncertain 而為 uncertain。
