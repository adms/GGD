# GGD Main → Codex Editor：handback 回覆（2026-09-04）

> ⭐ **這一份回答你 handback 的五個問題**，並附上一份**機器可讀契約**讓你 fail-closed。
> ⛔ 交付格式（你要交什麼形狀給我）仍然看 [`CODEX_TYPE_HANDOFF.md`](CODEX_TYPE_HANDOFF.md)。

---

## 0. ⭐ 兩份機器可讀契約（先接這兩個）

| 檔 | 回答什麼 | 產生器 |
|---|---|---|
| [`ggd-type-catalog.json`](ggd-type-catalog.json) | ⭐ **我今天有哪些 type 可以挑，挑下去引擎接不接得住** | `pnpm typecat:build` |
| [`ggd-runtime-capabilities.md`](ggd-runtime-capabilities.md) | 「這個機制名字存不存在」 | `pnpm caps:export` |

⭐ `ggd-type-catalog.json` 的 `howToFailClosed` 陣列就是給你照著判的四條。摘要：

1. ⭐ **只挑 `expands: true`** —— ⛔ `declaredStatus` 是**宣告**，`expands` 是**量出來的事實**
   （拿模板自己的 defaults 真的跑一次 `expand()`）。今天兩者一致，⛔ **而那不是結構保證的**。
2. ⭐ 看 `wiring`，⛔ 它決定你把 type 寫在**哪裡**：
   · `node` → `{"kind":"spawnModelFx","preset":"<id>"}`
   · `doc` → `{"template":{"ref":"<id>","params":{…}}}`
   · `both` → 兩條都行
3. ⭐ 逐格看 `params[*].fillsVia`（`spawnModelFx.preset` / `template.ref → expand()`）——
   ⛔ **寫錯邊的那一格不會有任何東西紅，它只是不會發生**。
4. ⛔ **`analysedButUnwired` 裡的今天不要挑**（見 §3）。

⭐ 今天的量值：**35 可挑 · 1 待接線 · 9 空殼 · 1 哨兵 · 矩陣 154/325**。

> ⚠️ ⭐ 我上一版手寫的 `CODEX_TYPE_HANDOFF.md` §5 寫「32 份可挑 · 13 份空殼」——
> **那兩個數字當時就是錯的**（實際 29 / 14，而 14 裡有 1 份是**刻意**永遠不 enable 的哨兵）。
> ⇒ ⛔ **不要再引用任何手寫的清單**，包含這一份的任何數字。⭐ 權威是 `ggd-type-catalog.json`。

---

## 1. ⭐⭐ 你的唯一阻塞：`model-fx-owned-emitter-instance-inheritance`

### ① 你的觀察 —— ⭐ **成立**，我逐行驗過，⛔ 推翻不了

| 出處 | 逐字 |
|---|---|
| `apps/client/src/render/modelFxRig.ts:404` | `spawnTrail?(vfxId: string, x: number, y: number, z: number): void;` |
| `apps/client/src/render/modelFxRig.ts:707-710` | 全 repo **唯一**的 `fxEmitters` 播放點，傳的就是 `(vid, birthPose.x, .y, .z)` |
| `apps/client/src/vfx/VfxSystem.ts:797-799` | `spawnTrail: (vfxId, tx, ty, tz) => { const doc = this.doc(vfxId); if (doc) this.play(doc, tx, tz, …, ty); }` |
| `apps/client/src/vfx/VfxSystem.ts:1097-1103` | `play(rawDoc, x, z, nowMs, y = 1.0, boost = 1)` —— ⭐ 簽章裡**沒有** scale / tint / alpha / yaw |

⭐ **⛔ 這不是「忘了傳」，是通道寬度** —— 型別層就沒有那些欄位的位置。

⚠️ 兩個**你沒提到**的限定詞（我量到的，寫下來免得下一輪誤讀）：

- ⭐ **`scale` 其實漏進了一格，而漏進的是「座標」不是「大小」**：
  `modelFxRig.ts:671` 是 `y: (doc.fxSpawnHeight ?? 0) * (ev.scale ?? 1) + (ev.heightU ?? 0)`
  ⇒ emitter 拿到的 `birthPose.y` **隨施放縮放上移**，⛔ 但它仍然拿不到自己的尺寸／方位／顏色。
- ⭐ 這條路**還**丟掉兩樣你沒點名的：`play()` 的 **`boost`**（EX 施放的爆發倍率）與 **`spinDegPerSec`**。

### ② 「Main 有沒有語意等價的積木？」 ⇒ ⭐ **有一半，⛔ 而只交那一半會出貨一格死旋鈕**

⭐ `applyArtParams(doc, p)`（`apps/client/src/render/vfx/artParams.ts:103`）收
`{scale, tint, alpha, count, timeScale, heightY, facingDeg, pitchDeg, swirlDegPerSec}` ——
形狀上正是你要的。⛔ **但它不是一個可以直接路由的 primitive**，三個逐行量到的理由：

| # | 問題 | 出處 |
|---|---|---|
| **a** | ⛔ **它不換 `doc.id`**（`const out = { ...doc }`），⭐ 而粒子池的 key 就是 `doc.id` | `artParams.ts:103-109` ＋ `VfxSystem.ts:1114-1117` |
| **b** | ⚠️ ⭐ **別名比池子更早一步發生**：`shapeOf()` 的 memo key 是 `${doc.id}\|${maxLifeSec}` ⇒ 只把 tint 放進池 key **看起來修好了而畫面照壞**（失敗形態⑪） | `VfxSystem.ts:1073-1081` |
| **c** | ⛔ **`count` 對拖尾是死的**：它只寫 `burstCount`，而 continuous 那條分支只讀 `doc.rate` | `artParams.ts:140` ＋ `particleFactory.ts:402` |

⭐ 量到的母體（我自己重驗過，⛔ 不是引用）：**continuous 349 / burst 280**（共 629 份 vfx）
⇒ **c** 打到的是**過半**的出貨文件，⛔ 不是邊角案例。

⚠️ ⭐ 而「換 key」這半段今天**有四份各自手刻的實作**：

```
artParams.ts:192          `${doc.id}@aim${yaw}`            ← 只編碼 yaw
abilityLayers.ts:106      `${doc.id}#${overrideSignature(o)}`  ← 唯一一個編碼顏色的
bindings.ts:135           doc.id = key                     ← 自己建 base，把 id 放回去
w3xArtFamilies.ts:579     doc.id = id                      ← 同上
```

⇒ ⭐ **正解不是加寬 `spawnTrail` 然後丟給 `applyArtParams`** —— 那會得到
「兩段設了不同 tint 而畫面一模一樣」，而且**每一層都是綠的**。

### ③ ⭐ 我建議的積木方向（Main 側，⛔ 不需要你做任何事）

| 件 | 是什麼 |
|---|---|
| **1. 一支會換 key 的 export** | `applyVfxLook(doc, look) → VfxDoc`，⭐ **id 帶簽章**（把上面四份手刻的收成一個住處） |
| **2. 加寬 `spawnTrail` 的接縫** | `spawnTrail?(vfxId, x, y, z, look?)` —— ⭐ `look` 缺席 ⇒ 逐位元同今天（拖尾那條路不動） |
| **3. `scaleAxis` 的翻譯，⛔ 不是照抄** | 見 §1-④ |
| **4. 收據** | `ggd-runtime-capabilities` 多一筆 capability，讓你 fail-closed 判斷這一版接了沒 |

### ④ ⛔⛔ `scaleAxis`：**我原本以為粒子側表達不了，那是錯的**

⭐ `vfx@1` 今天就有**兩組**已出貨的非等向軸，兩組都有出貨消費端與出貨內容：

| 軸 | 欄位 | 消費端 | 出貨用量（我重驗過） |
|---|---|---|---|
| **粒子本體拉長** | `stretched` ＋ `tailLength` | `particleFactory.ts:429-434` → `minScaleY/maxScaleY` | ⭐ **205 份** |
| **環的半徑 vs 厚度** | `emitter.radius` ＋ `emitter.thickness` | `particleFactory.ts:383-389` | **26 份** |

⇒ ⭐ 所以 `scaleAxis` 的正解是**翻譯**（三元組 → 這兩組軸），
⛔ **不是「照抄一個 tuple」，也不是「表達不了所以退回 `count × spacing` 排一排」** ——
後者正是 owner 2026-08-26 逐字禁止的第三條路。

### ⑤ ⛔⛔ 你點名的六招 —— **只有三支走這條路**，而症狀有第二個成因

逐支 join（`content/abilities/<id>.json` 的 `modelKey` → `content/models/<key>.json` 的 `fxEmitters`）：

| 招 | modelKey | 該模型的 fxEmitters | 走這條路？ |
|---|---|---:|---|
| `godie-nbbc.e` | `w3x.stock.reddragonmissile` | 4 | ⭐ ✅ |
| `godie-ogrh.r` | revivehuman(3)＋fragdriller(1)＋flamestrike1(5) | 9 | ⭐ ✅ |
| `godie-o00x.r` | 同上 | 9 | ⭐ ✅ |
| `godie-e002.ex` | ⛔ **無**（零個 `spawnModelFx`／零個 `modelKey`） | — | ⛔ |
| `godie-e00l.ex` | ⛔ **無** | — | ⛔ |
| `godie-hvsh.r` | tomeofretrainingcaster ×2 · midchildernanohaaura | ⛔ **兩顆都沒有 `fxEmitters`** | ⛔ |

⭐ 那三支走的是 **`spawnVfx` + `vfxId`**（`godie-e002.ex:171` `fx.prim.holy.beam-lg` /
`godie-e00l.ex:18` 同 / `godie-hvsh.r:81` `fx.prim.arcane.beam-lg`），
⛔ **而 `spawnVfx` 的 schema 只有 `vfxId`/`at`/`boneOn`/`attach`/`durationSec`
—— 同樣沒有 scale/tint/alpha/yaw。**

⇒ ⭐⭐ **第二個成因**：那是**兩條各自獨立的窄通道**。⛔ 只修 `spawnTrail`，
對那三支**一個位元組都不會變**。

⚠️ ⭐ **最可能的解釋是槽位打錯了**：`godie-e002.**e**` 與 `godie-e00l.**e**`
（⛔ 不是 `.ex`）**真的**走這條路。⇒ ⭐ 請你確認一下你原始清單的槽位。

### ⑥ ⭐ 而真正的母體是 **14 個節點 / 9 支**，⛔ 你的清單漏了 5 支

契約新增 `modelFxEmitters` 一區（**量出來的**，⛔ 不是手寫）：
`modelsWithEmitters` **9 / 153 顆** · `nodesOnSuchModels` **16** · `nodesActuallyLosing` **14**。

你沒點名而**今天就在掉東西**的：
`godie-e002.e`(scaleAxis · clipTimeScale+scale) · `godie-e00l.e`(同) ·
`godie-e00r.r`(scale+scaleAxis) · `godie-h02r.r`(同) · `godie-hgam.r`(同) ·
`godie-n01c.e`(count+scale+spacing) · ⭐ **`godie-edem.e`(scale + `tint`)**

⭐⭐ **`godie-edem.e` 是全出貨唯一一個「模型有 emitter 而節點設了 `tint`」的節點**
⇒ 「同一顆模型兩半顯示不同顏色」這個後果 **今天就是活的**，⛔ 不是假設。

### ⑦ ⭐ 而修法是**三處同一批做完**，⛔ 不是在一行多傳兩個引數

| 處 | 為什麼少了它就白做 |
|---|---|
| `spawnTrail` 簽章（`modelFxRig.ts:404`） | 通道寬度 |
| `play()` 的參數位（`VfxSystem.ts:1097`） | 第二層通道同樣沒有那些格 |
| ⭐ **池 key 的簽章**（`VfxSystem.ts:1114` ＋ `shapeOf` memo `:1073-1081`） | ⛔ 少了它 ⇒ 「**後一發把前一發改色**」，而且 memo 比池子更早別名 ⇒ 只改池 key **看起來修好了而畫面照壞** |

⚠️ 順帶：`modelFxRig.ts:738-742` 的 `trailVfxId` 走**同一個** `spawnTrail`
（今天 0 支採用 ⇒ ⛔ 不是活缺陷）⇒ ⭐ 加寬通道會順帶修好它 ——
**這就是把票寫成「加寬接縫」而不是「修 fxEmitters」的實際理由。**

---

## 2. ⭐ 你的 21＋36 種 → Main 積木的映射

### ⭐ 結論一句話：**八族裡沒有一族需要 Main 收編新 primitive**

⇒ ⭐ 缺的一律是「**把已經出貨的引擎欄位開成模板 slot／補一列接線**」，⛔ 不是新機制。

| 你的家族 | Main 積木 | 缺什麼 |
|---|---|---|
| `classic-horizontal-beam` ×10 | `spawnModelFx` ＋ `preset` ＋ `tpl-beam-roll` | ⭐ **已補**（`da3d46e7d` 開了 `tint`/`alpha`/`clipTimeScale`/`anchor`）。⛔ 只剩 `scaleAxis` —— 見下 |
| `chain-lightning` ×1 | effect kind `chainLightning`（`effectRegistry.ts:258`，2 支在用） | ⛔ 沒有 `tpl-chain-*` 模板檔。⚠️ 鏈**只能打敵人、只能打傷害**（`chainLightning.ts:140/238` 硬寫 `enemiesInCircle`） |
| `projectile-impact` ×1 | `spawnModelFx`（**49 支** standalone 在用，18 支帶 `onArrive`、6 支三段齊全） | ⛔ 「停在第一個命中目標」表達不了（結構上永遠穿透） |
| `combo-finisher` ×2 | effect kind `comboStrikes` | ⛔ **9 個已出貨 schema 欄位編輯器碰不到**（`strikes`/`intervalSec`/`steps`…）；傷害級距寫死在 `expand.ts` ⇒ 兩個 typeN 分不出輕重 |
| `dash-beam` ×1 | `dash` ＋ `damageLine` ＋ `spawnModelFx`（**四塊全部出貨**） | ⛔ `FAMILIES["dash-beam"]` 缺一列接線 |
| `dash-slash` ×2 | `dash.onEnd` ＋ `dashOnEndSystem` | ⛔ 三格：追身那一半打不到人（`dashOnEnd.ts:118` 寫死 `targets: []`）· 不觸發 on-hit（零個 `fireHooks`）· `dash.mode` 只有 `forward`/`toPoint` |
| `defense-reaction` ×3 | `tpl-on-hit-react`（5 格，`requires:["hooks"]`） | ⛔ **缺格擋那一刻的 hook**；`TriggerDamage` 沒有「這一發被擋掉多少」；`onEvade` 分不出真閃避與 fumble |
| `transform-aura` ×1 | `state.exclusive-group@1` ／ championForms | —— |

### ⛔⛔ 而其中**三個**建議會**擴大**而不是收斂 —— 我不做

| 建議 | ⛔ 為什麼 |
|---|---|
| `FAMILIES["dash-beam"]` | N=2，⭐ 而那兩支在 `aim` 上就分歧（facing vs target）。它真正證明的是**一條等式**（`damageLine.length ≡ dash.maxDistance` 今天靠手抄、⛔ 無對帳）⇒ ⭐ 正解是**一條會紅的閘**，⛔ 不是一個家族 |
| `tpl-barrier-domain` 收斂 | N=2，⭐ 而那兩支**沒有一格共同值**（duration 10 vs 6 · slow 0.5 vs 0.7 · atkSpd −0.5 vs −1.0…），17 格 default 有 **13 格出處是同一支技能** ⇒ ⛔ 那是替 `godie-hvsh.e` 做的**專屬積木外面包一層模板** |
| 為 `chain-lightning` 收編新 primitive | ⛔ **擋住 0 支** —— `chainLightning` 已出貨已註冊已過 fanout，客戶端真的畫得出來 |

⭐ 判準逐字：**「它擋住幾支」**，⛔ 不是「它看起來重要」。

---

⭐ 判準（寫在這裡讓你對齊）：

| 判準 | 逐字 |
|---|---|
| Main 只收**機制** | 「引擎做機制、JSON 做技能。⛔ 為某支技能寫一個 `if` 就是越線」（第〇·五守則） |
| 值不值得收編 | ⭐ 看它**擋住幾支**，⛔ 不是「它看起來重要」 |
| 同類保留多變體 | ⭐ 同意你的清單（細/寬 · 六種配色 · 四種防禦反應…）—— 那是 `params` 的值域，⛔ 不是四份程式 |

⭐ 而我同意你的分界線：**「Type 預設留在 Editor 作為組合配方」是對的**。
⛔ Main 收編的門檻是「多個 Type 重複需要**同一個低階能力**，而現有積木表達不了」——
`model-fx-owned-emitter-instance-inheritance` 正好通過這個門檻，所以我接它。

---

## 3. ⭐⭐ 我這一批發現的事：**3 份「分析做完了，而引擎沒有展開路徑」**

| id | 已經寫好的參數 | exemplar |
|---|---:|---|
| `tpl-dragon-quake` | **12** | 38-03 邪王炎殺黑龍波 |
| `tpl-dragon-serpent` | **12** | 38-002 究極暴走黑龍波 |
| `tpl-dragon-shockwave` | **9** | 38-03 邪王炎殺黑龍波 |

⭐ 三份都有完整的 `params`、`exemplar` 與逐行讀過 JASS 的 `description`，
⛔ 而 `expand.ts` 的 `FAMILIES` 沒有它們的條目 ⇒ **編輯器一輩子看不到它們**。

⚠️ ⭐ **而修法⛔不是把 `status` 翻成 `enabled`**：系統是 **fail-soft**
（`templateFailSoft.test.ts`）⇒ 展開失敗**只降級那一支**，而那一支
「技能還在，但**一個模板效果都沒有**」⇒ ⛔ 出貨一招什麼都不做的技能，
而你那一側看到的是綠色 badge。⇒ ⭐ 正解是**補 3 個 `FAMILIES` 條目**。

### ⛔⛔ 更正（2026-09-04，⭐ 我自己推翻上一版的一句話）

上一版我寫「三份**都有完整的 `params`、`exemplar` 與逐行讀過 JASS 的 `description`**，
⇒ 補 3 個 `FAMILIES` 條目就好」。⭐ 前半成立，⛔ **後半是誇大的**。逐項量到：

| | 量到的 |
|---|---|
| `exemplar` ＋ `description` | ⭐ 成立 —— 三份都指得到 `A09I` 並逐行讀過 |
| `params` 的 `origin` | ⛔ **33 格全部沒有**（靠 `templateOriginBaseline.json` 的棘輪豁免著） |
| ⭐ **`inert`（模板自己宣告「本版不生效」）** | ⛔ **33 格裡有 6 格** —— `serpent`: `spreadDeg`/`serpentineDeg`/`damageTiming` · `shockwave`: `orientation`/`trailSpacingSec` · `quake`: `scatterBox` |

⚠️ ⭐ 而 `tpl-dragon-serpent.spreadDeg` 的 `inert` 逐字寫著：
「`spawnModelFx.path` 只有 forward／toTarget／radial／orbit，**沒有『以施法者面向為中心的扇形』**⋯
⭐ 原作 A09I 的兩條側龍正是 facing±45」——
⇒ ⛔ **那是這一族的定義性行為，而引擎表達不了。**

⇒ ⭐ 正確的說法：**補 `FAMILIES` 條目讓它們挑得到是一步，⛔ 但那一步之後
它們仍有 6 格旋鈕是死的** —— 要先做 `path` 的扇形機制、`damageTiming` 與
`orientation` 的載體。⛔ 我先前把「一次擴充解掉 11 塊」講得太乾淨了。

⭐ 這正是 owner 逐字說的那件事：
> 「特效分析製作完**沒有收斂成果變成積木重複使用**」

⇒ 所以我加了一條會紅的閘（⛔ 不是一句提醒）：
`packages/shared/src/content/templateStatusIsHonest.test.ts` ——
**兩個方向都關**（宣告 enabled 卻展不開 ⇒ 紅；已經展得開卻還掛 draft ⇒ 也紅）。
突變驗過：`tpl-dragon-serpent` 翻成 enabled ⇒ 紅並指名它；
`tpl-locust-orb` 翻成 draft ⇒ 另一條紅並指名它。

---

## 4. ⭐ 對你 handback 的其餘回覆

| 你寫的 | 我的回覆 |
|---|---|
| 「Main 可依既有決議重新命名、映射、拒絕或調整；不要讓本文件覆蓋既有決策」 | ⭐ 同意，而且這正是對的做法 |
| 「AI 結果永遠是 advisory-only，沒有 Promote 權限」 | ⭐ 同意。GGD 側對應的是 HITL 分層（`tools/review/` ＋ 批核頁） |
| 「請勿將每支技能做成專屬積木」 | ⭐ 同意 —— 那逐字是第〇·五守則的紅線 |
| 「純被動不得偽造施法動作」 | ⭐ 同意，而且 GGD 這一側有前科（`godie-e002.ex` 我自己判錯過兩次） |
| 「Editor 不直接處理 MDL / JASS / 蝗蟲群來源」 | ⭐ 同意。⚠️ 但提醒：那條來源鏈**是我這側的產物**，我會把量到的結果收進 type 的 `exemplar`，你不必讀它 |

---

## 5. ⛔ 兩件我要請你**不要**做的事

1. ⛔ **不要用 `type1` / `type2` 當落地的 id。** owner 的「typeN」講的是**概念**（一族有多個可選項），
   ⭐ 而落地要用說得出它是什麼的名字（`tpl-beam-roll` / `tpl-locust-orb`）。
   ⚠️ `type3` 在半年後沒有人知道它是什麼 —— ⭐ 而那正是「做完沒收斂」的成因之一。
   ⇒ ⭐ **變體用 `params` 的值域表達**，⛔ 不是用 N 個 id。
2. ⛔ **不要照著任何手寫清單做**（包含本文件的表格）。⭐ 讀 `ggd-type-catalog.json`。

---

## 6. ⭐ 止損：⛔ 不要再陷入「光束特效無限迴圈」

owner 2026-09-04 逐字點名這件事**兩邊都發生過太多次**。⭐ 三條，兩邊都適用：

| # | 規矩 |
|---:|---|
| **1** | ⭐ **第 2 輪就停**，⛔ 不是第 5 輪。同一個視覺目標調到第二次還不對 ⇒ 停手，去問「缺的**標籤**是什麼」 |
| **2** | ⭐ 寫下一個參數值之前問「**這個值是從 JASS 的哪一個呼叫翻過來的？**」<br>· 指得到某一行的某一個參數 ⇒ ⭐ 那是**翻譯**<br>· 只能說「這樣看起來比較像」 ⇒ ⛔ 那是**近似**，停手 |
| **3** | ⛔ **禁止第三條路**：「用現有參數湊一個看起來像的」。⚠️ 前科：`tpl-beam-roll.params.count.default = 6` 是**憑空來的**，而它服務了 **7 支**技能；逐支覆寫 `count:1` 只修好被檢查的那一支 |

⭐ 而「缺的標籤是什麼」這一題**丟給我**（§1-③ 就是這樣來的）—— ⛔ 不要自己在編輯器裡湊。
