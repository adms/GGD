# 🧹 GH#819 回合清理 —— 真瀏覽器驗收證據（visual-proof）

> 2026-08-27，本機 dev（game-server + client），**bot 房實打**，版戳 `2b182a78-dirty`／`41a2ca19`。
> ⛔ 未碰正式站。量尺＝出貨的 `[purge]` console 打點（`sceneCounts()` 讀真 Babylon scene 的六類計數）。

## A/B：功能開（full，出貨預設）vs 無戰鬥殘留（控制組）

### 控制組（選人畫面，⛔ 沒有戰鬥殘留 —— 「該不變就不變」的反方向）

```
[purge] mode=full geo 37→37 mat 24→24 tex 5→5 ps 0→0 node 65→65 mesh 155→155 containers −0
[purge] 重新盤點 28 件，載入完成 139ms
```

### 實驗組（戰鬥中，兩次**自動**回合邊界）

```
[purge] phase combat → resolution
[purge] mode=full geo 369→366 mat 213→210 tex 136→136 ps 39→39 node 616→616 mesh 538→535 containers −5
[purge] 重新盤點 34 件，載入完成 269ms
[purge] phase resolution → intermission
[purge] phase intermission → combat
[purge] phase combat → resolution
[purge] mode=full geo 424→420 mat 204→200 tex 203→203 ps 61→61 node 580→580 mesh 604→600 containers −28
[purge] 重新盤點 33 件，載入完成 191ms
```

## 讀數怎麼讀

- **兩個方向都量到**：有殘留 ⇒ 計數降（geo −3/−4、mat −3/−4、mesh −3/−4、**containers −5/−28**）；
  無殘留 ⇒ 逐格不變。⭐ 一把只驗過單邊的尺不算自證過（CLAUDE.md）—— 這裡兩邊都跑了。
- **「載入完成才進戰鬥」**：兩次重新盤點（34/33 件）各在 269ms/191ms 內完成，
  全部落在 intermission 窗口裡 ⇒ 進 combat 時 ready（遮罩備而未用 —— 正確）。
- **選人 320→120**（owner 裁決）：重進房倒數 **1:56 起跳**（螢幕證據於 session 記錄）。

## 已知限制（誠實）

- fps 未量長程差（bot 房只打了兩回合）；#614 的凍結軸留在該票。
- dev HMR 陳舊實例會讓自動觸發靜默失效（⛔ 非出貨路徑）——
  正因此 `sync()` 加了 phase 打點：下一次同型 30 秒定位。
