# 變身（第二形態）逐一對帳清單（#249）

> **工作單位是「一個英雄的整個第二形態」，不是單支技能。** 一次變身同時換掉模型、縮放、六格技能列、
> 攻擊型態、移動速度與 球體 附掛特效 —— 這些欄位互相牽連（例如 12 天地志狼變身後才有飛彈模型，
> 因為他從近戰變成遠程），所以檢查、修正、測試都必須**整個形態一起做**，每個英雄一個核取方塊。

> **擁有者指令（2026-07-26，取代舊的 #119）：**
> 「[變身]是一個完整獨立英雄設定包含技能組甚至3d model設定都有不一樣的特效、屬性設定跟技能組設定
> （包含球體/蝗蟲群）… 幾乎大部分的英雄都有變身技能。請你從 w3x 地圖好好搜尋逐一記錄到 md 檢查修正實作」

## 一句話結論

地圖裡有 **26 位**英雄擁有真正的「換單位」變身。**26 位的第二形態資料全部都還在**——
其中 **22 位**早就以「獨立英雄」的身分躺在 `content/champions/` 裡（只是沒有人知道它們是誰的變身），
另外 **4 位**在 `war3map.w3u` / `OBJECTS.json` 裡但沒被匯入。**沒有任何一位需要重新從 .w3x 抽取。**
缺的不是資料，是**關聯**（哪一份文件是誰的第二形態）與**機制**（模擬器裡完全沒有變身系統）。

**而且出貨名單踩到了地雷：50 個名額裡有 10 個裝的是「變身後」的形態，被當成本體出貨。**

---

## A. 統計

| 項目 | 數 |
|---|---|
| 地圖裡的英雄單位定義（`OBJECTS.json`） | 127 |
| 其中是「第二形態」的單位 | **26** |
| 實際獨立角色數 | **101** |
| 有真正換單位變身的角色 | **26（25.7%）** |
| 另有「只加 buff、不換單位」的偽變身技能 | 約 12（見 F 節，另立工項） |
| 第二形態已在 `content/` （掛錯位置） | **22** |
| 第二形態在 `w3u`/`OBJECTS.json` 但未匯入 | **4** |
| 第二形態完全找不到 | **0** |
| 反向缺口：本體未匯入（只出貨了變身形態） | **1**（87 曹操孟德 `O02N`） |

### 出貨名單（50）與變身的交集

| 狀況 | 數 | ids |
|---|---|---|
| 名單裡裝的是**第二形態**（當成本體出貨） | **10** | `godie-h020` `godie-n01c` `godie-o00x` `godie-u01u` `godie-e007` `godie-n00p` `godie-u00l` `godie-u010` `godie-h02r` `godie-h02u` |
| 名單裡裝的是正確的本體 | 9 | `godie-e00k` `godie-e002` `godie-e001` `godie-orkn` `godie-n003` `godie-ofar` `godie-u00n` `godie-e00w` `godie-h01n` |
| 兩個形態都不在名單 | 7 | 英雄 06 / 26 / 40 / 61 / 70 / 81 / 87 |

---

## B. 這次是怎麼判定的（方法，以及為什麼可以信）

**判定鍵是 rawcode，不是相似度。** WC3 的 Metamorphosis 家族把兩個單位 rawcode 直接寫在技能物件上：

- `Eme1` = **本體**單位 rawcode
- `Emeu` = **變身後**單位 rawcode

直接解析 `tools/w3x-import/out/GoDieEX22s-src/raw/war3map.w3a`（不是 `OBJECTS.json`——匯入器把這兩個
欄位丟掉了，那是 #56 的老問題），全圖共 **26 個**技能物件帶有這組欄位，就是這 26 組配對。

**方向另外有三重獨立佐證，不是用猜的：**

1. **作者自己的編輯器標籤 `unsf`。** 26 組**全部**都是本體 `(NN)`、變身後 `(NN變身名)`——
   `(09)`→`(09超三)`、`(12)`→`(12破凰狀態)`、`(19)`→`(19紫色披風)`、`(92)`→`(92 臥草)`。
   這是地圖作者親手打的字，直接對上擁有者點名的每一個例子。
2. **名字不同的三組**：`Eme1=Hgam(妙蛙種子)` → `Emeu=H02R(妙蛙花)`；
   `Eme1=H01N(開外掛的死神)` → `Emeu=H01O(外掛開很大的死神)`；
   `Eme1=Umal(北斗神拳掌門人)` → `Emeu=U00L(北斗之鼠)`。
3. **技能列歸屬**：變身技能本身掛在本體的 `uabi`/`uhab` 上，變身後的單位才帶那些 `球體` 附掛。

**一個必須寫進程式碼的防呆：** `Eme1`/`Emeu` 在**等級 2–4 經常是複製貼上的殘留**
（例：`A0T1` 勇者小呆的 lv2–4 還指向安云的 `E00K/E00Z`；`A0O6` 的 lv2–4 指向 Saber；
`A0LN`/`A0VG` 的 lv4 指向 `h01L/h01M 集氣用單位` 這種施法假單位）。
**只採信等級 1，而且要求等級 1 的配對與技能擁有者是同一位英雄**——這個過濾才得到乾淨的 26/26。

### 順帶推翻 #113

`docs/_champion-dedup-113.md` 把 14 組「同名同模型」判成重複匯入，建議（幸好只是）報告不刪。
**這 14 組全部都是本體↔第二形態，一組重複匯入都沒有。** #113 比對的是 name / model / baseStats /
四支英雄技能名——那正好是 WC3 變身**規定要保持一致**的欄位（否則 HUD 會整個換掉）。真正的差異全在
它沒比的地方：`uabi` 一般技能列（球體、額外被動、法術書都在這裡）、`uspe`/`umvs` 移速、
`ua1c` 攻擊間隔、`usca` 縮放、`umdl` 模型。#113 看到 14 組裡有 12 組「stats identical: no」，
卻寫下「（匯入器讀到同一位英雄的兩個實例）」把它解釋掉了——那句話就是誤判點。

**#113 的結論仍然要撤銷**（`isSameCharacter` 目前把 14 組全部折疊），但它「不要刪」的建議必須維持：
真刪下去，整份第二形態資料就沒了。

### 目前已經在生產環境造成的錯誤（三處）

1. `packages/shared/src/content/championIdentity.ts::isSameCharacter` —— 把 14 組全部折成一個角色，
   `distinctCharacters()` 因此認為英雄與其變身是同一人。
2. `apps/client/src/ui/platform/marqueeRoster.ts:125-149` `SHARED_PORTRAIT_GROUPS` ——
   把 14 組裡 12 組的第二形態當「重複磁貼」藏起來，所以上面那些錯誤在登入跑馬燈裡看不見。
3. `apps/platform/internal/curation/starter.go::starterChampions` —— 50 格裡 10 格裝的是變身形態。

---

## C. 檢查流程（每個英雄一輪）

1. 讀本節該英雄的**形態表**與**數值差異表**，對照 `content/champions/<本體>.json` 與 `<第二形態>.json`
2. 確認 `content/` 那兩份文件確實對得上 w3u（本檔的數值直接來自 `raw/war3map.w3u`，不是匯入後的值）
3. 建立關聯：本體文件要指得到第二形態文件（目前 `champion@1` schema **沒有任何欄位放得下這個關聯**，
   而且 schema 是 `.strict()`——這是必須先解掉的前置）
4. 出貨名單若裝錯形態（10 位），決定是換成本體、還是兩個都開
5. 綁 VFX：第二形態的 `球體` 附掛（附錄 G）目前**完全沒有接到 renderer**
6. 實作機制：施放→整份 runtime 定義換成第二形態→`ahdu` 計時→到期換回
7. 測試**整個形態**：模型、縮放、六格技能、攻速/移速、附掛特效都要驗，只驗數值不算過
8. 勾掉核取方塊，記錄結論

### 機制只有一種（好消息）

26 組**全部**是 Pattern A（WC3 Metamorphosis，換整個單位定義）。
Druid 變形（`Abrf`/`Arav`）**0 用**；`Chaos`/`ANcr` 永久換型**0 用**（唯一的 `Cha1` 指向一個 0.1 縮放的特效假單位）；
trigger 驅動**實質 0**（`raw/war3map.j` 56,765 行裡 `SetUnitModel` **0 次**，
`ReplaceUnitBJ` **3 次全部是玩家名稱作弊彩蛋**，見 F 節）。

所以這是**一套系統服務 26 位**，不是 26 段客製腳本。這也順帶回答了 #119 沒定案的問題
（「每回合重置還是照原圖計時自動變回」）：**原圖的答案是照 `ahdu` 自動變回**，
硬持續 5–30 秒、冷卻 15–75 秒。只有 3 個無持續時間的切換式例外（`A0DZ` 風王結界、`A0O6` 紮根、`Aphx`）
是再施放一次才變回。

**注意「變身抄自哪個技能」不能當判定依據：** 26 個裡只有 6 個 `base == 'AEme'`（真 Metamorphosis），
**17 個 base 是 `AEIl`（火焰護甲）**、2 個 `ANrg`、1 個 `Aphx`。
**永遠掃欄位 `Eme1`/`Emeu`，不要掃 base**，掃 base 會漏掉 65%。

---
## D. 總表

「資料」欄：`content/` = 第二形態已有獨立文件（掛錯位置，需要建立關聯）；`未匯入` = 只在 w3u/OBJECTS.json。

| # | 角色 | 變身技能 | 本體 | 第二形態 | 作者標籤 | 持續 | CD | 資料 | 出貨名單 |
|---|---|---|---|---|---|---|---|---|---|
| 04 | 黑魔導士 - 莉娜因巴斯 | 04-002 惡夢魔王的碎片 `A0OE` | `godie-hjai` | `godie-h020` | (04惡夢) | 20/12/18/24s | 70/60/60/60s | `content/` | **⚠ 裝了變身形態** |
| 08 | 傳說的龍騎士 - 勇者小呆 | 08-002 龍魔人 `A0T1` | `godie-nbbc` | `godie-n01c` | (08龍魔人) | 20/15/21/27s | 60s | `content/` | **⚠ 裝了變身形態** |
| 09 | 賽亞人 - 悟空 | 09-03 超級賽亞人 `A09E` | `godie-ogrh` | `godie-o00x` | (09超三) | 8/12/16/20s | 60s | `content/` | **⚠ 裝了變身形態** |
| 11 | 三刀流劍士 - 索隆 | 11-002 武裝色霸氣 `A10N` | `godie-udre` | `godie-u01u` | (11武裝霸王) | 15/15/21/27s | 60s | `content/` | **⚠ 裝了變身形態** |
| 12 | 龍之子 - 天地志狼 | 12-03 破凰之心-徒手空破山 `A02W` | `godie-ewar` | `godie-e007` | (12破凰狀態) | 12/18/24/30s | 45s | `content/` | **⚠ 裝了變身形態** |
| 18 | 妖狐藏馬 - 南野秀一 | 18-03 妖狐變化 `A0IH` | `godie-nsjs` | `godie-n00p` | (18 妖狐化) | 8/12/16/20s | 60s | `content/` | **⚠ 裝了變身形態** |
| 19 | 戰國刺客Azumi - 安云 | 19-002 紫色披風 `A0SZ` | `godie-e00k` | `godie-e00z` | (19紫色披風) | 10/15/21/27s | 60s | `content/` | 本體 ✓ |
| 20 | 亞瑟王 - Saber | 20-01 風王結界 `A0DZ` | `godie-e002` | `godie-e00l` | (20風王結界) | — | — | `content/` | 本體 ✓ |
| 22 | 蟬在叫人壞掉 - 龍宮禮奈 | 22-04 雛見澤症候群L5 `A02Q` | `godie-e001` | `godie-e00n` | (22L5) | 7/14/21/28s | 60/60/60/75s | `content/` | 本體 ✓ |
| 25 | 北斗神拳掌門人 - 拳四郎 | 25-04 ChangeDNA `A0HW` | `godie-umal` | `godie-u00l` | (25變身) | 8/16/24/28s | 60/60/60/75s | `content/` | **⚠ 裝了變身形態** |
| 30 | 電車癡漢 - 臭作 | 30-002 變態紳士 `A0YT` | `godie-orkn` | `godie-o030` | (30變態紳士) | 15/15/21/27s | 60s | **未匯入** | 本體 ✓ |
| 38 | 邪眼師 - 飛影 | 38-00 邪眼全開 `A0OH` | `godie-uvng` | `godie-u010` | (38邪眼) | 10s | 60s | `content/` | **⚠ 裝了變身形態** |
| 42 | 黑暗福音 - 依文潔琳 | 42-002 魔力印章 `A06K` | `godie-n003` | `godie-n01g` | (42魔力印章) | 7/15/21/27s | 60s | `content/` | 本體 ✓ |
| 58 | 神奇寶貝兒 - 皮卡丘 | 58-04 瘋狂皮卡丘 `A040` | `godie-ofar` | `godie-o02l` | (58變身) | 6/12/18/24s | 60s | `content/` | 本體 ✓ |
| 76 | 草帽小子 - 魯夫 | 76-00 二檔 `A0IR` | `godie-u00n` | `godie-u00o` | (76 二檔) | 20s | 60s | `content/` | 本體 ✓ |
| 77 | 神鳴流劍士 - 櫻綻剎那 | 77-03 GLADIARIA ALAT `A0JG` | `godie-e00w` | `godie-e00x` | (77 變身) | 6/12/18/24s | 60s | `content/` | 本體 ✓ |
| 79 | 開外掛的死神 - 黑崎一護 | 79-04 卍解 `A0LN` | `godie-h01n` | `godie-h01o` | (79卍解) | 8/16/24/25s | 60/60/60/30s | `content/` | 本體 ✓ |
| 90 | 種子神奇寶貝 - 妙蛙種子 | 90-002 超進化! 妙蛙花 `A0VG` | `godie-hgam` | `godie-h02r` | (90 妙蛙花) | 18/25s | 75/30s | `content/` | **⚠ 裝了變身形態** |
| 92 | 看似憂鬱的神獸 - 草泥馬 | 92-01 臥草泥馬 `A0W9` | `godie-h02v` | `godie-h02u` | (92 臥草) | 10/10/5/5s | 40/40/20/20s | `content/` | **⚠ 裝了變身形態** |
| 06 | 職業獵人 - 傑 富力士 | 06-04 傑桑變化 `A0Y1` | `godie-ucrl` | `godie-u034` | (06 傑桑) | 7/14/21s | 60s | `content/` | — |
| 26 | 豪洨天王 - 鄭先生 | 26-04 開天闢地‧洨者聖臨 `A0EW` | `godie-harf` | `godie-h00w` | (26洨者狀態) | 7/10.5/14s | 75s | **未匯入** | — |
| 40 | 地獄歌神 - 憤怒的胖虎 | 40-03 萬解-貓王胖虎 `A0ND` | `godie-nman` | `godie-n01b` | (40萬解) | 12/18/24/30s | 75s | **未匯入** | — |
| 61 | 重金屬樂團的怪物 - 克勞薩 | 61-00百連我殺 效果 `Aphx` | `godie-u012` | `godie-u011` | (61 鳳凰蛋) | — | — | `content/` | — |
| 70 | 白木老樹精 - 白木卡迪那 | 70-00 紮根 `A0O6` | `godie-e00s` | `godie-e010` | (70紮根) | — | 15s | **未匯入** | — |
| 81 | 魔砲少女 - 高町奈葉 | 81-002 Exellion Mode `A0XP` | `godie-o01z` | `godie-o02v` | (81EX mode) | 15/12/18/24s | 60s | `content/` | — |
| 87 | 曹操孟德 - 阿瞞大人 | 87-03 天下號令 `A0DB` | `godie-o02n` | `godie-o02o` | (87變身) | 6/12/18/24s | 60s | `content/` | — |

---
## E. 逐一對帳（每個英雄一個核取方塊）

### E1. 出貨名單相關（19 位，優先做）

> 這 19 位裡有 **10 位**名單裝的是變身形態。這是本文件裡最急的一段。

### - [ ] 黑魔導士 - 莉娜因巴斯　英雄 04　`godie-hjai` → `godie-h020`　**【出貨名單裝的是這個變身形態 ⚠】**

**變身技能**　`A0OE` 04-002 惡夢魔王的碎片　（base `AEIl`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 20/12/18/24 秒 | 70/60/60/60 秒 | 360/240/360/480 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `Hjai` | `H020` |
| content id | `godie-hjai` | `godie-h020` |
| 作者編輯器標籤 `unsf` | `(04)` | `(04惡夢)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | — | ⚠️ **是** |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 碰撞半徑 (ucol) | `—` | `31` |
| 基礎 MP (umpm) | `100` | `5000` |
| MP 回復 (umpr) | `0.1` | `1000` |
| 智力 (uint) | `27` | `127` |
| 一般技能列 (uabi) | `AInv,A0UH,A0OE` | `AInv,A0UH,A0OE,A023` |

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A023` | 04-05 重破斬 | `ACt2` | `Abilities\Spells\NightElf\Tranquility\Tranquility.mdl` |

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-h020.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- ⚠ **出貨名單放錯形態**：`starter.go` 收的是 `godie-h020`（變身後），本體 `godie-hjai` 不在名單。需要擁有者決定：換成本體、或兩個都開。
- `#113` 誤判：是（此組在那 14 組裡）

### - [ ] 傳說的龍騎士 - 勇者小呆　英雄 08　`godie-nbbc` → `godie-n01c`　**【出貨名單裝的是這個變身形態 ⚠】**

**變身技能**　`A0T1` 08-002 龍魔人　（base `AEIl`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 20/15/21/27 秒 | 60 秒 | 200/210/300/390 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `Nbbc` | `N01C` |
| content id | `godie-nbbc` | `godie-n01c` |
| 作者編輯器標籤 `unsf` | `(08)` | `(08龍魔人)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | — | ⚠️ **是** |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 一般技能列 (uabi) | `AInv,A05V,A0T1` | `AInv,A05V,A0T1,A0T0,A0MB,A05X,A0C5` |

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A05X` | （無名） | `AIsr` | — |
| ＋ 變身才有 | `A0C5` | （無名） | `AId0` | — |
| ＋ 變身才有 | `A0MB` | （無名） | `AIx5` | — |
| ＋ 變身才有 | `A0T0` | 球體(龍魔人) | `Asph` | `Abilities\Spells\Undead\Unsummon\UnsummonTarget.mdl` |

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-n01c.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- ⚠ **出貨名單放錯形態**：`starter.go` 收的是 `godie-n01c`（變身後），本體 `godie-nbbc` 不在名單。需要擁有者決定：換成本體、或兩個都開。
- `#113` 誤判：是（此組在那 14 組裡）

### - [ ] 賽亞人 - 悟空　英雄 09　`godie-ogrh` → `godie-o00x`　**【出貨名單裝的是這個變身形態 ⚠】**

**變身技能**　`A09E` 09-03 超級賽亞人　（base `AEIl`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 8/12/16/20 秒 | 60 秒 | 160/240/320/400 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `Ogrh` | `O00X` |
| content id | `godie-ogrh` | `godie-o00x` |
| 作者編輯器標籤 `unsf` | `(09)` | `(09超三)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | — | ⚠️ **是** |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 稱號 (uname) | `賽亞人` | `超級賽亞人` |
| 模型檔 (umdl) | `goku.mdl` | `Goku.mdl` |
| 移動型態 (umvt) | `—` | `hover` |
| 移動速度 (umvs) | `310` | `400` |
| 飛行高度 (umvh) | `—` | `30` |
| 攻擊間隔 (ua1c) | `1.9` | `1.2` |
| HP 回復 (uhpr) | `0.3` | `—` |
| MP 回復 (umpr) | `0.15` | `0.1` |
| 音效組 (usnd) | `Arthas` | `—` |
| 一般技能列 (uabi) | `A0O1,A0NL,AInv,A0MI` | `A0S7,A0O1,A0NL,AInv,A017,A0MJ` |

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A017` | 超賽攻擊 | `Alit` | `Abilities\Spells\Orc\WarStomp\WarStompCaster.mdl` |
| ＋ 變身才有 | `A0MJ` | 球體(悟空超3) | `Asph` | `Goku3head.mdx` |
| ＋ 變身才有 | `A0S7` | 09-002b 悟空隱藏法術書 | `Aspb` | — |
| － 變身失去 | `A0MI` | 球體(悟空正常) | `Asph` | `Gokuhead.mdx` |

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-o00x.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- ⚠ **出貨名單放錯形態**：`starter.go` 收的是 `godie-o00x`（變身後），本體 `godie-ogrh` 不在名單。需要擁有者決定：換成本體、或兩個都開。
- `#113` 誤判：否（此組不在 #113 的 14 組）

### - [ ] 三刀流劍士 - 索隆　英雄 11　`godie-udre` → `godie-u01u`　**【出貨名單裝的是這個變身形態 ⚠】**

**變身技能**　`A10N` 11-002 武裝色霸氣　（base `AEIl`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 15/15/21/27 秒 | 60 秒 | 200/210/300/390 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `Udre` | `U01U` |
| content id | `godie-udre` | `godie-u01u` |
| 作者編輯器標籤 `unsf` | `(11)` | `(11武裝霸王)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | — | ⚠️ **是** |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 一般技能列 (uabi) | `AInv,A0OU,A10N` | `AInv,A10N,A0OU,A0C5,A05X,A10O` |

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A05X` | （無名） | `AIsr` | — |
| ＋ 變身才有 | `A0C5` | （無名） | `AId0` | — |
| ＋ 變身才有 | `A10O` | 球體(武裝霸王) | `Asph` | `war3mapImported\poweraura.MDX` |

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-u01u.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- ⚠ **出貨名單放錯形態**：`starter.go` 收的是 `godie-u01u`（變身後），本體 `godie-udre` 不在名單。需要擁有者決定：換成本體、或兩個都開。
- `#113` 誤判：是（此組在那 14 組裡）

### - [ ] 龍之子 - 天地志狼　英雄 12　`godie-ewar` → `godie-e007`　**【出貨名單裝的是這個變身形態 ⚠】**

**變身技能**　`A02W` 12-03 破凰之心-徒手空破山　（base `AEIl`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 12/18/24/30 秒 | 45 秒 | 225/300/375 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `Ewar` | `E007` |
| content id | `godie-ewar` | `godie-e007` |
| 作者編輯器標籤 `unsf` | `(12)` | `(12破凰狀態)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | — | ⚠️ **是** |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 武器型態 (ua1w) | `—` | `msplash` |
| 攻擊距離 (ua1r) | `—` | `450` |
| 飛彈模型 (ua1m) | `—` | `Abilities\Spells\Orc\Shockwave\ShockwaveMissile.mdl` |
| 飛彈模型 (ua1m) | `—` | `1` |
| 飛彈速度 (ua1z) | `—` | `1200` |
| 範圍半徑 (ua1f) | `—` | `50` |
| 可攻擊目標 (ua1p) | `—` | `ground,structure,debris,air,enemy` |

<sub>其他有差異、但未在本表解讀的原始欄位碼：`ua1h` `ua1q` `uhd1` `uma1` `uqd1`</sub>

**技能列變化**：無 —— 純數值／模型換裝，六格技能不變。

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-e007.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- ⚠ **出貨名單放錯形態**：`starter.go` 收的是 `godie-e007`（變身後），本體 `godie-ewar` 不在名單。需要擁有者決定：換成本體、或兩個都開。
- `#113` 誤判：是（此組在那 14 組裡）

### - [ ] 妖狐藏馬 - 南野秀一　英雄 18　`godie-nsjs` → `godie-n00p`　**【出貨名單裝的是這個變身形態 ⚠】**

**變身技能**　`A0IH` 18-03 妖狐變化　（base `AEIl`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 8/12/16/20 秒 | 60 秒 | 200/300/400/500 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `Nsjs` | `N00P` |
| content id | `godie-nsjs` | `godie-n00p` |
| 作者編輯器標籤 `unsf` | `(18)` | `(18 妖狐化)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | — | ⚠️ **是** |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 模型檔 (umdl) | `fox2.mdl` | `fox.mdl` |
| 模型縮放 (usca) | `1.05` | `1.15` |
| 武器型態 (ua1w) | `mbounce` | `missile` |
| 基礎傷害 (ua1b) | `—` | `64` |
| 飛彈模型 (ua1m) | `Abilities\Weapons\Dryadmissile\Dryadmissile.mdl` | `Abilities\Weapons\ChimaeraAcidMissile\ChimaeraAcidMissile.mdl` |
| 飛彈速度 (ua1z) | `950` | `1500` |
| 護甲 (udef) | `—` | `4` |
| 音效組 (usnd) | `Archer` | `DruidOfTheTalon` |
| 一般技能列 (uabi) | `AInv,A002,A0SE` | `AInv,A00N,A0SE,A0II` |

<sub>其他有差異、但未在本表解讀的原始欄位碼：`udl1`</sub>

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A00N` | 18-03-01 召喚毒蕈 | `ACtn` | — |
| ＋ 變身才有 | `A0II` | （無名） | `Asph` | `Abilities\Weapons\IllidanMissile\IllidanMissile.mdl` |
| － 變身失去 | `A002` | 18-00 薔薇荊棘之刃 | `Asal` | — |

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-n00p.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- ⚠ **出貨名單放錯形態**：`starter.go` 收的是 `godie-n00p`（變身後），本體 `godie-nsjs` 不在名單。需要擁有者決定：換成本體、或兩個都開。
- `#113` 誤判：是（此組在那 14 組裡）

### - [ ] 北斗神拳掌門人 - 拳四郎　英雄 25　`godie-umal` → `godie-u00l`　**【出貨名單裝的是這個變身形態 ⚠】**

**變身技能**　`A0HW` 25-04 ChangeDNA　（base `AEIl`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 8/16/24/28 秒 | 60/60/60/75 秒 | 80/160/240 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `Umal` | `U00L` |
| content id | `godie-umal` | `godie-u00l` |
| 作者編輯器標籤 `unsf` | `(25)` | `(25變身)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | — | ⚠️ **是** |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 稱號 (uname) | `北斗神拳掌門人` | `北斗之鼠` |
| 模型檔 (umdl) | `units\critters\VillagerMan1\VillagerMan1.mdl` | `HeroPikachu.mdl` |
| 模型縮放 (usca) | `1.65` | `2` |
| 攻擊間隔 (ua1c) | `2` | `1.5` |
| 護甲型態 (uarm) | `Stone` | `—` |
| 音效組 (usnd) | `Uther` | `—` |
| 一般技能列 (uabi) | `AInv,A07H,A10Y` | `AInv,A07H,A0HX,A0FO,A10Y` |

<sub>其他有差異、但未在本表解讀的原始欄位碼：`uclb` `uclg` `uclr`</sub>

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A0FO` | 黑化攻擊 | `Alit` | `Abilities\Spells\Human\Thunderclap\ThunderClapCaster.mdl` |
| ＋ 變身才有 | `A0HX` | （無名） | `Asph` | `Abilities\Spells\Orc\LightningShield\LightningShieldTarget.mdl` |

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-u00l.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- ⚠ **出貨名單放錯形態**：`starter.go` 收的是 `godie-u00l`（變身後），本體 `godie-umal` 不在名單。需要擁有者決定：換成本體、或兩個都開。
- `#113` 誤判：否（此組不在 #113 的 14 組）

### - [ ] 邪眼師 - 飛影　英雄 38　`godie-uvng` → `godie-u010`　**【出貨名單裝的是這個變身形態 ⚠】**

**變身技能**　`A0OH` 38-00 邪眼全開　（base `AEme`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 10 秒 | 60 秒 | 0 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `Uvng` | `U010` |
| content id | `godie-uvng` | `godie-u010` |
| 作者編輯器標籤 `unsf` | `(38)` | `(38邪眼)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | — | ⚠️ **是** |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 移動速度 (umvs) | `310` | `360` |
| 音效組 (usnd) | `—` | `Shade` |
| 一般技能列 (uabi) | `AInv,A0OH,A0SO` | `AInv,A0OH,A0IW,A0OI,A0FR,A0SO` |

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A0FR` | （無名） | `Asph` | `Environment\LargeBuildingFire\LargeBuildingFire1.mdl` |
| ＋ 變身才有 | `A0IW` | 76-00-02 二檔增加攻速 | `AIsx` | `Environment\LargeBuildingFire\LargeBuildingFire1.mdl` |
| ＋ 變身才有 | `A0OI` | 球體(飛影BODY) | `Asph` | `units\orc\SentryWard\SentryWard.mdl` |

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-u010.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- ⚠ **出貨名單放錯形態**：`starter.go` 收的是 `godie-u010`（變身後），本體 `godie-uvng` 不在名單。需要擁有者決定：換成本體、或兩個都開。
- `#113` 誤判：是（此組在那 14 組裡）

### - [ ] 種子神奇寶貝 - 妙蛙種子　英雄 90　`godie-hgam` → `godie-h02r`　**【出貨名單裝的是這個變身形態 ⚠】**

**變身技能**　`A0VG` 90-002 超進化! 妙蛙花　（base `AEme`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 18/25 秒 | 75/30 秒 | 350/10 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `Hgam` | `H02R` |
| content id | `godie-hgam` | `godie-h02r` |
| 作者編輯器標籤 `unsf` | `(90)` | `(90 妙蛙花)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | — | ⚠️ **是** |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 本名 (upro) | `妙蛙種子` | `妙蛙花` |
| 模型縮放 (usca) | `1.2` | `3` |
| 選取圈 (ussc) | `1.3` | `5` |
| 碰撞半徑 (ucol) | `31` | `35` |
| 移動型態 (umvt) | `—` | `amph` |
| 移動速度 (umvs) | `300` | `240` |
| 武器型態 (ua1w) | `normal` | `mbounce` |
| 攻擊距離 (ua1r) | `100` | `—` |
| 攻擊間隔 (ua1c) | `2` | `1.2` |
| 基礎傷害 (ua1b) | `—` | `50` |
| 飛彈模型 (ua1m) | `Abilities\Weapons\GargoyleMissile\GargoyleMissile.mdl` | `Abilities\Spells\NightElf\FaerieFire\FaerieFireTarget.mdl` |
| 飛彈速度 (ua1z) | `—` | `250` |
| 範圍半徑 (ua1f) | `—` | `1600` |
| 可攻擊目標 (ua1p) | `—` | `ground,air,organic` |
| 一般技能列 (uabi) | `AInv,A0KV,A0VG` | `AInv,A0KV,A0VG,A0VH` |

<sub>其他有差異、但未在本表解讀的原始欄位碼：`ucs1` `uimz` `ulpx` `ulpz` `uma1` `urb1` `urun` `uscb` `usma` `utc1`</sub>

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A0VH` | （無名） | `Asph` | `Doodads\Outland\Plants\Outland_Plant\Outland_Plant4.mdl` |

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-h02r.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- ⚠ **出貨名單放錯形態**：`starter.go` 收的是 `godie-h02r`（變身後），本體 `godie-hgam` 不在名單。需要擁有者決定：換成本體、或兩個都開。
- `#113` 誤判：否（此組不在 #113 的 14 組）

### - [ ] 看似憂鬱的神獸 - 草泥馬　英雄 92　`godie-h02v` → `godie-h02u`　**【出貨名單裝的是這個變身形態 ⚠】**

**變身技能**　`A0W9` 92-01 臥草泥馬　（base `AEme`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 10/10/5/5 秒 | 40/40/20/20 秒 | 160 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `H02V` | `H02U` |
| content id | `godie-h02v` | `godie-h02u` |
| 作者編輯器標籤 `unsf` | `(92)` | `(92 臥草)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | — | ⚠️ **是** |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 移動速度 (umvs) | `310` | `0` |
| 一般技能列 (uabi) | `A0W6,A0Z9,AInv` | `A0W6,A0Z9,A0W8,AInv` |

<sub>其他有差異、但未在本表解讀的原始欄位碼：`ua1g` `ugor`</sub>

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A0W8` | 92-01-01 生命再生光氣 | `ACnr` | `Abilities\Spells\Items\HealingSalve\HealingSalveTarget.mdl` |

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-h02u.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- ⚠ **出貨名單放錯形態**：`starter.go` 收的是 `godie-h02u`（變身後），本體 `godie-h02v` 不在名單。需要擁有者決定：換成本體、或兩個都開。
- `#113` 誤判：是（此組在那 14 組裡）

### - [ ] 戰國刺客Azumi - 安云　英雄 19　`godie-e00k` → `godie-e00z`　**【出貨名單】**

**變身技能**　`A0SZ` 19-002 紫色披風　（base `AEIl`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 10/15/21/27 秒 | 60 秒 | 200/210/300/390 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `E00K` | `E00Z` |
| content id | `godie-e00k` | `godie-e00z` |
| 作者編輯器標籤 `unsf` | `(19)` | `(19紫色披風)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | ✅ | — |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 移動速度 (umvs) | `310` | `522` |
| 攻擊間隔 (ua1c) | `2` | `1.8` |
| 一般技能列 (uabi) | `AInv,A0RG,A0SZ` | `AInv,A0RH,A0SZ` |

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A0RH` | 19-00 閃擊 | `AHbh` | `Abilities\Spells\Items\SpellShieldAmulet\SpellShieldCaster.mdl` |
| － 變身失去 | `A0RG` | 19-00 閃擊 | `AHbh` | `Abilities\Spells\Items\SpellShieldAmulet\SpellShieldCaster.mdl` |

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-e00z.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- 出貨名單收的是本體 `godie-e00k`，正確。
- `#113` 誤判：是（此組在那 14 組裡）

### - [ ] 亞瑟王 - Saber　英雄 20　`godie-e002` → `godie-e00l`　**【出貨名單】**

**變身技能**　`A0DZ` 20-01 風王結界　（base `ANrg`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| — | — | 0 |

> ⚠ 無 `ahdu` 持續時間 —— 這是**切換式**變身，再施放一次才變回，不是計時自動復原。

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `E002` | `E00L` |
| content id | `godie-e002` | `godie-e00l` |
| 作者編輯器標籤 `unsf` | `(20)` | `(20風王結界)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | ✅ | — |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 一般技能列 (uabi) | `AInv,A0CQ,A0SP` | `AInv,A05M,A0CQ,A0M3,A0SP` |

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A05M` | 20-01-00 風王法術書 | `Aspb` | — |
| ＋ 變身才有 | `A0M3` | 風王攻擊 | `Alit` | `HolyAwakening.mdx` |

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-e00l.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- 出貨名單收的是本體 `godie-e002`，正確。
- `#113` 誤判：是（此組在那 14 組裡）

### - [ ] 蟬在叫人壞掉 - 龍宮禮奈　英雄 22　`godie-e001` → `godie-e00n`　**【出貨名單】**

**變身技能**　`A02Q` 22-04 雛見澤症候群L5　（base `AEIl`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 7/14/21/28 秒 | 60/60/60/75 秒 | 70/140/210 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `E001` | `E00N` |
| content id | `godie-e001` | `godie-e00n` |
| 作者編輯器標籤 `unsf` | `(22)` | `(22L5)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | ✅ | — |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 移動速度 (umvs) | `300` | `400` |
| 攻擊間隔 (ua1c) | `2` | `1.5` |
| 基礎傷害 (ua1b) | `—` | `55` |
| 一般技能列 (uabi) | `AInv,A0CL,A0SU` | `A0FR,A0SB,AInv,A0CL,A0SV` |

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A0FR` | （無名） | `Asph` | `Environment\LargeBuildingFire\LargeBuildingFire1.mdl` |
| ＋ 變身才有 | `A0SB` | L5攻擊 | `Alit` | `BloodBreathStream.mdx` |
| ＋ 變身才有 | `A0SV` | 22-002 月光下的決鬥者 | `AHbh` | — |
| － 變身失去 | `A0SU` | 22-002 月光下的決鬥者 | `AHbh` | — |

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-e00n.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- 出貨名單收的是本體 `godie-e001`，正確。
- `#113` 誤判：是（此組在那 14 組裡）

### - [ ] 電車癡漢 - 臭作　英雄 30　`godie-orkn` → `godie-o030`　**【出貨名單】**

**變身技能**　`A0YT` 30-002 變態紳士　（base `AEIl`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 15/15/21/27 秒 | 60 秒 | 200/210/300/390 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `Orkn` | `O030` |
| content id | `godie-orkn` | `godie-o030` |
| 作者編輯器標籤 `unsf` | `(30)` | `(30變態紳士)` |
| 在 `content/champions/` | ✅ | ❌ **未匯入** |
| 在出貨 50 名單 | ✅ | — |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 模型縮放 (usca) | `—` | `3` |
| 移動型態 (umvt) | `—` | `fly` |
| 飛行高度 (umvh) | `—` | `300` |
| 攻擊距離 (ua1r) | `500` | `1600` |
| 攻擊間隔 (ua1c) | `2` | `1.7` |
| 飛彈模型 (ua1m) | `—` | `Abilities\Weapons\KeeperGroveMissile\KeeperGroveMissile.mdl` |
| 飛彈速度 (ua1z) | `—` | `1600` |
| 索敵距離 (uacq) | `—` | `1600` |
| 力量成長 (ustp) | `1.9` | `1.7` |
| 一般技能列 (uabi) | `AInv,A029,A0YY` | `AInv,A029,A0YT,A02I,A08K,A0HN` |

<sub>其他有差異、但未在本表解讀的原始欄位碼：`ubs1` `udp1`</sub>

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A02I` | （無名） | `AIx5` | — |
| ＋ 變身才有 | `A08K` | （無名） | `AIx5` | — |
| ＋ 變身才有 | `A0HN` | 21-04x 封絕 | `Aasl` | — |
| ＋ 變身才有 | `A0YT` | 30-002 變態紳士 | `AEIl` | — |
| － 變身失去 | `A0YY` | 30-002 變態紳士 | `Aegr` | — |

**資料狀態與待辦**

- 資料：**未匯入** —— 定義在 `raw/war3map.w3u` / `OBJECTS.json` 的 `O030`，`content/champions/godie-o030.json` 不存在，需要走一次匯入。
- 出貨名單收的是本體 `godie-orkn`，正確。
- `#113` 誤判：否（此組不在 #113 的 14 組）

### - [ ] 黑暗福音 - 依文潔琳　英雄 42　`godie-n003` → `godie-n01g`　**【出貨名單】**

**變身技能**　`A06K` 42-002 魔力印章　（base `AEIl`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 7/15/21/27 秒 | 60 秒 | 999/210/300/390 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `N003` | `N01G` |
| content id | `godie-n003` | `godie-n01g` |
| 作者編輯器標籤 `unsf` | `(42)` | `(42魔力印章)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | ✅ | — |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 移動速度 (umvs) | `295` | `160` |
| 力量成長 (ustp) | `1.2` | `1.4` |

**技能列變化**：無 —— 純數值／模型換裝，六格技能不變。

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-n01g.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- 出貨名單收的是本體 `godie-n003`，正確。
- `#113` 誤判：是（此組在那 14 組裡）

### - [ ] 神奇寶貝兒 - 皮卡丘　英雄 58　`godie-ofar` → `godie-o02l`　**【出貨名單】**

**變身技能**　`A040` 58-04 瘋狂皮卡丘　（base `AEIl`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 6/12/18/24 秒 | 60 秒 | 90/180/270/360 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `Ofar` | `O02L` |
| content id | `godie-ofar` | `godie-o02l` |
| 作者編輯器標籤 `unsf` | `(58)` | `(58變身)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | ✅ | — |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 稱號 (uname) | `神奇寶貝兒` | `神騎寶貝` |
| 模型檔 (umdl) | `HeroPikachu.mdl` | `picacugy.mdl` |
| 模型縮放 (usca) | `0.9` | `1.8` |
| 碰撞半徑 (ucol) | `31` | `—` |
| 武器型態 (ua1w) | `—` | `normal` |
| 攻擊距離 (ua1r) | `450` | `120` |
| 攻擊間隔 (ua1c) | `2` | `1.5` |
| 飛彈模型 (ua1m) | `Abilities\Weapons\ChimaeraLightningMissile\ChimaeraLightningMissile.mdl` | `—` |
| 飛彈速度 (ua1z) | `2000` | `—` |
| 力量成長 (ustp) | `1.5` | `1.6` |
| 智力成長 (uinp) | `1.6` | `1.5` |
| 一般技能列 (uabi) | `AInv,A0R6,Alit,A0SL` | `AInv,A0R6,A0AG,A0FO,A0SL` |

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A0AG` | 58-04-x 傷害刺激 | `AItx` | — |
| ＋ 變身才有 | `A0FO` | 黑化攻擊 | `Alit` | `Abilities\Spells\Human\Thunderclap\ThunderClapCaster.mdl` |
| － 變身失去 | `Alit` | （無名） | `—` | — |

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-o02l.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- 出貨名單收的是本體 `godie-ofar`，正確。
- `#113` 誤判：否（此組不在 #113 的 14 組）

### - [ ] 草帽小子 - 魯夫　英雄 76　`godie-u00n` → `godie-u00o`　**【出貨名單】**

**變身技能**　`A0IR` 76-00 二檔　（base `AEme`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 20 秒 | 60 秒 | 0 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `U00N` | `U00O` |
| content id | `godie-u00n` | `godie-u00o` |
| 作者編輯器標籤 `unsf` | `(76)` | `(76 二檔)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | ✅ | — |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 移動速度 (umvs) | `315` | `415` |
| 一般技能列 (uabi) | `AInv,A0ZK,A0IR` | `AInv,A0ZK,A0IR,A0IW,A0IX` |

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A0IW` | 76-00-02 二檔增加攻速 | `AIsx` | `Environment\LargeBuildingFire\LargeBuildingFire1.mdl` |
| ＋ 變身才有 | `A0IX` | 76-00-03 二檔生命損失 | `Arll` | — |

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-u00o.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- 出貨名單收的是本體 `godie-u00n`，正確。
- `#113` 誤判：是（此組在那 14 組裡）

### - [ ] 神鳴流劍士 - 櫻綻剎那　英雄 77　`godie-e00w` → `godie-e00x`　**【出貨名單】**

**變身技能**　`A0JG` 77-03 GLADIARIA ALAT　（base `AEIl`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 6/12/18/24 秒 | 60 秒 | 90/180/270/360 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `E00W` | `E00X` |
| content id | `godie-e00w` | `godie-e00x` |
| 作者編輯器標籤 `unsf` | `(77)` | `(77 變身)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | ✅ | — |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 移動速度 (umvs) | `300` | `522` |
| 攻擊間隔 (ua1c) | `2` | `1.7` |
| 一般技能列 (uabi) | `A10G,AInv,A0JD` | `A10G,AInv,A0JD,A0FI,A0HP,A0JI,A0I0` |

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A0FI` | 球體(翅膀) | `Asph` | `AWING.MDX` |
| ＋ 變身才有 | `A0HP` | （無名） | `Asph` | `Abilities\Weapons\FaerieDragonMissile\FaerieDragonMissile.mdl` |
| ＋ 變身才有 | `A0I0` | （無名） | `AId0` | — |
| ＋ 變身才有 | `A0JI` | （無名） | `AIms` | — |

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-e00x.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- 出貨名單收的是本體 `godie-e00w`，正確。
- `#113` 誤判：是（此組在那 14 組裡）

### - [ ] 開外掛的死神 - 黑崎一護　英雄 79　`godie-h01n` → `godie-h01o`　**【出貨名單】**

**變身技能**　`A0LN` 79-04 卍解　（base `AEme`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 8/16/24/25 秒 | 60/60/60/30 秒 | 100/200/300/10 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `H01N` | `H01O` |
| content id | `godie-h01n` | `godie-h01o` |
| 作者編輯器標籤 `unsf` | `(79)` | `(79卍解)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | ✅ | — |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 稱號 (uname) | `開外掛的死神` | `外掛開很大的死神` |
| 移動速度 (umvs) | `295` | `400` |
| 攻擊間隔 (ua1c) | `1.9` | `1.2` |
| 護甲型態 (uarm) | `Flesh` | `Stone` |
| 音效組 (usnd) | `HeroLich` | `NagaRoyalGuard` |
| 一般技能列 (uabi) | `AInv,A0LH,A0W5,A0LS` | `AInv,A0UV,A0W5,A0LS` |

<sub>其他有差異、但未在本表解讀的原始欄位碼：`urun` `uwal`</sub>

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A0UV` | 79-00 靈壓 | `AOae` | `Abilities\Spells\Human\slow\slowtarget.mdl` |
| － 變身失去 | `A0LH` | 79-00 靈壓 | `AOae` | `Abilities\Spells\Human\slow\slowtarget.mdl` |

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-h01o.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- 出貨名單收的是本體 `godie-h01n`，正確。
- `#113` 誤判：否（此組不在 #113 的 14 組）

---

### E2. 兩個形態都不在出貨名單（7 位）

> 其中 **3 位**（26 鄭先生、40 胖虎、70 白木卡迪那）的第二形態尚未匯入。
> 這 3 位（加上 E1 的 30 臭作，以及 87 曹操缺的**本體**）的**完整 w3u 欄位傾印在 M 節**，
> 不需要再回去翻 .w3x。

### - [ ] 職業獵人 - 傑 富力士　英雄 06　`godie-ucrl` → `godie-u034`

**變身技能**　`A0Y1` 06-04 傑桑變化　（base `AEme`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 7/14/21 秒 | 60 秒 | 200/300/400 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `Ucrl` | `U034` |
| content id | `godie-ucrl` | `godie-u034` |
| 作者編輯器標籤 `unsf` | `(06)` | `(06 傑桑)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | — | — |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 模型檔 (umdl) | `units\critters\HighElfPeasant\HighElfPeasant.mdl` | `HeroBigGon.mdl` |
| 模型縮放 (usca) | `1.1` | `1.3` |
| 選取圈 (ussc) | `1.25` | `—` |
| 圖示 (uico) | `ReplaceableTextures\CommandButtons\BTNJay.BLP` | `ReplaceableTextures\CommandButtons\BTNGon.blp` |
| 移動速度 (umvs) | `315` | `360` |
| 攻擊間隔 (ua1c) | `—` | `1.5` |
| 音效組 (usnd) | `VillagerKid` | `Grunt` |
| 一般技能列 (uabi) | `AInv,A08Y,A025` | `AInv,A08Y,A025,A017` |

<sub>其他有差異、但未在本表解讀的原始欄位碼：`uclg` `umvr` `ushh` `ushw` `ushx` `ushy` `utco`</sub>

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A017` | 超賽攻擊 | `Alit` | `Abilities\Spells\Orc\WarStomp\WarStompCaster.mdl` |

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-u034.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- 兩個形態都不在出貨 50 名單。
- `#113` 誤判：是（此組在那 14 組裡）

### - [ ] 豪洨天王 - 鄭先生　英雄 26　`godie-harf` → `godie-h00w`

**變身技能**　`A0EW` 26-04 開天闢地‧洨者聖臨　（base `AEIl`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 7/10.5/14 秒 | 75 秒 | 140/210/280 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `Harf` | `H00W` |
| content id | `godie-harf` | `godie-h00w` |
| 作者編輯器標籤 `unsf` | `(26)` | `(26洨者狀態)` |
| 在 `content/champions/` | ✅ | ❌ **未匯入** |
| 在出貨 50 名單 | — | — |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 攻擊間隔 (ua1c) | `2` | `1.6` |
| 攻擊目標型 (ua1t) | `hero` | `siege` |
| 護甲 (udef) | `—` | `5` |
| 音效組 (usnd) | `HeroBladeMaster` | `PandarenBrewmaster` |
| 英雄技能列 (uhab) | `A00L,A0BS,A0F9,A0EW,Aamk` | `A00L,A0ER,A0F9,A0EW,Aamk` |

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A0ER` | 26-02 亂入 | `AHbh` | — |
| － 變身失去 | `A0BS` | 26-02 亂入 | `Awar` | — |

**資料狀態與待辦**

- 資料：**未匯入** —— 定義在 `raw/war3map.w3u` / `OBJECTS.json` 的 `H00W`，`content/champions/godie-h00w.json` 不存在，需要走一次匯入。
- 兩個形態都不在出貨 50 名單。
- `#113` 誤判：否（此組不在 #113 的 14 組）

### - [ ] 地獄歌神 - 憤怒的胖虎　英雄 40　`godie-nman` → `godie-n01b`

**變身技能**　`A0ND` 40-03 萬解-貓王胖虎　（base `AEIl`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 12/18/24/30 秒 | 75 秒 | 90/180/270/360 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `Nman` | `N01B` |
| content id | `godie-nman` | `godie-n01b` |
| 作者編輯器標籤 `unsf` | `(40)` | `(40萬解)` |
| 在 `content/champions/` | ✅ | ❌ **未匯入** |
| 在出貨 50 名單 | — | — |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 武器型態 (ua1w) | `—` | `mbounce` |
| 攻擊距離 (ua1r) | `100` | `450` |
| 飛彈模型 (ua1m) | `Abilities\Spells\Orc\WarStomp\WarStompCaster.mdl` | `Abilities\Spells\NightElf\BattleRoar\RoarCaster.mdl` |
| 飛彈速度 (ua1z) | `—` | `2000` |
| 範圍半徑 (ua1f) | `—` | `400` |
| 可攻擊目標 (ua1p) | `—` | `air,debris,enemies,ground` |
| 索敵距離 (uacq) | `—` | `600` |
| 護甲型態 (uarm) | `Flesh` | `—` |
| 一般技能列 (uabi) | `A10C,AInv,A07G` | `A10C,AInv,A07G,A0NR,A0NT` |

<sub>其他有差異、但未在本表解讀的原始欄位碼：`urb1` `utc1`</sub>

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A0NR` | （無名） | `Asph` | `Abilities\Spells\Orc\LiquidFire\Liquidfire.mdl` |
| ＋ 變身才有 | `A0NT` | （無名） | `Asph` | `Doodads\Outland\Plants\Outland_Plant\Outland_Plant4.mdl` |

**資料狀態與待辦**

- 資料：**未匯入** —— 定義在 `raw/war3map.w3u` / `OBJECTS.json` 的 `N01B`，`content/champions/godie-n01b.json` 不存在，需要走一次匯入。
- 兩個形態都不在出貨 50 名單。
- `#113` 誤判：否（此組不在 #113 的 14 組）

### - [ ] 重金屬樂團的怪物 - 克勞薩　英雄 61　`godie-u012` → `godie-u011`

**變身技能**　`Aphx` 61-00百連我殺 效果　（base `Aphx`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| — | — | 500 |

> ⚠ 無 `ahdu` 持續時間 —— 這是**切換式**變身，再施放一次才變回，不是計時自動復原。

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `U012` | `U011` |
| content id | `godie-u012` | `godie-u011` |
| 作者編輯器標籤 `unsf` | `(61)` | `(61 鳳凰蛋)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | — | — |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 稱號 (uname) | `重金屬樂團的怪物` | `死亡老二` |
| 本名 (upro) | `克勞薩II世` | `克勞薩先生` |
| 模型檔 (umdl) | `—` | `collision.mdl` |
| 模型縮放 (usca) | `1.2` | `1.5` |
| 移動速度 (umvs) | `300` | `0` |
| 攻擊間隔 (ua1c) | `2` | `—` |
| 傷害骰數 (ua1d) | `5` | `—` |
| 傷害骰面 (ua1s) | `3` | `—` |
| 基礎 HP (uhpm) | `150` | `-450` |
| HP 回復 (uhpr) | `0.25` | `0` |
| 護甲 (udef) | `—` | `-10` |

<sub>其他有差異、但未在本表解讀的原始欄位碼：`ua1g` `uaen` `udtm` `ugol` `usma` `uwal`</sub>

**技能列變化**：無 —— 純數值／模型換裝，六格技能不變。

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-u011.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- 兩個形態都不在出貨 50 名單。
- `#113` 誤判：否（此組不在 #113 的 14 組）

### - [ ] 白木老樹精 - 白木卡迪那　英雄 70　`godie-e00s` → `godie-e010`

**變身技能**　`A0O6` 70-00 紮根　（base `ANrg`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| — | 15 秒 | 0 |

> ⚠ 無 `ahdu` 持續時間 —— 這是**切換式**變身，再施放一次才變回，不是計時自動復原。

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `E00S` | `E010` |
| content id | `godie-e00s` | `godie-e010` |
| 作者編輯器標籤 `unsf` | `(70)` | `(70紮根)` |
| 在 `content/champions/` | ✅ | ❌ **未匯入** |
| 在出貨 50 名單 | — | — |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 模型縮放 (usca) | `1.1` | `1` |
| 移動速度 (umvs) | `275` | `0` |
| 武器型態 (ua1w) | `—` | `msplash` |
| 攻擊距離 (ua1r) | `600` | `650` |
| 攻擊目標型 (ua1t) | `hero` | `pierce` |
| 範圍半徑 (ua1f) | `—` | `80` |
| 可攻擊目標 (ua1p) | `—` | `ground,structure,debris,air,enemy` |
| 護甲 (udef) | `2` | `10` |
| 音效組 (usnd) | `MountainGiant` | `—` |
| 一般技能列 (uabi) | `A0ZQ,A0ZM,A0G1,AInv,A0GM` | `AInv,A0GM,A0O6` |
| 英雄技能列 (uhab) | `A0UJ,A0GQ,A0GR,A0GN,Aamk` | `A0GP,A0GQ,A0GR,A0GN,Aamk` |

<sub>其他有差異、但未在本表解讀的原始欄位碼：`ua1h` `ua1q` `ua2c` `ua2f` `ua2h` `ua2q` `ua2t` `uaen` `uhom` `upra`</sub>

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A0O6` | 70-00 紮根 | `ANrg` | — |
| ＋ 變身才有 | `A0GP` | 70-01 伸卡球 | `Arsp` | — |
| － 變身失去 | `A0G1` | 70-00 芬多精 | `Asal` | — |
| － 變身失去 | `A0ZM` | 70-002-00 樹海降臨法術書 | `Aspb` | — |
| － 變身失去 | `A0ZQ` | 70-002 樹海降臨 | `AEev` | — |
| － 變身失去 | `A0UJ` | 70-01 伸卡球 | `ANcs` | — |

**資料狀態與待辦**

- 資料：**未匯入** —— 定義在 `raw/war3map.w3u` / `OBJECTS.json` 的 `E010`，`content/champions/godie-e010.json` 不存在，需要走一次匯入。
- 兩個形態都不在出貨 50 名單。
- `#113` 誤判：否（此組不在 #113 的 14 組）

### - [ ] 魔砲少女 - 高町奈葉　英雄 81　`godie-o01z` → `godie-o02v`

**變身技能**　`A0XP` 81-002 Exellion Mode　（base `AEIl`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 15/12/18/24 秒 | 60 秒 | 350/240/360/480 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `O01Z` | `O02V` |
| content id | `godie-o01z` | `godie-o02v` |
| 作者編輯器標籤 `unsf` | `(81)` | `(81EX mode)` |
| 在 `content/champions/` | ✅ | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | — | — |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 稱號 (uname) | `魔砲少女` | `白色惡魔` |
| 移動速度 (umvs) | `295` | `305` |
| 基礎 MP (umpm) | `100` | `1000` |
| 力量成長 (ustp) | `1.7` | `1.8` |
| 敏捷成長 (uagp) | `1.45` | `—` |
| 智力成長 (uinp) | `2.85` | `2.7` |

**技能列變化**：無 —— 純數值／模型換裝，六格技能不變。

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-o02v.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- 兩個形態都不在出貨 50 名單。
- `#113` 誤判：否（此組不在 #113 的 14 組）

### - [ ] 曹操孟德 - 阿瞞大人　英雄 87　`godie-o02n` → `godie-o02o`

**變身技能**　`A0DB` 87-03 天下號令　（base `AEIl`）

| 持續 (L1..) | 冷卻 | 魔力 |
|---|---|---|
| 6/12/18/24 秒 | 60 秒 | 90/180/270/360 |

| | 本體 | 第二形態 |
|---|---|---|
| rawcode | `O02N` | `O02O` |
| content id | `godie-o02n` | `godie-o02o` |
| 作者編輯器標籤 `unsf` | `(87)` | `(87變身)` |
| 在 `content/champions/` | ❌ **未匯入** | ✅（掛成獨立英雄） |
| 在出貨 50 名單 | — | — |

**第二形態的數值差異**（直接讀 `raw/war3map.w3u`，非匯入後的值）

| 欄位 | 本體 | 第二形態 |
|---|---|---|
| 一般技能列 (uabi) | `AInv,ANht` | `AInv,A05P,A0DI,A0DC,ANht,A0DR` |

**技能列變化**

| 方向 | rawcode | 名稱 | base | 附掛美術 `atat` |
|---|---|---|---|---|
| ＋ 變身才有 | `A05P` | （無名） | `AIcl` | — |
| ＋ 變身才有 | `A0DC` | 87-03 天下號令 | `ACac` | — |
| ＋ 變身才有 | `A0DI` | 87-001 殺人魔王 | `ANde` | — |
| ＋ 變身才有 | `A0DR` | 球體(曹操) | `Asph` | `Abilities\Spells\NightElf\Immolation\ImmolationTarget.mdl` |

**資料狀態與待辦**

- 資料：**已在 `content/`，掛錯位置** —— `content/champions/godie-o02o.json` 就是這個第二形態，目前被當成一位獨立英雄。不要刪，要建立關聯。
- 兩個形態都不在出貨 50 名單。
- `#113` 誤判：否（此組不在 #113 的 14 組）

---

## F. 附錄：球體 / 蝗蟲群 —— 第二形態的視覺簽名，而且完全沒接線

`球體` 就是 WC3 的 `Asph`（Sphere）：一個永久性的附掛，把一個模型掛在骨骼上。
全圖有 **76 個 `Asph` 物件**。與變身有關的那些，**專門掛在「變身後」的單位上**——
這正是擁有者說的那件事，也是變身在畫面上被看見的方式。

### F1. 掛在第二形態上的附掛（14 筆，橫跨 10 位英雄）

| 英雄 | 第二形態 | rawcode | 名稱 | 附掛模型 `atat` | 掛點 `ata1` |
|---|---|---|---|---|---|
| 08 勇者小呆 | `N01C` | `A0T0` | 球體(龍魔人) | `Abilities\Spells\Undead\Unsummon\UnsummonTarget.mdl` | `origin`（未指定） |
| 09 悟空 | `O00X` | `A0MJ` | 球體(悟空超3) | `Goku3head.mdx` | `origin`（未指定） |
| 11 索隆 | `U01U` | `A10O` | 球體(武裝霸王) | `war3mapImported\poweraura.MDX` | `origin`（未指定） |
| 18 南野秀一 | `N00P` | `A0II` | （無名） | `Abilities\Weapons\IllidanMissile\IllidanMissile.mdl` | `right,hand` |
| 22 龍宮禮奈 | `E00N` | `A0FR` | （無名） | `Environment\LargeBuildingFire\LargeBuildingFire1.mdl` | `origin`（未指定） |
| 25 拳四郎 | `U00L` | `A0HX` | （無名） | `Abilities\Spells\Orc\LightningShield\LightningShieldTarget.mdl` | `origin`（未指定） |
| 38 飛影 | `U010` | `A0FR` | （無名） | `Environment\LargeBuildingFire\LargeBuildingFire1.mdl` | `origin`（未指定） |
| 38 飛影 | `U010` | `A0OI` | 球體(飛影BODY) | `units\orc\SentryWard\SentryWard.mdl` | `origin` |
| 40 憤怒的胖虎 | `N01B` | `A0NR` | （無名） | `Abilities\Spells\Orc\LiquidFire\Liquidfire.mdl` | `origin`（未指定） |
| 40 憤怒的胖虎 | `N01B` | `A0NT` | （無名） | `Doodads\Outland\Plants\Outland_Plant\Outland_Plant4.mdl` | `origin`（未指定） |
| 77 櫻綻剎那 | `E00X` | `A0FI` | 球體(翅膀) | `AWING.MDX` | `origin`（未指定） |
| 77 櫻綻剎那 | `E00X` | `A0HP` | （無名） | `Abilities\Weapons\FaerieDragonMissile\FaerieDragonMissile.mdl` | `origin`（未指定） |
| 87 阿瞞大人 | `O02O` | `A0DR` | 球體(曹操) | `Abilities\Spells\NightElf\Immolation\ImmolationTarget.mdl` | `origin`（未指定） |
| 90 妙蛙種子 | `H02R` | `A0VH` | （無名） | `Doodads\Outland\Plants\Outland_Plant\Outland_Plant4.mdl` | `origin`（未指定） |

**外加一筆「變身時脫掉」的附掛**：`A0MI 球體(悟空正常)` = `Gokuhead.mdx`，掛在本體 `Ogrh` 上；
變身成超三時換成 `A0MJ 球體(悟空超3)` = `Goku3head.mdx`。
**悟空的變身在視覺上「就是」換頭。**

> 這直接解釋了 #73 記錄的「孫悟空沒有頭」：頭本來就不在 `Goku.mdx` 裡，它是 `Gokuhead.mdx`，
> 由 `A0MI` 在執行期掛上去的。**任何把頭 merge 進 mesh 的修法，都會讓超三變身變成看不見。**

### F2. 這條線目前斷在哪裡（三段都存在，三段從沒接起來）

| 環節 | 狀態 |
|---|---|
| 幾何 / 粒子已抽出 | ✅ `tools/w3x-import/out/emitters/EMITTERS.json` 裡有 `poweraura`(6)、`Goku3head`(3)、`Gokuhead`(3)、`AWING`(19)、`BWING`(5) 的 emitter 紀錄 |
| #183 產出的 vfx 文件 | ❌ `content/vfx/fx.w3x.orb.*` 共 10 個 stem，**上面那 5 個自訂 .mdx 一個都沒有**。唯一有文件的 `divinering`（`球體(趙雲)`）不是變身用的 |
| #9 的 `DUMMY_ORB_MAP.json` | ❌ 316 筆 `orb_attachment` 全部是從 `war3map.j` 的 `AddSpecialEffectTarget` 解出來的；`A0T0/A10O/A0OI/A0MJ/A0MI/A0DR/A0FI` 逐一 grep 都是 **0 命中**。物件表 `Asph` 這條軸從來沒被掃過 |
| 內容 schema 能不能表達 | ❌ `packages/shared/src/content/schema/champion.ts` 的 `zChampionDoc` 是 `.strict()`，**沒有任何欄位放得下「這個形態永久佩戴這個附掛」**，也沒有欄位指得到第二形態 |

**美術在、意圖可精確還原（w3a 的 `atat`/`ata1`）、目標形態已知（w3u）——三者從沒 join 過。
這個 join 很便宜，而且是本任務裡投報率最高的單一交付物。**

### F3. 蝗蟲群（`AUls`/`AOls`）——相鄰，但不是變身的一部分

全圖 6 支（不是 5 支；`A0Z6` 沒有覆寫 `Ulsu` 所以用 base 預設值，容易被漏掉）：

| rawcode | base | 名稱 | 召喚單位 `Ulsu` | 持有者 |
|---|---|---|---|---|
| `A0IB` | `AUls` | 66-03 七夜怪談 | `u00I` | `E00T` |
| `A0QT` | `AUls` | CP-00 蝗蟲群 | `u015` | （w3u 裡沒有單位持有，由 trigger 授予） |
| `A00C` | `AOls` | 03-001 龍騎兵 | `u01S` | `Hlgr` |
| `A07Y` | `AOls` | 75-04 無限Saber製 | `u00C` | `U00B` |
| `A0IO` | `AOls` | 18-01 風華圓舞陣 | `u00M` | `Nsjs`（本體）**與** `N00P`（妖狐形態）**都有** |
| `A0Z6` | `AOls` | 02-04 百鬼夜行 | （未覆寫） | `Hvwd` |

**沒有任何一支蝗蟲群是「第二形態專屬」。** 唯一與變身沾邊的 `A0IO` 是藏馬的 Q，
兩個形態都帶著它——所以變身不會讓它出現或消失。
擁有者把 球體/蝗蟲群 並列是對的（兩者都是 #183 抽出來、目前閒置的 VFX 家族），
但就「變身」這件事而言，**視覺重點在球體，蝗蟲群是相鄰工項**。

---

## G. 附錄：**不是**變身的東西（查過並排除，免得有人再獵一次）

### G1. 兩處 `ReplaceUnitBJ` 是作弊彩蛋，不是英雄技能

`raw/war3map.j` 全檔只有 3 次 `ReplaceUnitBJ`，`SetUnitModel` **0 次**：

- `war3map.j:42500` —— 玩家名稱等於 `"ericer"` 時，把他的英雄換成 `O02P 夢幻之星-初音`
- `war3map.j:52459` / `:52537` —— `udg_PlayerTruthName == "Saber_in_panda"` 時換成
  `H02K 國寶級的畜生-熊貓` 並授予 `A0UR`

永久、不可逆、以玩家名稱為條件。**不要移植。**

### G2. `Chaos` / `ANcr` 永久換型：0 位英雄使用

全圖唯一的 `Cha1`（`Srtt 混沌`）指向 `h02Q 麒麟特效目標`——一個 0.1 縮放的碰撞假單位，
是特效目標，不是英雄形態。

### G3. 「只加 buff、不換單位」的偽變身（另立工項，成本低很多）

這些技能的 tooltip 讀起來像變身，但物件資料與 JASS 都只是疊 buff，**沒有換單位**。
它們**不在**本文件的 26 位裡，但擁有者說的「幾乎大部分英雄都有變身技能」有一部分是指這些：

| rawcode | base | 名稱 |
|---|---|---|
| `A0AN` | `ACro` | 24-04 內褲變身 |
| `A0UD` | `Absk` | 23-02 超音型態 |
| `A0A6` | `Afzy` | 23-02 超音型態（同名第二物件） |
| `A0U9` | `Aegr` | 23-002 雙刀模式 |
| `A0BV` | `AEar` | 49-03 蛻變 |
| `A0GD` | `Asal` | 59-00 暴走 |
| `A0Z5` | `AIev` | 59-001 完全暴走 |
| `A0GL` | `AIxk` | 新人類模式 鋼彈 |
| `A0ZK` | `AOws` | 76-002 霸王色 |
| `A0IQ` | `AHav` | 76-04 三檔（＋法術書 `A0J0 76-04-01 三檔法術書`、球體 `A0S1 76-04-x 三檔殘影`） |
| `A0SO` | `Aegr` | 38-002 究極暴走黑龍波 |
| `A0SP` | `Aegr` | 20-002 解放.約束勝利劍MAX |
| `A104` | `Aply` | 43-002-01 化身術 |

**注意 76 魯夫同時有兩種**：`A0IR 76-00 二檔` 是真的換單位（在 26 位裡），
`A0IQ 76-04 三檔` 只是 buff＋法術書＋球體殘影。同一位英雄，兩種不同的實作層級。

---

## H. 實作前必須先解掉的三個前置（都不在 content/ 裡）

1. **`champion@1` schema 放不下這個關聯。** `zChampionDoc` 是 `.strict()`，
   沒有 `altForm` / `baseForm` / `attachedVfx` 之類的欄位。在加欄位之前，
   「第二形態是誰的」這件事**無處可寫**。這是所有後續工作的硬前置。
2. **`championIdentity.ts::isSameCharacter` 現在把 14 組本體↔變身折成一個角色。**
   要改成「同一角色的不同形態」而不是「同一個 entry」——但 `distinctCharacters()`、
   `SHARED_PORTRAIT_GROUPS`、Go 那邊的 `heroidentity_test.go` 都吃這個規則，
   是跨 `apps/**` + `packages/**` 的改動。
3. **模擬器裡沒有任何變身機制。** 沒有「換整份 runtime 定義」的原語。
   需要的是一套：施放 → 換定義（模型/縮放/六格技能/攻速/移速/附掛）→ `ahdu` 計時 → 換回，
   HP/MP 以相對比例帶過（WC3 的 `bj_UNIT_STATE_METHOD_RELATIVE` 語意），等級與道具不變。

---

## I. 誠實標註：這份文件哪裡還不確定

這份文件會驅動好幾週的工作，所以下面每一條都是**明說的不確定**，不要當成已解決：

1. **等級 2–4 的 `Eme1`/`Emeu` 我一律忽略。** 它們大量是複製貼上的殘留
   （指向別的英雄、甚至指向 `h01L/h01M 集氣用單位` 這種施法假單位）。
   我採信等級 1，並要求等級 1 的配對與技能擁有者同一位英雄。
   **但我沒有驗證「原圖執行時等級 2–4 到底變成什麼」**——如果 WC3 真的會照等級去讀，
   那原圖本身就有 bug，而玩家看到的行為可能與本表不同。**這需要實機或 JASS 側再確認一次。**
2. **`content/` 那 22 份第二形態文件，我只抽查了數值是否真的帶著 w3u 的差異**
   （`godie-h020` maxMana 6524 vs `godie-hjai` 424、`godie-h02r` ad 84 vs `godie-hgam` 35 等）。
   **我沒有逐一比對全部 22 份**的每個欄位。本文件的數值一律取自 `raw/war3map.w3u`，
   所以若 `content/` 的值與本表不符，是匯入時的落差，要一併修。
3. **未解讀的原始欄位碼。** 每個英雄區塊末尾的 `<sub>其他有差異…</sub>` 是我**沒有**解讀的
   w3u 欄位碼（例如 `usst` 在 20 組裡都是 `16 → 31`，我不確定它是什麼）。
   它們有差異、但我不敢猜語意——**不要當成「沒差」**。這與 #56（匯入器丟掉 ~150 個欄位碼）是同一個坑。
4. **`godie-o02n`（87 曹操本體）不在 `content/`。** 我確認了 `OBJECTS.json` 裡有 `O02N`，
   但**沒有查明匯入器為什麼跳過它**。在查明之前，不能假設「補跑一次匯入就會有」。
5. **`Aphx`（61 克勞薩）我歸在 Pattern A，但它是 Phoenix egg morph**，
   WC3 的語意與 Metamorphosis 不同（鳳凰死亡→孵蛋）。它帶 `Eme1/Emeu`，
   但 `U011 死亡老二` 是 hp `-450`、ms `0`、無攻擊的**死亡態**，不是強化態。
   **這一位很可能不該用同一套變身系統實作**，需要單獨判斷。
6. **持續時間/冷卻是 `ahdu`/`acdn` 的原始值**，沒有套 `combat-env` 倍率。
   照 #125，顯示給玩家的數字必須是套完倍率的最終值。
7. **有 4 支技能的等級 1 數值本身就不合理**，我原樣照抄，沒有「修正」它：
   `A0OE`（04）持續 `20/12/18/24` 秒、魔力 `360/240/360/480`；
   `A0T1`（08）持續 `20/15/21/27` 秒；`A0XP`（81）持續 `15/12/18/24` 秒、魔力 `350/240/360/480`；
   `A06K`（42）魔力 `999/210/300/390`；`A0VG`（90）魔力 `350/10`。
   等級 1 比等級 2 還大，形狀與 `Eme1/Emeu` 的複製貼上殘留一致。
   **「等級 1 是真值、2–4 是殘留」這個假設在這幾支上可能反過來**——移植前要逐支確認。
8. **09 悟空的 `umdl` 差異只是大小寫**（`goku.mdl` → `Goku.mdl`），不是換模型。
   表裡照實列出，但**不要當成美術差異**去實作。悟空真正的模型變化在球體換頭（見 F1）。
9. **我沒有測任何東西。** 本文件全部是靜態資料比對（`war3map.w3a` / `war3map.w3u` /
   `war3map.j` / `content/` / `starter.go`），沒有跑過遊戲。

---

## J. 建議的執行順序

1. **先解 H 的三個前置**（schema 欄位 → identity 規則 → 模擬器原語），否則後面每一步都無處落地
2. **建立 26 組關聯**（22 組是接線，4 組要先匯入）
3. **修出貨名單**：10 個裝錯形態的格子，交給擁有者決定換本體還是兩個都開
4. **接 F2 的 join**：`Asph.atat` → EMITTERS.json → `fx.w3x.orb.*` → 第二形態文件
5. **實作 Pattern A 一套機制**，26 位共用；3 個切換式（`A0DZ`/`A0O6`/`Aphx`）走例外分支
6. **逐一勾掉 E 節的核取方塊**
7. G3 的 13 支 buff-only 偽變身另立工項，成本低很多，不要混進來

---

## K. 交叉引用

| 任務 | 關係 |
|---|---|
| **#119** | 被本文件取代。它的未定問題「每回合重置 or 自動變回」已有答案：照 `ahdu` 自動變回 |
| **#113** | **結論被推翻**：14 組全部是本體↔第二形態，不是重複匯入。但它「不要刪」的建議必須維持 |
| **#56** | 匯入器丟掉 `Eme1`/`Emeu`，這就是為什麼本文件必須直接解 `raw/war3map.w3a` |
| **#183** | 球體/粒子已抽出，但 5 個變身用自訂 .mdx 一個 vfx 文件都沒有 |
| **#230** | 「93% 技能用通用替身、106 支閒置」——F2 的斷線是同一個病灶的一個切面 |
| **#73** | 孫悟空無頭的根因在此：頭是 `A0MI/A0MJ` 掛上去的球體。**修法不能用 merge** |
| **#9** | `DUMMY_ORB_MAP.json` 只掃 JASS，物件表 `Asph` 這條軸沒掃過 |
| **#32 / #150** | 妙蛙種子尺寸反覆調整，很可能根因是名單裡裝的是 `usca 3.0` 的妙蛙花 |
| **#248** | 三圍重抓：第二形態的 str/agi/int 與成長值也要一起重算 |
| **#77** | 06 傑 富力士本體用 `champ.thorne` 替身，變身形態才有 `HeroBigGon.mdl` |

---

## L. 資料來源

| 檔案 | 用途 |
|---|---|
| `tools/w3x-import/out/GoDieEX22s-src/raw/war3map.w3a` | 技能物件表；`Eme1`/`Emeu`/`ahdu`/`acdn`/`atat`/`ata1` 的唯一來源 |
| `tools/w3x-import/out/GoDieEX22s-src/raw/war3map.w3u` | 單位物件表；本文件所有數值 |
| `tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j` | 56,765 行；確認 trigger 側沒有變身 |
| `tools/w3x-import/out/GoDieEX22s-src/STRINGS.json` | TRIGSTR 解析（`raw/war3map.wts` 只有 170 筆，不夠用） |
| `tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json` | 127 個英雄單位定義；**注意它已經丟掉 `Eme1`/`Emeu`** |
| `tools/w3x-import/out/emitters/EMITTERS.json` | 自訂 .mdx 的 emitter 紀錄 |
| `content/champions/` | 115 份文件（含 `_index.json`），本文件比對的目標 |
| `apps/platform/internal/curation/starter.go` | 出貨 50 名單 |
| `packages/shared/src/content/schema/champion.ts` | `champion@1`，`.strict()` |
| `packages/shared/src/content/championIdentity.ts` | `isSameCharacter` |
| `apps/client/src/ui/platform/marqueeRoster.ts` | `SHARED_PORTRAIT_GROUPS` |
| `docs/_champion-dedup-113.md` | 被推翻的那份 |

---

## M. 附錄：5 個**未匯入**單位的完整 w3u 定義

這 5 筆在 `content/` 裡沒有文件，所以下面是 `raw/war3map.w3u` 的**完整欄位傾印**（不是差異，是全部），
讓匯入工作不需要再回頭翻 .w3x。長字串（`utip` 提示、`utub` 說明）已省略，因為它們是敘述文字不是數值。

### `H00W` — 26 豪洨天王 - 鄭先生（第二形態）

目標 content id：`godie-h00w`　作者標籤 `unsf`：`(26洨者狀態)`

| 欄位 | 值 |
|---|---|
| `abilities` | `AInv,A106,A0F8` |
| `agi` | `17` |
| `agiGrowth` | `1.55` |
| `armor` | `5` |
| `attackCooldown` | `1.6` |
| `dmgBase` | `0` |
| `dmgDice` | `6` |
| `dmgSides` | `3` |
| `heroAbilities` | `A00L,A0ER,A0F9,A0EW,Aamk` |
| `hp` | `150` |
| `icon` | `ReplaceableTextures\CommandButtons\BTNMrChin.BLP` |
| `int` | `12` |
| `model` | `units\human\HeroPaladin\HeroPaladin.mdl` |
| `mpRegen` | `0.1` |
| `name` | `豪洨天王` |
| `properName` | `鄭先生` |
| `str` | `25` |
| `strGrowth` | `2.75` |
| `ua1g` | `ground,structure,air,ward,item,debris` |
| `ua1t` | `siege` |
| `ubba` | `250` |
| `ubdi` | `0` |
| `ubpx` | `1` |
| `ubsi` | `0` |
| `ucam` | `0` |
| `ucbs` | `0.5` |
| `ufoo` | `5` |
| `ugol` | `250` |
| `ulum` | `0` |
| `umpi` | `100` |
| `umvs` | `305` |
| `unsf` | `(26洨者狀態)` |
| `upgr` | `R00I` |
| `upoi` | `26` |
| `urac` | `undead` |
| `ureq` | `TALT` |
| `urq1` | `TWN2,TALT` |
| `urq2` | `TWN3,TALT` |
| `usma` | `1` |
| `usnd` | `PandarenBrewmaster` |
| `usrg` | `0` |
| `ussi` | `ReplaceableTextures\CommandButtons\BTNMrChin.BLP` |
| `usst` | `31` |

### `O030` — 30 電車癡漢 - 臭作（第二形態）

目標 content id：`godie-o030`　作者標籤 `unsf`：`(30變態紳士)`

| 欄位 | 值 |
|---|---|
| `abilities` | `AInv,A029,A0YT,A02I,A08K,A0HN` |
| `acquisitionRange` | `1600` |
| `agi` | `22` |
| `agiGrowth` | `2.75` |
| `attackCooldown` | `1.7` |
| `attackRange` | `1600` |
| `dmgDice` | `5` |
| `dmgSides` | `3` |
| `flyHeight` | `300` |
| `heroAbilities` | `A09L,ANdh,ANso,A01P,Aamk` |
| `hp` | `150` |
| `icon` | `ReplaceableTextures\CommandButtons\BTNHentai.BLP` |
| `intGrowth` | `1.75` |
| `mp` | `100` |
| `mpRegen` | `0.1` |
| `name` | `電車癡漢` |
| `properName` | `臭作` |
| `scale` | `3` |
| `strGrowth` | `1.7` |
| `ua1m` | `Abilities\Weapons\KeeperGroveMissile\KeeperGroveMissile.mdl` |
| `ua1z` | `1600` |
| `ubba` | `250` |
| `ubdi` | `0` |
| `ubpx` | `1` |
| `ubsi` | `0` |
| `ucam` | `0` |
| `ucbs` | `0.5` |
| `ucpt` | `0.8` |
| `ufoo` | `5` |
| `ugol` | `250` |
| `ulum` | `0` |
| `umvs` | `295` |
| `umvt` | `fly` |
| `unsf` | `(30變態紳士)` |
| `upgr` | `R00I` |
| `upoi` | `30` |
| `urac` | `undead` |
| `ureq` | `TALT` |
| `urq1` | `TWN2,TALT` |
| `urq2` | `TWN3,TALT` |
| `usma` | `1` |
| `usrg` | `0` |
| `ussi` | `ReplaceableTextures\CommandButtons\BTNHentai.BLP` |
| `usst` | `16` |

### `N01B` — 40 地獄歌神 - 憤怒的胖虎（第二形態）

目標 content id：`godie-n01b`　作者標籤 `unsf`：`(40萬解)`

| 欄位 | 值 |
|---|---|
| `abilities` | `A10C,AInv,A07G,A0NR,A0NT` |
| `acquisitionRange` | `600` |
| `agi` | `15` |
| `agiGrowth` | `1.45` |
| `attackCooldown` | `1.9` |
| `attackRange` | `450` |
| `dmgBase` | `0` |
| `dmgDice` | `7` |
| `dmgSides` | `4` |
| `heroAbilities` | `A070,A07I,A0ND,A0LZ,Aamk` |
| `hp` | `30` |
| `icon` | `ReplaceableTextures\CommandButtons\BTNGrant.BLP` |
| `int` | `13` |
| `intGrowth` | `1.75` |
| `model` | `Units\Creeps\EarthPandarenBrewmaster\EarthPandarenBrewmaster.mdl` |
| `mp` | `100` |
| `mpRegen` | `0.1` |
| `name` | `地獄歌神` |
| `properName` | `憤怒的胖虎` |
| `scale` | `1` |
| `str` | `26` |
| `strGrowth` | `2.5` |
| `ua1f` | `400` |
| `ua1g` | `ground,structure,air,ward,item,debris` |
| `ua1m` | `Abilities\Spells\NightElf\BattleRoar\RoarCaster.mdl` |
| `ua1p` | `air,debris,enemies,ground` |
| `ua1t` | `hero` |
| `ua1w` | `mbounce` |
| `ua1z` | `2000` |
| `ubba` | `250` |
| `ubdi` | `0` |
| `ubpx` | `3` |
| `ubs1` | `0.3` |
| `ubsi` | `0` |
| `ucam` | `0` |
| `uclb` | `100` |
| `uclg` | `100` |
| `ucol` | `32` |
| `ucs1` | `WoodHeavyBash` |
| `udp1` | `0.3` |
| `ufoo` | `5` |
| `ugol` | `250` |
| `uhot` | `R` |
| `uhpr` | `0.25` |
| `ulum` | `0` |
| `umpi` | `100` |
| `umvs` | `310` |
| `unsf` | `(40萬解)` |
| `upgr` | `R00I` |
| `upoi` | `40` |
| `urb1` | `350` |
| `ureq` | `TALT` |
| `urq1` | `TWN2,TALT` |
| `urq2` | `TWN3,TALT` |
| `usma` | `1` |
| `usrg` | `0` |
| `ussi` | `ReplaceableTextures\CommandButtons\BTNGrant.BLP` |
| `usst` | `31` |
| `utc1` | `12` |

### `E010` — 70 白木老樹精 - 白木卡迪那（第二形態）

目標 content id：`godie-e010`　作者標籤 `unsf`：`(70紮根)`

| 欄位 | 值 |
|---|---|
| `abilities` | `AInv,A0GM,A0O6` |
| `agi` | `14` |
| `agiGrowth` | `1.1` |
| `armor` | `10` |
| `attackRange` | `650` |
| `dmgBase` | `0` |
| `dmgDice` | `6` |
| `dmgSides` | `4` |
| `heroAbilities` | `A0GP,A0GQ,A0GR,A0GN,Aamk` |
| `hp` | `150` |
| `icon` | `ReplaceableTextures\CommandButtons\BTNTreant.blp` |
| `int` | `25` |
| `intGrowth` | `2.8` |
| `model` | `buildings\nightelf\AncientProtector\AncientProtector.mdl` |
| `mp` | `100` |
| `mpRegen` | `0.1` |
| `name` | `白木老樹精` |
| `properName` | `白木卡迪那` |
| `scale` | `1` |
| `strGrowth` | `1.85` |
| `ua1f` | `80` |
| `ua1h` | `150` |
| `ua1m` | `Abilities\Weapons\AncientProtectorMissile\AncientProtectorMissile.mdl` |
| `ua1p` | `ground,structure,debris,air,enemy` |
| `ua1q` | `220` |
| `ua1t` | `pierce` |
| `ua1w` | `msplash` |
| `ua2b` | `50` |
| `ua2c` | `2` |
| `ua2f` | `80` |
| `ua2h` | `150` |
| `ua2m` | `Abilities\Weapons\AncientProtectorMissile\AncientProtectorMissile.mdl` |
| `ua2p` | `ground,structure,debris,air,enemy` |
| `ua2q` | `220` |
| `ua2t` | `pierce` |
| `ua2w` | `msplash` |
| `uaen` | `3` |
| `uarm` | `Wood` |
| `ubba` | `250` |
| `ubdi` | `0` |
| `ubsi` | `0` |
| `ucam` | `0` |
| `ucol` | `32` |
| `ucs1` | `WoodHeavyBash` |
| `ucs2` | `RockHeavyBash` |
| `udty` | `hero` |
| `ufoo` | `5` |
| `ugol` | `250` |
| `uhd2` | `0.5` |
| `uhom` | `1` |
| `uhpr` | `0.25` |
| `ulum` | `0` |
| `uma2` | `0.4` |
| `umpi` | `100` |
| `umvs` | `0` |
| `umvt` | `foot` |
| `unsf` | `(70紮根)` |
| `upgr` | `R00I` |
| `upoi` | `64` |
| `uqd2` | `0.25` |
| `urac` | `orc` |
| `ureq` | `TALT` |
| `urq1` | `TWN2,TALT` |
| `urq2` | `TWN3,TALT` |
| `usma` | `1` |
| `uspa` | `Objects\Spawnmodels\NightElf\NECancelDeath\NECancelDeath.mdl` |
| `usrg` | `0` |
| `ussi` | `ReplaceableTextures\CommandButtons\BTNTreant.blp` |
| `usst` | `31` |
| `utyp` | `tree` |

### `O02N` — 87 曹操孟德 - 阿瞞大人（**本體**（反向缺口：只出貨了變身形態））

目標 content id：`godie-o02n`　作者標籤 `unsf`：`(87)`

| 欄位 | 值 |
|---|---|
| `abilities` | `AInv,ANht` |
| `agiGrowth` | `2.6` |
| `attackCooldown` | `2` |
| `attackRange` | `120` |
| `heroAbilities` | `A0DE,A0DD,A0DB,A0C2,Aamk` |
| `hpRegen` | `night` |
| `icon` | `ReplaceableTextures\CommandButtons\BTNPika.blp` |
| `intGrowth` | `1.7` |
| `model` | `units\demon\ChaosWolfRider\ChaosWolfRider.mdl` |
| `name` | `曹操孟德` |
| `properName` | `阿瞞大人` |
| `scale` | `1.3` |
| `strGrowth` | `1.7` |
| `ua1m` | `` |
| `ua1w` | `normal` |
| `uawt` | `曹操孟德(\|CFFffcc00F\|R)` |
| `ubba` | `250` |
| `ubdi` | `0` |
| `ubsi` | `0` |
| `ucbs` | `0.3` |
| `ucol` | `31` |
| `ucpt` | `0.1` |
| `ucs1` | `MetalMediumSlice` |
| `ugol` | `250` |
| `uhot` | `X` |
| `uhpr` | `75` |
| `ulum` | `0` |
| `umvs` | `330` |
| `umvt` | `amph` |
| `unsf` | `(87)` |
| `upgr` | `R00I` |
| `upoi` | `58` |
| `upra` | `AGI` |
| `urac` | `human` |
| `usma` | `1` |
| `usnd` | `Dryad` |
| `usrg` | `0` |
| `ussi` | `ReplaceableTextures\CommandButtons\BTNPika.blp` |
| `usst` | `31` |

> `utip` / `utub` 是英雄提示與說明文字，逐字保留在 `raw/war3map.w3u` 與 `TRANSFORMS.json` 裡；
> 匯入時要一併帶過來（`content/champions/*.json` 的 `description` 就是從 `utub` 來的）。
