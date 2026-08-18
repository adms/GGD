# 寶具 authoringNote 全文（`item@1.authoringNote` 2000 字上限的溢位備份）

> ⛔ **這一份存在的理由：`authoringNote` 有 2000 字硬上限，而知識不可以因為一個字數限制無聲消失。**
> owner 2026-08-18：「**應該是先備份原本內容成另一份檔案，不應該直接壓縮取代**」。
>
> ⚠️ 這與 `docs/legacy/_w3x-fidelity-superseded.md` 是**同一條規矩**：被取代的東西要另存 ——
> 測試可以跟著設計走，**知識不可以無聲消失**。
>
> ⛔ 這一份是**人寫的備份**，不是產生的。JSON 裡的 `authoringNote` 是**摘要 + 指標**，
> 逐句對照的全文在這裡。改 JSON 的註記時，⚠️ 記得回頭同步這一份。

---

## 閃耀金玉 (#61) — `content/items/shining-golden-orbs.json`

### 逐句對照（原始 `authoringNote` 全文）

```
⭐ owner 2026-08-17 親自重新設計，⛔ 規格表第 61 列的「弓與箭」已作廢，不要照那一列改。
「每當自身任一屬性**首次**達到一般上限時」= `onStatCapReached`（`statPipeline` 對 `capFor().base` 判、每條屬性一生一次，且 `firesOutsideCombat` —— 屬性到頂多半發生在商店買完裝備那一刻）。
「獲得 1 層金玉，最多 2 層」= effects[0]：**不填 stackKey**（複利路徑，每次施加各自一份來源）＋ `maxStacks: 2`。複利是刻意的 —— 文案是「每層 ×1.15」而 2 層要是 1.3225 而不是 1.30（填 stackKey 會被折算成 1 + 0.15×2）。
「所有已達上限的屬性 解鎖上限 +25%」= 13 條 `capRaisePct 0.25`（＝出貨 `config.stat-caps@1` 的**全部** 13 條）。引擎的 payload 帶著 `stat`，但**內容側讀不到它**，所以「已達上限的那一條」只能寫成「全部 13 條」—— 對還沒到頂的那幾條，抬高上限本來就不給任何數值（`CapRaise` 家族只搬天花板）。
⚠️ **出貨 13 條上限裡只有攻速（4→10）與吸血（0.8→20）留了解鎖空間，其餘 11 條 `unlocked === base`，所以 `capRaisePct` 對它們今天是 no-op** —— `statCaps.effectiveCap` 把任何解鎖硬夾到 `unlocked`。⛔ 這**不是這張卡的缺陷**，是一個等 owner 裁決的 config 資料決定（`content/config/stat-caps.json`，後台一格、存檔生效）。⚠️ 其中 `ms` 那一格另有已量到的物理風險（18.0 = 30Hz 離散碰撞的穿牆平手線），見 `sim/statCaps.ts`。
⚠️ **降級**：「所有**正**屬性增益 ×1.15」—— 引擎沒有「只放大正的增益」這個概念（一份來源可以同時帶 +ms 與 -armor，任何啟發式都會在某張卡上錯，這也正是 `applyBuff.polarity` 要作者明寫的理由）。⇒ 降級成**指名的 9 條主要屬性各自 `pctMult 0.15`**（ad/ap/armor/mr/maxHealth/maxMana/healthRegen/manaRegen/as）。⛔ 兩點要知道：① `pctMult` 乘的是**最終值**不是「增益的部分」；② 比率型（critChance / cdr / lifesteal / evasion）與 range 刻意不在名單裡 —— ×1.15 一個 0..1 的比率是另一種語意。
「移動速度 ×1.10」= 同一份來源的 `ms pctMult 0.10`（所以 ms 不重複吃上面那 9 條的 ×1.15）。
「取得第 2 層時觸發[完全體]」= effects[1]，同一條 hook 的**第二段**：`condition.status{minStacks:2}` 讀的是金玉自己的 statusId（`statusStacks` 把兩份來源相加），而 effects 是**照順序**跑的 —— 第 2 層在 effects[0] 就已經掛上，所以這一段在同一次事件裡就成立。用 `stackKey` + `maxStacks: 1` 讓它只發生一次（⛔ 不能也走複利路徑：那條路的額度是用 `buff:hook:<來源>#` **前綴**數的，會跟金玉共用同一本帳）。
「再 ×1.20」= 同 9 條 + ms 的 `pctMult 0.20`（獨立一份來源 ⇒ 真的再乘一次）。「造成傷害、治療、護盾 ×1.20」= `outputDamagePct` / `outputHealingPct` / `outputShieldPct` 各 flat 0.2（語意是加成，0 = ×1）。「技能冷卻流逝速度 ×1.20」= `cooldownDrainRate` flat 0.2（⛔ 不是 CDR：那一格在施放的瞬間就結算完了，而這裡要的是**冷卻進行中**也立刻加速）。
```

### 2026-08-18 「不放任何無效說明」修正的完整理由

原文「所有已達上限的屬性 解鎖上限 +25%」實作時對 13 條屬性各掛一條 `capRaisePct`，⛔ 其中 **11 條是無效宣稱**：`config.stat-caps@1` 只有 `as`(4→10) 與 `lifesteal`(0.8→20) 有解鎖空間，其餘 `unlocked === base`，`effectiveCap` 會夾回去。

⚠️ **而且即使它們生效也不會改變任何一場比賽** —— 那 11 條的 base 是防 mis-parse 的柵欄（`ad` 21200、`maxHealth` 375960…），⛔ 不是玩家碰得到的天花板。換句話說這張卡的前提「已達上限」本來就只在 `as` 與 `lifesteal` 上成立。

⇒ **保留那兩條真的、刪掉 11 條假的、描述改成只講真的那兩條。卡片實際強度一分未減。**

⚠️ 若要讓其餘屬性也真的可解鎖，那是 `content/config/stat-caps.json` 的一個**平衡決定**（把 `unlocked` 抬高），⛔ 不是這張卡的事。

---

## 終極魔改・不知火 (#50) — `content/items/ultimate-mod-shiranui.json`

### 逐句對照（原始 `authoringNote` 全文）

```
[EX解放] owner 規格 #50（貓耳貓／日本刀）。⚠️ 原文有兩句 owner 2026-08-17 已裁決**換做法**，⛔ 不是我自作主張：
① 原文「找出**其他裝備**提供最高的 3 項正屬性，各自效果再 ×1.5」——「讀別件裝備、排名挑前三」引擎沒有這個機制（道具之間沒有互讀介面），裁決改成**指定三條屬性**。這裡挑 ad / as / critDamage（日本刀＝普攻流的三條主軸）。
② 原文「任一屬性超過原上限後，**溢出部分仍以 100% 效率生效**」——「溢出轉換」引擎沒有（上限是硬夾，夾掉的量不留存），裁決改成**「達標後的第二段」**，用 onStatCapReached 在屬性到頂時再發一份。

逐句：
[魔改解放]「各自效果再 ×1.5」= modifiers 三條 pctMult 0.5。⚠️ pctMult 在同一份來源內是線性（1+v×stacks），這裡只有一份 stacks=1，所以就是 ×1.5。
[上限突破]「這三項屬性上限 +50%」= 三條 capRaisePct 0.5（新機制：抬到一般上限 ×1.5）。
⚠️ **三條裡今天只有 as 真的會動**。出貨 config.stat-caps@1 只有 as(4→10) 與 lifesteal(0.8→20) 留了解鎖空間；ad 是 base=unlocked=21200（effectiveCap 夾回 unlocked ⇒ no-op），critDamage 不在 cap 表也沒有 STAT_CLAMPS（上限本來就 +∞ ⇒ no-op）。⛔ 這兩條**不是**寫錯：後台把那兩格的 unlocked 調高就活過來（第一守則）。as 實際 4.0 → **6.0**。
[溢出] = passive onStatCapReached + **永久** applyBuff（三條 pctMult 0.15）。
· **複利**：⛔ 不填 stackKey ⇒ 每次一份新來源 ⇒ 三次 = 1.15³ ≈ **×1.52**，刻意回到 owner 那個 ×1.5。
· 「最多 3 次」= maxTriggers 3（對應原文「3 項屬性」）。⛔ 不另寫 maxStacks：兩個機制講同一件事只會分岔。
⚠️ 兩個引擎限制：① onStatCapReached 的 payload 帶 stat，但**條件葉讀不到它** ⇒ 這條 hook 不挑屬性，任意三條到頂就用完額度。② 同一 tick 兩條屬性同時到頂時 applyBuff 的 id 是 buff:<origin>#<tick> ⇒ 那一 tick 只留一份。
⚠️ description 已改寫成**這件道具真的做的事**，⛔ 不是原文照抄：卡面若還寫「讀其他裝備」就是一句永遠不兌現的承諾。
```

### 2026-08-18 「不放任何無效說明」修正的完整理由

[上限突破] 原本對 `ad` / `as` / `critDamage` 三條各掛 `capRaisePct 0.5`。

⛔ 其中 `ad`（`unlocked === base`）與 `critDamage`（**根本不在 `config.stat-caps@1` 裡**，`capFor` 對未列出的屬性回 `base === unlocked`）兩條是無效宣稱。只有 `as`（4→10）真的解得開。

⇒ 刪掉那兩條、描述改成「攻擊速度的上限 +50%」。強度未減（那兩條本來就給 0）。

---

## 立體機動裝置 (#60) — `content/items/odm-gear.json`

### 逐句對照（原始 `authoringNote` 全文）

```
這是這一批缺口最多的一件（5 條裡只有 1 條寫得出來）。逐條交代：
[機動上限解放]「移速上限 18 → 24」= `modifiers` 的 `capRaisePct 0.3333`（一般上限 ×1.3333 = 18 → 24.0）。用百分比而不是 `capRaise: 24` 是刻意的：`ms.base` 是後台可調的，絕對值那一天不會跟著動而卡片還寫著「→24」。
⚠️ **它今天是 no-op，而且原因不只一個**：① `content/config/stat-caps.json` 的 `ms` 是 `base 18 / unlocked 18`，而 `statCaps.effectiveCap` 把任何解鎖硬夾到 `unlocked` —— 出貨 13 條上限裡**只有攻速（4→10）與吸血（0.8→20）留了解鎖空間**，其餘 11 條 `unlocked === base`，寫了等於沒寫。② 更重要：`sim/statCaps.ts` 那一列有 owner 2026-08-15 的量測註解 —— **18.0 = 30Hz 離散碰撞的穿牆平手線**（每 tick 0.6u = 身體半徑 100%），第一版的「上限 24 / 解鎖 30」正是因為穿牆才被退回來的。所以把 `ms.unlocked` 抬到 24 **不是一格數字**，是一個帶已知物理風險的決定 —— 那是 owner 的裁決，⛔ 不是這張卡的缺陷，也不是我可以在道具檔裡繞過去的東西。
[超速]「每超出 1 點⋯」⚠️ **降級①**：引擎**沒有「由某條屬性的讀數推導層數」**的機制（條件葉只做布林比較，`applyBuff` 只做次數疊層）。⇒ 「每超出 1 點」整個縮成**一份固定量**。
· 「位移距離 +8%」⚠️ **降級②：完全沒有實作**。沒有「位移距離」這條屬性，`dash.maxDistance` / `blink` 是每一支技能自己文件裡的常數，道具碰不到。
· 「移動後 2 秒內造成的傷害／治療／護盾 +3%」= passive[0]：`onDashOrBlink` → 2 秒的 outputDamagePct / outputHealingPct / outputShieldPct 各 **flat 0.03**（＝「超出 1 點」那一格的量）。⚠️ 「移動後」讀成**位移技能之後**（衝刺／閃現／跳躍），⛔ 不是「走路之後」—— 後者沒有事件。
[回收]「每累積移動 10 距離，立即使位移技能剩餘冷卻降低 30%」⚠️ **降級③：完全沒有實作**，兩個獨立的原因：① 移動距離累積器不存在（同 #59 的 G10 缺口）；② `modifyCooldown` **必須指名 `slot` 或 `abilityId`**（`refineModifyCooldown` 擋，因為兩個都不填等於全域 CDR），而「位移技能」不是一個槽位 —— `onDashOrBlink` 由 `WorldHookSystem` 發射，那條路**傳的 abilitySlot 是 undefined**，所以連 `abilitySlot` 過濾都永遠不匹配。硬寫成 Q/W/E/R/EX 五格全減 30% 是一件完全不同（強太多）的道具，⛔ 不做。
```

### 2026-08-18 「不放任何無效說明」修正的完整理由

[機動上限解放]「移速上限 18 → 24」是一句無效宣稱：`ms` 的 `unlocked === base === 18`。

⚠️ **這一條不可以靠改 config 修好。** `sim/statCaps.ts` 記著 owner 2026-08-15 的量測 ——
**18.0 就是 30Hz 離散碰撞的穿牆平手線**，第一版的「上限 24 / 解鎖 30」正是因為穿牆被退回來的。
把 `ms.unlocked` 抬到 24 是一個**帶已知物理風險**的決定，⛔ 不是一格數字。

⇒ 整條移除。

⚠️⚠️ **這張卡目前只剩一句話，需要 owner 重新設計。** 原設計五個賣點有**四個**要的機制引擎沒有：
· 「移速上限 18→24」→ 見上（穿牆平手線，引擎題）
· 「每超出 1 點，位移距離 +8%」→ 沒有「位移距離」這條屬性，也沒有「由屬性推導層數」
· 「每累積移動 10 距離」→ 沒有移動距離累積器（G10）
· 「使位移技能剩餘冷卻降低 30%」→ `modifyCooldown` 必須指名 slot／abilityId，而 `onDashOrBlink` 由 `WorldHookSystem` 發射時 **`abilitySlot` 是 undefined**，過濾永遠不匹配

⇒ 剩下唯一寫得出來的是「位移後 2 秒 +3% 輸出」。⛔ 我沒有自己補強度 —— 那是平衡決定。

⚠️ **修的當下差點造出一條新的假話**：我第一版描述曾寫「[回收] 位移技能命中後回復魔力」，而這張卡根本沒有那個 effect。已改成只描述真的會發生的那一句。

---


## 石鬼面 (#55) — `content/items/stone-mask.json`

### 被取代的 `[疊層]` 做法（2026-08-18 之前的 `authoringNote` 原文）

```
[疊層]「每損失 10%生命，再使生命回復 ×1.10」= passive[1]，⚠️ **這一句被換過做法**：owner 已裁決不做「由屬性狀態推導層數」(G6)，改成事件驅動疊層。做法是 onDamageTaken + condition「身上有〔究極肉體〕」→ 每次挨打加一層 healthRegen pctMult 0.10，**不填 stackKey** 所以走真複利 (1.10)^N，maxStacks 5（對應 50%→0% 的五段）。
⚠️ 兩處與原文不同，明講：① 量尺從「損失 10% 生命」換成「受到一次傷害」；② 為了不讓一發 DoT 在一秒內灌滿五層，我加了 internalCooldown 1 秒 —— **那個 1 是我補的節流，不是 owner 的數字**，要調就調這一格。
⚠️ 為什麼 passive[0] 走 stackKey 而不是 exclusiveGroup：複利路徑的 maxStacks 用 `buff:hook:<來源>#` 前綴數份數，而同一件道具的每一條 hook 共用同一個 origin —— 走 stackKey 的 id 是 `buff:stack:…`，才不會把究極肉體本體算進 passive[1] 的五份額度裡。
```

### 2026-08-18 「不放任何無效說明」修正的完整理由

⛔ 舊做法有**兩句無效說明**，而且兩句都不是「引擎做不到」：

1. **量尺不對。** 描述寫「每損失 **10%生命**」，實作量的是「**受到一次傷害**」。
   一個被 5 發小刀砍掉 3% 血的人會拿滿五階，一個被一發打掉 40% 血的人只拿一階 ——
   兩種情形玩家都看不出卡片在說謊。
2. **那個 `internalCooldown: 1` 是我憑空補的常數**（原註記自己承認了）。它不在 owner
   的文案裡，也不是引擎的預設，卻決定了這張卡的實際疊層速度。

⇒ 改成 **`condition.stat` 的門檻階梯**（形狀與 #69 兎月【雙弦月】的五道階梯逐字相同）：
五道各自問 `hp percent < 0.5 / 0.4 / 0.3 / 0.2 / 0.1`，各自一個 `stackKey` + `maxStacks: 1`。

⭐ 三個好處都是可以驗的：① 描述逐字為真（量的就是生命）；② **不需要任何我發明的常數**
（節流消失了 —— 一階只成立一次是 `maxStacks: 1` 給的，不是時間給的）；
③ 強度一分未減（五份獨立來源的 `pctMult` 仍然相乘，1.10^5 = ×1.6105）。

⚠️ 仍然走 `stackKey` 而不是複利路徑，理由與舊註記那一段**逐字相同**：複利路徑的額度用
`buff:hook:<來源>#` 前綴數，而同一件道具的每一條 hook 共用同一個 `origin`
（`fireHooks` 的 `hook:${src.id}`）—— 六道 hook 會共用一本帳。

---

## 蒼月葬送・千年彼方花冠 (#69) — `content/items/pale-moon-requiem-crown.json`

### 逐句對照（`authoringNote` 全文，2026-08-18 稽核後）

```
[蒼月開花]「每產生相當於目標最大生命 8%的過量治療或過量護盾，生成 1 朵蒼月花，最多 8 朵」= passive[0]（onOverheal + internalCooldown 3）。⚠️ **三重降級**：
① **量讀不到**（G7「讀這一發的量」引擎沒有）——hook payload 不把溢出的數值交給內容側，所以「相當於目標最大生命 8%」寫不出來。改成「每一次過量治療事件 = 1 朵」，用 internalCooldown 3 秒當節流閥（沒有它的話一段持續治療會在幾個 tick 內把八朵開滿）。
② **過量護盾沒有事件** —— 只有 heal 那一則帶 overheal 欄位（WorldHookSystem 的 onOverheal 那一列），護盾溢出不發任何東西。所以只有過量**治療**算數。
③ **方向反了** —— 引擎的 onOverheal 持有者是**被治療的那個身體**（actorKey: "target"），不是治療者。所以花是在「花冠持有者自己被治滿」時開的，⛔ 不是「他把隊友治滿」時。這是這一支最大的落差，要修得掉需要一個以治療者為持有者的溢出事件。
[花瓣]「每朵使治療與護盾 ×1.04」= outputHealingPct / outputShieldPct 各 flat +0.04。⚠️ 這一條**只能線性**，⛔ 不是我偷懶：那兩格的語意是**加成**（0 = ×1），pctMult 乘的是加成本身，而 0 乘任何東西都是 0 —— 一張只寫 pctMult 的卡會完全沒有效果（失敗形態②）。所以八朵 = +0.32 = ×1.32，而 owner 的複利讀法是 1.04^8 ≈ ×1.369，差 3.7 個百分點，記在這裡。
· 「最多 8 朵」= maxStacks 8（GH#354 之後複利路徑也吃得到）。每一份來源帶 statusId「pale-moon-flower」，一份來源 = 一朵，所以朵數就是 statusStacks 讀得到的層數，下面那一段才問得出「八朵了沒」。⚠️ 這個 statusId **沒有** status-effect@1 文件（它只是計數器，不需要圖示）；applyBuff.statusId 不是 refs.ts 抽得到的 ref 邊，所以不會有 dangling 警告。
· 朵數取 permanentScope: "round"（owner 沒寫壽命，同批 #54「整個回合不會衰退」的讀法），⛔ 不猜秒數。
[千年花園]「八朵後展開 8 秒，我方兩人的治療與護盾 ×1.40」= passive[1]：condition status minStacks 8 → duration 8 的 +0.40 兩格，hook target: "allies"（＝同隊每一位英雄，也就是文案的「我方兩人」）。用 stackKey 而不是複利路徑是**必要的**：同一件道具的兩條 hook 共用同一個 origin，複利路徑的 id 是 `buff:<origin>#<tick>`，同一 tick 兩份會互相覆蓋。
⚠️ internalCooldown 30 是**這份文件自己決定的參數**：花朵是回合永久的，沒有節流的話花園會每一次治療重新展開＝變成常駐。owner 的規格沒有寫再觸發規則。
⚠️ 「其中 50%同步給另一名隊友」（G18 治療分流）與「所有過量治療轉為護盾」（G9 溢出轉換）**兩條都沒有實作**，引擎沒有對應機制。前者的意圖被 target:"allies" 部分蓋掉（兩人都直接拿到 ×1.40），後者整條沒有。

⭐ 2026-08-18 逐句稽核（第一·五守則「不放任何無效說明」）—— 這一支是九件裡卡面說謊最多的，**實作沒動，卡面整段重寫**：
① 「每產生相當於目標最大生命 8%的過量治療」→「自己受到過量治療時（每 3 秒最多一次）」。三個理由都在上面：量讀不到（G7）、護盾溢出不發事件、而且**方向是反的**（`WorldHookSystem` 的 onOverheal 那一列 `actorKey:"target"` = 持有者是**被治的身體**）。舊卡面等於教玩家去治隊友，而那樣一朵花都開不出來。
② 「每朵×1.04」→「每朵 +4%（八朵 ×1.32）」。輸出三軸 base 為 0、管線是 `(0+Σflat)×…`，只有 flat 動得了它們 ⇒ **線性**。舊卡面的複利讀法八朵是 ×1.369，差 3.7 個百分點。
③ ⛔ **刪掉**「其中 50%同步給另一名隊友」與「所有過量治療轉為護盾」——兩條零實作，留在卡面就是兩句永遠不兌現的承諾。需要 G18 / G9，已列進回報。
④ 補上兩個真的存在而卡面沒寫的閘：花的壽命（本回合）與花園的 30 秒 ICD。
```

### 為什麼這一份會溢位

這是九件裡**卡面說謊最多**的一支：三句效能有三處與引擎不符，其中兩處是**零實作**、
一處是**語意方向相反**。把每一處的理由都寫下來就是 2,030 字 —— 超過 `item@1.authoringNote`
的 2000 字硬上限 30 字。⛔ 依 owner 2026-08-18 的規矩**不截斷**：全文留在這裡，
JSON 裡是摘要 + 指標。

⚠️ 最要命的一處是 **`onOverheal` 的方向**：`sim/systems/WorldHookSystem.ts` 那一列寫
`actorKey: "target"`，也就是 hook 的**持有者是被治療的身體**，不是治療者。舊卡面寫
「每產生⋯過量治療⋯生成 1 朵蒼月花」，教玩家拿這頂花冠去治隊友 —— 而那樣**一朵花都開不出來**。
要做出原設計需要一個「以治療者為持有者」的溢出事件（見回報裡的 G18/G9 清單）。

---

## 福音書 `book-of-gospel` — 2026-08-18 逐句稽核全文

`item@1.authoringNote` 有 2000 字硬上限，而這一支的落差有四處、每一處都要寫下
「為什麼不能補」，寫完會超過。⛔ 依 owner 2026-08-18 的規矩**不截斷原文** ——
JSON 裡留摘要 + 這個指標，完整版在這裡。

### owner 原文（2026-08-17，⛔ 不可以讓它消失）

```
[福音] 使用不同基礎技能時累積「頁」，最多 4 頁；每頁使下一個不同技能效果 ×1.08
[福音] 四頁後下一個技能進入「既定未來」，效果 ×1.60 並返還 50%剩餘冷卻，之後清空
```

### 改寫後的卡面（實作真的會發生的事）

```
[福音] 每次使用基礎技能（Q／W／E）累積 1 頁〔福音〕，最多 4 頁；每頁使自身造成的
       傷害・治療・護盾 +8%（四頁 ×1.32）
[福音] 集滿四頁後的下一個基礎技能進入〔既定未來〕：接下來 3 秒內的傷害・治療・護盾
       再 +60%（與頁數合計約 ×1.92），並返還該格 50% 剩餘冷卻。每回合限一次
```

### 四處落差，逐條

| # | owner 寫的 | 引擎做得到的 | 為什麼不能補 |
|---|---|---|---|
| ① | 使用**不同**基礎技能才累積 | 任何 Q/W/E 都累積 | 沒有「這一發跟上一發是不是同一支」的條件葉。⚠️ **而且這一句和「最多 4 頁」互相矛盾** —— 基礎技只有 Q/W/E **三格**（R 是終極技、EX 是寶具，兩者都走別的 hook 事件），所以「四種不同的基礎技能」在這個引擎裡不存在。用 per-slot 標記硬做的話上限只有 3 頁，`minStacks: 4` 的既定未來就**永遠不會發動** —— 那比現在更糟。**這一題要 owner 裁決：改成 3 頁，還是把 R 算進基礎技，還是加一個「與上一發不同」的條件葉。** |
| ② | 每頁 ×1.08（**複利**） | 每頁 **+8%**（線性），四頁 ×1.32 | `outputDamagePct` / `outputHealingPct` / `outputShieldPct` 三格的語意是**加成**（0 = ×1），而管線是 `(base + Σflat) × (1+ΣpctAdd) × Π(1+pctMult)` 且 base **恆為 0** ⇒ `pctMult` 乘 0 還是 0。⛔ 這族屬性**結構上表達不出複利**，不是選錯 op。差距：1.08⁴ = 1.3605 vs 1.32，3.0 個百分點。 |
| ③ | 既定未來 ×1.60，**之後清空** | 既定未來 +60%，頁數**留著**，改成每回合一次 | 引擎沒有「拔掉指定一份增益」的機制（`dispel` 是整池的、`maxTriggers` 管的是觸發器發幾次）。實作用 `permanentScope:"round"` 的標記 `gospel-fated-future-spent` 擋住第二次，回合開始由 `clearRoundScoped` 拔掉。⇒ 那一發實際是 **+0.32（四頁）+ 0.60 = ×1.92**，不是清空後的 ×1.60。 |
| ④ | 「效果 ×1.60」（該次） | **接下來 3 秒內**的輸出 | `applyBuff` 是一段時間窗，引擎沒有「只放大這一次施放」的界。3 秒一定涵蓋觸發它的那一發（hook 在施放那一刻發射、傷害之後才落地），但同一段時間內的其他輸出也吃得到。 |

### 沒有落差、確認正確的部分

- 「最多 4 頁」= `stackKey:"gospel-page"` + `maxStacks:4` + `statusId:"gospel-page"`，
  標記與數值是**同一份來源**（G10），所以 `condition.status.minStacks` 問得到的層數
  就是頁數，⛔ 不是兩本帳。
- 「四頁**後**下一個技能」= 三個既定未來的 effect 排在「加一頁」**前面**，所以湊滿第 4 頁
  的那一發不會自己觸發。這是順序決定的語意，⛔ 不是註解。
- 「返還 50% 剩餘冷卻」= `modifyCooldown` `mode:"reduce"` / `basis:"remaining"` / `who:"self"` /
  `slot` 指自己那一格。⭐ 時序驗過：`abilitySystem` 是**先**寫 `inst.cooldownRemainingTicks`
  才 `fireHooks(onAbilityCast)`，所以 hook 跑的時候那一格已經在轉，`remaining` 讀得到真的量
  （`modifyCooldown` 的 `if (inst.cooldownRemainingTicks <= 0) continue;` 不會把它擋掉）。
- 三條 hook 各自指名自己的 slot，是因為 `modifyCooldown` **必須**指名 slot 而 hook payload
  讀不到「剛剛放的是哪一格」。
- R 不在表上：`fireHooks(world, caster, "onAbilityCast", …, slot)` 對 R 也會發，但三條 hook
  都有 `abilitySlot` 閘，所以只有 Q/W/E 通得過。



## spear-of-lightning —— 2026-08-18 二次修正全文

[裝填]「每移動 3 距離獲得 1 層」⚠️ **降級①（G10 缺口）**：引擎**沒有移動距離累積器**，也沒有任何條件葉問得到「這一 tick 有沒有在移動」（`condition.stat` 的 moveSpeed 讀的是屬性值，不是速度向量）。⇒ 降級成 **`onInterval` + `internalCooldown: 1.5`（每 1.5 秒 1 層）**。⛔ 代價要講清楚：**站著不動也會裝填**，正好與原設計「用移動換火力」的取捨相反。G10 上線後把這一條的 `on` 換掉即可，其餘不用動。
「最多 5 層」= `maxStacks: 5`，而且**不填 stackKey**（複利路徑），因為文案給的是「×1.10、五層約 ×1.61」= 1.1^5 —— 判準見簡報。⚠️ 但見降級③：這一族的乘法在引擎裡仍然是加的。
「本回合」語意：`permanent: true` + `permanentScope: "round"`，⛔ 不猜秒數（回合長度是相位機決定的）。
[爆炸]「下一次普攻或技能命中英雄時」= passive[1]（`onBasicAttack`）與 passive[2]（`onAbilityHit`），兩條都帶 `victim: "enemyChampion"`（打小怪不引爆）。
⚠️ **降級②**：「**消耗全部層數**」寫不出來 —— 引擎沒有「清掉自己某一份增益」的效果。`dispel` 是範圍＋極性導向的，要用它就得把裝填標成 `dispellable: true`，那等於讓**敵人**也拔得掉這件寶具的層數。⇒ 降級成 **爆炸帶 3 秒內部冷卻、層數不被消耗**（照 `onInterval` 的節奏自然停在 5 層上限）。
⚠️ **降級③**：「每層使該爆炸 ×1.10」= 裝填層帶的 `outputDamagePct flat 0.1`。輸出倍率三兄弟的語意是**加成**（0 = ×1）而不是乘區，`pctMult` 對一個基底為 0 的屬性是 0 —— 所以 5 層是 **×1.50**，不是文案的 ×1.61。⛔ 沒有靜默改數字：要 ×1.61 得改成 flat 0.122，那會讓「每層 ×1.10」這句話變假，所以留在 0.1。
⚠️ **降級④**：`outputDamagePct` **沒有 scope**，所以裝填期間**所有**傷害都 ×(1+0.1N)，不只爆炸。
⚠️ **降級⑤（G8 缺口）**：「範圍 +10% 每層」寫不出來 —— `damageArea.radius` 是一個固定數字，沒有隨層數縮放的形狀。⇒ 固定半徑（`radiusTier: "中"`，後台 `config.aoe-tiers@1` 可調；同時填的 `radius: 4` 是級別關掉時的退路）。

⭐ 2026-08-18 逐句稽核（第一·五守則「不放任何無效說明」）—— 這一支的五個降級**全部只寫在這裡**，而玩家讀到的還是原設計。實作零改動，卡面整段重寫：
① 「每移動 3 距離」→「戰鬥中每 1.5 秒」。G10 沒有移動累積器；`IntervalHookSystem` 決策 2 只在 `combatActive` 發射，所以「戰鬥中」是真的閘不是修辭。⛔ 舊卡面教玩家跑步換火力，而實作站著不動一樣裝填。
② 「消耗全部層數」→「層數不會被消耗」，並寫出真正的節流閥（普攻／技能兩條 hook **各自** 3 秒 ICD）。
③ 「每層使該爆炸 ×1.10、五層約 ×1.61」→「使你造成的**所有**傷害 +10%，五層 ×1.50」。兩個錯一起修：`outputDamagePct` 是**加成**（base 0，只有 flat 動得了）⇒ 5 層是 ×1.50 不是 1.1^5；而且它**沒有 scope**，`damage.ts` 對這個來源的**每一發**封包都乘（普攻、技能、DoT 全部），⛔ 不只爆炸。
④ ⛔ **刪掉**「範圍 +10%」——零實作（G8）。
⑤ 補上爆炸自己的數字（150 + AP×0.6、魔法、中範圍）——那是真的存在而舊卡面**一個字都沒寫**的效果，`includeOrigin: true` 所以被命中的英雄本人也吃。
⭐ 2026-08-18 二次修正（同上規則）：S2c「範圍 +10% 每層」原本被整句刪除。隨層數縮放的 AoE 半徑引擎沒有（G8），所以換成同屬性的等價鉚點：[感電] 兩個爆炸 hook 各追加 `applyStatus: paralysis` 0.75 秒。⚠️ 這**不是**原設計的意思（原本是變大，現在是變黏），選它是因為雷＝麻痺在主題上對得起來，而且它是**真的會發生**的事。⛔ 0.75 秒是我定的平衡值，不是 owner 的數字。

---

## 殺豬刀 `godie-i06g` —— 2026-08-18 雙向稽核附錄

⚠️ **為什麼寫在這裡而不是 JSON**：這一件的 `authoringNote` 是 **1992 / 2000 字**，塞不下下面這段。
⛔ 依 owner 2026-08-18「**應該是先備份原本內容成另一份檔案，不應該直接壓縮取代**」，
JSON 裡的原文**一個字都沒有被剪掉**（只把一句已經過期的 ENTITY_FLAG 敘述換成較短的正確版本），
新增的稽核結論放這裡。

### 描述 → JSON（五句全部有實作）

| 卡面 | 實作 |
|---|---|
| 攻擊力+37 | `modifiers ad flat 37` |
| 防禦+13 | `modifiers armor flat 13` |
| 攻擊速度+30% | `modifiers as pctAdd 0.3` |
| [變形] 專殺畜牲，7%機率將敵人變成食材，無法動作 | `passive[0]`：`onBasicAttack` + `chance 0.07` + `victim:"any"` + `applyStatus{statusId:"ingredient", duration:0.3, stun:true}` |
| [格擋] 30%機率 抵擋致命一擊(超過現存生命的傷害) | `block{damageTypes:[physical,magic,true], chance:0.3, fraction:1, lethalOnly:true, internalCooldown:1}` |

### JSON → 描述（兩個「給了但不說」，都是**負向**的，要 owner 裁決）

1. **[變形] 帶著 `internalCooldown: 3`，卡面沒寫。** 0.3 秒控場 + 3 秒 ICD ⇒ 上線率上限 10%，
   而卡面只說「7%機率」。3 秒是實作當時的保守值，**不是 owner 給的數字**（原 note 已載明）。
   ⇒ 兩條路：① 卡面補「(冷卻3秒)」；② 拿掉 ICD 讓 7% 是字面值。⛔ 兩個都要動 owner 的東西
   （前者動 `legendary49OwnerText` 基準，後者是平衡決定），所以本輪都沒做。
2. **[格擋] 帶著 `internalCooldown: 1`，卡面沒寫。** 這一格是 owner 2026-08-01 自己裁的，
   所以它是「已決定但沒印在卡上」，嚴重度低於第 1 條。

### 已修正的過期敘述（第三守則）

原 note 寫「championForm 換不了別人的模型⋯要做需要一格 ENTITY_FLAG（**只剩 32768 一格**）」。
`ENTITY_FLAG_FREE_BITS` 現在是**空陣列**（`packages/shared/src/protocol/schema.ts`，16 顆 bit 全部用光），
所以那句話的結論（不花掉那一格）還在，但**前提已經不成立** —— 那條退路整條沒有了。
JSON 裡已改成正確版本，長度比原句短 6 字，⛔ 沒有刪掉任何其他內容。

### 仍然缺的（登記，不當場修）

「變成食材」**沒有視覺**：玩家看到的是既有的暈眩表現。要真的換模型需要
（a）一格 ENTITY_FLAG（**沒有了**）、（b）加寬 `EntityState.flags`（`defineTypes` append-only）、
或（c）一條新的狀態視覺事件流 + 客戶端消費者。⇒ 引擎工作，不是內容工作。


---

## `ultimate-mod-shiranui` 終極魔改・不知火 —— 2026-08-18 第一輪 authoringNote（被第二輪取代，逐字保留）

> 取代原因：第二輪替 14 個 `applyStatus` 補上真的會被讀的機制欄位（原本 14 個一格都沒有），
> 卡面與備註整段重寫。**知識不可以無聲消失**（CLAUDE.md 第一·五守則）。

```
【owner 2026-08-18 裁決】「**提高攻速上限至10 另外攻擊附加全部負面效果就好**」。

[上限突破] = `as capRaise 10.0`（絕對高度，⛔ 不是 capRaisePct）。
⭐ 這一條在此之前是**三條無效宣稱**：原本對 `ad` / `as` / `critDamage` 各掛 `capRaisePct 0.5`，而 `ad` 的 `unlocked === base`、`critDamage` **根本不在 `config.stat-caps@1` 裡**（`capFor` 對未列出的屬性回 `base === unlocked`）—— 兩條逐位元等於不存在。只有 `as` 真的解得開（4→10），所以現在只剩它，而且照 owner 的話直接抬到硬上限 10。

[萬象凋零] = `onBasicAttack` + `victim: "enemyChampion"` → 14 個 `applyStatus`，各 1 秒。
⚠️ 名單是**出貨的通用負面狀態**（`polarity: "debuff"`），⛔ 已排除 `named-variant` 那幾個（`burnstun` / `fang-stun` / `ingredient` / `omnislash-lock` / `trial-stun`）—— 那些是**別支技能專屬的 stun 別名**，借過來會讓「誰把我暈的」在戰報上指到錯的招式。
⚠️ 三段減速只留最強的 `slow40`：25/30/40 是同一件事的三份，疊上去只是三個圖示。

⚠️⚠️ **平衡後果要 owner 知道**：這一條字面上包含 `stun` / `root` / `fear` / `confusion` / `paralysis` / `numbness` 六種行動剝奪，而普攻在攻速 10 時是每秒 10 次 ⇒ 被鎖定的目標**實質上永遠無法行動**。1.0 秒是我照既有 `slow25` 的出貨值選的，⛔ 不是 owner 給的數字。要調的話最小的旋鈕有三個：時長、改成 `internalCooldown` 每 N 秒一次、或把六種行動剝奪從名單移除只留減益。

[魔改解放] / [溢出] 未動。完整沿革見 `docs/legacy/_item-authoring-notes-full.md`。
```


---

## `spear-of-lightning` 雷槍 —— 2026-08-18 前兩輪 authoringNote（逐字保留）

> 移進來的原因：第三輪要補「[感電] 掛錯位置 + applyStatus 沒有機制欄位」的說明，
> 而 `item@1.authoringNote` 有 2000 字硬上限。⛔ 原文一個字都沒有被壓縮或截斷。

```
[裝填]「每移動 3 距離獲得 1 層」⚠️ **降級①（G10 缺口）**：引擎**沒有移動距離累積器**，也沒有任何條件葉問得到「這一 tick 有沒有在移動」（`condition.stat` 的 moveSpeed 讀的是屬性值，不是速度向量）。⇒ 降級成 **`onInterval` + `internalCooldown: 1.5`（每 1.5 秒 1 層）**。⛔ 代價要講清楚：**站著不動也會裝填**，正好與原設計「用移動換火力」的取捨相反。G10 上線後把這一條的 `on` 換掉即可，其餘不用動。
「最多 5 層」= `maxStacks: 5`，而且**不填 stackKey**（複利路徑），因為文案給的是「×1.10、五層約 ×1.61」= 1.1^5 —— 判準見簡報。⚠️ 但見降級③：這一族的乘法在引擎裡仍然是加的。
「本回合」語意：`permanent: true` + `permanentScope: "round"`，⛔ 不猜秒數（回合長度是相位機決定的）。
[爆炸]「下一次普攻或技能命中英雄時」= passive[1]（`onBasicAttack`）與 passive[2]（`onAbilityHit`），兩條都帶 `victim: "enemyChampion"`（打小怪不引爆）。
⚠️ **降級②**：「**消耗全部層數**」寫不出來 —— 引擎沒有「清掉自己某一份增益」的效果。`dispel` 是範圍＋極性導向的，要用它就得把裝填標成 `dispellable: true`，那等於讓**敵人**也拔得掉這件寶具的層數。⇒ 降級成 **爆炸帶 3 秒內部冷卻、層數不被消耗**（照 `onInterval` 的節奏自然停在 5 層上限）。
⚠️ **降級③**：「每層使該爆炸 ×1.10」= 裝填層帶的 `outputDamagePct flat 0.1`。輸出倍率三兄弟的語意是**加成**（0 = ×1）而不是乘區，`pctMult` 對一個基底為 0 的屬性是 0 —— 所以 5 層是 **×1.50**，不是文案的 ×1.61。⛔ 沒有靜默改數字：要 ×1.61 得改成 flat 0.122，那會讓「每層 ×1.10」這句話變假，所以留在 0.1。
⚠️ **降級④**：`outputDamagePct` **沒有 scope**，所以裝填期間**所有**傷害都 ×(1+0.1N)，不只爆炸。
⚠️ **降級⑤（G8 缺口）**：「範圍 +10% 每層」寫不出來 —— `damageArea.radius` 是一個固定數字，沒有隨層數縮放的形狀。⇒ 固定半徑（`radiusTier: "中"`，後台 `config.aoe-tiers@1` 可調；同時填的 `radius: 4` 是級別關掉時的退路）。

⭐ 2026-08-18 逐句稽核（第一·五守則「不放任何無效說明」）—— 這一支的五個降級**全部只寫在這裡**，而玩家讀到的還是原設計。實作零改動，卡面整段重寫：
① 「每移動 3 距離」→「戰鬥中每 1.5 秒」。G10 沒有移動累積器；`IntervalHookSystem` 決策 2 只在 `combatActive` 發射，所以「戰鬥中」是真的閘不是修辭。⛔ 舊卡面教玩家跑步換火力，而實作站著不動一樣裝填。
② 「消耗全部層數」→「層數不會被消耗」，並寫出真正的節流閥（普攻／技能兩條 hook **各自** 3 秒 ICD）。
③ 「每層使該爆炸 ×1.10、五層約 ×1.61」→「使你造成的**所有**傷害 +10%，五層 ×1.50」。兩個錯一起修：`outputDamagePct` 是**加成**（base 0，只有 flat 動得了）⇒ 5 層是 ×1.50 不是 1.1^5；而且它**沒有 scope**，`damage.ts` 對這個來源的**每一發**封包都乘（普攻、技能、DoT 全部），⛔ 不只爆炸。
④ ⛔ **刪掉**「範圍 +10%」——零實作（G8）。
⑤ 補上爆炸自己的數字（150 + AP×0.6、魔法、中範圍）——那是真的存在而舊卡面**一個字都沒寫**的效果，`includeOrigin: true` 所以被命中的英雄本人也吃。
⭐ 2026-08-18 二次修正：S2c「範圍 +10% 每層」原本被整句刪除；owner 的規則是**替換**不是刪，所以換成 [感電]（兩個爆炸 hook 各加 `applyStatus: paralysis` 0.75 秒）。理由與取捨全文見 docs/legacy/_item-authoring-notes-full.md。
```


---

## `gravity-sword-black-rod` 重力劍〈黑棒〉 —— 2026-08-18 前兩輪 authoringNote（逐字保留）

> 移進來的原因：第三輪要補「[重力壓制] 的 applyStatus 沒有機制欄位」的說明，
> 而 `item@1.authoringNote` 有 2000 字硬上限。⛔ 原文一個字都沒有被壓縮或截斷。

```
⭐ owner 原文（2026-08-17，⛔ 不可以讓它消失）：「[質量解放] 戰鬥中每 0.6 秒未普攻獲得 1 層質量，最多 5 層／下一次近戰普攻傷害 ×1.18^層數，五層約 ×2.29，**並使範圍傷害半徑增加 100%**」。2026-08-18 稽核把描述改成只講真的會發生的事，逐句對照如下。

「戰鬥中」✅ **有實作，而且不是我加的** —— `systems/IntervalHookSystem.ts` 決策 2：onInterval **只在 `world.combatActive` 時發射**。（這一行以前寫「做不到」，是第三守則的形狀，已更正。）
「每 0.6 秒」= onInterval + internalCooldown 0.6（引擎的節奏就寫在 ICD，⛔ 沒有第二個叫 interval 的欄位）。⚠️ 道具來源還會再乘後台 `combat-env.itemCooldown`。
「**未**普攻」✅ **2026-08-18 補上**：passive[1] 每次普攻掛一個 0.6 秒的具名標記〔gravity-sword-recent-swing〕（applyBuff + statusId，modifiers 空 = 純標記），passive[0] 的 condition 讀 `not(status self …)`。⇒ 砍人的時候一層都長不出來，停手 0.6 秒才開始蓄。
⛔ 我先試過 `modifyCooldown{target:"hookInternalCooldown"}` 把質量那條 hook 的 ICD 往後推，**實測會漏**：`basis:"base"` 每次只往前搬「一個 ICD」，而兩次普攻之間的真實間隔略大於一個 ICD，於是推的量追不上流逝的量，每 5～6 刀還是會漏一層出來（量到 12 個週期漏 2 層）。標記法沒有這個累積誤差。
「最多 5 層」= maxStacks 5 ✅（GH#354/G1 之後複利路徑也吃得到它，用 `buff:<origin>#` 前綴數份數）。
「×1.18^層數，五層約 ×2.29」= applyBuff ad pctMult 0.18，**刻意不填 stackKey** —— 不填才是複利。實測 5 層 ad ×**2.288**，逐位對上 owner 的 ×2.29。⛔ 填了 stackKey 會被折成 1+0.18×5 = ×1.90。
「本回合內」= permanent + permanentScope:"round"（拆除點 `sim/clearPools.ts::clearRoundScoped`，由 MatchController 在回合開始呼叫）。

⚠️ 兩處仍然缺機制，**描述已改成不再承諾它們**，機制到位再改回來：
① 「**下一次**普攻⋯消耗全部層數」—— 引擎沒有「拔掉指定一份增益／用掉層數」的機制（`dispel` 是整池的、`maxTriggers` 管的是觸發器發幾次）。所以層數留到回合結束，描述改寫成「本回合內持續」。
② 「並使範圍傷害半徑增加 100%」—— Stat 裡沒有任何一條是 AoE 半徑（只有 `range` = 普攻距離），applyBuff 也改不到別支技能的 radius/radiusTier。整句從描述移除。
⚠️ 「近戰普攻**傷害**」寫成 ad pctMult：引擎沒有 basic-only 的輸出倍率，所以吃 AD 係數的技能也會一起變強。描述因此寫「攻擊力」而不是「普攻傷害」。「近戰」= requiresAttackType:"melee"（發卡限制，與其餘 6 件同慣例）。
⭐ 2026-08-18 二次修正：owner 原文的「**範圍傷害半徑增加 100%**」被前一輪整句刪除，但 owner 的規則是**替換類似效果**不是刪掉。AoE 半徑加成在 `Stat` 裡不存在（需要新機制），所以換成同一個「重力」主題、引擎**真的做得到**的鉚點：[重力壓制] —— 五層時普攻附帶 slow30／1.5 秒。⚠️ 這不是原設計的意思（原本是把傷害鋪得更廣，現在是把人黏住），選它是因為重力＝壓制在主題上對得起來，而且它會真的發生。⛔ 30%／1.5 秒是我定的平衡值，不是 owner 的數字；後台可調。
⚠️ 連帶：`gravity-sword-mass` 的 applyBuff 補上 `statusId`，否則新 hook 的層數條件讀不到它。
```

---

## 朗基努斯之槍 `godie-i018` —— 2026-08-18【淨化】`pools` 明寫的完整理由

> JSON 的 `authoringNote` 只剩 81 字額度（改前 1919/2000），所以這一段全文放這裡，
> ⛔ 原文一個字都沒有被壓縮或截斷。

### 稽核指控與**實測結論**

稽核說：`dispel` 沒填 `pools` → 走 `config.dispel@1` 的 `defaultPoolBuffs: false`
⇒ 卡面「[淨化] 普通攻擊時機率移除目標身上的增益」是空的。

逐行讀 `sim/effects/dispel.ts` + `sim/clearPools.ts` + `content/config/dispel.json` 之後，
**一半對、一半錯，而且錯的那一半比指控更嚴重**：

| 池 | 這張卡改之前 | 真相 |
|---|---|---|
| `status` | ✅ 開著（`defaultPoolStatus: true`） | **不是空的** —— `polarity:"buff"` 的 status 拔得到。出貨有 9 份 buff 極性 status（`berserk` / `bankai` / `rage` / `moon-combo` / `omnislash-perform` / `triforce-courage` / `nen-banked` / `light-wand-banked` / `grail-strengthened-projection`），其中經由 `applyStatus` 掛上的那幾支（59-00 暴走、60-03 三角力量、01-04 無雙劍舞、蒼月連擊）**今天就真的會被拔掉**（`statusDefaultDispellable` 出貨 true） |
| `dot` | ✅ 開著 | **恆為空** —— `dot` 缺席極性時 `clearPools` 當 `"debuff"`，而這一發是 `polarity:"buff"` ⇒ 逐位元不可能命中。改為明寫 `false`（而且「淨化敵方」順手清掉敵人身上的燃燒是幫敵人） |
| `shields` | ❌ 關著（`defaultPoolShields: false`） | ⭐ **這才是可以立刻兌現卡面的那一池**：護盾沒有極性也沒有 `dispellable`，`clearPools` 的門檻只有 `polarity !== "debuff"` ⇒ 寫 `polarity:"buff"` 就一定拔得到。schema 自己就寫著「要打盾就寫 `polarity:"any"/"buff"`」 |
| `buffs` | ❌ 關著 | 稽核講的那一半是對的，**但打開它今天仍然一筆都拔不到**（見下） |

### ⛔ 只把 `pools.buffs` 打開＝再造一次失敗形態②

`clearPools` 對 `buffs` 池有**三道**閘，全部要過：
① `pools.buffs === true`（文件）→ ② `dispellable`（缺席時讀 `buffDefaultDispellable`，出貨 **false**）
→ ③ `polarity` 要等於 `"buff"`（缺席＝「不知道」，⛔ 不當成「是」）。

**逐檔掃過 `content/{items,abilities,augments,champions}` 的 280 個 `applyBuff`：
`dispellable:true` 且 `polarity:"buff"` 的有 0 個。**
（26 個只寫了 `dispellable`、4 個只寫了 `polarity`、250 個兩格都沒寫。）
程式側 `attachSource` 的來源也一樣：`manaBarrier` 有 `polarity:"buff"` 但沒有 `dispellable`。

⇒ 所以 `pools.buffs:true` 是**宣告範圍**，⛔ 不是這次讓卡面成真的機制。
真正讓卡面成真的是 `shields`（＋既有的 `status`）。

### 平衡：⛔ 它不可能變成「一鍵清空對手所有裝備效果」

`itemSource.ts` / `itemSets.ts` / `draft.ts`（增益卡）/ `statPath.ts` / `abilityPassives.ts` /
`nightPact.ts` 掛上的來源 **一個都沒有寫 `polarity`**。有方向的淨化拔不到沒有極性的來源，
所以**裝備、三選一增益卡、天生技、靈氣在結構上就不在射程內** —— 即使 owner 哪天在後台
把 `buffDefaultDispellable` 打開，這件事也不會變。

實際變強幅度：10%／普攻（`chance: 0.1`，逐字來自製作書 godie-i024「10%機率淨化(法球)」），
`count: 1` ⇒ **每池最多拔 1 筆**（status 1 筆 + shield 1 片）。
被影響的護盾樣本：60-002 勇者意志（maxHealth×1．0／8 秒）、53-03 破法對咒（2600＋AP×0.6／6 秒）、
59-03 AT力場、賢者的護身符…等 13 份。近戰 1.5 刀/秒約每 7 秒觸發一次，而護盾持續 3–8 秒 ——
**會真的感覺得到，但拔的是一片限時護盾，不是對手的裝備。**

⚠️ `count` 是**逐池**計數，所以一次觸發最多「1 個增益狀態 + 1 片護盾」。要更弱就把 `count` 留給
後台全域上限或改寫這一格；要更強改 `chance`。⛔ 兩者都在這份 JSON 裡，不必動程式。

### 留給 owner 的一格決定（⛔ 我沒有自己改）

「敵方淨化拔不拔得掉 `applyBuff` 掛上的增益（例：卍解 `bankai`、呂布的層數 `rage`）」是
**設計決定**，而且它**不在這份 JSON 的權限內** —— 要嘛動全域 `config/dispel.json` 的
`buffDefaultDispellable`（會影響每一個用 dispel 的東西），要嘛逐支技能補
`applyBuff.dispellable:true` + `polarity:"buff"`（動的是別人的檔）。
⇒ 列給 owner，⛔ 不在這一條線上自己決定。

---

## 月牙魔杖 — `content/items/godie-i06e.json`

### 【2026-08-01 owner 裁定「魔抗的 % 是減傷比例」】原始 `authoringNote` 全文

> ⚠️ 2026-08-18 從 JSON 移出來的理由是**字數**（`authoringNote` 2000 字硬上限，
> 而同一天要把一句假話換成事實 —— 見下一節）。⛔ 不是因為它過時到可以丟：
> 它記錄的是 owner 的裁定與當時的推導，**測試可以跟著設計走，知識不可以無聲消失。**

```
【2026-08-01 owner 裁定「魔抗的 % 是減傷比例」】引擎的魔法減傷是 100/(100+mr)，所以 mr = 100·r/(1-r)。r=1.00（100% 減傷）需要 mr=∞，用 mr 永遠表達不出來 —— 字面上的『魔抗+100%』等於完全魔法免疫，owner 選擇不走真免疫路徑，改成一個讀得出來的數字。採用 mr 200（ITEM_MODIFIER_LIMITS 的上界，不需要動那道 mis-parse 護欄）= 66.7% 減傷，文案同步改成 66.7% 讓描述與資料一致（這一批的核心原則就是描述不可以說謊）。註：月牙魔杖這個值正好等於本批之前出貨的 mr 200，w3x 來源 AIsr『降低的傷害 0.5』則是 50%，見 docs/content/reconciliation/items.md。
```

### 2026-08-18 第三守則修正：「⇒ 走不通」是一句假話

`🔴 2026-08-18 重算` 那一段的結論原本寫著：要做到 66.7% 需要 `mr flat 1001.5`，
「遠超 `ITEM_MODIFIER_LIMITS.mr = 200` 那道 mis-parse 護欄 **⇒ 走不通**」。

**那句話會誤導下一個人放棄三條真的走得通的路**，而它引用的那道護欄自己就說了相反的話：

| 讀到的東西 | 在哪 | 說什麼 |
|---|---|---|
| `ITEM_MODIFIER_LIMITS` 檔頭 | `packages/shared/src/content/schema/common.ts`（表在 341，`MagicResist: 200` 在 **360**） | 「They bound a SINGLE modifier, not the stacked total.」而且「A legitimate item that outgrows one is a one-line change here, **made knowingly**」 |
| `refineItemModifierBand` | 同檔 420 | 簽章收的是**一筆** `{stat, op, value}`，由 `zItemStatModifier` 逐筆 `superRefine` |
| `item@1.modifiers` | `schema/item.ts:379` | `z.array(zGatedItemStatModifier).optional()` —— ⛔ **沒有唯一性約束** |
| `resolveGatedModifiers` | `sim/content/requirement.ts:368` | 逐筆 push，⛔ 不依 stat 去重 |
| `statPipeline` 折疊 | `sim/stats/statPipeline.ts` | `flat += m.value * stacks`，同一份來源裡的多筆同 stat 全部累加 |

⇒ 所以實際有**四條**路，不是零條：

1. **改文案**（把卡面的 66.7% 改成量到的 28.6%）—— 最便宜，但 description 被
   `legendary49OwnerText` 逐位元釘住，要 owner 核准並同步 fixture。
2. **調後台 `combatEnv.magicResistMult`**（出貨 0.2，`content/config/combat-env.json`）——
   ⚠️ 這是**全域**的，會動到每一件魔抗裝與每一位英雄的基礎魔抗。
3. **拆成多筆 `mr flat`** —— 六筆 200 = 1200，逐筆都在 band 內，資料上直接寫得下。
   ⚠️ 商店預覽/codex 會照樣加總，所以顯示不會說謊；但一件道具寫六筆同一條屬性
   是給讀者看的噪音，這條是「能不能」的證明多於「該不該」。
4. **抬 band**（`MagicResist: 200` → 更大）—— 檔頭自己把這稱為既有慣例
   （`CritDamage` 就是這樣從 5 抬到 50 的）。

⛔ **2/3/4 都是 owner 的平衡決定，2026-08-18 這一輪一條都沒做。**

---

## 禰豆子的木箱 ([EX∅ 根源], L4) — `content/items/nezuko-box.json`

> JSON 的 `authoringNote` 只留摘要 + 這個指標（2000 字上限）。逐句對照的全文在下面。

### 這件寶具的來歷

owner 2026-08-18 那份 **15 件 [EX∅ 根源]** 清單的第 3 件。它與另外 4 件一起被擋在池外，
理由逐字寫在 `content/loot-tables/ex-origin-weapons.json` 的 `note`：
「禰豆子的木箱 —— 需要『背負／附著移動 + 不可選取』」。
這一版把那個機制做出來了（`sim/carry.ts` + `sim/systems/CarrySystem.ts` +
`sim/effects/carry.ts` + `sim/systems/MovementSystem.ts` 的四個豁免點），
所以這件寶具第一次有內容。

### 逐句對照（卡面 4 句 ↔ JSON，兩個方向都讀過）

| 卡面 | JSON | 備註 |
|---|---|---|
| 「每 12 秒」 | `passive[0].on = "onInterval"` + `internalCooldown: 12` | ⚠️ `onInterval` **只在 `combatActive` 時發射**，所以商店／回合之間不會偷跑。⚠️ 道具來源的 ICD 還會再乘後台 combat-env 的 `itemCooldown`（全 repo 一致的既有行為，不是這件的特例） |
| 「身邊」 | `shape:"circle"` + `radiusTier:"中"` | ⭐ 卡面**不寫半徑數字**（owner 2026-08-11「原則上不寫範圍數字」）。`radius: 4.5` 填的就是「中」級距**自己的出貨數字**，⛔ 不是我另外挑的 —— 級距在註冊時會贏過它（`content/aoeTiers.ts::resolveRadiusTier`），寫它只是為了通過 `refineDispelShape`（circle 一定要有 radius，否則執行期 `radius ?? 0` 直接 return ＝ 動畫演完什麼都沒發生）。⚠️ 半徑再乘 combat-env 的 `abilityRange` |
| 「生命低於 25% 的 1 名隊友」 | `victimCondition`（hp percent `<` 0.25）+ `maxTargets: 1` + `side:"allies"` | ⭐ 名額的刀在**過濾之後**才下（`selectVictims` 的 `qualified` 語意）⇒ 這句話讀作「殘血的隊友裡最近的那一個」，⛔ 不是「最近的那一個如果剛好殘血」 |
| 「收進箱子 6 秒」 | `durationSec: 6` | 絕對 tick 到期，上界 `CARRY_MAX_SEC` = 30 |
| 「跟著你走」 | `CarrySystem` 每 tick 把乘客座標從載具重建 | 排在 `movementSystem`(5) **之後**（排前面就是慢半格的抖動） |
| 「自動索敵、殭屍仇恨、右鍵點名都選不到他」 | `untargetable` 的前三根軸 | 閘下在 `sim/targeting.ts` 的 `targetClassOf` / `isMobTargetable` / `isManuallyTargetable` **三個謂詞**上 —— 那是該檔驗屍報告要求的位置（一個謂詞、每個 picker 都走它），⛔ 不是各 picker 各寫一份 |
| 「範圍技能仍然打得到箱子裡的人」 | `abilityAoe: false` | ⚠️ **這一句是刻意寫上卡面的**：不寫的話玩家會把「不可選取」讀成「無敵」，而那正是第一·五守則要防的反向謊話 |
| 「回復他 25%最大生命」 | `onHitTargets` 的 `restore{healthPct:0.25}` | 收到的目標是**真的上車的那群人**（`runOnHitChain`），⛔ 不是上游交下來的震央。⚠️ 回復量再乘 combat-env 的 `healing` |

反向也讀過：JSON 裡**沒有**任何一條效果是卡面沒講的。

### ⚠️ 與 owner 原文哪裡不一樣、為什麼

1. **原文的逐字內容這一輪拿不到。** L4 這條 lane 手上只有 loot-table `note` 那一句
   機制摘要。⇒ 上面**四個數字（12 秒／25% 門檻／6 秒／25% 回復）與「中」級距是我提的
   初值，不是 owner 裁決過的**。它們全部是後台可調的資料（hook 的 ICD、條件葉的
   `value`、`durationSec`、`healthPct`、AoE 級距），⛔ 改它們不需要動任何程式。
   **請 owner 過目這四個數字。**
2. **「附著移動」做成了「複製座標」。** 乘客每 tick 被寫成載具的位置，⛔ 沒有做成一個
   掛在骨骼上的附著點（那是渲染層的事，sim 沒有骨骼）。畫面上的差別是乘客與載具
   **完全重疊**而不是背在背上；要真的背在背上需要客戶端一條 attach 通道，
   ⛔ 不是這張卡自己給得起的。
3. **`onCarrierDeath` 走預設 `release`**（載具一倒，乘客立刻下車、立刻恢復可選取）。
   另一個成員 `drop` 在引擎裡的語意是「留在倒下的箱子裡直到時間走完」——
   ⚠️ 那是「跟著倒」在**沒有『被擊倒』這個機制**的引擎裡最接近的一件事，
   ⛔ 它不會讓乘客受傷或死亡。這件寶具沒有用到它，依第〇·六守則那條路**不測**。
4. **沒有 icon。** `content/assets/icons/items/nezuko-box.webp` 還不存在，而 `icon` 是
   選填欄位 —— ⛔ 我沒有指一個不存在的檔（那會在商店卡上變成一張破圖，
   也就是另一種「說了但不會發生」）。上架前補一張圖，然後把 `icon` 加回來。
5. **這件還沒進 `ex-origin-weapons` 的 `entries`。** 那張表由收尾那一位一次補 5 件
   （5 條 lane 各改一次＝逐字衝突）。⇒ 在那之前它抽不到，⛔ 這是刻意的分工不是漏做。

### ⛔ 引擎側這一輪**沒有**接上的一根軸

`untargetable.abilityAoe: true` **今天不會生效**。唯一的閘點是
`sim/abilities/abilitySystem.ts::enemiesInCircle`，而那個檔這一輪由 L1（反向嘲諷）
獨佔。謂詞 `carryBlocksAbilityAoe` 已經在 `sim/carry.ts` 匯出，接上只要一行。
⚠️ 出貨的這張卡填的是 `false`（＝今天的行為），所以**卡面沒有說謊**；
但一份把它填成 `true` 的 JSON 現在是一格空欄位。
