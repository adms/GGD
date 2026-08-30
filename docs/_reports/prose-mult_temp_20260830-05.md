# #648 第五個阻塞點：`damageRanks` 讀 `Scaling.mult`

2026-08-30 · lane「prose-mult」· 檔案柵欄：`abilityProse.ts` / `abilityProse.test.ts` /
`periodicFieldTemplateWiring.test.ts` / `templateFamiliesAreAdopted.test.ts` /
`periodicFieldAdoptionBlocker.test.ts`

---

## 1. 基線（⛔ 動任何東西**之前**量的）

```
abilityQuantities({effects:[{kind:"damage",damageType:"magic",amount:{flat:100,mult:0.5}}]}).dmg
  ⇒ ["100"]          ⭐ 應該是 ["50"]
{ perRank:[100,200], mult:0.5 }  ⇒ ["100/200"]   ⭐ 應該是 ["50/100"]
{ flat:100 }（無 mult）           ⇒ ["100"]        ✅ 對
```

⇒ 上一輪的診斷**逐字成立**：`mult` 被完全忽略。

## 2. 改了什麼

`abilityProse.ts::damageRanks` —— `flat`/`perRank` 解算完之後乘上 `mult`
（與 `sim/effects/effect.ts:469` 的 `resolveScaling` **同一個順序**：整份酬載最後才乘）。

| | |
|---|---|
| 缺席 | `pos(o.mult) ?? 1` ⇒ ×1，⭐ **逐位元同這一格出現之前** |
| 非正數 | 沒有過 schema（`positive().max(20)`）⇒ 當成缺席，⛔ 不是當成 ×0 |

## 3. 驗收（⭐ 餵一個帶 `mult` 的葉子，印出來的數字有乘上它）

`abilityProse.test.ts` 新增「⭐ mult 乘進 `{{dmg}}`」：

```
{flat:500, mult:1/5}   ⇒ ["100"]      ← 週期領域：整段 500 ÷ 5 發
{flat:100, mult:0.5}   ⇒ ["50"]
{perRank:[1000,2000], mult:0.1} ⇒ ["100/200"]
{flat:100}             ⇒ ["100"]      ← 缺席 ⇒ ×1
{flat:100, mult:0}     ⇒ ["100"]      ← 非正數 ⇒ 當成缺席
```

**突變紀錄**：`damageRanks` 的 `* mult` 兩處都拿掉 → 這一條紅
（`expected [ '500' ] to deeply equal [ '100' ]`）→ 用 `Edit` 改回（⛔ 不是 `git checkout`）。

### ⛔ 為什麼**不能**拿守衛③代替這一條

`periodicFieldTemplateWiring.test.ts` 的③是
`expect(adopters.length === 0 || proseSeesMult).toBe(true)` ——
⭐ 而今天 **adopters = 0** ⇒ 它**恆真**，拿掉 `* mult` 也不會紅。
那正是 CLAUDE.md 記的 🟢 假綠燈⑩「**守衛是靠缺陷（前提）才綠的**」。
⇒ 新的那一條沒有任何前提，它是這次改動**唯一**的承重守衛。

## 4. ⛔ 我沒有刪掉 `AWAITING_CONTENT["tpl-periodic-field"]` —— 交辦的前提不成立

交辦說「順手把那一列刪掉（棘輪只能變短）」。⭐ 量到的：

```
grep -rl '"tpl-periodic-field"' content/abilities content/items content/augments  ⇒ 0
```

`templateFamiliesAreAdopted.test.ts` 有**兩條方向相反**的斷言：

| 斷言 | 它要什麼 |
|---|---|
| ①「零引用的家族一定要在豁免表裡帶理由」 | 0 引用 ⇒ **必須有**那一列 |
| ②「豁免表只能變短」 | 有引用 ⇒ **必須刪掉**那一列 |

⇒ 今天 0 引用，**刪掉那一列會讓①紅**（而且是為了錯的理由紅）。
⭐ 正解是把那一列的**理由寫準**，⛔ 不是刪掉它：現在它逐字記著
「引擎與說明側都通了；38 支內容批還沒套用」＋ 指名兩個 commit，
⇒ 下一輪讀得到「⛔ 不要重做機器側」。**接上任何一支內容，②就會叫下一個人刪它。**

## 5. ⚠️ 這次改動**修不到**的那一半（誠實列出來，已配閘）

一格若**同時**帶 `mult` 與 `ratios`/`attrRatios`，卡面手打的「+180% [AP]」那一段
**不會**跟著乘 —— 那一段沒有佔位符，全專案沒有東西代得了它。

⇒ 新增閘「⛔ 出貨語料裡沒有任何一格同時帶 mult 與係數」（掃 `abilities` + `champions`）。
出貨語料今天 **0 個**：4 個 `mult` 節點（`godie-nbbc.r` / `godie-n01c.r` ＋ 兩份英雄鏡像，
全部是 `{mult:10, damageTier:"小"}`）都只帶級距。
⭐ 反駁方式：真的需要那個組合時，把係數那段也做成佔位符，然後刪掉這條閘。

## 6. ⚠️ 撞到的（⛔ 沒開新票，寫在 #648 留言）

**`abilityProse.test.ts` 的③今天是紅的，而且與這次改動無關 —— 已量。**

```
godie-o02p.r（99-04 世界第一的公主殿下）：「100點傷害」→ JSON 這一軸是 200
```

⭐ **證明它是既有的紅**：把 `abilityProse.ts` 與 `.test.ts` 都換成 `HEAD` 那一份再跑
⇒ **同一條、同一行（:233）一樣紅**（`1 failed | 5 passed`），然後換回我的版本。
（機制上也對得起來：那一格**沒有 `mult`**，而 `pos(undefined) ?? 1` ⇒ ×1。）

⚠️ ⛔ **我沒有把它加進 `KNOWN_UNBINDABLE` 讓自己的跑分變綠** ——
那是「靠放寬閘收紅燈」，⛔ 不是修好。

⭐ 而它其實是 **#648 的內容批本身**：那一支是**手寫的**週期領域
（`delayed` + `count:4` + `intervalSec:1` + `targetMode:"reresolve"` + `anchor:"caster"`，
傷害葉 `{damageTier:"極小"}` **沒有 mult** ⇒ 每一發都吃滿級距 ＝ 整片是預算的 4 倍）。
⇒ 它正是要被 `tpl-periodic-field` 取代的形狀，修法在**內容側**（下一條 lane），
⛔ 不在文案這一側。

## 7. 其他

- `packages/shared/scripts/_tmp879_probe.ts` 是**別的 lane 的未追蹤暫存檔**（`??`），
  `tsc` 上有兩行錯誤。⛔ 不在我的柵欄、⛔ 沒有動它。
- 跑過的閘：`abilityProse` · `periodicFieldTemplateWiring` · `templateFamiliesAreAdopted` ·
  `periodicFieldAdoptionBlocker` · `descriptionClaims`（全綠，除了第 6 節那一條既有紅）。
  `tsc -p packages/shared`：我的三個檔零錯誤。
- ⛔ 沒跑 `pnpm test` 全套、⛔ 沒跑 `skills:sync`（全域鎖）。
