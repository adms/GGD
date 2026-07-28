# Combat timing v2 — cast time & basic-attack overhaul — TODO

Ability **cast time** (`AbilityDef.castTimeSec`, resolved by `CastResolveSystem`)
plus the **basic-attack** overhaul in `sim/systems/BasicAttackSystem.ts`
(per-champion wind-up, ranged auto projectiles at the champion's `missileSpeed`,
on-hit pipeline resolving on impact). Champion attack data lives in
`content/champions/*` (`missileSpeed`, `attackDamagePoint`, `baseAttackTime`).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| ct-01 | Cast with ct>0 resolves effects after the wind-up, not instantly | ct-cast-deferred | unit | done |
| ct-02 | Caster is rooted for the cast duration, free afterward | ct-cast-rooted | unit | done |
| ct-03 | Stun interrupts a cast: no effect, mana stays spent | ct-cast-interrupt | exception | done |
| ct-04 | ct=0 abilities still resolve instantly (skeleton behavior preserved) | ct-zero-instant | regression | done |
| ct-05 | Ranged auto spawns a projectile that damages on impact, not instantly | ba-ranged-impact | unit | done |
| ct-06 | Melee auto applies damage at the damage point after the wind-up | ba-melee-damage-point | unit | done |
| ct-07 | Stun during the wind-up cancels the swing | ba-windup-interrupt | exception | done |
| ct-08 | Item on-hit (Serrated Edge) fires on impact for a ranged carrier | ba-onhit-impact | unit | done |
| ct-09 | Attack interval respects baseAttackTime × attackSpeed | ba-interval | unit | done |
| ct-10 | Per-champion missileSpeed/range read from the champion doc | ba-champion-data | unit | done |

## 打就站定 — 移動中不得出手 (owner 2026-07-28)

回報：「遠程單位在攻擊的時候可以邊移動邊攻擊，這樣對近戰單位來說是不公平的」。

改動前 `BasicAttackSystem` 從來沒有讀過出手者自己在不在動，所以「能不能邊走邊打」
是被**射程**夾出來的副作用：前搖 0.5 s 內目標跑掉 2.95 單位，遠超近戰的 1.6 射程，
卻被遠程 8.2 的射程整碗吸收。補上 WC3 的規則（本作英雄本來就是 WC3 英雄單位改的）：
單位要攻擊就得停下來。傷害點之後不加鎖，所以 hit-and-run 微操自然成立。

唯一的例外是「正朝目標靠近」，而它是**量出來的**：沒有這個例外時
`autoAttackCensus` 立刻點名 14 位近戰英雄在射程內十秒打不出任何一下 —— GGD 每次
命中都帶擊退（WC3 沒有），被打飛之後走回去會被誤判成玩家在跑。

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| ct-11 | 風箏關閉：後退中一刀都揮不出來，且目標全程在射程內（儀器活著） | ba-standstill-kite | unit | done |
| ct-12 | 同一個單位站定就打得出來 —— 差別只有「有沒有在走」 | ba-standstill-stationary | unit | done |
| ct-13 | 純側移／繞圈也不能出手：靠近速度 ≈ 0 不算靠近 | ba-standstill-strafe | unit | done |
| ct-14 | 走位不會白燒攻擊間隔：擋在冷卻 commit 之前，停下來那一刻就能出手 | ba-standstill-no-cd-burn | unit | done |
| ct-15 | 前搖中途走掉：這一刀作廢、不觸發 whiff、冷卻不退 | ba-standstill-cancel-no-refund | exception | done |
| ct-16 | 判定讀實際位移而非移動意圖：推著牆推不動＝站著，照樣出手 | ba-standstill-blocked | regression | done |
| ct-17 | 唯一例外：朝目標靠近的途中可以出手（近戰接近戰、被擊退後歸位） | ba-standstill-closing | unit | done |
| ct-18 | 靠近門檻與移動門檻是同一個數：擦邊的斜向靠近不算靠近 | ba-standstill-closing-threshold | unit | done |
