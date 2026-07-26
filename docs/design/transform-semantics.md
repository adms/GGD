# 變身語意（Transform Semantics）— 26 支變身技的觸發與解除，全部來自原始碼

> **狀態**：考察文件。**這份文件不動任何一行程式碼、不動任何一份 content。**
> 它是 #249（變身系統）的前置調查，回答 owner 2026-07-26 的問題：
> 「**你可以考察一下技能寫法來判斷變身條件與變回來的條件**」。
>
> **這份文件存在的理由**：上一輪我打算**自己發明**四支變身技的自動觸發條件（低血量門檻之類）。
> 那是錯的——原始碼自己有答案，我該去讀。本文**沒有任何一個數字是推導出來的**，
> 每一句都附 `war3map.j` 行號或 w3a/w3u 欄位碼。**原始碼沉默的地方，第 8 節明講它沉默**。
>
> **owner 的取值規則（2026-07-26）**：「war3 編輯器設定 設定不了 JASS 實作效果，
> 遇到這種情形一律以 JASS 實際參數為準」。優先序 **JASS > w3a/w3u > tooltip**。
> 推論則是：**算數的 JASS 是會執行到的那一行**。
>
> **`null` = 繼承，不是 0**。w3a/w3u 抽出來的 `null` 要沿 `base` 鏈往上走，
> 走到底就讀 repo 根目錄 MPQ 裡的 Blizzard 原表（`war3.mpq` / `War3x.mpq` /
> `War3Patch.mpq` / `War3xLocal.mpq`）。**第 6.3 節（克勞薩）整段結論就是靠這條規則得到的。**
>
> **來源檔**：
> `tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j`（56,765 行）、
> 同目錄 `war3map.w3a` / `war3map.w3u`、
> `tools/w3x-import/out/GoDieEX22s-src/STRINGS.json`（11,337 條 TRIGSTR）、
> 以及 repo 根目錄四個 MPQ 的 `Units\AbilityData.slk` / `AbilityStrings.txt` / `UnitAbilities.slk`。
>
> **相關**：`docs/design/grab-family.md`（同樣的讀法：JASS 行號逐條）、
> `packages/shared/src/content/templates/expand.ts`（`SIM_CAPABILITIES`）、
> `docs/_requirements-audit-gaps.md`（本文的需求登錄列）、
> 任務 #249（變身第二形態普查）、#119（變身/形態切換系統）、#113（14 組同名英雄文件）。

---

## 0. 先講三句會改變 #249 結論的話

**第一句：這張地圖從頭到尾沒有任何一行程式碼自動施放變身。**

26 支變身技，全部在 `war3map.j` 裡搜過「**被下令**」而不只是「被定義」：

```
全圖 IssueImmediateOrder / IssueImmediateOrderBJ 共 91 處（j:3724 … j:37862）
其中含 "metamorphosis" / "robogoblin" / "phoenix" 字串者： 0 處
全圖 String2OrderIdBJ 比對只有 4 處，全部是 Immolation 家族，且都不屬於這 26 支：
  j:34727  "immolation"    → 涅吉 Emfr  的契約（A0Q8）
  j:48912  "immolation"    → 幽靈 ButtyGhost 的靈魂衝刺
  j:50452  "unimmolation" ┐ 呂布 H01U 的 skill4（A0RW/A0MZ）
  j:50479  "immolation"   ┘
```

26 支技能的 rawcode 在 JASS 裡的出現形態**只有兩種**：
`GetSpellAbilityId() == 'Axxx'`（施放後的反應）或
`SelectHeroSkill(unit,'Axxx')`（AI 的**加點**，`Trig_AILearning_Actions` j:17148–17694，那是學技能不是放技能）。
**「這張圖只會從按鈕放這支技」就是 26 支裡 25 支的正確答案，而這是一個真的發現，不是沒查到。**
唯一的例外是 61 克勞薩，見 §6.3。

**第二句：`ahdu` 到期回復是主流，但有一整個「開關（toggle）」家族，而且 Blizzard 原表有白紙黑字。**

`ANrg`（Robo-Goblin）不是單向永久變身。`War3Patch.mpq: Units\NeutralAbilityStrings.txt [ANrg]` 自己寫著：

```
Untip     = 恢復修理工型態|cffffcc00（T）|r
Unubertip = 變回一般的修理工型態，損失所有哥布林戰警型態時的好處，但可重新變回有機生物。
```

`ANrg` 沒有 `HeroDur`，**只能靠再按一次「解除」鈕變回來**。地圖裡兩支 ANrg（A0DZ 風王結界、A0O6 紮根）
都把 `aut1`/`auu1`/`auhk`（解除鈕文字／熱鍵）改寫成中文的「開啟 / 解除」，證明作者知道而且是刻意用它。

**第三句：`Eme1`/`Emeu` 是「每等級」欄位，而地圖裡有 10 支的 2–4 級還留著別人的英雄。**

例如 04 莉娜的 `A0OE`：

| 等級 | Eme1（一般形態） | Emeu（其他形態） |
|---|---|---|
| 1 | `Hjai` 莉娜因巴斯 | `H020` 莉娜（惡夢） |
| 2–4 | `E00W` **櫻綻剎那** | `E00X` **櫻綻剎那（變身）** |

**這不是可玩到的 bug。** 這 10 支垃圾等級全部踩不到，理由是硬的：
它們都掛在單位的 `uabi`（一般技能列）而不是 `uhab`（可學英雄技能列），
非英雄技能永遠是 1 級，而且全圖沒有一行 `SetUnitAbilityLevelSwapped` 動它們。
掛在 `uhab` 的那些（09/12/18/20/22/25/26/40/58/77/79/87/92/06）四級的 `Eme1/Emeu` 都是自己人，
其中 25/79/90 的第 4 級是髒的，但 `alev` 分別是 3/3/1，也踩不到。
**結論：#249 那張 per-level `ahdu`/`acdn` 表要加一欄「實際可達等級」，否則會照著讀錯數值。**

---

## 1. 三種形狀（GGD 只要做三種，不是 26 種）

| 形狀 | 進入 | 離開 | 支數 | 代表 |
|---|---|---|---|---|
| **A. 定時變身** `AEme` / `AEIl` | 按鈕施放，扣 `amcs` 法力，進 `acdn` 冷卻 | `ahdu`（英雄持續時間）到期自動變回 | 23 | 09 超級賽亞人、76 二檔 |
| **B. 姿態開關** `ANrg` | 按鈕施放，**無持續時間、無法力** | **再按一次「解除」鈕** | 2 | 20 風王結界、70 紮根 |
| **C. 死亡→蛋→復活** `Aphx` | **角色死亡**（法力 ≥ 500 才成立） | **10 秒**後自動孵回（繼承 Blizzard `HeroDur1`）；蛋被打爆則永久死亡 | 1 | 61 克勞薩 |

「A」內部再分兩種**離場副作用**：純 w3a（沒有任何 JASS）17 支，
以及有 JASS 在變身結束時做收尾的 6 支（09 / 18 / 25 / 26 / 42 / 58 / 76 / 92，見各節）。

---

## 2. 觸發總表（TRIGGER）

`可達等級` = `alev`（未寫則看該技掛在 `uabi` 還是 `uhab`）。`EX 閘` 見 §3。

| # | 技能 | base | 觸發 | 法力 | 冷卻 | 可達等級 | 自動施放？ |
|---|---|---|---|---|---|---|---|
| 04 | A0OE 惡夢魔王的碎片 | AEIl | 按鈕（EX 閘 R00R） | 360 | 70 | 1（`uabi`） | 無 |
| 06 | A0Y1 傑桑變化 | AEme | 按鈕 | 200/300/400 | 60 | 3（`alev`） | 無 |
| 08 | A0T1 龍魔人 | AEIl | 按鈕（EX 閘） | 200 | 60 | 1 | 無 |
| 09 | A09E 超級賽亞人 | AEIl | 按鈕 | 160→400 | 60 | 4 | 無 |
| 11 | A10N 武裝色霸氣 | AEIl | 按鈕（EX 閘） | 200 | 60 | 1 | 無 |
| 12 | A02W 破凰之心 | AEIl | 按鈕 | 225→375 | 45 | 4 | 無 |
| 18 | A0IH 妖狐變化 | AEIl | 按鈕 | 200→500 | 60 | 4 | 無 |
| 19 | A0SZ 紫色披風 | AEIl | 按鈕（EX 閘） | 200 | 60 | 1 | 無 |
| 20 | A0DZ 風王結界 | **ANrg** | 按鈕（開關） | **0** | **無** | 3 | 無 |
| 22 | A02Q 雛見澤症候群L5 | AEIl | 按鈕 | 70→210 | 60/75 | 3 | 無 |
| 25 | A0HW ChangeDNA | AEIl | 按鈕 | 80→240 | 60/75 | 3 | 無 |
| 26 | A0EW 開天闢地 | AEIl | 按鈕 | 140→280 | 75 | 3 | 無 |
| 30 | A0YT 變態紳士 | AEIl | **按鈕不存在**（§6.5） | 200 | 60 | — | 無 |
| 38 | A0OH 邪眼全開 | AEme | 按鈕 | **0** | 60 | 1（`uabi`） | 無 |
| 40 | A0ND 萬解-貓王胖虎 | AEIl | 按鈕 | 90→360 | 75 | 4 | 無 |
| 42 | A06K 魔力印章 | AEIl | 按鈕（EX 閘） | **999** | 60 | 1 | 無 |
| 58 | A040 瘋狂皮卡丘 | AEIl | 按鈕 | 90→270 | 60 | 3 | 無 |
| 61 | **Aphx 百連我殺 效果** | **Aphx** | **死亡（法力 ≥500）** | 500 | 無 | 1 | **有，見 §6.3** |
| 70 | A0O6 紮根 | **ANrg** | **按鈕不存在**（§6.4） | 0 | 15 | — | 無 |
| 76 | A0IR 二檔 | AEme | 按鈕（`areq h01B`，§6.1） | **0** | 60 | 1（`uabi`） | 無 |
| 77 | A0JG GLADIARIA ALAT | AEIl | 按鈕 | 90→360 | 60 | 4 | 無 |
| 79 | A0LN 卍解 | AEme | 按鈕 | 100→300 | 60 | 3 | 無 |
| 81 | A0XP Exellion Mode | AEIl | 按鈕（EX 閘） | 350 | 60 | 1 | 無 |
| 87 | A0DB 天下號令 | AEIl | 按鈕 | 90→360 | 60 | 4 | 無 |
| 90 | A0VG 超進化!妙蛙花 | AEme | 按鈕（EX 閘） | 350 | 75 | 1 | 無 |
| 92 | A0W9 臥草泥馬 | AEme | 按鈕 | 160 | 40/20 | 4 | 無 |

---

## 3. 唯一一個「條件」：EX 閘 = 英雄等級 30

`war3map.j:8325–8359`，觸發器自己的註解就寫著：

```jass
// Trigger: EX burst
// 死團 2.0 "EX爆發" 系統
// 等級滿30開放EX技
function Trig_EX_burst_Func004C takes nothing returns boolean
    if ( not ( GetUnitLevel(GetTriggerUnit()) >= 30 ) ) then          // j:8331
        return false
    endif
    if ( not ( udg_EX_Mode[...] == false ) ) then return false endif  // 只跑一次
    return true
endfunction
function Trig_EX_burst_Actions takes nothing returns nothing
    set udg_EX_Mode[...] = true
    call SetPlayerTechResearchedSwap( 'R00R', 1, GetOwningPlayer(GetTriggerUnit()) )  // j:8349
    call AddSpecialEffectTargetUnitBJ( "origin", GetTriggerUnit(), "MidchilderNanohaAura.mdx" )
endfunction
// 事件：EVENT_PLAYER_HERO_LEVEL（j:8356）
```

`R00R` 是一個**玩家科技**。w3a 裡有 **99 支技能**寫著 `areq = R00R`，其中 **7 支是變身技**：
04 `A0OE`、08 `A0T1`、11 `A10N`、19 `A0SZ`、30 `A0YT`、42 `A06K`、81 `A0XP`、90 `A0VG`。
它們的共通點是名字都帶 `-002`（EX 槽）。

也就是說：**「002 變身」不是自動觸發，是等級 30 之後按鈕才亮**。
另一個授予點是作弊指令 `-testex`（`Trig_testEX` j:5290–5304，`TriggerRegisterPlayerChatEvent(Player(1), "-testex")`，
訊息字串 `TRIGSTR_8040` = 「EX測試模式!」），那是開發者用的。

同一個 level≥30 模式也用在非變身的 EX 上（例：70 白木的樹海降臨，`Trig_TreeSea` j:47807–47823，
`GetUnitLevel >= 30` → `SetUnitAbilityLevelSwapped('A0ZM', ..., 2)`）。

---

## 4. 解除總表（REVERT）

| # | 解除方式 | 證據 |
|---|---|---|
| 04/06/08/09/11/12/18/19/22/25/26/38/40/42/58/76/77/79/81/87/90/92 | `ahdu`（英雄持續時間）到期，引擎自動變回 `Eme1` | w3a `ahdu` 逐級；`AEIl` 原表**沒有** `HeroDur1`（`War3Patch AbilityData.slk`），所以這些 ahdu 是地圖自己寫死的，不是繼承 |
| 20 A0DZ / 70 A0O6 | **再按一次解除鈕**（`aut1`/`auu1`/`auhk`）；`adur = 0`、無 `ahdu` | `ANrg` 原表無 `HeroDur`；`[ANrg] Untip/Unubertip` |
| 61 Aphx | **10 秒**後自動孵回（`ahdu` 未寫 → 繼承 `Aphx.HeroDur1 = 10`）；蛋被殺則不孵 | §6.3 |
| 全部 | **回合／遊戲事件不會強制變回** | 全圖 0 處 `UnitRemoveAbility` 針對這 26 支；`Trig_HeroDead`（j:14400–15300）只是死亡台詞派送，對 40（`Nman`/`N01B` j:15210/15213）與 79（`H01N`/`H01O` j:15241/15244）**兩種形態都比對**，證明作者接受「英雄可能死在變身型態」 |

**沒有任何一支變身有 JASS 提前把它變回來。**唯一「像」提前結束的是 58 皮卡丘，
`Trig_WildPika_Actions`（j:40324–40330）：

```jass
set udg_PikaUnit = GetTriggerUnit()
call EnableTrigger( gg_trg_WildPikaAttacked )
call TriggerSleepAction( ( I2R(GetUnitAbilityLevelSwapped('A040', GetTriggerUnit())) * 6.00 ) )  // j:40327
call DisableTrigger( gg_trg_WildPikaAttacked )
call SetUnitVertexColorBJ( udg_PikaUnit, 100, 100, 100, 0 )
```

`level * 6.00` 秒 —— 和 `A040` 的 `ahdu` = 6/12/18/24 **完全對上**。
這不是提前解除，這是**地圖自己在 JASS 側複製了 `ahdu` 的計時**，用來關掉附掛的反傷觸發。
**這是本次考察最有用的一條旁證：作者確實把 `ahdu` 當成變身的權威時長。**

---

## 5. 逐支（22 支常規；4 個特例在 §6）

每節格式：`Eme1 → Emeu`｜`ahdu` / `acdn` / `amcs`｜alt 形態拿到／失去什麼｜JASS。

### 04 莉娜因巴斯 — `A0OE` 04-002 惡夢魔王的碎片（AEIl）
`Hjai → H020`｜20s / 70s / 360mp（1 級；2–4 級是櫻綻剎那的垃圾層）｜
alt 多一支 `A023`「04-05 重破斬」（`ACt2`），且 `int` 27→127、`mp` 100→5000、`mpRegen` 0.1→**1000**。
JASS 對 `A0OE` **0 處**；`H020` 只在 `Trig_LinaS`（j:29767/29945）被當成「重破斬可用形態」比對。
**觸發＝按鈕（EX 閘）。解除＝20 秒。**

### 06 傑 富力士 — `A0Y1` 06-04 傑桑變化（AEme）
`Ucrl → U034`｜7/14/21s / 60s / 200-400mp｜alt 多 `A017`「超賽攻擊」（`Alit` 閃電攻擊），`umvs` 315→360。
JASS 對 `A0Y1` **0 處**；`U034` 只在擊殺台詞（j:15095）與 `j:27155` 被當攻擊者比對。
**按鈕；`ahdu` 到期。**

### 08 勇者小呆 — `A0T1` 08-002 龍魔人（AEIl）
`Nbbc → N01C`｜20s / 60s / 200mp｜alt 多 4 支：`A0T0` 球體(龍魔人)、`A0MB`(`AIx5`)、`A05X`(`AIsr`)、`A0C5`(`AId0`)。
JASS **0 處**。**按鈕（EX 閘）；20 秒。**

### 09 悟空 — `A09E` 09-03 超級賽亞人（AEIl）
`Ogrh → O00X`｜8/12/16/20s / 60s / 160-400mp｜`umvs` 310→**400**；alt 得 `A017` 超賽攻擊、`A0MJ` 球體(悟空超3)、
`A0S7` 09-002b 悟空隱藏法術書；**失去** `A0MI` 球體(悟空正常)。
JASS：`Trig_SSJ`（j:31683–31720+）條件是
`GetSpellAbilityId()=='A09E'`（j:31686）**且** `GetUnitTypeId(GetTriggerUnit())=='Ogrh'`（j:31689），
只跑「變過去」那一半的地形波紋＋雷擊特效。另有 `Trig_Turtle_Power` 對 `O00X` 比對（j:31828）＝變身後龜派氣功加強。
**按鈕；`ahdu` 到期。**

### 11 索隆 — `A10N` 11-002 武裝色霸氣（AEIl）
`Udre → U01U`｜15/15/21/27s / 60s / 200mp｜alt 多 `A0C5`/`A05X`/`A10O` 球體(武裝霸王)。
JASS 對 `A10N` 0 處；`U01U` 在 `udg_RoMaster` 相關（j:28984/29215/29262）＝變身型態專屬的居合。
**按鈕（EX 閘）；15 秒。**

### 12 天地志狼 — `A02W` 12-03 破凰之心-徒手空破山（AEIl）
`Ewar → E007`｜12/18/24/30s / **45s** / 225-375mp｜**兩形態技能表完全相同**（差異全在單位數值）。
JASS 只有 AI 加點（j:17212）。**按鈕；`ahdu` 到期。**

### 18 南野秀一 — `A0IH` 18-03 妖狐變化（AEIl）
`Nsjs → N00P`｜8/12/16/20s / 60s / 200-500mp｜`Eme5`（其他形態生命點數加成）= **250/350/450/550**；
alt 得 `A00N` 18-03-01 召喚毒蕈（`ACtn`）與 `A0II` 球體；**失去** `A002` 18-00 薔薇荊棘之刃。
JASS：`Trig_Gorama`（j:28153–28184）純特效（10 個 `UnsummonTarget.mdl`）＋音效。
另 j:27981/27984 有「打到 `Nsjs` 或 `N00P` 都算」的反擊判定。
**按鈕；`ahdu` 到期。**

### 19 安云 — `A0SZ` 19-002 紫色披風（AEIl）
`E00K → E00Z`｜10/15/21/27s / 60s / 200mp｜`umvs` 310→**522**；
alt 的 `A0RG`（閃擊 `AHbh`，1 級 `Hbh1`=15）換成 `A0RH`（1 級 `Hbh1`=**50**）。
JASS：兩形態都掛在受傷派送器上——`udg_Des_UType[3]='E00K'`、`[4]='E00Z'`，
兩者都指向 `gg_trg_AzumiShadowNew`（j:5044–5048），觸發器內再用
`GetUnitTypeId(GetEventDamageSource())=='E00Z'`（j:27746/27756）分岔強化版。
**這是「同一支被動在兩形態有兩組數值」的乾淨範例。按鈕（EX 閘）；10 秒。**

### 20 Saber — `A0DZ` 20-01 風王結界（ANrg）→ 見 §6 之外的重點說明
`E002 → E00L`｜**無 ahdu、無 acdn、amcs=0**｜alt 得 `A05M` 20-01-00 風王法術書（`Aspb`）＋ `A0M3` 風王攻擊（`Alit`，附掛 `HolyAwakening.mdx`）。
`Nrg5`（力量加權）/`Nrg6`（防禦加權）皆 0 —— **這支開關不給屬性，效果全在 JASS**：

```jass
// Trig_Air_Func001C  j:32090-32095（由 DamageLink 依 buff 'B04F' 派送，j:4998/4944）
if ( not ( GetUnitStateSwap(UNIT_STATE_MANA, GetEventDamageSource())
           >= ( 15.00 + ( 15.00 * I2R(GetUnitAbilityLevelSwapped('A0DZ', ...)) ) ) ) ) then   // j:32092
// Trig_Air_Actions  j:32098-32112
set udg_SaberAirDamage = ( 10.00 + ( STR * ( 0.50 + ( level * 0.50 ) ) ) )                    // j:32101
call UnitDamageTargetBJ( ..., udg_SaberAirDamage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
call SetUnitManaBJ( ..., mana - ( 15.00 + 15.00 * level ) )                                   // j:32103
```

而餵料端 `Trig_Air_Attack_Conditions`（j:32145–32149）只認
`GetUnitTypeId(GetAttacker()) == 'E00L'` —— **只有 alt 形態的普攻會走這條路**。
整組（`gg_trg_Air_Attack` / `gg_trg_Air_value_deal`）由 `Open Skill of Saber` 在 j:31986–31987 啟用。
`gg_trg_Air_MagicBook`（j:32186–32199）在初始化時把法術書 `A05M` 對所有玩家設不可用（j:32188），
這是 WC3 法術書的標準隱藏手法。
**觸發＝按開關鈕；解除＝按解除鈕（`aut1` 「解除風王結界(W)」／`auu1` 「關閉風王結界，停止法力消耗。」）。
沒有時間限制，代價是每次普攻扣 `15+15×level` 法力。**
> tooltip 與 JASS 不一致（照 owner 的規則以 JASS 為準）：`aub1` 1 級寫「消耗 30 法力、10+力量*1」，
> JASS 1 級是 **30 法力（15+15×1）、10+力量×1.0（0.5+0.5×1）** —— 這一級對得上；
> 但 2 級 tooltip 寫「25 法力／力量×0.8+35」，JASS 是 **45 法力／10+力量×1.5**。**以 JASS 為準。**

### 22 龍宮禮奈 — `A02Q` 22-04 雛見澤症候群L5（AEIl）
`E001 → E00N`｜7/14/21/28s / 60-75s / 70-210mp｜
`Eme5` = **−150 / −250 / −350**（負的生命加成！4 級 +600 但踩不到，`alev`=3）；`umvs` 300→**400**；
alt 得 `A0FR` 球體、`A0SB` L5攻擊、`A0SV`（22-002 月光下的決鬥者強化版），失去 `A0SU`（弱版）。
JASS 只有 AI 加點（j:17272）。
**「變身讓自己更脆但更快更痛」是作者刻意的，數字在 `Eme5`。按鈕；`ahdu` 到期。**

### 25 拳四郎 — `A0HW` 25-04 ChangeDNA（AEIl）
`Umal → U00L`｜8/16/24/28s（`alev`=3，第 4 級與 4 級的 `E001→E00N` 都踩不到）/ 60-75s / 80-240mp｜
alt 得 `A0HX` 球體、`A0FO` 黑化攻擊。
JASS：`Trig_ChangeDNA`（j:38643–…）條件 `GetSpellAbilityId()=='A0HW'`（j:38646）**且** `GetUnitTypeId=='Umal'`（j:38649）——又是只跑「變過去」那半。
另有一整組只認 `U00L` 的攻擊觸發（j:38582/38705/38722/38792）。
**按鈕；`ahdu` 到期。**

### 26 鄭先生 — `A0EW` 26-04 開天闢地‧洨者聖臨（AEIl）
`Harf → H00W`｜7/10.5/14s / 75s / 140-280mp｜技能表僅一處差異：
hero 技 `A0BS` 26-02 亂入（`Awar`）→ `A0ER` 同名（`AHbh`）—— **同一招在兩形態換底層機制**。
JASS：`Trig_Open_World`（j:38024–…）`GetSpellAbilityId()=='A0EW'`（j:38027），
特效存活時間 `3.00 + 3.00 * level`（j:38035）。
**按鈕；`ahdu` 到期。**

### 38 飛影 — `A0OH` 38-00 邪眼全開 → **特例，見 §6.2**

### 40 憤怒的胖虎 — `A0ND` 40-03 萬解-貓王胖虎（AEIl）
`Nman → N01B`｜12/18/24/30s / **75s** / 90-360mp｜alt 多兩顆球體 `A0NR`/`A0NT`。
JASS 對 `A0ND` 0 處；死亡台詞兩形態都認（j:15210/15213）。
**按鈕；`ahdu` 到期。**

### 42 依文潔琳 — `A06K` 42-002 魔力印章（AEIl）
`N003 → N01G`｜7/15/21/27s / 60s / **999mp（1 級）**｜`umvs` 295→**160**（變慢！）；兩形態技能表相同。
JASS：`Trig_MagicStamp`（j:37876–…）`GetSpellAbilityId()=='A06K'`（j:37879）。
**按鈕（EX 閘）；7 秒。「999 法力 + 減速」是刻意的高代價印章，不是打錯。**

### 58 皮卡丘 — `A040` 58-04 瘋狂皮卡丘（AEIl）
`Ofar → O02L`｜6/12/18/24s（`alev`=3）/ 60s / 90-270mp｜`Eme5` = 250/400/550；
alt 得 `A0AG` 58-04-x 傷害刺激（`AItx`）、`A0FO` 黑化攻擊；**失去** `Alit`（原生閃電攻擊）。
JASS 見 §4（`TriggerSleepAction(level*6)` j:40327 = `ahdu` 的鏡像）。
**按鈕；`ahdu` 到期，JASS 同步關掉反傷觸發並把頂點色還原（j:40329）。**

### 61 克勞薩 — `Aphx` → **特例，見 §6.3**

### 70 白木卡迪那 — `A0O6` 紮根 → **特例，見 §6.4**

### 76 魯夫 — `A0IR` 二檔 → **特例，見 §6.1**

### 77 櫻綻剎那 — `A0JG` 77-03 GLADIARIA ALAT（AEIl）
`E00W → E00X`｜6/12/18/24s / 60s / 90-360mp｜`umvs` 300→**522**；
alt 得 `A0FI` 球體(翅膀)、`A0HP` 球體、`A0JI`(`AIms`)、`A0I0`(`AId0`)。
JASS：alt 形態掛在受傷派送器上——`udg_Des_UType[0]='E00X'` → `gg_trg_GLADIARIA_ALAT`（j:5035–5036），
即**只有變身後才有的受傷反擊**（j:49502/49669/49710）。
**按鈕；`ahdu` 到期。**

### 79 黑崎一護 — `A0LN` 79-04 卍解（AEme）
`H01N → H01O`｜8/16/24s（`alev`=3；4 級的 `H01L→H01M` 踩不到）/ 60s / 100-300mp｜
`umvs` 295→**400**；hero 光環 `A0LH` 79-00 靈壓（`AOae`，`Oae1`=0 / `Oae2`=−0.25 / 500 範圍）
換成 `A0UV` 同名（`Oae1`=**−0.10** / `Oae2`=**−0.50** / **600** 範圍）。
JASS 對 `A0LN` 0 處；`H01O` 有專屬觸發（j:37500），死亡台詞兩形態都認（j:15241/15244）。
**按鈕；`ahdu` 到期。**

### 81 高町奈葉 — `A0XP` 81-002 Exellion Mode（AEIl）
`O01Z → O02V`｜15s / 60s / 350mp｜`umvs` 295→305；兩形態技能表相同。
JASS 對 `A0XP` 0 處，但 `O02V` 有四處專屬觸發（`Trig_AcxelShooter` j:35809/35940/35994/36103）
＝**變身後才有的射擊模式**。
**按鈕（EX 閘）；15 秒。**

### 87 阿瞞大人 — `A0DB` 87-03 天下號令（AEIl）
`O02N → O02O`｜6/12/18/24s / 60s / 90-360mp｜
alt 得 `A05P`(`AIcl`)、`A0DC` 87-03 天下號令(`ACac` 光環)、`A0DI` 87-001 殺人魔王(`ANde`)、`A0DR` 球體(曹操)。
JASS：`A0DB`、`O02N`、`O02O` 三者在全圖**各 0 處**——**這支是純 w3a、完全沒有 JASS 的變身**。
**按鈕；`ahdu` 到期。**
> 內容庫警訊：`content/champions/godie-o02n.json` **不存在**，但 `godie-o02o.json` 在。
> 26 組裡唯一「基礎形態缺、變身形態有」的一組。

### 90 妙蛙種子 — `A0VG` 90-002 超進化! 妙蛙花（AEme）
`Hgam → H02R`｜18s / 75s / 350mp｜`umvs` 300→**240**；alt 多 `A0VH` 球體。
JASS 對 `A0VG` 0 處。**按鈕（EX 閘）；18 秒。**
> 這是 26 組裡唯一一組 **`properName` 真的換人**的：妙蛙種子 → 妙蛙花。
> 其餘 25 組 alt 都沿用同一個 `upro`，只有 `unsf` 後綴（例「(76 二檔)」）不同。

### 92 草泥馬 — `A0W9` 92-01 臥草泥馬（AEme）
`H02V → H02U`｜10/10/5/5s / 40/40/20/20s / 160mp｜`umvs` 310→**0（不能動）**；
alt 多 `A0W8` 92-01-01 生命再生光氣（`ACnr`）。
JASS：`Trig_SecHorse`（j:45196–45225）

```jass
if ( GetUnitTypeId(GetTriggerUnit()) == 'H02V' ) then                       // j:45209 只跑「趴下」那半
    call SetTerrainTypeBJ( P1, 'Vgrt', -1, 2, 1 )                           // j:45210 腳下長草
    call SetUnitAnimation( GetTriggerUnit(), "Victory" )                    // j:45211
    call TriggerSleepAction( 0.01 )
    call SetUnitAbilityLevelSwapped( 'A0W8', GetTriggerUnit(), GetUnitAbilityLevelSwapped('A0W9', ...) )  // j:45213
endif
```

**這是「趴下＝定身換回血光環」的完整實作**：變身把移速歸零、換上再生光環，等級由 `A0W9` 同步。
另有 `Trig_TrdHorseAtk` 兩形態都認（j:45231/45235）。
**按鈕；`ahdu` 到期。**

---

## 6. 四個特例（＋一個同型的第五個）

### 6.1 76 魯夫 二檔 `A0IR` — 它有按鈕，也有真變身，但按鈕可能亮不起來

**w3a（`A0IR`，base `AEme`）**

| 欄位 | 值 |
|---|---|
| `Eme1` / `Emeu` | `U00N` → `U00O`（只有 1 級） |
| `ahdu` | **20.0** ✅（與 content doc 的 20s 相符） |
| `acdn` | **60.0** ✅ |
| `amcs` | 0 |
| `adur` | 0.1（非英雄用，踩不到） |
| `areq` | **`h01B`** ← 見下 |
| `ahky` | `D` |

**alt 形態實際改了什麼**（w3u `U00N` vs `U00O`）：

| | `U00N` 一般 | `U00O` 二檔 |
|---|---|---|
| `uabi` | `AInv,A0ZK,A0IR` | `AInv,A0ZK,A0IR,`**`A0IW,A0IX`** |
| `umvs` | 315 | **415**（+100） |
| `unsf` | `(76)` | `(76 二檔)` |
| `uhot` | `X` | `C` |

- `A0IW` 76-00-02 二檔增加攻速 —— base `AIsx`（Attack Speed Increase），`Isx1 = 1.0` = **+100% 攻速**。
- `A0IX` 76-00-03 二檔生命損失 —— base `Arll`（Regen Life），`Ihpr = **−10**` = **每秒 −10 生命**。

**JASS（`Trig_Luf_two_Effect`，j:36455–36530）—— 這段是本次考察的關鍵證據：**

```jass
function Trig_Luf_two_Effect_Func008001 ... return ( GetSpellAbilityId() == 'A0IR' )   // j:36458
function Trig_Luf_two_Effect_Func003Func001C ...
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U00N' ) ) then return false endif    // j:36473
...
    if ( Trig_Luf_two_Effect_Func003Func001C() ) then
        set udg_LufDamMath = ( udg_LufDamMath + ( 2.00 * AGI ) )                        // j:36498  變過去：+敏捷×2
    else
        set udg_LufDamMath = ( udg_LufDamMath - ( 2.00 * AGI ) )                        // j:36500  變回來：−敏捷×2
    endif
    if ( udg_LufDamMath < 0.00 ) then set udg_LufDamMath = 0.00 endif                    // j:36502-36504 夾底
```

**同一支技能的 `SPELL_EFFECT` 事件會在「變過去」和「變回來」各觸發一次，靠 `GetUnitTypeId` 分辨是哪一半。**
`acdn`(60) > `ahdu`(20)，所以變身期間根本不可能再按一次；那個 `else` 分支只能是**自動回復時引擎再送一次 spell 事件**。
而且如果 `else` 不會跑，`udg_LufDamMath` 會無限累積，作者也不需要那個夾底 —— 夾底本身證明它會跑。
**這條模式同時解釋了 §6.3 克勞薩的兩支觸發器（DMC Dead / DMC Revive）為什麼寫成一對。**

`udg_LufDamMath = +敏捷×2` 正好對上 tooltip「使用一二招傷害會增加(敏捷*2)點」。

**唯一的疑點：`areq = h01B`。**
`h01B` 是一個 w3u 單位：`unam` =「二檔」、base `hpea`（農民）、`uabi = Avul,Aeth,Aloc`
（無敵＋乙太＋蝗蟲）—— 典型的**隱形解鎖樁**。而

```
$ grep -c "h01B" war3map.j
0
```

**全圖沒有任何一行建立 `h01B`，也沒有預置單位是它。**
依 WC3 的科技需求語意，需求未滿足的技能按鈕會是不可用狀態。
**這一步是推論（WC3 需求語意），不是原始碼明講的**，需要實機驗證；但事實面（`areq h01B` 且 `h01B` 從未被建立）是硬的。
26 支裡只有這一支用 `areq` 指向單位而不是 `R00R`。

**現況 content doc**（`content/abilities/godie-u00n.passive.json`）：`innateKind: "active"` + 一顆 20 秒 `applyBuff`
（as +100%、ms +1.94、healthRegen −10）。**數字全對**，缺的只有「換模型／換技能列／換單位」。

---

### 6.2 38 飛影 邪眼全開 `A0OH` — 和 76 同型，但完全沒有 JASS

**w3a**：`Uvng → U010`，`ahdu` **10.0**，`acdn` **60.0**，`amcs` **0**，`abuf` `B03K`，`ahky` `D`，1 級。
**JASS 對 `A0OH` 全圖 0 處。** `U010` 有 7 處比對，但全部是「變身後才生效的招式」
（`Trig_FireSword` j:43648、`udg_DarkDragonCastUnit` j:44117/44134/44175/44265 — 黑龍波強化）。

**alt 形態實際改了什麼**：

| | `Uvng` | `U010` |
|---|---|---|
| `uabi` | `AInv,A0OH,A0SO` | `AInv,A0OH,`**`A0IW,A0OI,A0FR`**`,A0SO` |
| `umvs` | 310 | **360**（+50） |
| `ucbs`（施法前搖） | 0.5 | **0.3** |
| `usnd` | （無） | `Shade` |

`A0IW` 是**和魯夫二檔同一支** `AIsx +100% 攻速`（作者共用了 rawcode，名字還留著「76-00-02」）。
`A0OI`「球體(飛影BODY)」與 `A0FR`（黑化2）是純外觀附掛（`Asph`，`SentryWard.mdl` / `LargeBuildingFire1.mdl`）。

同一形態上還有 `A0SO`「**38-002 究極暴走黑龍波**」（base `Aegr`，`areq R00R`）——
一支**被動說明牌**，內文寫「在邪眼全開的狀態下…黑龍波黑龍數量增加為三條，造成大範圍 2500 點傷害」。
它掛在**兩個**形態上，實作在 `U010` 的那批 JASS 裡。
**觸發＝按鈕（無法力！）；解除＝10 秒。**

現況 content doc（`godie-uvng.passive.json`）：`innateKind:"active"` + 10 秒 `applyBuff`（as +100%、ms +16%）。
**缺的是那三支 alt-only 附掛與「黑龍波在變身時變三條」。**

---

### 6.3 61 克勞薩 `Aphx` — 不是笑話，也不是 modder 手滑：這是全圖唯一的自動觸發變身

**先看它的兄弟技，答案整個寫在 tooltip 裡。**
`Aphx` 的 `anam` 是「61-00百連我殺 **效果**」——它是 `A0OM` 的效果半邊。`A0OM`（base **`Asth` Reincarnation**）：

> **61-00 百連我殺**（`atp1`）
> [輔助] 0秒冷卻時間
> 有時候克勞薩先生會將自己當做祭品，藉由把自己殺掉而獲得重生。
> **若克勞薩先生死亡時魔力在 500 點以上**，他將會化身為**死亡老二**，
> 裝甲下降 **10** 點以及最大生命下降 **600**，並在 **10 秒**之後重生。
> **死亡老二被毀壞則無法重生。**

逐項核對原始資料：

| tooltip 說的 | 原始資料 | 對得上？ |
|---|---|---|
| 魔力 ≥ 500 | `Aphx.amcs = 500`（Blizzard 原表 `Cost1 = 0`，是地圖改的） | ✅ 法力成本就是那道門檻 |
| 化身為死亡老二 | `Aphx.Eme1 = U012`（克勞薩II世）→ `Emeu = U011`（`unam` =「**死亡老二**」，`upro` = 克勞薩先生） | ✅ |
| 裝甲 −10 | `U011.udef = **-10**` | ✅ |
| 最大生命 −600 | `U012.uhpm = 150`、`U011.uhpm = **-450**`（150 − 600 = −450） | ✅ 作者是**用減法算絕對值**寫進去的 |
| 10 秒之後重生 | 地圖**沒寫** `ahdu` → 繼承 Blizzard `Aphx.HeroDur1 = **10**`（`War3Patch.mpq: Units\AbilityData.slk`） | ✅ **「null = 繼承」這條規則在這裡直接給出答案** |
| 蛋被毀壞則無法重生 | `Trig_DMC_Deadagain`（j:50698–50724）在 `U011` 死亡時把場上道具清掉、解除暫停 | ✅ |

而且 `U011` 的 `unsf`（名稱後綴）作者自己寫的是 **「(61 鳳凰蛋)」**。
Blizzard 對 `Aphx` 的官方字串（`War3Patch.mpq: Units\HumanAbilityStrings.txt`）是
`Name=鳳凰變形（與蛋相關）`，原表 `DataA1 = hphx`（鳳凰）→ `UnitID1 = hpxe`（鳳凰蛋）。
**這支就是鳳凰的「死了變蛋、蛋孵回鳳凰」機制，被拿來做 DMC 的「假死重生」梗。**

**JASS（`war3map.j:50633–50761`，四支觸發器）**

```jass
// Open Skill of DMC   j:50633-50661
//   條件：GetUnitTypeId(GetTriggerUnit()) == 'U012'  (j:50636)  進場即啟用整組
//   動作：EnableTrigger DMC_Dead / DMC_Deadagain / DMC_Revive / DMC_Ass / DMC_Forst / DMC_Pig / DMC_Evilball / DMC_Kill
//         並喊：「克勞薩II世: 甜蜜的寶貝就是你 你是我那甜蜜的戀人~!」

// DMC Dead   j:50665-50694   事件 EVENT_PLAYER_UNIT_SPELL_EFFECT
//   條件：GetSpellAbilityId() == 'Aphx'          (j:50668)
//     AND GetUnitTypeId(GetTriggerUnit()) == 'U012'   (j:50671)   ← 還是本體 = 「死掉那一半」
    call PauseUnitBJ( true, GetTriggerUnit() )                                      // j:50678 蛋不能動
    call AddSpecialEffectLocBJ( P1, "...MarkOfChaos\\MarkOfChaosTarget.mdl" )        // j:50680
    call CreateNUnitsAtLoc( 1, 'u01P', ..., P1, GetRandomDirectionDeg() )            // j:50682 立一座「屍體」
    call SetUnitAnimation( GetLastCreatedUnit(), "attack" )                          // j:50684

// DMC Revive   j:50728-50761   事件 EVENT_PLAYER_UNIT_SPELL_EFFECT
//   條件：GetSpellAbilityId() == 'Aphx'          (j:50731)
//     AND GetUnitTypeId(GetTriggerUnit()) == 'U011'   (j:50734)   ← 已是蛋 = 「孵回來那一半」
    call PauseUnitBJ( false, GetTriggerUnit() )                                      // j:50746
    call AddSpecialEffectLocBJ( P1, "...Resurrect\\ResurrectTarget.mdl" )            // j:50748
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(..., 'u01P'), KillUnit+RemoveUnit )   // j:50752 收屍體

// DMC Deadagain   j:50698-50724   事件 EVENT_PLAYER_UNIT_DEATH
//   條件：GetUnitTypeId(GetDyingUnit()) == 'U011'   (j:50701)     ← 蛋被打爆
    call PauseUnitBJ( false, GetTriggerUnit() )                                      // j:50713
    call ForGroupBJ( ... 'u01P' ..., KillUnit+RemoveUnit )                           // j:50715
```

**`DMC Dead` / `DMC Revive` 是一對，和 §6.1 魯夫二檔的 `if U00N … else …` 是同一個寫法**：
同一支 `Aphx` 的 spell 事件在「進蛋」和「出蛋」各送一次，靠當下的 `GetUnitTypeId` 分辨。
`PauseUnit(true)` 在進蛋、`PauseUnit(false)` 在出蛋，正好首尾相接——
**如果這是一支「按鈕開關」，暫停住的蛋根本不可能再按第二次；正因為出蛋是引擎在 10 秒後自動做的，這段程式才成立。**

**`u01P` 是什麼**（w3u，base `ugho` 幽魂）：`unam` =「**死亡老二映像**」，
`umdl` = `buildings\naga\TidalGuardian\TidalGuardian.mdl`，`usca` 1.5，`umvs` 0，
`uabi` = `Aloc,A0FR`（蝗蟲＋一顆燒著 `LargeBuildingFire1.mdl` 的球體）。
**它就是那顆「看得見的蛋」** —— 因為 `U011` 自己的模型是 `collision.mdl`（一個空的碰撞模型，看不見）。

**所以三個要回答的問題，答案是：**

- **它到底做什麼**：**死亡替身 / 假死重生**。不是笑話，不是 modder artefact。
- **為什麼變身後「更弱」**：因為 alt 形態本來就該是一顆**無助的蛋** ——
  `umvs 0`（不能動）、`udef −10`、`uhpm −450`、`uhpr 0.0`（不回血）、`usma 0`、`udtm 2.0`、模型不可見。
  「變弱」是設計，不是方向搞反。
- **content doc 的 `innateKind:"passive"` + 空 effects 是不是錯的**：
  **半對。** 玩家確實不按任何鈕（所以是被動），但它有一整套死亡→蛋→10 秒→復活的狀態機，
  effects 空著等於整支技能不存在。

> **這裡有一件 #249 沒抓到、對 GGD 直接有用的事**：這支技的「復活」語意
> 和 GGD 已經有的復活圈（`packages/shared/src/sim/revive.ts`，任務 #84/#206）是同一族。
> 61 的正確落地不是「變身」，是「**死亡時若魔力≥500，進入 10 秒無敵/無助的蛋狀態，時間到自動滿血回來；
> 蛋在這 10 秒內被打死則真死**」。

---

### 6.4 70 白木卡迪那 — 芬多精 ≠ 紮根，而且紮根的門在牆的另一邊

**#249 的驗證員說「A0O6 不在基礎單位的技能列上」——這句是對的，而且比想像的嚴重。**

| 單位 | `uabi`（一般技能列） | `uhab`（可學英雄技能） |
|---|---|---|
| `E00S` 白木卡迪那（**基礎**，`umvs` 275） | `A0ZQ, A0ZM, A0G1, AInv, A0GM` | `A0UJ, A0GQ, A0GR, A0GN, Aamk` |
| `E010` 白木卡迪那（**紮根**，`umvs` **0**、`utyp` `tree`、`udef` 10） | `AInv, A0GM, `**`A0O6`** | `A0GP, A0GQ, A0GR, A0GN, Aamk` |

**兩個 `70-00` 是兩支不同的技能，一形態一支：**

- **`A0G1`「70-00 芬多精」**（base **`Asal`** Pillage）——**基礎形態**的天生技。
  tooltip：「白木卡迪那長年累積的生命精華使得周圍 **250** 的友軍都能加速生命的回復 **5%**。」
  實作在同單位的 `A0GM`「70-00 芬多精(效果)」（base `Aoar` 再生光環，`Oar1 = 0.05`、`aare = 250`）。
  → `content/abilities/godie-e00s.passive.json`（名字「70-00 芬多精」、healthRegen +5%）**是對的，不要動它**。
- **`A0O6`「70-00 紮根」**（base **`ANrg`**）——**紮根形態**的天生技，
  1 級 `Eme1 = E00S → Emeu = E010`、`acdn` 15、`Nrg5`（力量加權）= **+10**、`adur` 0、無 `ahdu`。
  `atp1` =「紮根(等級1) - [D]」、`aut1` =「解除紮根(D)」。
  tooltip：「讓樹人在地面紮根，變得無法移動，但是這可以讓它開始丟出巨大的石塊，轉變為穿刺擴散傷害，
  初使裝甲增加為 **10** 點，力量增加 **10** 點。」（`E010.udef` = 10 ✅、`Nrg5` = 10 ✅）

**所以 #249 說的「mapping 錯了」，錯在哪裡：`godie-e00s.passive` 沒有錯，錯的是把 A0O6 當成 70 的天生技。**
70 的天生技是芬多精；紮根是**第二形態的**天生技，而第二形態在這張圖裡到不了：

1. `E00S.uabi` 裡沒有 `A0O6`（上表）。
2. `grep "'A0O6'" war3map.j` = **0**；沒有任何 `UnitAddAbilityBJ` 給它。
3. 掃過 w3a/w3u/w3t/w3q/w3b/w3d/w3h 每一個字串欄位，`A0O6` 只出現在 `E010.uabi` 一處；
   沒有任何法術書（`Aspb.spb1`）收納它。
4. `grep "'E010'" war3map.j` = **0**；`E010` 不是預置單位、不在 `udg_HeroType[]` 選角表裡
   （70 的選角是 `udg_HeroType[56] = 'E00S'`，j:9153）。
5. 70 的 level-30 EX 走的是另一條路：`Trig_TreeSea`（j:47807–47823）
   → `SetUnitAbilityLevelSwapped('A0ZM', ..., 2)`（樹海降臨法術書），**和紮根無關**。

**而且 `A0O6` 的 2–4 級整組還是 Saber 的：**

| 等級 | `Eme1 → Emeu` | `atp1` | `aub1` |
|---|---|---|---|
| 1 | `E00S → E010` | 紮根(等級1) - [D] | 讓樹人在地面紮根… |
| 2–4 | **`E002 → E00L`** | **開啟風王結界(W)** | **開啟風王結界，每次攻擊消耗…** |

`aret` 甚至是「學習**風王結界**(W)－[等級%d]」。
**`A0O6` 是從 `A0DZ`（20 Saber 風王結界，同為 ANrg）複製出來、只改了 1 級的半成品。**

**結論**：紮根＋`E010` 是這張圖的**孤兒（orphan）**。它有完整的第二形態單位資料
（移速 0、`utyp` tree、`udef` 10、攻擊 650 射程 / `pierce` / `msplash`、hero 技 `A0UJ`→`A0GP` 換底層），
但沒有任何一條路徑走得到。**`content/champions/godie-e010.json` 不存在，也正是因為匯入器從基礎單位出發時走不進去。**

---

### 6.5 （附贈）30 臭作 — 和 70 一模一樣的孤兒，#249 沒點名

同一種病，第二個病人。

| 單位 | `uabi` |
|---|---|
| `Orkn` 臭作（**基礎**） | `AInv, A029, `**`A0YY`** |
| `O030` 電車癡漢（**變身**，`usca` **3.0**、`umvt` fly、射程 **1600**） | `AInv, A029, `**`A0YT`**`, A02I, A08K, A0HN` |

兩支同名「30-002 變態紳士」：

- `A0YY`（base **`Aegr`** Elune's Grace，`areq R00R`）＝**基礎形態上的被動說明牌**，
  tooltip 講的是暴擊撕裂傷，**不會變身**。
- `A0YT`（base `AEIl`，`areq R00R`，`ahdu` 15、`acdn` 60、`amcs` 200）＝**真正的變身**，`Eme1 = Orkn → Emeu = O030`，
  但它**只掛在 `O030` 上**。`grep "'A0YT'" war3map.j` = 0，`grep "'O030'" war3map.j` = 0。
  2–4 級同樣沒改乾淨，`atp1` 寫的是「**紫色披風**(R)」、`Eme1/Emeu` 是 19 安云的 `E00K → E00Z`。

`content/champions/godie-o030.json` 一樣不存在。

**為什麼只有這兩支破掉**：Blizzard 的慣例是**變身技要同時掛在兩個形態上**
（`War3Patch.mpq: Units\UnitAbilities.slk`：`Edem`/`Edmm` 都有 `AEme`；`Ntin`/`Nrob` 都有 `ANrg`；
`hphx`/`hpxe` 都有 `Aphx`），alt 那一份是用來畫「解除」鈕／讓持續時間結束時能變回去的。
26 組裡 24 組都遵守；**只有 30 和 70 少了基礎形態那一份**，於是門只剩內側把手。

---

## 7. 模擬器要有什麼（先讀程式碼，不是讀那張表）

**先更正一件事**：`packages/shared/src/content/templates/expand.ts:54–66` 的 `SIM_CAPABILITIES` 表
在這個分支上**是準的**——我實地查過，不是照抄：

```
$ ls packages/shared/src/sim/movement          # 目錄不存在
$ grep -rn "startLeap" packages/shared/src     # 0 hits
```

`leap: available: false` 屬實（`docs/design/grab-family.md` 引用的
`packages/shared/src/sim/movement/leap.ts` 在 main 上尚未落地）。**這次不重蹈「表說沒有其實有」的覆轍，
但也不能反過來假設表一定錯。**

### 7.1 已經有的（不用做）

| 需求 | 現有機制 | 位置 |
|---|---|---|
| 定時屬性加成 | `applyBuff` + `duration` + `modifiers`（可 `perRank`） | `sim/effects/effectRunner.ts:109-156` |
| 移速歸零／定身 | `applyStatus` 的 `root` / `moveSpeedMult` | `effectRunner.ts:79-108`、`sim/components.ts:185-186` |
| 攻速 / 移速 / 護甲 / 射程 / 迴避 等 18 種屬性 | `Stat` enum | `sim/stats/statTypes.ts:3-31` |
| 每秒扣血（76 的 `A0IX −10/s`） | `healthRegen` 負值 modifier（**現行 content doc 已經這樣做**） | `content/abilities/godie-u00n.passive.json` |
| 事件掛鉤 | `HookEvent`：`onAbilityCast` / `onAbilityHit` / `onBasicAttack` / `onDamageDealt` / `onDamageTaken` / `onKill` / `onLevelUp` | `sim/stats/modifiers.ts:27-34` |
| 死而復生的狀態機骨架 | 復活圈（#84/#206） | `sim/revive.ts` |

**光靠 `applyBuff` 就能忠實表達 23 支「A 形狀」的數值面**（`umvs` 差、`Eme5` 生命加成、`AIsx` 攻速、`Arll` 扣血）。
`content/abilities/godie-u00n.passive.json` 與 `godie-uvng.passive.json` 已經是這個做法，數字對得上 w3a。

### 7.2 還沒有的（#249 / #119 真正要蓋的）

| 形狀 | 缺什麼 | 為什麼 buff 表達不了 |
|---|---|---|
| **A（23 支）** | **形態切換原語**：換模型（`umdl`/`usca`）、換技能列（`uabi` 差集）、換名稱後綴（`unsf`）、換音效組（`usnd`） | buff 只動 `StatBlock`。19 安云 `A0RG→A0RH`、79 一護 `A0LH→A0UV`、26 鄭先生 `A0BS→A0ER` 是**換掉一支技能**，不是加數值 |
| **B（20 / 70）** | **可再按一次關掉的姿態（stance toggle）**：無時限、無冷卻、第二次按下解除 | 現行 ability 一律「按下 → 冷卻」，沒有「維持中／可解除」狀態 |
| **B（20）** | **每次普攻扣資源、資源不足自動失效**（`15+15×level` 法力） | 有 `onBasicAttack` hook，但沒有「hook 內扣法力並在不足時 no-op」的 effect kind（`restore` 只加不減） |
| **C（61）** | **`onDeath`(self) hook** —— `HookEvent` 七個事件裡**沒有自己死亡**（`onKill` 是殺別人） | 死亡→蛋→10 秒→復活，第一步就沒有事件可掛 |
| **C（61）** | **10 秒不可控／不可動／不回血的「蛋」狀態，期間可被擊殺 → 真死** | 復活圈是隊友來救；這裡是自己倒數，而且倒數中被打死就取消 |
| 全部 | **回合邊界重置**：#119 要的「每回合回到基礎形態」 | 地圖**沒有**這件事（§4），所以這是 GGD 自己的設計決定，不是移植 |

### 7.3 建議的落地順序（不在本文範圍，只是把形狀講清楚）

1. **A 形狀先做**，因為它是 23/26，而且數值面已經在 content 裡了 ——
   只要在 `applyBuff` 旁邊加一個「形態」概念（模型 + 技能列覆蓋 + 名稱後綴），23 支立刻有畫面。
2. **B 形狀（2 支）**其實只有 20 Saber 真的可玩（70 是孤兒），可以先做成「無限時 buff + 再按解除」。
3. **C 形狀（1 支）**建議掛到 `revive.ts` 那條線去，不要塞進變身系統。
4. **70 / 30 兩個孤兒**：原始碼裡到不了 ⇒ **GGD 要不要開它是 owner 的內容決定，不是移植決定**。
   本文只負責說清楚「原作到不了」。

---

## 8. 原始碼沉默的地方（明講）

以下這些，**w3x 沒有回答**。任何人接手 #249 都不准在這幾格填空當成「移植」：

1. **回合／局結束時形態怎麼處理。** 這張圖是 AoS，沒有回合制；全圖 0 處在回合／遊戲事件上強制變回。
   GGD 的「每回合重置」（#119）是**新設計**。
2. **變身中死亡會怎樣。** 引擎行為（英雄死了以 alt 型態還是 base 型態復活）原始碼沒寫。
   已知的只有：`Trig_HeroDead` 對 40、79 兩形態都比對死亡台詞（j:15210/15213、j:15241/15244），
   代表作者**預期**得到會死在變身型態，但沒有處理形態。
3. **`ahdu` 到期是否真的會再送一次 `SPELL_EFFECT`。** §6.1 的 `else` 分支與 §6.3 的 `DMC Revive`
   都只有在「會送」的前提下才說得通，而且兩處獨立寫成同一個模式；
   但這是**對 WC3 引擎行為的推論**，原始碼沒有明文。實機驗證前不要當成規格。
4. **`areq h01B`（76 二檔）是否真的把按鈕鎖死。** 事實是硬的（`h01B` 從未被建立）；
   「所以按鈕不可用」是 WC3 科技需求語意的推論。
5. **各 alt 形態的模型／動作。** `Eme3`（高度調整時間）/ `Eme4`（著陸延遲時間）在地圖裡全是 0，
   變身過場沒有任何時間參數；`AEme`/`AEIl` 的 `adur`（非英雄持續時間）全被寫成 0 或 0.1，也是無意義的。
   **變身的視覺過場長度，原始碼是空的。**
6. **平衡意圖。** 例如 42 依文潔琳 999 法力 + 移速 295→160、22 龍宮禮奈 `Eme5` 負生命，
   數字是真的，但「為什麼」原始碼沒說。不要替作者解釋。

---

## 附錄 A：全 26 支一頁速查

```
#   ability  base  normal→alt    ahdu(L1)  acdn  amcs   觸發        解除         JASS
04  A0OE     AEIl  Hjai→H020     20        70    360    按鈕(EX)    20s          —
06  A0Y1     AEme  Ucrl→U034      7        60    200    按鈕        7/14/21s     —
08  A0T1     AEIl  Nbbc→N01C     20        60    200    按鈕(EX)    20s          —
09  A09E     AEIl  Ogrh→O00X      8        60    160    按鈕        8/12/16/20s  j:31686 特效
11  A10N     AEIl  Udre→U01U     15        60    200    按鈕(EX)    15s          —
12  A02W     AEIl  Ewar→E007     12        45    225    按鈕        12→30s       —
18  A0IH     AEIl  Nsjs→N00P      8        60    200    按鈕        8→20s        j:28157 特效
19  A0SZ     AEIl  E00K→E00Z     10        60    200    按鈕(EX)    10s          j:27746 兩形態分岔
20  A0DZ     ANrg  E002→E00L      —         —     0     按鈕(開關)  再按解除鈕   j:32092 每擊耗魔+傷害
22  A02Q     AEIl  E001→E00N      7        60     70    按鈕        7/14/21s     —
25  A0HW     AEIl  Umal→U00L      8        60     80    按鈕        8/16/24s     j:38646 特效
26  A0EW     AEIl  Harf→H00W      7        75    140    按鈕        7/10.5/14s   j:38027 特效
30  A0YT     AEIl  Orkn→O030     15        60    200    ✗ 到不了    (15s)        —   ← 孤兒
38  A0OH     AEme  Uvng→U010     10        60      0    按鈕        10s          —
40  A0ND     AEIl  Nman→N01B     12        75     90    按鈕        12→30s       —
42  A06K     AEIl  N003→N01G      7        60    999    按鈕(EX)    7s           j:37879 特效
58  A040     AEIl  Ofar→O02L      6        60     90    按鈕        6/12/18s     j:40327 鏡像計時
61  Aphx     Aphx  U012→U011     (繼承10)   —    500    ★死亡      10s / 蛋被殺 j:50668 / j:50731 一對
70  A0O6     ANrg  E00S→E010      —        15      0    ✗ 到不了    (再按解除)   —   ← 孤兒
76  A0IR     AEme  U00N→U00O     20        60      0    按鈕(areq)  20s          j:36487 ±敏捷×2
77  A0JG     AEIl  E00W→E00X      6        60     90    按鈕        6→24s        j:5035 受傷派送
79  A0LN     AEme  H01N→H01O      8        60    100    按鈕        8/16/24s     j:37500 alt 專屬
81  A0XP     AEIl  O01Z→O02V     15        60    350    按鈕(EX)    15s          j:35809 alt 專屬
87  A0DB     AEIl  O02N→O02O      6        60     90    按鈕        6→24s        全 0（純 w3a）
90  A0VG     AEme  Hgam→H02R     18        75    350    按鈕(EX)    18s          —
92  A0W9     AEme  H02V→H02U     10        40    160    按鈕        10/10/5/5s   j:45209 定身+光環
```

★ = 全圖唯一的自動觸發。

## 附錄 B：內容庫對照（給 #113 / #249 的交叉線索）

26 組裡有 **22 組的 alt 形態已經被匯入成獨立英雄文件**（`content/champions/godie-<alt>.json`）。
**任務 #113 說的「14 組名稱／模型／數值幾乎相同的英雄文件」，主體就是這批變身對。**

缺件（4 組，各有各的原因）：

| # | 缺 | 原因 |
|---|---|---|
| 26 | `godie-h00w`（alt） | 匯入器未涵蓋 |
| 30 | `godie-o030`（alt） | §6.5 孤兒，從基礎形態走不到 |
| 40 | `godie-n01b`（alt） | 匯入器未涵蓋 |
| 70 | `godie-e010`（alt） | §6.4 孤兒 |
| 87 | `godie-o02n`（**base**！） | 26 組裡唯一基礎形態缺件；`godie-o02o`（alt）反而在 |

**建議**（不在本文範圍執行）：#249 落地時，這 22 組 alt champion doc 不該留在選角池裡當獨立英雄，
它們是**形態資料**。這同時就是 #113 的答案。
