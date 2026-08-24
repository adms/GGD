# 光束砲三缺陷修復的終端驗收（GH#673，dc8f29e5 之後）

台子：`apps/client/public/beam-audition.html`（出貨 SimWorld → 出貨 `godie-ogrh.r`
→ 真 `modelFxSpawn` → 出貨 `VfxSystem`/`ModelFxRig` → 真 `netherstrike.glb`）。
量尺自證：`calibrate()` = **462,400** 亮像素；基線（無光束）= **0**。
⚠️ 前提：本 worktree 先跑過 `pnpm --filter @ggd/shared content:build` ——
**HEAD commit 的 bundle 是過期的**（見下面「未出貨」一節），不重建的話 ③ 量不到。

## ✅ 驗收標準逐條（BA_temp_20260824.md 的三缺陷）

| 標準 | 量到 | 判定 |
|---|---|---|
| ① 第 1 發頂點 > 0 | spawn 當下 0（glb 串流中）→ **150ms 後回填 425 頂點**，光束在世（壽命 2s）就看得到；亮像素 177/基線 0 | ✅ |
| ① 第 2 發頂點 > 0 | 重用同一節點（`modelfx-imported.netherstrike-0`），**spawn 當下即 425 頂點**；亮像素 **5,331** / lit 11,975 | ✅ |
| ② 壽命 = 設計 2s | **58 tick = 1.93s**（修前實測 149 tick = 4.97s 的 5 秒兜底） | ✅ |
| ② 到期乾淨 | 到期後亮像素回 **0**，節點回收進池（pooled=1） | ✅ |
| ③ y 出生高度 | root y = **1.2**（`fxSpawnHeight` 走通 wire → pose） | ✅ 機制通 |
| ③ 不埋地 | 世界包圍盒 y = **−1.42 … +3.84** —— 半高實測 **2.62**，1.2 只把埋地從 50% 減到 **27%** | ⛔ **值不夠** |
| 姿態 | yaw 90°（+x 施放向）、位置 (−40,0)＋離地、static 不位移 | ✅ |

## ⛔ 還沒完的兩件（都不是新缺陷，是收尾）

1. **③ 的值要 ≈ 2.7 才離地**：實測半高 2.62（scale 2.5 出貨預設、含骨架動畫的實渲染
   包圍盒），`fxSpawnHeight: 1.2` 的光束下緣仍在地下 1.42。建議 2.7（2.62＋餘裕）。
   ⚠️ 08-03 逐支覆寫 scale 4.5 ⇒ 半高 ≈ 4.7，單一模型級數字蓋不到它 ——
   要嘛接受、要嘛把離地做成跟 scale 連動（機制改動，owner 裁決）。
2. **HEAD 的 content 產物過期＝③ 根本沒出貨**：`dc8f29e5` 改了
   `content/models/imported.netherstrike.json` 但沒跑 `content:build`，
   commit 裡的 `bundle.json` 沒有 `fxSpawnHeight`（實際讀過確認），
   `shippedBundleIsCurrent.test.ts` 現在紅（manifest / abilities/_index /
   models/_index 三份過期）。客戶端從 bundle 載內容 ⇒ 不補 build 就照樣埋地。
   ⇒ 主 session 跑 `pnpm content:build`（或整套 `skills:sync`）並 commit 產物。

## 新增守衛（本 lane，`claude/goofy-dhawan-1d1607`）

| 守衛 | 檔 | 紅的條件 |
|---|---|---|
| ①a 容器載完回填活實例 | `apps/client/src/render/modelFxRig.test.ts` | 拿掉 `ensureContainer` 的回填迴圈（**突變驗過：紅**，訊息「首發 0 頂點」） |
| ①b 池中空殼重用時補幾何 | 同上 | 拿掉 `acquire` 的空殼補位 |
| ② 表上 lifeSec 到達出貨節點 | `packages/shared/src/content/modelFxPreset.test.ts` | `PRESET_FIELDS` 再掉 `lifeSec`（走出貨內容×出貨註冊路徑，⛔ 不是手寫夾具） |
| ③ 橫放模型必宣告離地高度 | 同上 | `netherstrike` 的 `fxSpawnHeight` 被拿掉（⛔ 不釘 1.2 這個數字 —— 那是可調演出值） |

## 設計缺口④（不動）

static 單具 4.25 格 vs 原作十具沿線 —— 照票面指示留給 owner 裁決或做成後台開關，
本 lane 未實作。
