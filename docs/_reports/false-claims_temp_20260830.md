# 三張「一句宣稱與量到的事實不符」（#871 · #874 · #875）—— 2026-08-30

> 一輪三張（第三守則：註解會說謊，去驗證）。三張都**沒有取捨，只有對錯**
> ⇒ ⭐ **三張都不需要後台開關**（開關是為了「我挑了一個 owner 可能不同意的答案」而存在的；
> 這三張沒有任何一個答案是我挑的，全部是量出來的）。

---

## 開工前的基線（⛔ 動任何東西之前跑的）

| 票 | 一個指令 | 量到什麼 |
|---|---|---|
| **#871** | `sh tools/deploy/ggd-assets.sh verify <多一個 .DS_Store 的夾具>` | `EXTRA 1` ✅ 措辭是對的，⛔ **而「first extras」列出了全部 4 個檔名** |
| **#874** | `python3` 三段 join（stock 838 列 / OBJECTS 127 英雄 / 25 隻近戰 tag） | 消費端 **0**、自訂英雄 **0 / 127**、⛔ **一致 13 : 矛盾 11（46%）** |
| **#875** | `node_modules/.bin/tsx tools/parallel-gates/field-io.mts --check` ＋ `bash scripts/product-quarantine.sh --doctor` | ✅ **兩個都綠**，④ 欄位級孤兒 = **0** ⇒ ⭐ **票文的前提已經過期** |

---

## #871 —— 過剩那一臂的閘（失敗形態⑫的另一頭）

### 基線量到的：措辭是對的，⭐ 而**診斷是壞的**

`cmd_verify()` 的過剩臂已經會說 `EXTRA 1`、已經會指名 macOS metadata。
⛔ 但它的**可操作那一半**（「first extras:」）在一個 3 檔的乾淨組加一個 `.DS_Store` 上
印出來的是：

```
ggd-assets.sh:   ⇒ first extras:
ggd-assets.sh:     .DS_Store
ggd-assets.sh:     a.bin        ← ⛔ 這三個不是 extras
ggd-assets.sh:     b.bin
ggd-assets.sh:     c.bin
```

### 根因：⭐ 一個 `comm` 的 **join key 兩邊拼法不同**

| 邊 | 怎麼產生 | 長什麼樣 |
|---|---|---|
| `tmp_want`（manifest） | `listing_of()` 是 `cd "$dir" && find .` ⇒ 每一行是 `<hash>  ./a.bin` | `./a.bin` |
| `tmp_got`（磁碟） | `find "$dir" … \| sed "s\|^$dir/\|\|"` | `a.bin` |

⇒ 兩張清單**零個 key 共通** ⇒ `comm -23` 把**每一個檔**都算成 extra。
⭐ 這正是第〇·六守則那個形狀（草泥馬 `godie-h02u`）：**一把鑰匙漂掉，而兩半各自看起來都對**。

⇒ 修法**不是**「在其中一邊也 strip 掉 `./`」，而是**兩邊都照 `listing_of()` 的方式產生**，
讓 key **由構造保證相同**，⛔ 不會再漂第二次。

### 落地

| | |
|---|---|
| 修 | `tools/deploy/ggd-assets.sh` —— `tmp_got` 改成 `( cd "$dir" && find . … )`，兩邊都 `LC_ALL=C sort`，輸出時才 `sed 's\|^\./\|\|'` |
| 閘 | ⭐ **新檔** `packages/shared/src/ops/ggdAssetsSurplus.test.ts`（3 條，78 行，體驗層 ≤80 ✅）—— **真的跑 `sh tools/deploy/ggd-assets.sh`**，⛔ 不掃字串 |
| ⛔ 沒動 | 短少那一臂（#864 已定案）、訊息措辭 |

⚠️ ⛔ **新開一個檔而不是擴充 `ggdAssetsScript.test.ts`／`laneAGgdAssetsListing.test.ts`** ——
那兩個在別條 lane 的柵欄裡（laneA 那支自己的檔頭就寫著這件事）。

### 突變驗證（兩條，都真的跑過）

| # | 突變 | 結果 |
|---|---|---|
| **M1** | 把過剩臂的 `echo` 換成短少臂的措辭（＝把兩臂合併回一句） | ⭐ 新守衛①**紅**，訊息逐字重現 GH#861：`(short by -1 — files MISSING from the copy)`。⭐⭐ **而 `blizzardOverlayBoot.test.ts` 同時是 7/7 綠** —— 那就是「兩條對的守衛，組合是空的」的證據 |
| **M2** | 把 `tmp_got` 改回 `find "$dir" \| sed "s\|^$dir/\|\|"`（＝把 join key 漂回去） | ③**紅**，並印出四個檔名 |

⚠️ 兩個突變都用 `Edit` 逐行改回來，⛔ 全程沒有 `git checkout`。

---

## #874 —— `weapon_type` 的「保真權威」四個字

### 我重量了一次，票文的數字**全部成立**

```
① stock 側      帶 weapon_type 的列: 305 / 838
② 地圖側        自訂英雄 0 / 127 · 自訂單位 0 / 461   ⇒ 抽取器從來沒讀過這一欄
③ 拿去驗 tag    近戰 25 隻 · 解析得出 24 隻 · 一致 13 · ⛔ 矛盾 11  ⇒ 46%
```

矛盾的 11 隻與票文逐隻相同（`h00l` sword；`h01n` `h01o` `u00h` `u00j` `u010` `u01u`
`udre` `uvng` katana；`hart` `hpb1` greatsword）。

### ⭐⭐ 我**走完了 (a) 原本要走的那條路**，⛔ 不只是推翻它

CLAUDE.md：「更正也是一個宣稱 —— ⛔ 不要只推翻它，要走完它原本要走的那條路」。
⇒ 我真的去 w3u 裡把 (a) 量了一次，⭐ **而第一件事就是票文沒有的**：

| | |
|---|---|
| ⛔ **票文與直覺的假設** | 地圖側要讀的是 `weapType1`／`ua1t` |
| ⭐ **量到的** | SLK 的 `weapType1` 在 w3u 裡叫 **`ucs1`**（Attack 1 - Weapon **Sound**）。`ua1t` 是 Attack **Type**，值域 `pierce` / `hero` / `chaos` / `unknown` |

⇒ ⭐ **照 `ua1t` 去做 (a)，會把一整條錯的欄位匯進一個叫 `weapon_type` 的格子裡** ——
而它會通過每一條既有的閘，因為每一個零件都是對的。

拿真的那一欄（`ucs1`）量：

| | |
|---|---|
| 地圖自己設了值的英雄 | **18 / 127**（25 隻近戰裡只有 **3** 隻有） |
| 做完 (a) 之後的矛盾 | 11 → **10**（只修好 `godie-hart`：base 說 `MetalHeavyBash`，地圖自己說 `MetalMediumChop`） |

⇒ ⭐ **(a) 讓它變準一點（46% → 40%），⛔ 但變不成權威** ——
109 / 127 位英雄做完 (a) 之後**仍然**只有 base 的答案。
⇒ ⭐ **所以選 (b)「收回宣稱」不是偏好，是量出來的。**

### 落地

| | |
|---|---|
| **⛔ 不是**改一段更好的散文 | 散文會過期，而它過期的時候看起來跟真的一模一樣 |
| ⭐ **新檔** `tools/w3x-import/measure_weapon_type_authority.py` | 一個**跑得起來的指令**取代那句宣稱；READ-ONLY，⛔ 一個位元組都不寫 |
| ⭐ 兩個方向都校準 | `calibrate()`：分類詞彙要**同時**抓得到刃器與鈍器（只抓一邊 ⇒ 每一支同一類 ⇒ 讀起來就是「零矛盾」）；且「不認得的值」要**量不到**。解析數 0 ⇒ **離開非零說『尺壞了』**，⛔ 不是印「沒有矛盾」 |
| 改 `stock_unit_data.py` 的註解 | 拿掉「保真權威」；每一個結論**旁邊**帶著限定詞「這是 **base 的**武器」（⛔ 不是只寫在標題括號裡）；寫下 `ucs1` ≠ `ua1t` 這個坑 |
| ⛔ **欄位留著** | 它對 **stock 側**仍然是對的答案（知識不可以無聲消失） |

### ⭐ 第二個住處：找到了，也修了

`grep -rn "保真權威"` ⇒ **`docs/_reports/laneK_temp_20260827-0600.md:110`** 是這句話的**源頭**
（「#745 —— 盤點做完了，而且找到**近戰的保真權威**」），三天前從那一行走進 `stock_unit_data.py`。
⇒ 在那一節開頭補了一段 `> 更正` ——⛔ **沒有刪掉原文也沒有動那張表**（表量得沒錯，錯的是那個詞）。
順帶量到那張表自己的一個洞：它記 `godie-hvsh` 是 `_`，⛔ 而地圖自己其實寫了 `MetalHeavySlice`。

### ⚠️ 一件**沒有做**的事（在柵欄外，⛔ 不是忘了）

票的 Scope ③ 要把結論接回 `packages/shared/src/sim/systems/BasicAttackSystem.ts` 的
`WEAPON_TAGS` 檔頭（那裡記著遠程的權威 `Missileart=`，近戰那一半是**空白**，
⛔ 而空白會被讀成「還沒查」）。**那個檔在我的柵欄外。**
⇒ 結論寫進了 `stock_unit_data.py` 的註解與上面那支腳本；
⭐ 下一條 lane 要補的是**一段話**，內容是：

> 近戰那一半今天**沒有**逐英雄的權威表 —— ⛔ 這不是「還沒查」。
> 出處：`python3 tools/w3x-import/measure_weapon_type_authority.py`
> （base 解析的矛盾率 46%；做完「讀地圖的 `ucs1`」也只有 18/127 位英雄有自己的值）。

⚠️ 連帶：#817 的「反方向突變（把某一隻的 `fist` 改成 `sword` 要紅）」**確定做不到** ——
今天沒有任何一把尺可以判「這一隻的近戰 tag 對不對」。那要寫進 #817 的驗收標準並帶理由。

---

## #875 —— ⭐ 基線量到它**已經是對的**，所以我沒有動它

CLAUDE.md 第 1 條：「⭐ 如果基線量到它已經是對的，就停下來回報，⛔ 不要動它。」

### 判定：**(b) 是量測環境的洞**，⛔ 不是設計

證據鏈（每一段都指得到某一行）：

| 段 | 出處 |
|---|---|
| `w3xFamilyArtRows()` 讀的是 `abilityArtContent.abilityArtRows()` | `w3xFamilyArt.ts:102` —— 資料經**執行期的縫**（`setAbilityArtBindings`）進來，⛔ 不是讀檔 |
| 那道縫由誰灌 | `loadAbilityArtFromDisk()` —— 產生器的 `main()`（`generateFamilyContent.ts:327`）與 client 的 vitest setup（`apps/client/vite.config.ts:775` → `testSetup.vfxContent.ts`）**各叫一次** |
| ⇒ 誰量到 0 | 一個**兩者都沒做**的呼叫端（票文那支探針就是） |

⭐ **兩個方向都量過了**（⛔ 單邊校準的尺會在最需要說話時沉默）：

```
— 載入之前（＝票文說的「乾淨 checkout」）—
  familyArtRows: 21 · w3xFamilyArtRows: 0 · abilityArtRows: 0
— loadAbilityArtFromDisk() → 357 筆 —
  w3xFamilyArtRows: 169 · abilityArtRows: 169
  欄位普查: family 169 · tint 60 · w3xScale 34 · anchor 42 · flyHeight 15   ← 與票文逐格相同
```

### ⭐ 而票文的**前提**在它被寫下的同一天就過期了（GH#835）

票文寫「`ownedRowFields(abilityArtRows())` 正是**出貨守衛自己**用來推導所有權的式子
⇒ 它今天算出來是 ∅」。⛔ **今天不是了。**

| 東西 | 今天的狀態 |
|---|---|
| 所有權從哪裡推導 | `ownedAbilityFields()` ← `ABILITY_MIRROR` 的**鍵**（一張**與資料多寡無關**的投影表）。`generateFamilyContent.ts:154` 的 TSDoc 逐字把舊形狀列為 ⛔ 禁止 |
| `field-io.mts` 的 recipe | ⭐ **已經把 `abilities[*]` 量進去了**，而且帶著「量到 0 就擲」的校準（`field-io.mts:65-79`） |
| `abilityArtRows()` 回 0 的那條路 | ⭐ **已經 fail-loud**：`main()` 在 `bound === 0` 時**擲例外**，⛔ 不是靜靜跑完 |

### 兩條 AC 都跑過了，⛔ 而且是票自己寫的那兩條

```
$ node_modules/.bin/tsx tools/parallel-gates/field-io.mts --check
✓ field-io.json 是最新的                                        (exit 0)

$ bash scripts/product-quarantine.sh --doctor
④ 欄位級孤兒（整份是產物,而這幾欄沒有任何寫入端 —— GH#827）: 0
doctor: 入口 0 · 孤兒 0 · 未分類 0 · 欄位級孤兒 0 · 總計 0
```

`field-io.json` 裡 `content/config/vfx-families.json` 的
`abilities[*]` = `anchor` · `family` · `flyHeight` · `tint` · `w3xScale` ——
⭐ **就是那 169 列的五格**，每一格都寫得出寫入端。

### 反方向校準（⛔ 不改 repo 檔，在 `/private/tmp` 跑）

把 `ownedAbilityFields()` 換成空集合餵進 recipe 的同一段邏輯：

```
空的 abilities[*] ⇒ Error: ⛔ abilities[*] 量到 0 個產生器擁有的欄位 —— 這把尺壞了
```

⇒ ⭐ 那把尺在「已知沒有」的方向上**不是瞎的**。

### ⇒ #875 應該直接關，⛔ 不需要程式改動

⚠️ ⭐ 而這張票本身就是 CLAUDE.md 那一條的實例：
**「票文主張的現況，今天在哪一個環境下還成立？」** ——
`abilityArtRows()` 回 0 是真的，⛔ 但那是**在一個沒有載入內容的探針裡**，
⛔ 不是在產生器裡、也不是在 client 的測試裡。**東西在，只是不在你看的那個環境。**

---

## 這一輪跑過的閘（⭐ 只跑改到的，⛔ 沒跑 `pnpm test`／`skills:sync`）

| 指令 | 結果 |
|---|---|
| `npx vitest run packages/shared/src/ops/ggdAssetsSurplus.test.ts` | ✅ 3 passed（新守衛） |
| 同上 ＋ 突變 M1 / M2 | ⛔ 各紅一次，並指名 ✅ |
| `cd apps/client && npx vitest run src/render/views/blizzardOverlayBoot.test.ts` | ✅ 7 passed（**在 M1 之下也是綠的** —— 那是證據） |
| `python3 tools/w3x-import/measure_weapon_type_authority.py` | ✅ exit 0 |
| `node_modules/.bin/tsx tools/parallel-gates/field-io.mts --check` | ✅ 綠（唯讀） |
| `bash scripts/product-quarantine.sh --doctor` | ✅ 總計 0（唯讀） |

⛔ 沒有跑 `pnpm skills:sync`（它寫 `bundle.json`，全域只能一條）。
⛔ 沒有重跑任何 MPQ 抽取（`stock_unit_data.py` 只改註解，`WEAPON_MAP` 逐位元不變
⇒ `STOCK_UNITS.json` 一個位元組都沒動）。

## 開關

⭐ **三張都沒有開關 —— 因為三張都沒有取捨。**
#871 是一個 join key 的缺陷（沒有第二種對的拼法）、#874 是一句引用不到出處的宣稱
（沒有第二種真的講法）、#875 沒有改動。
⇒ 照 CLAUDE.md：「純修缺陷（沒有取捨）⛔ 不需要開關」。
