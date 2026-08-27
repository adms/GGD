# 去背（alpha keying）根因稽核 —— Rider EX 地上魔法陣

> owner 2026-08-28：「Rider EX 地上魔法陣沒有去背透明，**你已經不是第一次沒去背乾淨**，請深入檢討根因改善」
>
> ⚠️ 這份報告**不是**修一張圖。它回答三題：那一張是誰、產線哪裡漏、**為什麼同一個坑會重複**。
> ⭐ 主結論在 §4：**那張圖 2026-08-24 就修好了，而修好的位元組送不到 owner 的瀏覽器** ——
> 這一族缺陷真正沒有閘的地方是**交付**，⛔ 不是轉檔。

全篇數字都是量到的（獨立的 GLB/PNG/MDX 解析器 + 四顆 stock MPQ），⛔ 不是轉檔器的自我回報。

---

## 1. 定位：那一張是 `imported.midchildernanohaaura`

| 問 | 答 | 出處 |
|---|---|---|
| Rider 是誰 | **`godie-hvsh`「梅杜莎 - Rider」**，`modelKey: imported.herorider` | `content/champions/godie-hvsh.json` |
| EX 是哪一支 | `godie-hvsh.ex`「48-002 **騎英之疆繩MAX**」＝ R（48-04 騎英之疆繩）的 MAX 型態；EX 本身是 `tpl-buff-self`，**沒有自己的地面演出** | `content/abilities/godie-hvsh.ex.json` |
| 地上魔法陣哪來的 | `godie-hvsh.r` 的第 3 個 `spawnModelFx`：`modelKey: imported.midchildernanohaaura` · `scale 1.5` · `tint [1.0, 0.3922, 0.3922]` · `distance 1.0` · `lifeSec 3` | `content/abilities/godie-hvsh.r.json` |
| 原作對照 | 普查逐字叫它 **「騎英魔法陣」**，rawcode **`h02D`** · `scale 1.5` · `tint [255,100,100]` · trigger **`Initate Crazy`**（＝EX 模式） | `tools/locust-census/mdl-families.json`（family 34） |
| 檔案 | `content/models/imported.midchildernanohaaura.json` → `content/assets/models/imported/midchildernanohaaura.glb`（154,872 B） | — |
| 原始 MDX | `tools/w3x-import/out/GoDieEX22s/raw/MidchilderNanohaAura.mdx` —— **2 個材質，兩個都是 filterMode 3（Additive）**、`shadingFlags 0x11`，貼圖 `MidchilderDivineA.blp` / `MidchilderDivineB.blp` | — |

⚠️ 同一顆 mdx 另外還服務 **`attach.ex.midchilder-aura`**（`content/vfx/attach.ex.midchilder-aura.json`，
JASS `war3map.j:8352 Trig_EX_burst_Actions`），今天綁在 `godie-h020.ex` / `godie-hjai.ex`
——⛔ **不在 hvsh 上**。所以 Rider 那一格走的是 `spawnModelFx`，⛔ 不是掛件。

### 1.1 逐欄量出來的材質狀態（**現在的出貨檔**）

| 材質 | alphaMode | emissive | 貼圖 | 尺寸 | alpha 逐位元 == max(R,G,B) | 近黑(lum<16) | **alpha≥128 且近黑** |
|---|---|---|---|---|---:|---:|---:|
| `mat0` | **BLEND** | ✅ `emissiveFactor [1,1,1]` ＋ `KHR_materials_emissive_strength 2.0` | image0 (PNG) | 256² | **100.0 %** | 53.9 % | **0.00 %** |
| `mat1` | **BLEND** | ✅ 同上 | image1 (PNG) | 256² | **100.0 %** | 83.4 % | **0.00 %** |

`doubleSided: true`、`baseColorFactor` 不存在（吃 `baseColorTexture`）、`alphaCutoff` 不存在。
⇒ ⭐ **今天這一份是乾淨的**：黑底 alpha = 0，luma-key 100 % 命中，畫不出任何一個不透明的黑像素。

### 1.2 ⛔ 而**上一版**正是 owner 描述的那個東西

`scratchpad/glb-backup/midchildernanohaaura.glb`（2026-07-23 的未版控備份）逐位元量：

| 材質 | alphaMode | alpha 直方圖 | alpha≥128 且近黑 |
|---|---|---|---:|
| `mat0` | BLEND | **100 % 落在 alpha = 255** | **53.90 %** |
| `mat1` | BLEND | **100 % 落在 alpha = 255** | **83.37 %** |

⇒ ⭐ **一塊 256×256 的實心黑方片，上面畫著粉紫魔法陣** —— 逐字就是「沒有去背透明」。
修在 `a9cf7187`（2026-08-24 02:32，GH#649，25 份重轉）。

### 1.3 現況的終端證據

`docs/_reports/tail_visual-proof_20260826-0000/shot5_hvsh-r_48-04_midchilderaura_bright.png`
（2026-08-26 的真渲染 audition，真 SimWorld → 真 `castAbility` → 真 `modelFxSpawn` → 真 `.glb`）：

- 圓環內外的地面像素**都是 `(52,54,67)`**（逐點取樣 y=140/180/220/260/300 × x=30…530）。
- 比地面更暗的像素全圖 **2,149 / 176,400**；同一台量尺下 shot6（grandorcaura）是 531、shot3 是 862。
  ⇒ ⭐ **沒有黑底方塊**。

---

## 2. 產線：WC3 filterMode → glTF 的**實測**對照表

轉檔鏈：`tools/w3x-import/w3xlib/models.py::convert_all()` → `w3xlib/gltf.py::convert()`。
決定去背的只有兩個輸入：**MDX 材質層的 `filterMode`** 與 **`_alpha_hint(貼圖)`**。

### 2.1 `_alpha_hint()`（`w3xlib/models.py:95-108`）

```
沒有 A 通道                       → "opaque"
alpha 最小值 ≥ 250                → "opaque"     ← 平坦不透明
95 % 以上落在 [0,15]∪[240,255]     → "mask"
其餘                              → "blend"
```

### 2.2 `gltf.py::gltf_material()` 的分支（`w3xlib/gltf.py:437-546`）

```
has_opaque_base = any(l.filter_mode == 0 for l in layers)      # :451
disp = 第一個 fm0 的 real layer，否則 real[0]                   # :465  ⇒ 一份材質只畫一層
if fm >= 3 and not has_opaque_base:                             # :468
      emissive + BLEND；hint=="opaque" 時把貼圖 luma-key（alpha := max(R,G,B)）  # :476
else: baseColorTexture = disp
      has_opaque_base            → OPAQUE                       # :486
      fm == 1  → hint=="blend" ? BLEND : MASK(0.5)              # :492
      fm == 2  → hint=="mask"  ? MASK(0.5) : BLEND              # :497
      fm == 0 且 hint=="mask"   → MASK(0.5)                      # :502
```

### 2.3 ⭐ 實測對照表（238 / 423 份出貨 .glb 成功 join 回它的 MDX 來源）

分母：`content/assets/models/**/*.glb` 共 **423** 份。
join 得回 WC3 來源的 **248** 份 ＝ **227** 份靠地圖 raw mdx（`out/GoDieEX22s{,-src}/raw/*.mdx`，236 份全解 0 錯）
＋ **21** 份額外靠 stock MPQ（`convert_stock_model.py::STOCK_MODELS`，22 條裡只有 `flamestrike1` not-in-mpq）。
其中 **10** 份的來源 MDX **0 個材質**（純 PRE2 emitter 模型，出貨的是 `bake_emitter_quads()` 烤的替身面片）
⇒ 下表的分母是剩下的 **238** 份。
⛔ join 不到的 **175** 份是 KayKit props / scenery / hex / 體素英雄等**非 w3x 資產**（沒有 filterMode 這個概念）
＋ 13 份 imported（來源 MDX 不在磁碟上）。

| MDX 材質的 fm 組合 | WC3 語意 | 出貨 glTF alphaMode | 材質數 | 其中「alpha 平坦 255（**完全沒去背**）」 |
|---|---|---|---:|---:|
| `[1]` | Transparent（alpha test） | MASK 144 · BLEND 20 | 164 | ⚠️ **56** |
| `[0]` | None（不透明） | OPAQUE 129 | 129 | 83（✅ 正確） |
| `[3]` | **Additive**（黑＝透明） | BLEND 117 | 117 | ⭐ **0** |
| `[0,2]` | 不透明底 ＋ Blend 疊加 | **OPAQUE 69** | 69 | ⛔ 疊加層**整層被丟掉** |
| `[4]` | AddAlpha | BLEND 27 | 27 | ⭐ **0** |
| `[2]` | Blend | BLEND 12 | 12 | ⚠️ **1**（`tectonicfury.glb:mat0`） |
| `[5]` | **Modulate（相乘／變暗）** | BLEND ＋ **emissive**（＝相加／變亮） | 6 | 0 |
| `[0,1]` | 不透明底 ＋ Transparent | OPAQUE 1 | 1 | ⛔ 疊加層被丟掉 |
| `[6]` | Modulate2x | —— | **0** | ⛔ **沒有分支**（今天沒用到，用到就會走進 additive 那一支） |

### 2.4 今天**還沒有**被處理的四個 fm 缺口

| # | 缺口 | 程式位置 | 量到的規模 | 症狀 |
|---|---|---|---:|---|
| ⓐ | **luma-key 只救 `fm >= 3`** —— fm 1 / fm 2 的貼圖若 `hint=="opaque"`（alpha 平坦），MASK 一個像素都切不掉、BLEND 用 alpha 255 畫 ⇒ **實心** | `gltf.py:468` 的 `fm >= 3` | fm1 **56** 材質 · fm2 **1** 材質 alpha 平坦 255 | 該去背的沒去背（今天中招的都是角色皮膚圖，⛔ 但機制對特效面片一樣成立） |
| ⓑ | **`has_opaque_base` 一票否決** —— 材質裡只要有**一層** fm0，整份材質變 OPAQUE，`disp` 只取一層 ⇒ 其餘每一層**靜默消失**（含 additive 輝光） | `gltf.py:451` / `:466` / `:486` | `[0,2]` **69** ＋ `[0,1]` **1** ＝ **70 個材質 / 46 份 glb** | 原作的疊加輝光／布料細節整層不見 |
| ⓒ | **Modulate 被當成 Additive** —— fm 5/6 是**相乘（變暗）**，卻走進 `fm>=3` 的 emissive 加法分支 | `gltf.py:468`（`fm >= 3` 把 5、6 一起收進來） | fm5 **6** 材質（`deathwave.glb` ×1 · `netherstrike.glb` ×5） | 語意**反向**：該讓畫面變暗的東西在發光 |
| ⓓ | **fm 6 完全沒出現過** ⇒ 沒有任何一份出貨資料替它背書 | 同上 | 0 | 下一批匯入撞到就是靜默走錯分支 |

### 2.5 ⛔ 產線裡**唯一**的「有沒有去背」判決是**單邊的尺**

`tools/w3x-import/convert_stock_model.py:182-213` `texture_shape_report()`：

```python
"verdict": "LUMA-KEY-NEEDED" if lstd < 1.0 and astd > 1.0
           else "shape-in-rgb"
```

它只問**一個方向**：「RGB 平坦而 alpha 有形狀嗎？」（＝`CartoonCloud` / `Dust5A` 那一族，
`docs/_reports/locust_scan/mdl-params.md` §2a / §8 記的病）。
⛔ **反方向 —— 形狀住 RGB、黑底、alpha 平坦不透明 —— 掉進 `else`，而 `else` 的名字叫
`"shape-in-rgb"`，讀起來像「健康」。** 而那正是 Rider 魔法陣壞掉時的樣子。

⚠️ 而且它 `read_stock()` 才拿得到位元組 ⇒ **只驗 stock MPQ 模型**，
地圖內建的那 **227 份 imported 模型從來不經過它**（其中就有 Rider 的魔法陣）。

⇒ ⭐ 逐字對上 CLAUDE.md 記過的那條：
「**一把只驗過單邊的尺，不算自證過**」「⭐ 判準：`calibrate()` 要驗**兩個方向**」。

---

## 3. 全體受害者（③）

### 3.1 判準的演進（⛔ 前兩個判準都會誤判，寫下來是為了不要再用）

| 判準 | 命中 | 為什麼**不能用** |
|---|---:|---|
| `alphaMode==OPAQUE 且 貼圖近黑>40%` | 51 / 423 | ⛔ **絕大多數是角色**：頭髮／黑衣／atlas 未使用區本來就是黑的。黑在角色圖上是**美術**，⛔ 不是背景 |
| 再加「只算 UV 取樣得到的 texel」 | 33 / 423 | ⛔ 仍然是角色為主。UV 覆蓋只擋掉「沒被貼到的空白」，擋不掉「黑色的美術」 |
| ⭐ **來源 fm 說「黑必須是透明」（fm 3/4 且沒有 fm0 層）＋ 出貨貼圖仍畫得出不透明黑像素** | **見下** | ⭐ 這不是啟發式：`fm≥3` 是 MDX 裡的**事實**，⛔ 不是對美術的猜測 |

### 3.2 用第三個判準量到的結果

| 類別 | 數量 | 說明 |
|---|---:|---|
| 出貨 .glb 總數（`content/assets/models/**`） | **423** | 其中 `imported/` **261** |
| 能 join 回 WC3 來源的 | **248**（其中 **238** 的來源有材質、10 份是純 emitter 模型） | 見 §2.3 的分母說明 |
| **additive 來源（fm3/4）而出貨貼圖仍有 >2% 不透明黑像素** | **4 個材質 / 4 份檔** | `sd2.glb:mat1` 22.6 % · `sd2-mid` 21.9 % · `sd2-small` 21.2 % · `crescent.glb:mat1` 6.9 % —— ⚠️ **逐張看過圖：四張都是角色皮膚 atlas**（`sd2`＝角色、`crescent`＝角色），黑色是美術不是背景 ⇒ **真陽性 0** |
| additive 來源而 **alpha 平坦 255（完全沒 key）** | ⭐ **0** | ＝ GH#649 那一族**今天在出貨樹上是修好的** |
| ⛔ **疊加層被 `has_opaque_base` 靜默丟掉** | **70 材質 / 46 檔** | ⚠️ 這是**另一種**「說了但不會發生」：原作有的一層在 GGD 逐位元不存在 |
| ⛔ **Modulate 走成 Additive** | **6 材質 / 2 檔**（`deathwave` · `netherstrike`） | 語意反向 |
| ⚠️ fm1 + alpha 平坦 ⇒ MASK 切不掉任何東西 | **56 材質** | 今天全是角色（正確結果），⛔ 但機制對特效面片會直接變成方塊 |
| 21 份 stock 特效模型（含今天 #838 匯入的 12 顆） | 逐材質量過 | ✅ 不透明黑像素 ≈ 0（唯一例外 `mirrorimagecaster:mat0` 19.4 %，而它是**單位皮膚**被 additive 疊出殘影，屬設計） |

⇒ ⭐ **結論：owner 點名的那一族缺陷，在今天的 repo 裡真陽性是 0。**
⛔ 那正是為什麼下面第 4 節才是真正的根因 —— 問題不在「有沒有修」，在「**修的東西送不送得到**」。

---

## 4. ⭐⭐ 根因：修好的位元組**送不出去** —— 交付層是 immutable 快取

這是本次稽核最重要的發現，而且它**逐字寫在程式碼的註解裡、當成「殘餘風險」被接受**，然後就發生了。

### 4.1 鏈路（四段，每段各自都是對的）

| 段 | 程式 | 做什麼 |
|---|---|---|
| ① | `apps/client/src/render/AssetManager.ts:241-249` | 每一顆 `.glb` 的位元組抓取都被 `withContentVersion()` 蓋上 **`?h=<contentVersion>`** |
| ② | `deploy/helm/ggd/files/nginx.conf:197-200` ＋ `:548-566` | `map $arg_h $content_cache { "" "no-cache"; default "public, max-age=31536000, immutable"; }` ⇒ ⭐ **只要 `?h=` 非空就是「一年、immutable」** |
| ③ | `packages/shared/src/content/hash.ts:36-39` | `contentVersion = "cv_" + sha256({每個 collection 的 hash})`，而 collection hash 只由 **JSON 文件**的 `{id, hash}` 推導 |
| ④ | ⇒ ⛔ **`content/assets/**` 的位元組對 `contentVersion` 貢獻 0 bit** |

⚠️ `hash.ts:36` 的註解逐字寫著「`cv_<12 hex>` — a pure function of every collection hash
(**thus of all content**)」—— ⭐ **那半句對二進位資產是假的**（第三守則：一句活過保存期限的散文）。

### 4.2 它已經發生了，而且就是這一顆檔

| | |
|---|---|
| `git show --stat a9cf7187` | **25 份 `.glb` ＋ `content/assets/model-budget/report.json`** ——⛔ **零份 collection 文件**、⛔ 沒有 `manifest.json`、⛔ 沒有 `bundle.json`、⛔ 沒有任何 `_index.json` |
| `a9cf7187^:content/manifest.json` | `cv_cec903c51bf9` |
| `a9cf7187:content/manifest.json` | **`cv_cec903c51bf9`（一模一樣）** |

⇒ ⭐ **修好的魔法陣是用「跟壞掉那一份完全相同的 URL」出貨的，而那個 URL 已經被每一個瀏覽器
以 `max-age=31536000, immutable` 存了一年。**
⇒ 任何在 2026-08-24 之前載過這顆 glb 的瀏覽器，會**繼續畫那塊黑方塊**，
直到某一次**與這件事完全無關**的內容編輯把 `cv_` 滾掉為止。

實測後續：`cv_` 在 2026-08-27 滾成 `cv_77db21d7c957`、2026-08-28 滾成 `cv_ae0a4e98906c`
（`41a2ca19` / `73d9d1cd`）。⇒ **08-24 → 08-26/27 這段時間裡，這個修復對任何回訪玩家都不存在。**

### 4.3 ⛔ 而寫在旁邊的緩解措施**本身是錯的**

`apps/client/src/content/assetVersion.ts:27-31` 逐字：

> Residual risk, stated plainly: a binary replaced IN PLACE at the same path with no doc edit
> anywhere in the tree leaves contentVersion unmoved, and that asset would then be served from
> cache as immutable. The fix belongs in the content build (fold asset bytes into the manifest
> hash), not here — see the note in the lane hand-off. **Until then, `content:build` must be
> re-run for any asset swap.**

⭐ 兩件事都要說：
1. 這句是**判準**（「要記得重跑」），⛔ 不是閘 —— 而 `a9cf7187` 沒有重跑，一如 CLAUDE.md 記過的每一次。
2. ⛔⛔ **而且就算重跑也沒用**：`contentVersion` 是 collection **文件** hash 的函式（`hash.ts:36`），
   換一顆 `.glb` 而不動任何文件時，`content:build` 重跑出來的 `cv_` **逐字相同**。
   ⇒ 這條緩解措施在它被寫下的那一刻就是無效的，而且**沒有任何東西會因此變紅**。

---

## 5. 三題的答案

### Q1 為什麼「同一個坑會重複」？

⭐ **三個獨立的原因，⛔ 不是同一個**：

| # | 原因 | 出處 |
|---|---|---|
| **① 修復的範圍是一張手打的名單，⛔ 不是重跑產線** | `tools/w3x-import/reconvert_zero_pixel.py:63-75` 的 `TARGETS` 是 **25 個手打的檔名**，由一次「零像素普查」得來。轉檔器（`gltf.py`）修好了，⛔ 但另外 ~200 份 imported .glb **沒有被重轉** ⇒ 修好的集合**恰好等於某個人打過的字**。同病而當時不是零像素的檔，原封不動 | `reconvert_zero_pixel.py:63` |
| **② 唯一的「去背判決」是單邊的尺，而它的 `else` 分支叫「健康」** | `convert_stock_model.py:211-213`：`LUMA-KEY-NEEDED if lstd<1.0 and astd>1.0 else "shape-in-rgb"`。反方向（形狀住 RGB、黑底、alpha 平坦）落進 `else`。⚠️ 而且它只跑 stock MPQ 模型，217 份地圖內建模型**根本不經過它** | `convert_stock_model.py:182-213` |
| **③ 產線對 7 種 filterMode 只有 4 條分支** | fm 1/2 沒有 luma-key 救援（`gltf.py:468` 的 `fm >= 3`）；`has_opaque_base` 一票否決把疊加層丟掉（`:451`/`:466`/`:486`）；fm 5/6 走進 additive 分支（相乘被畫成相加） | `gltf.py:451,466-468,486-503` |
| **④（本次新發現，最貴的一個）修好了也送不到** | §4：`.glb` 用 `?h=<contentVersion>` 走 immutable 一年快取，而 `contentVersion` 不含資產位元組 ⇒ 「換一顆 glb」是一次**送不出去**的修復。緩解措施是散文，而且**內容是錯的** | `AssetManager.ts:241` · `nginx.conf:197` · `hash.ts:36` · `assetVersion.ts:27` |

⇒ ⭐ 一句話：**每一層都在問「名詞」（這顆 glb 畫不畫得出東西 / 這張圖形狀住哪），
沒有一層在問「關係」（來源說黑要透明，出貨有沒有照做 / 修好的位元組有沒有到玩家手上）。**

### Q2 有沒有既有守衛在管？為什麼沒叫？

| 守衛 | 它問什麼 | 為什麼對這件事**結構上失明** |
|---|---|---|
| `packages/shared/src/content/schema/effects/modelFxStagingContract.test.ts:486-546`（⑥⑦） | 「每一份 `imported/*.glb` 有沒有**≥1 個可畫的 primitive**」 | ⭐ 只有「畫不出東西」這一個方向。**「畫出了不該畫的東西（一塊黑方塊）」它問不出來** —— 一塊實心黑方片是 1/1 可畫 primitive，⭐ 它會**綠得很開心** |
| `packages/shared/src/content/vfxDocsBirthVisibility.test.ts` | 掃 **`content/vfx/` 的文件**：peak alpha ≤0.05 · sizeStops 歸零 · additive 疊全黑 · ribbon 零寬 · modulate 恆等 | ⭐ 它讀的是**粒子/緞帶文件的數字**，⛔ **從來不打開任何一顆 `.glb`**。魔法陣是 mesh + 貼圖，不在它的分母裡 |
| `packages/shared/src/content/modelTexture.test.ts` | 「有沒有 glb 內嵌 8×8 灰色佔位圖」＋ 身高釘子 | 只問「有沒有貼圖」，⛔ 不問「貼圖的黑底有沒有被 key 掉」 |
| `modelGeosetAlpha.test.ts` / `runtimeAlphaBackfill.test.ts` | GEOA 幾何被剝掉沒 / census↔內容的 α 對帳 | 兩個都不看材質的 `alphaMode` 或貼圖的 alpha 通道 |
| `apps/client/src/render/vfx/arcGlowRenders.test.ts` | Arc 家族三個具體病 | 只管那一族 |
| `scripts/visual-proof.sh` | 動到畫面層而沒有終端證據 ⇒ 紅 | ⭐ 它是 **diff 閘** —— 「已經出貨的壞」不會有 diff 碰它 ⇒ 永遠不紅（CLAUDE.md 自己列的洞 **c**） |
| **交付層（§4）** | —— | ⭐ **一條都沒有。** 沒有任何測試斷言「換了 `content/assets/**` 的位元組 ⇒ `contentVersion` 一定要動」 |

⇒ ⭐ 這正是 CLAUDE.md 綠燈假來源 **⑫**（只驗名詞不驗關係的「反方向」）與 **⑪**（兩條對的守衛，
組合是空的）的教科書實例：`modelFxStagingContract` 從「畫不出來」那一頭走，
**永遠走不到「畫錯了」那一頭**。

### Q3 建議的閘長什麼樣

⭐ **兩支，缺一支都補不完**（一支管轉檔正確性，一支管交付）。

#### 閘 A —— `w3xAlphaKeyingContract.test.ts`（新，住 `packages/shared/src/content/`）

| | |
|---|---|
| **掃什麼** | 每一份出貨 `content/assets/models/**/*.glb`，join 回它的 WC3 來源（`tools/w3x-import/out/*/raw/*.mdx` ＋ `convert_stock_model.py::STOCK_MODELS` 走 MPQ）拿到**每個材質每一層的 `filterMode`** |
| **判準①（本案）** | 來源材質「黑必須是透明」（有 fm ∈ {3,4} 的層、且**沒有** fm0 層）⇒ 出貨材質必須 `alphaMode == "BLEND"` **且** 貼圖在 **UV 覆蓋到的 texel** 上 `alpha≥128 且 lum<16` 的比例 ≤ **2 %**。⭐ 判準的前提是 MDX 裡的**事實**，⛔ 不是「這張圖有多黑」的猜測 |
| **判準②（fm1/fm2 缺口）** | fm ∈ {1,2} 且貼圖 alpha 平坦（min ≥ 250）⇒ 那份材質**逐位元等於 OPAQUE** ⇒ 要嘛走 luma-key，要嘛進豁免表**帶一個能被反駁的理由** |
| **判準③（疊加層被丟）** | 材質同時有 fm0 與其他 fm 的層 ⇒ 出貨只畫一層 ⇒ 逐筆列出「原作有幾層、GGD 畫幾層」，差額進**只能變短的棘輪**（今天基準 70 材質 / 46 檔） |
| **判準④（Modulate）** | fm ∈ {5,6} ⛔ 不可以走 emissive 加法分支 —— 今天 6 個材質，先進棘輪，修好一個少一列 |
| **⛔ 不可以靜默跳過** | join 不到來源的 .glb 要**逐檔列名**進一張明示的清單（今天 175 份，其中 162 份是非 w3x 資產、13 份是來源 MDX 不在磁碟）。⚠️ 「跳過」與「全過」長得一模一樣 —— fail-open 沒錯，靜默才是缺陷 |
| **⭐ 量尺自證（兩個方向，取代一次性突變）** | 測試內自造 **兩份** 合成材質：**(a)** additive 來源 ＋ 黑底 ＋ alpha 平坦 255 ⇒ 斷言檢查器**抓得到**；**(b)** 一份**刻意就是不透明**的來源（fm0、深色美術，例：角色黑髮/黑衣 atlas）⇒ 斷言檢查器**放行**。⛔ 少了 (b) 這把尺又是單邊的 |
| **誤判怎麼避免** | ①**只在來源 fm 說黑要透明的地方**套嚴格規則（角色 fm0 材質根本不進這條路）②只算 **UV 覆蓋到的 texel**（atlas 空白區不算）③豁免表是 `Map<檔名, 理由>` 且**有到期偵測**（修好了那一列必須刪掉，⛔ 名單只能縮小） |
| **成本** | 讀 .glb / .mdx 位元組即可，⛔ 不需要 WebGL、⛔ 不需要 Babylon。本次稽核在本機跑完 423 份 < 20 秒 |

#### 閘 B —— `assetBytesRollContentVersion.test.ts`（新，⭐ 這一支才是治「送不到」的）

| | |
|---|---|
| **問題** | `contentVersion` 是 collection **文件** hash 的函式（`hash.ts:36`），而 `.glb` 用 `?h=<contentVersion>` 走 **immutable 一年**（`nginx.conf:197`）⇒ ⭐ 換資產不換 URL |
| **正解（結構性）** | 把 `content/assets/**` 的位元組摘要**折進 manifest** —— 例如 manifest 多一格 `assetsHash`，`contentVersion` 改成 `sha256({collections…, assetsHash})`。⭐ 這樣「換一顆 glb」自動換 URL，⛔ 不必記得任何事 |
| **閘（在正解落地之前也要有）** | 一條測試：把 `content/assets/**` 的檔案清單＋大小＋mtime-independent 內容摘要算成一個值，釘在一份 fixture 裡；它變了而 `content/manifest.json` 的 `contentVersion` **沒變** ⇒ **紅**，訊息指名「你換了資產但 URL 沒有換，回訪玩家看不到」 |
| **突變驗證** | 把 `midchildernanohaaura.glb` 換回 `scratchpad/glb-backup/` 那一份（或任何一顆 glb 改一個 byte）而不動任何文件 ⇒ 閘 B 必須紅 |
| **順手要修的散文** | `hash.ts:36` 的「thus of **all content**」與 `assetVersion.ts:31` 的「`content:build` must be re-run for any asset swap」**兩句都是假的**，要改掉（⛔ 不要留著，它們正是下一輪的假前提） |

#### 落地順序（⭐ 按「擋住幾支」排，⛔ 不按「哪個好寫」）

1. **閘 B**（交付）—— 它擋住的是**每一次資產修復**，包含已經做過的 25 次。
2. **閘 A 判準①＋量尺自證** —— 把 Rider 這一族變成編輯當下就會紅。
3. **閘 A 判準③④ 的棘輪** —— 70 + 6 個材質是既有債，先釘住不再長大。
4. **產線分支**：`gltf.py` 把 luma-key 救援從 `fm >= 3` 放寬到「來源說黑要透明**或** hint=="opaque" 的 fm1/fm2」，
   fm5/6 拉出 additive 分支，`has_opaque_base` 從「一票否決」改成「多層合成或至少記帳」。
   ⭐ ⛔ 改完**要重跑整個 `convert_all`**，⛔ 不是再打一張 `TARGETS` 名單（那正是原因 ①）。

---

## 6. 一句話交代給 owner

> 那張魔法陣（`imported.midchildernanohaaura`，原作叫「騎英魔法陣」`h02D`）在
> **2026-08-24 就已經修好了** —— 舊版逐位元是「alpha 全 255、53.9 % / 83.4 % 的像素是不透明的黑」，
> 也就是一塊黑方片；新版 alpha 100 % 由亮度推導、不透明黑像素 0 %。
> ⛔ **但那次修復是用「跟壞掉那份完全相同的網址」出貨的**，而那個網址被瀏覽器
> 以「一年、immutable」快取著 ⇒ **修好的位元組送不到已經玩過的人手上**，
> 直到某一次跟這件事無關的內容編輯把版本號滾掉為止（實際發生在 08-27）。
>
> ⇒ 「不是第一次」的真正原因不是我漏了哪一張圖，是**這一族修復沒有交付保證**，
> 而且產線的「有沒有去背」判決只驗過一個方向。兩支閘（§5 Q3）都不需要 GPU，都是靜態可判的。

---

## 附錄 A：本次用到的量測（可重現，全部唯讀）

| 量什麼 | 怎麼量 |
|---|---|
| glb 材質 / 貼圖 | 自寫的 GLB 解析（JSON chunk + BIN chunk）＋ Pillow 解 PNG；逐材質記 `alphaMode` · `alphaFlat255` · `alpha==max(RGB)` 比例 · `lum<16` 比例 · `alpha≥128 且 lum<16` 比例 |
| UV 覆蓋 | 逐 primitive 讀 `TEXCOORD_0` accessor（含 `byteStride`），取頂點 UV 對應的 texel |
| MDX filterMode | `tools/w3x-import/w3xlib/mdx.py::parse_mdx()`，236 份 raw mdx 全解，0 錯 |
| stock 模型 | `convert_stock_model.py::read_stock()` 走四顆 MPQ（`War3Patch/War3xLocal/War3x/war3`），22 條裡 21 條解得到（`flamestrike1` not-in-mpq） |
| 渲染終端證據 | 讀既有的 audition 證據圖 `docs/_reports/tail_visual-proof_20260826-0000/`，逐像素比對地面基準色 |
| `contentVersion` 歷史 | `git show <commit>:content/manifest.json` |

## 附錄 B：疊加層被丟掉的 46 份檔（判準③的基準，⭐ 只能變短）

`fm[0,2]` 69 材質 ＋ `fm[0,1]` 1 材質，落在 46 份 glb 上。前幾名（依貼圖近黑比例排）：
`herokyo{,-mid,-small}` · `herosephiroth{,-mid,-small}` · `herogirl{,-mid,-small}` ·
`herohanzouhattori{,-mid,-small}` · `herohehi{,-mid,-small}` · `herokunoichi{,-mid,-small}` ·
`heromusashimiyamoto{,-mid,-small}` · `heroshana{,-mid}` · `herotoshiiemaeda{,-mid,-small}` ·
`herorider{,-mid,-small}` · `herooichi{,-mid,-small}` · `fox{,-mid,-small}` · `fox2{,-mid,-small}` ·
`boxcat`。
⚠️ 這一批**不是**「黑方塊」病 —— 它是「原作有一層而 GGD 沒有」，屬第一·五守則那一族
（說了但不會發生），單獨開票處理。
