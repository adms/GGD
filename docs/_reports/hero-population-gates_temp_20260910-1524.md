# 四支「母體變了」的閘 —— 逐支判定（2026-09-10）

> ⭐ **一句話**：四支裡 **零支**是七名 LOL 英雄造成的。
> 派工單上「LOL 7 上架 ⇒ 這四支紅了」這個前提，逐支查證之後**四支都不成立**。

⚠️ 這份報告是 lane 的完整量測；回傳值只有摘要。
⛔ 每一個數字都是**實跑量到的**，⛔ 不是讀程式碼推論的。

---

## ⓪ ⛔⛔ 開工前先撞到的事：**worktree 落後 58 個 commit**

| | |
|---|---|
| worktree 起始 HEAD | `4d1d054c3`（＝ `origin/main`） |
| 本機 `main` | `4413c3c85`（**領先 origin/main 58 個**） |
| 那 58 個裡有什麼 | 七名 LOL 英雄（`5f7d222ef`）· `skills:sync`（`4413c3c85`）· `tools/ship-81/` · `inventoryRosterSync.test.ts` |

⚠️ ⭐ **在 fast-forward 之前，`content/champions/` 裡一個 `lol-*` 都沒有**，
而 `grep -rl lol-lux` 全 repo 零命中 ⇒ 那時候的結論會是「這批英雄不存在」。
⭐ 而正確答案是「**我看的那條路上沒有**」（CLAUDE.md：「我查的那條路上沒有」≠「它不存在」）。
⇒ 修法：`git merge --ff-only main`（⛔ 不是 `origin/main`）。

---

## ① `handWrittenAbilitiesRatchet` —— 111 → 159（+48）

### ⭐ 那 48 支是誰（逐支量的）

量法：對 `4d1d054c3` 與 `HEAD` 各算一次「`refsOf(template)` 為空 **且** `effects` 非空」的集合
（＝ `tools/brick-census/gen.ts::demandShapes()` 的同一條判準），再相減。
⇒ **「變成手刻」48 支 · 「不再手刻」0 支**。

| 群 | 支數 | `template` 的形狀 | 判定 |
|---|---:|---|---|
| `community-review-NN-20260907.ex`（NN = 01…37） | **37** | ⭐ **完全沒有 `template` 這一格** | ⭐ **真的手刻** |
| `b2-*`（aladdin.ex/.q · boxxo.q · keyaru.r · maomao.w · noor.w · nube.ex · popp.ex · rem.w · sinbad.ex · takopi.r） | **11** | `template{cards,onConflict}` | ⛔ **誤判** |
| **七名 LOL 英雄** | ⭐ **0** | 42 支**全部**有 `template.ref` | —— |

### ⭐ 派工單問的「48 vs 42 的 6 支差額」：**那個問題本身不成立**

⛔ 差額不是 6。⭐ **LOL 的貢獻是 0**，而 48 = 37 + 11，來自**另一批**
（37 名社群英雄＋第二批 `b2-*`），它們與 LOL 同在那 58 個 commit 的視窗裡落地。

### ⭐ 那 11 支：**閘的判準壞了**，⛔ 不是有人手刻

`tools/brick-census/gen.ts:142` 的 `refsOf()` 只認得兩種形狀：

```ts
if (typeof o.ref === "string") return [o.ref];
if (Array.isArray(o.stack)) return o.stack.flatMap(refsOf);
```

⇒ 社群編輯器的**卡片堆疊**綁法（`template.cards[]`）一律回空陣列 ⇒ 判成「沒接模板」。

⚠️ ⭐ **這是同一支普查第二次踩同一個坑** —— 它自己的檔頭（`gen.ts:98`）記著第一次：
「⛔⛔ **這支在 2026-09-05 之前只讀文件級的 `template.ref`／`.stack`**」⇒ 8 份模板 67 次採用被記成零採用。

⇒ ⭐ **正解是修 `refsOf()` 讓它認得 `cards`**，修好之後 `bricks:build` 會量到 **148**。
⛔ 本 lane 的檔案柵欄不含 `tools/brick-census/` ⇒ **只記錄、⛔ 不順手修**（第零守則⑧）。

### ⭐ 那 37 支：**真的**第〇·五守則債，而且是一個**機制缺口**

37 名社群英雄的槽位分布（逐檔量，母體 222 份 `community-review-*`）：

| 槽 | 支數 | `template` | `effects` |
|---|---:|---|---|
| Q / W / E / R | 37 × 4 = **148** | ⭐ `template.ref` | 非空 |
| PASSIVE | 37 | 無 | **空** ⇒ 不計入 |
| **EX** | **37** | ⛔ **無** | 非空 ⇒ **計入** |

⇒ ⭐ **社群英雄編譯器對 EX 槽不發模板綁定** —— ⛔ 不是 37 次個別的手滑，
⭐ 是**一個機制缺口擋住 37 支**，正好是第〇·五守則「按**擋住的支數**排序」那種形狀。

### 這一支的處置：**調基準線（111 → 159），⛔ 但把 37/11 的拆分寫進那一格**

⚠️ ⭐ 棘輪的規矩是**只准往下**，而這一次是往上 ⇒ 所以基準線旁邊逐支寫下
「誰、為什麼、哪一半是誤判、修好之後要降到 148」。
⛔ 只把 111 改成 159 而不寫，就是**用棘輪保護一筆沒有人知道成分的債**。

---

## ② `crossheroAssetMisbind` —— ⭐ **真缺陷**，⛔ 不是雜訊（而且與 LOL 無關）

### 量到的：**160 筆**（掃描母體 2,572 份出貨文件，`keyIssues` 0 筆）

| 筆數 | `collection` \| `fieldPath` |
|---:|---|
| 37 | `champions` \| `.abilities.Q.icon` |
| 37 | `champions` \| `.abilities.W.icon` |
| 37 | `champions` \| `.abilities.E.icon` |
| 37 | `champions` \| `.abilities.R.icon` |
| 3 + 2 + 1 | `abilities`/`champions` \| `.effects[].championId` |
| 3 + 2 + 1 | `abilities`/`champions` \| `.template.params.championId` |

⭐ **綁定端 37/37 都是 `community-review-NN-20260907`；資產端全是 `sela` 或 `thorne`（引擎骨架那兩顆）。**
⚠️ ⭐ **七名 LOL 英雄：0 筆。**

### ⭐ 148 筆圖示 ＝ **真缺陷**（鏡射漂掉，⛔ 而且是半套的）

| 住處 | `community-review-01-20260907` 的 Q 圖示 |
|---|---|
| **獨立技能檔** `content/abilities/…q.json` | ⭐ `assets/icons/abilities/community-review-01-20260907.q.webp` ✅ |
| **英雄檔裡的內嵌鏡射** `content/champions/….json` 的 `.abilities.Q.icon` | ⛔ `assets/icons/abilities/sela.q.webp` |
| 那張**自己的**圖示在不在磁碟上 | ⭐ **在**（`content/assets/icons/abilities/` 底下 `community-review-*` 共 **444** 個檔） |
| 同一份英雄檔的**英雄級** `icon` | ⭐ `assets/icons/champions/community-review-01-20260907.webp` ✅ **已經遷移過了** |

⇒ ⭐ **決定性的不對稱**：英雄級圖示已經換成自己的，**而內嵌的四格技能圖示留在骨架的**。
⚠️ ⭐ 這不是「刻意共用」——刻意共用不會只共用一半。
⇒ 玩家在英雄卡上看到的四格技能圖示是**別人（骨架 sela／thorne）的圖**（第一·五守則）。

⚠️ 對照組：`lol-*` 與 `b2-*` 的英雄檔**內嵌 `.abilities.*.icon` 根本沒有這一格**（`None`）
⇒ 它們不受影響，⭐ 這條缺陷**只在第一批 37 名**身上。

### ⭐ 12 筆 `championId` ＝ **不是缺陷**（卡面自己講了）

`community-review-01-20260907.q`（黑魔導）的 `description` 逐字：

> 【目前模板可執行】召喚 1 名 **sela 樣板代理**，6 秒、25% 傷害、30% 生命…
> 【待補機制】黑魔導專屬造型與再次下令換目標未提供；**代理採 sela**。

⇒ ⭐ 卡面**明說**代理是 sela ⇒ **卡面沒有說謊**（第一·五守則過關）。
⛔ 它結構上仍是一筆跨家族綁定，所以閘會數它 —— 但它**不是**要修的東西。

### 這一支的處置：⛔ **不動**，閘**留紅**

⚠️ 派工單的柵欄只放行 `content/champions/lol-*.json` 與 `content/abilities/lol-*.json`，
⭐ 而缺陷全部在 `content/champions/community-review-*.json` ⇒ **柵欄外**。
⇒ ⛔ **不當場修**（第零守則⑧：排序是 owner 的權力），⭐ 而閘留著紅 ——
**它現在紅得是對的**，⛔ 把它調綠才是錯的。

**⭐ 修的時候要動的那一格**：`tools/ship-81/gen.py`
（`attach_ability_icon()` 在 `gen.py:150-154`，英雄級那一段在 `gen.py:428-433`）——
⭐ 英雄級已經走過那條路，**內嵌技能級沒有** ⇒ 修產生器再重生成，
⛔ 不是手改那 37 份英雄檔。

---

## ③ `inventoryRosterSync` —— ⭐ **join key 的命名空間對不上**，⛔ 不是真的落差

### 量到的（實跑 `roster_sync.py`）

```
forwardGap (7): ['example:karthus','example:leesin','example:lux','example:missfortune',
                 'example:warwick','example:xerath','example:yasuo']
reverseGap (7): ['lol-karthus','lol-leesin','lol-lux','lol-missfortune',
                 'lol-warwick','lol-xerath','lol-yasuo']
```

⭐ **同一批 7 個人，被兩個方向各數了一次。**
owner 的盤點表有一節 `## LOL 追加 7 名（7 筆）`（第 397–407 行），
而那一節的 rowId 是 `example:<slug>`，⛔ 出貨的 id 是 `lol-<slug>`。

⚠️ 而且基準線的 `notShipped` 還記著那 7 列，note 逐字寫「**有宣告而無實體**」——
⭐ **那句話今天已經是假的**（它們在 `5f7d222ef` 就上架了）。
⇒ ⭐ 正向那條之所以綠，是因為**棘輪在保護一句過期的話**。

### ⭐ 三個各自獨立的軸同時對上（⛔ 不是「slug 看起來像」）

1. 盤點表那一節**正好 7 列**，出貨 `lol-*` **正好 7 名**，兩邊都沒有剩下的。
2. slug 逐字 1:1：karthus／leesin／lux／missfortune／warwick／xerath／yasuo。
3. ⭐ **顯示名逐字相同**：卡爾瑟斯／李星／拉克絲／好運姐／沃維克／齊勒斯／犽宿
   —— 盤點表的 `heroName` == 出貨 `champion@1.name`。

### 這一支的處置：**修判準**（⛔ 不是調基準線、⛔ 也不是寫一條字串規則）

⛔⛔ **不可以寫 `example: → lol-` 這條規則** —— 那就是第〇·六守則 / GH#635
「照 key 同步」的形狀（草泥馬那次，一個單點 key 錯誤被同步器放大成整支技能毀損）。

⭐ 改成**逐列宣告的別名 ＋ 每次跑都重驗**（`_resolve_aliases()`，四道）：

| 道 | 驗什麼 | 不過的話 |
|---:|---|---|
| ① | 那一列**今天還在**盤點表上 | `row-not-on-inventory` ⇒ 🔴 |
| ② | 那個出貨 id **今天還在** | `shipped-id-not-found` ⇒ 🔴 |
| ③ | ⭐ **獨立軸**：顯示名 == `champion@1.name` | `display-name-disagrees` ⇒ 🔴 |
| ④ | 棘輪：rowId 本身已經是出貨 id ⇒ 這筆多餘 | `redundant-alias` ⇒ 🔴 |

⭐ 驗不過的那幾筆**不套用** ⇒ 落差照樣浮出來；`aliasIssues` 進斷言負責**指名**。
⚠️ ⭐ ③ 是**閘每次跑都重算的那一格**，⛔ 不是寫在基準線裡的一句話 ——
顯示名**不是** join key，它是**驗算**（兩個各自維護的欄位對上了，才證明是同一個人）。

**跑完的結果**：`forwardGap []` · `reverseGap []` · `aliasIssues []` · `idAliasesApplied 7`。
分母印出來是：盤點表 81 列（三節）· 出貨 champion@1 **153** 名 ⇒ 反向母體 **82** 名。

---

## ④ `skillsSyncCoversGenerators` —— ⭐ **兩個**假陽性，同一族的第二、三個載體

### ⛔ 它報的兩個理由，逐行查證之後**兩個都不成立**

| 輪 | 它說 | 實際 |
|---:|---|---|
| 1 | `tools/ship-81/gen.py → content/assets-offdisk.json` | ⭐ `grep` 全 ship-81 **只有 `gen.py:364` 一行**提到它，⛔ **而那是註解**（以 `#` 開頭）。⭐ 那份產物真正的擁有者是 `tools/asset-manifest/gen.ts`，而 **`assets:manifest:check` 已經在 `skills:check` 裡** |
| 2 | `tools/ship-81/gen.py → content/config/model-lod.json` | ⭐ `gen.py:402` / `lol7.py:78` / `roster_sync.py:135` 三處都是 `json.loads((… ).read_text(…))` ⇒ **純讀**（讀出貨通道上限） |

⭐ 而**第一版的 READ_CALL 為什麼漏掉②**：`\bread\s*\(` 對不上 `read_text(`
（`read` 後面是 `_`，⛔ 不是 `(`），`JSON.parse` 也只認 JS ⇒ Python 的讀法整族看不見。

⚠️ ⭐ 這與這支測試**2026-09-10 剛落地的那一段修法**（PR #1144，`runtime-catalog.mjs` 的
「一行『讀』不是一行『寫』」）是**同一個病的第二、三個載體**：
①JS 的讀 → 已修 · ②**註解裡的提及** → 本輪修 · ③**Python 的讀** → 本輪修。

### 這一支的處置：**修判準**（⛔ 不是加 `*:check`、⛔ 也不是進豁免表）

派工單說「兩條路都合法」——⭐ **而這裡兩條都不對**，因為前提是假的：
ship-81 **沒有**在寫那兩份產物。
⇒ ⛔ 給它一支 `*:check` 會造出**第二個寫入端**（第〇·四守則）；
⛔ 寫進 `GENERATOR_NO_CHECK` 會**登記一個不存在的擁有關係**。
⭐ 兩條窄化都刻意只動「追蹤檔 ⇒ 算寫」那一條啟發式的**例外**，
⛔ 沒有動那條啟發式本身（它存在的理由 —— 產生器常把落點寫成模組常數再用別的名字寫出去 —— 沒有變）。

### ⚠️ ⭐ 而順手量到一個**真的**盲點（⛔ 本輪不修，寫在這裡）

`tools/ship-81/gen.py` **真的**寫 `content/champions/*.json` 與 `content/abilities/*.json`
（`OUT_CH`/`OUT_AB`，`gen.py:38-39`、寫入在 `gen.py:498-503`），⭐ 而它**沒有任何 `*:check`**。

⛔ 而這支閘**今天看不到那件事**：`bind` 那條啟發式找的是
`OUT_CH.write_text(` 這種形狀，⛔ 而出貨寫法是 `(OUT_CH / f"{r['id']}.json").write_text(...)`
—— **落點是一個運算式，⛔ 不是那個名字本身** ⇒ 對不上。

⇒ ⭐ 這是一個**真缺口**（一支寫 621+ 份產物鄰居的產生器，新鮮度沒有人守），
⛔ 但補它會改變這支閘對**全 `tools/`** 的判定範圍（blast radius 未量），
⇒ **本輪不動**，寫進報告讓 owner 排（第零守則⑧）。

---

## 📋 四支的處置一覽

| 支 | 判定 | 處置 | 今天的狀態 |
|---|---|---|---|
| `handWrittenAbilitiesRatchet` | 37 真債 ＋ 11 誤判 | ⭐ **調基準線**（111→159）＋ 逐支寫下拆分與「修好之後降到 148」 | ✅ 綠 |
| `crossheroAssetMisbind` | ⭐ **真缺陷**（148 筆內嵌技能圖示鏡射漂掉） | ⛔ **不動**（柵欄外）—— 留紅並指出修法在 `tools/ship-81/gen.py` | 🔴 **刻意留紅** |
| `inventoryRosterSync` | join key 命名空間不同 | ⭐ **修判準**（逐列宣告別名 ＋ 四道驗證）＋ 清掉已成假的 `notShipped` | ✅ 綠 |
| `skillsSyncCoversGenerators` | ⭐ **兩個假陽性**（註解 · Python 的讀） | ⭐ **修判準**（兩條窄化） | ✅ 綠 |

---

## 🧪 驗證

| 項 | 結果 |
|---|---|
| `npx vitest run <四支>` | **3 檔綠 / 1 檔紅**（18 passed / 1 failed）—— 紅的那一條是 ②，**刻意的** |
| `pnpm typecheck` | ⭐ **EXIT=0** |
| 突變（一批一條，⭐ 承重線＝`writes` 那條啟發式） | ⭐ **兩個方向都實跑到了**：拿掉 `COMMENT_LINE` ⇒ 🔴 指名 `content/assets-offdisk.json`；拿掉 Python 讀法 ⇒ 🔴 指名 `content/config/model-lod.json`；兩條都在 ⇒ ✅ 綠。⛔ 不是事後補的斷言，是這一輪三次實跑的紀錄 |
| 測試預算 | `vitest` **3 次**（上限 3）· `typecheck` **1 次**（上限 1）· 突變 **1 條** |

## 📁 動到的檔（全部在柵欄內）

```
packages/shared/src/ops/handWrittenAbilitiesRatchet.test.ts
packages/shared/src/ops/inventoryRosterSync.test.ts
packages/shared/src/ops/skillsSyncCoversGenerators.test.ts
tools/ship-81/roster_sync.py
tools/ship-81/roster-sync.baseline.json
docs/_reports/hero-population-gates_temp_20260910-1524.md
```

⛔ **沒有動**：`apps/**` · `scripts/**` · `packages/shared/src/sim/**` ·
`content/` 底下任何一個檔（含 `lol-*`）· `tools/brick-census/` · `package.json` ·
`tools/parallel-gates/sync-io.json`。
⛔ **沒有跑** `pnpm skills:sync`（派工單禁令）。⛔ 沒有 push / deploy。
