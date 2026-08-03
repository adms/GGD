# 技能保真度編輯器 — 設計規格

> **這一份是給「獨立 Web 編輯器」的規格，不是實作。** owner 2026-08-02：
> 「這個我自己做，你只要給我 md 檔（設計參考原則與細節）就好」。
>
> 目標形狀（owner 原話）：
> **資料** = `content/` 底下一份走 Zod 的 JSON ·
> **產生** = `ability_ledger.py` 產 JSON 而不是產 md ·
> **介面** = 後台一頁，可篩選、可展開、可直接改 ·
> **回寫** = 存回 JSON，走既有 overlay，存檔即生效。

---

## 0. 先讀這一節：三個會讓整個介面說謊的陷阱

這三件事如果不先處理，介面會做得出來、看起來也對，但**它顯示的東西不是遊戲裡跑的東西**。
在這個 repo 這叫失敗形態 ⑤（被測的不是出貨的那個），而且已經發生過很多次。

### 陷阱 A ⚠️ 四成的 vfx 綁定不在內容裡，在程式裡

執行期有**兩張晉升表**會在施法那一刻改寫 `vfxKey`：

| 表 | 位置 | 表上列了 | **實際說了算** |
|---|---|---|---|
| 硬綁 | `apps/client/src/render/vfx/w3xAbilityArt.ts` | 34 | **34** |
| 族群 | `apps/client/src/render/vfx/w3xFamilyArt.ts` | 258 | **236**（22 支同時在硬綁表，硬綁表勝） |
| | | | **合計 270 / 696 = 38.8%** |

也就是說：**這 270 支技能，你在 JSON 裡把 `vfxKey` 改成 A，遊戲裡照樣播 B。**

⚠️ **這一頁曾經寫「295 支 / 42.4%」，那是錯的** —— 它把族群表的 258 列直接加上硬綁表的
34 列，沒有扣掉 **22 支重疊**（`vfx_authority()` 先看硬綁表，所以那 22 支的 authority 是
`w3xAbilityArt` 不是 `w3xFamilyArt`）。正確的數字由 `ability_ledger.py` 在**每次產生時**
重新量，並且由健全性檢查 3 擋住「表改了而 JSON 沒重產」（見 §7.4）。
剩下的 **426 支** authority 是 `content`，那才是編輯器真的改得動的部分。

編輯器有兩條路：

1. **（建議）先把兩張表搬進內容**，變成 JSON 的一部分。搬完之後介面才是所見即所得。
   這是最重的前置，但它同時也是 owner 立的第一守則本來就要求的事（「寫死才需要理由」）。
2. **（過渡）介面上明確標記**：每一支技能的 vfx 欄位旁邊標 `內容決定` / `程式決定（w3xAbilityArt）` /
   `程式決定（w3xFamilyArt）`，「程式決定」的那些**唯讀並顯示為什麼**。
   不要讓它看起來可編輯 —— 一個存了沒生效的欄位比一個唯讀欄位糟糕得多。

⚠️ 不論走哪一條，**JSON 裡都要有 `vfxAuthority` 這一格**（`"content" | "w3xAbilityArt" | "w3xFamilyArt"`），
否則下一個人看不出這 270 支為什麼特別。（已實作，見 §7.2。）

### 陷阱 B ⚠️ 143 支技能的原始檔是空的，真正的內容在模板裡

v0.9.24 把 143 支技能轉成 `template: { ref, params }` 綁定，它們的 `effects` 在原始 JSON 裡是 **`[]`**。
真正的效果是 `registerAll` 時經過 `packages/shared/src/content/templates/resolve.ts` →
`expandStack()` 展開出來的。

**任何直接讀 `doc.effects` 的統計或篩選，對這 143 支都會得到「這支技能什麼都沒做」。**

產生器必須走展開後的形狀。現成的工具：
`packages/shared/testkit/expandedEffects.ts` 的 `effectsOf(doc)` —— 它就是為了這件事寫的，
會處理 `template` 缺席、多張卡片（`TEMPLATE_STACK_MAX_CARDS`）與 `onConflict`。

### 陷阱 C ⚠️ 同一支技能存在兩份，改錯那份等於沒改

技能文件是**鏡像儲存**的：

```
content/abilities/godie-xxxx.q.json        ← 獨立檔（STANDALONE）
content/champions/godie-xxxx.json          ← 英雄檔裡 abilities.Q 又內嵌一份
```

`registries.ts` 的註冊順序讓**獨立檔在執行期獲勝**。所以：

- **讀**：以獨立檔為準
- **寫**：一律寫獨立檔，然後**同步到內嵌那一份**（方向永遠是 standalone → embedded，不可反向）
- 這個 repo 沒有現成的同步工具，2026-07 曾經因此漂移了 **106 個欄位**

編輯器如果只寫其中一邊，遊戲會照舊（因為獨立檔贏），但 codex / 後台 / 匯出會顯示另一個值 ——
一個會慢慢腐爛而且很難查的分岔。

---

## 1. 資料形狀

### 1.1 檔案位置與 schema tag

```
content/ability-ledger.json          schema: "ability-ledger@1"
```

⛔ **一定要跟其他 config 走同一條管線**：
- Zod 定義放 `packages/shared/src/content/schema/`
- 進 `config.ts` 的 discriminated union
- **來源檔一定要 `git add`**

> 2026-08-02 因為「產物 commit 了、來源沒 commit」把線上打掛過一次：
> `pnpm content:build` 從**工作區**讀來源，看得到未追蹤的檔，會把它們烘進 `bundle.json`，
> 而部署走 `git pull`。守衛已經補上（`shippedBundleHasTrackedSources.test.ts`，比對 `git ls-files`），
> 新增這份 JSON 時它會抓你。

### 1.2 頂層

```ts
{
  id: "ability-ledger",
  schema: "ability-ledger@1",
  generatedAt: string,          // ISO8601，由產生器寫
  generatorFingerprint: string, // 產生器版本 + 輸入雜湊，用來判斷「這份是不是舊的」
  abilities: AbilityLedgerRow[],       // 696
  abilityTemplates: TemplateEntry[],   // 33
  vfxFamilies: VfxFamilyEntry[],
}
```

`generatorFingerprint` 是刻意的：**md 的時代沒有人知道一份帳本是什麼時候產的、對應哪一版內容**。
介面應該在頂部顯示「這份帳本落後內容 N 個文件」而不是安靜地顯示舊資料。

### 1.3 逐支技能

```ts
interface AbilityLedgerRow {
  // ── 身分 ──────────────────────────────────────────────
  id: string;              // "godie-uvng.e"
  championId: string;      // "godie-uvng"
  slot: "PASSIVE" | "Q" | "W" | "E" | "R" | "EX";
  name: string;            // "38-03 邪王炎殺黑龍波"
  /**
   * ⚠️ 編號是 JASS 的 join key，**不可浮動**。
   * 名稱可以改（owner 核准 GGD 有自己的技能名，改名不是缺陷），
   * 但 `92-02` 永遠是消化液。編輯器**不可以**讓人改編號。
   */
  w3xNumber: string;       // "38-03"

  // ── owner 要的那一欄：完整描述，不截斷 ──────────────────
  description: string;     // 原文，含換行與 [主動攻擊] 這類標籤

  // ── 三欄現況 ─────────────────────────────────────────
  builtinFidelity: Verdict;   // 是否照 w3x 內建實作
  jassFidelity: Verdict;      // 是否照 JASS 實作
  vfxFidelity: Verdict;       // 特效是否完美綁定

  // ── 模板 ────────────────────────────────────────────
  templateRefs: string[];     // 綁了哪幾張模板卡（可多張）
  templateParams: Record<string, unknown>;
  effectKinds: string[];      // ⚠️ 展開後的，見陷阱 B

  // ── VFX ────────────────────────────────────────────
  vfxKey: string | null;
  vfxLayers: unknown[] | null;   // 見 schema/abilityVfx.ts；上限 6 層
  vfxAuthority: "content" | "w3xAbilityArt" | "w3xFamilyArt";  // ⚠️ 見陷阱 A

  // ── 給篩選用的推導欄位（產生器算，介面不要自己再算一次）──
  descriptionJassConflict: ConflictNote[] | null;
  usesGenericPlaceholder: boolean;

  // ── 人的標註（唯一可以自由編輯、且不會被重新產生覆蓋的區塊）──
  review: {
    checked: boolean;
    checkedBy?: string;
    checkedAt?: string;
    note?: string;
  };
}

type Verdict = "OK" | "PARTIAL" | "MISSING" | "UNKNOWN";
```

**`review` 這一塊必須跟其餘欄位分開儲存或分開合併** —— 產生器每次重跑都會重算前面所有欄位，
如果人的標註混在同一個物件裡，重跑一次就全部沒了。建議：產生器輸出「事實」，
`review` 存在另一份檔（或同檔但產生器只做 merge 不做 overwrite），並在規格裡寫死這個規則。

### 1.4 描述 ↔ JASS 打架

```ts
interface ConflictNote {
  field: string;      // "damage" / "cooldown" / "radius" …
  described: string;  // 描述裡寫的（原文片段）
  actual: string;     // JASS / 展開後 effects 的實際值
}
```

⚠️ **打架不等於缺陷。** owner 的裁決是：
> 描述與 JASS 打架時要問我，JASS 可能是刻意的隱藏機制。

所以介面上這一格是**「待裁決」而不是「錯誤」**，顏色不要用紅色。
需要的動作是「標記已裁決 + 記下裁決結果」，不是「修正」。

### 1.5 模板

```ts
interface TemplateEntry {
  ref: string;               // "tpl-line-sweep"
  name: string;
  summary: string;           // 它做什麼，一兩句
  params: TemplateParam[];
  boundAbilityIds: string[]; // 目前哪幾支綁著它 ← 反查，介面最有用的一欄
}

interface TemplateParam {
  key: string;
  type: "number" | "enum" | "scaling" | "statModifiers" | "condition";
  min?: number; max?: number;   // ⚠️ 上下界都要，不是只有下界
  unit?: "wc3u" | "wc3h" | "s" | "count" | "ratio";
  default?: unknown;
  values?: string[];            // enum
  optional?: true;              // 可省略；⚠️ 空白 ≠ false
  inert?: string;               // ⛔ 本版不生效，字串就是原因（欄位要 grey out）
  boundsDeclared: boolean;      // 模板有沒有宣告界；false = 「模板未宣告」不是「無限制」
  note: string;                 // 「它影響什麼」
}
```

⚠️ **`type` 這五個值是 `zParamSlot`（`schema/template.ts`）真的宣告的那五個**，
不是這份規格早期版本寫的 `"string" | "perRank" | "bool"`（那三個從來不存在）。
`perRank` 的形狀由 `scaling` 承載（`{ perRank: number[], ratios: [] }`）。

⚠️ **`note` 目前是產生器從宣告過的事實組出來的**（單位、列舉值、可省略、`inert`），
因為模板文件**沒有** per-param 的人話說明欄位。要給 owner 讀的一句話說明是一個
**內容缺口**（要補在 `content/ability-templates/*.json` 裡，順帶擴 `zParamSlot`），
不是產生器該猜的東西。實測 33 份模板 100 個 slot，數值 slot **54 個全部宣告了 min+max**。

### 1.6 VFX 族

```ts
interface VfxFamilyEntry {
  family: string;                // "shockwaveRing"（w3xArtFamilies.ts 的 id）
  label: string;                 // "衝擊波環"
  primitive: string;             // primitives.ts 的形狀
  summary: string;               // 原型的 `note`：它長什麼樣
  censusRefCount: number;        // L1 普查在全圖數到的引用點
  overridableFields: string[];   // = artParams.ts `ArtParams` 的可選旋鈕
  boundAbilityIds: string[];     // 族群表上列了哪幾支
  boundCount: number;
  effectiveAbilityIds: string[]; // ⚠️ 扣掉被硬綁表蓋掉的之後，真正由這一族決定的
  effectiveCount: number;
  shadowedByAbilityArtCount: number;
  authority: "content" | "code"; // ⚠️ 陷阱 A：族群表的一律是 code
}
```

⚠️ **`boundCount` 與 `effectiveCount` 是兩件事，介面不要混用。**
全部加起來：`boundCount` 總和 258（表上列的）、`effectiveCount` 總和 236（真正說了算的）。
21 個原型裡有 **2 個零採用**（`blood` / `starfall`）—— 做了但沒有任何技能綁上去。

---

## 2. 產生器 —— **已實作**（2026-08-03）

```bash
python3 docs/tools/ability_ledger.py --json    # → docs/_ability-fidelity-ledger.json
python3 docs/tools/ability_ledger.py           # → md（stdout，預設）
python3 docs/tools/ability_ledger.py --json --md > docs/_ability-fidelity-ledger.md
```

**保住的性質：**
- ✅ **可重跑、位元組一致** —— 所有 dict `sort_keys=True`，浮點走 Python repr（最短往返）。
  把 `GGD_LEDGER_NOW` 設成一個 ISO8601 字串可以釘住時間戳，**讓「跑兩次 `cmp` 相同」
  可以直接驗**（實測通過）。不能驗的守衛不是守衛。
- ✅ **md 與 JSON 走同一份 `build_ledger()` 的結果**，不各自重算。md 的 render 只讀
  ledger 的欄位（`r['builtin']['verdict']` 之類），不碰原始的 bundle。

**已走 / 沒走的路徑（誠實版）：**

| 路徑 | 狀態 |
|---|---|
| 標 `vfxAuthority`：解析那兩張 TS 常數表 | ✅ 走了，而且**兩種不同的解析各數一次**再互比（§7.4 檢查 3） |
| 讀獨立檔為準（陷阱 C） | ✅ 讀 `content/bundle.json`（打包器讀的就是獨立檔）；檔數與 `content/abilities/` 逐 id 比對 |
| 展開模板 `effectsOf()`（陷阱 B） | ❌ **沒走** —— 那是 TS，Python 產生器跑不到。走模板的 143 支帶 `effectKindsComplete: false`，**空陣列不代表沒效果** |

> ⛔ 要真正走完陷阱 B，需要一支 TS 側車（`tsx` 跑 `expandStack()` 吐 `{id: kinds[]}`），
> 由產生器讀進來合併。**在那之前介面必須讀 `effectKindsComplete`，不可以直接顯示
> `effectKinds`** —— 143 支會顯示成「這支技能什麼都不做」。

---

## 3. 介面

### 3.1 篩選（這是這一頁存在的理由）

| 篩選 | 條件 |
|---|---|
| 沒對照 JASS | `jassFidelity !== "OK"` |
| 用通用替身 | `usesGenericPlaceholder === true` |
| 描述與 JASS 打架 | `descriptionJassConflict !== null` |
| 未經人工確認 | `review.checked === false` |
| 綁某一張模板 | `templateRefs.includes(ref)` |
| vfx 由程式決定 | `vfxAuthority !== "content"` ← **改不動的那 270 支** |

### 3.2 逐支展開

- **完整描述**（owner 明說不要截斷、不要藏）
- 展開後的 effects（附一行「這是模板 X 展開的，不是原始檔的內容」）
- 模板綁定：可改 `ref` 與 `params`
- vfx 綁定：可改 —— **除非 `vfxAuthority !== "content"`，那時唯讀 + 說明為什麼**
- 標記已對照 + 留 note

### 3.3 兩個 UI 規則

1. **絕不顯示一個存了不會生效的欄位。** 寧可唯讀並解釋，也不要給假的方向盤。
2. **每一個數字旁邊標它的來源**（原始檔 / 模板展開 / 程式常數）。
   這個 repo 的歷史問題幾乎都是「不知道這個數字是誰說了算」。

---

## 4. 回寫

走既有的 overlay 機制（`data/` 底下的持久化覆蓋層），存檔即生效。

⚠️ **一個已知的洞要一起補**（GH#283）：
> overlay 寫入路徑**全程沒有 Zod 驗證**，而註解宣稱有 —— 那句註解是假的。

也就是說**今天任何人透過後台存一份壞掉的 overlay，不會被擋**，
而下游載入失敗會 fail-open 退回骨架（2 隻英雄），看起來跟「網站正常」一模一樣。

編輯器的儲存端點**必須**在寫入前跑一次 `zAbilityLedgerDoc.parse()`，失敗就回 4xx 並指名欄位。
這是新頁面的責任，不是「以後再說」—— 這個 repo 今天已經因為內容載入失敗掛過兩次。

---

## 5. 守衛（第二守則：改壞就會紅）

| 守衛 | 斷言 | 突變驗證 | 狀態 |
|---|---|---|---|
| 產生器決定性 | `GGD_LEDGER_NOW` 釘住時間後跑兩次，`cmp` 相同 | 拿掉一個 `sort_keys` → 紅 | ✅ 實測 byte-identical |
| 技能數對得上 | `counts.abilities` == `content/abilities/` 檔數，且 id 集合相同 | 拿掉一個技能檔 → **EXIT 2** | ✅ 實測 |
| 模板 ref 存在 | 每個 `template.refs[]` 在 `abilityTemplates` 找得到 | 把一支的 ref 改成不存在的 → **EXIT 2** | ✅ 實測 |
| 晉升表雙解析 | regex 掃出的列數 == 括號深度掃描的列數 | 把一列的 key 改成 regex 抓不到的寫法 → **EXIT 2** | ✅ 實測 |
| 晉升表 ↔ 內容 | 表上每個 id 都是真的技能；`vfxAuthority != content` 的數 == 聯集大小 | 表指到 `godie-zzzz.passive` → **EXIT 2** | ✅ 實測 |
| 鏡像同步 | 每一支的獨立檔與內嵌檔逐欄位相同 | 只改獨立檔不同步 → `sync_ability_mirror.py` dry-run **EXIT 1** 並指名那一格 | ✅ 實測（CHANGE / ADD / DROP 三條路徑都驗過） |
| 展開路徑 | 那 143 支的 `effectKinds` 非空 | 把 `effectsOf` 換成 `doc.effects` → 紅 | ⛔ **未實作**（見 §2），現況是 `effectKindsComplete: false` |
| 來源進版控 | `_index.json` 的每一筆 path 在 `git ls-files` 裡 | 已存在：`shippedBundleHasTrackedSources.test.ts` | ✅ 既有 |
| overlay 驗證 | 壞掉的 payload 被 4xx 擋下 | 拿掉 `.parse()` → 紅 | ⛔ GH#283，還沒補 |

⚠️ **「產生器自己會回非零」不等於「CI 會抓到」。** 目前沒有任何 CI 步驟在跑
`ability_ledger.py`，所以晉升表改了而 JSON 沒重產這件事**要靠人重跑**。
真正把它變成守衛需要一條測試去 spawn 這支腳本並斷言離開碼
（同 `buildIndexesValidates.test.ts` 的做法）—— 那要動 `packages/shared/`，不在這一輪的範圍。

⚠️ **每一條都要真的做突變驗證**（把關鍵那行改壞 → 確認紅 → 改回來），並把紀錄寫進 commit。
一條把實作關鍵行刪掉還是綠的測試，在這個 repo 不算守衛 ——
有前例：`...voicePlayOptions(mix)` 刪掉、功能整個撤銷、3,563 條測試全綠。

---

## 6. 分階段的建議順序

1. **產生器改產 JSON**（含陷阱 B 的展開、陷阱 C 的鏡像對齊）—— 這一步不動任何 UI，可獨立驗證
2. **唯讀介面**（篩選 + 展開 + 完整描述）—— 立刻有用，零風險
3. **標註**（`review` 那一塊）—— 只寫人的欄位，不碰事實欄位
4. **編輯 + 回寫**（含 overlay 的 Zod 驗證）
5. **把兩張晉升表搬進內容**（陷阱 A）—— 最重，但這之後介面才真的所見即所得

第 5 步之前，介面對 38.8% 的技能只能是唯讀的。**這件事要寫在頁面上讓使用者看得到**，
而不是讓人存了之後困惑為什麼遊戲沒變。

---

# 7. 結論 — 要輸出的完整 JSON

> **這一節是規格的重點。** 上面幾節解釋為什麼；這一節是你可以直接照著實作的東西。
> 所有列舉值都是從現行產生器 `docs/tools/ability_ledger.py` 與出貨內容**實際抓出來的**，
> 不是我編的（第三守則：宣稱要可查證）。

## 7.1 完整範例（一支真的技能，欄位全滿）

> ⚠️ **下面這一段是 `docs/_ability-fidelity-ledger.json` 的真實輸出**（2026-08-03 產的，
> 只把 `abilities` / `abilityTemplates` / `vfxFamilies` 各留一筆、族的 id 陣列截斷）。
> 這一節先前版本的範例是**手寫的**，裡面的英雄名、描述、rawcode 與 vfx 判定
> 有四處跟出貨資料不符 —— 第三守則：規格裡的範例也會說謊，所以改成從產物抄。

```json
{
  "abilities": [
    {
      "builtin": {
        "reason": "rawcode A09I",
        "verdict": "✔"
      },
      "castType": "skillshot",
      "championId": "godie-uvng",
      "championName": "邪眼師 - 飛影",
      "cooldown": [
        60,
        60,
        60,
        60
      ],
      "description": "[主動攻擊]\n60秒冷卻時間\n\n將飛影手上封印的魔界生物炎殺黑龍釋放，凝聚到極限使出邪王奧義黑龍波，造成650傷害將敵方燒得只剩影子。",
      "effectKinds": [],
      "effectKindsComplete": false,
      "effectsSource": "template",
      "flags": {
        "descriptionJassConflict": null,
        "usesGenericPlaceholder": false,
        "usesImporterPlaceholderDamage": false
      },
      "id": "godie-uvng.e",
      "isPassiveOnly": false,
      "jass": {
        "reason": "行進波動",
        "verdict": "✘"
      },
      "maxRank": 4,
      "name": "38-03 邪王炎殺黑龍波",
      "range": 11,
      "review": {
        "checked": false
      },
      "slot": "E",
      "slotLabel": "E",
      "star": true,
      "template": {
        "cards": [
          {
            "params": {
              "castTimeSec": 0.6,
              "damage": {
                "perRank": [
                  650,
                  900,
                  1150,
                  1400
                ]
              },
              "damageType": "magic",
              "segmentAoe": 400,
              "segmentCount": 6,
              "stepSize": 200
            },
            "ref": "tpl-line-sweep"
          }
        ],
        "params": {
          "castTimeSec": 0.6,
          "damage": {
            "perRank": [
              650,
              900,
              1150,
              1400
            ]
          },
          "damageType": "magic",
          "segmentAoe": 400,
          "segmentCount": 6,
          "stepSize": 200
        },
        "refs": [
          "tpl-line-sweep"
        ]
      },
      "vfx": {
        "reason": "硬表晉升→原作 emitter",
        "verdict": "✔"
      },
      "vfxAuthority": "w3xAbilityArt",
      "vfxEditable": false,
      "vfxKey": "godie-tectonicfury-p0",
      "vfxLayers": null,
      "w3xNumber": "38-03"
    }
  ],
  "abilityTemplates": [
    {
      "boundAbilityIds": [
        "godie-e002.e",
        "godie-hgam.r",
        "godie-n003.r",
        "godie-n00b.q",
        "godie-uvng.e"
      ],
      "boundCount": 5,
      "exemplar": {
        "jass": "A0D5",
        "skill": "20-03 約束與勝利之劍"
      },
      "family": "line-sweep",
      "gapScore": 7,
      "name": "直線分段掃擊",
      "params": [
        {
          "boundsDeclared": true,
          "default": 0,
          "key": "castTimeSec",
          "max": 5,
          "min": 0,
          "note": "單位＝秒；可省略（省略＝沿用預設或整段丟掉，**空白 ≠ false**）",
          "optional": true,
          "type": "number",
          "unit": "s"
        },
        {
          "boundsDeclared": false,
          "default": {
            "perRank": [
              150
            ],
            "ratios": []
          },
          "key": "damage",
          "note": "模板未宣告說明",
          "type": "scaling"
        },
        {
          "boundsDeclared": false,
          "default": "magic",
          "key": "damageType",
          "note": "可選：`magic` / `physical` / `true`",
          "type": "enum",
          "values": [
            "magic",
            "physical",
            "true"
          ]
        },
        {
          "boundsDeclared": true,
          "default": 400,
          "inert": "分段時序未支援：6 段掃擊折算為單發穿透投射，命中集合等價但逐段推進不表現",
          "key": "segmentAoe",
          "max": 900,
          "min": 100,
          "note": "⛔ **本版不生效**：分段時序未支援：6 段掃擊折算為單發穿透投射，命中集合等價但逐段推進不表現；單位＝WC3 平面長度（展開時換算成 GGD 單位）",
          "type": "number",
          "unit": "wc3u"
        },
        {
          "boundsDeclared": true,
          "default": 6,
          "inert": "分段時序未支援：6 段掃擊折算為單發穿透投射，命中集合等價但逐段推進不表現",
          "key": "segmentCount",
          "max": 20,
          "min": 3,
          "note": "⛔ **本版不生效**：分段時序未支援：6 段掃擊折算為單發穿透投射，命中集合等價但逐段推進不表現；單位＝次數／個數",
          "type": "number",
          "unit": "count"
        },
        {
          "boundsDeclared": true,
          "default": 200,
          "inert": "分段時序未支援：6 段掃擊折算為單發穿透投射，命中集合等價但逐段推進不表現",
          "key": "stepSize",
          "max": 300,
          "min": 100,
          "note": "⛔ **本版不生效**：分段時序未支援：6 段掃擊折算為單發穿透投射，命中集合等價但逐段推進不表現；單位＝WC3 平面長度（展開時換算成 GGD 單位）",
          "type": "number",
          "unit": "wc3u"
        }
      ],
      "ref": "tpl-line-sweep",
      "requires": [
        "projectile"
      ],
      "status": "enabled",
      "summary": "沿直線分段的掃擊，P1 以單一 wave 投射體近似（同 godie-e002.e）。"
    }
  ],
  "contentVersion": "cv_8cbee315c3f3",
  "counts": {
    "abilities": 696,
    "abilityTemplates": 33,
    "vfxAuthorityContent": 426,
    "vfxAuthorityW3xAbilityArt": 34,
    "vfxAuthorityW3xFamilyArt": 236,
    "vfxFamilies": 21
  },
  "generatedAt": "2026-08-03T00:00:00Z",
  "generatorFingerprint": "ledger@4+cv_8cbee315c3f3+in_a721a361109c",
  "id": "ability-ledger",
  "notComputed": {
    "effectKinds(effectsSource=template)": "模板展開器是 TS 的 templates/expand.ts，這支 Python 產生器跑不到；走模板的列 effectKindsComplete=false，effectKinds 只含 inline 的部分。",
    "flags.descriptionJassConflict": "規格 §1.4 的描述↔JASS 衝突偵測器還不存在，所有列一律 null（不等於沒有衝突）。"
  },
  "schema": "ability-ledger@1",
  "vfxFamilies": [
    {
      "authority": "code",
      "boundAbilityIds": [
        "godie-e001.passive",
        "godie-e008.e",
        "godie-e00j.e",
        "…（共 91 支）"
      ],
      "boundCount": 91,
      "censusRefCount": 273,
      "effectiveAbilityIds": [
        "…（共 84 支）"
      ],
      "effectiveCount": 84,
      "family": "shockwaveRing",
      "label": "衝擊波環",
      "overridableFields": [
        "alpha",
        "count",
        "facingDeg",
        "heightY",
        "scale",
        "timeScale",
        "tint"
      ],
      "primitive": "shockwave",
      "shadowedByAbilityArtCount": 7,
      "summary": "地面向外擴的環。放大＋轉聖光色 = Saber 約束勝利之劍；縮小＋土色 = 一般踏地。"
    }
  ]
}
```

## 7.2 列舉表 — 每一格的合法值與意思

### `slot`

| 值 | 意思 |
|---|---|
| `PASSIVE` | **天生技槽** —— ⚠️ 見下方，這個名字**不代表它是被動的** |
| `Q` `W` `E` `R` | 四個主動槽 |
| `EX` | EX 技槽（熱鍵 F） |

⚠️ 能力列的顯示順序是 **天生技 / Q / W / E / R / EX**（#192 owner 指定），不是字母序。

### ⛔ `slot === "PASSIVE"` **不等於**「這是被動技」

owner 2026-08-03：「天生技 也有可能是主動技喔」。實測出貨內容：

```
天生技槽總數                                   114
其中有主動特徵（castType 非 passive，或有冷卻）  114   ← 100%
```

**一支純被動都沒有。** 例子：

| id | castType | 冷卻 | 名稱 |
|---|---|---|---|
| `godie-hgam.passive` | `targeted` | 45 s | 90-00 寄生種子 |
| `godie-u00n.passive` | `self` | 60 s | 76-00 二檔 |
| `godie-ewrd.passive` | `self` | 70 s | 17-00 右腕焰增 |

所以 `slot` 只是**位置**，不是行為。任何用 `slot === "PASSIVE"` 去決定
「要不要畫冷卻圈 / 要不要吃按鍵 / 要不要畫虛線框（#166）/ 要不要算進可施放統計」
的程式，對這 114 支**全部都會判錯**。

**判斷被動的正解**（出貨路徑用的那一個，`apps/client/src/vfx/telegraphShape.ts`）：

```ts
def.passive !== undefined && def.effects.length === 0
```

⚠️ **而這一條與陷阱 B 直接相撞**：那 143 支上模板的技能，原始檔的 `effects` 是 `[]`。
如果編輯器讀**原始檔**去跑這個判斷，一支「天生技槽 + 綁模板」的主動技會被判成純被動 ——
而遊戲裡它是主動的（`registerAll` 展開過了）。

所以 JSON 要多帶一格，由產生器算好、走展開後的形狀：

```ts
isPassiveOnly: boolean;   // def.passive !== undefined && expandedEffects.length === 0
castType: string | null;  // "self" | "targeted" | "ground" | "skillshot" | "dash" | …
cooldown: number[] | null;
```

**介面一律讀 `isPassiveOnly`，不要自己看 `slot`。**

### `builtin.verdict` — 是否照 w3x 內建實作

| 值 | 意思 | reason 範例 |
|---|---|---|
| `✔` | 對得上內建 | `rawcode A0KG` |
| `⚠` | 對得上，但值是匯入器的 placeholder（**不可信**） | `匯入器 placeholder 數值` |
| `—` | 這一支沒有 w3x 對照（GGD 原創或改寫） | `無 w3x 對照` |

### `jass.verdict` — 是否照 JASS 實作

| 值 | 意思 | reason 範例 |
|---|---|---|
| `✔` | 展開後的 effect kinds 命中 JASS 的簽章 | `damage+slow` |
| `✘` | **沒命中** —— JASS 說有的東西，實作裡找不到 | `damage+slow` |
| `?` | 有 JASS 但沒有可測的簽章，判不出來 | `summon（無可測簽章）` |
| `—` | 不在對照表 / 無 JASS 觸發 / 純演出 | `無 JASS 觸發` |

⚠️ **`✘` 不等於「壞掉」，`—` 也不等於「沒做」。**
owner 的裁決：*描述與 JASS 打架時要問我，JASS 可能是刻意的隱藏機制*。
介面上這些是**待裁決**，不是錯誤 —— 不要用紅色。

### `vfx.verdict` — 特效綁定

| 值 | 意思 | reason |
|---|---|---|
| `✔` | 綁到原作 emitter（硬表晉升 / 自訂層 / 直接綁） | `硬表晉升→原作 emitter` · `N 層自訂` · `原作 emitter` |
| `◐` | 家族晉升到原型 —— 有東西，但不是這一支專屬的 | `家族晉升→原型` |
| `△` | 程序原語，通用替身 | `程序原語（通用）` |
| `✘` | **完全沒有 vfxKey** | `無 vfxKey` |

### `vfxAuthority` ⚠️ 決定 `vfxEditable`

| 值 | 誰說了算 | 可編輯 | 覆蓋（實測 2026-08-03） |
|---|---|---|---|
| `content` | JSON / 內容檔 | ✅ | **426 支** |
| `w3xAbilityArt` | `apps/client/src/render/vfx/w3xAbilityArt.ts` 硬綁表 | ❌ | **34 支** |
| `w3xFamilyArt` | `apps/client/src/render/vfx/w3xFamilyArt.ts` 族群表 | ❌ | **236 支** |

⚠️ 族群表**檔案裡列了 258 列**，但其中 **22 列的技能同時出現在硬綁表裡**，
而 `vfx_authority()` 先看硬綁表 —— 所以族群表真正說了算的是 236 支。
舊版本的這一頁寫「401 / 258 / 295 支 / 42.4%」，那是把 258 直接當成 authority 數，
**錯的**。正確答案是 `426 / 34 / 236`，程式決定 **270 / 696 = 38.8%**。
JSON 的 `counts` 三格 (`vfxAuthorityContent` / `…W3xAbilityArt` / `…W3xFamilyArt`) 就是這三個數；
`vfxFamilies[].boundCount`（表上列的）與 `vfxFamilies[].effectiveCount`（真正說了算的）
是**兩個不同的欄位**，介面不要混用。

**`vfxEditable` 是產生器算好的布林，不要讓介面自己判斷** ——
規則只有一條（`vfxAuthority === "content"`），但把它算在資料端，介面就不可能算錯。

### `effectsSource` ⚠️ 陷阱 B 的顯性化

| 值 | 意思 |
|---|---|
| `inline` | `effects` 直接寫在文件裡 |
| `template` | 文件的 `effects` 是 `[]`，內容由模板展開（**143 支**） |
| `both` | 兩者都有（模板 + 額外 inline） |

介面在展開一支 `template` 的技能時，要標一行
「這些效果是模板 `tpl-xxx` 展開的，不是原始檔的內容」，否則使用者會去原始檔找不到而困惑。

### `template.params[].type`

| 值 | 形狀 | 備註 |
|---|---|---|
| `number` | 單一數字 | **`min` 與 `max` 都要有**。這個 repo 曾經只檢查 `min`，50 打成 500 會過表單、在下游才被拒或靜默夾掉 |
| `perRank` | `{ perRank: [n, n, n, n] }` | 四級，索引 0 是 1 級 |
| `enum` | 字串 | 必須附 `values` |
| `bool` | 布林 | **ABSENT ≠ false**。空白代表「沿用預設」 |
| `string` | 字串 | 例如 `vfxKey` |

### `review`

| 欄位 | 型別 | 誰寫 |
|---|---|---|
| `checked` | bool | **人** |
| `checkedBy` / `checkedAt` / `note` | string | **人** |

⛔ **產生器只能 merge，不能 overwrite 這一塊。**
其餘所有欄位每次重跑都會重算；`review` 如果混在同一個覆寫路徑裡，重跑一次就全部歸零。
建議實作：產生器讀舊檔、以 `id` 為鍵把 `review` 原封搬過來，其餘欄位重算。

## 7.3 產生器的輸出契約

| 性質 | 為什麼 |
|---|---|
| **位元組一致** | 同輸入同輸出。所有 dict 依 key 排序，浮點固定格式，不寫時間戳以外的變動值 |
| `generatedAt` / `generatorFingerprint` **是唯一允許變動的兩格** | 其餘任何 diff 都代表內容真的變了 —— 這是它能進版控、能 review 的前提 |
| **md 由 JSON 渲染** | `ability_ledger.py --render-md` 讀 JSON 出 md，不再從內容重算一次。兩條路徑會分岔 |

## 7.4 三個一定要有的健全性檢查（產生器自己跑，失敗就非零離開）—— **已實作**

`sanity()` 在 **md 與 JSON 兩條路徑都會跑**，失敗回 `EXIT 2` 且**什麼都不寫**。

| # | 檢查 | 實作 | 突變驗證（實測） |
|---|---|---|---|
| 1 | `counts.abilities === abilities.length` 且等於 `content/abilities/` 的實際檔數，**而且 id 集合逐一相同** | 讀目錄，比 set | 抽掉 `godie-uvng.e.json` → `EXIT 2`，訊息同時報數量與差集 |
| 2 | 每一個 `template.refs[]` 都能在 `abilityTemplates[]` 找到 | 比 set | 把一支的 ref 改成 `tpl-does-not-exist` → `EXIT 2`，訊息指名是哪一支 |
| 3 | `vfxAuthority !== "content"` 的數量 == 兩張晉升表的實際筆數 | 見下方 ⚠️ | 兩種突變都紅（見下） |

⚠️ **第 3 條照字面寫會是同義反覆**：`vfxAuthority` 本來就是從那兩張表算出來的，
同一次執行裡兩邊必然相等 —— 那是一個「驗名詞」的檢查，在真正的故障面前必然是綠的
（就是 `host-deploy.sh` 四項後置條件全綠而網站不能玩的那一課）。所以實作把它拆成兩個
**關係**：

- **兩種不同的解析各數一次再互比** —— 一條 regex（`"godie-xx.y":`）與一次**括號深度掃描**
  （數 depth-1 的成員）。突變：把一列的 key 寫成 `"godie-e001.passive"`（TS 合法、
  regex 抓不到）→ `深度掃描數到 258 列，regex 數到 257 列` → `EXIT 2`。
- **表 ↔ 內容的關係** —— 晉升表上的每個 id 都必須是真的技能。突變：把一列改成
  `godie-zzzz.passive` → `晉升表指到不存在的技能` → `EXIT 2`。

**⚠️ 這三條是 fail-loud（非零離開碼），不是 warning。**
這個 repo 有兩處刻意的 fail-open，兩處都造成過「壞掉跟正常長得一模一樣」——
選擇容錯的同時，必須有東西會回非零。

⚠️ **但沒有任何 CI 在跑這支腳本**（見 §5 末尾）。它會回非零，可是要有人去跑它。
