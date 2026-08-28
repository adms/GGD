# 魔法陣去背（第三報）根因與修復 —— Rider・木乃香 施法腳下魔法陣

> owner 2026-08-28（第三次）：「Rider, 木乃香 施展技能底下魔法陣依然沒有去背」

**⭐ 一句話根因：這一次不在資產、不在快取 —— 在 GH#767 的 `applyStockGlowAdditive`：
它把「所有發光材質」一律改成 `ALPHA_ONEONE`（忽略 alpha 的 `SRC+DEST`），而地面魔法陣
是 2–3 片同平面 primitive 疊放 × emissiveStrength 2.0 × albedo 同貼圖再疊一次
⇒ 每片以全額 RGB 相加 ⇒ 疊爆成一大團實心白（owner 看到的「白底沒有去背」）。**

全篇數字都是量到的（真渲染 A/B ＋ glb/MDX 逐位元解析），⛔ 不是推測。

---

## 1. 為什麼前兩輪沒修到 —— 因為那兩輪修的是**另外兩層**，而且它們都真的修好了

| 輪 | 修了什麼 | 驗證（本次重量） | 為什麼 owner 還是看到 |
|---|---|---|---|
| ① `a9cf7187`（08-24，GH#649） | **資產層**：25 份 glb 重轉、luma-key（alpha := max(R,G,B)） | 三顆魔法陣 glb（midchilder／oblivion／tome）逐位元乾淨：BLEND · 真 alpha · 透明區 RGB ≤15 · luma-key 簽名 **100%** | 資產好了，⛔ 但 runtime 又把混合模式改掉（見 §2） |
| ② v0.30.1（08-28，#838） | **交付層**：assets hash 進 contentVersion ⇒ 換 glb 會 bust 快取 | （主 session 已驗） | 送到了，⛔ 但送到的位元組在畫面上仍被 ONEONE 疊爆 |
| — | ⛔ **表現層從來沒被修過**：`76d098c5`（08-26 15:30，GH#767）把發光材質一律改 ONEONE，commit 訊息自己寫著「**鏈路已接上，⛔ 驗收未過**」 | 本次 A/B（§3） | ⭐ **這一層就是這一次的根因** |

⚠️ 舊稽核（`alpha-keying-rootcause_temp_20260828-0321.md` §1.3）的「沒有黑底方塊」證據
拍攝於 **08-26 00:00 —— 比 76d098c5 早 15.5 小時**，所以它是對的，但它驗的是 ONEONE 之前的世界。

### GH#780（黑色閃電）為什麼不是這一次的答案
#780 的根因是常數打錯（`0`＝ALPHA_DISABLE），`cdd8fe54` 修成 `6`＝ONEONE —— 修好之後
luma-key 的**單片**發光（閃電、光束）就對了。⛔ 但 ONEONE 對**同平面疊放**的圈/環是錯的表現：
WC3 fm3 的 blendFunc 逐字是 **`(SRC_ALPHA, ONE)`**（mdx-m3-viewer layer 表）——加法**先乘 alpha**。
光束家族的來源貼圖 alpha 平坦 255 ⇒ 兩者等價 ⇒ 光束的 246–254 亮度驗收只在 ONEONE 下成立
（luma-key 把亮度搬進了 alpha，ALPHA_ADD 會再乘一次 ⇒ 量過 86.9）。
⇒ ⭐ **同一格常數對兩族有相反的正確答案** —— 分工不能用家族名單，要用材質自己的宣告（§2）。

---

## 2. 修法：**宣告了透明度的發光材質走 ALPHA_ADD**，沒宣告的維持 ONEONE

| 檔 | 改動 |
|---|---|
| `apps/client/src/render/modelFxRig.ts` | `applyStockGlowAdditive()`：材質 `alpha < 1`（來源＝節點級 `alpha` 或 `model@1.fxAlpha`，`applyFxTint` 已乘進最終材質）⇒ `alphaMode = ALPHA_ADD (1)`；否則維持 `ALPHA_ONEONE (6)`。新常數 `BJS_ALPHA_ADD` 帶完整出處註解。⚠️ **只動了模組級函式（行 192–300 一帶）：`fillGeometry`／`acquire`／`release`／`spawn` 池化段一行都沒碰**（另一 lane `8c817f38` 的範圍避開了） |
| `content/ability-templates/tpl-locust-orb.json` | `params.alpha.default` **1.0 → 0.9** ＋ `origin`（出處引用本報告）＋ description 裡過期的「預設 1.0」散文一併更新。⭐ 這一格是**家族宣告**：圈/環/球族（WC3 static dummy × AddSpecialEffect）全是同平面疊放，整族一起走 alpha-aware 加法 —— 一格解掉 27 個節點（第〇·五守則），⛔ 不逐支填 |
| `packages/shared/src/content/templateOriginBaseline.json` | 豁免表刪 `tpl-locust-orb.alpha`（補了出處 ⇒ 棘輪變短） |
| `packages/shared/src/content/modelFxPreset.ts` | 過期註解（「預設 1.0」）更新 |
| `apps/client/src/render/stockGlowAdditive.test.ts` | 新守衛 ④：節點級 `alpha 0.9` ⇒ 發光材質必須 `ALPHA_ADD` 且 `material.alpha≈0.9`；既有 ①（無宣告 ⇒ ONEONE）就是反方向 ⇒ **兩個方向都有** |

### 為什麼是模板預設，⛔ 不是 model 文件的 `fxAlpha`
本次途中量到：模板展開會把 `tpl-locust-orb` 的 `alpha` 預設寫進每一個節點 ⇒
**`look.alpha` 永遠蓋掉 `doc.fxAlpha`**（GH#693 覆寫語意，⛔ 不相乘）⇒
model 文件那一格對模板家族**逐位元是死的**。⇒ 家族宣告的唯一有效住處＝模板預設（第〇·四）。
（一開始寫進三份 model 文件的 fxAlpha 已回退 —— 兩個住處必有一個過期。）

### Rollback（三層，都是一格）
1. **家族**：`tpl-locust-orb.params.alpha.default` 改回 `1.0` ⇒ 整族回 ONEONE。
2. **逐支**：節點自寫 `alpha: 1.0`（與缺席同義 ⇒ ONEONE）。
3. **全域止血**：`config.vfx-cleanup@1.stockGlowAdditive = false`（回 glTF BLEND，#767 之前）。

⭐ 順帶修活了 #669 批核頁登記的 rollback 開關（`params.alpha.default` 翻 0 ＝ 整族隱形）——
在一律 ONEONE 下那格 0 **逐位元是死的**（ONEONE 不讀 alpha），現在真的會隱形。
⚠️ 批核頁會出現「開關現值 0.9 ≠ 登記的 liveValue 1」的**警示行**（`features.mjs:314`）——
那是登記時的快照，非紅燈；下次 register 時更新。

---

## 3. 終端證據（真渲染 A/B，`beam-audition` 台子，出貨鏈：SimWorld → castAbility → modelFxSpawn → VfxSystem/ModelFxRig → 真 .glb）

證據圖：`docs/_reports/magic-circle-alpha_temp_20260828-1800/`

| 圖 | 狀態 | 材質實測 | 像素指標（同一把尺：飽和白＝RGB 全 >240；有色＝max>48 且 max−min>24） |
|---|---|---|---|
| `shot1_hvsh-r_BEFORE_oneone_whiteout.png` | 修前（default 1.0） | 8 材質全 `alphaMode 6·alpha 1` | 飽和白 **4,785** · 有色 2,760 —— 畫面＝一大團實心白，魔法陣被吞掉 |
| `shot4_hvsh-r_AFTER_alphaadd_circle.png` | 修後（default 0.9） | 8 材質全 `alphaMode 1·alpha 0.9` | 飽和白 **2,577**（−46%） · 有色 **7,567**（**×2.7**）—— 粉紫魔法陣（含符文）完整可辨、去背乾淨 |
| `shot2_etyr-q_BEFORE_oneone_washout.png` | 修前 | 6 材質全 `6·1` | 飽和白 1,869 · 有色 563（圈心被白爆吞掉） |
| `shot3_etyr-q_AFTER_alphaadd_circle.png` | 修後 | 6 材質全 `1·0.9` | 飽和白 1,789 · 有色 667 —— ⚠️ 這一對的像素差距小（動畫相位不同格），⭐ 主要證據是**材質狀態 6/6 翻轉**＋目視紫色格紋魔法陣完整（截圖可辨） |

**反方向（光束不動）**：09-04 龜派氣功（`tpl-beam-roll`，無 alpha 欄位）修後實測
**41 個發光材質全部仍 `alphaMode 6·alpha 1`** ⇒ 246–254 亮度驗收不受影響。

**守衛與突變**：`stockGlowAdditive.test.ts` 4/4 綠；突變（把條件改回一律 ONEONE）⇒ ④ 紅並指名
「alpha 逐位元被忽略 ＝ #669 rollback 開關是死的、魔法陣疊爆成白」；還原後綠。
`templateDefaultsHaveOrigin` ＋ 7 支 locust 家族測試全綠。client/shared `tsc` 都 0。

---

## 4. 交付與後續（主 session 的事）

- ⛔ 本 lane 依規未跑 `content:build`/`skills:sync` ⇒ **`bundle.json` 還是舊模板**。
  主 session 收尾統一 `pnpm skills:sync` 後，展開節點才會帶 `alpha: 0.9` 上線。
- 既有自寫 `alpha` 的 3 個節點（cloudstrife 0.6 幻影 · musashi 0.5 ×2）從 ONEONE 改走 ALPHA_ADD ——
  它們宣告的透明度**終於生效**（在 ONEONE 下那三格 alpha 是「寫了但不會發生」）。
- 順帶記錄（未修，屬 pre-existing）：無 tint/alpha 的 spawn 走共用容器材質時，
  `applyStockGlowAdditive` 是**就地改**共用材質（違反「一定要先 clone」的規矩）——
  模板預設 0.9 落地後 locust-orb 族一律走 clone 路，此洞對本族閉合；其他族維持現狀。
- `docs/_reports/alpha-keying-rootcause_temp_20260828-0321.md` 的 §1.3「現況乾淨」證據
  取樣於 76d098c5 之前 —— 讀那份報告時要帶上這個時間差（本報告 §1）。
