# 給 Codex 編輯器：type 模板的交付格式與合作方式

> ⛔ **與根目錄 `AGENTS.md` 衝突時以 `AGENTS.md` 為準**（GH#988）—— 這一份是背景與細節，⛔ 不是規則的來源。
> ⭐ **這一份是「你要交給我什麼形狀」的規格。** 先讀這一份，再去整理你手上的 type 模板。
> ⛔ 不要先整理再問格式 —— 那會整理成一個我收不進去的形狀。
>
> owner 2026-09-04（逐字，這份文件的來源）：
> 「如果同類特效 你可以用 **type1, type2 ....** 的方式擴充 讓設計者有更多選擇而不是只能靠自己微調」
> 「你應該有**非常多 type** 不只 1, 2 尤其常見共用例如**光束砲系列**，並且應該建**文件、script 跟 codex編輯器契約**來實現」
> 「**整個矩陣是用來微調的**，你的任務是將我們**調好的常用幾種作為 type 積木**讓編輯器選用後，可以再用矩陣微調節省時間」
> 「請你**不要浪費遺漏我們之前做的所有成果**，都可以收斂成 type N」

---

## 0. 一句話：兩層，⛔ 不是一層

| 層 | 是什麼 | 誰維護 | 設計者怎麼用 |
|---|---|---|---|
| **type（積木）** | 已經調好的**常用組合**，一個名字帶 3–20 格預設值 | ⭐ Main（引擎側） | **挑一個** |
| **矩陣（微調）** | `fx.prim.{元素}.{形狀}` 154 個組合 ＋ 節點自己的欄位 | Main | 挑完之後**再改幾格** |

⭐ **節點自己寫下的值永遠贏過 type 的預設** —— 這是機制保證的，⛔ 不是慣例。
（`packages/shared/src/content/modelFxPreset.ts` 的 `fillOne()`：`if (out[k] === undefined)` 才補。）

⇒ 所以「挑 type → 再微調」不會互相打架：**type 只填空白格**。

---

## 1. ⭐ 你要交給我的形狀：一份 `template@1` 文件

⛔ 不要發明新格式。type 就是**既有的 `template@1`**，schema 住
`packages/shared/src/content/schema/template.ts`，出貨的 46 份範例住 `content/ability-templates/`。

```jsonc
{
  "id": "tpl-<family>",              // ⭐ 檔名 = id，kebab-case，前綴一律 tpl-
  "schema": "template@1",
  "name": "人看得懂的短名",
  "description": "一句話：這個 type 做出來的東西長什麼樣",
  "family": "<family>",              // ⭐ = id 去掉 tpl- 前綴（今天 46 份全部 1:1）
  "status": "enabled",               // ⭐ 見 §2：draft ＝ 我不會收
  "params": {                        // ⭐ 這就是「已經調好的」那些值
    "modelKey":  { "type": "string", "default": "w3x.stock.revivehuman" },
    "path":      { "type": "enum", "values": ["forward","toTarget","static","radial","orbit"], "default": "forward" },
    "speed":     { "type": "number", "default": 18 },
    "scale":     { "type": "number", "default": 2.5 },
    "lifeSec":   { "type": "number", "default": 2.0 }
    // …只放**這一族共同的**值。逐支不同的東西 ⛔ 不要放（見 §4）
  },
  "requires": ["spawnModelFx"],      // ⭐ 這個 type 要引擎有哪些機制才活得起來
  "gapScore": 8,                     // 0–10，引擎支援度；⭐ 見 §2
  "exemplar": {                      // ⭐⭐ 最重要的一格 —— 見 §3
    "skill": "20-03 約束與勝利之劍",
    "jass":  "war3map.j:32372 Trig_avalonReady_Actions"
  }
}
```

### 落點與命名

| | |
|---|---|
| 路徑 | `content/ability-templates/tpl-<family>.json` |
| ⚠️ 索引 | ⛔ **不要手改** `_index.json` —— 它是 `content:build` 的產物 |
| ⚠️ 提交前 | 跑 `bash scripts/genguard.sh content/ability-templates/<檔>`，它會告訴你這個檔有沒有產生器擁有者 |

### ⛔ 三個不要

1. ⛔ **不要用 `type1` / `type2` 當 id。** owner 的「typeN」講的是**概念**（一族有很多可選項），
   ⭐ 而落地要用**說得出它是什麼**的名字（`tpl-beam-roll` / `tpl-locust-orb`）。
   ⚠️ `type3` 這種名字在半年後沒有人知道它是什麼，而那正是「做完沒收斂」的成因之一。
2. ⛔ **不要為了湊數而開空殼。** 今天 46 份裡有 **13 份是 `draft` ＋ 0 個參數** ——
   它們佔著名字而不能用，⭐ 而它們正是這份文件要防的東西。
   ⚠️ ⭐ 另有 **1 份哨兵**（`tpl-data-no-trigger`）是**刻意**永遠不 enable 的普查終點，
   ⛔ **不要試圖填它** —— 判準是 `gapScore === 0`，⛔ 不是記住這個名字。
3. ⛔ **不要把逐支不同的值放進 `params.default`。** 判準見 §4。

---

## 2. `status` 與 `gapScore`：⭐ 這兩格決定我收不收

| `status` | 意思 | 我的動作 |
|---|---|---|
| `enabled` | ⭐ 這個 type **今天就能用**：參數齊全、引擎跑得動 | ⭐ 收，並登記進契約給設計者挑 |
| `draft` | 還在做 | ⛔ **不收進可挑清單**，但會留著 |

⭐ **判準（可以當場檢查）**：`status: "enabled"` 而 `params` 是空的 ⇒ ⛔ 那是空殼，我會退回。

⛔⛔ **而 `status` 本身只是一個宣告 —— ⭐ 真正的判準是「`expand()` 跑不跑得過」。**
2026-09-04 量到（拿每一份模板自己的 defaults 真的跑一次 `expand()`）：
**29 個 `enabled` 全部 OK · 17 個 `draft` 全部擲例外** ⇒ ⭐ `status` 今天是誠實的，
⛔ 而它誠實**不是結構保證的**。⇒ ⭐ 權威是 `ggd-type-catalog.json` 的 **`expands`** 欄位，
⛔ 不是 `status`，⛔ 也不是這份文件裡的任何數字。

⚠️ ⭐ 為什麼這一格要緊：系統是 **fail-soft**（`templateFailSoft.test.ts`）——
一份 `status:"enabled"` 卻沒有 `FAMILIES` 展開路徑的模板，⛔ 不會炸掉，
⭐ 它會讓引用它的那一支技能「**還在、但一個模板效果都沒有**」，
而你這一側看到的是一個**綠色的 badge**。
閘：`packages/shared/src/content/templateStatusIsHonest.test.ts`（兩個方向都關）。

`gapScore` 0–10 ＝ 引擎支援度。⭐ 它 ⛔ **不是你自評的**：
它要對得上 `requires` 裡每一個機制在 `docs/editor-contract/ggd-runtime-capabilities.md` 的宣告。
⚠️ 你宣告 `requires: ["spawnModelFx","conditionLeaf"]` 而其中一個是 `unsupported` ⇒ 這個 type 上線就是死的。

---

## 3. ⭐⭐ `exemplar` 是這份文件的核心 —— ⛔ 不可以留白

```jsonc
"exemplar": { "skill": "20-03 約束與勝利之劍", "jass": "war3map.j:32372 Trig_avalonReady_Actions" }
```

它回答一個問題：**這個 type 是從哪一次的成果收斂來的？**

⭐ owner 逐字：「請你**不要浪費遺漏我們之前做的所有成果**，都可以收斂成 type N」
⇒ 每一次特效分析／製作，如果沒有留下一個帶 `exemplar` 的 type，那次成果就**蒸發了**。

| ⛔ 不夠 | ⭐ 要有 |
|---|---|
| `"skill": "光束類"` | `"skill": "20-03 約束與勝利之劍"` |
| `"jass": "war3map.j"` | `"jass": "war3map.j:32372 Trig_avalonReady_Actions"` |
| `"jass": "(無)"` | `"jass": "無原作對應 —— owner 2026-XX-XX 新設計"`（⭐ 說出**為什麼**沒有） |

⚠️ **這一格是可稽核的**：我會拿 `jass` 的行號去 `tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j` 對。
指不到的行號 ⇒ 退回。

---

## 4. `params` 該放什麼：⭐ 判準是「**這一族共同的**」

| 放進 `params.default` | ⛔ 不要放 |
|---|---|
| 這一族**每一支都一樣**的（模型、播哪條動畫、材質混合模式） | 逐支不同的（傷害、冷卻、射程） |
| 「它看起來是什麼」 | 「它往哪裡去」（`path` 常被逐支覆寫 —— ⭐ 所以它有預設但**預期會被改**） |
| 從原作量到的常數（`scale` / `clipTimeScale`） | 你調到「看起來順眼」的數字（⭐ 那要寫進 `description` 說明來源） |

⚠️ ⭐ **每一格 `default` 都要引用得到出處** —— 這是 Main 側的既有守衛
（`packages/shared/src/content/templateDefaultsHaveOrigin.test.ts`，棘輪只能變短）。
⛔ 一個沒有出處的 `default` 會被後來的人當成「原作就是這樣」。

📏 已經發生過：`tpl-beam-roll.params.count.default = 6` 是**憑空來的**，
而它服務了 **7 支**技能；逐支覆寫 `count:1` 只修好被檢查的那一支。

---

## 5. ⭐ 你今天可以挑的 type（Main 已經有的）

⛔⛔ **這一整節的每一個數字都會過期，⛔ 不要照著它做。**
⭐ 權威是產生的機器可讀契約 **[`ggd-type-catalog.json`](ggd-type-catalog.json)**
（`pnpm typecat:build`，從 `content/ability-templates/` ＋ **真的跑一次 `expand()`** 推導）。
⚠️ 前科就在這一節：它原本寫「32 個」，而量到的是 **29 個**。

⭐ 底下留著的是**知識**（來源鏈、家族結構），⛔ 不是清單 —— 清單看 JSON。

**光束／直線系**（owner 點名的「光束砲系列」）
| id | 參數 | exemplar |
|---|---:|---|
| `tpl-beam-roll` | **17** | 20-03 約束與勝利之劍 —— ⭐ 橫放光束砲，四支經典共用 |
| `tpl-line-blast` | 15 | 04-03 龍破斬 |
| `tpl-line-sweep` | 6 | 20-03 約束與勝利之劍 |
| `tpl-traveling-wave` | 9 | 04-03 龍破斬 |
| `tpl-channel-beam` | ⛔ 0（draft） | — |

> ⭐⭐ **`tpl-beam-roll` 的來源鏈已經逐行對帳過**（2026-09-04，29 個 agent）——
> 完整結果存 `docs/legacy/_w3x-fidelity-superseded.md` 第 19 節。三句話：
>
> 1. ⭐ 它的 `modelKey` 家族預設 `w3x.stock.revivehuman` **是對的** ——
>    原作六個光束生成點裡有五個掛 `ReviveHuman.mdl`（h007 / h00S / h01V）。
> 2. ⛔ **「兩種復活光束」只有一種真的會生出來**：`ReviveDemon.mdl`（n00M）在
>    war3map.j / wct / wtg / doo **全部 0 次** ⇒ 有物件、零生成點的死資料。
>    ⇒ ⛔ **不要為它做第二個 type。**
> 3. ⭐ 原作的共同結構是「**光束本體 1 具 ＋ 砲口閃光 1 具**」，
>    而**每一具都是 `CreateNUnitsAtLoc(1, …)`，⛔ 沒有一處在迴圈裡**。
>    ⇒ ⚠️ 你若看到 `count > 1` 的光束，那是**傷害班表被讀成視覺**（CLAUDE.md 第〇·六守則⑥）。

**蝗蟲群系**（⭐ 五個 type 全在 —— 這一族就是「同類多 type」的現成範例）
| id | 參數 | exemplar |
|---|---:|---|
| `tpl-locust-orb` | 12 | 11-04 三千世界 |
| `tpl-locust-swarm` | 12 | 38-002 究極暴走黑龍波 三向黑洞 |
| `tpl-locust-line` | 11 | 09-04 龜派氣功 沿線火柱 |
| `tpl-locust-strike` | 11 | 65-002 永恆的愚蠢鄉 |
| `tpl-locust-travel` | 11 | 38-03 邪王炎殺黑龍波 黑洞層 |

**其餘 enabled 且有參數的**
`tpl-mark-stacks`(20) · `tpl-combo-finisher`(13) · `tpl-radial-burst`(12) · `tpl-summon-agent`(12) ·
`tpl-charge-push`(11) · `tpl-lock-combo`(10) · `tpl-periodic-field`(9) · `tpl-random-barrage`(9) ·
`tpl-leap-strike`(8) · `tpl-proxy-cast`(8) · `tpl-orbit-array`(7) · `tpl-blink-strike`(6) ·
`tpl-on-attack`(6) · `tpl-proxy-fanout`(6) · `tpl-teleport`(6) · `tpl-on-hit-react`(5) ·
`tpl-ground-nova`(4) · `tpl-instant-blast`(4) · `tpl-buff-self`(3) · `tpl-single-strike`(3)

**⛔⛔ ⭐ 三份「分析做完了，而引擎沒有展開路徑」—— 這一批是 Main 的工作，⛔ 不是你的**

| id | 已經寫好的參數 | exemplar |
|---|---:|---|
| `tpl-dragon-quake` | **12** | 38-03 邪王炎殺黑龍波 |
| `tpl-dragon-serpent` | **12** | 38-002 究極暴走黑龍波 |
| `tpl-dragon-shockwave` | **9** | 38-03 邪王炎殺黑龍波 |

⭐ 三份都有完整 `params` ＋ `exemplar` ＋ 逐行讀過 JASS 的 `description`，
⛔ 而 `expand.ts` 的 `FAMILIES` 沒有它們的條目。⇒ ⛔ **今天不要挑它們**
（引用會靜靜地變成「這支技能一個模板效果都沒有」）。⭐ 我會補那 3 個條目。
⚠️ 它們在契約裡的位置是 `analysedButUnwired`，⛔ 不在 `types`。

**⛔ 13 份空殼（`draft` ＋ 0 參數，⛔ 今天不能挑）**
`tpl-barrier-domain` · `tpl-death-mechanic` · `tpl-drain-leech` · `tpl-global-rule` ·
`tpl-growth-charge` · `tpl-life-manipulate` · `tpl-pull-throw` · `tpl-pure-cosmetic` ·
`tpl-range-gamble` · `tpl-resource-ops` · `tpl-strip-transform` · `tpl-team-synergy` · `tpl-channel-beam`

⭐ **這 13 份是最值得收斂的目標** —— 名字都佔好了，缺的是把成果填進去。

**⚠️ 1 份哨兵（⛔ 刻意永遠不 enable）**
`tpl-data-no-trigger` —— 它自己的 `description` 逐字寫著「永遠不會有參數，也永遠不會 enabled」。
⛔ 不要填它。⭐ 判準是 `gapScore === 0`（契約裡的 `sentinels`），⛔ 不是記住這個名字。

---

## 6. 挑完 type 之後：⭐ 怎麼微調

技能文件裡引用 type 的形狀（`zAbilityTemplateCard`，支援**堆疊多張**）：

```jsonc
"effects": [
  {
    "kind": "spawnModelFx",
    "preset": "tpl-beam-roll",   // ⭐ 挑 type
    "path": "toTarget",          // ⭐ 微調：這一格自己寫 ⇒ 贏過 type 的預設
    "scale": 3.0                 // ⭐ 同上
    // ⛔ 其餘 15 格留白 ⇒ 載入時由 type 補上
  }
]
```

**矩陣那一層**（`vfxId` / `vfxKey`）：`fx.prim.{元素}.{形狀}`

| 軸 | 值 |
|---|---|
| 元素（13） | `arcane` `blood` `earth` `fire` `holy` `ice` `ki` `lightning` `nature` `physical` `sound` `void` `wind` |
| 形狀（25） | `arc` `beam` `beam-flat` `beam-lg` `bolt` `bolt-lg` `dash` `explosion` `explosion-lg` `nova` `nova-lg` `pulse` `pulse-lg` `pulse-sm` `shockwave` `shockwave-lg` `slash` `slash-lg` `spray-back` `summon` `summon-lg` `swarm` `swarm-lg` `tornado` `tornado-lg` |

⚠️ **154 / 325 個組合今天存在（47%）** —— ⛔ 不是每一格都有。
⭐ 挑之前先確認 `content/vfx/fx.prim.<元素>.<形狀>.json` 真的在；不在就跟我說（見 §7）。

---

## 7. ⭐⭐ 缺 type 的時候：⛔ 不要自己刻，來找我

**這一節是這份文件存在的主要理由。**

owner 2026-09-04（逐字）：
> 「codex編輯器陷入 跟你之前一樣**無限循環去做光束特效**的困境⋯**如何避免再次陷入這個困境**，
>  不管是哪方，因為**已經發生太多次了**」

### 判準：如果你開始「調參數讓它看起來像」，你已經走錯路了

| 症狀 | 意思 | 做什麼 |
|---|---|---|
| 你在試 `count` × `spacing` 想拼出一道粗光束 | ⛔ 你在**用現有參數逼近**一個機制 | ⭐ 停手，開票說「缺哪一個標籤」 |
| 你連續調同一族特效超過 **2 輪**還沒收斂 | ⛔ 那不是參數問題 | ⭐ 停手 |
| 你想新增一個 `fx.prim.*` 組合 | 那是矩陣的洞 | ⭐ 開票，⛔ 不要自己造 vfx 文件 |
| 你發現同一個形狀你寫了**第二次** | ⛔ 那就是一個缺失的 type | ⭐ 開票要求把它變成 type |

⭐ **第 2 輪就要停**，⛔ 不是第 5 輪。

### 開票要帶的四件

```
[優先][feature] 🧩 缺一個 type：<你要做的形狀，一句話>

## 我試過什麼
· 用 <現有 type / 參數組合> 逼近 ⇒ 差在哪（具體：哪一格表達不出來）

## 原作怎麼做（⭐ 有就附）
· war3map.j:<行號> <trigger 名>

## 我要的形狀
· 它應該長什麼樣（一句話）· 它與哪個現有 type 最接近

## 擋住幾支
· 這個 type 缺席讓我做不出來的技能：<列出來>   ⭐ 這一格決定它的優先序
```

⚠️⚠️ ⭐ **「擋住幾支」是排序依據，⛔ 不是否決權**（2026-09-05 更正，GH#986-G）。

⛔ 這一行在此之前只寫了前半句，而 Main 在 `fea7fa139` 的 commit 訊息裡把它當成
**判準**用，一口氣否決了五個模板家族。⇒ ⭐ 同一句話在契約是「排序」、在 commit
是「判準」——**兩份自己打架**，而是 Main 用錯了。

⭐ **分母講清楚**（⛔ 不是「我覺得有幾支」）：

> **驗收包裡帶同一個 `brickId` 的列數。**
> （`docs/_reports/editor-skill-acceptance-42x46.json` 的 `machineIssues[]`，
>   `MISSING_VISUAL_BRICK` 那一族 —— GH#986-C 之後每一列都帶 `brickId`。）

| 分母 | 結論 |
|---|---|
| **≥ 2** | ⭐ 做。它是一個**家族** |
| **= 1** | ⛔ 不做。那是**專屬積木**（GH#916 的判準） |
| **= 0** | ⛔ 不做，⭐ 但這只決定**今天不做** —— ⛔ 不是永久排除 |

⚠️ ⭐ 而**否決**要另外一個**獨立且可被反駁**的理由，⛔ 不可以只靠這個數字：
機制不存在 · 不建它玩家在編輯器裡表達不出來 · owner 明說。
⇒ 理由寫進 `templateFamiliesAreAdopted.test.ts` 的豁免表，⭐ 而它**只能變短**。

---

## 8. 分工：誰做什麼

| | Main（我） | Codex（你） |
|---|---|---|
| **機制**（effect kind / hook / 條件葉） | ⭐ 我做 | ⛔ 不要自己實作 |
| **type 模板**（`template@1`） | 收納 · 驗 · 登記進契約 | ⭐ **你整理並交付**（照 §1 的形狀） |
| **技能 JSON** | ⛔ 不逐支手改 | ⭐ 你產出 |
| **矩陣素材**（`fx.prim.*`） | ⭐ 我補洞 | 挑現成的 |
| **契約文件** | ⭐ 我從出貨內容**推導**產出 | 讀它，⛔ 不要手改 |

⚠️ ⭐ **契約文件一律是產生器的產物** —— 手改會被下一次 `pnpm skills:sync` 打回來，
而那個「又壞了」看起來像**新的**錯。動任何 `docs/editor-contract/` 之前先跑：

```bash
bash scripts/genguard.sh docs/editor-contract/<檔名>
```

---

## 9. 你交付之後，我會做什麼

1. **驗形狀**：`status` / `params` 非空 / `exemplar` 指得到 / `requires` 對得上 runtime capabilities
2. **驗出處**：`templateDefaultsHaveOrigin` —— 每一格 `default` 引用得到 JASS 行號或 owner 原話
3. **登記進契約**：讓設計者在編輯器裡**挑得到**它
4. ⭐ **回報**：哪幾份收了、哪幾份退回、退回的**具體理由**

⛔ 我不會安靜地丟掉任何一份 —— 退回一定帶理由。

---

## 10. ⚠️ 今天已知的三個坑（⭐ 都是量到的，⛔ 不是推測）

1. ⭐ **`ggd-brick-census.json` 的 `unusedEngineFamilies` 是 `0`，而實際上有 131 個 vfx 家族零引用。**
   ⇒ ⛔ 那份普查對「沒人用的積木」是瞎的 —— **不要拿它當「哪些東西可以用」的依據**。
   （Main 側要修，票在 #916。）
2. ⭐ **契約裡沒有任何一份寫著 `fx.prim.*` 的矩陣。**
   ⇒ 今天你只能從 `content/vfx/` 直接 `ls`。（同上，Main 側要補。）
3. ⭐ **13 份 `draft` 空殼佔著名字。** 你要用那個 family 時，⛔ 不要以為它已經有內容 ——
   打開看 `params` 是不是空的。

---

## 11. 一句話總結

> ⭐ **先看 §5 有沒有現成的 type；有就挑，然後只改你要改的那幾格。**
> ⭐ **沒有就照 §7 開票，⛔ 第 2 輪還沒收斂就停手 —— 不要自己刻。**
> ⭐ **你整理出來的 type 照 §1 的形狀交給我，`exemplar` 一定要填。**
