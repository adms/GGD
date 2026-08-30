# mdx→glb 保真度 lane — #803 · #841

`HEAD=` 見下方 commit 段 · 量測日 2026-08-30 · 柵欄 `tools/w3x-import/` + `docs/_reports/`

---

## ⭐ 一句話

**#803 的兩個前提都被量到不成立** —— 轉檔器沒有洗掉任何彩度（**22 顆模型 / 56 張出貨貼圖，
逐通道 Δ=0.00**），`revivehuman` 的 PRE2 `segmentColor` 是**純白**（sat 0.000）⇒ 顏色不在 PRE2。
⭐ 真正的成因是**票文那把尺**：「最亮 2% 平均 RGB」量的是輝光貼圖的**白心**，
⛔ 而顏色住在**衰減帶**。#841 在轉檔器層**已經補完 7/7**，守衛 6 tests 綠。

---

## 一、#803 —— 逐層量到的

### ① 票文的數字與它想要的數字，是**同一張貼圖的不同半徑**

逐環量 `Textures\Yellow_Glow3.blp`（32×32，就是票文引用的那一張）：

| 半徑 | 平均 RGB | sat |
|---|---|--:|
| r=0.0（**最亮 2% 落在這裡**） | (176, 176, 171) | **0.033** |
| r=0.1 | (172, 172, 162) | **0.062** ← ⭐ 票文寫的「0.066」 |
| r=0.3 | (140, 139, 110) | 0.212 |
| r=0.6 | (77, 77, 36) | **0.540** ← ⭐ 票文寫的「原作 0.47–0.54」 |
| r=0.8 | (32, 32, 2) | 0.939 |

⇒ ⭐ **票文的「現況 0.061」與「目標 0.47–0.54」是同一批位元組，量在不同半徑上。**
⛔ 沒有任何東西需要被修 —— 需要被修的是那把尺。

### ② 轉檔器的顏色保真度：**逐通道相等**

`tools/w3x-import/texture_color_fidelity.py --check`：

```
✅ 顏色保真度閘：22 顆模型 / 56 張出貨貼圖，逐通道與來源相等
```

每一張的 `Δsat = +0.0000` / `Δch = 0.00`。⇒ **#803 Scope ②（luma-key 有沒有洗掉彩度）
的答案是「沒有」**，而且現在它是一條**會紅的閘**，⛔ 不是一句散文。

出貨 `revivehuman.glb` 逐張（⭐ 兩把尺並排）：

| img | 來源 | 全圖 sat | 最亮 2% sat |
|---|---|--:|--:|
| img0 | `ReplaceableTextures\TeamGlow\TeamGlow00.blp` | 0.989 | 0.989 |
| img1 | `Textures\Yellow_Glow3.blp` | **0.435** | **0.061** ⭐ 兩把尺相反 |
| img2 | `Textures\firering4.blp` | 0.000 | 0.000 |
| img3 | `Textures\GenericGlow2_64.blp` | 0.000 | 0.000 |

⭐ **票文說「5 張裡 4 張無彩度」；實際是 4 張裡 2 張有彩度**，而其中一張（img1）
的全圖 sat **0.435** 已經滿足票文 AC① 的「≥ 0.40」。

### ③ 顏色**不在** PRE2（至少 `revivehuman` 不在）

| 模型 | PRE2 `segmentColor` 最大 sat | 顏色實際住哪 |
|---|--:|---|
| **revivehuman** | **0.000**（三段全白） | ⭐ **geoset 貼圖** `Yellow_Glow3`（已在出貨 .glb 裡） |
| awaken | 0.894 / 0.828 / 1.000 | PRE2（⛔ 未轉） |
| fragdriller | 1.000 | PRE2（⛔ 未轉）＋ `Roman1.blp`（sat 0.815，**已在 .glb**） |
| flamestrike1 | 1.000 | ⭐ `MegaBlast.blp`：全圖 sat **0.881** / 最亮 2% **0.521** |

⇒ 票文逐字寫「顏色住在沒轉的 PRE2 粒子 chunk」——
⭐ 對 `awaken`/`fragdriller` **部分成立**，⛔ 對票文自己的頭號證物 `revivehuman` **不成立**。

### ④ ⭐ 而金橘色**早就出貨了** —— 只是綁在別的模型上

`flamestrike1.glb` 的唯一貼圖 `MegaBlast.blp` 最亮 2% sat = **0.521**，
⭐ **正落在票文說的「原作 0.47–0.54」中間**。

而 `content/ability-templates/tpl-beam-roll.json` 綁的是
`revivehuman` / `netherstrike` / `awaken` / `fragdriller` —— ⛔ **沒有 `flamestrike1`**。
其中 `netherstrike.glb` 最亮 2% sat = 0.007、`revivehuman` = 0.061。

⇒ ⭐ **「光束砲不是金橘色」是一個模型綁定的問題，⛔ 不是轉檔器、⛔ 也不是 PRE2。**
⚠️ 而 CLAUDE.md 自己記著原作 09-04 那 6 具是 `h006` ＝ **`FlameStrike1.mdl` 火柱** ——
出貨的 `flamestrike1.glb` 今天就在，⛔ 零個新檔。

⚠️ **這一段在我的柵欄外**（改綁定要寫 `content/`）⇒ ⛔ 我沒有動它，只量與回報。

---

## 二、#841 —— 已完成（轉檔器層）

`f4f9bda2b` 已把 `MDX_FILTER_MODES` 補到 **7/7**，每一格帶 `why` 與出處：
fm5 `Modulate` = **相乘**（`out = dst × src` ⇒ C=黑、A=1−src，代數精確）、
fm6 `Modulate2x`、fm1/fm2 的「alpha 平坦 ⇒ 等價 OPAQUE」、表外值不靜默退回 BLEND 並列名。

守衛 `packages/shared/src/ops/w3xFilterModeContract.test.ts` —— **6 tests 綠**（本輪複跑）。

⛔ **未做（沿用該 commit 的誠實列表）**：沒有重跑產線 ⇒ 出貨 `.glb` 位元組未變
（重跑會寫 `content/`，不在本 lane 柵欄）。⇒ #841 仍是**鏈路已接上未驗收**。

---

## 三、這一輪落地的東西

`tools/w3x-import/texture_color_fidelity.py`（新）

| | |
|---|---|
| 量什麼 | ⭐ **兩個名詞的關係**：「出貨的這張貼圖，與它的來源 BLP，是不是同一個顏色」，⛔ 不是「這張貼圖有沒有彩度」（那取決於你用哪把尺） |
| 兩把尺並排 | `sat_mean`（全圖）與 `sat_top2`（最亮 2%），並在兩者相反時亮 `blind` 旗標 —— ⭐ 那正是造出 #803 假前提的形狀 |
| `--check` | 閘：`|Δsat| > 0.02` 或逐通道平均差 > 2.0 ⇒ 非零並指名那一張 |
| `--calibrate` | ⭐ **量尺自證**：已知有色的白心輝光要量到 `sat_mean ≥ 0.30` **且** `sat_top2 ≤ 0.10`；已知無色的兩把尺都要 ≈0。量不到 ⇒ exit 2，**一切結論作廢** |

⭐ 控制組的形狀**是量出來的**（照上面 `Yellow_Glow3` 的逐環剖面做），⛔ 不是憑空編的圖案；
參數挑在 `sat_top2 ≈ 0.03`，與真實貼圖的 0.061 同一個數量級，⛔ 不是「剛好過門檻」。

**突變驗證**（一條承重的線，改回來用 `Edit` ⛔ 不是 checkout）：
`glb_images()` 加一行 `.convert("L")`（＝模擬一個洗掉彩度的轉檔器）
⇒ 🔴 **15+ 張逐一列名**（`fragdriller: img0 ← Roman.blp: 顏色漂了 Δsat=-0.4036 Δch=70.64`…）。

⚠️ 開發途中自己踩到一次**假紅**，留作紀錄：第一版把 `path` 為空的 TEXS 直接跳過，
於是隊伍發光貼圖找不到同尺寸來源、被鄰居 `Yellow_Glow3`（同為 32×32）認領 ⇒ 報「顏色漂了 +0.55」。
⭐ **「path 是空的」⛔ 不等於「沒有來源」** —— `replaceableId 2` 的住處是
`w3xlib.models.TEAM_GLOW_STOCK_TEXTURE`（⛔ 不抄第二份），實測與出貨逐通道相等。

---

## 四、⭐ 給下一個人的三句話

1. ⛔ **不要再照 #803 的 Scope ① 去轉 PRE2** —— `revivehuman` 的 PRE2 是白的，轉了不會變金橘。
2. ⭐ 光束要金橘：**改 `tpl-beam-roll` 的模型綁定去用已出貨的 `flamestrike1.glb`**
   （最亮 2% sat 0.521，正中「原作 0.47–0.54」）。零個新檔、零次重轉。⚠️ 那是 `content/` 柵欄。
3. ⭐ 任何再談「彩度」的量測，先跑 `--calibrate`；讀任何 sat 數字先問**它量在哪個半徑**。
