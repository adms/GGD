# GH#697 tint 分流 —— 終端像素證據（2026-08-25）

台子：`apps/client/public/fxtint-audition.html`（`client-beam` :39673，dev-only）。
逐格數字在 `rows.json`。

## 鏈路（⛔ 沒有任何一段是這一頁造的）

出貨 `content/models/w3x.stock.monsoonbolttarget.json` → 出貨
`content/assets/models/imported/monsoonbolttarget.glb` → 真的 Babylon glTF 載入器
→ 真的 `ModelFxRig.spawn()`（節點級 `tint`，GH#693）→ 真的 `applyFxTint`
→ 真的 WebGL 幀 → `getImageData` 逐通道加總。

**左半 = 不著色（對照組）· 右半 = `tint:[1,0,0]`**，同一份 glb、同一個 rig、同一幀。

## ⭐ 量尺先自證（⛔ 不是「記得先看一眼」，是程式）

已知底色各渲一幀再讀回來：純紅 → `R=204 G=0 B=0`；純藍 → `R=0 G=0 B=204`
（兩邊都 93,312 個亮像素 ＝ 半個畫布）。⇒ 通道順序、`preserveDrawingBuffer`、
`drawImage`＋`getImageData` 這一串**全部**驗過。任一條不成立這一頁會自己標記作廢。

## 量到的（tick 8 起穩定，三格一致）

| | 亮像素 | R | G | B | **R/B** |
|---|---:|---:|---:|---:|---:|
| 左·原色 | 455 | 97.6 | 131.9 | **169.5** | **0.576**（藍） |
| 右·染紅 | 291 | **134.9** | 15.6 | 15.6 | **8.648**（紅） |

⇒ **R/B 翻轉 15 倍**；R 均值 97.6 → 134.9、B 均值 169.5 → **15.6**。
修好之前兩半是**逐位元相同**的（V6 lane 量到出貨節點寫 `[1,0,0]` 而閃電是藍的）。

## ⚠️ 誠實限制（四條）

1. **`tick 0` 兩半都是 0 亮像素** —— 那是 `KHR_parallel_shader_compile`：
   PBR 素材的 `isReady()` 要等瀏覽器回報編譯完成，而那個回報只在**事件迴圈的
   下一輪**送達。⇒ 這一頁的 tick 迴圈**每一格都 `await`**；一個緊迴圈連渲 60 幀會
   得到「幾何、材質、取景全部正確而 0 亮像素」的假結論（我第一版就是，量到了才改）。
2. **染紅之後亮像素從 455 掉到 291**（−36%）。這是**乘法語意的必然**：原作
   `SetUnitVertexColor` 是乘進貼圖，而這一族貼圖是藍的（可見像素均值
   R32 G91 B134，只有最亮的核心是白的 254/255/255）⇒ 藍邊被乘掉、白核心留下。
   ⛔ 這**不是**缺陷，而且它正是「⛔ 不可以用亮像素數當驗收標準」的理由。
3. **G/B 沒有歸零（15.6）** —— 那是 albedo × 光照那一項與混合的殘留，
   ⛔ 不是自發光。`emissiveColor` 現場量到逐材質都是 `1,0,0`（見 `rows.json` 的 `diag`）。
4. ⛔ **沒有存 PNG 擷圖**：canvas 的 data-URL 要經過工具鏈回傳才落得了地，
   而那一次傳輸把 base64 弄壞了（15,096 chars vs 應有的 15,072 ⇒ 解碼 broken stream）。
   ⇒ 這份報告的證據是**數字**（`rows.json`，含量尺自證）＋ **可重跑的台子**。
   要看圖：`bash` 起 `client-beam`（:39673）開 `/fxtint-audition.html`，
   畫面上左邊是藍色雷柱、右邊是紅色雷柱（本 session 目視確認過）。
