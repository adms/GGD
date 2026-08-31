# ⭐ 給 Codex：今天 main 動了什麼（2026-08-31 第二批）

> ⚠️ 這一份只回答一件事：**你今天要重讀哪幾個檔、為什麼。**
> 「往前怎麼走」在 [`CODEX_COORDINATION_20260831.md`](CODEX_COORDINATION_20260831.md)，
> 「現在差多少」在 [`CODEX_CATCHUP_20260830.md`](CODEX_CATCHUP_20260830.md)。⛔ 不重複。

---

## 0. ⭐ 一行結論

**契約指紋變了 ⇒ 重跑你那邊的契約同步。**

| | 值 |
|---|---|
| `ggd-runtime-capabilities.json` 的 `fingerprint` | ⭐ **`9d43feef`**（上一版 `29235222`） |
| `ggd-editor-coverage.json` 的 `counts._total` | ⭐ **4,819** |
| 其中 owner 專屬（⛔ 編輯器**不要**做） | `counts._ownerOnly` = **39** |

⇒ ⭐ **判準：你那邊存的 fingerprint 不是 `9d43feef` ⇒ 你的欄位表是舊的。**

---

## 1. ⭐ 要重讀的檔（就這四個，⛔ 其餘沒動）

```
docs/editor-contract/ggd-runtime-capabilities.json   ← 名詞層：這個機制存不存在
docs/editor-contract/ggd-runtime-capabilities.md     ← 同上，人讀的
docs/editor-contract/ggd-editor-coverage.json        ← 欄位層：每一格能填什麼
docs/技能標記機制與效果規則.md                        ← 用法層：它怎麼用
```

⚠️ 三份的分工沒變：`capabilities` 答「**存不存在**」、`coverage` 答「**有哪些格**」、
`技能標記機制` 答「**怎麼填**」。⛔ 它們共用同一個 `buildCapabilityManifest()`，
所以名詞那一層**不可能互相矛盾** —— 有矛盾就是 bug，開票給 main。

---

## 2. ⭐ 新長出來的機制（你現在做得出來、昨天做不出來）

| 機制 | 在契約裡長什麼樣 | 你可以做的介面 |
|---|---|---|
| **瞬移到被標記的單位** | `blink.to` 多一個列舉值 **`markedUnit`** ＋ 新欄位 `markStatusId`（`zRef → status-effects`） | 目的地下拉多一項；選了它就要求填一個「標記狀態」（⭐ 用既有的 status-effect 選單） |
| **分離度門檻階梯** | ⛔ 不在編輯器契約裡（那是 voice-gen 的閘）—— 這一列只是告訴你**別去碰**那三個數字 | ⛔ 無 |

### ⭐ `markedUnit` 的語意（⚠️ 這一段照抄進你的欄位說明）

> 瞬移到**被這支技能標記過**的那個單位。
> 「被標記」＝ 該單位身上有 `markStatusId` 這個狀態，**而且施加者是這支技能**。
> ⛔ 找不到被標記的人 ⇒ **什麼都不發生**（⛔ 不會瞬移到隨便一個敵人）。

⭐ **它為什麼重要**：這是第一個「**同一個按鍵兩段行為**」可以**純用 JSON 表達**的例子 ——
30-00 攝影機的做法是兩個 effect ＋ 一個既有的條件葉：

```jsonc
[
  { "kind": "applyStatus", "applyTo": "target", "statusId": "camera-mark", "duration": 30 },
  { "kind": "blink", "to": "markedUnit", "applyTo": "self",
    "markStatusId": "camera-mark",
    "condition": { "not": { "kind": "status", "subject": "target", "statusId": "camera-mark" } } }
]
```

⚠️ ⭐ 那個 `not` 是關鍵，⛔ 而它**不是新機制**：求值器對「**不存在的 target**」
整條葉子回 false（`sim/content/condition.ts` 自己的文件寫的）
⇒ 指定了人 ⇒ 剛標上 ⇒ `not` 為假 ⇒ ⛔ 不瞬移；
   沒指定人 ⇒ 葉子為假 ⇒ `not` 為真 ⇒ ⭐ 瞬移。

⇒ ⭐ **這個花樣可以套用到任何「按一次標記、再按一次發動」的技能**，
⛔ 不必為每一支寫程式。建議在你的模板庫裡開一個 **`mark-then-recall`** 家族。

---

## 3. ⭐ 新增的後台旋鈕（`config.displacement-tiers@1`）

```jsonc
"markedBlink": { "enabled": true, "requireOwnMark": true }
```

| 欄位 | 意思 | 出貨值 |
|---|---|---|
| `enabled` | ⭐ **rollback 開關** —— 關掉之後 `to:"markedUnit"` 一律不發生 | `true` |
| `requireOwnMark` | 只認**自己這支技能**打的標記 | `true` |

⚠️ 它已經在 `ggd-editor-coverage.json` 的 `configField` 裡（三格）。

---

## 4. ⛔ 給你的三個「不要做」

1. ⛔ **`_ownerOnly` 那 39 格不要做欄位。** 它們是 owner 的人工旋鈕（系統倍率那一族），
   契約現在會標出來 —— ⭐ 把它們渲染成**唯讀**或直接不顯示，
   ⛔ 不要當成「還沒做的功能」去實作。
2. ⛔ **`reflectSuccess` 的第一份內容不要我們寫。** 機制側四段接縫全通了
   （schema 列舉 · emit · fanout · player），⭐ 而**第一份內容刻意留給特效工坊產出** ——
   那正是 owner 指名的驗收招 **20-002 理想鄉EX**。
3. ⛔ **卡面文字不要放做不到的宣稱。** 引擎側有一條會紅的閘
   （`noOpModifierClaims.test.ts`）掃「這條 modifier 在出貨設定下有沒有可能改變任何數字」——
   ⭐ 產出的 JSON 若帶著空宣稱，會在 main 這邊被擋下來。

---

## 5. ⭐ 你怎麼確認自己同步好了

```bash
git pull
python3 -c "import json;print(json.load(open('docs/editor-contract/ggd-runtime-capabilities.json'))['fingerprint'])"
# ⇒ 要印出 9d43feef
```

⚠️ ⭐ 指紋**刻意不含時間戳** —— 所以它一變就代表**內容真的變了**，
⛔ 不是「又重跑了一次產生器」。
