# 語意色彩標記（`descriptionRoles` / `[c=role]…[/c]`）—— 被取代的那一份知識

> **GH#757**（接手已關的 **#114**）· 定案 **2026-08-29** · 決定：**(a) 拆**
>
> ⭐ 這份文件存在的唯一理由是「**測試可以跟著設計走，知識不可以無聲消失**」
> （第一·五守則 · `docs/legacy/_w3x-fidelity-superseded.md` 是同一條規矩）。
> ⛔ **它不是壓縮取代** —— 下面每一張表都是**逐字抄自出貨原始碼**，⛔ 不是我憑印象重寫的摘要。

---

## ⓪ 先講清楚：今天什麼還在、什麼被判死

⚠️ **這份文件不宣稱那些程式已經被刪掉。** 它宣稱的是：
**那條鏈今天被判定為 `superseded`，而它的知識已經有一個不依賴那些程式的住處。**

| 東西 | 2026-08-29 的狀態 |
|---|---|
| `packages/shared/src/content/fieldAdoption.test.ts` 的兩列 | ⭐ **已改判 `superseded`**（在此之前是 `debt`，每跑必吼） |
| `packages/shared/src/content/semanticRoleMarkup.test.ts` | ⭐ **新的閘** —— 把「為什麼是 superseded」變成一條會紅的測試 |
| `packages/shared/src/content/schema/ability.ts` 的 `descriptionRoles` 欄位 | ⚠️ **仍在**（見 §5 為什麼今天拿不掉） |
| `apps/client/src/ui/components/abilityText.ts` 的 `classifyRole` / `ROLE_COLOR` / `parseRoleMarkup` | ⚠️ **仍在**，四個消費端仍接著 |
| `tools/w3x-import/w3xlib/wts.py` 的 `to_role_markup` / `classify_role` | ⚠️ **仍在**，而**全 repo 零呼叫者** |

⇒ ⭐ **所以這份文件現在的角色是「保險」**：那些程式哪天真的被刪，
知識已經先落地了；⛔ 而在它們被刪之前，這份文件是**唯一**寫下「當初為什麼這樣分類」的地方。

---

## ① 這條鏈原本要做什麼

w3x 的技能說明字串裡嵌著 `|cAARRGGBB … |r` 色碼 —— 原作用**顏色**表達語意
（紅＝傷害、金＝持續時間、藍＝魔力⋯），⛔ 但同一個語意在不同技能上用的紅**不一樣**。

#114 的想法是把它**正規化成語意**而不是搬顏色：

```
w3x:  「造成 |cffff0000650|r 點傷害，持續 |cffffcc005|r 秒」
      ↓ to_role_markup()（分類 → 重新發射）
GGD:  「造成 [c=damage]650[/c] 點傷害，持續 [c=duration]5[/c] 秒」
      ↓ parseRoleMarkup() → ROLE_COLOR
畫面: 每一個傷害數字都是**同一個**紅，⛔ 不是原作那七種紅
```

⇒ ⭐ 值得記住的設計意圖：**顏色不是資料，語意才是。** 這一點沒有被推翻（見 §4）。

---

## ② 角色詞彙與正規化色碼

逐字抄自 `apps/client/src/ui/components/abilityText.ts::ROLE_COLOR`（2026-08-29）：

| role | 正規化色碼 | 語意 |
|---|---|---|
| `damage` | `#ff6b5e` | 傷害數字 |
| `physical` | `#ffa24b` | 物理／攻擊力 |
| `duration` | `#f2c637` | 持續時間、冷卻 |
| `heal` | `#5fd17a` | 回復 |
| `mana` | `#5aa2ff` | 魔力 |
| `magic` | `#b98bff` | 法術／魔法傷害 |
| `generic` | `#dfe6f2` | 中性強調（名稱、關鍵字） |

⚠️ 這七個色碼是**深色面板上可讀**的一組，⛔ 不是原作的顏色 —— 這是刻意的：
「whatever inconsistent red the source used for a damage number, it renders as exactly this red everywhere」。

---

## ③ hex → role 的分類規則（⭐ 這是最值錢的一段，因為它是**兩份實作逐位元對齊**的）

同一個規則寫了兩次並刻意保持一致：
`abilityText.ts::classifyRole`（TS）與 `w3xlib/wts.py::classify_role`（Python）。

### ③-a 前處理

1. 小寫、剝掉所有非 `[0-9a-f]` 字元（於是 `|cff00c800` 這種帶雜訊的輸入也吃得下）
2. 長度 8 ⇒ 取後 6（**丟掉 alpha**）；否則取最後 6
3. 不足 6 碼 ⇒ `generic`（退化輸入不擲例外）

### ③-b 覆寫表（⭐ 先於色相規則）

逐字抄自兩份實作的 `ROLE_OVERRIDES` / `_ROLE_OVERRIDES`：

| RRGGBB | role | 為什麼 |
|---|---|---|
| `ffdead` | `generic` | navajo-white —— 道具／關鍵字名稱 |
| `c3dbff` | `generic` | 淡藍強調 |
| `ffffff` | `generic` | 白 |
| `c0c0c0` | `generic` | 灰 |

⭐ **這張表是整條鏈裡唯一「靠色相判不出來」的知識**：
`ffdead` 的色相是橘（會被判成 `physical`）、`c3dbff` 是藍（會被判成 `mana`），
⛔ 而它們在原作裡是**非數值的中性強調**。⇒ 這四列是**量到的例外**，不是美感。

### ③-c 色相規則（HSV，⛔ 兩份實作的常數必須一樣）

```
r,g,b ← 各 /255
mx,mn ← max,min ; d ← mx-mn ; sat ← (mx==0 ? 0 : d/mx)
if d < 0.06 or sat < 0.18      → generic      # 近灰／低飽和先折掉
hue ← 標準 HSV 色相（0–360）
  hue < 20  or hue >= 330      → damage       # 紅（跨 0 度）
  hue < 45                     → physical     # 橘
  hue < 70                     → duration     # 金
  hue < 165                    → heal         # 綠
  hue < 255                    → mana         # 藍／青
  否則                          → magic        # 紫
```

⚠️ **它是 TOTAL 的** —— 永遠不回 `unknown`。這是刻意的：
一個匯入器不可以因為遇到沒看過的顏色就停下來。

---

## ④ `[c=role]…[/c]` 的文法

| | |
|---|---|
| **正則** | `` /\[c=([a-z-]+)\]([\s\S]*?)\[\/c\]/g ``（跨行、非貪婪） |
| **來源側** | `_COLOR_SPAN_RE = \|c([0-9a-fA-F]{8})` —— 每一段 `\|cAARRGGBB … \|r` 變成一段 `[c=role]…[/c]`；`\|n` 轉換行；**未閉合的 span 跑到下一個色碼或字串結尾** |
| **解析側** | `parseRoleMarkup(s)` 切成 `{text, role?}` 的 segment 陣列；**認不得的 role 標籤降級成純文字**（⛔ 不擲例外）；完全沒有標記 ⇒ 回傳單一純 segment（⇒ 對舊的平面說明是安全的 no-op） |
| **不變式** | `to_role_markup(s)` 的結果**等於 `strip_codes(s)` 再加上角色標籤** —— ⭐ 文字本身一個字都不能變 |

---

## ⑤ 為什麼被取代 —— ⭐ 量到的，⛔ 不是「沒人排到」

2026-08-29 跑**出貨載入路徑**（⛔ 不是讀程式碼推論），拿真的出貨技能 `godie-e001.e`
把 `description` 原句複製進 `descriptionRoles` 再跑 `registerAll`：

| 欄位 | 載入後 |
|---|---|
| `description` | 「15秒冷卻時間…造成瞬間500點傷害」 ⭐ **已算繪** |
| `descriptionRoles` | 「`{{cd}}`秒冷卻時間…`{{dmg}}`點傷害」 ⛔ **沒有被算繪** |

champion-embedded 鏡像（`expandEmbedded`）量到**完全一樣**的結果 —— ⛔ 不是類推，兩條路都真的跑過。

### 根因：**同一句話的第二個住處，而寫入端只寫第一個**（第〇·四守則）

| 段 | 事實 |
|---|---|
| 寫入端 | `packages/shared/src/content/registries.ts::withProse` 只把佔位符代進 **`description` 一格** |
| 讀取端 | `apps/client/src/ui/components/abilityText.ts::docDescription` **優先回傳 `descriptionRoles`**，六個卡面消費端全走它 |
| 母體 | 出貨 **421** 份 ability doc 裡 **338 份**帶 `{{}}` 佔位符 |

⇒ ⭐ **「採用它」就是缺陷** —— 逐字是 `fieldAdoption.test.ts:126` 的 `superseded` 定義。
⇒ ⭐ 所以 `0/492` 的採用率**是正確的狀態**，⛔ 不是一筆欠債。

### ⚠️ 兩個過期前提，一起更正（第三守則）

| 舊說法 | 今天 |
|---|---|
| 「選餵之前必須先修 `abilityText.ts` 兩條正則與 `parseRoleMarkup` 的呼叫順序」 | ⛔ **早就做完了** —— `MARKUP` 已烘進 `COOLDOWN_PROSE_RE` 與 `DAMAGE_PROSE_RE`，兩條都吃得下夾在中間的 `[c=role]`。⛔ 它不是擋路的東西 |
| 「重跑 importer 就好」 | ⛔ 仍然不成立，且原因未變：`to_role_markup` **零呼叫者**，重跑產不出東西 |

### ⚠️ 為什麼「拆」今天沒有走到刪程式碼那一步

拿掉 `schema/ability.ts` 的 `descriptionRoles` 會讓**四份產物同時過期**：
`content/editor-target-profile.json`（`skillremake:json`）·
`docs/editor-contract/ggd-runtime-capabilities.{md,json}`（`caps:export`）·
`docs/技能標記機制與效果規則.md`（`spec:build`）。
⇒ 那需要一條**同時吃 `packages/shared` + `apps/client` + `tools/` + 產生器**的 lane
（而 `skills:sync` 全域只能有一條工作流跑）。⛔ 拆給多條柵欄只會得到一個 `--check` 紅一片的半成品。

---

## ⑥ ⭐ 取代它的是什麼 —— 語意角色**沒有被放棄**，它換了住處

| 佔位符（今天的住處，唯一） | 等價的角色標記（退役） |
|---|---|
| `{{dmg}}` | `[c=damage]…[/c]` |
| `{{cd}}` | `[c=duration]…[/c]` |
| `{{mp}}` | `[c=mana]…[/c]` |
| `{{radius}}` | （`[c=generic]`／無） |

差別**不在語意，在住處**：
佔位符住在 `description` **一格**並在**載入時**算繪（第〇·四守則）；
`descriptionRoles` 是同一句話的**第二份字串**，而它有一個寫入端從不寫它。

⇒ ⭐ **真的要卡面色彩的那一天，正解是「從佔位符推導顏色」**
（零內容改動、零第二住處、338 份文件一個字都不用動），
⛔ 不是把 492 份文件各塞一份副本。

---

## ⑦ 這份知識什麼時候會**復活**（⭐ 三條都是閘，⛔ 沒有一條是「要記得」）

| # | 條件 | 誰會紅 |
|---|---|---|
| ① | 任何一份文件填了 `descriptionRoles` | `fieldAdoption.test.ts` 的 STALE 測試 ⇒ 要求刪掉那兩列 |
| ② | 載入期的算繪**也涵蓋** `descriptionRoles` ⇒ 前提消失、「餵」重新可行 | `packages/shared/src/content/semanticRoleMarkup.test.ts` 第二條斷言 |
| ③ | schema 欄位真的被拿掉（拆的最後一段） | 同一條 STALE 測試，訊息是「no longer a registered key at all」 |

⚠️ ②發生的那一天，**回頭讀本文件的 §②③④** —— 分類表與文法是重新接上這條鏈所需要的全部，
⭐ 而它們**不依賴那些程式還在不在**。
