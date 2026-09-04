# VFX Forge 八招視覺證據

這些檔案由 Editor 的真 CameraRig／VfxSystem／3D Model 畫面擷取。結構測試只能當守衛；以下圖片才是本輪視覺評價依據。

| 技能 | 代表舞台圖 | 連續／補充影格 | 結論 |
|---|---|---|---|
| 龍破斬 | [stage](./stage_01_dragon_slave.png) | [飛行](./01_dragon_slave_projectile.png) · [爆炸](./02_dragon_slave_explosion.png) | 定距後爆炸成立；可再提升龍形辨識度。 |
| 神滅斬 | [stage](./stage_02_ragna_blade.png) | [dash](./03_ragna_dash.png) · [斬擊](./04_ragna_slash.png) | dash 斬擊成立。 |
| 超究武神霸斬 | [stage](./stage_03_omnislash.png) | [首刀](./05_omnislash_strike1.png) · [連段](./06_omnislash_combo.png) · [終結](./07_omnislash_finisher.png) | 七刀與黃藍直立終結成立；藍色仍集中在柱底。 |
| 阿邦快速劍X | [stage](./stage_04_avan_x.png) | [A 波](./08_avan_x_wave.png) · [B dash](./09_avan_x_dash.png) | B 成立；A 被 ability-owned `imported.crescent` 白卡阻擋，未通過最終驗收。 |
| 龍鬥氣砲咒文 | [stage](./stage_05_dragon_aura.png) | [beam](./17_dragon_aura_beam.png) | 藍色 MDL 主體成立；main RedDragonMissile 紅條仍需修。 |
| 龜派氣功 | [stage](./stage_06_kamehameha.png) | [beam](./16_kamehameha_beam.png) | 橘色 MDL 主體與輔助脈衝成立。 |
| 理想鄉 EX | [stage](./stage_07_avalon.png) | [反擊](./10_avalon_reflect.png) · [連段](./11_avalon_combo.png) · [終結](./12_avalon_finisher.png) | 反擊、斬擊、橫向終結砲成立。 |
| 騎英之手綱 | [stage](./stage_08_bellerophon.png) | [dash](./13_bellerophon_dash.png) · [beam](./14_bellerophon_beam.png) · [impact](./15_bellerophon_impact.png) | Rider 本體 dash、藍色橫砲與命中成立。 |

## 強制失敗條件

- 任何魔法陣、衝擊波、貼圖或模型露出矩形底色／白卡。
- 用大量 additive 粒子把畫面疊成白色，卻沒有可讀的核心形狀。
- 角色應 dash／連斬，但只有替身模型或粒子在動。
- 氣功砲沒有旋轉 90° 的 ReviveHuman MDL 主體，只有粒子。
- 有 script 的技能仍把相同預設綁定疊畫一次。

`stage_04_avan_x.png` 與 `stage_05_dragon_aura.png` 刻意保留來源阻擋的證據，不以裁圖或多加特效掩蓋。
