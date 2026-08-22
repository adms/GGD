# ⏳ GH#570 —— 特效的終極 3 秒上限（lane I 完整報告）

> owner 2026-08-23（逐字）：
> 「我發現**還是有特效超過三秒以上停留在場上**（老毛病，**飛向天空的殘留半透明煙霧**），
>  請妳作一個**終極限制，不管什麼特效，包含技能、場地特效等，產生後生命週期最多維持三秒，
>  三秒後一律強制清理回收**」

> owner 2026-08-23（常設）：
> 「**沒做完以前別問我了自己判斷 但是留後台開關可以簡易 rollback**」

---

## ① 那份「飛向天空的殘留半透明煙霧」是誰 —— 量到的

**`fx.w3x.particle.flamessmoke.p03`**（＋同族 p00–p02），
綁在 `godie-u010.q` 與 `godie-u010.r`（`content/config/ability-vfx-bindings.json:284-304`，
`source: "w3a-override:art:caster"`, rawcode `A0OG` / `A09K`, CONFIRMED）。

逐格對得上 owner 的每一個詞：

| owner 的詞 | 文件裡的欄位 |
|---|---|
| 煙霧 | `texture: assets/textures/particles/smoke_07.png` |
| 半透明 | `blendMode: "alpha"`，起始 alpha 0.392 |
| 飛向天空 | `emitter.shape: "cone"` + **`angleDeg: 1`**（近乎垂直）+ `speed 2.2224–6.6672` |
| 超過三秒停留 | 見下 |

### ⛔ 既有三道閘全部是綠的 —— 而它們**各自都對**

| 閘 | 夾什麼 | 對這一份的結果 |
|---|---|---|
| `vfxFadeOutMaxSec`（#569） | **一顆粒子**的尾段 | 5.0 秒 → **3.0 秒** ✅（它做完了它該做的） |
| `castMoteEmitShare`（#569） | 施法光柱**餘燼**的生成窗口 | ⛔ 不是這一族（那是 `CastPillarFx`） |
| `ringCapForRoundBoundary`（#262） | **回合邊界**修剪 free-list | 慢了幾十秒 |

⇒ ⭐ 漏掉的是**「效果」這一層**：`W3xCastFx` 發射 `W3X_CAST_EMIT_SEC = 0.55` 秒，
然後 `W3xEmitterRig` 要等 `drainingSec >= maxLifeSec`（＝被夾過的 3.0 秒）才 `release()`。
**0.55 + 3.0 = 3.55 秒**，而那 3.0 秒的排空完全在上面每一道閘的外面。
每一個零件都對，只有它們的**總和**超標（第一·五守則點名的形狀）。

### 全樹掃描（`content/vfx/*.json`，584 份帶 `lifetimeSec` 的文件）

| | |
|---|---|
| `lifetimeSec.max > 3` | **30 份** |
| 套上 #569 的尾段夾子之後**仍然** > 3 | **5 份**（`lasercannonfinalred` 的 p02/p03/p06 兩套 id） |
| 恰好落在 3.0 | 4 份（`flamessmoke.p03` 那一族） |

⇒ 粒子壽命這一層 #569 已經處理得差不多；**真正的超標來自效果總時間與各層的硬上限**：

| 層 | 原本的硬上限 | 現在 |
|---|---:|---|
| `W3xEmitterRig` 的 `DEFAULT_MAX_EFFECT_SEC` | **12 秒**（＋排空） | 夾進那一格 |
| `modelFxRig` 的 `DEFAULT_MAX_EFFECT_SEC` | **8 秒** | 由 `VfxSystem` 餵那一格 |
| `W3xCastFx` 的 `W3X_CAST_MAX_SEC` | 3 秒，但 `expireStale()` **只在下一次 `play()` 時**跑 | 每幀被掃描器蓋住 |
| `ArenaScene` 的 `torch-flame-*` 等 **9 條**直接 `new ParticleSystem` 的路徑 | ⛔ 完全沒有任何上限 | 進 `"scene"` 掃描 + 顯式豁免 |

---

## ② 兜底落在哪幾層（逐層）

⭐ **一個機制**（第〇·五守則），⛔ 不是每一種特效各加一次 `if`：

| # | 落點 | 蓋住什麼 |
|---|---|---|
| **①** | **`apps/client/src/vfx/vfxHardCap.ts`（新）** —— 掃 `scene.particleSystems` | ⭐ **Babylon 自己就是那份登錄表**：`ParticleSystem` 建構子會把自己 push 進去 ⇒ ⛔ 沒有任何一條建立路徑逃得掉，也⛔ 沒有「呼叫端忘了註冊」這個失敗形態 |
| **②** | `particleFactory.toParticleSystem()` | **建立當下**標記 managed / persistent（`VfxSystem` / `AmbientVfx` / `FireRingFx` / `W3xEmitterRig` / 編輯器預覽都走它 —— 唯一入口） |
| **③** | `W3xEmitterRig` 的 `LiveEffect.hardCapSec` | 效果**總年齡**（發射 + 排空）到期 → `release(hard)`：粒子整批丟、發射器與 **mesh** 回池 |
| **④** | `VfxSystem` → `ModelFxRig({ maxEffectSec: vfxHardMaxLifeSec() })` | 「模型即特效」那條通道（glb 實例 + TransformNode），⛔ 不再抄一個 8 |
| **⑤** | `VfxSystem.update()` 每幀呼叫掃描器 · `resetForRound()` 歸零碼表 | 驅動 + 回合邊界不讓下一回合第一發特效繼承別人的年齡 |

### ⏱ 時鐘從哪裡開始 —— `isAlive()`，⛔ 不是物件被 new 出來的那一刻

出貨的粒子系統**幾乎都是池化**的（`VfxSystem.pool` / `W3xEmitterRig.pool` /
`AmbientVfx.psPool`），同一個 JS 物件會被重複點燃幾百次。拿「物件年齡」當時鐘＝
第二次施法就被收掉。⇒ 時鐘量的是「**連續有粒子在場上多久**」：
`isAlive()` false→true 那一幀開始計時，回到 false 就歸零。
池化重打自動拿到一支新的碼表，⛔ 一個呼叫端都不用改。

### 「強制清理回收」是**第二句話**

到期 = `stop()`（不再生）+ `reset()`（在飛的粒子**整批丟掉**）。
之後那顆發射器就是閒置的 ⇒ GH#270 的 `maxOneShotEmitters` 掃描把它還回池子／驅逐。
擁有 mesh 的兩層（③④）另外用**同一格**當自己的硬上限，所以 mesh 與 TransformNode
在同一秒被歸還。⛔ 不是「變透明後留在場上」。

### ⭐ 逐個確認過的建立路徑（`grep "new ParticleSystem("`，出貨側 14 處）

| 路徑 | 走 vfx 管線？ | 判定 |
|---|---|---|
| `particleFactory.toParticleSystem` | ✅ 唯一入口 | managed（或 persistent 旗標） |
| `vfxPresets.makeBurstSystem`（`vfx-preset-*` 打擊感） | ⛔ 直接 new | `"scene"` 掃到（本來就 ≤0.6 秒） |
| `ArenaScene` `torch-flame-*` | ⛔ | **豁免表**（常駐布景，⛔ 而且它在別的 lane 的柵欄裡） |
| `ReviveCircleView` `revive-*-embers` | ⛔ | **豁免表**（活到有人救起來，伺服器決定） |
| `ProjectileView` `proj-*-trail` | ⛔ | **豁免表**（活到投射物落地） |
| `CoinView` / `FlowerView` `coin-* / flower-*` | ⛔ | **豁免表**（活到被撿走） |
| `IntermissionScene` / `menu/procedural` `intermission-* / login-*` | ⛔ | **豁免表**（不在對局場景） |
| `AmbientVfx`（角色身上的常駐光暈／拖尾） | ✅ | **`persistent: true` 旗標** |
| `FireRingFx` `fire-ring-flame-*` | ✅ | **`persistent: true` 旗標**（＋名字也在豁免表，兩層各蓋一半） |

⚠️ **非粒子的三條通道也查過，都在 3 秒內**：`RibbonTrail`（`RIBBON_FADE_BUDGET_SEC = 0.25`）、
`GroundDecalPool`（回合邊界 `clear()`）、`Telegraph`（回合邊界修剪）。
⇒ ⛔ 不替它們加第二套機制（那就是「到處改改改」）。

---

## ③ ⭐ 我挑了什麼、那一格叫什麼

owner 只給了**一個**數字（三秒）。其餘全是我挑的，每一格都是後台一格，預設＝我挑的那個：

| # | 我挑了什麼 | 那一格叫什麼 | 出貨值 | 一鍵 rollback |
|---|---|---|---|---|
| — | ⛔ **不是我挑的**：3 秒是 owner 的原話 | `vfxHardMaxLifeSec` | **3** | 調大（上界 30） |
| **1** | 掃描涵蓋 **整個場景**（含不走管線的場地特效） | `vfxHardCapScope` | **`"scene"`** | `"managed"`（只掃管線）／**`"off"`（完全回到今天之前）** |
| **2** | 常駐特效的豁免用**名稱前綴表**（因為那一族的程式碼在別的柵欄裡，改不到） | `vfxHardCapExemptPrefixes` | 8 條（火把／火圈／復活圈／投射物／金幣／花／登入頁／中場） | 增刪那張表（後台走內容覆蓋層，表單引擎畫不了字串陣列 ⇒ 列在 `preserved`） |
| **3** | 走管線的常駐特效用**程式旗標**而不是名字 | `toParticleSystem({ persistent: true })`（＋文件自己的 `vfx@1.ambient`） | `AmbientVfx` · `FireRingFx` | — |
| **4** | 到期的動作是 **`stop()` + `reset()`**，⛔ 不是 `dispose()` | — | — | 掃描器關掉即可 |
| **5** | 試演頁**明著**繞過（`hardCapSec: Infinity`），⛔ 不是靠 `maxEffectSec: 3600` 默默繞 | `W3xEmitterRigOptions.hardCapSec` | 出貨路徑永遠不傳 | — |
| **6** | ⭐ **預設方向：沒被標記也沒列在豁免表的 = 該收掉** | — | — | — |

**#1 的理由**：owner 的原話是「不管什麼特效，包含技能、**場地特效**等」——
場地火把 `torch-flame-*` 是 `ArenaScene` 直接 `new ParticleSystem` 的，
**只有 `"scene"` 掃得到它**。
**#6 的理由**：漏一格豁免的代價是「一個常駐特效被收掉」（看得見、改一格 config 就好）；
漏一條路徑的代價是「又一團煙霧留在場上」（看不見、要再查一輪）。⇒ 錯要錯在會被看見的那一邊。

⚠️ **`vfxHardMaxLifeSec` / `vfxHardCapScope` 都不吃 `enabled`** —— `enabled` 管的是
「回合邊界要不要回收池子」，而這一條是 owner 對**畫面**下的規定。綁在一起等於
「有人為了查池子問題關掉 enabled」就順手把他的規定也關掉了，而畫面上沒有東西會說出來。

⭐ **⛔ 沒有靜默**：`VfxSystem.vfxHardCapReclaimCount` 累計被強制回收的數量
（同 `oneShotEvictionCount` 的理由）。這個數字一直在爬 = 有一條路徑在生產「沒人收」的特效，
那是要去修的**根因**，⛔ 不是「兜底有在做事所以沒問題」。

---

## ④ 三個住處 ＋ 上下界

| 住處 | 檔 |
|---|---|
| 出貨值 | `content/config/vfx-cleanup.json` |
| Zod + `DEFAULT_*` + 上下界唯一住處 | `packages/shared/src/content/schema/config/vfxCleanup.ts`（`VFX_HARD_MAX_LIFE_SEC_BOUNDS = {min:0.5,max:30}`, `VFX_HARD_CAP_SCOPES`） |
| 後台 | `apps/admin/src/configForms.ts` 的 `VFX_CLEANUP_SPEC`（兩格 `fields` ＋ 一格 `preserved`） |

三格全部 `.optional()` —— 線上已經有耐久覆蓋層，少一個必填欄會讓整份 config 被 Zod 退回
→ 內容載入失敗 → 退回骨架（2026-08-02 兩次事故的形狀）。

---

## ⑤ 守衛與突變

`apps/client/src/vfx/vfxHardCap.test.ts` —— **一條**，上限從 `vfxHardMaxLifeSec()` 推導
（⛔ 測試裡一個 3.0 都沒有）。三個斷言：
① 走管線的一次性特效到期 `getActiveCount() === 0`；
② ⭐ **不走**管線、直接 `new ParticleSystem` 的也被收掉（owner 的「不管什麼特效」）；
③ 常駐（程式旗標 / 豁免表）一顆粒子都不少。

**突變**：拿掉 `sweepVfxHardCap()` 裡的 `ps.reset()`（只留 `stop()`）
→ **紅**：`expected 3 to be +0`（粒子停在場上不再生 = owner 抱怨的「變透明卻還在」）。改回。

---

## ⑥ 驗證

| | |
|---|---|
| `npx vitest run` × 3 | ①新守衛 ②9 支相關既有守衛（`vfxCleanupConfig` / `configForms` / `configFormsSave` / `VfxSystem.roundReset` / `W3xCastFx` / `FireRingFx` / `AmbientVfx` / `fadeOutTail` / `gh270EmitterBudget`）= **81 passed** ③突變 |
| `pnpm typecheck` | **EXIT=0**（＋改完試演頁後補跑 `apps/client` 單包 `tsc`，EXIT=0） |

⚠️ **`content/config/vfx-cleanup.json` 動了 ⇒ `bundle.json` 現在是過期的。**
本 lane 依指示⛔ 不跑 `content:build` / `skills:sync`（併行鎖）——
**主 session 收尾時要跑一次 `pnpm content:build` 並 `git add content/`**，
否則 `shippedBundleIsCurrent.test.ts` 會紅。
