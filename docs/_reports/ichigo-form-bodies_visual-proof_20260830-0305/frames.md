# ichigo-form-bodies — 一護兩形態各只畫一套身體（GH#742 / #34）

> 📅 **證據的時間身分（GH#795）**：`HEAD=26c74bad` 工作樹
>
> ⭐ 這一行是 `visual-proof.sh --new` **拍攝當下**蓋的，⛔ 不是事後補的。

台子：**⛔ 沒有 audition 頁** —— 這個缺陷不是特效，是**模型圖元的可見性**。
台子是 `apps/client/src/render/views/hiddenPrimitives.test.ts` 的 **E 段**：
真的 `NullEngine` + 真的 `@babylonjs/loaders/glTF/2.0` + 真的出貨
`content/assets/models/imported/heroichigo.glb` + 真的出貨 model 文件 +
真的 `EntityViewRegistry.sync()`。

鏈路（逐段，⭐ 證明沒有一段是台子造的）：

| 段 | 誰 | 這一輪怎麼驗 |
|---|---|---|
| ① 內容 | `content/models/imported.heroichigo{,-bankai}.json` | 從**磁碟上的出貨檔**讀，⛔ 不是測試手捏的物件 |
| ② champion → model | `godie-h01n` / `godie-h01o` 的 `modelKey` | 從**出貨的 champion 卡**讀，並驗 `transform` 真的是同一對 |
| ③ 索引來源 | prim 分族 | ⭐ **每次從 glb 位元組重解**（⛔ 沒有凍結指紋 —— 失敗形態 ⑤） |
| ④ 渲染端 | `applyHiddenPrimitives` → `mesh.setEnabled(false)` | 斷言 Babylon 的最終 `isEnabled(false)` 與 `getVerticesData("position")` |

⭐ **量尺先自證（兩個方向，⛔ 不是單邊）**：
- 已知**有**：把兩份文件的 `hiddenPrimitives` 對調 ⇒ **紅**
  （`常態一護要藏的是卍解身體: expected [ 1, 3 ] to deeply equal [ 2 ]`）。
- 已知**沒有**：`asBase`／`asBankai` 兩邊的**可見頂點數**都要 > 400
  ⇒ ⛔「兩邊都關光了」不會讓上面的斷言靜靜地全綠（失敗形態 ④）。

---

## A/B —— 出貨渲染管線量到的可見頂點（⛔ 不是算的）

`godie-h01n` = 常態（`transform.role = base`）· `godie-h01o` = 卍解（`alternate`）。
下表由 E 段的 `drawn()` 印出，逐格是 Babylon 網格的 `isEnabled(false)` 與頂點數。

| prim | 頂點 | mat | 骨架 | **before**（今天出貨） | **after** h01n 常態 | **after** h01o 卍解 |
|---:|---:|---:|---|---|---|---|
| 0 | 74 | 0 | 腳底座 | ✅ 畫 | ✅ 畫 | ✅ 畫 |
| 1 | 540 | 0 | 常態身體 | ✅ 畫 | ✅ 畫 | ⛔ **關掉** |
| 2 | 739 | **1** | **卍解身體**（`*wan` 骨） | ✅ 畫 | ⛔ **關掉** | ✅ 畫 |
| 3 | 134 | 0 | 常態配件 | ✅ 畫 | ✅ 畫 | ⛔ **關掉** |
| 4 | 349 | 0 | 頭 | ✅ 畫 | ✅ 畫 | ✅ 畫 |
| | | | **可見頂點合計** | **1836（兩套身體疊著）** | **1097** | **1162** |

⇒ ⭐ **before 兩隻一護畫的是同一份 1836 —— 也就是常態與卍解同時穿在身上。**
after 各自 1097 / 1162，且共用的 prim0（腳底座）與 prim4（頭）兩態都在。

### 分族的兩條**互不相干**的證據（三階 LOD 各驗一次）

| 軸 | prim0 | prim1 | prim2 | prim3 | prim4 |
|---|--:|--:|--:|--:|--:|
| `*wan`（卍）骨權重佔比 | 0.000 | 0.000 | **0.608** | 0.000 | 0.000 |
| material index | 0 | 0 | **1** | 0 | 0 |

`heroichigo.glb` / `-mid` / `-small` 三階的圖元數（5）與分族**逐格相同**
（頂點 74/540/739/134/349 · 43/304/444/73/230 · 24/177/253/41/129）
⇒ 三階共用**一份**索引宣告是安全的，而任何一階漂掉 ⇒ E 段紅。

### ⚠️ 一個順帶量到的副作用（⛔ 不是這張票的 AC，但它是真的）

`ENABLED_ONLY` 會把關掉的圖元排除在包圍盒外。prim2 的 rest bbox 到 **x = 1.362**、
prim3 到 **x = 1.831**，而常態身體（prim1）只有 **x ∈ [−0.323, 0.268]**
⇒ 在此之前一護的量測寬度被另一態的身體撐開，而 #150 身高正規化與 #61 離地都吃這個。

---

## 結論

⭐ **A（after）vs B（before）在出貨渲染管線上的差是 1836 → 1097 / 1162 個可見頂點**，
而差掉的正好是**另一個形態的身體**（739 / 540+134）。這是**終端**證據：斷言讀的是
Babylon 會送進 render loop 的 `isEnabled()`，⛔ 不是任何簿記旗標、⛔ 也不是事件有沒有發。

⚠️ ⭐ **誠實的界線 —— 玩家今天還看不到**：
`content/` 的三筆改動要等 **`pnpm content:build`**（全域單一，本 lane 禁跑）
重生成 `models/_index.json` + `bundle.json` 才會生效。
在那之前伺服器端 `godie-h01o` 會因 dangling-ref 被隔離（量到的，見票的進度標記）。
⇒ 照用詞紀律：**鏈路已接上並在 headless 渲染端量到了，⛔ 未在遊戲畫面上驗收。**
