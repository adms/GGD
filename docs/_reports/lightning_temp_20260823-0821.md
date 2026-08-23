# ⚡ GH#571 —— 「一堆閃電特效都沒有真的出現」（lane L 完整報告）

> owner 2026-08-23（逐字，[優先]）：
> 「你需要**認真找一個演算法以及特效貼圖**來做出閃電的效果 一堆閃電特效 如**皮卡丘
>  飛鼠先生 雷神之槌** 等雷電特效 **都沒有真的出現**」

---

## 0. 先複驗根因（第三守則：交辦的診斷我自己量了一遍）

| 交辦說的 | 我量到的 | 判定 |
|---|---|---|
| `case "chainLightning"` 整條通 | ✅ `sim/effects/chainLightning.ts` emit → `eventFanout:142` 白名單 → `VfxSystem:2144` 畫弧 | **正確** |
| `case "vfxArc"` 零個 emitter | ✅ `grep -rn vfxArc packages apps content` 只剩測試與這個 case 本身；`eventFanout` 也沒有它 | **正確** |
| 「13 支雷電技能用粒子預設」 | ⛔ **實際是 28 支**（`grep -rl 'fx.prim.lightning' content/abilities/`） | **偏低** |
| 「飛鼠先生找不到」 | ⭐ **找到了**：`godie-udea` = 「至尊學長 - 飛鼠先生」，雷電技能是 **65-04 天譴**（`chainLightning`），⇒ 它在上一個 commit（`7f8c95fb`）就已經修好 | **已解決** |

⭐ 另一個交辦沒提到、但決定了整個做法的事實：

> **`grep -l chainLightning content/abilities/` 只有 2 支**（86-04 打雷絕招 / 65-04 天譴）。
> 帶 `fx.prim.lightning.*` 的有 **28 支**。⇒ 上一輪修好的是 2/29，剩下 28 支一道弧都沒有。

---

## 1. 盤點：這 28 支各自要哪一種電弧

`fx.prim.<element>.<shape>` 的 shape token 就是答案（這個慣例**不是我發明的** ——
`sim/abilities/abilitySystem.ts` 的 emit 註解逐字寫著它把 `vfxKey` 送上線就是為了讓
客戶端 play the ELEMENT whoosh，**音效那一層早就照這個 token 路由了**）。

| 電弧種類 | shape token | 擋住幾支 | 說明 |
|---|---|---:|---|
| **① 直擊**（施法者 → 落點的一道） | `beam` `bolt` `slash` `dash` | **16** | 含雷神之槌 15-01（`bolt`）、千鳥 45-03、電光一閃 58-00（`dash`） |
| **② 爆散**（從身上往外炸開 N 道） | `nova` `explosion` `pulse` | **12** | 含皮卡丘 58-04（`explosion-lg`）、雷電萌神 86-002 |
| **③ 連鎖** | —（`chainLightning` effect） | 2 | **已完成**（`7f8c95fb`） |

⚠️ 再套一條規則「**自身型（沒有落點）／落點太近的 `strike` 退回 `burst`**」之後，
實際畫出來是 **直擊 11 支 / 爆散 17 支**。⛔ 沒有第三種形狀。

---

## 2. ⛔ 為什麼**沒有**走「新 effect kind + 28 份 JSON」那條路

交辦建議的形狀是「一個 effect kind 發 `vfxArc` + `eventFanout` 白名單 + 28 支 JSON 引用」。
我**沒有**這樣做，兩個各自獨立就足以否決的理由：

### ① ⛔ 那 28 份裡有 8 份**改不動** —— 而 owner 點名的雷神之槌就在裡面

`godie-emfr.*`（15-01 雷神槍＝**雷神之槌**、15-04）· `godie-e00w.*`（77-xx）·
`godie-edem.*`（45-0x）· `godie-e00r.r`（59-04）是 **`tools/skill-remake/batch1.py` 的產物**。

實測（唯讀）：

```
$ python3 tools/skill-remake/batch1.py --check
產生器印記一致：90 支
```

它**整份覆寫**那 90 支（`json.dump(d, …)`，不是欄位級 patch），而 `--check` 逐位元組比對。
⇒ 手改出貨 JSON = ⛔ **改產物**（CLAUDE.md 逐字：「改產物等於沒改」），
`skills:check` 當場紅，主 session 最後跑 `skills:sync` 會把它**無聲覆寫**。
而 `tools/**` **不在這條 lane 的柵欄裡**。

⇒ ⭐ **走 JSON 那條路，owner 點名的三個例子裡最主要的那一個永遠修不好。**

### ② 第〇·五守則：28 份各填一格 = 同一件事抄 28 次

「為某支技能寫一個 if」與「為 28 支技能各填一格參數」是同一個病的兩種寫法。
⭐ 正解是一條**家族規則**：機制認得「電系施法」，⛔ 不認得任何一支技能的名字。

---

## 3. 做了什麼 —— **一個機制、一張表、零份內容改動**

### ⑴ `apps/client/src/vfx/arcBolt.ts`（純函數 + 表）

| 新增 | 是什麼 |
|---|---|
| `parsePrimFxKey(key)` | `fx.prim.<element>.<shape>[-<size>]` → 三個 token。⛔ 其他命名一律 `null`（不猜） |
| `ARC_CAST_SHAPES` | ⭐ **七個字根 → 一種電弧**（mode / count / reach / power / forks）。表以外的字根**不畫** |
| `ARC_CAST_SIZES` | `-lg` 1.35 / `-sm` 0.7。⛔ 只縮放強度與長度，不改模式；未知後綴（`beam-flat`）= 1 |
| `ARC_CAST_ELEMENTS` | ⭐ **哪些元素會長弧** —— 出貨只開 `lightning` 一列。開第二族＝**加一列**，⛔ 不動程式 |
| `ARC_CAST_MIN_STRIKE_LEN` / `_SELF_REACH` / `_SELF_COUNT` | 「落點太近／不存在就退回爆散」那條規則的三個數 |
| `arcRadiateEnds(centre, count, reach, seed)` | 爆散的幾何：**均分一圈再各自抖一點**（⛔ 不是 N 顆雜湊當方向 —— 純雜湊會結塊，讀起來是「往那邊噴了一坨」） |
| `arcCastPlan(keys, caster, point, seed, bodyY)` | ⭐ 純函數：這一次施法要打哪幾道弧。**第一個認得的元素說了算**（一次施法最多一組） |

### ⑵ `apps/client/src/vfx/VfxSystem.ts` —— `case "abilityCast"` 裡 8 行

```ts
const arcKeys = layers ? layers.map((l) => l.vfxKey) : [];
arcKeys.push(vfxSrc?.vfxKey);
const arcSeed = ((ev.tick | 0) * 131 + caster * 17) | 0;   // 與 chainLightning 同一條公式
for (const req of arcCastPlan(arcKeys, pos, point, arcSeed, ARC_BODY_Y)) this.strikeArc(...);
```

⚠️ **必須同時掃 layers 與頂層 `vfxKey`**：**雷神之槌的閃電根本不在頂層** ——
`godie-emfr.q` 的 `vfxKey` 是 `fx.prim.wind.tornado`，閃電在 `vfxLayers[0]`。
只讀頂層的話，owner 點名的那一支照樣沒有弧（而且測試會全綠）。

### ⑶ 種子是決定性的

`tick × 131 + caster × 17`，與 `case "chainLightning"` 逐字同一條公式。
⛔ 沒有 `Math.random` ⇒ 同一場重播長出同一條折線。

---

## 4. 涵蓋率：**28 / 28**（量的，⛔ 不是估的）

用鏡射同一條規則的腳本跑過 `content/abilities/` 全部 1,000+ 份：

```
接上 28 支  (strike 11 / burst 17)
未接上但文件裡有 prim.lightning: 0
```

owner 點名的三個：

| owner 說的 | 是誰 | 現在 |
|---|---|---|
| **皮卡丘** | 58-04 瘋狂皮卡丘 `godie-ofar.r`（+ 58-00/01/03/002 共 5 支） | ✅ `explosion-lg` → 8 道爆散 |
| **雷神之槌** | 15-01 雷神槍「巨神殺手」`godie-emfr.q` | ✅ `bolt`（layer 1）→ 施法者 → 落點一道直擊 |
| **飛鼠先生** | 至尊學長 - 飛鼠先生 `godie-udea`，65-04 天譴 | ✅ 走 `chainLightning`（`7f8c95fb` 已修） |

---

## 5. 守衛（靈魂層：測試 ≤ 實作，突變一批一條）

`apps/client/src/vfx/castArc.test.ts` —— 3 條，全部跑**出貨的 JSON**
（`content/abilities/*.json` 讀進真的 `Abilities` 登錄表 → 真的 `abilityCast` 事件 →
讀真的 Babylon 頂點）：

| # | 問什麼 |
|---|---|
| ① | **雷神之槌**的弧真的**橫跨施法者→落點**（⛔ 不是「有一個網格」——長在原地的弧會通過那種斷言） |
| ② | **皮卡丘**（自身型、無落點）從身上炸開 ≥ count 道，而且**指向不同方向**（⛔ 不是一坨） |
| ③ | ⛔ **不是每一支技能都變成閃電**：`fx.prim.arcane.pulse-sm`（65-01 神出鬼沒）一道弧都不畫 |

⛔ 沒有任何斷言抄出貨數值（第二守則）：道數從 `ARC_CAST_SHAPES` 推導，
顏色／長度／壽命一個都沒進斷言。

**突變驗證（一條承重線）**：
`VfxSystem.handleEvent` 的 `for (const req of arcCastPlan(...))` 改成 `.slice(0, 0)`
→ ①② 紅（`expected 0 to be greater than 0` / `expected 0 to be greater than or equal to 8`），
③ 仍綠（正確：它問的是「不該畫的沒畫」）。改回來用 `Edit`，⛔ 不是 `git checkout`。

---

## 6. 順帶：`eventFanout.ts` 兩處「說了但不會發生」的註解（第一·五 / 第三守則）

| 註解宣稱 | 真相 | 處理 |
|---|---|---|
| `immune` payload 有 **`type`** 欄位 | ⛔ **不存在**。`sim/combat/damage.ts:827` 的 emit 是 `{ target, source, amount, dmgType, origin, x, z }` | 拿掉 `type`，並寫下「讀 `data.type` 會拿到 `undefined`，然後把每一次免疫畫成同一種顏色 —— 而它看起來完全正常」 |
| `immune` 與 `evade`「**same payload shape**」 | ⛔ 假的。只是欄位重疊 | 改成「只是欄位重疊，⛔ 不是同一個形狀」 |
| 「**THE CLIENT HANDLER IS NOT WIRED YET**」（三則） | ⛔ 三則裡有一則已經是假的：`immune` 在 `net/RoomConnection.ts:396` 接上了 | 拆成兩半並指名：`immune` ✅ 已接；`immunityGranted`/`immuneControl` ⛔ 仍零消費端，**而那是寫下來的決定**（`worldCues.ts` 的 `WORLD_CUE_OUT_OF_SCOPE`），不是遺漏 |

---

## 7. ⛔ 沒做到的部分（各自帶理由）

| 沒做 | 為什麼 |
|---|---|
| **新 effect kind（`vfxArc` 的發射端）+ `eventFanout` 白名單那一行** | ⭐ 家族規則已經接上 28/28，**再加一個沒有任何內容在用的 kind 就是第一·五守則禁的東西**（卡面上／契約上多一個機制，遊戲裡零使用）。而且它救不了那 8 支產生器擁有的技能（見 §2①）。⇒ `case "vfxArc"` 維持零 emitter，我在它上面寫了一段**誠實的**註解說明「今天沒有人發它、出貨的兩條真路是哪兩條」 |
| **把電弧參數做成後台欄位**（第一守則） | 它該住 `config.vfx-families@1`，而那份 Zod（`packages/shared/src/content/schema/config/`）＋ `content/config/**` ＋ `apps/admin/**` **三邊都不在這條 lane 的柵欄裡**。⇒ 值住在 `arcBolt.ts` 的表 —— 那是這一族**既有的唯一數字來源**（`ARC_BOLT_TUNING` 的檔頭在這條 lane 之前就寫下了同一個限制與同一個理由）。⭐ 接上後台只要加 schema 欄位再折進 `arcBoltSpec`／`arcCastPlan` 的 opts，⛔ 不必動渲染層 |
| **貼圖** | owner 說「演算法**以及特效貼圖**」。貼圖那一半**已經在了**：`arcGlowRamp()` 程序生成一條 1×32 的 RGBA 直條（中央白熱、兩緣 alpha 掉到 0，二次衰減），走 `RawTexture` ⇒ headless 也建得起來。⛔ **一個素材都沒有下載**（硬性禁令） |
| **平衡／數值** | 這一票是視覺，一個傷害數字都沒動 |

## 8. ⚠️ 一個要讓 owner 知道的取捨

**爆散型現在每次施法會建 5–8 條弧帶（各帶 0–1 條分岔）**，池上限 `MAX_ARC_STRIPS = 32`。
58-01 十萬伏特這種**低冷卻**的 `nova` 技能會相當顯眼。
⭐ 如果 owner 覺得太吵，改的是 `ARC_CAST_SHAPES` 的 `count`／`reach` **一格**，
⛔ 不是任何一支技能 —— 而下一條 lane 應該把這張表接進 `config.vfx-families@1`
（見 §7 第二列，那是這條 lane 唯一真正欠的東西）。

---

## 9. 指令離開碼

| 指令 | 結果 |
|---|---|
| `python3 tools/skill-remake/batch1.py --check`（唯讀，診斷用） | 0（「產生器印記一致：90 支」） |
| `npx vitest run src/vfx/castArc.test.ts`（新守衛） | **0** — 3 passed |
| `npx vitest run src/vfx/castArc.test.ts`（突變） | **1** — 2 failed（預期） |
| `npx vitest run src/vfx`（全 vfx 目錄） | **0** — 79 files / **639 tests passed** |
| `pnpm --filter @ggd/client typecheck` | **0** |

⛔ 全程沒有跑 `content:build` / `skills:sync` / `spec:build`（全域鎖）；
⛔ 沒有連過 `ggd.adms.ai`；⛔ 沒有 `gh` 寫入；⛔ 沒有下載任何素材；
⛔ 沒有 `git add` / `stash` / `checkout` / `amend` / `reset`。
⭐ 本 lane **不產生任何需要重生成的產物** —— 沒動 schema、沒動 effect kind、沒動 `content/`。
