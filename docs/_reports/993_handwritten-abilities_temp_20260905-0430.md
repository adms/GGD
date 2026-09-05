# GH#993 Scope 1 · 2 · 6 —— 手刻技能盤點 · 先採用再新建的判定 · 棘輪

> ⚠️ 暫存報告（`{用途}_temp_{timestamp}`）。量測時間 **2026-09-05 04:30**，
> 分支 `main`，`bricks:check` 綠（產物與工作區一致）。
> ⛔ **本輪不做 Scope 3（正規化器批次轉換）** —— 這一份只到「盤點 ＋ 判定 ＋ 閘」。

---

## 0. 量尺自證（⭐ 兩個方向都對過）

⛔ 我**沒有手數**。全部從 `docs/editor-contract/ggd-brick-census.json`（產物，`tools/brick-census/gen.ts` 擁有）
與 `content/abilities/*.json` 推導，並**獨立重算一次**與產物逐格對帳：

| 格 | 我獨立算的 | 產物 | |
|---|---:|---:|---|
| `handWritten` | 263 | 263 | ✅ |
| `distinctShapes` | 99 | 99 | ✅ |
| `singletonShapes` | 58 | 58 | ✅ |
| `top8Coverage` | 118 | 118 | ✅ |

⇒ ⭐ **票文的 263 / 99 / 58 / 118 今天全部成立。**

### ⛔ 但票文的「零採用 36」**今天是 28**（⭐ 而差額指得出出處）

| | |
|---|---:|
| 票文（2026-09-05 開票當下） | 36 |
| 今天量到（非 terminal） | **28** |
| 含 terminal（`tpl-data-no-trigger`） | 29 |

⭐ 差額 **8** 不是「有人接了 8 份模板」—— 是 commit `7be1bd257` 把**採用的量尺**修好了：
在那之前 `adoption()` 只讀**文件級** `template.ref`／`.stack`，⛔ 而 `spawnModelFx` 家族是
**節點級**接的（`{"kind":"spawnModelFx","preset":"tpl-…"}`）⇒ **8 份模板 · 67 次採用**被登記成零採用。
⇒ ⭐ 這正是 CLAUDE.md 記過的「一把只驗過單邊的尺」。**用 28，⛔ 不要用 36。**

### ⛔⛔ 而這把尺**今天仍然有一個瞎掉的方向**（本輪新發現）

`gen.ts::demandShapes()` 逐字寫著 `if (effects.length === 0) continue;`
⇒ ⭐ **77 支手刻技能對需求側完全不存在** —— 它們全部是 `passive` / `marks` 型（77/77）。

| 母體 | 支數 |
|---|---:|
| 出貨技能 | 421 |
| 接了模板 | 81 |
| 手刻**有** `effects`（＝ `handWritten` 263） | 263 |
| ⛔ 手刻而 `effects` 為空（需求側**看不到**） | **77** |

⇒ ⭐ 後果很具體：`tpl-growth-charge` · `tpl-mark-stacks` · `tpl-on-attack` · `tpl-on-hit-react`
四份模板展開出來是 `innateKind:"passive"`（`effects` 為空）⇒ **它們的客戶被量尺濾掉了**
⇒ 它們看起來是「零採用的空盒子」，⛔ 而真相是「**需求側從來沒有量過它們的市場**」。
⛔ 不要照著這張表下架它們（見 §2 判定）。

---

## 1. Scope 1 —— 一個形狀幾支技能（99 個形狀，由多到少）

⭐ 形狀 ＝ 該支技能**遞迴展開後**的 effect kind 多重集合（與產生器逐行相同的算式）。

### 前 8 名 —— ⭐ 覆蓋 **118 / 263 支（44.9%）**

| # | 支數 | 形狀 | 結構簽章數 | 逐位元相同的最大群 |
|---:|---:|---|---:|---:|
| 1 | **35** | `applyBuff` | 5 | 11 |
| 2 | **29** | `applyStatus + damage` | 8 | 2 |
| 3 | **12** | `applyBuff + championForm` | 3 | 1 |
| 4 | **12** | `damage` | **1** | 8 |
| 5 | **8** | `championForm` | 2 | 4 |
| 6 | **8** | `damage + spawnProjectile` | 4 | 2 |
| 7 | **7** | `applyStatus` | 3 | 2 |
| 8 | **7** | `blink` | **1** | **7** |

⭐ **「結構簽章」＝ 把數值抹掉之後，那段 `effects` 的 JSON 鍵路徑集合。**
它回答的是「這 N 支到底差幾個**參數**、還是差**結構**」——
⇒ 前 8 名 118 支攤成 **27 個結構簽章**，⛔ 不是 118 段各自不同的程式。
⭐ 這就是第零守則⑨那句「N 個同型 ＝ K 個模板 ＋ 一張表」量出來的 K。

### ⭐⭐ 最便宜的一筆：`blink`（7 支）—— 它們**逐位元完全相同**

七支的 `effects` 一個位元組都不差：

```json
[{"kind":"blink","shape":"single","to":"point","applyTo":"self"}]
```

`godie-n00b.e` · `godie-o00k.w` · `godie-o00x.w` · `godie-o02l.passive` ·
`godie-ofar.passive` · `godie-ogrh.w` · `godie-udea.q`

⚠️ 而**沒有任何模板產出 `blink`-only**：`tpl-blink-strike` 的說明自己就寫著
「⛔ 另有 7 支純位移（`to:"point"`，零 `onArrive`）—— 那是**另一個家族**，⛔ 不走這一份」，
而 `tpl-teleport` 展開出來的 kind 是 **`leap`**，⛔ 不是 `blink`。
⇒ ⭐ **同一個語意（把身體搬走）在需求側是 `blink`、在供給側是 `leap`** —— 兩個住處。
⇒ 這是一塊**零參數**的積木，做出來當場收 7 支。

### 全表（99 個形狀）

⚠️ 產物的 `demand` 欄**只留前 24**（`demand.slice(0, 24)`）—— 下面這張是完整的 99 列，
用與產生器逐行相同的算式重算，四格 counts 對帳一致（見 §0）。

| # | 支數 | 形狀 | 例（最多 4 支） |
|---:|---:|---|---|
| 1 | **35** | `applyBuff` | godie-e001.q · godie-e008.w · godie-e00n.ex · godie-e00n.q |
| 2 | **29** | `applyStatus + damage` | godie-e001.e · godie-e007.q · godie-e008.q · godie-e00n.e |
| 3 | **12** | `applyBuff + championForm` | godie-e001.r · godie-e00w.e · godie-hgam.ex · godie-hjai.ex |
| 4 | **12** | `damage` | godie-e007.e · godie-e00x.e · godie-etyr.passive · godie-h02r.e |
| 5 | **8** | `championForm` | godie-e002.w · godie-e00l.w · godie-e00s.passive · godie-e010.passive |
| 6 | **8** | `damage + spawnProjectile` | godie-e010.q · godie-n003.e · godie-n01g.e · godie-o00l.q |
| 7 | **7** | `applyStatus` | godie-e010.e · godie-emns.q · godie-h02r.w · godie-hgam.w |
| 8 | **7** | `blink` | godie-n00b.e · godie-o00k.w · godie-o00x.w · godie-o02l.passive |
| 9 | **6** | `applyBuff + damage` | godie-emfr.w · godie-h00l.r · godie-u034.q · godie-u034.w |
| 10 | **5** | `applyStatus + damage + spawnProjectile` | godie-e008.e · godie-o030.r · godie-orkn.r · godie-u00h.e |
| 11 | **5** | `damage + dot` | godie-o00x.q · godie-o030.e · godie-ogld.w · godie-ogrh.q |
| 12 | **5** | `heal` | godie-n003.w · godie-n01c.q · godie-n01g.w · godie-nbbc.q |
| 13 | **4** | `applyStatus + damage + spawnModelFx` | godie-e00x.q · godie-h020.r · godie-hjai.r · godie-hvwd.ex |
| 14 | **4** | `damage + screenShake + spawnModelFx×3 + spawnVfx` | godie-u010.e · godie-u010.ex · godie-uvng.e · godie-uvng.ex |
| 15 | **3** | `applyBuff + applyStatus + damageArea` | godie-e001.passive · godie-e00n.passive · godie-edem.w |
| 16 | **3** | `applyStatus + damage + invulnerable + leap` | godie-hapm.w · godie-u00n.r · godie-u00o.r |
| 17 | **3** | `damage + knockback` | godie-e007.ex · godie-efur.w · godie-ewar.ex |
| 18 | **3** | `damageArea` | godie-e00x.passive · godie-efur.e · godie-emns.e |
| 19 | **2** | `applyBuff + applyStatus + blink + spawnVfx` | godie-o030.passive · godie-orkn.passive |
| 20 | **2** | `applyBuff + damage + screenFlash×2 + screenShake + spawnModelFx + spawnVfx` | godie-e002.r · godie-e00l.r |
| 21 | **2** | `applyBuff + damage + spawnModelFx` | godie-emfr.ex · godie-hart.e |
| 22 | **2** | `applyBuff + shield` | sela.w · thorne.w |
| 23 | **2** | `applyStatus + blink + damageArea×2 + damageLine + delayed + spawnModelFx + spawnVfx` | godie-n01c.r · godie-nbbc.r |
| 24 | **2** | `applyStatus + damage + damageArea + delayed×4 + floatingText×5 + screenShake + spawnModelFx×2 + spawnVfx` | godie-h020.e · godie-hjai.e |
| 25 | **2** | `applyStatus + damage + invulnerable` | godie-hpb1.w · godie-u00j.q |
| 26 | **2** | `applyStatus + damage×2 + delayed×3 + floatingText×4 + screenShake + spawnModelFx + spawnProjectile + spawnVfx` | godie-n003.r · godie-n01g.r |
| 27 | **2** | `damage + delayed + restore` | godie-n00p.r · godie-nsjs.r |
| 28 | **2** | `damage + dot + heal` | godie-h02r.passive · godie-hgam.passive |
| 29 | **2** | `damage + dot + spawnProjectile + spawnVfx` | godie-n00p.w · godie-nsjs.w |
| 30 | **2** | `damage + invulnerable` | godie-u010.q · godie-uvng.q |
| 31 | **2** | `damage + leap` | godie-h00l.w · godie-hpb1.e |
| 32 | **2** | `damage + spawnModelFx + spawnProjectile + spawnVfx` | godie-n01c.e · godie-nbbc.e |
| 33 | **2** | `damage + spawnModelFx + spawnVfx` | godie-e00x.r · godie-hvwd.r |
| 34 | **2** | `damage + spawnVfx` | godie-h01n.w · godie-h01o.w |
| 35 | **2** | `damageArea + dispel` | godie-e007.r · godie-ewar.r |
| 36 | **2** | `damageArea + randomArea` | godie-efur.r · godie-ogld.ex |
| 37 | **2** | `damageArea×2 + randomArea + spawnVfx + summon` | godie-e00s.r · godie-e010.r |
| 38 | **2** | `damageLine + floatingText + screenShake + spawnModelFx×2 + spawnVfx×2` | godie-e002.e · godie-e00l.e |
| 39 | **2** | `damageLine + screenShake + spawnModelFx×3 + spawnVfx×2` | godie-o00x.r · godie-ogrh.r |
| 40 | **2** | `damageLine + spawnModelFx + spawnVfx` | godie-h02r.r · godie-hgam.r |
| 41 | **2** | `dispel + restore` | godie-e007.w · godie-ewar.w |
| 42 | **1** | `applyBuff + applyStatus` | godie-ubal.passive |
| 43 | **1** | `applyBuff + applyStatus + championForm + delayed + restore` | godie-h02v.q |
| 44 | **1** | `applyBuff + applyStatus + damage + damageArea + spawnModelFx×2` | godie-emfr.e |
| 45 | **1** | `applyBuff + applyStatus + damageArea + dash + spawnVfx` | godie-h01n.q |
| 46 | **1** | `applyBuff + applyStatus + damageArea + knockback + spawnModelFx + spawnVfx` | godie-h01u.w |
| 47 | **1** | `applyBuff + applyStatus×2 + damageArea + dot + spawnModelFx` | godie-edem.ex |
| 48 | **1** | `applyBuff + championForm + modifyCooldown` | godie-h01n.r |
| 49 | **1** | `applyBuff + damage + delayed + grantGold` | godie-h02u.r |
| 50 | **1** | `applyBuff + dash` | godie-zombiex.w |
| 51 | **1** | `applyBuff + delayed + grantXp` | godie-h02u.ex |
| 52 | **1** | `applyBuff + delayed + restore` | godie-h02u.q |
| 53 | **1** | `applyBuff + grantGold + restore + spawnVfx + taunt + weightedBranch` | godie-n00b.passive |
| 54 | **1** | `applyBuff + proxyCast×2 + spawnVfx` | godie-h01u.r |
| 55 | **1** | `applyBuff + spawnModelFx×2 + spawnVfx` | godie-u01u.r |
| 56 | **1** | `applyBuff + spawnVfx` | godie-o00l.passive |
| 57 | **1** | `applyBuff×2` | godie-h01o.ex |
| 58 | **1** | `applyBuff×2 + applyStatus + damageArea + grantAttribute×3 + heal` | godie-hvsh.e |
| 59 | **1** | `applyBuff×2 + damage + spawnModelFx×2 + spawnVfx` | godie-emfr.r |
| 60 | **1** | `applyStatus + blink + damage + knockback + spawnVfx×2` | godie-u00v.r |
| 61 | **1** | `applyStatus + blink + spawnVfx` | godie-efur.q |
| 62 | **1** | `applyStatus + chainLightning` | godie-o00k.r |
| 63 | **1** | `applyStatus + damage + delayed + invulnerable + knockback` | godie-hapm.ex |
| 64 | **1** | `applyStatus + damage + dot` | godie-huth.r |
| 65 | **1** | `applyStatus + damage + leap` | godie-hart.q |
| 66 | **1** | `applyStatus + damage + leap + spawnModelFx` | godie-hart.w |
| 67 | **1** | `applyStatus + damageArea` | godie-e00s.e |
| 68 | **1** | `applyStatus + damageArea + dot` | godie-edem.q |
| 69 | **1** | `applyStatus + damageLine` | godie-emfr.q |
| 70 | **1** | `applyStatus + spawnModelFx` | godie-hvsh.passive |
| 71 | **1** | `applyStatus×2 + comboStrikes + damage×2 + floatingText×2 + invulnerable + screenFlash + screenShake + spawnModelFx + spawnVfx×4` | godie-hart.r |
| 72 | **1** | `applyStatus×2 + damageArea` | godie-h02v.r |
| 73 | **1** | `applyStatus×3 + damage×6 + weightedBranch×3` | godie-h02k.ex |
| 74 | **1** | `blink + damage + spawnVfx` | godie-n01c.w |
| 75 | **1** | `blink×2 + damage×2 + spawnVfx×2` | godie-h01o.q |
| 76 | **1** | `chainLightning + damageArea + spendMana` | godie-udea.r |
| 77 | **1** | `championForm + spawnModelFx` | godie-umal.r |
| 78 | **1** | `damage + damageArea + randomArea` | godie-e008.ex |
| 79 | **1** | `damage + damageLine + dash` | godie-h01u.e |
| 80 | **1** | `damage + delayed + heal` | godie-o02p.r |
| 81 | **1** | `damage + leap + screenFlash + spawnVfx` | godie-zombieking.passive |
| 82 | **1** | `damage + spawnModelFx` | godie-u00l.r |
| 83 | **1** | `damage + spawnModelFx + spawnVfx×2` | godie-h01o.e |
| 84 | **1** | `damage×2 + damageLine + spawnModelFx + spawnVfx` | godie-h01n.e |
| 85 | **1** | `damageArea + dash` | godie-u00j.w |
| 86 | **1** | `damageArea + knockback` | godie-h00l.q |
| 87 | **1** | `damageArea + knockback + spawnModelFx` | godie-e00w.q |
| 88 | **1** | `damageArea + spawnModelFx` | godie-e00w.r |
| 89 | **1** | `damageArea + spawnVfx` | godie-e00s.q |
| 90 | **1** | `damageArea×2 + dash` | godie-hapm.r |
| 91 | **1** | `damageLine + dash + spawnModelFx×2` | godie-edem.e |
| 92 | **1** | `damageLine + spawnModelFx + spawnVfx×2` | godie-e00r.r |
| 93 | **1** | `dash` | thorne.q |
| 94 | **1** | `heal + spawnModelFx` | godie-etyr.q |
| 95 | **1** | `manaBarrier` | godie-emns.passive |
| 96 | **1** | `restore` | godie-o02p.ex |
| 97 | **1** | `shield` | godie-o00l.e |
| 98 | **1** | `spawnVfx + taunt` | godie-o00k.passive |
| 99 | **1** | `swapResource` | godie-emns.ex |
---

## 2. Scope 2 —— 先採用再新建：29 份零採用模板的判定

⭐ **判定方法**：每一份模板用它自己的 `params[*].default` 呼叫**出貨的** `expand()`，
把展開結果的 effect kinds 算成同一種形狀字串，再去 §1 的 99 個形狀裡找。
⛔ 不是讀模板的名字猜它像什麼。

| 分類 | 份數 | 一句話 |
|---|---:|---|
| ⭐ **形狀對得上** | **7** | 有現成客戶，⛔ 但語意仍要逐支確認 |
| 展得開而**對不上任何形狀** | 7 | 它的客戶今天不在需求側 |
| ⛔ **被量尺濾掉**（passive 家族） | 4 | 「零採用」是量尺瞎，⛔ 不是沒人要 |
| ⛔ **引擎缺機制**（`engineMissing`） | 10 | 那是票文 Scope 5，⛔ 不是「下架」 |
| 刻意的分流終點 | 1 | `tpl-data-no-trigger`（普查已扣掉） |
| | **29** | ＝ `zeroAdoption` 28 ＋ terminal 1 |

### ⭐ A. 形狀對得上（7 份）

| 模板 id | 展開形狀（預設參數） | 對得上的需求形狀（支數） | ⭐ 建議動作 |
|---|---|---|---|
| `tpl-proxy-fanout` | `applyStatus + damage` | **29** | ⚠️ **套用，但⛔ 不是 29 支** —— 模板說明自陳母體是**十五支**（原作用拋棄式 dummy 逐一 `IssueTargetOrder` 的那一族），而 29 支裡多數是單體。⇒ 逐支比 `castType`／`radius` 再套 |
| `tpl-ground-nova` | `damage` | 12 | ⛔ **形狀對得上而語意對不上** —— nova 是 `castType:"ground"` ＋ `radius 9.72` 的環形震波；那 12 支 **10/12 是 `castType:"targeted"` 單體**（`damageTier:"小"` ＋ ap 0.6）。⇒ 那 12 支的模板是**已經有 22 支採用的 `tpl-single-strike`**（`targeted` ＋ `damage`，逐格相同）。`tpl-ground-nova` 仍然零採用 |
| `tpl-drain-leech` | `damage + dot + heal` | 2（`godie-h02r.passive` · `godie-hgam.passive`） | ⭐ 直接套 |
| `tpl-leap-strike` | `damage + leap` | 2（`godie-h00l.w` · `godie-hpb1.e`） | ⭐ 直接套（`leap.onLand[damage]`，結構相同） |
| `tpl-pull-throw` | `damage + leap` | 2（**同上兩支**） | ⚠️ **與 `tpl-leap-strike` 撞同一個形狀** —— 差別在 `applyTo`（自己跳過去 vs 把人拖過來）。⇒ 逐支挑一份，⛔ 不要兩份都算成客戶 |
| `tpl-blink-strike` | `blink + damage + spawnVfx` | 1（`godie-n01c.w`） | ⭐ 直接套 —— 它本來就是這份模板的 exemplar（GH#916） |
| `tpl-life-manipulate` | `restore` | 1（`godie-o02p.ex`） | ⭐ 直接套 |

⭐ **合計 47 支**（29 ＋ 12 ＋ 2 ＋ 2 ＋ 1 ＋ 1，`damage + leap` 只算一次）——
⚠️ ⭐ 這是**上界**：`proxy-fanout` 的 29 與 `ground-nova` 的 12 都帶著上表的但書，
逐支確認語意之後**一定會少**。⛔ 不要把 47 當成承諾。

### B. 展得開而對不上任何形狀（7 份）

| 模板 id | 展開形狀 | 最近的需求形狀 | ⭐ 建議動作 |
|---|---|---|---|
| `tpl-lock-combo` | `applyStatus + damage + dot + invulnerable + leap` | `applyStatus + damage + invulnerable + leap` — **3 支**（`godie-hapm.w` · `godie-u00n.r` · `godie-u00o.r`） | ⭐⭐ **本表最具體的一筆**：只差一個 `dot`，而模板 10 格 params 裡唯一 optional 的是 `finisherAbility` ⇒ **把「連段傷害」做成可關的一格**，當場收 3 支 |
| `tpl-charge-push` | `damage + knockback + leap` | `damage + knockback` — 3 支 | 差一個 `leap`；`pushDistance` 可清空但 `leap` 不可 ⇒ 進豁免表，理由：說明點名的 52-02／52-04 還沒進來 |
| `tpl-teleport` | **`leap`** | `blink` — **7 支** | ⛔ **同一個語意兩個住處**：需求側 7 支純位移發的是 `blink`，這份模板發的是 `leap`。⇒ 要嘛 teleport 改發 `blink`，要嘛新開一塊 `blink`-only 積木（見 §1 的最便宜一筆） |
| `tpl-random-barrage` | `dot` | — | 說明自陳母體是原作 8 支彈幕，⛔ 今天需求側沒有那個形狀 ⇒ 豁免，理由：客戶還沒匯入 |
| `tpl-combo-finisher` | `comboStrikes + damage×2 + floatingText×2 + screenFlash + screenShake + spawnVfx×2` | `applyStatus×2 + comboStrikes + damage×2 + …` — **1 支**（`godie-hart.r`） | 單例（N=1 ＝ 專屬，GH#916）⇒ 豁免 |
| `tpl-dragon-quake` | `spawnModelFx` | — | ⚠️ 純視覺家族，正確接法是**節點級** `spawnModelFx.preset`（⛔ 不是文件級 `template.ref`）—— 同族已有 8 份靠這條路被採用 67 次。⇒ 豁免或去找宿主技能 |
| `tpl-dragon-serpent` | `spawnModelFx` | — | 同上 |

### ⛔ C. 被量尺濾掉的 4 份 —— **⛔ 不要照這張表下架它們**

`tpl-growth-charge` · `tpl-mark-stacks` · `tpl-on-attack` · `tpl-on-hit-react`

四份展開出來都是 `innateKind:"passive"`（`effects` 為空）。
而 `gen.ts::demandShapes()` 逐字寫著 `if (effects.length === 0) continue;`
⇒ ⭐ **它們的 77 支潛在客戶對需求側完全不存在。**

⇒ 建議：**先修量尺**（讓普查也量 passive／hooks 那一半的形狀），再談採用。
⛔ 在那之前「零採用」對這四份**沒有資訊量**。

### ⛔ D. 引擎缺機制的 10 份 —— 那是 Scope 5，⛔ 不是「下架」

`tpl-barrier-domain` · `tpl-channel-beam` · `tpl-death-mechanic` · `tpl-dragon-shockwave` ·
`tpl-global-rule` · `tpl-pure-cosmetic` · `tpl-range-gamble` · `tpl-resource-ops` ·
`tpl-strip-transform` · `tpl-team-synergy`

十份全部 `status:"draft"` ＋ `isExpandable(family) === false`
（`tpl-dragon-shockwave` 有 9 格 params，其餘 params 為 0）。
⇒ ⭐ 它們是**票文 Scope 5 的那 10 個引擎缺口**，⛔ 不是「沒人採用的空模板」——
「下架」會讓那 10 個缺口從清單上消失，⭐ 而缺口不會因此消失。

---

## 3. Scope 6 —— 棘輪閘

**新檔**：`packages/shared/src/ops/handWrittenAbilitiesRatchet.test.ts`（74 行，⛔ 未 commit）

| | |
|---|---|
| **基準線** | `HAND_WRITTEN_BASELINE = 263`（⭐ 當場量到，與票文一致） |
| **數字的住處** | 讀產物 `ggd-brick-census.json` 的 `counts.handWritten` —— ⛔ 測試裡**沒有**技能清單（第二守則：那會是第四個住處） |
| **雙向** | 變**多** ⇒ 🔴 指名 +N 並引第〇·五守則；變**少** ⇒ 🔴 而訊息叫你**把基準線降到新值**（⛔ 不降的話棘輪日後會靜靜允許爬回 263） |
| **sentinel** | 判定寫成純函式 `ratchetVerdict(count)`，測試餵 `264` / `262` / `263` 三個必然答案 ⇒ ⭐ 檢查器自證抓得到，⛔ 不必去動隔離區裡的產物 |
| **量尺自證** | 另一條斷言 `counts.distinctShapes > 0` —— ⛔ 普查讀不到 `content/abilities` 時，棘輪不可以安靜地綠 |
| **與隔壁的分工** | 供給側三格（`usable` / `engineMissing` / `shells`）住 `brickCensusRatchet.test.ts` ⇒ ⛔ 這裡不再釘一次（第〇·四） |

⛔ **不做突變**（體驗層一條薄棘輪；sentinel 本身就是自證）。

---

## 4. ⭐ 下一步（按「收幾支」排序，⛔ 不是按檔名）

| # | 動作 | 收幾支 | 成本 |
|---:|---|---:|---|
| 1 | 新開一塊 **`blink`-only** 積木（零參數，7 支 `effects` 逐位元相同） | **7** | 最低 —— 一份模板檔 ＋ 一格 family |
| 2 | 把 12 支 `castType:"targeted"` 單體直傷接到**已經有 22 支採用**的 `tpl-single-strike` | **12** | 零新機制 |
| 3 | 35 支 `applyBuff` 接 `tpl-buff-self`（已 28 支採用，展開 ＝ `castType:"self"` ＋ `applyBuff`）。⚠️ 旁證取自一個略寬的樣本（**頂層只有一個 `applyBuff` 節點**的 38 支）：castType **38/38 都是 `self`**、鍵集合 **31/38** 是 `{kind,modifiers,duration}` ⇒ ⛔ 38 不是 35，⭐ 但方向一致 | ≤ **35** | 零新機制 |
| 4 | `tpl-lock-combo` 的 `dot` 做成可關的一格 | **3** | 一格 optional |
| 5 | 修需求側量尺：讓普查也量 passive／hooks 形狀（77 支母體） | —（解鎖 4 份模板的判定） | 動 `tools/brick-census/gen.ts` |
| 6 | `tpl-teleport` 的 `leap` vs 需求側的 `blink` —— 兩個住處，挑一個 | 併入 #1 | 決策 |

⭐ 光是 #1 ＋ #2 ＋ #3 就是 **54 支**，⛔ 而它們**零個新機制**。
⚠️ 票文 AC 寫「263 → ≤145」需要 118 支；上面六項合起來的上界約 **101 支**
（54 ＋ proxy-fanout 那一族的 29 上界 ＋ 其餘零星），⇒ ⭐ **AC 的 145 達得到與否，
取決於 `applyStatus + damage`（29）與 `applyBuff`（35）兩族逐支語意確認的結果**，
⛔ 不是取決於再多做幾塊積木。

---

## 5. 動到的檔案

| 檔 | |
|---|---|
| `packages/shared/src/ops/handWrittenAbilitiesRatchet.test.ts` | **新** |
| `docs/_reports/993_handwritten-abilities_temp_20260905-0430.md` | **新**（本檔） |

⛔ 其餘一個位元組都沒動：⛔ 沒碰 `content/`、⛔ 沒碰 `tools/brick-census/`、
⛔ 沒 commit／push／`git add`、⛔ 沒跑 `pnpm skills:sync`（只跑過 `bricks --check`）。
