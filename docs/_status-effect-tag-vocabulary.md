# 狀態標籤詞彙表（status-effect tags）

> **這份文件的讀者是外部編輯器專案。** 它要自足 —— 不需要讀 GGD 的原始碼就能照著
> 做出「類別條件」的下拉選單。最後更新：2026-08-08。
>
> 資料來源：`content/status-effects/*.json` 的 `tags` 欄位（27 份文件、78 個相異
> 標籤、共 195 個標籤，平均每份 7.22 個）。

---

## 1. 一份「狀態」是什麼，不是什麼

一份 status-effect 文件只回答**身分**問題：

| 欄位 | 意思 |
|---|---|
| `id` | 編號。技能用 `applyStatus.statusId` 指向它，條件用它做精確比對。 |
| `name` | 顯示名（【破魔】【暈眩】…）。 |
| `description` | 給人看的說明。 |
| `polarity` | `buff` / `debuff` —— HUD 要畫綠框還是紅框。 |
| `tags` | **本文件的主題**：它是什麼、它屬於哪些類。 |

⛔ **它不回答機制問題。** 下面這些一律**不在狀態文件上**，而在**施加它的那支技能**
的 `applyStatus` 參數上：

- 持續幾秒
- 減多少護甲 / 每秒燒多少 / 失手率幾 %
- 它到底擋住哪幾格（走不走得動、打不打得出手、放不放得出技能）
- 這一次施加**可不可以被淨化**（那是每一次施加各自帶的旗標，加上一組全域規則）

所以：**同一份狀態，被兩支不同的技能施加，可以有完全不同的數值與封鎖範圍。**
標籤描述的是「這是哪一族的東西」，不是「這一次會發生什麼」。

---

## 2. 開放架構：專屬標籤 ＋ 所有適用的類別標籤

> owner 2026-08-08：「狀態標籤**應該要做成開放架構，標籤盡可能多不要共用**」

初版的做法是「同類共用一個標籤」——【破甲】與【破魔】都只帶 `shred`。那個做法把
**「這是什麼」**和**「它屬於哪一類」**壓進同一格，於是想精確查【破魔】的人只查得到
「所有破防」。

現在的規則是**兩個都給**：

1. **專屬標籤** —— 每一份狀態都帶一個**等於它自己編號**的標籤（`magic-break`
   帶 `magic-break`）。這是它的身分，只有它有。
2. **所有適用的類別標籤** —— 凡是「對這份狀態為真」的分類，全部列出來。

判準只有一條：**只要這個標籤對這份狀態為真，就該列。**
不要因為「別的狀態也有」而省略，也不要因為「太細」而省略。
開放架構的成本是多幾個字串，收益是查詢寫得精確。

於是【破魔】同時查得到：
`magic-break`（就是它）· `shred`（所有破防）· `resist-down`（所有抗性下降）·
`magic-resist-down`（魔抗下降）· `stat-down` · `magical` · `debuff`。

### 標籤字串的規則（存檔那一刻就會擋）

| 規則 | 值 | 擋的是什麼 |
|---|---|---|
| 每個標籤長度 | 1–40 字元 | 40 是「有人把整段描述貼進來了」那條線 —— 誤植攔截，不是設計政策 |
| 前後空白 | 禁止 | `" stun"` 在表單上跟 `"stun"` 一模一樣，存得進去，然後**永遠比不中任何條件** |
| 同一份內重複 | 禁止 | 重複只可能是複製貼上的手滑，而且它什麼都不會改變 |
| 每份標籤數量 | ≤ 32 | 擋「把某個欄位整包倒進來」；目前最多的一份是 11 個 |

⭐ **標籤集合本身是開放的（自由字串，不是固定選單）。** 要新增一個分類，只要在
文件上寫下那個字串就好 —— **不需要改任何程式、不需要重新部署。** 這是刻意的：
遊戲內容是即時掛載的，程式不是；把分類寫死在程式裡，會讓「加一個分類」變成一次
完整部署。

---

## 3. 標籤軸線（做下拉選單時建議照這個分組）

### 3.1 極性

| 標籤 | 意思 | 帶著它的狀態數 |
|---|---|---:|
| `debuff` | 減益 —— 敵人施加在你身上的壞東西 | 21 |
| `buff` | 增益 —— 對自己有利（可能帶有代價） | 6 |

### 3.2 控場與行動限制

| 標籤 | 意思 | 帶著它的狀態 |
|---|---|---|
| `cc` | 控場總類：削弱或剝奪行動能力的減益 | 暈眩族 5 · 麻痺 · 癱瘓 · 定身 · 恐懼 · 混亂 · 致盲 · 詛咒 · 減速 3 |
| `hard-cc` | 完全動彈不得（走／打／技能三格全封） | 暈眩 · 燒灼暈眩 · 牙突僵直 · 食材化 · 超究拘束 · 試煉衝擊 |
| `soft-cc` | 還操作得動，只是被削弱 | 致盲 · 詛咒 · 減速 25/30/40 |
| `disable` | 至少剝奪三格中的一格 | 上列 hard-cc 六份 · 定身 · 恐懼 · 演武 · 癱瘓 · 麻痺 |
| `move-denied` | 走不動 | 暈眩族 5 · 演武 · 定身 |
| `attack-denied` | 打不出手 | 暈眩族 5 · 演武 · 恐懼 |
| `cast-denied` | 放不出技能 | 暈眩族 5 · 演武 |
| `immobilize` | 定身：腳被釘住，手還在 | 定身 |
| `uncontrollable` | 指令失效，但身體自己會動 | 暴走 · 混亂 · 恐懼 |
| `ai-override` | 身體改由自動邏輯驅動 | 暴走 · 混亂 · 恐懼 |
| `auto-target` | 自動找最近的敵人打 | 暴走 |
| `flee` | 自動遠離敵人 | 恐懼 |
| `friendly-fire` | 攻擊會落在自己人身上 | 混亂 |
| `self-lock` | 鎖住的是**施法者自己**，不是敵人 | 超究演武 |
| `channel` | 引導／演出中 | 超究演武 |

⚠️ `cc` 是**分類**，不是免疫規則。「哪一種免疫（魔免／霸體）擋得掉哪一種控場」
由施加它的那張卡與全域規則決定，不由標籤決定。

⚠️ `hard-cc` 與 `move-denied` / `attack-denied` / `cast-denied` 是**兩種寫法的同一件事**
（一個是族名，三個是明細）。兩個都列，是因為有人要查「所有硬控」，也有人只要查
「他現在走不走得動」。

### 3.3 破防與屬性增減

| 標籤 | 意思 | 帶著它的狀態 |
|---|---|---|
| `shred` | 破防：把防禦數值打掉一截 | 破甲 · 破魔 |
| `resist-down` | 抗性下降（總類） | 破甲 · 破魔 |
| `armor-down` | 護甲下降 | 破甲 |
| `magic-resist-down` | 魔抗下降 | 破魔 |
| `physical` | 對的是物理那一側 | 破甲 |
| `magical` | 對的是魔法那一側 | 破魔 |
| `move-speed-down` | 移動速度下降 | 減速 25/30/40 |
| `slow` | 減速族 | 減速 25/30/40 |
| `accuracy-down` | 命中下降 | 致盲 · 詛咒 |
| `attack-debuff` | 讓普通攻擊變差 | 致盲 · 詛咒 |
| `miss` | 普通攻擊會整個落空 | 致盲 · 詛咒 |
| `stat-down` | 某一項數值被調降（總類） | 破甲 · 破魔 · 減速 25/30/40 |
| `stat-up` | 某一項數值被調升（總類） | 狂怒 |
| `haste` | 變快 | 狂怒 |
| `lifesteal-up` | 吸血提升 | 狂怒 |
| `lifesteal-down` | 吸血被削弱 | 重創 · 禁療 |
| `frenzy` | 狂化：更快更猛，但方向盤還在自己手上 | 狂怒 |

### 3.4 治療與持續傷害

| 標籤 | 意思 | 帶著它的狀態 |
|---|---|---|
| `antiheal` | 治療被削弱（總類） | 重創 · 禁療 |
| `heal-down` | 受到的治療打折 | 重創 · 禁療 |
| `heal-block` | 治療完全歸零 | 禁療 |
| `regen-down` | 自然回復被削弱 | 重創 · 禁療 |
| `wound` | 傷口不肯癒合（族名） | 重創 · 禁療 |
| `dot` | 持續掉血 | 燃燒 |
| `fire` | 火 | 燃燒 · 燒灼暈眩 |
| `elemental` | 帶元素屬性 | 燃燒 |

### 3.5 蓄積與連段

| 標籤 | 意思 | 帶著它的狀態 |
|---|---|---|
| `banked` | 存款標記：剛剛消耗掉的東西還記在帳上 | 燒盡的念 · 光魔杖・燒盡的魔力 |
| `mana-banked` | 存的是魔力 | 同上 |
| `damage-bank` | 下一發會把它換成傷害 | 同上 |
| `combo` | 連段標記 | 者、皆、陣 連段 |
| `timed-window` | 有時限的接續窗口 | 者、皆、陣 連段 |

### 3.6 中繼資訊

| 標籤 | 意思 | 帶著它的狀態 |
|---|---|---|
| `marker` | 它被設計成**給別的技能查詢用**的標記 | 燃燒 |
| `generic` | 這是該族的**通用**那一份 | 暈眩 |
| `named-variant` | 這是該族的**具名變體**（自己的文案與圖示） | 燒灼暈眩 · 牙突僵直 · 食材化 · 超究拘束 · 超究演武 · 試煉衝擊 |
| `mechanism-on-card` | **它擋住哪幾格，由施加它的那支技能決定** —— 這份文件只給身分 | 癱瘓 · 麻痺 |

### 3.7 專屬標籤（每一份各一個，等於它的編號）

`armor-break` · `berserk` · `blind` · `burn` · `burnstun` · `confusion` · `curse` ·
`fang-stun` · `fear` · `grievous-wounds` · `ingredient` · `light-wand-banked` ·
`magic-break` · `moon-combo` · `nen-banked` · `no-heal` · `numbness` ·
`omnislash-lock` · `omnislash-perform` · `paralysis` · `rage` · `root` ·
`slow25` · `slow30` · `slow40` · `stun` · `trial-stun`

---

## 4. 逐份對照表

| 編號 | 名稱 | 極性 | 標籤 |
|---|---|---|---|
| `armor-break` | 破甲 | debuff | armor-break · shred · resist-down · armor-down · stat-down · physical · debuff |
| `berserk` | 暴走 | buff | berserk · uncontrollable · ai-override · auto-target · buff |
| `blind` | 致盲 | debuff | blind · miss · accuracy-down · attack-debuff · soft-cc · cc · debuff |
| `burn` | 燃燒 | debuff | burn · dot · fire · elemental · marker · debuff |
| `burnstun` | Searing Stun | debuff | burnstun · stun · hard-cc · cc · disable · move-denied · attack-denied · cast-denied · named-variant · fire · debuff |
| `confusion` | 混亂 | debuff | confusion · uncontrollable · ai-override · friendly-fire · cc · debuff |
| `curse` | 詛咒 | debuff | curse · miss · accuracy-down · attack-debuff · soft-cc · cc · debuff |
| `fang-stun` | 牙突・僵直 | debuff | fang-stun · stun · hard-cc · cc · disable · move-denied · attack-denied · cast-denied · named-variant · debuff |
| `fear` | 恐懼 | debuff | fear · uncontrollable · ai-override · flee · attack-denied · disable · cc · debuff |
| `grievous-wounds` | 重創 | debuff | grievous-wounds · wound · antiheal · heal-down · lifesteal-down · regen-down · debuff |
| `ingredient` | 食材化 | debuff | ingredient · stun · hard-cc · cc · disable · move-denied · attack-denied · cast-denied · named-variant · debuff |
| `light-wand-banked` | 光魔杖・燒盡的魔力 | buff | light-wand-banked · banked · mana-banked · damage-bank · buff |
| `magic-break` | 破魔 | debuff | magic-break · shred · resist-down · magic-resist-down · stat-down · magical · debuff |
| `moon-combo` | 者、皆、陣 連段 | buff | moon-combo · combo · timed-window · buff |
| `nen-banked` | 燒盡的念 | buff | nen-banked · banked · mana-banked · damage-bank · buff |
| `no-heal` | 禁療 | debuff | no-heal · wound · antiheal · heal-block · heal-down · lifesteal-down · regen-down · debuff |
| `numbness` | 麻痺 | debuff | numbness · disable · cc · mechanism-on-card · debuff |
| `omnislash-lock` | 超究武神霸斬・拘束 | debuff | omnislash-lock · stun · hard-cc · cc · disable · move-denied · attack-denied · cast-denied · named-variant · debuff |
| `omnislash-perform` | 超究武神霸斬・演武 | buff | omnislash-perform · stun · channel · self-lock · disable · move-denied · attack-denied · cast-denied · named-variant · buff |
| `paralysis` | 癱瘓 | debuff | paralysis · disable · cc · mechanism-on-card · debuff |
| `rage` | 狂怒 | buff | rage · frenzy · haste · lifesteal-up · stat-up · buff |
| `root` | Rooted | debuff | root · immobilize · move-denied · disable · cc · debuff |
| `slow25` | Slow (25%) | debuff | slow25 · slow · move-speed-down · stat-down · soft-cc · cc · debuff |
| `slow30` | Slow (30%) | debuff | slow30 · slow · move-speed-down · stat-down · soft-cc · cc · debuff |
| `slow40` | Slow (40%) | debuff | slow40 · slow · move-speed-down · stat-down · soft-cc · cc · debuff |
| `stun` | 暈眩 | debuff | stun · hard-cc · cc · disable · move-denied · attack-denied · cast-denied · generic · debuff |
| `trial-stun` | 試煉衝擊 | debuff | trial-stun · stun · hard-cc · cc · disable · move-denied · attack-denied · cast-denied · named-variant · debuff |

---

## 5. 為什麼這件事重要：「暈眩」不是一份文件，是七份

技能文案裡最常見的閘長這樣：

> 「敵方**暈眩**狀態下，額外追加致盲」

「暈眩」在內容裡**不是一份文件**，是七份 —— 因為每一支施加暈眩的技能都帶著自己的
文案與圖示（`stun` · `burnstun` · `fang-stun` · `ingredient` · `omnislash-lock` ·
`omnislash-perform` · `trial-stun`）。

如果條件只能寫「等於某一個編號」，作者就得寫成「七個編號任一」，而那張卡會在
**第八份暈眩上架的那一天安靜地漏掉它** —— 不會有任何錯誤訊息，卡片看起來也完全
正常。所以條件有兩種寫法：

```jsonc
{ "kind": "status", "subject": "target", "statusId": "trial-stun" }  // 這一份
{ "kind": "status", "subject": "target", "tag": "stun"            }  // 這一類
```

`tag` 那一種**逐字**比對本文件描述的字串。這就是為什麼標籤不可以有前後空白，
也是為什麼「盡可能多」比「盡可能精簡」重要。

---

## 6. 新增一份狀態時的檢查清單

1. 給它一個**專屬標籤**，字串等於它的 `id`。
2. 走過第 3 節的每一條軸線，凡是為真的類別標籤**全部列上**。
3. ⛔ 不要在標籤裡編碼數字、持續時間或倍率 —— 那些住在施加它的那張卡上。
   （唯一的例外是 `slow25` / `slow30` / `slow40`，因為那三個數字**就是**它們的身分。）
4. ⛔ 機制還沒定案的狀態：照樣建文件、照樣給豐富的標籤，但**在說明裡誠實寫出
   「它擋住什麼由施加它的技能決定」**，並帶上 `mechanism-on-card`。
   ⭐ 不確定「它是暈眩還是定身」**不是**不建文件的理由 —— 那是機制問題，
   而文件只負責身分。
5. 把它加進第 4 節的表。
