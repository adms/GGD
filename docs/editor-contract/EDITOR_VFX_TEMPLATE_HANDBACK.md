# Editor VFX 模板候選 → Main 參考收編

狀態：**advisory-only** · 指紋 `1cca6d772a01`

這是 VFX Forge 已有共用配方的機器產物。Main 造積木，Editor 組積木；列在這裡不代表 Main 應把每個技能配方寫進 runtime。

## 目前真正阻塞的積木接縫

- `model-fx-owned-emitter-instance-inheritance`：Main 已確認成立；真正母體由 `ggd-type-catalog.json#modelFxEmitters` 量出，共 6 支技能。`godie-e002.ex`、`godie-e00l.ex`、`godie-hvsh.r` 走的是另一條 `spawnVfx` 窄通道，不再錯掛本票。

## 收編原則

- 只有多個 Editor 模板重複需要同一個低階能力，且現有 Main primitive/contract 無法表達時，才建議 Main 收編或擴充積木；技能時間軸與配色仍留在 Editor。
- 同族可以有多個可選方案，但落地使用語意化 recipe/variant id；純配色、寬度等差異由 params 預設表達，不把 type1/type2 寫進內容或 Main template id。
- 設計師先選家族，再選名稱能說明差異的完整預設；套用後展開為標準積木與時間軸，矩陣／slider 只做最後微調，不要求設計師從零調出每個視覺。
- 本次保存 57 個成果：21 個具名完整配方，加上 36 個已在 42／46 使用的具名機制推薦；不把既有成果丟回矩陣重調。
- Editor 修明顯大錯：顏色、方向、形狀、尺度、物理意義。亮度、密度、數幀節奏、鏡頭手感與美術偏好只送人工微調。
- AI 與本檔都沒有 Promote 權限；人工批核前不得套回正式內容。

## 已有 Editor 共用配方

| 具名家族變體 | 配方 | 驗收技能 | 組成 | 給 Main 的建議 |
| --- | --- | --- | --- | --- |
| `classic-horizontal-beam/fire-continuous` | `classic-beam-fire` 經典橘金氣功砲 | godie-ogrh.r<br>godie-o00x.r | anim + modelFx + vfx | 檢查上列低階缺口；其餘時間軸留 Editor |
| `classic-horizontal-beam/blue-continuous` | `classic-beam-blue` 經典藍白氣功砲 | godie-nbbc.e | anim + modelFx + vfx | 檢查上列低階缺口；其餘時間軸留 Editor |
| `classic-horizontal-beam/holy-gold-blue` | `classic-beam-holy` 黃藍聖光砲 | — | anim + modelFx + vfx | 檢查上列低階缺口；其餘時間軸留 Editor |
| `classic-horizontal-beam/void-purple` | `classic-beam-void` 紫黑虛空砲 | — | anim + modelFx + vfx | 檢查上列低階缺口；其餘時間軸留 Editor |
| `classic-horizontal-beam/inferno-red-orange` | `classic-beam-inferno` 紅橘高熱砲 | — | anim + modelFx + vfx | 檢查上列低階缺口；其餘時間軸留 Editor |
| `classic-horizontal-beam/electric-cyan` | `classic-beam-electric` 青藍電能砲 | — | anim + modelFx + vfx | 檢查上列低階缺口；其餘時間軸留 Editor |
| `classic-horizontal-beam/lightning-thin` | `energy-beam-lightning-thin` 細束青藍雷射 | — | anim + screenShake + vfx | 參考即可；維持 Editor 組合模板 |
| `classic-horizontal-beam/lightning-wide` | `energy-beam-lightning-wide` 寬幅青藍電砲 | — | anim + screenShake + vfx | 參考即可；維持 Editor 組合模板 |
| `classic-horizontal-beam/holy-wide` | `energy-beam-holy-wide` 寬幅黃白聖光砲 | — | anim + screenShake + vfx | 參考即可；維持 Editor 組合模板 |
| `classic-horizontal-beam/void-wide` | `energy-beam-void-wide` 寬幅紫黑虛空砲 | — | anim + screenShake + vfx | 參考即可；維持 Editor 組合模板 |
| `dash-beam/rider-blue` | `rider-dash-beam-blue` Rider 突進＋藍光束 | godie-hvsh.r | anim + bodyMove + modelFx + screenShake + vfx | 檢查上列低階缺口；其餘時間軸留 Editor |
| `projectile-impact/fire-distance-impact` | `line-blast-fire` 定距火球＋落點爆炸 | godie-hjai.e<br>godie-h020.e | anim + screenShake + vfx | 參考即可；維持 Editor 組合模板 |
| `dash-slash/void-single-arc` | `dash-slash-void` 黑紫衝刺斬 | godie-hjai.r | anim + bodyMove + screenShake + vfx | 參考即可；維持 Editor 組合模板 |
| `dash-slash/shockwave-followup` | `shockwave-dash-light` 衝擊波＋追身光斬 | godie-nbbc.r | anim + screenShake + vfx | 參考即可；維持 Editor 組合模板 |
| `combo-finisher/holy-column-finisher` | `combo-slash-holy` 黃藍多段斬＋終結柱 | godie-hart.r | anim + vfx | 參考即可；維持 Editor 組合模板 |
| `combo-finisher/avalon-counter-beam` | `avalon-counter-chain` 理想鄉反擊七斬 | godie-e002.ex<br>godie-e00l.ex | anim + bodyMove + floatingText + modelFx + screenShake + vfx | 檢查上列低階缺口；其餘時間軸留 Editor |
| `defense-reaction/reflect-open` | `reflect-counter-open` 反彈成功起手 | godie-e002.ex<br>godie-e00l.ex | anim + vfx | 參考即可；維持 Editor 組合模板 |
| `defense-reaction/avalon-guard-window` | `avalon-guard-window` Avalon 防禦窗 | godie-e00l.r | anim + vfx | 參考即可；維持 Editor 組合模板 |
| `defense-reaction/perfect-parry` | `perfect-parry` 完美盾反 | godie-h00l.r | anim + bodyMove + screenShake + vfx | 參考即可；維持 Editor 組合模板 |
| `chain-lightning/multi-origin-storm` | `chain-lightning-storm` 多起點連鎖雷擊 | godie-udea.r | anim + screenShake + vfx | 參考即可；維持 Editor 組合模板 |
| `transform-aura/bankai-black-red` | `bankai-transform` 高速變身氣場 | godie-h01n.r | anim + screenFlash + screenShake + vfx | 參考即可；維持 Editor 組合模板 |

## 42／46 已收斂的具名機制推薦

自動盤點得到 36 個可重用機制視覺變體；它們已在 Editor 的「依技能自動組裝基本視覺」使用。Owner 對白不參與推論，現有 framebuffer 仍全部等待人工批核。

| 機制家族 | 具名變體數 | 已出現技能 |
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
