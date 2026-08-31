# GH#809 內容批 —— `spawnVfx boneOn:"victim"` 逐支翻譯（2026-08-31）

> 機制在 2026-08-30 出貨（`boneOn: z.enum(["caster","victim"])` ＋ payload `attachTo`
> ＋ `VfxSystem.ts:2337` 的 `data.attachTo ?? data.caster`）。這一批把**內容側**翻過去。
> 動手前 `content/` 全樹只有 **1 支**引用（`godie-hart.r`，2026-08-30 那條 lane 翻的）。

---

## 一張表

| 技能 | 翻了嗎 | JASS 行號 | 掛哪個骨頭／哪份 vfx | 沒翻的理由 |
|---|---|---|---|---|
| `godie-h01n.w` 79-02 月牙斬擊 | ✅ | `j:37475` | `chest` · `godie-bloodbreathstream-p0` | — |
| `godie-h01o.w` 79-02（卍解態） | ✅ | `j:37475` | `chest` · 同上 | — |
| `godie-h01n.e` 79-03 月牙天衝 | ✅ | `j:37573` | `hand` · 同上（＋ `onHitTargetsMode:"perTarget"`） | — |
| `godie-h01o.e` 79-03（卍解態） | ✅ | `j:37573` | `hand` · 同上 | — |
| `godie-u00v.r` 78-04 死亡噴射肘擊 | ✅ | `j:50120` | `chest` · 同上（在 `blink.onArrive` 裡） | — |
| `godie-nsjs.w` 18-02 寄生種子 | ✅ | `j:27948` | `chest` · 同上（在 `spawnProjectile.onHit` 裡） | — |
| `godie-n00p.w` 18-02（鏡射邊） | ✅ | `j:27948` | `chest` · 同上 | — |
| `godie-u00j.q` 74-01 獄門 | ⛔ | `j:48677` | （`chest`，指得到） | ⭐ **沒有扇出容器**：原作是 `ForGroup` 逐個受擊者，而 GGD 這一支是 `ground` + 一顆**裸的 `damage`**。唯一能 `perTarget` 的容器是 `damageArea`，而它的 `radius` 是**必填** ⇒ 包進去等於替 `radius` 開第二個住處（第〇·四守則）。⛔ 頂層 `spawnVfx` 只錨得到 `ctx.targets[0]` ＝ N 個人裡的 1 個 ⇒ 那是近似，不是翻譯 |
| `godie-osam.ex` 34-002 冥道殘月破 | ⛔ | `j:39061` | （`chest`，指得到） | ⭐ **時間軸上沒有那一刻**：JASS 的掛件在「吞進冥道 → **6 秒後**釋放 → 各吃 1300 傷害」那一段的迴圈體裡（`Trig_newlzfsmove_Actions` j:39091–39093），而 GGD 的 `osam.ex` `effects` **只有一顆 `spawnModelFx`**（黑洞）—— 沒有吞噬、沒有釋放、沒有傷害 ⇒ 受擊者從來不存在。翻它＝先做那個機制 |
| `godie-hart.q` · `godie-u00j.w` · `godie-u034`＋`ucrl.passive` | ⛔ | — | — | 票文已定：**mesh-only 美術**（`HeroCloudCyd.mdx` 在 `EMITTERS.json` 是 `assetClass: mesh-only`、`emitters: 0`）⇒ 做不成 `vfx@1`，通道本身就錯。⛔ 本批不碰 |

---

## join key 是怎麼驗的（⛔ 不是憑技能名字猜）

每一支都走**兩條獨立的路**，兩條對上才動：

1. **JASS 側**：`AddSpecialEffectTargetUnitBJ` 的**第二個參數**是誰。
   · `GetEnumUnit()`（ForGroup 的當前受擊者）· `GetSpellTargetUnit()`
   · `GetAttackedUnitBJ()` · 或一個**在前幾行剛被指派成上述之一**的 `udg_` 別名。
   ⭐ 別名逐一回溯到指派點：`udg_BleachTarget = GetAttackedUnitBJ()`（j:37472）·
   `udg_plantUnit = GetSpellTargetUnit()`（j:27910）·
   `udg_PKnockBack_Target = GetSpellTargetUnit()`（j:50106）。
2. **rawcode ↔ GGD id**：`EFFECT_AUDIT.json` 的 `join`（`hero-numbers`，CLAUDE.md 的 JASS join key）。
   `A0LK`→`h01n.w`/`h01o.w` · `A0LL`→`h01n.e`/`h01o.e` · `A0RV`→`n00p.w` ·
   `A0L6`→`u00v.r` · `A0S4`→`u00j.q` · `A0MV`→`osam.ex`。

⚠️ **兩支的掛件不在自己的觸發器裡**，所以要多驗一段 `EnableTrigger` 鏈
（⛔ 否則會把別支技能的效果算到頭上）：
· `Bleach_Moon`(A0LL) 在 **j:37523** `EnableTrigger( gg_trg_Bleach_Moon_Effect )` ⇒ j:37573 是 A0LL 的。
· `newlzfs`(A0MV) 在 **j:39023** `EnableTrigger( gg_trg_newlzfsmove )` ⇒ j:39061 是 A0MV 的。

⚠️ `EFFECT_AUDIT` 的 `jass_models` 對這兩支是**空的**（它只掃同名觸發器），
⭐ 所以那一欄的「空」⛔ 不代表「沒有掛件」—— 它代表「掛件住在被 enable 的**第二個**觸發器裡」。

---

## 每一格的落點（為什麼是這個容器，⛔ 不是「插在哪都一樣」）

`boneOn:"victim"` 解析成 `ctx.targets[0]`（`sim/effects/spawnVfx.ts`）⇒
**它必須放在 `ctx.targets` 剛好等於那個受擊者的那一層**：

| 技能 | 容器 | `ctx.targets` 是什麼（出處） |
|---|---|---|
| `h01n.w` / `h01o.w` · `h01o.e` | 頂層 `effects` | `castType:"targeted"` ⇒ 就是那一個目標 |
| `h01n.e` | `damageLine.onHitTargets` ＋ `onHitTargetsMode:"perTarget"` | `victimFilter.ts:80-82` 逐字 `for (const id of struck) runList(chain, {…targets:[id]})` |
| `u00v.r` | `blink.onArrive` | `blink.ts:160` 逐字 `runEffects(onArrive, { ...ctx, point })` ⇒ **targets 原封不動**帶下去 |
| `nsjs.w` / `n00p.w` | `spawnProjectile.onHit` | `ProjectileSystem.ts:124-131` 逐字 `targets: [bestId]` |

⭐ `perTarget` 只加在 `h01n.e` 上，因為只有它是「一條線打到 N 個人」。
⛔ 沒有在 `spawnVfx` 裡再寫一份扇出（那是同一個決定的第二個住處）。
⚠️ 既有的兩顆條件傷害**行為不變**：`gateOnCondition` 本來就逐個過濾 `targets`，
batch 與 perTarget 對它們給出同一組人（條件是 `status`，⛔ 不吃 RNG）。

## vfx 選哪一份

`content/vfx/` 有**兩族** BloodBreathStream，選 `godie-bloodbreathstream-p0`：

| | `godie-bloodbreathstream-p*` | `fx.w3x.orb.bloodbreathstream.p*` |
|---|---|---|
| `ambient` | 缺席（＝一次性） | **`true`** ＝「活著就一直在」的常駐通道 |
| 出貨慣例 | `godie-deathwave-p0` · `godie-herocloudkfksword-p0` … 技能引用的都是這一族 | 常駐綁定表在用 |

⭐ 原作是 `AddSpecialEffectTargetUnitBJ(...)` **緊接著** `DestroyEffectBJ(...)` ⇒ **一次性** ⇒ 選前者。
⚠️ 只引用 `-p0`（同 `godie-deathwave-p0` 的既有慣例），⛔ 不是 p0+p1+p2 三顆一起。

---

## 這一批動了誰

**來源**（⛔ 產物不手改）
· `tools/skill-remake/heroes/godie-h01n.py` —— `h01n.w` / `h01n.e` 與**它們的英雄卡鏡像**
  都是 `skillremake:json` 的產物 ⇒ 改來源 ＋ `bash scripts/genrun.sh skillremake:json`。

**手編**（genguard：只被正規化器認領）
· `content/abilities/godie-h01o.{w,e}.json` · `godie-u00v.r.json` · `godie-nsjs.w.json` · `godie-n00p.w.json`
· 以及**每一支的英雄卡內嵌副本**（`content/champions/godie-{h01o,u00v,nsjs,n00p}.json`）——
  ⭐ 同一支技能在內容樹裡有兩份，`abilityMirror.test.ts` 兩份都比。

**跑過**：`pnpm castderive:build`（WROTE 0 —— `castTimeSec` 沒被推開）· `pnpm content:build`。
⛔ 沒跑 `pnpm skills:sync`（全域鎖，主 session 統一跑）。

---

## 守衛：一條承重 ＋ 一次突變

`packages/shared/src/content/boneOnVictimContent.test.ts`

⭐ 為什麼機制那條不夠：`sim/effects/spawnVfx.test.ts` 餵的是一顆 `zEffectDef.parse({...})`
手寫的效果 ⇒ 它證明得了「引擎做得到」，⛔ 證明不了「**出貨的技能真的用了它**」——
而 2026-08-30 之前整棵 `content/` 的 `boneOn` 是 **0 筆**：機制全綠、玩家零像素
（失敗形態⑤「被測的不是出貨的那個」）。

這一條整條線用出貨的東西（**出貨內容 → 出貨技能的 `effects` → 真的 `runEffects` → 真的
`vfxSpawn` 事件**），一次關掉三個方向：
① **錨定的人** —— `attachTo` ∈ 受擊者，且 ⛔ 一個都不是 caster
② **扇出** —— 線上 3 個人 ⇒ 3 則、3 個**不同的** `attachTo`
③ **這一批還在** —— 7 支逐一有 `at:"bone"`＋`boneOn:"victim"`＋對的 `attach`，且 `vfxId` 解得開

**突變（實跑）**：把來源 `godie-h01n.py` 的 79-03 拿掉 `onHitTargetsMode="perTarget"`
→ `genrun skillremake:json` → 紅：
`⛔ 每個受擊者要各一發（onHitTargetsMode:"perTarget"）: expected [ { …(6) } ] to have a length of 3 but got 1`
⇒ 它真的在量「每個受擊者各一發」，⛔ 不是「有沒有送事件」。已還原並重生成。

---

## 三條連帶的紅燈（都在這一批裡修掉，⛔ 不是改測試讓它綠）

1. **`dummyOrb.test.ts`** —— 它釘的是「`godie-h01o.e` 的**第一顆** `spawnVfx` 是
   `godie-deathwave-p0`」（do-placeholder-wire 的接線證據）。我第一版把新掛件插在
   `damage` 之後 ⇒ 把那顆頂掉了。
   ⭐ **修法是挪我的節點**（放到既有 `spawnVfx` 之後），⛔ 不是改它的期望值 ——
   而順序本身也是對的：deathwave 是**招式本體**的視覺，血是**打到之後**的反應。
2. **`fieldAdoption` STALE：`field:abilities.effects[]#damageLine.onHitTargetsMode`**
   —— 它的 `landing` 豁免逐字寫著「膠囊這一半還沒有內容需要它」，而 `h01n.e` 現在需要了
   ⇒ 那一列變成謊話 ⇒ **刪掉**（測試訊息自己說「DELETE the listed entries; that is the entire fix」）。
3. **`fieldAdoption` S8：`enum:…spawnVfx.boneOn=caster` 零採用**
   —— ⚠️ 這一條在 HEAD 上**就已經是紅的**（`git show HEAD:…fieldAdoption.test.ts | grep boneOn` = 0 筆豁免），
   ⛔ 不是這一批造成的。⭐ 但它是**這一格詞彙的**債，所以順手了結：`caster` 是
   `boneOn` 預設值的顯式拼法（省略 ⇒ `boneOnVictim` 為 false ⇒ 錨定施法者，逐位元組同以前）
   ⇒ 永遠不會有內容需要明寫它 ⇒ 進豁免、狀態 **`default-live`**、附可反駁的到期條件
   （「哪天預設改成 victim，這一列就該刪」）。

## 一筆被吸收的**單邊**基準線改動（誠實記下來）

`abilityCodeParityForms.baseline.json` 重生成兩次：
· 第一次吸收 **3 筆「兩邊」**（18-02 · 79-02 · 79-03 —— 我刻意兩邊一起動的）
· 第二次吸收 **1 筆「單邊」**：`79-03　只有變身態 godie-h01o 動了`
  ⭐ 那是上面第 1 點的**節點重排**，而它**只能發生在一邊** ——
  `h01o.e` 有一顆 `dummyOrb` 釘住「必須排第一」的 `spawnVfx`，`h01n.e` **沒有**
  （它的招式本體視覺是 `spawnModelFx`，⛔ 不是 `spawnVfx`）⇒ 那個排序約束在本體上不存在。
  ⚠️ **機制本身兩邊都在**（`boneOn:"victim"` ＋ `attach:"hand"`，
  由 `boneOnVictimContent.test.ts` 的第②條逐支斷言），⛔ 這不是 GH#479 的那個缺陷。

---

## 驗證

| | |
|---|---|
| `npx vitest run packages/shared/src/content packages/shared/src/sim/effects/spawnVfx.test.ts` | **218 檔 / 1245 條全綠** |
| `pnpm typecheck` | `EXIT=0` |
| `pnpm content:build` | `EXIT=0`（產物已 commit） |

⚠️ **未驗收（用詞紀律）**：這一批是**鏈路已接上** —— 沒有終端證據（`@visual-proof` /
audition 擷圖）證明玩家真的看到血從被打的人胸口噴出來。
⭐ 已知的剩餘風險：`godie-bloodbreathstream-p0` 的 `anchorBone` 是 `"Dummy02"`，
而受擊者的骨頭解析走 `VfxSystem` 的 WC3 fallback 鏈 —— ⛔ 只讀碼確認過，沒有真渲染證據。

## 下一個人從哪裡接

1. ⛔ **主 session 要跑 `pnpm skills:sync` ＋ `git add docs/`**（全域鎖，本批禁跑）。
2. `u00j.q` / `osam.ex` 兩支要**先做機制**才翻得過去（理由見上表），
   ⭐ 而它們各自缺的是**不同**的東西：前者缺「ground 技的 per-victim 扇出而不重複 radius」，
   後者缺「吞噬 → 延遲釋放 → 傷害」那一整段。⛔ 不要合成一張票。
3. 視覺驗收：把這 7 支併進 #673 的連續圖片批次審查（`asset-review.html`）。
