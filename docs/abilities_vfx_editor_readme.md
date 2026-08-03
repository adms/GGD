# GGD 技能／特效編輯器 — 交接包使用說明

> 這一包是給**獨立開發**（例如丟給 OpenAI Codex）用的。
> 目標：做一個 Web UI 編輯器，產出 **一技能一個 JSON**，直接寫回 `content/abilities/`。
>
> ⚠️ **先讀第 4 節「還沒補進來的東西」。** 原本的五個缺口在 2026-08-03 全部補上了，
> 但**補上不等於完整** —— 第 4 節列出剩下的兩個「資料是空的、而空的長得像沒問題」的洞。
> 不知道的話會做出一個看起來對、但騙人的介面。

---

## 1. 這一包裡有什麼

```
abilities_vfx_editor.zip
├── content/
│   ├── abilities/            696 份   ⭐ 編輯器的輸出目標（執行期贏的就是這一層）
│   ├── champions/            119 份   英雄檔（讀用：名稱、槽位對應、內嵌鏡像）
│   ├── ability-templates/     33 份   那 143 支「空 effects」技能的真正內容
│   └── vfx/                            特效文件
├── schema/                             ⭐ 決定什麼叫合法（TypeScript + Zod）
│   ├── champion.ts           293 行
│   ├── ability.ts            250 行
│   ├── abilityVfx.ts         256 行
│   └── template.ts           236 行
├── runtime-promotion/                  ⚠️ 決定 38.8% 技能實際播什麼特效
│   ├── w3xAbilityArt.ts      669 行 →  34 支（硬綁）
│   └── w3xFamilyArt.ts     2,507 行 → 236 支（族群；表上列 258，其中 22 支被硬綁表蓋掉）
├── docs/
│   ├── _ability-ledger-editor-spec.md    ⭐ 設計規格（先讀第 0 節與第 7 節）
│   ├── _ability-fidelity-ledger.md       現況（md）：696 支的三欄 + 完整描述 + 模板 + vfx 族
│   ├── _ability-fidelity-ledger.json     現況（JSON）⭐ 編輯器直接吃這一份，不要 parse md
│   ├── ability-templates.csv           498 列   JASS 對照（`rawcode` 是 join key）
│   ├── ability_ledger.py                 產生器（`--json` / `--md`，可重跑、位元組一致）
│   └── sync_ability_mirror.py            鏡像同步（standalone → embedded，只寫英雄檔）
└── abilities_vfx_editor_readme.md      這一份
```

⚠️ **「38.8%」是量出來的，不是估的**（2026-08-03，`ability_ledger.py` 的健全性檢查 3
在每次產生時重驗）：`content` **426** / `w3xAbilityArt` **34** / `w3xFamilyArt` **236**
＝ 程式決定 **270 / 696 = 38.8%**。
這一頁與規格裡曾經寫過的「295 支 / 42.4%」是舊筆記帶過來的，**那個數字是錯的** ——
它把族群表上列的 258 列全部算進去，沒有扣掉同時出現在硬綁表、實際由硬綁表勝出的 22 支。

---

## 2. 五分鐘上手

### 2.1 資料長什麼樣

一支技能就是一個檔，檔名 = id：

```
content/abilities/godie-uvng.e.json     ← 飛影 E · 邪王炎殺黑龍波
                  ^^^^^^^^^^ ^
                  英雄 id    槽位（passive / q / w / e / r / ex）
```

```jsonc
{
  "id": "godie-uvng.e",
  "name": "38-03 邪王炎殺黑龍波",
  "description": "[主動攻擊]\n25秒冷卻時間\n\n將一枚…",
  "castType": "skillshot",
  "range": 11,
  "effects": [],                    // ⚠️ 空的！真正內容在下面的 template
  "template": {
    "ref": "tpl-line-sweep",
    "params": { "segmentCount": 6, "stepSize": 200, /* … */ }
  },
  "vfxKey": "vfx.w3x.blackdragon"
}
```

### 2.2 讀資料的三條規則（照做就不會出錯）

1. **以 `content/abilities/*.json` 為準。** 英雄檔裡的 `abilities.Q` 是鏡像，執行期不贏。
2. **`effects` 是 `[]` 不代表沒效果。** 143 支綁了模板，要先展開（見 2.3）。
3. **`slot` 不代表行為。** `godie-xxx.passive` 有 **114/114 都是主動技**（有 castType 或冷卻）。

### 2.3 展開模板

```
doc.template.ref  →  content/ability-templates/<ref>.json
                     把 doc.template.params 填進模板的 slot
                     得到真正的 effects
```

多張卡片的寫法是 `template.cards: [{ref, params}, …]`，要一起處理。
遊戲端的實作在 `packages/shared/src/content/templates/`（未打包，看 schema/template.ts 就夠）。

---

## 3. 寫回

### 3.1 只寫獨立檔

```
編輯器輸出 → content/abilities/<id>.json        ✅ 這一層贏
             content/champions/<hero>.json      ❌ 不要直接寫
```

**為什麼**：如果只寫英雄檔，遊戲**完全不會變**（獨立檔贏）—— 那是一個看不出來的失敗。
只寫獨立檔的話遊戲會正確，只是選角畫面 / codex 會顯示舊描述 —— **看得出來的失敗，好很多**。

鏡像由一支同步工具重建（方向永遠 `standalone → embedded`，不可反向）。
那支工具就是 `docs/tools/sync_ability_mirror.py`：

```bash
python3 docs/tools/sync_ability_mirror.py            # dry-run：列出每一格會怎麼變，有漂移回 1
python3 docs/tools/sync_ability_mirror.py --write    # 真的寫（只寫英雄檔）
```

它**只開英雄檔來寫**，結構上不可能反向。而且是**文字層的定點替換**：只有真的不一樣的
那幾個 key 被換掉，替換文字直接抄獨立檔的原始位元組，所以 `350.0` 不會變成 `350`
（見 3.3）—— 實測改三個欄位只動 13 行，`manaCost` 那幾個 `215.0` 原樣留著。

### 3.2 存檔前一定要驗

```ts
zAbilityDoc.parse(payload)   // schema/ability.ts
```

⚠️ **這個 repo 的 overlay 寫入路徑目前沒有 Zod 驗證**（GH#283，而且註解宣稱有 —— 那句是假的）。
所以**驗證是編輯器自己的責任**。存一份壞的進去，遊戲端載入會整份失敗，
然後 fail-open 退回 2 隻骨架英雄 —— 畫面看起來跟正常一模一樣，只有 console 有一行。

失敗就回 4xx 並**指名是哪個欄位**，不要吞掉。

### 3.3 數字格式

原始檔有 `350.0` 這種 Python 匯出的浮點寫法。
**不要做 `JSON.parse` → `JSON.stringify` 的整份 round-trip**，那會把 `350.0` 變成 `350`，
在一個檔上可以產生 56 行無意義的 diff。只改動到的那幾格。

---

## 4. ⚠️ 還沒補進來的東西

### 4.1 原本的五個缺口 —— 2026-08-03 補完

| # | 缺什麼 | 現在在哪 |
|---|---|---|
| 1 | **模板參數表** | 帳本的「技能模板」節 + JSON 的 `abilityTemplates[]`：33 份的每個 slot 型別／上下界／預設／`inert`／`optional`／**綁定支數** |
| 2 | **`isPassiveOnly` / `castType` / `cooldown`** | JSON 每一列都有；md 的判準寫在 `ability_ledger.py` 的 `is_passive_only()` |
| 3 | **`vfxAuthority`** | JSON 每一列都有 `vfxAuthority` + **`vfxEditable`（產生器算好的布林，介面不要自己判斷）** |
| 4 | **帳本的 JSON 版** | `docs/_ability-fidelity-ledger.json`（`ability_ledger.py --json`） |
| 5 | **鏡像同步工具** | `docs/tools/sync_ability_mirror.py`（預設 dry-run，`--write` 才寫） |

### 4.2 ⚠️ 剩下的兩個洞：**資料是空的，而空的長得像沒問題**

JSON 頂層有一格 `notComputed`，把這兩件事寫在資料裡而不是只寫在文件裡 ——
因為出事的當下沒有人在讀文件。

| 洞 | JSON 長什麼樣 | 為什麼會騙人 |
|---|---|---|
| **描述 ↔ JASS 衝突偵測器不存在** | 696 列的 `flags.descriptionJassConflict` **全部是 `null`** | `null` 讀起來像「已檢查、沒衝突」，實際是「從來沒檢查過」。介面**不可以**把它顯示成 ✅ |
| **走模板那 143 支的 `effectKinds` 是空的** | `effectsSource: "template"` + `effectKindsComplete: false` + `effectKinds: []` | 空陣列讀起來像「這支技能什麼都不做」。真正的展開器是 TS 的 `templates/expand.ts`，Python 產生器跑不到它 |

**介面規則**：只在 `effectKindsComplete === true` 時才顯示 effect kinds；
否則顯示「這一支的效果由模板 `<ref>` 展開，本帳本沒有展開它」+ 模板的 `requires`。

### 4.3 兩條不會過期的提醒

- **不要**用 `slot === "PASSIVE"` 決定任何事（畫冷卻圈、吃按鍵、虛線框、可施放統計）
  —— 讀 `isPassiveOnly`。114 支天生技槽 **114 支都有主動特徵**。
- **不要**在 `vfxEditable === false` 的技能上給可編輯的 vfx 欄位。
  一個存了不會生效的欄位比一個唯讀欄位糟糕得多。

---

## 5. 三個會讓介面說謊的陷阱（規格第 0 節的摘要）

| | 內容 | 規模（實測 2026-08-03） |
|---|---|---|
| **A** | vfx 綁定有 38.8% 是**程式常數**決定的，不是內容 | 270 / 696（硬綁 34 + 族群 236） |
| **B** | 143 支技能的 `effects` 是 `[]`，真正內容在模板裡 | 143 |
| **C** | 每支技能存兩份（獨立檔 + 英雄檔內嵌），獨立檔贏 | 468 個鏡像（Q/W/E/R × 117 隻） |

**完整說明在 `docs/_ability-ledger-editor-spec.md` 第 0 節，動工前務必讀。**

---

## 6. 判定符號怎麼讀（帳本裡的三欄）

| 符號 | w3x 內建 | JASS | 特效 |
|---|---|---|---|
| `✔` | 對得上 | 命中簽章 | 綁到原作 emitter |
| `◐` | — | — | 家族晉升（有東西但不專屬） |
| `⚠` | **匯入器 placeholder，數值不可信** | — | — |
| `△` | — | — | 通用替身 |
| `✘` | — | **沒命中** | 完全沒有 vfxKey |
| `?` | — | 有 JASS 但無可測簽章 | — |
| `—` | 無 w3x 對照 | 不在對照表 / 無觸發 / 純演出 | — |

⚠️ **`✘` 不等於壞掉、`—` 不等於沒做。**
owner 的裁決：*描述與 JASS 打架時要問我，JASS 可能是刻意的隱藏機制*。
介面上這些是**待裁決**，不是錯誤 —— 不要用紅色。

---

## 7. 建議的開發順序

1. **唯讀瀏覽** —— 直接讀 `docs/_ability-fidelity-ledger.json`，**不要 parse md**。
   一份就有 696 支的三欄 + 完整描述 + 模板綁定 + `vfxAuthority` / `vfxEditable`。
2. **篩選**（沒對照 JASS / 用通用替身 / 未人工確認 / 綁某模板 / `vfxEditable === false`）
   —— 所有篩選條件都是 JSON 已經算好的欄位，介面不要自己再推導一次。
3. **標註**（`review.checked` + note）—— 只寫人的欄位。
   ⛔ 產生器每次重跑會重算其餘所有欄位，`review` 必須分開存或只 merge 不 overwrite。
4. **編輯 + 寫回**（含 `zAbilityDoc.parse()`、只寫獨立檔、不做全份 round-trip），
   寫完跑一次 `sync_ability_mirror.py --write` 重建鏡像。
5. **vfx 與模板參數的編輯** —— 模板參數現在有上下界可以擋了（第 4.1 節）；
   vfx 則要等兩張晉升表搬進內容（規格 §6 第 5 步），在那之前 270 支只能唯讀。

**第 1–4 步現在就可以開工。** 唯一還缺的是第 4.2 節那兩格空資料 ——
它們不擋開發，但**介面不可以把空的顯示成「沒問題」**。
