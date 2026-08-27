# 「連段→收尾」29 個 JASS 函式 —— 完整對照表（GH#541）

> ⛔ **這份是 `python3 tools/jass-combo/extract.py` 產生的，不可以手改。**
> 紅了跑那一行然後 `git add`。`--check` 逐位元組比對。

owner 2026-08-22 逐字判準（⛔ 不要改）：函式裡**同時**有 `TriggerSleepAction|PolledWait` **且**有 `UnitDamageTarget|UnitDamagePoint|UnitDamageArea`。

| 總數 | per-step | loop | tail | 串到 GGD ability id |
|---:|---:|---:|---:|---:|
| **29** | 5 | 9 | 15 | **18 / 29** |

⭐ **間隔就是動畫節奏的來源** —— `間隔序列` 是從 `war3map.j` 逐字抄的，⛔ 沒有四捨五入、⛔ 沒有統一成 0.12。
`W<秒>` = 一次等待、`D` = 一次傷害呼叫，照原始碼順序。

## 29 列

| # | JASS 函式 | 行號 | rawcode | GGD abilityId | 技能名（w3x） | 形狀 | 間隔序列 | 傷害次數 | gate |
|---:|---|---:|---|---|---|---|---|---:|---|
| 1 | `Trig_TowerSP_Actions` | 13141 | — | ⛔ — | — | tail | `W0.01 D` | 1 | GetEventDamageSource |
| 2 | `Trig_FireLord_Actions` | 25025 | I06I | ⛔ — | 炎神弩 | tail | `W0.2 D` | 1 | — |
| 3 | `Trig_LokDeathEye_Actions` | 25170 | A0QR | ⛔ — | CP-00 死神之眼 | tail | `W1 D` | 1 | — |
| 4 | `Trig_Stumble_Actions` | 25196 | AHtb | ⛔ — | CP-摔技 | tail | `W0.2 W0.2 W0.2 W0.2 W0.2 W0.2 W0.1 W0.1 W0.1 W0.1 D W1` | 1 | — |
| 5 | `Trig_DragonTigerReady_Actions` | 25704 | A0J2 | ⛔ — | 00-00 龍虎亂舞 | loop | `W0.3 W0.05 W0.5 W0.05 W0.1 W0.05 W0.5 D` | 1 | — |
| 6 | `Trig_Near_To_Death_Actions` | 25912 | A0AC | ⛔ — | Near to Death | per-step | `W1 D W0.25 D W0.25 D W0.25 D W0.25 D W0.25 D W0.25 D W0.25 D W0.25 D W0.25 D W0.25 D W0.25 D W0.25 D W0.25 D W0.25 D W0.25 D W0.25` | 16 | — |
| 7 | `Trig_XHunterStone_Actions` | 26960 | A08Y | godie-u034.passive<br>godie-ucrl.passive | 06-00 猜猜拳 | loop | `D W0.5 D W2` | 2 | GetUnitAbilityLevel、udg_EX_Mode |
| 8 | `Trig_XHunter_Actions` | 27230 | A08Y | godie-u034.passive<br>godie-ucrl.passive | 06-00 猜猜拳 | tail | `D D W2` | 2 | GetUnitAbilityLevel、udg_EX_Mode |
| 9 | `Trig_plant_Actions` | 27908 | A0RV | godie-n00p.w<br>godie-nsjs.w | 18-02 寄生種子 | per-step | `W0.01 D W5 D W2` | 2 | GetUnitAbilityLevel、udg_EX_Mode |
| 10 | `Trig_Romove_Actions` | 29084 | A06P | godie-u01u.e<br>godie-udre.e | 11-03 鬼氣九刀流-阿修羅壹霧銀 | loop | `W0.5 W0.5 D` | 1 | — |
| 11 | `Trig_LinaS_Actions` | 29777 | A07F | godie-h020.r<br>godie-hjai.r | 04-04 神滅斬 | loop | `D D W0.5 W0.5` | 2 | GetUnitAbilityLevel |
| 12 | `Trig_HolySword_Actions` | 31224 | A0OD | ⛔ — | 23-04 雷焰聖劍 | loop | `D W0.5` | 1 | GetUnitAbilityLevel、udg_EX_Mode |
| 13 | `Trig_Empty_Actions` | 31457 | A044 | ⛔ — | 16-03 無無明亦無 | tail | `W0.5 D W1` | 1 | GetUnitAbilityLevel |
| 14 | `Trig_ExcaliburMAX_Actions` | 32559 | A0CT | godie-e002.r<br>godie-e00l.r | 20-04 Avalon-永恆的理想鄉 | loop | `D W0.1 W0.3 W0.2 W0.5 W4` | 1 | GetEventDamageSource、udg_EX_Mode、udg_IsAvalonReady |
| 15 | `Trig_XFight_Actions` | 33409 | A072、A0AZ | godie-hart.q | 01-01 凶斬<br>01-01r 囧斬 | tail | `W0.1 D W0.3` | 1 | GetUnitAbilityLevel |
| 16 | `Trig_Toro_Rotation_Actions` | 33465 | A000 | godie-hart.e | 01-03 畫龍點睛 | tail | `W0.01 W0.1 D` | 1 | GetUnitAbilityLevel |
| 17 | `Trig_SuperFF7_Actions` | 33799 | A077、A0B1 | godie-hart.r | 01-04 超究武神霸斬<br>01-04r 超究武神霸斬 - 改 | loop | `W0.2 W0.6 W0.4 W0.2 D D W0.5 W1` | 2 | GetUnitAbilityLevel、udg_EX_Mode |
| 18 | `Trig_Luf_Axe_Effect_Actions` | 36342 | A0IS | godie-u00n.q<br>godie-u00o.q | 76-01 伸縮自如的橡膠戰斧 | tail | `W0.15 W0.2 W0.05 D` | 1 | — |
| 19 | `Trig_Luf_RockFire_D8_Actions` | 36547 | A0IP | godie-u00n.w<br>godie-u00o.w | 76-02 伸縮自如的橡膠火箭砲 | tail | `W0.05 W0.1 D` | 1 | — |
| 20 | `Trig_Bleach_Rush_Actions` | 37401 | A0RX | godie-h01n.q<br>godie-h01o.q | 79-01 瞬步 | per-step | `W0.1 D W0.3 D D W0.3 D` | 4 | GetUnitAbilityLevel |
| 21 | `Trig_Bleach_Strike_Actions` | 37471 | A0LK | godie-h01n.w<br>godie-h01o.w | 79-02 斬擊 | tail | `W0.1 D` | 1 | GetUnitAbilityLevel |
| 22 | `Trig_YouDie_Actions` | 38595 | A0AF | godie-u00l.q<br>godie-umal.q | 25-01 北斗懺悔拳 | per-step | `W1 W1 W1 D D` | 2 | GetUnitAbilityLevel、udg_EX_Mode |
| 23 | `Trig_FlySwallow_Actions` | 41663 | A030 | ⛔ — | 27-04 忍法暗殺奧義-飛燕閃 | per-step | `W0.1 D D W0.1` | 2 | udg_EX_Mode |
| 24 | `Trig_Spell_Mark_Actions` | 41715 | A08Y | godie-u034.passive<br>godie-ucrl.passive | 06-00 猜猜拳 | tail | `W10 D` | 1 | GetUnitAbilityLevel |
| 25 | `Trig_LightCutRun_Actions` | 41943 | A0IJ | godie-edem.e | 45-03 千鳥 | loop | `D D W0.1 W2 W2` | 2 | GetUnitAbilityLevel |
| 26 | `Trig_MagicUp_Actions` | 46924 | A0CH | godie-udea.e | 65-03 魔法膨脹 | tail | `D W1` | 1 | GetUnitAbilityLevel |
| 27 | `Trig_MoriyaShadow_Actions` | 47235 | A07W | ⛔ — | 75-02 幻影鬥氣 | tail | `D W0.5` | 1 | GetUnitAbilityLevel |
| 28 | `Trig_Nine_Lives_Hits_Actions` | 52140 | A0U5 | godie-hapm.ex | 52-002 射殺百頭 | loop | `D W0.3 W0.4 D W0.6` | 2 | — |
| 29 | `Trig_Hundred_Sky_Actions` | 54617 | A0Y9 | ⛔ — | 95-04 藍色戰氣一百重天 | tail | `W0 D` | 1 | GetUnitAbilityLevel |

## ⛔ 補不完的那幾個 —— 每一筆都是一個能被反駁的理由

### `Trig_TowerSP_Actions`（13141 行，map-mechanic）

地圖防禦塔機制，⛔ 不是英雄技能：InitTrig_TowerSP@13153 把它直接註冊在 ~20 座具名塔單位（gg_unit_uzg1_0146 …）的 EVENT_UNIT_DAMAGED 上，傷害由 udg_AttackTowerUnit 發出、隨 udg_TowerCounter 疊加。整條鏈上沒有任何 GetSpellAbilityId，也沒有任何英雄綁定 ⇒ GGD 沒有對應的 ability。

### `Trig_FireLord_Actions`（25025 行，item）

它是**道具**「炎神弩」（I06I ⇒ content/items/godie-i06i.json）的普攻觸發，⛔ 不是英雄技能 ⇒ 沒有 ability id。⭐ 它有 GGD 對應物，只是住在 items 不是 abilities。

### `Trig_LokDeathEye_Actions`（25170 行，unit）

A0QR 在 provenance 裡沒有 id，因為它的持有者是**非英雄單位** n012「路克」（OBJECTS.json units），而 GGD 的 71 位英雄名單裡沒有 godie-n012 ⇒ 沒有可以指的 ability id。⭐ 反駁法：哪天 content/champions/ 出現 godie-n012，這一筆就要改成 ability。

### `Trig_Stumble_Actions`（25196 行，unit）

AHtb 的持有者是英雄 U01F「萬夫莫敵 黑化張飛」，而 GGD 目前 71 位英雄裡**沒有** godie-u01f ⇒ 沒有可以指的 ability id。⭐ 反駁法：這位英雄被移植進 content/champions/ 的那一天，這一筆就要改成 ability。

### `Trig_DragonTigerReady_Actions`（25704 行，map-mechanic）

⛔ 它不屬於任何英雄：A0J2 只在 13868 / 13976 兩行被 UnitAddAbilityBJ 加給**遊戲結束時的終結者**（Trig_GameOver_Red/Green_Actions），tooltip 標籤是 [亂鬥]、編號寫成 00-00（＝無英雄）⇒ 它是**地圖模式的終局演出技**，不是技能表上的技能。

### `Trig_Near_To_Death_Actions`（25912 行，orphan）

原作裡的**孤兒技能**：A0AC 在 OBJECTS.json 的 461 個單位 + 127 位英雄的技能表裡**一個都沒有**，war3map.j 裡也沒有任何 UnitAddAbility 授予它（全檔只出現在自己的 Conditions 那一行），而且 tooltip 還是未翻譯的英文（base=AHbn）⇒ 它是從別的地圖抄進來、**沒有接完**的殘留 ⇒ 沒有英雄可以歸屬。

### `Trig_HolySword_Actions`（31224 行，ability）

`A0OD`（23-04 雷焰聖劍） 在 w3x-ability-provenance.json 裡對不到**任何活著的** GGD 技能 ⇒ 這條連段的持有者已經不在 content/abilities/(英雄下架或改編號)。⭐ 要反駁它:讓那支技能重新出貨,或在 RESOLUTION 裡指定 ownerRawcodes。

### `Trig_Empty_Actions`（31457 行，ability）

`A044`（16-03 無無明亦無） 在 w3x-ability-provenance.json 裡對不到**任何活著的** GGD 技能 ⇒ 這條連段的持有者已經不在 content/abilities/(英雄下架或改編號)。⭐ 要反駁它:讓那支技能重新出貨,或在 RESOLUTION 裡指定 ownerRawcodes。

### `Trig_FlySwallow_Actions`（41663 行，ability）

`A030`（27-04 忍法暗殺奧義-飛燕閃） 在 w3x-ability-provenance.json 裡對不到**任何活著的** GGD 技能 ⇒ 這條連段的持有者已經不在 content/abilities/(英雄下架或改編號)。⭐ 要反駁它:讓那支技能重新出貨,或在 RESOLUTION 裡指定 ownerRawcodes。

### `Trig_MoriyaShadow_Actions`（47235 行，ability）

`A07W`（75-02 幻影鬥氣） 在 w3x-ability-provenance.json 裡對不到**任何活著的** GGD 技能 ⇒ 這條連段的持有者已經不在 content/abilities/(英雄下架或改編號)。⭐ 要反駁它:讓那支技能重新出貨,或在 RESOLUTION 裡指定 ownerRawcodes。

### `Trig_Hundred_Sky_Actions`（54617 行，ability）

`A0Y9`（95-04 藍色戰氣一百重天） 在 w3x-ability-provenance.json 裡對不到**任何活著的** GGD 技能 ⇒ 這條連段的持有者已經不在 content/abilities/(英雄下架或改編號)。⭐ 要反駁它:讓那支技能重新出貨,或在 RESOLUTION 裡指定 ownerRawcodes。

## 怎麼解析出來的

| JASS 函式 | 解析路徑 |
|---|---|
| `Trig_TowerSP_Actions` | none |
| `Trig_FireLord_Actions` | item:Trig_FireLord_Func014C@25003 要求 UnitHasItemOfTypeBJ(GetAttacker(),'I06I') |
| `Trig_LokDeathEye_Actions` | conditions:GetSpellAbilityId()=='A0QR'（CP-00 死神之眼），技能表掛在單位 n012「路克」身上 |
| `Trig_Stumble_Actions` | conditions:GetSpellAbilityId()=='AHtb'（CP-摔技），技能表掛在英雄 U01F「黑化張飛」身上 |
| `Trig_DragonTigerReady_Actions` | conditions:GetSpellAbilityId()=='A0J2'（00-00 龍虎亂舞） |
| `Trig_Near_To_Death_Actions` | conditions:GetSpellAbilityId()=='A0AC'（Near to Death） |
| `Trig_XHunterStone_Actions` | conditions:GetSpellAbilityId |
| `Trig_XHunter_Actions` | unit-type:Trig_XHunter_Conditions@27155 要求 GetUnitTypeId(GetAttacker())=='U034'（職業獵人 傑 富力士）；這是猜猜拳普攻被動的另一半，主體 Trig_XHunterStone 的 Conditions 直接指名 A08Y。石頭/剪刀/布 三支的傷害分別讀 A020 / A08W / A08X 的等級 |
| `Trig_plant_Actions` | conditions:GetSpellAbilityId |
| `Trig_Romove_Actions` | parent-trigger:Trig_Roaction_Actions@28990 於 29039 行 EnableTrigger(gg_trg_Romove)；傷害公式 28995 行讀 A06P 等級，28984 行要求 GetUnitTypeId(udg_RoMaster)=='U01U'（索隆） |
| `Trig_LinaS_Actions` | conditions:GetSpellAbilityId |
| `Trig_HolySword_Actions` | conditions:GetSpellAbilityId |
| `Trig_Empty_Actions` | conditions:GetSpellAbilityId |
| `Trig_ExcaliburMAX_Actions` | global:udg_saber（31991 行由 Trig_Open_Skill_of_Saber_Actions 在 GetUnitTypeId=='E002' 時設定）+ udg_IsAvalonReady（32383 行由 Trig_avalonReady_Actions 設 true，其 Conditions@32375 要求 GetSpellAbilityId()=='A0CT'）⇒ 這是傷害事件觸發，⛔ 沒有自己的 GetSpellAbilityId |
| `Trig_XFight_Actions` | conditions:GetSpellAbilityId |
| `Trig_Toro_Rotation_Actions` | parent-trigger:Trig_Toro_Actions@33349 於 33366 行 EnableTrigger；Trig_Toro_Func006C@33329 要求 GetSpellAbilityId()=='A000'，本體用 udg_FF7_CloudUnit 綁克勞德 |
| `Trig_SuperFF7_Actions` | conditions:GetSpellAbilityId |
| `Trig_Luf_Axe_Effect_Actions` | parent-trigger:Trig_Luf_Axe_Actions@36256 於 36282 行 EnableTrigger；Trig_Luf_Axe_Func001C@36243 要求 GetSpellAbilityId()=='A0IS' |
| `Trig_Luf_RockFire_D8_Actions` | conditions:GetSpellAbilityId |
| `Trig_Bleach_Rush_Actions` | conditions:GetSpellAbilityId |
| `Trig_Bleach_Strike_Actions` | buff:Trig_Bleach_Strike_Conditions@37459 要求 UnitHasBuffBJ(GetAttacker(),'B02E') 且攻擊者 == udg_BleachUnit；本體讀 A0LK（79-02 斬擊）等級算傷害 |
| `Trig_YouDie_Actions` | conditions:GetSpellAbilityId |
| `Trig_FlySwallow_Actions` | conditions:GetSpellAbilityId |
| `Trig_Spell_Mark_Actions` | sub-ability:掃到的 A04W（06-00x 布緩速）在 provenance 裡沒有自己的 id —— 它是猜猜拳「布」分支在 27291 行 UnitAddAbilityBJ 給 dummy 單位的子技能 ⇒ 歸屬 A08Y（06-00 猜猜拳） |
| `Trig_LightCutRun_Actions` | parent-trigger:Trig_LightCut_Actions@41794 於 41823 行 EnableTrigger；Trig_LightCut_Conditions@41778 要求 GetSpellAbilityId()=='A0IJ' |
| `Trig_MagicUp_Actions` | conditions:GetSpellAbilityId |
| `Trig_MoriyaShadow_Actions` | unit-type:Trig_MoriyaShadow_Conditions@47217 要求 GetUnitTypeId(GetAttacker())=='U00B'（飛鼠先生）；本體 47240 行讀 A07W（75-02 幻影鬥氣）等級算傷害 |
| `Trig_Nine_Lives_Hits_Actions` | parent-trigger:Trig_Nine_Lives_EX_Actions@52057 於 52080 行 EnableTrigger；Trig_Nine_Lives_EX_Conditions@52051 要求 GetSpellAbilityId()=='A0U5' |
| `Trig_Hundred_Sky_Actions` | conditions:GetSpellAbilityId |
