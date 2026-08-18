# scenery-gen — 場景招牌物件產生器（GH#362 的資產缺口）

```
pnpm scenery:gen      # write content/assets/models/scenery/*.glb
pnpm scenery:check    # verify the shipped files match the generator, byte for byte
```

烤出 **15 件**布景物件。每一件是**一個 mesh、一個 material、一個 draw call、
一張 16×16 調色盤貼圖、48–192 個三角面、5.8–15.9 KB、零骨架、零動畫**。

## Provenance — read this first

**Nothing here is downloaded.** 沒有任何 3D 模型、貼圖、材質或掃描資料被下載、
匯入、轉檔或參考。沒有 Sketchfab、沒有 Poly Haven、沒有 KayKit、沒有 CC-BY 素材，
所以也沒有 #116 要的 per-model licence proof 要附 —— **不存在的來源不需要證明**。

**每一個頂點都來自這個目錄的參數表。** `pieces.ts` 是 15 列數字（尺寸、位置、
錐度、傾角、顏色槽）；`parts.ts` 把那些數字變成三角形；`gen.ts` 把三角形寫成檔案。
沒有第四個來源。輸出是**逐位元組決定性**的，所以 provenance 不是一句宣稱，
而是**任何人都可以重跑的一個 build 步驟**：`pnpm scenery:check` 回 0 就代表
出貨的那 15 個檔案，正是這張表算出來的。`gen.test.ts` 釘住每一件的 sha256。

owner 2026-08-18 裁決走生成而不是下載，理由是量得到的：Sketchfab 的
free download 多數是 CC-BY 不是 CC0（授權義務要逐件留證），而下載來的模型通常
2–10k 面 —— 這個遊戲的英雄是 **168 面**的體素方塊人，一個 5,000 面的鳥居站在
旁邊只會看起來像貼錯了圖。

## ⛔ 判準：如果我在為鳥居寫一個 `if`，我就寫錯了

| 層 | 誰負責 | 這裡是哪個檔 |
|---|---|---|
| **機制** | 程式 —— 一種帶錐度／帶傾角的箱體、一張明暗貼圖、一個 GLB 寫入器 | `parts.ts` |
| **物件** | 資料 —— 15 列參數 | `pieces.ts` |

`bake()` 對 15 件是**同一支函式**，⛔ 沒有任何一件有自己的分支。
第二件跟第一件只差參數 —— 石燈籠與鳥居用的是同一個 `Part` 型別、同一組 6 個面、
同一條 UV 規則。新增第 16 件是**在表裡加一列**，不是寫一段程式。

（第〇·五守則說的是技能；owner 2026-08-05「我最推崇的方案[模板化/模組化]
不是到處改改改」沒有限定範圍。15 件逐件建模是 15 輪，一個組裝器 + 一張表是 1 輪。）

## 兩條由**建構方式**保證的不變量

1. **不會穿地板。** `bake()` 量完所有頂點後把整件推 `-minY`，所以 bbox 最低點
   **逐位元組等於 0**。POSITION accessor 帶 `min`/`max`，守衛直接從**出貨的位元組**
   讀回來（⛔ 不是從參數表讀 —— 失敗形態⑤）。
2. **不會擋視線。** 每一件的最高點 ≤ **2.4u** = `ArenaScene.SIGHTLINE_HEIGHT_CAP`，
   超標 `bake()` 直接 throw。`occludesPlayArea()` 對 `topY <= 2.4` 一律回 false，
   所以這 15 件**在型別上**不可能觸發 dressArena 的 Y 壓扁，也不可能整個蓋掉一位
   英雄 —— 不管作者把它放在哪裡。
   ⚠️ 唯一的漏洞是 `decor[].scale`：把鳥居放大 1.5 倍就是 3.5u。放大請自行驗算。

鳥居的島木在 **1.98u**、幡旗的橫梁在 **2.06u**，兩者都高於 1.8u 的英雄 ——
所以「走得過去」與「不擋鏡頭」是同時成立的，⛔ 不是二選一。

## 面數預算

每件 ≤ **300 三角面**（一個零件 = 12 面，所以 ≤ 25 個零件）。這比 `arena-decor`
閘的 warn 4,000 緊了一個數量級，理由是**英雄只有 168 面**：布景比主角重會讓
整個畫面的重心跑掉，而且擺設會被放 50 份。實測最重的一件是鐵柵欄 192 面。
量尺用現成的：

```sh
pnpm --filter @ggd/model-budget budget:guard content/assets/models/scenery --role arena-decor
# 15 model(s) — 0 breaching/broken, 0 warning, 0 unresolved
```

## LOD：這 15 件**正確地只出一階**，⛔ 不是漏做

`tools/lod-gen/gen_lod.py` 自己寫著門檻：`LOD_FLOOR_TRIS = 1500`、
`LOD_FLOOR_BYTES = 64 KB`，**兩個都低於就跳過**，而且註解點名了為什麼 ——
`tools/voxel-gen` 的 168 面方塊人被硬拉進去產 tier 之後，`_lod.json` 裡會多出
一列「這是便宜版」的**謊話**，而它跟本尊一模一樣。

這 15 件最重的是 **192 面 / 15.9 KB**，兩個門檻都差了一個數量級。
所以 `match_corpus()` 會自動略過它們，`pnpm lod:gen` 跑幾次都不會產出
`-mid` / `-small` —— **那是對的狀態，不是缺工。** 手寫兩個一模一樣的 tier 檔
只會多兩個 HTTP request 與兩列 manifest，省下零位元組。

## 檔案

| file | what it holds |
|---|---|
| `parts.ts` | 組裝器：箱體基元、6 個面、明暗貼圖、GLB 組裝、兩條不變量 |
| `pieces.ts` | **參數表** —— 15 件物件，每件一列 |
| `gen.ts` | CLI：寫檔／`--check` 逐位元組比對／預算報告 |
| `gen.test.ts` | sha256 釘選 + 從出貨位元組讀回不變量 |

GLB 與 PNG 的寫入器**不在這裡**：`@ggd/shared/voxel/{glbWrite,pngWrite,bytes}`
已經有了，而且是 owner directive #229「不要 fork 第二個產生器」的直接結果。
這裡用相對路徑 import 進去（同 `tools/skill-spec/gen_spec.ts`），
所以這個目錄不是一個 workspace package，⛔ 不動 `pnpm-lock.yaml`。
代價是 `pnpm -r test` 看不到 `gen.test.ts`，所以另有一條
`packages/shared/src/ops/sceneryGenFresh.test.ts` 真的把 `--check` 跑起來。

## 這 15 件是什麼

| key | 物件 | 題材 | 面數 | 高度 | 佔地 |
|---|---|---|---:|---:|---|
| `torii` | 鳥居 | 和風 | 96 | 2.34u | 2.85×0.34 |
| `stone_lantern` | 石燈籠 | 和風 | 72 | 1.62u | 0.62×0.62 |
| `shoji_door` | 障子門 | 和風 | 96 | 1.95u | 1.54×0.12 |
| `stone_steps` | 石階 | 和風 | 72 | 0.64u | 2.12×1.70 |
| `gravestone` | 墓碑 | 墓場 | 60 | 1.26u | 0.90×0.66 |
| `dead_tree` | 枯樹 | 墓場 | 84 | 1.82u | 1.21×0.52 |
| `iron_fence` | 鐵柵欄 | 墓場 | 192 | 1.25u | 2.30×0.20 |
| `sarcophagus` | 石棺 | 墓場 | 60 | 1.44u | 1.90×0.92 |
| `icicle_cluster` | 冰柱 | 冰雪 | 72 | 1.32u | 0.80×0.70 |
| `ice_blocks` | 冰塊堆 | 冰雪 | 60 | 0.95u | 1.71×1.19 |
| `broken_pillar` | 斷柱 | 廢墟 | 60 | 1.64u | 1.98×1.39 |
| `rubble_pile` | 碎石堆 | 廢墟 | 72 | 0.79u | 1.59×1.19 |
| `leaning_beam` | 傾斜梁 | 廢墟 | 48 | 1.67u | 1.79×0.90 |
| `stand_section` | 觀眾席段 | 競技場 | 96 | 1.85u | 3.56×1.60 |
| `hanging_banner` | 幡旗 | 競技場 | 96 | 2.20u | 1.86×0.16 |

arena doc 引用的路徑是 `assets/models/scenery/<key>.glb`（`zDecor.model` 要
`^assets/` 開頭）。⛔ **這個目錄不碰 `content/arenas/*.json`** ——
哪張圖放哪幾件寫在 GH#362 的整合表裡。

## 重新產生

改一列參數 → `pnpm scenery:gen` → 把新的 sha256 貼回 `gen.test.ts` 的 `PINS`。
檔案與 hash 屬於同一個 commit：測試同時比對**磁碟上那一份**，所以過期會大聲紅。
