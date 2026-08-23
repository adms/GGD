# P1 · 技能模板群組第 1 項 —— 三支驗收技能（含「本體拿不到」那一支）

> lane P1 · 2026-08-23 · 完整報告（回傳值另有 ≤500 字摘要）

## owner 逐字（這一批的題目）

> 「1. **Saber約束勝利之劍(翻滾光束)**, **依文世界終結(圓周噴發大冰塊)**, **莉娜龍破斬**
>  (一直線火球衝擊波後目的地火焰大爆炸) 都是動畫特效，產出**技能與特效模板** 還有**檢查
>  script**，⭐ **別忘了還有特效文字**」

---

## ① #566 那一段到底在講什麼（先讀，⛔ 不重蹈覆轍）

`gh issue view 566` 的 **D 節「機制認錯（照做會做出原作沒有的東西）」**裡有這一列：

| ⛔ 不要做 | JASS 實際 |
|---|---|
| `godie-n01g.r` 42-04 世界終結「無原作 dummy 對應」 | 假的：`DUMMY_ORB_MAP` 有 `u013` 世界終結／`FrostNovaTarget.mdl`⋯⚠️ 而且 `godie-n01g` 是 alternate，base `godie-n003.r` 一個 `spawnModelFx` 都沒有 ⇒ **本體施放看不到** |

⇒ ⭐ **被否決的是「無原作 dummy 對應」這個宣稱**（那句話是錯的，冰塊模型一直都在 repo 裡）。
⛔ **「本體施放看不到」不是被否決的東西 —— 它是那一列順手記下來的、一個真的缺陷**，
而它因為住在一張標題寫著「⛔ 不要做」的表底下，讀起來像「不用管」。

⚠️ 這正是 CLAUDE.md 記過的形狀：**一個真的缺陷被埋進一張「不要做」的表**，
於是它既沒有票、也沒有守衛，而**每一條既有的閘都是綠的**。

**複驗（第三守則，⛔ 不信轉述）**：
- `content/config/roster.json` 的 `retiredChampions` **沒有** `godie-n003`，也**沒有** `godie-n01g` ✅（票裡說的沒錯）
- `data/curation/whitelist.json`：`godie-n003` ✅ 在、`godie-n01g` ❌ **不在**
  ⇒ ⭐ 變身態根本不是玩家「選得到」的那一份，演出只長在它身上 = 沒有人看得到
- 改動前 `godie-n003.r`：`spawnModelFx` **0 個** · `floatingText` **0 個** · `template.ref = tpl-line-sweep`（那個模板展開只有一發 `spawnProjectile`）

---

## ② 三支本體現在的狀態（一支一行）

| 技能 | 本體 id | 模型出場 | 特效文字 | 幾何住哪 |
|---|---|---|---|---|
| 20-03 約束與勝利之劍 | `godie-e002.e` | ✅ 本來就有 | ✅ 本來就有（1 句） | `preset: "tpl-beam-roll"` ⭐ 已在共用表 |
| 42-04 世界終結 | `godie-n003.r` | ⭐ **這次接上**（`preset: "tpl-radial-burst"`） | ⭐ **這次接上**（4 句，含 3 句 `delayed` 錯開） | `tpl-radial-burst` ⭐ 這次進共用表 |
| 04-03 龍破斬 | `godie-hjai.e` | ✅ 本來就有 | ✅ 本來就有（5 句） | 逐支手寫（`imported.fireblast`，⛔ 與兩張表的幾何都不同 ⇒ 引用模板要覆寫每一格，等於沒有共用） |

⭐ **順手把變身態 `godie-n01g.r` 也改成引用同一張表** —— 它原本把
`modelKey/path/speed/distance/count/spin/scale/touchRadius/touchSide` **九格**手寫在技能 JSON 裡，
那正是第〇·四守則說的第二個住處。⇒ 現在本體與變身態**讀同一張表**，改表一個數字兩邊一起變。

⚠️ **`godie-n003.r` 從 `template.ref` 脫鉤（eject）是必要的，⛔ 不是偷懶**：
`mergeExpansion()` 會把 `EXPANDED_KEYS`（含 `effects`）**整個刪掉再放回展開結果** ——
所以一份綁著 `template` 的文件**放不下任何手寫的 `effects`**，而 owner 要的四句台詞
（特效文字）是逐支的內容，⛔ 不可能由模板產生。
⇒ 行為改由 `effects` 直接承載，**演出幾何**仍然只住在模板裡（`preset`）。
被取代的 `tpl-line-sweep` 展開結果（一發 `spawnProjectile imported.wave` + `damageTier:"小"` + 100% AP）
**逐字保留**在新的 `effects[0]` 裡，⛔ 沒有任何行為被無聲丟掉。

---

## ③ `tpl-radial-burst` 轉正（draft → enabled）

⚠️ **轉正不是改一個字**。`paramsSchema.test.ts` 逐字要求：
`status:"enabled"` ⇒ `isExpandable(family)` 必須為真，而 `draft` ⇒ 必須為假。
⭐ 而更硬的是 `editorCapabilities.test.ts` 的 `ec-families`：

> ⭐ 真正致命的那一半是：**被出貨內容真的引用的家族**，必須展開得出來、而且必須在對外契約的清單裡。

⇒ **出貨內容一寫下 `"tpl-radial-burst"` 這個字串，這個家族就必須存在。** 所以這一項落三處：

| 檔 | 做了什麼 |
|---|---|
| `packages/shared/src/content/templates/expand.ts` | ⭐ 新增 `"radial-burst"` 家族展開器（beam-roll 的姊妹，差別只有 `path` 與 `count`；`castType:"skillshot"` 因為它從施法者身上往外炸、⛔ 沒有落點可以瞄） |
| `content/ability-templates/tpl-radial-burst.json` | `status: draft → enabled`；補 `path`（enum，預設 `radial`）與 `touchSide` 兩格（`preset` 要補得出「往哪裡去」與「掃誰」）；`castTimeSec` 預設改成 42-04 的 1.233 |
| `packages/shared/src/content/editorCapabilities.ts` | `FAMILY_PROBE_LIST` 補一行 `"radial-burst"` ⚠️ **見下面④，這個檔我沒有 commit** |

### `PRESET_FIELDS` 收 `count`（`packages/shared/src/content/modelFxPreset.ts`）

⚠️ 沒有這一格，`tpl-radial-burst`「**只能被抄不能被引用**」：
`zSpawnModelFx.refine` 的原話是「缺了 count 整組等分**退化成 1 具**，而那看起來就跟
`path:"forward"` 一模一樣」⇒ 每一支圓周噴發只能把「12」再抄一份進自己的 JSON。

⭐ **補得進去是因為 `path` 本身也在這張表上**：refine 只在**節點自己寫下** `radial`/`orbit` 時
才要求 `count`，而引用模板的節點兩格都留白 ⇒ 載入時一起補上，⛔ 沒有一格是「填了沒人讀」。
⚠️ 模板沒有這一格時（`tpl-beam-roll` 就沒有）逐位元不變 ⇒ ⛔ 直線光束不會長出讀不到的 `count`。

---

## ④ 兩份驗收產物 —— 現在指同一份名單，而且全部是本體

| 產物 | 之前 | 現在 |
|---|---|---|
| `tools/skill-audit/audit.py` 的 `CALIBRATION` | `godie-h020.e` · `godie-h020.r` · `godie-n01g.r` · `godie-hart.r` ⛔ **前三個都不在白名單**（`godie-h020` 逐字寫在 `roster.json` 的 `retiredChampions` 裡） | ⭐ `godie-e002.e` · `godie-n003.r` · `godie-hjai.e` |
| `apps/client/.../ownerAcceptanceThree.test.ts` 的 `ACCEPTANCE` | `godie-hjai.e` · `godie-n003.r` · `godie-hart.r` | ⭐ 同上，逐字一樣 |

**兩個檔頭都寫下了「為什麼」**（哪一個 id 被換掉、依據哪一份出貨設定判定它玩家拿不到）。

⚠️ **被拿掉的知識沒有消失**（知識不可以無聲消失）：
- 04-04 神滅斬 的本體是 `godie-hjai.r`、01-04 超究武神霸斬 的本體是 `godie-hart.r`
- 兩支仍然**逐支被 audit 量到** —— `CALIBRATION` 只決定文件 §3 展開哪幾支，⛔ 不是判準
  （audit.py 自己的檔頭逐字：「把這一格清空，421 支的量測一個位元組都不會變」）
- `godie-hart.r` 的特效文件仍然被 `w3xAbilityArt.test.ts` **逐列**驗（那一支跑遍每一列晉升，⛔ 不是只驗這三支）—— 已逐行讀過確認，⛔ 不是推測

### ⚠️ 還有**第三份**驗收產物也指著下架抄本 —— ⛔ 在柵欄外，沒有動

`packages/shared/src/content/shippedModelFxAbilities.test.ts` 的 `SUBJECTS`：
`godie-h020.e`（**下架**）· `godie-e002.e`（本體 ✅）· `godie-n01g.r`（變身態，不在白名單）。
它的檔頭引用的正是 owner 這三支的 2026-08-22 版原話。
⇒ ⭐ **同一個病的第三份**，改法與上面兩份一模一樣（`h020.e → hjai.e`、`n01g.r → n003.r`）。
⛔ 我沒有改它：那個檔不在我的檔案柵欄裡。**建議另開一票或由下一條 lane 收。**
（它目前是綠的 —— 我把 `n01g.r` 改成引用模板之後解析結果逐格相同，所以那一支照樣過。）

---

## ⑤ 守衛（靈魂層，一批一條突變）

`apps/client/src/render/vfx/ownerAcceptanceThree.test.ts` 新增第三條：

> ★ 每一支放出來，畫面上真的有模型出場、也真的有特效文字

- 標本取自**出貨內容**：`ContentLoader` + `FsContentSource` + `registerAll` + 真的 `SimWorld`
  + 真的 `world.events` ⇒ ⛔ 沒有手寫夾具（失敗形態⑤）
- 斷言只有三句：`modelFxSpawn` > 0 · `floatingText` > 0 · 42-04 的 `instances.length` **> 1**
- ⛔ **一個出貨數值都沒抄**：「幾具冰塊」只問 **> 1**（等分有沒有發生＝機制），⛔ 不是 12

### 突變紀錄（承重線）

```
packages/shared/src/content/modelFxPreset.ts 的 PRESET_FIELDS 拿掉 "count"
  ＝ 引用模板的節點補不到等分數 ⇒ spawnModelFx 退化成「一具」
  ⚠️ 而畫面上「一顆大冰塊」與「十二顆」都看得到東西 ⇒ 前兩條斷言與
     modelFxSpawn 那一條**全綠**
→ 紅：「依文潔琳 世界終結: 只生出一具模型 —— 圓周噴發退化成一具:
        expected 1 to be greater than 1」
（已用 Edit 改回，⛔ 不是 git checkout）
```

### ⭐ 順帶：42-04 的棘輪往下轉了三格

`abilityCodeParity` 的 `42.json` 基準線原本記著三筆本體↔變身態漂移
（`42-04|effects` · `42-04|template` · `42-04|targetsEnemies`）——
兩份改成同一個形狀之後三筆**全部修好**，測試自己喊「把它們拿掉，棘輪才會往下轉」。
⇒ 三筆已移除。順手替 `godie-n01g.r` 補上缺的 `targetsEnemies: true`（本體有、變身態沒有）。

`abilityCodeParityForms.baseline.json` 用 `GGD_FORM_PAIR_DUMP=1` 重新產生，
⚠️ 但**只留下 42-04 那一筆**：同一次 dump 也動到 `20-002`（`godie-e002.ex` / `godie-e00l.ex`），
那是**另一條 lane 還在飛的改動** ⇒ 已逐鍵還原成 HEAD 的值，⛔ 不替別人蓋章。

---

## ⑥ 指令與離開碼

| 指令 | 離開碼 |
|---|---|
| `npx vitest run`（7 檔：ownerAcceptanceThree · paramsSchema · abilityMirror · modelFxPreset · editorCapabilities · shippedModelFxAbilities · stack） | **0** |
| `npx vitest run`（突變驗證，1 檔） | 1（**預期**，訊息如上） |
| `npx vitest run`（20 檔回歸：parity / claims / prose / expand / vfx / wire contract…） | 1 → 三個紅，兩個是別條 lane 的（見下），一個是我的棘輪（已修） |
| `GGD_FORM_PAIR_DUMP=1 npx vitest run abilityCodeParityForms` | **0** |
| `npx vitest run`（6 檔收尾） | 1 → **只剩別條 lane 的兩個** |
| `pnpm typecheck` | **0** |

### ⛔ 收尾時仍然紅的兩個 —— **都不是我的**（逐項複驗過）

| 紅的 | 誰的 |
|---|---|
| `abilityCodeParityForms`：`20-002 兩邊都動了（godie-e002 ／ godie-e00l）` | `godie-e002.ex` / `godie-e00l.ex` 在工作區被**別條 lane** 改了（`git status` 逐字），兩個檔都在我的 ⛔ 禁令清單上 |
| `fieldAdoption`：`enum:abilities.effects[]#floatingText.applyTo=victim` 豁免過期 | 用到 `applyTo:"victim"` 的是 `godie-e002.ex` / `godie-e00l.ex` / `godie-hart.r`（`grep` 逐檔確認）—— ⛔ 我這一批的 `floatingText` **全部是 `applyTo:"self"`** |

---

## ⑦ 沒做到的 / 交給主 session

1. **⛔ 沒有 commit `packages/shared/src/content/editorCapabilities.ts`**（`FAMILY_PROBE_LIST` 補的那一行 `"radial-burst"` 留在工作區）。
   ⚠️ 理由：那個檔**已經帶著另一條 lane 未提交的改動**（`floatingText` capability 那一整段的改寫）。
   `git commit -- <檔>` 送的是**整個檔的工作區狀態** ⇒ commit 它就等於把別人的成果連同錯的票號一起送上車。
   ⭐ CLAUDE.md 對這個方向的裁決是「pathspec 擋得住我把別人的東西送上車」——所以我停在這裡。
   **⇒ 那一行是必要的**（少了它 `ec-families` 會紅，對外契約看不到 `radial-burst`）：
   請主 session 或 P4 連同他們那個檔一起 commit。
2. **⛔ 沒跑 `content:build` / `skills:sync` / `spec:build`**（全域鎖）。
   ⇒ 目前**預期會紅**的產物閘：`shippedBundleIsCurrent`（bundle 過期）· `audit:check`
   （`docs/技能模板驗收標準.md` 過期，`CALIBRATION` 與內容都動了）· `caps:check`
   （`radial-burst` 要進 `ggd-runtime-capabilities`）· `content/editor-target-profile.json`。
   **主 session 最後跑一次 `pnpm skills:sync` 就會全部收斂**（`audit:build` 與 `content:build` 都在裡面）。
3. **`shippedModelFxAbilities.test.ts` 的 `SUBJECTS` 仍指著下架抄本**（見④）—— 柵欄外，沒動。
4. **`godie-hjai.e` 沒有改成引用模板** —— 它的幾何（`imported.fireblast` / 27.5 / 12 / 360° / 4.5）
   與兩張表都不同，引用等於逐格覆寫 ⇒ 那不是共用，是多一層間接。
   ⭐ 真要收，正解是**第三張表**（`tpl-dragon-shockwave` 已經存在但是 draft），⛔ 不是硬塞進現有兩張。

## ⑧ 「我挑了什麼」（owner 不在 ⇒ 自己判斷，但留得回頭的路）

| 我挑的 | 回頭怎麼改 |
|---|---|
| 本體走**同一個演出**（⛔ 不是替本體另外設計一套） | 改 `content/ability-templates/tpl-radial-burst.json` 一個數字，本體與變身態一起變 |
| 演出幾何全部搬進共用表（`preset`） | 技能 JSON 的節點自己寫下的值**永遠贏**模板 ⇒ 要讓某一支不一樣，在那一支補那一格就好 |
| `castTimeSec` 預設 1.233（＝42-04 兩份抄本現值） | 模板一格 |
| `n01g.r` 補 `targetsEnemies: true` | 拿掉那一格即可（但棘輪基準線會再記一筆漂移） |

⛔ **一個系統倍率、一個 owner 旋鈕都沒有動**（`content/config/owner-knobs.json` 逐字未改）。
