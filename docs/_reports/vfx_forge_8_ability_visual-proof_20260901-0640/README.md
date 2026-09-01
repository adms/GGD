# VFX Forge 八招逐格視覺驗收（進行中）

時間：2026-09-01 08:39（Asia/Taipei）
分支：`feat/vfx-forge-codex`

這一批截圖全部來自 Editor 的「完整技能演出」模式：真 Sim 事件、ability JSON、目前 VFX Script、真 CameraRig 與遊戲渲染路徑。切換技能後先等模型／粒子預載完成，再定位時間軸；空白、全白或尚未載完的 frame 不列證據。

| 招式 | 關鍵影格 | 目前判定 |
|---|---|---|
| 龍破斬 | `01_dragon_projectile.png`、`01_dragon_explosion.png` | 定距投射／落點爆炸可辨；演出強度仍需提高 |
| 神滅斬 | `02_giga_dash.png` | dash 落點可辨；移動軌跡仍不夠清楚 |
| 超究武神霸斬 | `03_omnislash_combo.png`、`03_omnislash_finisher.png` | 逐刀與直立終結柱存在；黃藍分層仍不夠清楚 |
| 阿邦快速劍X | `04_avan_dash.png` | 衝擊波／dash 結構存在；A、B 兩段視覺差異仍不足 |
| 龍鬥氣砲咒文 | `05_dragon_aura_beam.png` | 藍色橫向砲路徑存在；持續感仍需提高 |
| 龜派氣功 | `06_kamehameha_beam.png` | 橘金橫向砲路徑存在；持續感仍需提高 |
| 理想鄉 EX | `07_avalon_counter.png`、`07_avalon_finisher.png` | 反擊起手、逐刀與終結光束可辨；終結強度仍需提高 |
| 騎英之手綱 | `08_bellerophon_dash.png`、`08_bellerophon_impact.png` | 藍色落點爆發可辨；dash 影格太晚，需重拍與強化 |

## 本輪已通過的共同條件

- 完整 runtime 以 15 Hz 讀回真 GPU framebuffer：龍破斬 45 格、神滅斬 32 格、超究武神霸斬 93 格、阿邦快速劍X 34 格、龍鬥氣砲咒文 33 格、龜派氣功 33 格、理想鄉EX 36 格、騎英之手綱 39 格，合計 345 格。
- 所有影格都沒有粒子貼圖矩形底、GLB 平面貼圖底或全畫面白卡。驗收不再只看全畫面覆蓋率：新增局部連通元件檢查，12×12 等級的小型近白矩形卡片也會阻擋，細長光束與不規則角色輪廓不會誤判。
- 角色 GLB 走遊戲同一個 `AssetManager`，貼圖與每個可見 PBR 材質 variant 完成 GPU 預熱後，Editor 才允許定位／存檔；不再把 Babylon 第 0 幀的白色暫存材質當成已完成畫面。
- `content:build` 會先掃完整 VFX collection 與完整 model GLB 內嵌貼圖；目前 `pnpm vfxassets:check` 為 0 blocker。這道閘保證舊綁定或 ability JSON 直接引用也不能繞過 Editor 的拖拉／存檔檢查。
- 八份腳本皆通過 schema 與五種視覺文法的機械測試。

## 尚未宣稱通過

這份報告不把「有東西畫出來」當成完成。上述五項演出強度／辨識度缺口修完並重拍前，八招整體視覺驗收仍是進行中。
