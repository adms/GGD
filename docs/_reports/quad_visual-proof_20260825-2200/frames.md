# QUAD lane 視覺證明 — GH#688 Phase 6 四小族（2026-08-25 22:00–22:40）

台子：`beam-audition.html?ability=<id>`（vite `client-beam` :39673，真 SimWorld → 真出貨
JSON（working-tree source）→ 真 modelFxSpawn → 真 VfxSystem/ModelFxRig → 真 glb）。
量尺先自證：**calibrate() 全亮 quad = 462,400 亮像素**（1280×720）——量不到它，
這一頁之後的一切結論作廢。lit/bright 為 `measure()`（render ×2 → readPixels）。

## A. imported.meteor（n00R → godie-u00j.r，74-04 最終殞落星，scale 5）

| 時刻 | lit | bright | 佐證 |
|---|---:|---:|---|
| 基線（未施放） | **0** | 0 | shot0 |
| 施放＋39 tick，glb 就緒 | **1,497** | 93 | shot1 —— 場中央可辨的岩體＋橘紅火光（離線抽樣 328 個暖色點） |
| A/B：關掉本次 cast 誕生的網格 | 311 | 176 | Δ≈1,186 來自本批內容 |
| step 80（life 2.5s=75 tick 到期） | 487* | 237* | shot2 —— `modelfx-*` 網格已從場景回收（enabled 清單驗過） |

誕生網格逐名：`modelfx-1-mesh_primitive0..3`（139/17/8/4 verts）＝重轉後 meteor.glb 的
4 個 primitive **一具不少**。
*誠實限制：u00j.r 的傷害擊殺替身 ⇒ 擊殺特效（goldPickup/guardianBolt sparkle）在
到期後仍在動，to 期後的 lit 屬於它們，⛔ 不是殘留的 meteor；A/B 第二輪（shot3/4）
同因污染，攻擊性數字以第一輪為準。

## B. w3x.stock.tomeofretrainingcaster（h025＋h02I → godie-hvsh.r，48-04）

| 時刻 | lit | bright |
|---|---:|---:|
| 基線 | **0** | 0 |
| 施放＋45 tick | **165** | 99 |
| 到期（h02I life 3s） | 609* | 285*（擊殺特效同上） |

**spawns=2** —— h025（scale 4 · tint 洋紅）與 h02I（scale 5）**兩個節點都發射**；
誕生網格 `modelfx-2-*`＋`modelfx-3-*` 各 3 primitive（96/96/12 verts）＝ tome glb 全數。
shot5（基線）/ shot6（live）/ shot7（A/B off）/ shot8（到期）。

## C. w3x.stock.revivehuman × tpl-beam-roll（h00S → godie-e00l.e，20-03 紅刃）

基線 **0 lit** → 施放＋45 tick：**378 lit / 238 bright**，`stats().beams` ＝ **6 具**
340-vert 光柱沿線間距 2（模板 count 6 · spacing 2 逐格對上）。shot9 / shot10。
tint [1,0.3922,0.3922] 由 ModelFxRig 節點級 tint 路徑消費（`modelFxRig.ts:318`，
GH#697 的 fxTintAudition 已為同一路徑做過逐通道終端證據）。
（`godie-e002.e` 同一節點住 skillremake 來源，等主 session `pnpm skills:sync` 落地。）

## D. w3x.stock.revivehuman × tpl-locust-orb（h007 SunFire → 90-04 兩具身體）

| ability | 基線 | live | 誕生網格 |
|---|---:|---:|---|
| godie-h02r.r | 0 | **140 lit / 73 bright** | `modelfx-1-*` 4 primitive（132/120/80/8 verts） | shot11 |
| godie-hgam.r | 0 | **380 lit / 210 bright** | 同上 | shot12 |

⚠️ 90-04 詠唱 2.233s＝67 tick —— 第一輪 h02r 量到 spawns=1 而零網格是**台子時序錯**
（step 40 < 67 就掃描＋60s 冷卻擋掉重放），重載後 step 80 即正常。⛔ 不是內容缺陷。

## 附：模型靜態體檢（守衛 `locustQuadFamilies.test.ts` 持續釘住）

- tome：轉換紀錄 4 貼圖全 `shape-in-rgb`、2 emitter `visible-at-peak`、3/3 prim 出生可見。
- meteor：**重轉前** 6/7 prim 軟刪除＋倖存者貼 8×8 灰色佔位圖（lit 100% 但 maxRGB 128）；
  **重轉後** 4/4 可見（岩體＋3 層 luma-key 自發光火光，真貼圖 54KB）。
  紀錄：`tools/w3x-import/out/stock/convert-meteor.json`。
- WarStompCaster **刻意未轉**：本批 4 列全數無出貨落點（見 QUAD 報告 §無落點表）。
