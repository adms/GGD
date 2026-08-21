# 被 2026-08-21「屬性額外傷害 → AP 百分比」換算取代的知識

> ⭐ **測試可以跟著設計走，知識不可以無聲消失**（CLAUDE.md 第一·五守則 · 第〇·六守則）。
> 這一份存的是被 `pnpm apconv:build` 取代、而**現在已經不可能成立**的斷言與豁免，
> 以及它們**守過什麼**。

## 裁決（owner 2026-08-21，逐字）

> 「檢查所有技能 原本有屬性額外傷害的部分**都換成 AP**，
>  **乘數幾倍屬性 變成 1/4 百分比**，例如**原本 力量*4 => AP *100%**
>  但取**百分比整數**例如 10/20/30/40/50/60/70/80/90/100/110/120/130/140%…」

> 「請記得**全部都要用 script 推導生成 JSON** 喔」

規模：**58 支技能 / 74 條宣稱**（其中 16 條是互斥的**條件加成**，⛔ 沒有加總）。
逐支對照表由 `pnpm apconv:plan` 產生（`docs/技能AP換算計畫.md`）。

---

## ① `leapJassFidelity.test.ts` —— 07-03 列、在、前 的 `ad×0.5`

| 舊斷言 | 現在 |
|---|---|
| `const BASE_DAMAGE = BASE_FLAT + TEST_AD * 0.5;` | 從出貨文件的 `ratios` **現算**（今天是 `ap×0.5`，而夾具沒有 ap ⇒ 這一項是 0） |

**它守過什麼**：那一發落地 AoE 的**總額**。
⚠️ 但這條測試真正承重的是**時序** —— 「連擊窗在施法當下被烘進去，之後窗關了也照付」
（j:34189 / j:34440）。那一半**一個字都沒有放寬**，而且它與係數掛在哪條屬性上無關。

**為什麼 `ad×0.5` 可以被換掉**：它**不是 JASS 讀出來的**。
`abilityScaling.test.ts` 的檔頭逐字寫著這批係數的來源：

> The scaling model (applied to content + emitted by tools/w3x-import):
> coeff proportional to the ability's own base (0.003/point of base damage)

⇒ 它是匯入器**合成**的比例值；卡面上真正的宣稱是「(力量*2)+450」，
而那一條在換算之前**從來沒有被實作過**（第一·五守則的空宣稱）。

---

## ② `fieldAdoption.test.ts` —— `amount.attrRatios[]` 的三列豁免

`pnpm apconv:build` 把 01-04 超究武神霸斬（唯一一支用 `attrRatios` 表達
「屬性額外傷害」的技能）換成 `ratios[{stat:"ap"}]`，於是整棵 `amount.attrRatios`
的 reach 從 2 掉到 **1**，低於 `MIN_REACH 3` ⇒ 普查不再對它宣稱任何事，
三列豁免變成三句謊話而被刪除。**它們的內容逐字保存在這裡**：

```ts
"enum:abilities.effects[]#chainLightning.amount.attrRatios[].attr=agi": {
    status: "debt",
    why: "**移植覆蓋率的缺口,不是壞掉的程式**。`resolveScaling` 對 agi 與對 str 走同一行,所以寫上去就會生效;零的原因是目前只有兩支技能用 `attrRatios`,而它們的 JASS 都讀 `bj_HEROSTAT_STR`(龍神槍 godie-i018「傷害 = 總力量」、01-04 超究武神霸斬「+STR×等級」)。原作裡確實有讀 AGI 的招式(例如 蒼月潮 07-00 的敏捷門檻),只是還沒有一支被改寫成「傷害隨敏捷成長」。記成 debt 而不是 default-live,是因為零在這裡**不是**因為有一個更好的預設值 —— 它單純代表「還沒移植到」,而那是一件要做的事。",
  },
"enum:abilities.effects[]#chainLightning.amount.attrRatios[].attr=int": {
    status: "debt",
    why: "同 `attr=agi`:程式路徑共用、寫上去就生效,零的原因是兩支用 `attrRatios` 的技能在 JASS 裡讀的都是力量。智力在 GGD 走的是 `ratios[{stat:\"ap\"}]`(combat-env `intToAbilityPower` 把智力折進 AP),所以「智力係數」今天有兩種寫法而只有一種被用;哪一種才是對的要看被移植那一支的 JASS 讀的是 `bj_HEROSTAT_INT` 還是法術傷害欄位 —— 在有第一支這樣的技能之前不要替它決定。",
  },
"enum:abilities.effects[]#chainLightning.amount.attrRatios[].basis=base": {
    status: "default-live",
    why: "缺席 = \"total\"(`sim/effects/effect.ts` 的 `resolveScaling`:`attrs(r.attr, r.basis ?? \"total\")`),對應 Blizzard 的 `GetHeroStatBJ(…, true)` = 含裝備。兩份寫了 `attrRatios` 的出貨文件(龍神槍 godie-i018 的 on-hit 閃電、GH#250 的 01-04 超究武神霸斬 終結段)在 JASS 裡讀的都是 `true`,所以兩份都明寫 \"total\"。\"base\" 對應 `GetHeroStatBJ(…, false)`,原作**確實用過**(蒼月潮 07-00 獸化心靈 的 120 敏上限),只是那一支走的是 `grantAttribute.maxAttributeBasis` 而不是 `attrRatios`。所以這一格的零是「沒有一支用 attrRatios 的技能需要不含裝備的讀法」,不是機制沒接上。",
  },
```

⚠️ 唯一還在用 `attrRatios` 的是龍神槍 `godie-i018`（on-hit 閃電，讀**總**力量）——
它**沒有**被換算：那是道具被動，卡面沒有「力量*N」那種宣稱。

---

## ③ `abilityScaling.test.ts` fx-16 —— 「物理 ⇒ 係數必須是 `ad`」

| 舊規則 | 現在 |
|---|---|
| `damageType === "physical"` ⇒ 係數的 stat **必須**是 `ad` | 物理技能**在卡面自己寫了 `N% [AP]` 時**才可以是 `ap`（`ad` 仍然合法） |

**為什麼不是改 `damageType`**：減傷走 `damageType`（護甲 vs 魔抗），
把 19 支物理技能改成魔法是一次 **owner 沒有要求的平衡變更**。
⇒ 出貨開關 `physical: "keepDamageType"`（`tools/ap-conversion/knobs.json`）。

**為什麼不是一張豁免名單**：名單會腐爛。新規則問的是**這一支技能自己的說明**，
所以兩個方向都會紅 —— JSON 偷偷改回 `ad` 而卡面還寫 `[AP]` → 紅；
卡面被改掉而 JSON 還吃 `ap` → 紅。

---

## ④ 卡面上被取代的**原文**

⛔ 一個字都沒有被銷毀：`tools/ap-conversion/claims.json` 是**換算前**那一刻的
逐支快照（原始 `description` + 抽出來的屬性宣稱 + 每一格酬載原本的 `ratios` /
`attrRatios`）。它是產生器的**輸入**，而且

```bash
# 把 tools/ap-conversion/knobs.json 的 enabled 改成 false，然後：
pnpm apconv:build
```

會把原文與原係數**逐位元寫回去** —— ⭐ 一個指令回到 2026-08-21 之前，
⛔ 不是「這次不做」。

---

## ⑤ ⚠️ 還沒有實作的那 16 條（**換算沒有製造它，也沒有修好它**）

74 條宣稱裡有 **16 條是條件加成**（「點選三刀流持續期間」「30 級之後」
「超級賽亞人狀態」…）。它們在換算**之前**就沒有任何 JSON 支撐，換算之後
仍然沒有 —— 換的只是單位（`力量*3` → `80% [AP]`）。

⛔ 這是**既有**的第一·五守則違規，⛔ 不是這一批造成的，
而它需要條件葉（`condition.*` / `ability-augment@1`）才做得完 —— 那是另一批。
清單見 `docs/_data/ap-conversion-plan.json` 的 `stacking: "conditional"` 那幾列。
