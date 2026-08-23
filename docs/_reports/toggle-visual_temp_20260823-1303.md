# GH#546 —— 開關型技能「看得出開/關」lane T 完整報告

> owner 2026-08-22（逐字，他講過兩次）：
> 「**風王結界這種開關型按鈕 圖示跟特效要明顯看出是開還是關狀態**
>  （w3x會有**特殊攻擊特效跟隨手部**、**圖示也會有流轉**作為打開中顯示）」

---

## 1. 盤點：出貨內容裡有幾支開關型技能

用 `ability@1.toggle`（`zAbilityToggle`）逐份掃 `content/**/*.json`：

| | |
|---|---|
| 帶 `toggle` 物件的節點 | **2 個** |
| ⭐ 去掉鏡像之後的**技能** | **1 支** |

那 2 個節點是**同一支技能的兩份鏡像**（第〇·五守則的 standalone ↔ champion 內嵌）：

- `content/abilities/godie-e002.w.json`
- `content/champions/godie-e002.json` → `.abilities.W`

⭐ **風王結界就是它**：`godie-e002.w` = **20-01 風王結界**，
英雄 `godie-e002`（亞瑟王 - Saber），槽位 **W**，modelKey `imported.herosaber`。
`toggle` 內容：`upkeepCadence: "perAttack"` · `upkeepCost: [30,50,70,90]` ·
`onExit: [championForm→toggle, damageArea 極小/AP0.3/r4.5]`（＝「風王鐵槌」）。

⚠️ 另外 3 份 `content/abilities/*.json` 也 grep 得到 `toggle` 字樣
（`godie-e00s.passive` / `godie-e00l.w` / `godie-e010.passive`），
但那是 `championForm.to: "toggle"`（變身目標），⛔ **不是**切換技。

⚠️ **`packages/shared/src/content/schema/ability.ts:157` 的註解在說謊**（第三守則）：
它寫著「今天沒有客戶（**0 份文件帶 `toggle`**）」，而實際是 1 支。
⛔ 那個檔在 lane K 的柵欄裡，我沒有改它 —— 留給主 session 派人修一行註解。

---

## 2. 逐段驗那條鏈：斷在哪裡

### 狀態鏈（給**兩個**視覺共用）

| 段 | 檔:行 | 判定 |
|---|---|---|
| sim 有「開著」這件事 | `packages/shared/src/sim/abilities/toggle.ts` (`AbilitiesComp.toggles` / `isToggleOn`) | ✅ |
| 線路欄位 | `packages/shared/src/protocol/schema.ts:394,508` (`SeatState.toggleMask` uint8) | ✅ |
| 唯一編解碼器 | 同上 `:533` `toggleMaskHas` / `:539` `toggleMaskWith` | ✅ |
| **寫端**（投影） | `apps/game-server/src/net/snapshot.ts:365-369` | ✅（`dc7edacd` 補的） |
| 伺服器側守衛 | `apps/game-server/src/net/toggleMaskWire.test.ts` | ✅ |
| ⛔ **客戶端投影** | **`apps/client/src/net/RoomStore.ts` —— `SeatView` 沒有 `toggleMask` 這一格，`syncHudFromState()`（`:780`）的座位投影（`~:861`）從來沒有抄過它** | 🚨 **斷在這裡** |
| 唯一讀端 | `apps/client/src/ui/abilityReadyFrame.ts:198` `seatToggleOn()` | ✅（但恆讀到 `undefined ?? 0`） |
| 三態框 | 同上 `:164` `abilityTileFrameStyle()` | ✅ |
| 六個算繪點 | `AbilityBar.tsx:540,659,780` ＋ `TouchControls.tsx:407,508,606` | ✅ |
| 後台文件鏈 | `content/config/toggle-ability.json` → `ContentDb.ts:315` `applyToggleAbilityDoc` → `ui/toggleAbility.ts` | ✅ |
| 後台頁 | `apps/admin` `page: "toggleAbility"`「開關型技能外觀」 | ✅ |

⇒ ⭐ **零件全都在，只差一格欄位。** `seat.toggleMask ?? 0` 永遠是 `0` ⇒
`seatToggleOn()` 對每一格永遠回 `false` ⇒ **六個算繪點一輩子畫不出開啟框**。
這正是 **失敗形態⑧（消費端存在，但它消費不到）**。

### ⛔ 為什麼沒有任何東西紅

既有守衛 `apps/client/src/ui/abilityToggleWiring.test.ts:106` 餵的是

```ts
{ …, toggleMask: mask } as unknown as SeatView
```

—— 一個 `as unknown as` **繞過型別層**的手刻夾具（**失敗形態⑤：被測的不是出貨的
那個**）。於是「夾具填得進去」與「出貨投影填不進去」互相看不見，
2 條測試全綠、`tsc` 全綠，而遊戲裡逐位元等於這個功能不存在。

### 手部特效那一半

| 段 | 判定 |
|---|---|
| `config.ambient-vfx@1` 綁定 → `AmbientVfx` 真的 parent 到骨頭 | ✅（GH#564） |
| `ability@1.persistentVfx` ＋ `attach` | ✅ 機制在（GH#539/#603） |
| ⛔ **「只在開著的時候掛」這個條件** | 🚨 **整個不存在**（見下） |

⛔ `persistentVfx` **表達不了它**：`when` 缺席的語意逐字是
「這支技能**在身上／已解鎖**就掛著」（`GetUnitAbilityLevel(u,id) > 0`，
`render/views/persistentVfx.ts` 的 GH#603 區塊），而一支切換技**學會之後永遠在身上**
⇒ 寫在那裡的手部特效會從學會 W 的那一刻一路噴到比賽結束。
而 `when` 填了條件的那一批，客戶端**刻意不解析**
（`GameApp.persistentVfxFor` 的註解 ＋ `persistentVfxClientCoverage.test.ts` 擋著）。
⇒ 兩條路都不是。

---

## 3. 做了什麼

### ① 圖示流轉（`apps/client/src/net/RoomStore.ts`，＋22 行）

- `SeatView` 新增 `toggleMask?: number`（optional，理由與 `attrBonus` 一字不差：
  省略的夾具＝斷言「沒有任何技能開著」）
- 投影新增一行 `toggleMask: ss.toggleMask ?? 0`

⭐ 這一行接上之後，**其餘六個算繪點一個字都不用改** —— 它們早就寫好了。

### ② 手部跟隨特效 —— 一個**機制**，⛔ 不是一個 if

⭐ `config.ambient-vfx@1` 的綁定列新增 **`whileToggle`**：
「這一列只在該座位**這一格開關技開著**的時候存在」。

| 檔 | 做了什麼 |
|---|---|
| `packages/shared/src/content/schema/config/ambientVfx.ts` | `zAmbientVfxBinding` ＋ `whileToggle?`（枚舉 `AMBIENT_TOGGLE_SLOTS`）· `enabled?` · `note?` |
| `apps/client/src/vfx/AmbientVfx.ts` | `ambientBindingOpen()` / `ambientGateSig()` 兩支純函式；`attach()` 逐列問閘；`gateSig` 進**重掛簽章**（＝關掉的那一刻**真的 detach**，⛔ 不是 alpha 0） |
| `content/config/ambient-vfx.json` | `imported.herosaber` 追加一列：`godie-herosaber-p1` ＋ `whileToggle: "W"` |

**為什麼是 `godie-herosaber-p1`**：它與這具身體上已經無條件綁著的
`fx.w3x.orb.herosaber.p01` **逐欄相同，只差 `ambient: true`**。
`isSwingTrailDoc()` 逐字要求 `ambient === true`，所以帶 `ambient` 的那一份是**刀光**
（揮劍才噴、站著只剩餘燼）。GH#564 為了做**無條件**綁定刻意挑了帶 `ambient` 的那一份，
理由逐字是「⛔ 挑錯那一份，金粉會變成**站著不動也一直噴**的常速粒子流」。
⭐ 而這一列要的正好是**那個被否決的行為** —— 開著就一直噴、關掉就沒有。
`anchorBone: "Bone_Hand_L"` ＝ owner 說的「跟隨手部」。

**取 `toggleMask` 的方式**：`AmbientVfxOptions.getToggleMask`，形狀**逐字照抄既有的
`getScale`** —— 一個模組級活值（`hudStore`，用 `SeatView.entityId` 找座位）＋ 一個
注入點。⭐ 於是**出貨路徑零接線**（`GameApp.ts` 一個字都不用改），而守衛仍然可以
不碰 store 直接餵遮罩。找不到座位（小怪／替身／seat 還沒同步）⇒ `0` ⇒
**fail-closed，帶條件的那幾列不掛**。

### ③ 守衛 `apps/client/src/vfx/toggleVisuals.test.ts`（162 行，3 條）

⭐ **⛔ 不手刻 `SeatView`**：從真的 `SeatState`（`toggleMaskWith` 編碼）出發，
走出貨的 `syncHudFromState()`，再讓兩個消費端各自去讀它們平常讀的那個 store；
ambient 那一半吃的是**出貨的 `content/config/ambient-vfx.json`**，用**出貨的 Zod** 讀進來。

1. 圖示：伺服器說 W 開著 → `seatToggleOn()` 讀得到
2. 手部：關 → 開 多一顆發射器；開 → 關 **真的少回去**（承重）
3. `AMBIENT_TOGGLE_SLOTS` ≡ `CASTABLE_SLOTS`（加第七格不可以被靜默截掉）

⛔ 不驗顏色 / sweepMs / rimPx / 粒子大小 —— 那些是**數字**。

**突變（一批一條，挑最承重的）**：
`RoomStore.ts` 的 `toggleMask: ss.toggleMask ?? 0` 拿掉 →
**兩條 it 同時紅**（`expected false to be true` ＋ `expected 2 to be greater than 2`）
⇒ ⭐ 那一行就是整批功能。已用 `Edit` 改回（⛔ 不是 `git checkout`）。

**測試預算**：實作 +159 / 測試 162 ≈ **1.0×**（靈魂層上限：測試 ≤ 實作）✅

---

## 4. 後台開關（第一守則）

| 開關 | 住處 | 預設 | 意思 |
|---|---|---|---|
| 圖示流轉總開關 | `config.toggle-ability@1.enabled` | `true` | **已經存在**（後台頁「開關型技能外觀」🌀） |
| ⭐ **手部特效（本 lane 新增）** | `config.ambient-vfx@1.bindings[key][i].enabled` | 缺席＝`true` | `false` ＝ 這一列完全不掛，⛔ 但那一行著作還在文件裡（第零守則：知識不可以無聲消失） |

⭐ **為什麼 `enabled` 放在「列」上而不是文件頂層**：`AmbientVfx` 讀綁定唯一的入口是
`hooks.bindingsFor(modelKey)`，而那個 hook 回的就是這些列
（`GameApp.ts:868` → `ContentDb.ambientBindingsFor`）。放頂層要多穿一條經過
`ContentDb` 的線（別的 lane 的檔），而放列上是**零接線**、而且對**任何一列** ambient
特效都成立（⛔ 不是只給風王結界的一個開關）。

---

## 5. ⚠️ 需要主 session 接的兩件事

### ① `pnpm content:build`（全域鎖，我不准跑）

我改了 `content/config/ambient-vfx.json` ⇒
`packages/shared/src/content/shippedBundleIsCurrent.test.ts` **現在是紅的**（4 條）。
⭐ **這是預期的、也是唯一的紅** —— 同一批我跑過的其他 ambient/vfx 內容閘全綠
（`ambientVfxAnchorBones` · `vfxParticles` · `vfxPromotedRefsResolve` · `dummyOrb` · `fieldAdoption`）。
修法：`pnpm content:build` 然後 `git add content/`。

### ② admin 一格欄位（lane Z 佔著 `configForms.ts`，我沒有自己加）

- **頁**：既有的 `ambientVfx`（`docId: "ambient-vfx"` / `schemaTag: "config.ambient-vfx@1"`，
  `configForms.ts:2811` 那一區）
- **欄位 key**：`bindings.imported.herosaber[2].enabled`
- **型別**：`boolean`（`SHIPPED_*` 值 = `true`）
- **標籤**：`風王結界開著時的手部特效`
- **說明**：
  「20-01 風王結界（亞瑟王 - Saber 的 W）**開著的期間**，左手上的常駐風之粒子。
   owner 2026-08-22：「風王結界這種開關型按鈕 圖示跟特效要明顯看出是開還是關狀態
   （w3x會有特殊攻擊特效跟隨手部、圖示也會有流轉作為打開中顯示）」。
   關掉這一格 = 只剩技能列圖示的流轉，手上什麼都不會出現。
   ⚠️ 圖示流轉那一半的開關在「開關型技能外觀」🌀 頁的 `enabled`。」

⚠️ ⭐ **順帶警告**：`ambientVfx` 那一頁的通用表單引擎是**整份文件存回去**的，
而 `bindings` 今天**沒有**被畫在表單上。⇒ 線上只要有人在那一頁按過一次存檔，
就有可能把 `bindings` 整段寫掉（⛔ 這是既有風險，不是本 lane 造成的，
但既然要加這一格，值得順手確認 `configFromForm` 有保留未渲染的欄位）。

---

## 6. ⛔ 沒做到的 / 刻意沒做的

| 項 | 為什麼 |
|---|---|
| 改 `packages/shared/src/content/schema/ability.ts:157` 那句過期註解（「0 份文件帶 `toggle`」，實際 1 支） | ⛔ 在 lane K 的柵欄裡 |
| `apps/admin` 那一格 | ⛔ lane Z 佔著 `configForms.ts`（規格見 §5②） |
| 動 `apps/client/src/GameApp.ts` | ⛔ 不在柵欄裡 —— ⭐ 而且**不需要**（`getToggleMask` 走預設） |
| 給 20-01 寫 `ability@1.persistentVfx` | ⛔ 語意不對（見 §2）＋ `content/abilities/**` 不在柵欄裡 |
| `apps/admin` typecheck 紅（`boss.king.learnRankMode` / `situationalAiming` / `areaMinTargets`） | ⛔ **不是我的** —— 我一個 admin 檔都沒動；那是別條 lane 在飛的東西 |

---

## 7. 離開碼

| 指令 | 結果 |
|---|---|
| `npx vitest run apps/client/src/vfx/toggleVisuals.test.ts` | ✅ 3 passed |
| 突變（拿掉 RoomStore 那一行）再跑一次 | 🔴 2 failed / 1 passed（如預期） |
| `npx vitest run` ×6（AmbientVfx · toggleVisuals · abilityToggleWiring · toggleAbility · RoomStore.couch · arenaFire） | ✅ 36 passed |
| `npx vitest run` ×5 內容閘（ambientVfxAnchorBones · vfxPromotedRefsResolve · dummyOrb · vfxParticles · shippedBundleIsCurrent） | 12 passed / **4 failed（全部是 `shippedBundleIsCurrent`，等 `content:build`）** |
| `npx vitest run packages/shared/src/content/fieldAdoption.test.ts` | ✅ 9 passed |
| `pnpm typecheck` | **EXIT=1**，唯一失敗是 `apps/admin`（`boss.king.*`，⛔ 不是我的）。`apps/client` ✅ / `packages/shared` ✅ |
