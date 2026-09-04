# Editor VFX 模板候選 → Main 參考收編

狀態：**advisory-only** · 指紋 `e8514105cb11`

這是 VFX Forge 已有共用配方的機器產物。Main 造積木，Editor 組積木；列在這裡不代表 Main 應把每個技能配方寫進 runtime。

## 目前真正阻塞的積木接縫

- `model-fx-owned-emitter-instance-inheritance`：模型本體能吃 instance 的縮放、方向與顏色，但 `model@1.fxEmitters` 目前只拿到出生座標。結果是藍白／黃藍配方仍出現固定黃色大球。Main/Owner 可自行決定 API；Editor 只要求語意等價、可收據驗證的 per-instance 繼承或覆寫能力。

## 收編原則

- 只有多個 Editor 模板重複需要同一個低階能力，且現有 Main primitive/contract 無法表達時，才建議 Main 收編或擴充積木；技能時間軸與配色仍留在 Editor。
- 同類候選使用 familyId/type1、type2… 表示可替換變體；編號只描述積木差異，不綁技能。Main 可依既有命名與 Owner 決策重新命名或不收編。
- 設計師先選家族，再選可直接試放的 type 預設；套用後展開為標準積木與時間軸，矩陣／slider 只做最後微調，不要求設計師從零調出每個視覺。
- 本次保存 57 個 type 成果：21 個可選完整配方，加上 36 個已在 42／46 使用的機制推薦；不把既有成果丟回矩陣重調。
- Editor 修明顯大錯：顏色、方向、形狀、尺度、物理意義。亮度、密度、數幀節奏、鏡頭手感與美術偏好只送人工微調。
- AI 與本檔都沒有 Promote 權限；人工批核前不得套回正式內容。

## 已有 Editor 共用配方

| 家族變體 | 配方 | 驗收技能 | 組成 | 給 Main 的建議 |
| --- | --- | --- | --- | --- |
| `classic-horizontal-beam/type1` | `classic-beam-fire` 經典橘金氣功砲 | godie-ogrh.r<br>godie-o00x.r | anim + modelFx + vfx | 檢查上列低階缺口；其餘時間軸留 Editor |
| `classic-horizontal-beam/type2` | `classic-beam-blue` 經典藍白氣功砲 | godie-nbbc.e | anim + modelFx + vfx | 檢查上列低階缺口；其餘時間軸留 Editor |
| `classic-horizontal-beam/type3` | `classic-beam-holy` 黃藍聖光砲 | — | anim + modelFx + vfx | 檢查上列低階缺口；其餘時間軸留 Editor |
| `classic-horizontal-beam/type4` | `classic-beam-void` 紫黑虛空砲 | — | anim + modelFx + vfx | 檢查上列低階缺口；其餘時間軸留 Editor |
| `classic-horizontal-beam/type5` | `classic-beam-inferno` 紅橘高熱砲 | — | anim + modelFx + vfx | 檢查上列低階缺口；其餘時間軸留 Editor |
| `classic-horizontal-beam/type6` | `classic-beam-electric` 青藍電能砲 | — | anim + modelFx + vfx | 檢查上列低階缺口；其餘時間軸留 Editor |
| `classic-horizontal-beam/type7` | `energy-beam-lightning-thin` 細束青藍雷射 | — | anim + screenShake + vfx | 參考即可；維持 Editor 組合模板 |
| `classic-horizontal-beam/type8` | `energy-beam-lightning-wide` 寬幅青藍電砲 | — | anim + screenShake + vfx | 參考即可；維持 Editor 組合模板 |
| `classic-horizontal-beam/type9` | `energy-beam-holy-wide` 寬幅黃白聖光砲 | — | anim + screenShake + vfx | 參考即可；維持 Editor 組合模板 |
| `classic-horizontal-beam/type10` | `energy-beam-void-wide` 寬幅紫黑虛空砲 | — | anim + screenShake + vfx | 參考即可；維持 Editor 組合模板 |
| `dash-beam/type1` | `rider-dash-beam-blue` Rider 突進＋藍光束 | godie-hvsh.r | anim + bodyMove + modelFx + screenShake + vfx | 檢查上列低階缺口；其餘時間軸留 Editor |
| `projectile-impact/type1` | `line-blast-fire` 定距火球＋落點爆炸 | godie-hjai.e<br>godie-h020.e | anim + screenShake + vfx | 參考即可；維持 Editor 組合模板 |
| `dash-slash/type1` | `dash-slash-void` 黑紫衝刺斬 | godie-hjai.r | anim + bodyMove + screenShake + vfx | 參考即可；維持 Editor 組合模板 |
| `dash-slash/type2` | `shockwave-dash-light` 衝擊波＋追身光斬 | godie-nbbc.r | anim + screenShake + vfx | 參考即可；維持 Editor 組合模板 |
| `combo-finisher/type1` | `combo-slash-holy` 黃藍多段斬＋終結柱 | godie-hart.r | anim + vfx | 參考即可；維持 Editor 組合模板 |
| `combo-finisher/type2` | `avalon-counter-chain` 理想鄉反擊七斬 | godie-e002.ex<br>godie-e00l.ex | anim + bodyMove + floatingText + modelFx + screenShake + vfx | 檢查上列低階缺口；其餘時間軸留 Editor |
| `defense-reaction/type1` | `reflect-counter-open` 反彈成功起手 | godie-e002.ex<br>godie-e00l.ex | anim + vfx | 參考即可；維持 Editor 組合模板 |
| `defense-reaction/type2` | `avalon-guard-window` Avalon 防禦窗 | godie-e00l.r | anim + vfx | 參考即可；維持 Editor 組合模板 |
| `defense-reaction/type3` | `perfect-parry` 完美盾反 | godie-h00l.r | anim + bodyMove + screenShake + vfx | 參考即可；維持 Editor 組合模板 |
| `chain-lightning/type1` | `chain-lightning-storm` 多起點連鎖雷擊 | godie-udea.r | anim + screenShake + vfx | 參考即可；維持 Editor 組合模板 |
| `transform-aura/type1` | `bankai-transform` 高速變身氣場 | godie-h01n.r | anim + screenFlash + screenShake + vfx | 參考即可；維持 Editor 組合模板 |

## 42／46 已收斂的機制推薦 type

自動盤點得到 36 個可重用機制視覺 type；它們已在 Editor 的「依技能自動組裝基本視覺」使用。Owner 對白不參與推論，現有 framebuffer 仍全部等待人工批核。

| 機制家族 | type 數 | 已出現技能 |
| --- | ---: | ---: |
| `mechanic-applyBuff` | 2 | 9 |
| `mechanic-applyStatus` | 3 | 8 |
| `mechanic-blink` | 1 | 2 |
| `mechanic-championForm` | 1 | 1 |
| `mechanic-cycleBuff` | 1 | 1 |
| `mechanic-damage` | 4 | 9 |
| `mechanic-damageArea` | 2 | 9 |
| `mechanic-damageLine` | 1 | 1 |
| `mechanic-dash` | 1 | 1 |
| `mechanic-devour` | 1 | 1 |
| `mechanic-dispel` | 1 | 1 |
| `mechanic-eventValueConversion` | 1 | 1 |
| `mechanic-extendBuff` | 1 | 1 |
| `mechanic-grantAttribute` | 1 | 2 |
| `mechanic-grantGold` | 1 | 1 |
| `mechanic-grantXp` | 1 | 1 |
| `mechanic-heal` | 1 | 1 |
| `mechanic-invulnerable` | 1 | 2 |
| `mechanic-knockback` | 1 | 1 |
| `mechanic-leap` | 1 | 1 |
| `mechanic-manaBarrier` | 1 | 1 |
| `mechanic-restore` | 2 | 2 |
| `mechanic-shield` | 1 | 1 |
| `mechanic-summon` | 2 | 2 |
| `mechanic-swapResource` | 2 | 1 |
| `mechanic-taunt` | 1 | 1 |

完整 modelKey、vfxId、trigger 與受影響清單請讀同目錄 `editor-vfx-template-handback.json`。
