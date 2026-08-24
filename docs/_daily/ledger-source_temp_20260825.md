# 逐則對票 · owner 原話全文 2026-08-25

> ⭐ `docs/_daily/2026-08-25.md` 的表格那一格是**截斷**過的,全文在這裡。
> 由 `scripts/message-ledger.sh` 從 session transcript 產生 —— ⛔ 不要手改。
> `scripts/asked-before.sh` 會 grep 這一份找 owner 的原話。

## 01:07

等你push note deploy 完以後來執行以下史詩計畫

Abilities\Spells\Orc\WarStomp\WarStompCaster.mdl
Abilities\Spells\Orc\EarthQuake\EarthQuakeTarget.mdl
Abilities\Spells\Human\ThunderClap\ThunderClapCaster.mdl
Abilities\Spells\Human\ReviveHuman\ReviveHuman.mdl (光束砲蝗蟲群常用)
Abilities\Spells\Other\Awaken\Awaken.mdl (光束砲蝗蟲群常用)
Abilities\Weapons\FragDriller\FragDriller.mdl (燃燒爆炸蝗蟲群常用)
Abilities\Spells\Human\MarkOfChaos\MarkOfChaosTarget.mdl  (燃燒爆炸蝗蟲群常用)
...
以上這些都是蝗蟲群、JASS特效常用模組(請你掃描建md檔把參數都記載清楚)，請你一定要實作其大小顏色透明度等參數對應接上
而蝗蟲群全部的設定幾乎都放到了w3x地圖中的 自訂部隊->人類->近戰->部隊 當中

悟空我驗收起來 特效完全沒看到最重要的蝗蟲群
部隊- Create 1 特效龜派 for (Owner of (Casting unit)) at LocPoint3 facing (Angle from LocPoint1 to LocPoint2) degrees
JASS：
call CreateNUnitsAtLoc( 1, 'h007', GetOwningPlayer(GetSpellAbilityUnit()), udg_LocPoint3, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2) )
當中的 特效龜派 就是蝗蟲群

我建議你所有JASS技能、部隊單位是蝗蟲群 都請你各自建表建md檔互相對應參數跟演出時序，才能做到完美的技能特效移植，不能靠盲猜，請你列為一個大計畫md持續追蹤直到做完為止並同步對話開票整理到 戰情版md /goal

## 02:41

給你參考
skills:sync 把我的光束改動打回來了，因為 e002/e00r 是由產生器自動生成的（heroes/*.py），我剛才直接改到產物、繞過了 hook。接下來要改回正確的來源檔案，再重新產生。
=> 這個問題發生上百次了，為什麼總是會改到產物而不是產生器？是否可以把產物放在特定資料夾作為隔離區，只能靠產生器去操作修改產物內容？請將這個列為開發守則，生成script

## 02:51

#669 功能級驗收頁 → #672/#673 龍虎亂舞與 Beam 系列的天譴式驗收（含 static 十具沿線，在 #673 等你裁）→ #674 骨頭錨點內容批

GH#688 蝗蟲群保真移植
#688 三軸掃描完成（236 隻 dummy · 644 生成點 · 7 支 MDL 逐支建檔）

[重要]記得所有這些球體、蝗蟲群特效 都要變成模板，可以被編輯器複用、成為JSON設定模板標籤

蝗蟲群、JASS特效常用模組(請你掃描建md檔把參數都記載清楚)，請你一定要實作其大小顏色透明度等參數對應接上
而蝗蟲群全部的設定幾乎都放到了w3x地圖中的 自訂部隊->人類->近戰->部隊 當中

悟空我驗收起來 特效完全沒看到最重要的蝗蟲群
部隊- Create 1 特效龜派 for (Owner of (Casting unit)) at LocPoint3 facing (Angle from LocPoint1 to LocPoint2) degrees
JASS：
call CreateNUnitsAtLoc( 1, 'h007', GetOwningPlayer(GetSpellAbilityUnit()), udg_LocPoint3, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2) )
當中的 特效龜派 就是蝗蟲群

所有JASS技能、部隊單位是蝗蟲群 都請你各自建表建md檔互相對應參數跟演出時序，才能做到完美的技能特效移植，不能靠盲猜，請你列為一個大計畫md持續追蹤直到做完為止並同步對話開票整理到 戰情版md
