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

## 打就站定 — 移動中不得出手 (owner 2026-07-28, GH#193 第二步)

回報:「遠程單位在攻擊的時候可以邊移動邊攻擊,這樣對近戰單位來說是不公平的」/
「並且殭屍王也會預設套用」/「整體這個功能在後台也是個開關」。

改動前 `BasicAttackSystem` 從來沒有讀過出手者自己在不在動,所以「能不能邊走邊打」
是被**射程**夾出來的副作用。量到的數字(出貨 bundle,115 位):近戰 82 位射程
中位數 1.6 / 前搖 8 tick;遠程 33 位射程 8.2 / 前搖 9 tick;移速幾乎一樣。
⚠️ 不對稱**不在前搖**(遠程的預設前搖其實比近戰長),在**射程差五倍**。

規則與參數住在 `packages/shared/src/sim/combatFeel.ts`(`config.combat-feel@1`,
後台可調:`enabled` / `walkEps` / `applyToMobs`)。

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| ct-11 | 風箏關閉:後退中一刀都揮不出來,而同一個人站定就打得出來(儀器活著) | ss-kite-vs-stand | unit | done |
| ct-12 | 後台開關關掉 = 舊行為(邊走邊打) | ss-switch-off | unit | done |
| ct-13 | 走位不會白燒攻擊間隔:整段走位下來冷卻一次都沒被扣過(閘在 commit 之前) | ss-no-cd-burn | unit | done |
| ct-14 | 前搖中途走掉:那一刀作廢、不觸發 whiff、冷卻不退 | ss-cancel-midwindup | exception | done |
| ct-15 | 讀實際位移而非移動意圖:推著場地邊界推不動 = 站著,照樣出手 | ss-blocked-counts-as-still | regression | done |
| ct-16 | 被擠在柱子上磨蹭時照樣出手 —— 碰撞抖動不是「在走」 | ss-obstacle-jitter | regression | done |
| ct-17 | 殭屍/殭屍王同樣受約束,而站定的同一隻照樣打(儀器活著) | ss-mob-bound | unit | done |
| ct-18 | 小怪與英雄讀同一張後台表:`applyToMobs` 關掉,走動中的殭屍又能打 | ss-mob-switch | unit | done |

## 戰鬥手感設定表 (`config.combat-feel@1`) 的純函式層

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| cf-01 | 擊退門檻:低於 minPct 完全不推,剛好到門檻就開始推 | kb-minpct | unit | done |
| cf-02 | 百分比越高推越遠,線性 | kb-linear | unit | done |
| cf-03 | 一擊超過 100% 生命也只推 maxBodies | kb-cap | unit | done |
| cf-04 | 減距離:同一發傷害,近戰推得動、遠程推不動 | kb-gap | unit | done |
| cf-05 | 分母是最大生命(殘血不會被推更遠;6000 血的王不被推) | kb-maxhp | unit | done |
| cf-06 | 退化輸入不炸也不反向吸人 | kb-degenerate | unit | done |
| cf-07 | 三個參數真的是參數,不是寫死的常數 | kb-params | unit | done |
| cf-08 | 缺文件 / 壞文件 / 錯 schema → **出貨預設**,不是空表 | cf-doc-fallback | exception | done |
| cf-09 | 逐格退回:一格填錯不會把整張表丟掉 | cf-per-key | exception | done |
| cf-10 | 負值被夾住(負擊退 = 吸人,不能從打錯的設定冒出來) | cf-clamp | exception | done |
| cf-11 | 站定開關是布林,非布林退回預設 | cf-standstill-doc | exception | done |
| cf-12 | 整份文件讀得進來 | cf-doc-read | unit | done |
