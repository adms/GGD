# 「技能施展兩次特效就會缺失」（光束砲家族）—— 池化重新點燃 × 三秒硬上限碼表

> lane A 收尾報告（GH#842 的第三、第四個池）· 2026-08-28

## 根因鏈（共同形狀）

`vfxHardCap.ts`（GH#570/#842）的三秒硬上限碼表主詞是「**一次演出**」：
`isAlive()`（粒子）/ `isEnabled()`（modelfx- mesh）從 false→true 起算，回到 false 歸零。
**每一個池化重新點燃通道都必須呼叫 `noteVfxRefired(obj)` 歸零碼表** ——
否則第二發承接第一發的碼表，3 秒門檻從第一發起算，第二發被砍頭。
GH#842 修了 `VfxSystem.play`（:1115）與 `vfxPresets.fireBurst`（:424）兩個池，**漏了兩個**：

### 根因① `render/vfx/W3xEmitterRig.ts`（粒子半邊）

- `release(id, hard=false)` 只 `ps.stop()` **不排空**（hard 才 `reset()`）⇒ 粒子還在飛就進池子
- ⇒ `isAlive()` 一直 true ⇒ 掃描器永遠沒觀察到「排空」那一格 ⇒ `ACTIVE_SINCE` 不歸零
- `acquire()` 重新點燃（`manualEmitCount = -1; reset()`）後，第二發承接第一發的碼表
- ⇒ 3 秒門檻到，掃描對**正在播的第二發**做 `stop()+reset()`

### 根因② `render/modelFxRig.ts`（mesh 半邊 —— 光束砲的模型本體走這裡）

- 掃描器的 mesh 碼表只在「某次掃描**觀察到**節點 disabled」時歸零
- 而出貨順序是：frame N 的 `VfxSystem.update` **先**掃描（:2680）**後** `modelFx.tick`
  （:2683，release ⇒ `setEnabled(false)`）；frame N+1 的事件 drain（在 update **之前**）
  重用 ⇒ `setEnabled(true)`
- ⇒ **掃描永遠看不到 disabled 的那一格**（結構性的，不是機率低）⇒ 碼表從第一發起算
- 多人共用池（poolKey＝modelKey+look，**跨施法者**）時第二發來得更快，中招機率更高

## 修了什麼

| 檔 | 改動 |
|---|---|
| `apps/client/src/render/vfx/W3xEmitterRig.ts` | `acquire()` 的 pooled 重用分支：`noteVfxRefired(pooled.ps)`（import 自 `../../vfx/vfxHardCap`） |
| `apps/client/src/render/modelFxRig.ts` | `spawn()` 中 acquire 成功、`root.setEnabled(true)` 之後：`noteVfxRefired(root)`（新節點無碼表，呼叫無害） |
| `apps/client/src/vfx/hardCapRefire.test.ts` | ① 接線掃描擴到 4 個池（逐檔一個重新點燃簽章：W3xEmitterRig＝`manualEmitCount =`、modelFxRig＝`setEnabled(true)`，import/註解行剝掉再問「有沒有呼叫」）② 新增 mesh 半邊行為守衛：release→reuse 落在同一掃描間隔（直接寫欄位模擬「掃描沒觀察到」）＋ `noteVfxRefired` ⇒ 3.1s 不被砍；同一發播到 6.2s ⇒ 被砍（鐵則沒放寬） |

**突變驗證**：拿掉 `modelFxRig.ts` 的 `noteVfxRefired(root)` ⇒
`hardCapRefire.test.ts` 紅（1 failed，訊息指名該檔）⇒ 改回 ⇒ 綠。
測試：`hardCapRefire.test.ts`（4 tests）＋ `modelFxRig.test.ts`（12 tests）全綠。

## 第三輪掃描：全部池化重新點燃通道（apps/client/src）

判準：這個通道重用的物件**會不會被掃描器計時**（粒子在 `scene.particleSystems`、
mesh 只有 `modelfx-` 前綴的頂層節點）？會的話，重新點燃處有沒有 `noteVfxRefired` /
PERSISTENT / 豁免前綴？出貨豁免表（`content/config/vfx-cleanup.json`）：
`torch-flame- / fire-ring- / revive- / proj- / coin- / flower- / login- / intermission-`。

| 通道 | 判定 | 理由 |
|---|---|---|
| `VfxSystem.play` per-doc 池（:1109 start） | ✅ 已修 | GH#842，`noteVfxRefired(ps)` :1115 |
| `vfxPresets` BurstPool／ImpactComposer（`vfx-preset-*`） | ✅ 已修 | GH#842，:424 |
| `W3xEmitterRig.acquire` pooled 分支 | ✅ **本次修** | 根因① |
| `ModelFxRig.spawn`（free-list 重用 + re-enable） | ✅ **本次修** | 根因② |
| `AmbientVfx.psPool`（:433 start＋manualEmitCount） | 🟢 豁免 | 唯一建立點 `toParticleSystem(..., persistent: true)` ⇒ PERSISTENT，掃描器 `continue` |
| `AmbientVfx.ribbonPool`／`MoveTrailFx` RibbonTrail 池 | ⚪ 不在掃描範圍 | ribbon 是 mesh，⛔ 非 `modelfx-` 前綴 ⇒ 掃描器不計時（它們有自己的壽命管理） |
| `FireRingFx`（:353 refire） | 🟢 豁免 | `fire-ring-` 前綴＋常駐旗標 |
| `ArenaScene` 火把（:629） | 🟢 豁免 | `torch-flame-` 前綴 |
| `ReviveCircleView.embers`（:320 refire，view 在 EntityViewRegistry 池化） | 🟢 豁免 | `revive-` 前綴 |
| `ProjectileView.trail`（:351，view 池化） | 🟢 豁免 | `proj-` 前綴 |
| `CoinView`／`FlowerView` motes（view 池化） | 🟢 豁免 | `coin-`／`flower-` 前綴 |
| `WeatherRainFx`（:207） | 🟢 豁免 | `markVfxPersistent(ps)` :206 |
| `LoginScene`／`menu/procedural/fx.ts` | ⚪ 掃不到 | 自己的 Scene，`sweepVfxHardCap` 只在 `VfxSystem.update` 對競技場 scene 跑；另有 `login-` 前綴雙保險 |
| `IntermissionScene`（:656） | ⚪ 掃不到 | 同上＋`intermission-` 前綴 |
| `WhirlwindFx.funnelPool`／`TelegraphLayer.quadPool`／`Telegraph` shared 池／`ShadowLayer.free`／`GroundDecalPool` | ⚪ 不在掃描範圍 | 全是 mesh，非 `modelfx-` 前綴 |
| `EntityViewRegistry` 的 guardian／nightFlag view 池 | ⚪ 無粒子 | grep 無 `new ParticleSystem`／`toParticleSystem` |
| 審查/audition 頁（`beamAudition`／`babylonStrips`／`w3x*Audition`） | ⚪ dev-only | 自己的 scene，無 `VfxSystem` 掃描 |

⇒ **沒有第五個未修的通道**：全 repo 的粒子建立點只有 `particleFactory.toParticleSystem`
與上表列名的 `new ParticleSystem` 呼叫（grep 過濾後零殘留），池化重用點（`.pop()` 掃描）
全數歸類完畢。第三個根因**不存在** —— 但接線掃描守衛現在涵蓋 4 個池，
下一個新池忘了那一行會被指名。

## 殘餘風險（誠實列出）

- 接線掃描的簽章是逐檔正則（`manualEmitCount =`／`setEnabled(true)`）——
  **同一個檔**再開第二個重新點燃點時，只要檔裡已有一個 `noteVfxRefired(` 呼叫，
  掃描分不出「哪一個點旁邊有」。行為守衛（池化重打不被砍）釘的是機制那一半。
- `modelFxRig` 的 `noteVfxRefired(root)` 在**同一幀 spawn 多具**（instances>1）時
  每具各自的 root 各歸零一次 —— 正確（每具是獨立的一次演出）。
