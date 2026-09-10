# 盤點表 ↔ 上架設定的同步（GH#1165）

> owner 2026-09-10 逐字：「**全角色模型盤點.md 會持續更新模型預設對應表，請你也配合改變上架設定**」

量測日 2026-09-10 · worktree 分支 `worktree-agent-ac4dfc059967e835b`
盤點表：`…/ABxVFX_EDIT/全角色模型盤點.md`（⛔ owner 的檔，本輪**一個位元組都沒動**）

---

## ① 那 4 名今天實跑 `tools/model-budget/guard.ts` —— ⭐ 逐名 exit=0

⛔ **不是讀程式碼推論** —— 逐顆 `.glb` 真的餵進出貨的那支 guard，`--role champion`。
⚠️ glb 本體不在 git 裡（第一·四守則：素材走 S3）⇒ 取自素材庫 `ready/`。

| 盤點表那一列 | 引用值 | guard 量到 | 四軸判定 | **exit** |
|---|---:|---:|---|---:|
| 阿箱＋拉蜜絲 `b2-boxxo` | 237 | **110** | ok | **0** |
| 李星 `example:leesin` | 196 | **196** | WARN（貼圖 1024，⛔ 非通道軸） | **0** |
| 沃維克 `example:warwick` | 188 | **188** | WARN（貼圖 1024，⛔ 非通道軸） | **0** |
| 犽宿 `example:yasuo` | 170 | **170** | ok | **0** |

⇒ ⭐ 4/4 exit=0。出貨上限來自 `content/config/model-lod.json`（warn 300 / **limit 500**，GH#1164）
⇒ ⭐ 那四條「超過英雄模型上限 **160**」的理由**今天全部不成立**。

### ⚠️ 而 `b2-boxxo` 這一列**沒有完全對上** —— ⭐ 這一格要誠實寫

盤點表引用的是 `existing:lux`（原 W3X 匯入），⛔ 而它在 `catalog.json` 與
`intake/catalog.json` **都不存在**（`hero-model-options.json` 只把它記成一筆
沒有 `sourceModelKey` 的 `pending`）⇒ ⛔ **那顆 glb 今天量不到**。
上表的 110 量的是素材庫已標準化的 `lol:lux`（`ggd.model.5ad7e0cc65e3eca8ead74227`）。

⭐ **而 237 的出處找到了**：`outputs/community-lol-models-20260907/lux-optimization.json`
的 `before` 欄 —— **20 段動作全部 237 通道**，`after` 降到 **134–158**。
⇒ ⭐ 237 是**最佳化之前**的量值。⇒ 這一列有**兩層**過期：上限被改掉、量值也是舊的。

---

## ② 新閘：`packages/shared/src/ops/inventoryRosterSync.test.ts`

### ⛔ 它補的洞：**被測的不是出貨的那個**（失敗形態⑤）

隔壁已經有 `inventoryBlockerReasonsFresh.test.ts`，⭐ 而它驗的是 `stale_blockers()`
**這把尺**（兩個方向都驗過：上限沒動 ⇒ 不喊；上限調高 ⇒ 要喊）——那是對的。
⛔ **但它餵的是一份自己造的 4 行夾具，從來沒有讀過那張真表。**
⇒ ⭐ 真表上今天有 **4 列**過期理由，而那支測試**全綠**。

### ⭐ 為什麼是棘輪，⛔ 不是「有落差就紅」

那張表在 repo 外、⛔ 而且我不可以改它 ⇒「有落差就紅」＝ 一條**我這邊做什麼都不會變綠**
的閘 ＝ 失敗形態⑨（「一個永遠不會綠的閘」），而它的下場是被關掉。
⇒ 已知落差進 `tools/ship-81/roster-sync.baseline.json`（**帶著上表的 guard 證據**），
閘問的是**關係**：沒登記的新落差 ⇒ 🔴指名；登記了卻已不成立 ⇒ 🔴（棘輪只能變短）。

### ⚠️ 表不在時**出聲**，⛔ 不安靜跳過

實測 `GGD_INVENTORY_MD=<不存在>` ⇒ 摘要行是 **`Tests 5 skipped (5)`**（⛔ 不是 passed）
＋ 每條印一次 `🚨🚨 ⛔ 盤點表對帳 **沒有驗到** —— ⛔ 這不是「通過」。`
⭐ 讀的人不可能把它讀成全過。

---

## ③ 雙向對帳（第二守則⑫：⛔ 只驗名詞不驗關係的「反方向」）

### 📊 分母與探針（⛔ 不是只回一個數字）

| | |
|---|---:|
| 盤點表列數（LOL 追加 7 名／第一批 37 名／第二批 37 名） | **81** |
| 出貨 `champion@1` | **146** |
| ⇒ 反向母體（⛔ 扣掉 `godie-*` 69 名與引擎骨架 `sela`／`thorne`） | **75** |
| 探針：變身態豁免 | **1**（`b2-maple-alt-9769eb88b85b` → `b2-maple`） |

### 正向落差 **7 / 81** —— 「有宣告而無實體」

`example:karthus` · `example:leesin` · `example:lux` · `example:missfortune` ·
`example:warwick` · `example:xerath` · `example:yasuo`

⇒ ⭐ 正好是**整個「LOL 追加 7 名」那一節（7/7）**，一名都沒有對應的 `champion@1`。
⚠️ ⭐ 而其中 **3 名（leesin／warwick／yasuo）的標準化模型已經在 catalog 裡，
且今天實跑 guard exit=0** ⇒ 擋著它們的是①那幾條過期理由，⛔ 不是模型本身。

### 反向落差 **0 / 75** —— 「有實體而無宣告」

⭐ 唯一的候選 `b2-maple-alt-9769eb88b85b` 是 `transform.role == "alternate"`、
`counterpartId = b2-maple`，⭐ 而本體**在表上** ⇒ 依規則豁免。

⚠️ ⭐ **那個豁免是推導的，⛔ 不是一張名單** —— 條件是「本體在表上」。
突變③證明了差別：把 `b2-maple` 那一列從表上刪掉 ⇒ **本體與變身態兩個一起被指名**。
⛔ 寫成名單的話，變身態會靜靜地通過。

---

## ④ 突變驗證（4 條，⛔ 全部經由 `GGD_INVENTORY_MD` 餵假表，⛔ 沒有動真表）

| # | 突變 | 結果 |
|---|---|---|
| 1 | 假表追加一列「通道 199 超過上限 160」（未登記） | 🔴 exit=1，**指名** ``探針英雄 `probe:mutant` `` ＋兩個數字；⭐ 其餘 4 條仍綠 |
| 2 | 把 `example:yasuo` 的理由改成不帶數字 | 🔴 exit=1，**指名** `example:yasuo` 並說「從 baseline 刪掉這一列」 |
| 3 | 從表上刪掉 `b2-maple` 那一列 | 🔴 exit=1，**同時指名** `b2-maple` **與** `b2-maple-alt-9769eb88b85b` |
| 4 | `GGD_INVENTORY_MD` 指向不存在的檔 | ⭐ `5 skipped (5)` ＋ 5 次紅字橫幅（⛔ 不是 passed） |

⭐ 探針全部只活在 `/private/tmp`，跑完刪除；真表與 `model_map.py`／`gen.py` **零改動**。

---

## ⑤ 這一輪**沒有**做的（⛔ 誠實列出來）

- ⛔ **那 7 名 LOL 英雄沒有上架** —— 那要動 `content/**`，⛔ 在本輪的檔案柵欄外。
  ⇒ ⭐ 本輪的產出是**證據與閘**，⛔ 不是「LOL 7 名已上線」。
- ⛔ **盤點表沒有被修正** —— 它是 owner 的檔。⭐ 閘會在它被改對的那一刻要求棘輪跟著變短。
- ⚠️ `b2-boxxo` 引用的 `existing:lux` **本體今天量不到**（見①的但書）——
  ⭐ 上表那個 exit=0 是**另一顆已標準化的 lux**，⛔ 不是逐字對上那一列。

## ⑥ 建議 owner 的下一步（⛔ 我不自己決定）

1. 那 4 列的阻塞理由可以撤掉 —— ⭐ 3 列逐字對得上（196／188／170），
   `b2-boxxo` 那一列建議改成引用今天的 `lol:lux`（110）。
2. LOL 7 名要不要排上架 —— ⭐ 其中 3 名的模型今天就過得了。

---

### 檔案

| 檔 | 是什麼 |
|---|---|
| `tools/ship-81/roster_sync.py` | 雙向對帳 ＋ 阻塞理由新鮮度（⭐ 附分母與探針） |
| `tools/ship-81/roster-sync.baseline.json` | 棘輪基準線（⛔ 只能變短），⭐ 內嵌 guard 證據 |
| `packages/shared/src/ops/inventoryRosterSync.test.ts` | 閘（5 條） |
