# 隱形圖元稽核（#233 / B3 資產側）

> 2026-07-30。工具：`tools/w3x-import/invisible_prim_census.py`（可重跑）。
> **結論：不能整批剔除。** 詳見〈裁決〉。
> ⚠️ 本頁所有數字都是**量到的**，不是估的；重跑指令附在最後。

---

## 一、普查數字（重量過，與駁斥者一致）

掃描 `content/assets/models/**` + `data/blizzard-overlay/models/**`：

| 指標 | 數量 |
|---|---|
| 掃描的 .glb | **373** |
| 帶 `baseColorFactor[3] === 0` 圖元的檔 | **76** |
| 這種圖元總數 | **166** |

駁斥者報的 **287 / 76 / 166**：76 與 166 **完全複現**。287 是他們的檔案母體
（`imported/` 239 + `blizzard-overlay/` 40 + `champions/` 8）；我掃 373（多含
`guardians/hex/menu/props/shop` 與 83 組 `-mid`/`-small` LOD）。多掃的那 86 個檔
**一個命中都沒有**，所以兩邊的 76 / 166 指的是同一批圖元 —— 母體差異不影響結論。

命中全部落在兩處：`imported/` 53 檔 101 個，`blizzard-overlay/` 23 檔 65 個。

### 「18 個是英雄身體」—— 這個數字我複現不出來

以「被某個 champion doc 的 `modelKey` 指到的模型」為定義，我量到 **27 個檔**、
**73 個圖元**：

- `blizzard-overlay/` **23 檔全部**都是英雄身體（MANIFEST 每個都對到 `champId`，
  且 23 個 `champId` 都有對應的 champion doc）—— 65 個圖元
- `imported/` **4 檔**：`negi`(4)、`pika`(2)、`gumdam`(1)、`picacugy`(1) —— 8 個圖元

18 這個數字用我試過的任何定義都湊不出來。**受影響的英雄是 27 位，不是 18 位。**

---

## 二、成因：不是 WC3 的殘渣，是**我們自己的轉檔器造的**

任務單寫這些是「WC3 `TeamGlow*` 佔位面」。**只對 44/166（26.5%）。**
真正的大宗是另一條分支。兩者都在 `tools/w3x-import/w3xlib/gltf.py`：

| 來源 | 圖元數 | 程式碼 |
|---|---|---|
| **additive glow w/o alpha** | **122 (73.5%)** | `gltf.py:416` — filter_mode ≥ 3 的發光幾何，貼圖沒有 alpha 通道 →「no alpha to key on → drop the quad rather than paint a black slab」 |
| **TeamGlow（replaceableId 2）** | **44 (26.5%)** | `gltf.py:448` —「coloured additive billboard we cannot tint — drop it」 |

兩條都是**軟刪除**：幾何留著，只把 alpha 打成 0。這正是 `mesh.renderOverlay`
會把它們點亮的原因 —— Babylon 的 OutlineRenderer 只讀 mesh 上的欄位，
不看 `material.alpha`。

---

## 三、裁決：**不能安全剔除**

任務單點名的風險（「那些面會不會是動畫中途才變不透明的？」）**成立，而且比預期嚴重。**

對每一個隱形圖元，回原始 MDX 找出它的 geoset，讀 `GEOA`/`KGAO`
（glTF 沒有可見度動畫通道，轉檔器整章跳過 —— 就是 #59）：

| 判定 | 圖元數 | 佔可查者 |
|---|---|---|
| **KEEP —— WC3 有把它動畫成可見** | **67** | **54.0%** |
| safe —— KGAO 在每個 sequence 都是 alpha 0 | 17 | 13.7% |
| safe —— 根本沒有可見度軌 | 40 | 32.3% |
| （查不到 MDX / 對不到 geoset，一律保留） | 42 | — |

**可查的 124 個裡，67 個（54%）是 WC3 真的會顯示的幾何。**
而且顯示在遊戲天天在播的 sequence 上，不是什麼冷門動作：

| 模型 | 角色 | 圖元 | WC3 在哪些動作顯示它 |
|---|---|---|---|
| `N00B` | 小叮噹 - 哆拉A夢 | 9 | `Attack`、`Attack -2`、`Spell` |
| `H001` | 地獄來襲者 - 斑剎 | 6 | `Attack`、`Spell`、`Spell Channel` |
| `negi` | 涅吉 | 4 | `Attack`、`Attack - 1/3`、`Spell - 1` |
| `pika` | 皮卡娘 | 2 | `Attack - 1/2/3` |
| `Udea` / `U00B` | 飛鼠先生 | 各 3 | `Spell - 1` |
| `gumdam` | 鋼彈 - 煌 | 1 | `Stand`、`Walk`、`Attack`、`Death`（等於**永遠**） |
| `flash`/`meteor`/`deathwave` … | 特效模型 | 各 2–3 | `Birth` —— 也就是**該特效的全部內容** |

**這些不是死掉的佔位面，是壞掉的內容。** 小叮噹的空氣砲、涅吉與皮卡娘的攻擊光效，
現在在遊戲裡就是**看不到**的 —— 因為轉檔器把貼圖沒有 alpha 通道的發光面整片抹成透明。
剔除它們不是清垃圾，是**把「該修而還沒修」變成「修不回來」**。

### 三個具體理由

1. **54% 是誤傷。** 上表就是證據，可重跑。
2. **省不到什麼。** 166 個圖元散在 76 個檔（每檔中位數 2 個），多半是幾十個頂點的
   billboard。渲染層的 `renderOverlay` 問題**已經修好了**（B3 任務單自己講的），
   所以現在剩下的只有 draw call，代價遠小於誤刪 67 個圖元的風險。
3. **軟刪除是可回復的，硬刪除不是。** alpha 0 的幾何還在檔案裡，UV、頂點、
   骨骼權重都完整；轉檔器哪天修好 additive-glow 的判斷（或落實 #59 的可見度動畫），
   這些面就能直接復活。剔掉就只能重跑轉檔 —— 而 `blizzard-overlay/` 那 23 個
   英雄身體的 MDX **repo 裡根本沒有**（要靠本機的四個零售 MPQ 重抽）。

---

## 四、做了什麼（沒有動任何 .glb 位元組）

**一個 glb 都沒有被改。** 剔除做成轉檔管線的一個**開關**，預設關閉：

- `tools/w3x-import/invisible_prim_policy.json` —— 決策點，不改程式就能調
  - `cull`: `off`（**出貨值**）/ `safe` / `all`
  - `skipGeosetsWithVisibilityAnimation`（**安全閘**，預設 `true`）
  - `cullWithoutMdxProof`（預設 `false` —— 查不到就不剔）
  - `reasons.teamGlow` / `reasons.additiveGlowNoAlpha`（兩條成因可分開開關）
- `tools/w3x-import/invisible_prim_census.py` —— 普查 + 安全稽核 + `--apply`
- `tools/w3x-import/invisible_prim_census_test.py` —— 17 條，突變驗證過

三種模式實測會剔掉幾個：

| `cull` | 剔除數 | 說明 |
|---|---|---|
| `off` | **0** | 出貨值 |
| `safe` | 57 | 只剔有 MDX 證明、且每個 sequence 都不可見的 |
| `all` | 166 | **會刪掉上表那 67 個活的** —— 測試擋著不讓它出貨 |

---

## 五、重跑

```bash
python3 tools/w3x-import/invisible_prim_census.py                 # 普查 + 裁決
python3 tools/w3x-import/invisible_prim_census.py --json out.json # 逐圖元明細
python3 tools/w3x-import/invisible_prim_census_test.py            # 守衛
```

`blizzardMdx=yes` 需要 `war3.mpq` / `War3x.mpq` / `War3Patch.mpq` 放在 repo 根目錄
（本機有）。沒有的話 Blizzard 那 65 個會退成 `unmapped (no MDX proof)` 而被保留 ——
**保守方向**，不會誤剔。

---

## 六、後續（要 owner 裁決）

1. **真正該修的是 additive-glow 那條判斷**，不是剔除。67 個 ever-visible 裡
   **52 個**來自 additive-glow 分支（另外 15 個是 TeamGlow，那條是刻意的設計決定，
   客戶端自己畫隊伍光環）—— 也就是 52 個被誤判的發光幾何。正解是讓它們
   以 emissive + 適當 alpha 出貨，而不是抹成透明。這是獨立一張單。
2. `cull: "safe"` 的 57 個要不要真的剔？省下 57 個 draw call，但要重寫 76 個
   glb 中的一部分。**建議先不要** —— 渲染層已修，收益接近 0，而 `-mid`/`-small`
   LOD 會讓檔案關係更難追。
3. `blizzard-overlay/` 的 MDX 不在 repo 內，是這次差點查不下去的原因。
   要不要把抽出來的 MDX 一起存進 `tools/w3x-import/out/`？
