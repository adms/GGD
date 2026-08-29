# 🐉 GH#779 莉娜 04-03 龍破斬 — 終端像素證據（beam-audition，2026-08-27 00:30–00:36）

## 台子與量尺

- 頁：`http://localhost:39673/beam-audition.html?ability=godie-h020.e`（`client-beam` lane，HEAD=cdd8fe54 工作樹）
- 整條鏈**沒有一段是台子造的**：出貨 content（`workingTreeSource`）→ 真 `SimWorld` →
  出貨 `castAbility`（真詠唱 1.233s ≈ 37 tick）→ 真 `modelFxSpawn` 事件 → 真 `VfxSystem`/`ModelFxRig` →
  真 `fireblast.glb` + `monsoonbolttarget.glb`（vite 回 200，見下）→ WebGL 真渲染 → `readPixels`。
- ⭐ **量尺先自證**：`calibrate()` 全亮 quad = **462,400** 亮像素（1280×720）。兩次載頁各校準一次，同值。
- `bright` = max(R,G,B)>200 的像素數；`lit` = >96。

## 連續影格（熱快取施放；f0 為施放前基線）

| 影格 | tick（施放後） | bright | lit | 場上模型節點（enabled，頂點數） |
|---|---|---:|---:|---|
| `f0_precast.png` | −（施放前） | 2,997 | 3,739 | 無 |
| `f1_castend_spawn.png` | +37（詠唱完） | 3,484 | 15,729 | （spawn 事件同 tick 發出） |
| `f2_beam_early.png` | +40 | **14,151** | **87,673** | fireblast v164 @(−37.4,0,0) · monsoonbolt v44 @(−36,0,0) |
| `f3_beam_mid.png` | +44 | 4,760 | 7,602 | fireblast v164 @(−33.9,0,0) |
| `f4_beam_late.png` | +48 | 5,279 | 7,109 | fireblast v164 @(−30.5,0,0) |
| `f5_arrive_explosion.png` | +51（抵達） | **24,455** | **52,184** | 落點爆炸（`fx.prim.fire.explosion-lg`）+ fireblast |
| `f6_aftermath.png` | +54 | 9,937 | 15,707 | monsoonbolt 殘留（lifeSec 1s） |

⇒ **驗收①②達成**：光束 lit>0 且連續（f2→f4 沿 +x 位移 −37.4→−30.5）、爆點畫面在（f5）。
事件直方圖（一次施放）：`modelFxSpawn×2 · floatingText×4(詠唱台詞) · vfxSpawn×1(爆炸) · screenShake×1 · explosion×1`。

## A/B：部署版 v0.28.5/6 的 #780 缺陷（`BJS_ALPHA_ONEONE=0`）對這一支的影響

| 影格 | 條件 | bright | lit |
|---|---|---:|---:|
| `ab1_head_alpha6.png` | HEAD（`alphaMode=6`，真 ONEONE） | 16,252 | 36,446 |
| `ab2_deployed_alpha0.png` | 模擬部署版（同一批 glow 材質改 `alphaMode=0`） | 16,546 | 36,870 |

⇒ **#780 的常數錯誤不會讓龍破斬變成零像素**（它讓黑底不去背，⛔ 不是讓它消失）——
owner 看到的「零特效」**不能**用 #780 解釋。

## ⭐⭐ 真比賽現場影格（match_e_*.png —— ⛔ 不是台子）

真的 offline bot 比賽（client-272 :39572 × 非 watch game server :2610，全出貨路徑：
Colyseus 線路 → GameApp frame drain → 全部 sink → 真渲染），莉娜 Lv23，
練習面板 ▶E 指定施放，rAF 捕捉法逐幀精準取樣（施放後毫秒數在檔名上）：

| 影格 | 施放後 | 看到什麼 |
|---|---|---|
| `match_e_0_216ms.png` | 0.2s | 詠唱中（浮動文字台詞） |
| `match_e_1_1362ms.png`〜`match_e_3_1635ms.png` | 1.36–1.64s | 詠唱完、光束出膛（白色光柱＋紅色範圍） |
| `match_e_4_1864ms.png` | 1.86s | ⭐ **落點大爆炸**：紅色電紋半透明爆炸罩＋白色核心（≈ 抵達 1.7s 準時） |
| `match_e_5_2154ms.png` / `match_e_6_2614ms.png` | 2.15/2.61s | 爆炸消散＋落雷 dummy 殘留 |

⇒ **真比賽（HEAD）龍破斬的施放→飛行→爆點全部看得到。**

## ⛔ 誠實邊界（用詞紀律）

1. f0–f6/ab 是 **beam-audition 台子**的真渲染證據（票上指定的 #767 台子形狀）；
   match_e_* 是**真比賽**的。GameApp drain 段另有 headless 閘
   `apps/client/src/render/dragonslaveShippedChain.test.ts`
   （真 content → 真詠唱 → 真 `GameApp.prototype.drainNetworkEvents` → 真 VfxSystem/rig；
   views/casts/相機/語音 sink 為 noop stub，見該檔檔頭）。
2. **冷快取第一發**在本台子上量到**整段飛行 0 頂點 0 亮像素**（載頁後第一次施放；
   glb 落地時實例已死，池中空殼由第二發回填）。出貨遊戲由 GH#703 的
   `warmModelFx(spawnModelFxKeysInUse())` 進場預熱擋住（已驗證名單含
   `imported.fireblast` 與 `w3x.stock.monsoonbolttarget`，28 keys）——
   ⛔ 但 beam-audition 頁自己**沒有 warm**，所以在這一頁上「第一發永遠是空的」，
   拍證據時要先熱身一發（本報告照做並如實標示）。
3. **在 HEAD 無法重現 owner 看到的「零特效只剩文字」**：sim 發事件 ✅、preset 展開 ✅、
   bundle 齊 ✅、glb 在 git ✅、fanout 放行 ✅、drain 不擲例外 ✅、熱快取像素 ✅、
   部署版 alpha 缺陷 A/B 仍可見 ✅。主 session 補拍指引見下。

## 主 session 補拍指引（真比賽那一段）

1. `client-272`（:39572，VITE_GAME_WS=ws://localhost:2610）＋ **非 watch** game server
   （`cd apps/game-server && env GAME_PORT=2610 GAME_PUBLIC_ENDPOINT=ws://localhost:2610
   GGD_WHITELIST_BYPASS=1 GGD_CONTENT_BUS=0 ../../node_modules/.bin/tsx src/index.ts`；
   ⚠️ `pnpm dev` 是 tsx watch —— 任何 lane 存檔都會重啟並毀掉比賽房）。
2. Play offline vs bots → 搜「莉娜」→ 黑魔導士．莉娜因巴斯 → 鎖定 → 等完選角倒數
   （⚠️ `skipPhase` 作弊在 champSelect 被 `runCheat` 的 `entity===null` 閘擋住 —— 順手缺陷，見回報）。
3. 進場後練習面板（`）設 Lv、學 E，對地施放；連拍：詠唱台詞（5 句浮字）→ +1.2s 光束
   （0.47s 飛行）→ 落點爆炸 + 震動。量：畫面亮像素或直接目視 + console 無紅字。
4. 若真比賽重現零特效而本台子綠 ⇒ 斷點在被 stub 的那幾個 sink（views/casts/相機/語音）
   或部署映像 —— 屆時先開全新分頁讀 `[client] content loaded` 那一行。
