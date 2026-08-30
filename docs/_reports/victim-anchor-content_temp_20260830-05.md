# GH#809 內容側翻譯 —— 受擊者骨頭錨定（`spawnVfx.boneOn:"victim"`）

> 2026-08-30 · lane 報告（機制已由 `5b31269c7` 出貨，這一輪只做**內容側翻譯**）
> ⚠️ 用詞紀律：本文所有「已接上」一律指**鏈路已接上、⛔ 未驗收**（沒有終端像素證據）。

---

## 0. 一句話

⭐ **出貨內容裡真正翻得動的，量到只有 1 個節點** —— `godie-hart.r`（01-04 超究武神霸斬）
每一刀打在受擊者胸口的雷擊。它已經改成 `at:"bone" + attach:"chest" + boneOn:"victim"`，
`fieldAdoption` 普查因此從 **0/80 → 2/80**（含英雄卡鏡像），
而 `enum:…boneOn=victim` 是 **2/2 = 100%**。

⛔ **這不是「只做了一支」的偷懶，是量出來的天花板** —— 見 §2。

---

## 1. 基線（動手之前跑出來的，⛔ 不是複述票文）

| 量的東西 | 值 |
|---|---:|
| `content/abilities/` + `content/champions/` 的 `spawnVfx` 節點總數 | **67 + 46** |
| 其中 `at:"bone"` | **1**（`godie-hart.r` 的 `godie-herocloudkfksword-p0` @weapon） |
| 其中 `boneOn` 出現次數 | **0** |
| `at` 分佈（abilities） | `point` 36 · `self` 17 · `target` 13 · `bone` 1 |

⇒ 動手前 `grep -rn '"boneOn"' content/` = 0 筆（唯一命中的 `content/editor-target-profile.json`
是產物裡的契約欄位表，⛔ 不是內容採用）。

---

## 2. 母體重量：⭐ 票文的 124、機制 commit 的 92，兩個都不完整 —— 實測 **144**

用**括號＋引號**配對切參數（⚠️ `"hand,right"` 這種逗號寫法會讓天真的正則把第二個參數切錯）
重掃 `tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j`：

| | 次數 |
|---|---:|
| `AddSpecialEffectTargetUnitBJ` 全部 | **317** |
| 第二參數 `GetEnumUnit()` | 83 |
| 第二參數 `GetSpellTargetUnit()` | 9 |
| ⇒ 機制 commit 報的「明確錨在受擊者」 | **92** |
| ⭐ **加上「只會被指派成受擊者的 `udg_` 別名」** | **+52** |
| ⇒ ⭐ **受擊者錨定實測總數** | **144** |

⭐ 別名怎麼判的（⛔ 不是憑名字猜）：掃全檔的 `set udg_X = …`，
只有當 **X 的每一次指派**都來自 `GetSpellTargetUnit()` / `GetEnumUnit()` / `GetAttackedUnitBJ()`
時才算 —— 44 個變數過關，其中 21 個真的被 `AddSpecialEffectTargetUnitBJ` 當第二參數用過。
最大宗：`udg_KOFCaster` 12 · **`udg_FF7_CastedUnit` 7** · `udg_BleachCaster` 4。

⚠️ ⭐ 這一段**修正了票文與機制 commit 的兩個數字**，而它們的方向是一致的
（都低估）—— ⛔ 缺口沒有變小，只是量得更準。
⚠️ 而 `GetTriggerUnit()` 那 96 次仍然**沒有併進來**：它在施法觸發器裡是施法者、
在傷害觸發器裡是受擊者，要逐支看觸發器註冊才分得出邊。⛔ 不為了把數字做大而併。

掛點分佈（144 次）：`chest` 佔壓倒性多數，其餘 `origin` / `overhead` / `head` / `hand` / `weapon` / `body`。

---

## 3. ⭐ 為什麼「翻得動的只有 1 個」—— 三道獨立的收斂，⛔ 不是我挑的

### ① 內容裡根本沒有幾個 `spawnVfx`

全出貨 422 支技能 + 71 張英雄卡，`spawnVfx` 節點合計 **113**（含鏡像）。

### ② 用**模型名**對帳（⛔ 不是靠印象），只有 2 個命中

把 144 次呼叫的模型檔名正規化成 vfx key 詞幹
（`Abilities\Spells\Human\Thunderclap\ThunderClapCaster.mdl` → `thunderclapcaster`），
得到 **54 個**不同的受擊者模型；再把內容裡用到的 **31 個** `vfxId` 同樣正規化去比對：

| 命中 | 住在哪 | 判定 |
|---|---|---|
| `fx.w3x.stock.thunderclapcaster.p00` | `godie-hart.r` `effects[3].perStrike[1]` | ⭐ **翻**（見 §4） |
| `fx.w3x.stock.warstompcaster.p00` | `godie-hart.r` `effects[3].finisher[1]` | ⛔ **不動**（見 §4 的裁決） |

⛔ 其餘 29 個 `vfxId` 全是 GGD 自己的原生特效（`fx.prim.*` / `fx.wave.*` / `fx.avalon.*` …），
它們**沒有一個 w3x 模型出處**可以拿來判「原作把它掛在誰身上」。
⇒ ⭐ 對它們動錨定就是**近似，不是翻譯**（第一守則的紅線）—— 所以一個都不動。

### ③ 反方向也走了一次（⭐ 第⑫種假綠燈的解法）

⛔ 只從「內容有什麼」走會漏掉「原作有而內容沒有」的。
所以再從 **JASS 那一頭**走一次：用 repo 既有的 `tools/jass-combo/_ground-truth_temp_20260822-1600.json`
（它已經把 `func → abilityIds` 對好了，⛔ 不是我新編的對照）把 144 次呼叫反查回技能：

| 技能 | 受擊者錨定的原作特效 | 今天的內容 | 為什麼沒動 |
|---|---|---|---|
| `godie-hart.r` | 7 次（見 §4） | ⭐ 有對得上的 `spawnVfx` | ⭐ **翻了** |
| `godie-h01n.q` / `h01o.q` 瞬步 | 4 次（chest：StampedeMissileDeath ×3 + WarStomp） | 只有 `fx.prim.void.bolt` / `fx.fam.blink.*` | ⛔ 要**新增**特效 ＝ 取捨 ⇒ 需要開關（柵欄外） |
| `godie-u00l.q` / `umal.q` 北斗懺悔拳 | 2 次 | `effects: []`（走模板） | 同上 |
| `godie-n00p.w` / `nsjs.w` 寄生種子 | 2 次 | 只有 `spawnProjectile` | 同上 |
| `godie-u00n.w` / `u00o.w` 橡膠火箭砲 | 1 次 | 只有 damage + status | 同上 |
| `godie-u034.passive` / `ucrl.passive` 猜猜拳 | 1 次 | 只有 damage | 同上 |
| `godie-hart.q` 凶斬 | 1 次 | 只有 damage + status + leap | 同上 |
| `godie-e00j.r` | 2 次 | ⛔ **這支技能沒有出貨** | — |

⭐ **判準**：這一輪做的是「**把錨定錯的那一格改對**」（純修缺陷）。
⛔ 「原作有而我們沒有的特效補上去」是**加東西**，它會改變玩家看到的畫面 ⇒
依常設指令要**留一格後台開關**，而開關的三個住處（`content/config/*.json` ＋ Zod `DEFAULT_*`
＋ admin `SHIPPED_*`）**全部在這條 lane 的柵欄外**。
⇒ 所以它是 `next`，⛔ 不是這一輪硬塞。

### ④ 另外三支對得上、但檔案是**產生器的產物**

`godie-h01u.e`（鬼神烈戟）· `godie-edem.r`（哥哥）· `godie-h02k.e`（憤怒的胸毛）
逐檔 `bash scripts/genguard.sh` ⇒ **`skillremake:json` 的產物**（444）。
改它們要改 `tools/skill-remake/` 的來源 ⇒ **柵欄外** ⇒ `next`。
（而且它們今天也都沒有對得上的 `spawnVfx`，所以同樣屬於「要新增」那一類。）

---

## 4. ⭐ 真正落地的那一格：`godie-hart.r` 01-04 超究武神霸斬

### 出處（逐行，⛔ 不是「看起來像」）

`Trig_SuperFF7_Actions`，j:33799 起。
⭐ 對照關係由 repo 既有的 `tools/jass-combo/_ground-truth_temp_20260822-1600.json`
獨立確認：`{"func":"Trig_SuperFF7_Actions","line":33799,…,"abilityIds":["godie-hart.r"]}`。
（GGD 的 `comboStrikes.family` 逐字就叫 `superff7`。）

七刀迴圈（`loop … exitwhen udg_SupI > 7`）的迴圈體，逐行：

| j: | 呼叫 | 錨在誰 |
|---:|---|---|
| 33830 | `("chest", udg_FF7_CloudUnit, HeroCloudCyd.mdx)` | 施法者 |
| 33832 | `("chest", udg_FF7_EffectUnit, HeroCloudCyd.mdx)` | 分身 dummy |
| 33833 | `("chest", udg_FF7_CastedUnit, HumanBloodPeasant.mdl)` | ⭐ **受擊者** |
| 33839 | `("weapon", udg_FF7_CloudUnit, Phoenix_Missile.mdl)` | 施法者 |
| 33847 | `("chest", udg_FF7_CloudUnit, MirrorImageCaster.mdl)` | 施法者 |
| **33852** | **`("chest", udg_FF7_CastedUnit, ThunderClapCaster.mdl)`** | ⭐ **受擊者** |
| 33854 | `("chest", udg_FF7_CastedUnit, MarkOfChaosTarget.mdl)` | ⭐ **受擊者** |

`set udg_FF7_CastedUnit = GetSpellTargetUnit()`（j:33801）⇒ ⭐ 它是**受擊者**，
而它是**別名**（所以機制 commit 的 92 沒有數到這 7 次 —— §2）。

### 改了什麼（一格，⛔ 不新增任何特效）

```diff
  "kind": "spawnVfx",
  "vfxId": "fx.w3x.stock.thunderclapcaster.p00",
- "at": "target"
+ "at": "bone",
+ "attach": "chest",
+ "boneOn": "victim"
```

落在 `content/abilities/godie-hart.r.json` `effects[3].perStrike[1]`
與**英雄卡鏡像** `content/champions/godie-hart.json` `abilities.R.effects[3].perStrike[1]`
（鏡像是 STRICT 模型，兩份必須一起動）。

**語意差別**：`at:"target"` 送的是受擊者**腳下的世界座標**（一次性、不跟著模型走）；
改完之後客戶端把它掛在**受擊者模型的 `chest` 骨頭**上。
⭐ 而 `boneOn:"victim"` 在 sim 解成 `ctx.targets[0]` —— `comboStrikes` 的每一刀
走 `delayed` 的凍結名單，所以那個 `targets[0]` 就是這一刀打到的人。

### ⛔ 同一支裡**刻意不動**的兩格（⭐ 這是裁決，不是漏掉）

| 內容 | 為什麼不動 |
|---|---|
| `finisher[1]` `fx.w3x.stock.warstompcaster.p00` `at:"target"` | ⭐ 它對得上 **j:33880 `AddSpecialEffectLocBJ(GetUnitLoc(udg_FF7_CastedUnit), WarStompCaster)`** —— 那是**在受擊者的位置**放一個地面特效，⛔ 不是掛在骨頭上。`at:"target"` 已經是它的正確翻譯。⚠️ 同一支 JASS 另有 j:33890/33897/33916 是 `("weapon", 受擊者, WarStomp)`，但內容只有**一格** warstomp ⇒ ⛔ 兩個出處對一格是**歧義**，不猜 |
| `finisher[2]` `godie-herocloudkfksword-p0` `at:"bone" attach:"weapon"` | ⭐ 對得上 **j:33878 `("weapon", udg_FF7_CloudUnit, HeroCloudKFKSword.mdx)`** —— 錨在**施法者**。省略 `boneOn` ＝ caster ⇒ 它今天就是對的 |

⭐ ⛔ **量到它已經是對的就停下來** —— 這兩格一個位元組都沒動。

---

## 5. 驗證（跑了什麼、看到什麼）

| 跑的 | 結果 |
|---|---|
| `validateDoc("abilities"/"champions", …)`（出貨 Zod，含 `spawnVfx.refine` 的三條跨欄位） | ⭐ 兩份都 **OK** |
| `packages/shared/src/content/shippedBundleIsCurrent.test.ts` | ⭐ **綠**（4/4）—— 產物與來源逐位元組一致 |
| `packages/shared/src/content/fieldAdoption.test.ts` | ⚠️ **紅 2 條**（見下，⭐ 其中一條正是這一輪要的訊號） |

### ⭐ `fieldAdoption` 的紅，是**設計上的成功訊號**

```
         2/80      2.5%  field:abilities.effects[]#spawnVfx.boneOn
         2/2     100.0%  enum:abilities.effects[]#spawnVfx.boneOn=victim
ZERO     0/2       0.0%  enum:abilities.effects[]#spawnVfx.boneOn=caster
```

⇒ ⭐ 普查透過**真的 loader、讀真的出貨內容樹**數到了 **2 份文件**採用這一格。
⭐ 那是「內容側翻譯真的落地了」的**終端量測**（⛔ 不是「我改了檔案」的自我宣告）。

而 `no exemption is STALE` 這一條因此紅了，訊息逐字說：

> `field:abilities.effects[]#spawnVfx.boneOn` —— an adopted key must lose its exemption

⭐ 這**完全正確**：`fieldAdoption.test.ts` 的 RULES OF THE ROAD 寫著
「A key here must currently be at zero. If it gets adopted, this test goes red and
the entry must be DELETED」。
⛔ 而 `packages/shared/src/content/fieldAdoption.test.ts` **在這條 lane 的柵欄外**
⇒ 刪除那一列進 `next`（見 §6）。

### ⚠️ 另一條紅是**先前就紅的**，⛔ 不是我造成的

`no landing grace has expired` 列出 7 個過期的 `landing`：
`items.auras[].lingerSec` · `abilities.passive.ranks[].auras[].lingerSec` ·
`auras[].affects=all` · `invulnerable.applyTo=target` · `invulnerable.blocksDamage=physical` ·
`variant:evasion` · `variant:summon`。
⭐ `boneOn` **不在那張表上**（它是今天登記的，還沒到 30 天）⇒ 這一條與這一輪無關。

---

## 6. 交給下一個人（⭐ 每一項都有明確的落點）

1. ⛔ **必做**：刪掉 `packages/shared/src/content/fieldAdoption.test.ts` 裡的
   `"field:abilities.effects[]#spawnVfx.boneOn"` 那一列（`landing`, since 2026-08-30）——
   它現在是**謊話**（宣稱零採用，實際 2/80）。⭐ 刪掉之後那兩條就綠了。
   ⚠️ 順帶：`enum:…boneOn=caster` 是 `0/2`，⛔ 那是**正常的**（省略即 caster，
   ⛔ 沒有人需要顯式寫它）—— 如果普查對 enum 也要求非零，那要的是一列 `debt`／說明，
   ⛔ 不是去內容裡塞一個沒有出處的 `"caster"`。
2. **要新增特效才翻得動的那一批**（§3③ 的 8 支）：它們需要
   ①一格後台開關（`content/config` ＋ Zod `DEFAULT_*` ＋ admin `SHIPPED_*`）
   ②對應的 `vfx@1` 文件（`stampedemissiledeath` / `orcsmalldeathexplode` /
   `demonlargedeathexplode` / `humanbloodpeasant` … 今天 `content/vfx/` 都還沒有）。
   ⭐ 兩者都在這條 lane 的柵欄外。
3. **產物**：`content/bundle.json` · `content/manifest.json` · `content/editor-target-profile.json`
   · `content/{abilities,champions}/_index.json` 這一輪已經是最新的（`shippedBundleIsCurrent` 綠）
   且與這次 commit 一起進版控。⚠️ 主 session 收尾跑 `pnpm skills:sync` 時它們應該是 no-op。
4. **母體數字**：票文的「124:124」與機制 commit 的「92」都請改引用 §2 的 **144**
   （83 直接 + 9 直接 + 52 別名）；⛔ `GetTriggerUnit()` 那 96 次仍未歸邊。

---

## 7. ⛔ 誠實的限制

- ⭐ **未驗收**：沒有任何像素證據證明那一發雷擊現在真的畫在受擊者胸口。
  這一輪只到「**鏈路已接上**」——schema 收、產物一致、普查數得到。
  真正的驗收要 `apps/client` 的 `VfxSystem.boneAttach` 那一族 audition／截圖，**柵欄外**。
- ⭐ **1 個節點不是「這張票做完了」**，是「**今天的內容裡翻得動的就這麼多**」。
  下一段的瓶頸**不在機制**，在 §6②：缺 `vfx@1` 文件與一格開關。
