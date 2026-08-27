# lane REVIEW —— 非結構化資產驗收流水線（#664 / #797 / #756 / #473）

> 2026-08-27 · HEAD 逐條複驗 ＋ 落地。⭐ 全程在柵欄內：`tools/review/**` · `docs/_review/**` ·
> `packages/shared/src/ops/laneREVIEW*.test.ts`。

---

## ⛔⛔ 最重要的一件事：**#797 的 AC1 是錯的，⛔ 執行它會把一個對的錨改成錯的**

#797 主張 `invprim_visual-proof_20260826-1700` 登記的 `e44bf446` 是「一支跟這批特效
毫無關係的 ops commit」，要求改成 `470cb1fd`。⭐ **逐檔讀 diff 之後，事實正好相反：**

| commit | 訊息 | 它**真的**動了什麼 |
|---|---|---|
| `e44bf446` | `fix(ops): 帳本寫入點自解鎖…` | ⭐ `content/assets/models/imported/revivehuman.glb` · `awaken.glb` · `tools/w3x-import/w3xlib/gltf.py` · `convert_stock_model.py` · `fxLongAxisVisibleGeometry.test.ts` —— **正是這一批標題講的那三件事**（ReviveHuman 換回真身／TeamGlow 不被軟刪除／幾何基準只算可見） |
| `470cb1fd` | `fix(vfx)(#767): TeamGlow **轉檔缺口修復**…` | ⛔ 只有 `docs/_reports/INVPRIM_temp_*.md` · `docs/_review/feature-verdicts.json` · `packages/shared/src/ops/rollbackSwitchReaches.test.ts` ＋ 證據 png —— **零行轉檔程式** |

根因逐字寫在 `docs/_reports/INVPRIM_temp_20260826-1700.md:236`：

> 「**另一條 lane 把我的檔掃進了他們的 commit `e44bf446`**」（CLAUDE.md 已知風險）

⇒ ⭐ **修復的位元組在 `e44bf446`，而訊息留在 `470cb1fd`。**
⇒ #797 讀的是 **commit 訊息**（`fix(vfx)` / `#767`），⛔ 不是 diff ——
   而 CLAUDE.md 第三守則的整條就是「**訊息／註解會說謊，去驗證**」。

**用本票要求的那條閘自己驗一次**（`tools/review/fix-anchor.mjs`）：

```
e44bf446 -> touches   碰到 content/assets/models/imported/{awaken,revivehuman}.glb
470cb1fd -> unrelated 推導出 29 個宣稱檔案，一個都沒碰到
```

⭐ **這張票要的閘，實作對了之後，證明了這張票的 AC1 是錯的。**
⇒ **⛔ 我沒有改那一格**（AC1 未執行，且**不應該**執行）。AC2／AC3 已落地。

### ⚠️ 而 #797 提的**判定規則本身**也會在它自己的例子上翻車

票文 Scope②：「至少要碰到該批 abilities／rollback.configId，**或碰到
`apps/client/src/{vfx,render}/**` / `tools/w3x-import/**` 之一**」。實測那張白名單：

- `e44bf446` 碰 `tools/w3x-import/`（5 個檔）⇒ **放行**（＝票文說錯的那一個）
- `470cb1fd` 一個白名單目錄都沒碰 ⇒ **擋下**（＝票文說對的那一個）

⇒ ⭐ **寬目錄比對量的是「這支 commit 是不是在動特效」，⛔ 不是「它是不是**這一批**的修復」。**
⇒ 落地的版本**只推導**，⛔ 零白名單。

---

## ① GH#797 —— 落地了什麼

**`tools/review/fix-anchor.mjs`（新）** —— 宣稱檔案集合**從出貨內容推導**：

```
abilities[] → content/abilities/<id>.json
            → modelKey  → content/models/<key>.json → 它的 glbPath → content/<glbPath>   ⭐ 決定 invprim 的那一跳
            → vfxKey/vfxId/stepVfx → content/vfx/<id>.json
            → sfxKey…   → content/config/audio-map.json
            → preset:"tpl-*" → content/ability-templates/<tpl>.json（＋它 params 的預設資產）
rollback.configId → resolveRollback() 已經解出來的那份出貨文件
⛔ sequenceDir 刻意不算 —— 只加證據圖的 commit 是**證據**，不是修復
```

**四態**（⛔ 不是布林）：`touches` · `evidence-only`（最硬的訊號，⛔ 不受宣稱集合寬窄影響）·
`unrelated` · `null`（判不了）。

⭐ **`null` 那一態是刻意設計的煞車**：第一版把 `dragonslave_20260827-0030` 喊成 `unrelated`，
而它的錨 `cdd8fe54` 動的是 `apps/client/src/render/modelFxRig.ts` —— ⭐ **那是對的錨**。
⇒ 這條閘只看得到 `content/` 那一面；沒登記 `abilities` 的批次宣稱集合只剩一格 rollback 文件，
   **不足以否定任何錨** ⇒ 回 `null` 並指名「補登記 `--abilities` 就驗得了」。
⛔ 一條會冤枉正確登記的閘會被關掉，而被關掉的閘等於沒有閘。

**接線**：`features.mjs buildFeatureQueue()`（`counts.fixAnchorUnrelated` /
`fixAnchorUndeterminable` ＋ 逐批 blocker）· `check.mjs` 警示行（⛔ 不硬擋，同 #795 Non-goals）·
`register.mjs` **登記的當下**就喊。

### AC3 —— 26 批逐批複驗

**✅ 錨對 6 · ⛔ 錨錯 4 · ℹ️ 判不了 15 · 未登記 1**

| 批次 | 登記的 commit | 判定 | 依據 |
|---|---|---|---|
| beam_visual-proof_20260824-2240 | 57bad55d | ✅ 錨對 | 碰到 8/31 |
| beamshape_visual-proof_20260827-0600 | —(未登記) | — | ⛔ 缺 rollback 開關，整批不可判定 |
| beamtruth_visual-proof_20260826-1200 | bd24b4af | ✅ 錨對 | 碰到 16/35 |
| beamverify_visual-proof_20260826-1200 | bd24b4af | ✅ 錨對 | 碰到 8/20 |
| classic_avalon_visual-proof_20260825 | — | ℹ️ 判不了 | 未登記修復 commit |
| classic_dragonslave_visual-proof_20260825 | — | ℹ️ 判不了 | 未登記修復 commit |
| classic_endworld_visual-proof_20260825 | — | ℹ️ 判不了 | 未登記修復 commit |
| classic_omnislash_visual-proof_20260825 | — | ℹ️ 判不了 | 未登記修復 commit |
| crescent_visual-proof_20260825-2130 | de5ad2b7 | ⛔ 錨錯 | 登記的 de5ad2b7 **一個宣稱檔案都沒碰到**（推導出 14 個，含 abilities）—— 這個錨錯了 ⇒ 「證據比修復早」的比對在這一批上不成立 |
| dagger_visual-proof_20260825 | 898e7c47 | ℹ️ 判不了 | 這一批沒有登記 abilities ⇒ 宣稱集合只有 1 個 content 檔，**看不到渲染端**（`apps/client/src/render/**`） |
| dragonslave_visual-proof_20260827 | 8bab9aa1 | ⛔ 錨錯（只有證據） | 登記的 8bab9aa1 **只加了 _visual-proof_ 的證據圖**，零行修復 —— ⛔ 證據不是修復，這個錨一定是錯的（真正的修復是另一支 com |
| dragonslave_visual-proof_20260827-0030 | cdd8fe54 | ℹ️ 判不了 | 這一批沒有登記 abilities ⇒ 宣稱集合只有 1 個 content 檔，**看不到渲染端**（`apps/client/src/render/**`） |
| dragonslave_visual-proof_20260827-fixed | 8bab9aa1 | ⛔ 錨錯（只有證據） | 登記的 8bab9aa1 **只加了 _visual-proof_ 的證據圖**，零行修復 —— ⛔ 證據不是修復，這個錨一定是錯的（真正的修復是另一支 com |
| firering_visual-proof_20260825 | 898e7c47 | ℹ️ 判不了 | 這一批沒有登記 abilities ⇒ 宣稱集合只有 1 個 content 檔，**看不到渲染端**（`apps/client/src/render/**`） |
| goku_visual-proof_20260825-0200 | a3bc9838 | ✅ 錨對 | 碰到 7/31 |
| invprim_visual-proof_20260826-1700 | e44bf446 | ✅ 錨對 | 碰到 2/29 |
| kenshiro_visual-proof_20260827 | 8bab9aa1 | ⛔ 錨錯（只有證據） | 登記的 8bab9aa1 **只加了 _visual-proof_ 的證據圖**，零行修復 —— ⛔ 證據不是修復，這個錨一定是錯的（真正的修復是另一支 com |
| mark_visual-proof_20260826-0100 | — | ℹ️ 判不了 | 未登記修復 commit |
| o00e_visual-proof_20260825-1200 | — | ℹ️ 判不了 | 未登記修復 commit |
| penta_visual-proof_20260825-2300 | — | ℹ️ 判不了 | 未登記修復 commit |
| quad_visual-proof_20260825-2200 | — | ℹ️ 判不了 | 未登記修復 commit |
| stockglow_visual-proof_20260826-1520 | 76d098c5 | ✅ 錨對 | 碰到 1/30 |
| stuckescape_visual-proof_20260825 | 898e7c47 | ℹ️ 判不了 | 這一批沒有登記 abilities ⇒ 宣稱集合只有 1 個 content 檔，**看不到渲染端**（`apps/client/src/render/**`） |
| tail_visual-proof_20260826-0000 | — | ℹ️ 判不了 | 未登記修復 commit |
| tornado_visual-proof_20260825-2100 | — | ℹ️ 判不了 | 未登記修復 commit |
| weather_rain_visual-proof_20260825 | 898e7c47 | ℹ️ 判不了 | 這一批沒有登記 abilities ⇒ 宣稱集合只有 1 個 content 檔，**看不到渲染端**（`apps/client/src/render/**`） |

**⛔ 錨錯的 4 批（要修的是登記，⛔ 不是程式）**：

| 批次 | 現況 | 該改成 |
|---|---|---|
| `dragonslave_visual-proof_20260827` · `-fixed` · `kenshiro_visual-proof_20260827` | 都錨在 `8bab9aa1` —— 那支**只加了 `_visual-proof_` 的 png**，零行修復 | ⭐ 真正的修復是 `cdd8fe54`（`apps/client/src/render/modelFxRig.ts`：`BJS_ALPHA_ONEONE` 寫的 0 其實是 `ALPHA_DISABLE`，改成 6） |
| `crescent_visual-proof_20260825-2130` | 錨在 `de5ad2b7` —— 那支動的是 `docs/_daily/` `scripts/genguard.sh` `host-deploy.sh` ＋一支測試，**與 14 個宣稱檔案零交集** | ⛔ 我不知道它真正的修復是哪一支 ⇒ **⛔ 不自己挑**（第一守則：引用不到就不要動那一格），列在這裡等重登記 |

**ℹ️ 判不了的 15 批**，兩種原因，兩種修法：

- **9 批完全沒登記 commit**（`classic_*` 4 · `mark` · `o00e` · `penta` · `quad` · `tail` · `tornado`）
  ⇒ 補 `--commit`。
- **5 批沒登記 abilities**（`dagger` · `firering` · `stuckescape` · `weather_rain` ·
  `dragonslave_20260827-0030`）⇒ 補 `--abilities`；它們多半是**渲染端**的修復，
  而這條閘看不到 `apps/client/**`。
- 1 批未登記（`beamshape_visual-proof_20260827-0600` 缺 rollback 開關）。

⛔ **我沒有代為重登記任何一批** —— 重登記會覆寫材料檔，而「哪一支才是那一批的修復」
在 `crescent` 上我引用不到出處。⇒ 列成表，⛔ 不自己挑。

---

## ② GH#756 —— 語音接進**既有**漏斗（⛔ 不蓋第二條管線）

病名是**有管線，沒有流量**：`grep -ni voice tools/review/*.mjs` 在今天之前**零命中**，
`_separation-qc-gate.json`（14,903 bytes，ladder 全寫好）**零程式讀它**。

**`tools/review/voice.mjs`（新）** ＋ `triage.mjs` 接線：

| AC | 狀態 | 量到的 |
|---|---|---|
| 1 `grep -ni voice triage.mjs` 不再零命中 | ✅ | **17 行**；triage 掃 `content/assets/audio/voices/lines/`，認得 `voice` 資產種類 |
| 2 有程式檔讀 `separation-qc-gate` | ✅ | `tools/review/voice.mjs`（`loadLadder()`） |
| 3 門檻讀自 gate 的 **n=8** 列 | ✅ | `review:check` 印 `ladder n=8`；選列照 gate 自己的 `readAs`（`min(clips)` clamp 8），⛔ 不抄字面值 |
| 5 `asset-review.html` 語音批次頁 | ⛔ **柵欄外**（`apps/client/**`） | 見下方接線點 |
| 4 · 7 拔掉 `build_voice_audition.py` 的硬編碼 · 重測 baseline | ⛔ **柵欄外**（`tools/voice-gen/**` · `voice-reference-pipeline/**`），且是**段①** | 見下方 |

⭐ **量到的（新的一行儀表）**：語音 **51 位** · ladder **n=8** · 灰區 **0 對**進 HITL。

⚠️⚠️ 而「0 對」**不是「沒問題」** —— 它是**判不了**，`review:check` 現在逐字這樣印：

```
[review:check] 🎙 語音 51 位（ladder n=8 · 灰區 0 對進 HITL）
  ⚠️ 分離度**判不了**：量測是 2026-07-24 的 n=1／1128 對，而現在是 n=8／1275 對 ⇒ ⛔ 兩個空間混算。
     修法＝段①：重跑 campplus GEMM（voice-gen 車道，⛔ 不在一般 CI）
  ⛔ 「一對都沒選出來」不等於「沒問題」—— 它等於這一族今天沒有量尺。
```

⭐ **我刻意讓它選不出灰區**：拿 n=1 的 cos 去套 n=8 的門檻是兩個空間混算
（同 `castsToKillBase` vs `castsToKill` 那條），而照舊清單建表會**試聽到一批已經不存在的配對**
（#756 Dependencies 逐字：「順序不可換：先重測、再建表」）。
⛔ 也**沒有**把 1,275 對倒進 HITL —— 那正是 owner 點名要避免的極端。

**hash**：沿用 `status.json` 既有的 `reference.sha256` ＋ 逐句生成狀態（⛔ 不另立一套）。
⚠️ 逐個 take **沒有** sha256（欄位只有 `take/engine/stub/seconds/at/error`）——
所以「每一句的位元組身分」今天不存在，識別到的是**音色身分 ＋ 重生事件**。

---

## ③ GH#473 —— `tools/review/` 那一半

**`tools/review/enable-audit.mjs`（新）**：`auditPlan(repoRoot, ids)` ＋ CLI，
⛔ 只對「這一次新啟用的 id」跑（成本斷言）。

⭐ **它刻意不自己實作任何一條稽核判準** —— #473 的 Known risk 逐字是
「稽核邏輯若只活在 .test.ts 裡，抽給 runtime 用時會出現**兩份實作各自漂**」。
⇒ 這一支只做**分派**，而「叫不叫得到」是**去讀那個檔推導**出來的
（`export function|const <symbol>`），⛔ 不是表上手寫的布林（那是 `SIM_CAPABILITIES` 撒謊的形狀）。

**量到的（HEAD 實查）**：

| 稽核 | 實作 | 今天叫得到嗎 |
|---|---|---|
| castability 普查 | `packages/shared/src/content/abilityNoOpEffects.ts` → `analyseAbility()` | ✅ **callable** |
| 描述↔JSON 一致性 | `packages/shared/src/content/descriptionClaims.ts` → `scanAbility()` | ✅ **callable** |
| 空頭 modifier 宣稱 | `packages/shared/src/content/noOpModifierClaims.**test.ts**` | ⛔ **not-callable** —— 判準（`walk` / `raisableStats` / `raisesMoveSpeedCap`…）全是**模組私有**，runtime 叫不到 |

⇒ ⭐ **#473 的 Known risk 在 HEAD 上是真的，而且只剩一支。** 兩支已經是 lib，第三支要抽成
`packages/shared/src/content/noOpModifierClaims.ts`（讓測試與 runtime **import 同一個**，
⛔ 不是複製一份）。

⚠️ ⭐ **另外一件要更正的**（同 CLAUDE.md「它在**哪一個環境**沒有在跑」）：
票文寫「三支稽核只在人想到時手動跑」——⛔ 在 **CI** 這個環境它們是自動閘（vitest）。
真缺口是 **runtime**：後台按白名單那一刻**不經過任何一支**。⇒ 這支 runner 補的正是 runtime 那一半。

---

## ④ GH#664 —— Phase 1 已全落地；Phase 2 只做得了「帳本語意」那一半

Phase 2 的四項（感知基準線 pHash · A/B 並排原作 · 接觸表進 release note · 音訊 LUFS）
**核心都要真渲染／真解碼**，住 `apps/client/**` 與 `tools/voice-gen/**` ⇒ **柵欄外**。

⭐ 柵欄內做掉的是它的**語意前提**（`triage.mjs buildQueue()`）：

```
核准過 + 內容 hash 變了  ⇒  **一律回佇列**（⛔ 不論 risk）
```

在此之前 `risk <= 0` 的資產一律歸 Tier0，**連同一份已經被人核准過、而後來被改掉的**——
⇒ 那正好違反「人審一次，機器守永遠」（人給的綠燈是對**舊位元組**發的）。

⚠️ 出貨影響 = 0：`docs/_review/approvals.json` 目前是空的（54 bytes）。

---

## 🎚 我自己挑的門檻（owner 不在 ⇒ 自己判斷；每一格的 rollback 位置）

| # | 我挑了什麼 | 挑它的理由 | ⭐ 怎麼翻回去 |
|---|---|---|---|
| 1 | 修復錨**只警示，⛔ 不硬擋** | 一批「錨可疑」的登記仍然比「不登記」好（同 #795 Non-goals） | `check.mjs` 的 🎯 區塊；要硬擋就照 `invalid` 那段加 `process.exit(1)` |
| 2 | `evidence-only` 是**硬判定**，`unrelated` 需要「有登記 abilities」 | 只加證據圖依定義不是修復（與集合寬窄無關）；而窄集合看不到渲染端 ⇒ ⛔ 不可據此指控 | `fix-anchor.mjs` 的 `rich` 判斷；改成無條件 `unrelated` 就回到會冤枉人的第一版 |
| 3 | 語音**一位英雄一列**，⛔ 不是一句一列 | 4,718 個 mp3 逐句進佇列＝把「有邏輯篩選」變成「全部倒給人」 | `voice.mjs voiceInventory()` |
| 4 | 灰區 = `[targetForNewCast(n), confusableAdopted(n))`，**n 照 gate 的 `readAs` 算** | ⭐ 門檻只有一個住處（第〇·四守則）；⛔ 不在程式裡挑數字 | 調門檻＝改 `content/assets/audio/voices/_separation-qc-gate.json` 的 ladder，⛔ 不改程式 |
| 5 | 量測過期 ⇒ **選 0 對**並喊出來，⛔ 不用舊數字硬選 | 兩個空間混算；照舊清單建表會試聽到不存在的配對 | `voice.mjs measurementState()` 的 `fresh` 判斷 |
| 6 | 灰區英雄 risk = `度數 × 2` | 與既有的 R/EX ×2 同一把尺（⛔ 不新發明一套權重） | `triage.mjs` voice 區塊的 `deg * 2` |
| 7 | 核准過而 hash 漂 ⇒ **一律回佇列**（⛔ 不論 risk） | 人給的綠燈是對舊位元組發的 | `triage.mjs buildQueue()` 的 `staleApproval` |

⚠️ 1–7 **全部沒有進 `content/config/`**，所以它們**不是後台一格開關**——它們是工具層的
判定門檻，翻它們＝改上面指名的那一行（或 #4：改 gate JSON）。⭐ 真正該進後台的那一格
（`GGD_REVIEW_PENDING_MAX`）Phase 1 就有了，且**預設不擋**。

---

## 🚧 柵欄外的接線點（⛔ 我沒有動，逐項列給下一條 lane）

| # | 票 | 檔 | 要做什麼 |
|---|---|---|---|
| 1 | #473 | `packages/shared/src/content/noOpModifierClaims.test.ts` | ⭐ 把判準抽成 `noOpModifierClaims.ts`，測試與 runtime **import 同一個** |
| 2 | #473 | `apps/admin/src/ui/CurationPage.tsx` | 白名單／貨架**存檔後**呼叫 `auditPlan(repoRoot, 新啟用的 id)` |
| 3 | #473 | `apps/admin/src/ui/ApprovalsPage.tsx` | 重用 #242 的形狀渲染可勾選待修表（`not-callable` 要是**紅列**，⛔ 不可靜默） |
| 4 | #473 | `apps/admin/src/store.ts` | 動作接線 ⚠️ **併行共用檔** —— commit 一定 pathspec 逐檔列名 |
| 5 | #756 | `tools/voice-gen/build_voice_audition.py:41-45` | 拔掉 `CAMPPLUS_CONFUSABLE` / `CAMPPLUS_TARGET` / `F0_GATE_SEMITONES` 三個 **n=1** 常數，改讀 gate JSON（可直接 port `voice.mjs loadLadder()`） |
| 6 | #756 | `voice-reference-pipeline/scripts/analyze_separation.py` | **段①**：對 51×46（4,718 mp3）重跑 campplus GEMM，改寫 `_separation-baseline.json` 的 `measuredAt` 與 gate 的 `currentState` ⇒ ⭐ 做完之後 `voice.mjs` 會**自動**開始選灰區（⛔ 不必改程式） |
| 7 | #756 | `apps/client/public/asset-review.html` ＋ `src/review/` | 語音批次頁：A / B / A→B / A→B→A ＋ ABX 盲測，verdict 三級寫回帳本 |
| 8 | #756 | `docs/_voice-casting.md:673` ＋ gate `:236` | P6 PENDING **兩處一起改**（mirror-authority），⛔ 不可以只改一邊 |
| 9 | #664 | `apps/client/src/review/` · `scripts/release.sh` | Phase 2：pHash 參考影格 · A/B 並排原作 · 接觸表進 release note |
| 10 | — | `package.json` | 加一格 `"review:audit": "node tools/review/enable-audit.mjs"`（⚠️ 柵欄外，我沒加） |
| 11 | — | `tools/parallel-gates/sync-io.json` | ⚠️ `genguard` 說 `docs/_review/material/batches.json` 是「**鎖著(444)但戶籍無主**」（GH#771 的戶籍洞）—— 重量測 sync-io 會補上 |

---

## 🧪 驗證

| | |
|---|---|
| 守衛 | `packages/shared/src/ops/laneREVIEWFixAnchor.test.ts`（**2 條，80 行**；體驗／工具層上限 80 ✅） |
| ⭐ 驗的是出貨的那一支 | ① 開一個**真的 git repo**（`git init` ＋ 4 個真 commit）再問 `fix-anchor.mjs`，⛔ 不自造「commit 動了哪些檔」的夾具（失敗形態⑤）；② 直接跑 `buildQueue(process.cwd())` 對**真的** `content/assets/audio/voices/` |
| ⛔ 不抄數字 | ladder 的值從 gate JSON 讀出來再比對，⛔ 不寫進斷言（第零守則） |
| 突變（一批一條） | `fixTouchesBatch` 開頭插 `return { status:"touches", … }` ⇒ ① **紅**（`expected [] to include '…/m1.glb'`）⇒ 帳本回到會說謊的狀態。已改回 |
| 跑了幾次 | `npx vitest run` **3 次**（全綠 → 突變 → 收尾）· `tsc` **1 次**（`packages/shared`，EXIT=0）✅ 都在上限內 |
| `review:check` | **exit 0**，並新增兩行儀表：🎙 語音 51 位 / 🎯 修復錨 錯 4 · 驗不了 15 |

## 📎 產物

`docs/_review/queue.json` 經 `bash scripts/genrun.sh review:build` 重生成
（⛔ 不手改隔離區產物）：資產 **1,193**（Tier0 853 · pending 340）＋ 新的 `counts.voice` 區塊。
