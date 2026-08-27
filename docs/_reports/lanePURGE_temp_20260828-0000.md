# lane PURGE — GH#819 每回合開始前清理→重新盤點→載入完成才進入戰鬥

日期：2026-08-27 深夜 · lane：PURGE · 票：GH#819（緊急/fix） · 前置修復：GH#558①

## 一句話

出 combat 的那一幀跑 `purgeBetweenRounds`（出貨預設 **full**）：registry 再扇出
＋ ModelFxRig **硬重置**（幾何/粒子/free-list/軌真的 dispose）＋ 丟掉 **fx-only**
共用模型容器 → **重新盤點**本場資產並載入 → 下一次進 combat 沒 ready 就蓋
「回合準備中＋進度」遮罩直到全 ready（帶 10s 保險絲）。🧹 手動按鈕任何時刻可按。
**鏈路已接上，⛔ 未驗收**（沒開真瀏覽器）。

## ① 先修 GH#558①（票上的第一步）

- **缺陷**：`ModelFxRig.dispose()` 逐字有一行
  `for (const c of this.containers.values()) c?.dispose();` —— 而那些容器是
  `loadContainer`（出貨＝`AssetManager.load` 的 **per-Scene 共用快取**）借來的。
  rig 在這裡 dispose ⇒ 快取的 Promise 仍指著同一份物件 ⇒ 之後每個消費者
  （ChampionView 替身升級／場地佈景／下一個 rig）拿到**屍體**。
  同型的第二處：`ensureContainer` 的 disposed-mid-load 分支也 `c?.dispose()`。
- **修法**：兩處都改成**只放手不 dispose**（`containers.clear()`）。容器的
  dispose 權移到**建它的那一端**：`AssetManager.purgeFxContainers()`。
- **世代戳**：`hardReset()`/`dispose()` bump `generation`；in-flight 載入醒來
  時世代不同 ⇒ 放手（⛔ 不把可能已被快取端 purge 的舊容器塞回新世代）。
- 守衛方向 b（`roundPurge.test.ts` ①②）：purge/dispose 之後
  `container.src.isDisposed() === false` —— 這一條在修復前的程式上會紅。

## ② purge 兩段各清什麼

| 段 | 動作 | 清什麼 |
|---|---|---|
| **soft** | `registry.resetForRound("leave")` 再扇出一次 ＋ `vfx.hardResetModelFx()` | 一次性特效/池子/循環音（registry 那張表的每一列）＋ 模型即特效的**幾何、TransformNode、AnimationGroup、free-list 真的 dispose**（⛔ 不是還回池子）；容器引用放掉但共用容器**不丟** |
| **full** | soft ＋ `assets.purgeFxContainers()` ＋ 重新盤點載入 | 只丟 **tags=={"fx"}** 的容器條目（唯一消費者＝剛 hardReset 過的 rig）。曾被任何 shared 消費端（英雄本體/佈景/守衛/花）要過的路徑**一份都不碰** —— 它們的來源材質正掛在活著的實例上（`cloneMaterials:false` 一族） |

標籤怎麼來：`AssetManager.load(path, tag)`，預設 `"shared"`；GameApp 只在
`loadModelContainer`（rig 的唯一入口）帶 `"fx"`。⛔ 不是手寫名單 ——
判不出來的路徑寧可永不 purge，不可誤殺。

計數：purge 前後各量一次 `sceneCounts(scene)`（geo/mat/tex/ps/node/mesh，與
lifecycleLedger 同普查軸可互相對照），console 印
`[purge] mode=full geo A→B mat … containers −N` —— 沒有數字分不出「清了」與「以為清了」。

## ③ 就緒閘怎麼放行

- **時機**：purge 排在**出 combat** 的那一幀（`combat → resolution`）⇒ 整段
  結算＋商店都是載入窗口；「每回合開始前」載好的東西正好等在下一次開打之前。
- **盤點**（`GameApp.roundAssetInventory()`）：①技能特效模型
  （`spawnModelFxKeysInUse()` 從已註冊技能推導 → `contentDb.modelFor(key).glbPath`，
  同 GH#703 預熱的名單，⛔ 不是手寫）標 fx；②場上英雄**實際採用**的 glb
  （新增 `EntityViewRegistry.adoptedGlbPaths()` / `ChampionView.adoptedGlb`）標 shared。
- **放行**：全部 `assets.load()` 落地（404 也算落地 —— 一份缺檔不可以卡死回合）
  → `warmModelFx` 把 rig 容器引用補回 → `ready=true`。
  console 印「重新盤點 N 件，載入完成 X ms」（owner 驗收條：有數字）。
- **遮罩**：`gateActive(phase)`＝在 combat 且沒 ready ⇒ GameApp 每幀蓋
  `roundLoadOverlay`（半透明、寫「回合準備中… 資產盤點載入 X/N 件」，
  ⛔ 不是黑畫面；命令式 DOM，HUD 掛壞也出得來）。
- **保險絲**：等超過 `GATE_FUSE_MS=10s` ⇒ 放行＋console.warn 說出來
  （一個卡死的閘是另一種 lag）。⚠️ 這個秒數是程式常數不是後台欄位 —— 若 owner
  要調再升格三住處。
- ⚠️ **誠實的限制**：伺服器 phase 不歸客戶端管（本 lane 柵欄禁 game-server），
  所以「才進入戰鬥」是**畫面側**的閘 —— sim 照跑，玩家看到的是遮罩而不是半載的場。

## ④ 開關三住處

| 住處 | 內容 |
|---|---|
| `content/config/vfx-cleanup.json` | `"roundPurgeMode": "full"` ＋ note 追加 GH#819 段（含 owner 兩句逐字原話） |
| Zod `DEFAULT_*` | `ROUND_PURGE_MODES = ["off","soft","full"]`（唯一住處）＋ `roundPurgeMode: z.enum(...).optional()`（optional 理由同族：線上耐久 override 不可整份被退回）＋ `DEFAULT_VFX_CLEANUP.roundPurgeMode: "full"` |
| admin | `configForms/specs/render.ts` VFX_CLEANUP_SPEC 加一格（zh＋「它影響什麼」的 note＋optionLabels 三檔） |

- 預設 **full** ＝ owner 逐字「預設是會清理完重新盤點必要物件載入後 再進入戰鬥回合」。
- **`off` ＝ 逐位元回到今天**（守衛 ① 的 off 段驗過：過邊界一個都不清）。
- 讀端 `roundPurgeModeOf()`（vfxCleanupPolicy）——缺席/認不得退回出貨值 full，⛔ 不是靜默關閉。
- facade baseline 已用 `GGD_CONFIG_SURFACE_DUMP=1` 重生成（+1 名字 `ROUND_PURGE_MODES`）。

## ⑤ 手動按鈕

- 畫面左下 **fps 藥丸旁的 🧹**（PerfOverlay；藥丸永遠可用 ⇒ 任何時刻按得到；
  藥丸容器 pointerEvents:none，按鈕自己開回 auto；比賽中才出現）。
- 按一下＝`triggerManualPurge()` → 同一支 `purgeNow("full")`（⛔ 不是第二條路）。
- 主控台 `__ggdPurge()` 同義（`bindRoundPurge` 綁定/解綁，GameApp dispose 時清）。

## ⑥ 守衛與突變

- `apps/client/src/render/roundPurge.test.ts`（5 條，全部跑**真的** rig/AssetManager/場景樹）：
  ① 出 combat 邊界觸發、特效幾何**回落到基線**（⛔ 驗機制不驗 394/176 常數）＋ off 檔不清
  ② hardReset 後 in-flight 舊容器不落地（下一發重新要一份）
  ③ AssetManager 只丟 fx-only、shared/雙標籤不碰、purge 過的下次 load 是**新** Promise
  ④ 就緒閘：沒載完 gateActive("combat")=true（含進度數字）、全落地放行、保險絲到期放行
  ⑤ 接線掃描：GameApp 餵 phase＋綁接點＋fx 標籤、PerfOverlay 按鈕走同一支
- **突變（實跑）**：`purgeNow` 主體清空 ⇒ ①④ 紅（2 failed），改回後綠。
- 批次跑過的既有測試：modelFxRig / RoundLeak / Backfill / Warm / AssetManager /
  hudLayout / admin configForms＋ShippedProse / vfxCleanupConfig / facadeSurface
  —— **11 檔 103 條全綠**。
- 量尺陷阱已避開：斷言量 `scene.meshes/transformNodes`（NullEngine 管得到），
  ⛔ 不量 texture cache（`NullEngine._releaseTexture` 是空的）。

## 測試預算

vitest ×2（批次 1 ＋ 突變 1）；tsc ×1（唯一紅＝另一條 lane 的未追蹤檔
`packages/shared/src/ops/liveWriteCoverage.test.ts`，3 個 TS 錯全在該檔，與本 lane 無關）。

## ⚠️ 主 session 要接手的

1. **`pnpm content:build`**（本 lane 禁跑全域鎖）—— `content/config/vfx-cleanup.json`
   改了，`shippedBundleIsCurrent` 在跑之前會紅；跑完 `git add content/`。
2. 部署備註：這一版動了 client 程式 ⇒ ⛔ 不可 `--content-only`。
3. 👁 視覺驗收（未做）：真瀏覽器開一場 → 過一個回合邊界 → console 看
   `[purge] …` 前後計數與「重新盤點 N 件 X ms」→ 按 🧹 → 遮罩文案。
4. GATE_FUSE_MS=10s 是程式常數（保險絲不是體感值）；owner 若要調再升格。

## 柵欄外餘量

0 —— 動到的檔案全部在柵欄內（apps/client/** · content/config/vfx-cleanup.json ·
packages/shared/src/content/schema/config/** · apps/admin/src/configForms/** · 本報告）。
`apps/admin/src/ui/live/**`、game-server、tools、scripts、CLAUDE.md 一個位元組都沒碰。
