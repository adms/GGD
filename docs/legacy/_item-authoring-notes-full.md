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

