# GH#780 拳四郎黑色閃電 —— 證據包（2026-08-27）

## ⚠️ 這兩張是什麼、⛔ 不是什麼

**是**：從**出貨的** `content/assets/models/imported/monsoonbolttarget.glb` 位元組
解出全部 6 張閃電貼圖，套出貨管線的參數（`godie-umal.r.json` 的 `tint:[1,0,0]` ×
材質宣告的 `KHR_materials_emissive_strength=2.0`），再按 Babylon 7.54.3
`Engines/Extensions/engine.alpha.js` **逐行驗過的兩條 blend 方程**各合成一張：

| 圖 | 方程（engine.alpha.js 原文） | 對應 |
|---|---|---|
| `A_alphaMode0_…黑底.png` | `case 0: alphaBlend = false`（覆寫 RGB，還寫深度） | v0.28.5 出貨的 `BJS_ALPHA_ONEONE = 0` —— **其實是 `ALPHA_DISABLE`** |
| `B_alphaMode6_…去背.png` | `case 6: blendFunc(ONE, ONE)`（相加，黑=+0） | 修復後 `= 6` —— 真的 `Constants.ALPHA_ONEONE` |

**⛔ 不是**：遊戲內渲染截圖。這一條 lane 沒有瀏覽器 —— **像素驗收未完成**，
主 session 補拍指引在下面。

## 量到的

- img0（主閃電貼圖 64×128）**41.9% 的 texel 是黑底**（maxRGB<8）——
  A 圖這些像素畫成近黑並蓋住背景（＝owner 看到的「黑色閃電沒有去背」），
  B 圖它們加 0 ＝ 與背景逐位元相同（去背）。
- 6 張貼圖 alpha 通道全部 `alpha == max(R,G,B)`（0% 不匹配）⇒ luma-key **早就做了**
  （GH#649 那族沒有漏網）—— 壞的是 alpha 在 mode 0 下**整格不被讀**。

## 主 session 補拍指引（真渲染 A/B）

1. dev client 選拳四郎（godie-umal），放 R（ChangeDNA，60s CD）變身一次。
2. 拍變身當下那 0.5s（`tpl-locust-strike` 生 `w3x.stock.monsoonbolttarget`，scale 10，紅 tint）。
3. 驗收：閃電周圍**沒有黑色矩形/黑底**；紅色閃電疊在場地上是**加亮**的。
4. 對照組（rollback 開關）：後台 `config.vfx-cleanup@1.stockGlowAdditive = false`
   ⇒ 回 BLEND（去背正常但較暗）；`= true`（出貨預設）⇒ 本修復的加法。
5. 回歸面：20-03 約束與勝利之劍光束仍亮（#767 驗收）、皮卡丘等閃電家族無黑底。
