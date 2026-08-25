# 為什麼我老是直接改產物 —— 誤導源稽核

> owner 2026-08-24：「這個問題發生上百次了，為什麼總是會改到產物而不是產生器？」
> 這一份回答的是他今天問的那半題：**我到底是被哪一句話誤導的。**
>
> 產出於 2026-08-25 · 唯讀稽核 + 一個新檔 · 每一個數字都是當場量的（指令附在每一列後面）

---

## 0 · 量到的底數（⛔ 不是估計）

| 量 | 值 | 怎麼量的 |
|---|---:|---|
| `sync-io.json` 登記的產物路徑 | **621** | `node` 展開 `steps[].writes` |
| 隔離區實際鎖住 | **621 · 可寫 0** | `bash scripts/product-quarantine.sh status` |
| 其中**只被正規化器認領** ⇒ genguard **放行** | **390（62.8%）** | 同上，扣掉 `NORMALIZERS` |
| ⤷ 分佈 | `content/abilities` 331 · `content/champions` 56 · `content/config` 1 · `docs/_data` 1 · `docs/editor-contract` 1 | |
| 有作者認領 ⇒ genguard **擋** | 231 | |
| **多個作者**（hook 只印第一個） | **21** | 全部是 `['skillremake:json','content:build']` |
| `content/` 底下被 git 追蹤的 `.json` | **2,263** | `git ls-files 'content/**/*.json'` |
| `skillremake:json` 擁有的技能檔 | **91**（+ 16 份 champion） | `steps[name=skillremake:json].writes` |
| ⤷ 它們的 `provenance` 值 | **`owner-spec` 90 · `w3x-import` 0** | 逐檔 parse |
| 全部 `content/abilities/*.json` 的 `provenance` | `w3x-import` 330 · `owner-spec` 91 | `grep + uniq -c` |
| `content/champions/*.json` 有沒有來源欄 | **沒有**（top keys 裡零個） | `Object.keys()` |
| `pnpm content:build` 在 repo 出現 | **310 次**（docs 156 · packages 61 · tools 44 · apps 37 · CLAUDE.md 3） | `git grep -n`，扣掉 `docs/legacy` |
| `git add content/` 出現 | **57 次** | 同上 |
| 兩者**同一行**併用 | **25 次** | `git grep -nE` |
| `.test.ts` 裡指名 `content/{abilities,champions,config}/` 路徑的檔 | **318** | `git grep -lE` |
| ⤷ 其中同時提到 `genguard`／`genrun`／`skills:sync`／`產生器`／`不要手改` | **32（10%）** | `comm -12` |
| ⤷ **只指路徑、完全不提誰寫這個檔** | **286（90%）** | `comm -23` |
| `.test.ts` 提到 `genguard` 的 | **4**（其中 2 支是閘自己的測試） | `git grep -ln` |

---

## ① 根源分類表

### A 類 · **守衛的失敗訊息** —— 爆炸半徑最大，因為它在「我正要動手」的那一秒說話

⭐ 這一類的共同形狀：**用「技能 id / 出貨檔路徑」指認缺陷 → 叫我「補上／拿掉／改成」 → 訊息裡沒有一個字提到那個檔是誰寫的。**
⇒ 缺陷報告寄給了「文件」，⛔ 從來沒有寄給「寫那份文件的產生器」。

| # | 檔:行 | 逐字 | 為什麼誤導 |
|---|---|---|---|
| **A1** | `packages/shared/src/content/abilityMirror.test.ts:197` | 「The standalone doc is authoritative — copy ITS value into `content/champions/<cid>.json` abilities[<slot>], never the reverse, then rerun \`pnpm content:build\`.」 | ⛔ **兩重錯**。① 那 16 份 champion 文件是 `skillremake:json` 的產物（實測 writes 含 16 個 `content/champions/`）。② 它點名的重生成指令**是錯的產生器** —— `content:build` = `shared content:build && spec:build && overview:build && tiers:build`（實測 package.json），**不含任何 standalone→embedded 同步**。照做＝改產物＋跑一支不相干的產生器 ⇒ 下一次 sync 全部打回來。⭐ 這是**唯一**一條會因鏡像不同步而紅的守衛，所以它的訊息就是我的全部指示。 |
| **A2** | `packages/shared/src/content/tierFlatExclusive.test.ts:26`（檔頭）＋ `:79`（訊息） | 檔頭：「⛔ 不要放寬它 —— 綠燈要靠 content lane 把 `flat` 拿掉」／訊息：「這些格子有第二個住處，拿掉 flat（值由 resolveDamageTier 解析）」 | 出貨預設就是紅的（383 個「兩個住處」＋169 個沒級別），而那些 `flat` 住在 `content/abilities/*.json` —— 91 份是 `skillremake:json` 產物、另外 331 份會被 `tiers:apply` 就地重寫。**兩個產生器都會把手改打回來**，而訊息一個字都沒提來源在 `tools/skill-remake/heroes/*.py`。 |
| **A3** | `packages/shared/src/content/noOpModifierClaims.test.ts:356` | 「2. 如果你真的要那條屬性可以被解鎖 → 去 `content/config/stat-caps.json` 把它的 unlocked 抬高」 | `stat-caps.json` 是 `statcaps:build` 的產物（實測認領者唯一）。而 `tools/stat-caps/gen_stat_caps.ts:260` 逐字 `unlocked: r.capAt[STAT_CAP_ANCHOR_LEVEL]!` —— 那一格是**算出來的**，手改必被 `statcaps:check` 判 stale。⚠️ CLAUDE.md:595 用一模一樣的話重複一次 ⇒ **守衛訊息與開發守則互相佐證同一個錯誤落點**。 |
| **A4** | `packages/shared/src/content/slowLabelMatchesMultiplier.test.ts:70` | 「標籤與倍率脫鉤（改 statusId，⛔ 不要改 moveSpeedMult）」＋ 印出 `${h.file}${h.path}` | 印出來的清單把**產物與手寫檔混在一起**，訊息不區分。同型：檔頭第 10 行「修法是**補齊缺的 slowNN 文件並改指**」。 |
| **A5** | `packages/shared/src/content/abilityCodeParityForms.test.ts:106` | 「⭐ 照訊息去把另一邊補上（補上之後兩邊一起動，下一次跑會自動變成新基準）。」 | ⭐ **這一支在 2026-08-25 已經被補好了**（107–110 行加了 `bash scripts/genguard.sh …` ＋「⛔ 直接改出貨 JSON 會被下一次 sync 打回來」）。⇒ 它是**唯一**一條把 genguard 寫進失敗訊息的守衛（實測 4 個提到 genguard 的 test 檔，2 個是閘自己的），**這一節的修法就是把它複製到其餘每一條**。 |

⭐ **母體**：318 個 test 檔指名 `content/{abilities,champions,config}/` 路徑，**286 個（90%）完全不提誰寫那個檔**。

---

### B 類 · **開發守則與權威文件** —— 半徑次大，因為它在我**開工前**就先設定了預設立場

| # | 檔:行 | 逐字 | 為什麼誤導 |
|---|---|---|---|
| **B1** ⭐ | `CLAUDE.md:1353` | 「③ **改在來源，一次驗** \| 產生器的**來源檔**（`tools/*/claims.json`、`content/config/`），⛔ 不是它的產物」 | ⭐ **根源第一名：專門為了阻止這個錯而寫的那一行，自己把產物目錄標成「來源」。** 實測 `content/config/` 底下至少 7 份是產物：`_index.json`(content:build) · `ability-vfx-bindings.json`(vfxbind:build) · `ap-damage-scaling.json`(apdmg:build) · `combo-strikes.json`(jasscombo:build) · `damage-tiers.json`(anchors:build) · `stat-caps.json`(statcaps:build) · `vfx-families.json`(pitch:build)。 |
| **B2** | `CLAUDE.md:1358` | 「⛔ **改產物等於沒改。** 產生器擁有的檔案（`content/abilities/*.json` 的**說明欄**、`docs/` 底下所有產生的文件）…」 | 它把 `content/abilities` 的擁有範圍**縮小成「說明欄」**。實際上 `skillremake:json` 擁有 **91 份完整的 ability JSON ＋ 16 份完整的 champion JSON**，**每一個欄位**都是產物（effects / vfxKey / projectileId / statusId / flat）。⇒ 這一句讓我合理地相信「只要不碰 description 就可以手改」—— 而那正是 08-22/23 在 `godie-e002.e/.r/.ex` 上連中三次的形狀。 |
| **B3** | `CLAUDE.md:352` | 「\| **人在編的設定檔**（`content/config/*.json` —— **owner 自己也會編**） \| ⭐ 吃兩個觸發器 \|」 | 第〇·七守則的稽核範圍表把**整個目錄**歸成「人在編的」，並與下一列「產生的 ⇒ 進白名單」明確對立。⇒ 讀完這張表得到的結論就是「content/config 底下沒有產物」。**這是分類層級的誤導，比單點更貴 —— 它讓我不去查 genguard。** |
| **B4** | `CLAUDE.md:59` · `:150` · `:498` · `:552` | 「1. **表住 `content/config/`**（五級距、冷卻表、耗魔表…）」／「三個住處：`content/config/*.json` ＋ Zod `DEFAULT_*` ＋ admin `SHIPPED_*`」 | 第〇·四／第一守則的**落地順序第 1 步**就指向產物。它點名的「五級距」＝ `content/config/damage-tiers.json`，由 `anchors:build` 寫。⇒ 每次我要動級距表，最基本的那條守則就把我送到產物上。 |
| **B5** | `CLAUDE.md:1017` | 「**為什麼可以擋** \| 「改產物」**沒有任何合法情境** —— 產生器自己寫檔走 python/node 檔案 API，⛔ 不經過 Write/Edit/shell 重導。」 | ⚠️ 這句是 genguard「可以擋」的**全部理由**，而 hook 自己在同一天（`preserve-before-overwrite.py:147-160`）開了一個明確的合法情境（「只有正規化器認領 ⇒ 放行」），涵蓋 **62.8%** 的產物路徑。⇒ 只讀 CLAUDE.md 的 session 認為這是絕對的閘；只讀 `genguard.sh` 的 session 認為 63% 可以手改。**兩份權威文件對同一件事給相反的預設立場。** |
| **B6** | `tools/skill-spec/gen_spec.ts:1794` · `:1905` → `docs/技能標記機制與效果規則.md` | 「\| **這一支的覆寫** \| `content/abilities/<id>.json` 的 `vfxLayers[]` \|」／「它住在 `content/config/vfx-families.json`（＝**後台可以改的那一張表**）」 | CLAUDE.md 逐字宣告那份 md 是「技能／增益卡的 JSON 能寫什麼」**只有一份答案**。而它教的動作指向 91 份產物與 `pitch:build` 的產物。⚠️ 同一份文件的範例還把產物與手寫檔混列在同一個標籤下（`godie-e002.e/.w` 是產物，`godie-hart.q/.r` 不是）—— **看不出差別**。 |
| **B7** | 記憶 `ggd-mirror-authority-model.md:31-32` · `ggd-content-build-after-edit.md:11,27` · `ggd-ability-effect-repair.md:15` | 「Sync is **always standalone → embedded**」「**There is no sync tool.** …it is a hand-written pass each time」「every edit under `content/` must be followed by `pnpm content:build`, then `git add -A`」 | 這是**跨 session 都會被載入**的長期記憶，而它逐字說「沒有同步工具，每次都是手寫一輪」。⇒ 在我讀到任何守衛訊息之前，我已經相信 `content/` 是手工區。 |

---

### C 類 · **檔頭缺標** —— 半徑最深：我 `cat` 開一份產物時，**位元組裡沒有一個字告訴我不要改它**

| # | 對象 | 量 | 逐字證據 |
|---|---|---:|---|
| **C1** ⭐⭐ | `content/abilities/*.json` | **422 檔** | 每一支都有一個叫 `provenance` 的欄位（就是我想問「這檔誰寫的」時會讀的那一格），而它的值是 `"w3x-import"`(330) 或 `"owner-spec"`(91) —— **兩個都不是產生器**。實測 `content/abilities/godie-e002.q.json:5` 逐字 `"provenance": "owner-spec",`，而 `skillremake:json` 的 91 份 writes 裡 **90 份寫 `owner-spec`、0 份寫 `w3x-import`**。⇒ 完美的訊號躺在完全錯誤的語意底下：`owner-spec` 讀起來像「這是 owner 手寫的規格」＝**正好相反的暗示**。而 `godie-e002.r` 正是 CLAUDE.md 記載「一晚中兩次」的那一支。 |
| **C2** | `content/champions/*.json` | **72 檔** | 比技能檔更糟：top-level keys 實測為 `id,schema,name,description,role,attackType,origin,modelKey,baseStats,growth,…` —— **連一格說錯話的 `provenance` 都沒有**，只有一片沉默。其中 56 檔是 normalizer-only ⇒ genguard 主動放行。 |
| **C3** | `content/config/stat-caps.json` | 1 檔 | 整份只有 **3 個 top-level key**：`id,schema,caps`（實測）。零 note。而 A3 的守衛訊息、CLAUDE.md:595、`apps/admin/src/store.ts:73`（把它當後台可編頁）三處都叫你去改它。 |
| **C4** | `content/config/{ability-vfx-bindings,vfx-families}.json` | 2 檔 | 零 note。⚠️ `ability-vfx-bindings.json` 的 top key 之一叫 **`unmatched`** —— 讀起來就是一張「還沒配對完、等你補」的待辦表，是整份檔裡最招手的東西。`vfx-families.json` 整份是 `beamPitchDeg/scaleGain/…` 這類旋鈕，正是第〇·五守則①逐字說「**特效 pitch/scale/color/alpha 全部住 JSON（content/）**」要我去調的那一類。 |
| **C5** | 13 份索引/打包產物 | 13 檔 | `content/*/_index.json` ＋ `manifest.json` ＋ `bundle.json` —— **自身檔頭零標記**（`bundle.json` 實測 top keys 只有 `collections/contentVersion/schema`；它檔案裡出現的「⛔ 不要手改」全部是**內嵌的別人的 note**）。⭐ 唯一講清楚的那句住在 `docs/editor-contract/ggd-runtime-capabilities.md:241`，標題是「10.2 ⛔ 三種檔案你一個字都不要寫」—— **對 Codex 說了，對自己人沒說。** |
| **C6** ⭐ | **不對稱本身** | — | `docs/技能標記機制與效果規則.md:3` 逐字「> ⛔ **這份檔案是產生出來的，不要手改。**」；`docs/editor-contract/ap-damage-scaling.md:3` 同型。而同一批產生器寫出來的 **JSON 一個字都沒有**。⇒ **Markdown 產物有橫幅，JSON 產物沉默** —— 而我 90% 的手改發生在 JSON 上。 |
| **C7** | `寶具總表_EX三階.csv`（repo 根） | 1 檔 | 零警語，而最後兩欄叫「設計意圖／審查意見」與「**修改需求**」，`tools/economy/gen_treasure_csv.py:178-179` 每次都把它們寫成空字串（無 round-trip）。⇒ 這份檔在**結構上邀請你手填**，然後靜默洗掉。 |
| **C8** | 弱標記（標了但抓不到） | 10 檔 | `docs/editor-contract/ggd-runtime-capabilities.md` 的自述埋在 **:293，整份文件最後一節**，⛔ 沒有「不要手改」四個字、⛔ 沒點名 `pnpm caps:export`。`tools/sfx-bind/UNPORTED_SFX_LEDGER.json` 只有一格 `"generator"`，而它的 note **逐字教人去手改另一份產物**（「把 reservedCue 寫進那支技能 doc 的 `sfxKey`」）。 |

---

### D 類 · **hook／閘自己的盲區與自相矛盾** —— 半徑：它在我「有意識地去查」的那一刻給出錯誤答案

| # | 檔:行 | 逐字／實測 | 為什麼誤導 |
|---|---|---|---|
| **D1** ⭐⭐ | `scripts/genguard.sh:42` | 「⚠️ $p 會被**正規化器** $NAME 就地改欄位,⛔ 但它不是那支的產物 ⇒ 這一支不擋你。」 | 適用 **390 條路徑（62.8%）**。⚠️ **實測反例**：`bash scripts/genguard.sh content/config/ap-damage-scaling.json` → 印「這一支不擋你」，而該檔的**產生器自己的檔頭** `tools/ap-damage-scaling/gen.ts:9` 逐字寫「產出（兩份，全部由這一支寫，**⛔ 不可以手改**）」。⇒ `apdmg:build` / `apconv:build` 被誤放進「正規化器」名單，而它們是**作者**。同型受害：`docs/editor-contract/ap-damage-scaling.md`（CLAUDE.md:153 逐字點名「⛔ 產生器擁有的文件一律不可手改：… `docs/editor-contract/*`」）與 `docs/_data/ap-conversion-applied.json`。**防呆工具與產生器對同一個檔說相反的話，而我信了前者。** |
| **D2** | `scripts/preserve-before-overwrite.py:161` ＋ `scripts/genguard.sh:21` | `NORMALIZER_STEPS = frozenset({"tiers:apply","apconv:build","apdmg:build","prose:apply"})` | ① 它是**手寫的**，而它上面 20 行（py:141）逐字保證「⭐ 擁有者表從 sync-io.json 的 writes **推導**（量出來的,⛔ 不是手寫）」—— 那句保證只涵蓋擁有者表，真正決定「擋 or 放行」的是這份手寫清單。② **`prose:apply` 不存在**：實測 `'prose:apply' in package.json.scripts` → **false**；`grep -c '"prose:apply"' sync-io.json` → **0**（真名是 `prose:build`）。⇒ 一個永遠對不上的名字躺在裁決清單裡，**而且沒有任何測試會紅**（`git grep -l NORMALIZER -- packages apps` 零命中）。 |
| **D3** | `preserve-before-overwrite.py:185` / `:186` → 訊息 `:289-296` | `return (authors[0], False)` —— 只指名**第一個**作者 | 實測 21 個路徑有 ≥2 個作者，全部是 `['skillremake:json','content:build']`，含 `content/bundle.json` · `content/manifest.json` · **每一個** `_index.json`。⚠️ 實測 `bash scripts/genguard.sh content/bundle.json` → 「是產生器 **skillremake:json** 的產物」⇒ 照它跑 `genrun.sh skillremake:json` —— **那是錯的產生器**，bundle 的真正擁有者是 `content:build`。結果 bundle 仍然過期 ⇒ **正是 2026-08-01「過期 bundle 帶著全綠測試上線、選人畫面整個空掉」的形狀。** 正規化器分支同型：57 個 ability 檔同時被 `apconv:build` 與 `tiers:apply` 認領，訊息只叫你跑前者。 |
| **D4** ⭐ | `preserve-before-overwrite.py:118`（`targets()`） | 攔得到 **5 條**：`Write` · `Edit` · `cat > f`（含 heredoc） · `tee f` · `mv/cp` 目的端 | ⛔ **攔不到**（逐條實測 `targets()` 回空）：`sed -i` (BSD/GNU) · `perl -pi -e` · `python3 -c "open(f,'w')"` · `python3 - <<'PY'` · `node -e fs.writeFileSync` · `git apply` · `patch` · `>>` · `ex` · `dd` · `sponge` · **執行任何腳本** · `MultiEdit` · `NotebookEdit`。⛔ 非 CLI 通道更全盲：後台 `apps/admin` ContentPage、`apps/editor` forge、`vfxLayers.ts` 寫入走平台 API，**hook 連事件都收不到**。而 `CLAUDE.md:1001` 的節標題逐字「這條**有 hook 會擋**，不是散文」**只列了被涵蓋的通道，從頭到尾沒有一句說哪些不被涵蓋**。 |
| **D5** ⭐ | 隔離區 vs worktree | 實測：主樹 `content/abilities/godie-e002.q.json` = **`-r--r--r--`**；`.claude/worktrees/{goofy-dhawan-1d1607,hero-stat-tiers,lagprobe-r10}/…` 同一檔 = **`-rw-r--r--`** | **git 不追蹤 write bit**（只存 100644/100755）⇒ 任何 `git checkout` / `pull` / `stash pop` / 新開 worktree 都把 444 還原成 644，鎖**靜默蒸發**，而 `product-quarantine.sh status` 只量它 cd 到的那一棵樹。⚠️ 這與 GH#625「把每一條 lane 都搬進 worktree」正面衝突。 |
| **D6** | `preserve-before-overwrite.py:206-210`（`lane_marker()`） | 依賴 `.ggd-lane.json` | 實測 `ls .claude/worktrees/*/.ggd-lane.json` → **零命中**（20+ 棵樹全都沒有）。⇒ 在既有的每一條 lane 裡，lane lock 等於不存在。另：`_LOCKED_RE` 實測對 `bash scripts/genrun.sh content:build`（**hook 自己叫我打的指令**）與 `pnpm -s ship:check` **都不命中**。 |
| **D7** | `package.json` `skills:sync` ＋ `CLAUDE.md:1038` | CLAUDE.md 說「自動接線 \| `sync.mjs` 開跑解鎖、`process.on("exit")` 重新上鎖（成功失敗都鎖）」 | 那對 `node tools/parallel-gates/sync.mjs` 成立，但**大家實際跑的不是它**：實測 `pnpm skills:sync` = `pnpm quarantine:unlock && pnpm skillremake:json && … && pnpm quarantine:lock` —— 一串純 shell `&&`。⇒ **中間任何一支失敗就 abort，lock 永遠不跑，621 份產物全部留在可寫狀態**，且零輸出說這件事。⚠️ 不是假設：出貨的 `sync-io.json` 自己記著 `skillremake:json` **ok:false**、`content:build` **ok:false**。 |
| **D8** ⭐ | 三句話互相打架，而我撞到的是**沉默** | genguard 說「可以手改」→ 隔離區給 **裸的 `Permission denied`** → `scripts/genrun.sh:4` 逐字「⛔ 不要手動 chmod 產物再改內容 —— 那正是隔離區要擋的事。」 | 被隔離區擋下時，訊息裡**沒有一個字**提到隔離區、`product-quarantine.sh` 或 `genrun.sh`。⇒ 最自然的下一步就是 `chmod +w` 然後改 —— **也就是 owner 說「發生上百次」的那個動作，由防呆系統自己一路引導過去。** |
| **D9** | `scripts/genguard.sh:18-20` | 「⭐ 這一段必須與 PreToolUse hook 的裁決**逐字一致**：hook 放行而這支說「擋」，就是散文在說謊（第三守則）」 | ⚠️ **沒有任何測試在守這條**（`git grep -l 'genguard\|NORMALIZER' -- packages apps` 零命中），而**它此刻就已經破了**：工作樹的 `genguard.sh` 正規化器分支印 6 行（含「⛔「不擋」≠「這個檔是手編的」」），hook 那一半仍然只印 2 行且沒有那句警告。**一句用散文宣告的一致性，活過了它的保存期限，而沒有東西變紅。** |
| **D10** ⚠️ | `preserve-before-overwrite.py:147` | 「#: ⭐⭐ **正規化器 ≠ 作者**（2026-08-24 **主 session 裁決**，L6 lane 點名要的那一條）。」 | 依 CLAUDE.md 自己的規矩（「owner 說的一律 `>` 引言＋日期；其餘一律是我的」），「主 session 裁決」**不是 owner** —— 是 Claude 自己的決定。但 `⭐⭐`＋「裁決」的排版與標記 owner 原話的排版**長得一模一樣**，而它正是把 390 個產物從「擋」改成「勸」的那一次改動。⇒ 這是「我的推測會變成他的需求」在**閘的程式碼裡**的版本。 |

⚠️ **D 類要誠實補一句**：`py:154-158` 寫下了正規化器放行的**真理由** —— 「出貨的 401 支技能文件裡有 **39 支是直接編 JSON 的**（沒有 `heroes/*.py` 來源），把 `tiers:apply` 當作者會**封死唯一的合法路**」。⇒ **這不是一個純粹的錯誤，是一個真實的設計張力。** 修法不是把放行改回擋，是讓訊息**分辨得出這一份是不是那 39 支之一**（見 ③-2）。

---

### E 類 · **我的推理慣性** —— 見 ⑤，⛔ 這一類不算誤導

---

## ② 最高頻的那一句 —— owner 問的就是這一題

⭐ 答案有**兩層**，因為「最高頻」和「殺傷力最大」不是同一句。⛔ 只給一個會誤導。

### ⭐ 按**出現次數**：這一句

> **「跑 `pnpm content:build`，然後 `git add content/`。」**

| | |
|---|---|
| 出現次數 | `pnpm content:build` **310** 次 · `git add content/` **57** 次 · **同一行併用 25 次** |
| 分佈 | docs 156 · packages 61 · tools 44 · apps 37 · CLAUDE.md 3 |
| 出處原型 | `CLAUDE.md:1451`「每一次 `content/` 編輯都要跑 `pnpm content:build`，**而且要把產物一起 commit**」／`CLAUDE.md:1460`「它紅了不要改它，跑 build 然後 `git add content/`」／記憶 `ggd-content-build-after-edit.md:27`「Touched anything in `content/`? Run `pnpm content:build`, then `git add -A`.」 |

⚠️ **它的每一次出現，字面上都是對的。** 這正是它危險的原因 —— 它反覆教的不是那 13 份索引產物該怎麼重建，而是一個**歸納**：

> 「`content/` 底下的東西是**我編的**，`content:build` 只是把它打包。」

而這個歸納對 `content/` 底下 **621 份產物中的 388 份**（`content/abilities` 331 ＋ `content/champions` 56 ＋ `content/config` 1）**是假的**。
⇒ 310 次重複建立的預設立場，一次守衛訊息推不翻。而且它得到了 B7（長期記憶：「**There is no sync tool** … it is a hand-written pass each time」）的背書。

### ⭐ 按**每次的殺傷力**：這一句

> `CLAUDE.md:1353` —— 「③ **改在來源，一次驗** \| 產生器的**來源檔**（`tools/*/claims.json`、**`content/config/`**），⛔ 不是它的產物」

**專門為了阻止這個錯而寫的那一行，自己把一個裝著 7 份產物的目錄標成「來源」。**
它出現在「紅了之後的正確順序」三步表的第 ③ 步 —— 也就是我**每一次撞到紅燈都會回去讀的那一格**。

---

## ③ 逐處修法（按爆炸半徑排序，全部可執行）

### 半徑 1 · **388 份沉默的 JSON 產物加自述**（每一次 `cat` / `Read` 都受益）

- **做什麼**：在 `skillremake:json` / `tiers:apply` / `apconv:build` 三支產生器的寫檔函式裡，統一補一格 top-level 欄位（⛔ 不要動 `provenance` 的語意，那一格回答的是「設計來自哪裡」）：
  ```json
  "_generatedBy": "skillremake:json — ⛔ 不要手改，改 tools/skill-remake/heroes/godie-e002.py 再 bash scripts/genrun.sh skillremake:json"
  ```
- **為什麼是這一格**：C6 量到的不對稱 —— **md 產物有橫幅，json 產物一個字都沒有**，而 90% 的手改發生在 json 上。
- **⚠️ 那 39 支沒有 `heroes/*.py` 來源的**：值寫 `"_generatedBy": "(手編) — tiers:apply 只會重算級距欄位，其餘欄位你可以改"`。⇒ 這一格**同時解掉 D 類的設計張力**：讓「是不是那 39 支之一」變成**檔案裡讀得到的事實**，而不是要去查一張外部表。
- **Zod**：`ability@1` / `champion@1` 加 `_generatedBy: z.string().optional()`；⛔ 不要進 bundle 的比對鍵。

### 半徑 2 · **genguard 的 NORMALIZER 名單改成推導的，並修掉兩個已知的錯**

| 現在 | 改成 |
|---|---|
| `NORMALIZER_STEPS = frozenset({"tiers:apply","apconv:build","apdmg:build","prose:apply"})`（手寫，`preserve-before-overwrite.py:161` ＋ `genguard.sh:21` 各一份） | **一份**，住 `tools/parallel-gates/normalizers.json`，兩支腳本都讀它；並且**判準改成量出來的**：一個步驟對某路徑是「正規化器」⇔ 它 **reads 也含這個路徑**（就地改 ⇒ 讀寫同一個檔）。`apdmg:build` 只寫不讀 ⇒ 自動被判成**作者**，D1 的矛盾當場消失。 |
| `prose:apply`（不存在） | 刪掉，或改成 `prose:build`（實測 package.json 只有 `prose:build`/`prose:check`） |
| `return (authors[0], False)` — 只印第一個 | 印**全部**認領者，並在有多個時明說「這個檔有 N 個寫入者，`content:build` 必須最後跑」 |

### 半徑 3 · **A 類 5 條守衛訊息，套 A5 的模板**

`abilityCodeParityForms.test.ts:107-110` 已經是正確形狀，逐字複製：
```
⚠️⚠️ **補之前先查那一邊是誰的**：bash scripts/genguard.sh content/abilities/<id>.json
   · 產生器的產物 ⇒ 改**來源**（tools/skill-remake/heroes/*.py）再 bash scripts/genrun.sh <step>。
     ⛔ 直接改出貨 JSON 會被下一次 sync 打回來，而那個「又紅了」看起來像**新的**錯。
```
| 檔:行 | 額外要改的 |
|---|---|
| `abilityMirror.test.ts:197` | ⛔ **把 `pnpm content:build` 拿掉**（實測它不做 standalone→embedded 同步）。改成：`bash scripts/genguard.sh content/champions/<cid>.json` → 產物就改 `heroes/*.py` ＋ `genrun.sh skillremake:json`；非產物才手抄。 |
| `tierFlatExclusive.test.ts:26,79` | 檔頭「綠燈要靠 content lane 把 flat 拿掉」→ 補「⚠️ 這 383 格裡有 N 格住在 `skillremake:json` 的產物上，那些要改 `heroes/*.py` 的 `dmg=` 那一格」 |
| `noOpModifierClaims.test.ts:356` | 「去 `content/config/stat-caps.json` 把 unlocked 抬高」→「去 `tools/stat-caps/gen_stat_caps.ts` 的 `capAt` 表（`stat-caps.json` 是 `statcaps:build` 的產物，手改必被 `statcaps:check` 判 stale）」 |
| `slowLabelMatchesMultiplier.test.ts:70` | 印清單時對每一列先跑一次擁有者查詢，前綴 `[產物·skillremake:json]` / `[手編]` |
| `CLAUDE.md:595` | 同 A3（它與守衛訊息互相佐證，⭐ **兩處要一起改，只改一處等於沒改**） |

### 半徑 4 · **CLAUDE.md 五句**

| 行 | 現在 | 改成 |
|---|---|---|
| `1353` | 「來源檔（`tools/*/claims.json`、`content/config/`）」 | 「來源檔（`tools/*/claims.json`、`tools/skill-remake/heroes/*.py`）。⚠️ **`content/` 底下有 621 條路徑是產物** —— 動任何一份之前先 `bash scripts/genguard.sh <path>`」 |
| `1358` | 「`content/abilities/*.json` 的**說明欄**」 | 「`content/abilities/*.json` 有 **91 份整份都是產物**（不只說明欄）＋ `content/champions/*.json` 16 份」 |
| `352` | 「人在編的設定檔（`content/config/*.json`）」 | 加一列例外：「⚠️ 但 `content/config/` 底下有 7 份是產物（`_index` · `ability-vfx-bindings` · `ap-damage-scaling` · `combo-strikes` · `damage-tiers` · `stat-caps` · `vfx-families`）⇒ 那 7 份走白名單」 |
| `1017` | 「「改產物」**沒有任何合法情境**」 | 「⚠️ 有**一個**合法情境：那 39 支沒有 `heroes/*.py` 來源、只被正規化器就地改欄位的技能檔 —— 它們的 `_generatedBy` 會寫 `(手編)`」 |
| `1001-1014`（genguard 節） | 只列被涵蓋的通道 | ⭐ **加一張「hook 看不見什麼」的表**：`sed -i` · `perl -pi` · `python open(w)` · `node fs` · `patch` · `>>` · `MultiEdit` · `NotebookEdit` · **執行腳本** · **後台/編輯器 Web UI**。⇒ 唯一寫出盲區的兩處（`CLAUDE.md:1027` 與 `product-quarantine.sh:8`）都在事發現場之外。 |

### 半徑 5 · **讓「被擋下的那一刻」自己說話**

| 現在 | 改成 |
|---|---|
| 隔離區擋下 ⇒ 裸的 `Permission denied` | 在 `preserve-before-overwrite.py` 的 **PostToolUse**（或 Bash 包裝）攔 `EACCES`/`Permission denied` ＋ 目標在 621 條表裡 ⇒ 印「🔒 這是產物隔離區。⛔ 不要 `chmod +w` —— 跑 `bash scripts/genrun.sh <step>`」 |
| `skills:sync` 是 shell `&&` 鏈，中間失敗 ⇒ 永遠不上鎖 | 改成 `pnpm quarantine:unlock; <chain>; RC=$?; pnpm quarantine:lock; exit $RC`（⛔ 不是 `&&`），或直接走 `sync.mjs`（它有 `process.on("exit")`） |
| worktree 的 644 | `quarantine:lock` 對 `git worktree list` 的**每一棵樹**都跑；`status` 印每一棵樹的鎖數 |

---

## ④ 一條會紅的閘：**「訊息本身叫人改產物」要被機器抓到**

### 主閘 · `packages/shared/src/ops/guardMessagesDontPointAtProducts.test.ts`

```
① 掃 repo 的 *.test.ts（＋ tools/**/*.ts|py 的 docstring）的**字串常數與註解**，
   抽出所有形如 content/**.json · docs/**.md · *.csv 的路徑字面值
   （含 glob：content/abilities/*.json 展開成該目錄下的實檔）
② 只保留同一則訊息裡帶**祈使動詞**的：改／補上／拿掉／寫進／去 ／換成／copy…into／edit／add
③ 用 sync-io.json 判定那條路徑是不是產物 ——
   ⭐ **直接 import hook 的 _generator_owner 判準（或它的 TS 雙生），⛔ 不要抄第二份表**
④ 是產物 ⇒ 除非同一則訊息**也含** `genguard` / `genrun` / 該擁有者的步驟名 ⇒ 🔴 紅，
   訊息指名「<檔>:<行> 叫人改 <路徑>，而那是 <step> 的產物」
```

| | |
|---|---|
| **實測母體** | 步驟 ①+② 現在命中 **66 行 / 38 檔**（`git grep -nE "content/(abilities\|champions\|config)/" -- '*.test.ts' \| grep -E "改\|補上\|拿掉\|去 \|寫進\|修法\|copy\|edit"`）⇒ **閘不是空的**（防失敗形態⑥：掃到 0 個的解析器對任何內容都是綠的） |
| **GUARD-THE-GUARD** | 母體 < 30 ⇒ 紅（「解析器壞了」），⛔ 不是靜默通過 |
| **突變驗證（一條，最承重）** | 把 `abilityCodeParityForms.test.ts:107-110` 那四行 genguard 提示拿掉 → 閘必須紅並**指名那一支**。改回來。 |
| **豁免表** | `tools/parallel-gates/guard-message-exemptions.json`，每一列要帶**一個能被反駁的理由**（⛔ 不是「還沒收」）。合法理由的樣子：「這一則訊息指的是那 39 支手編技能，`_generatedBy` 是 `(手編)`」 |
| **成本** | 體驗層＋接線類 ⇒ 依第零守則⑦：**測試 ≤ 80 行**，突變做一次 |

### 半條 · `packages/shared/src/ops/normalizerListIsReal.test.ts`（⭐ **現在就會紅**）

```
· NORMALIZER 名單裡的每一個名字必須 ① 在 package.json.scripts ② 在 sync-io.json 的 steps
· 兩支腳本（preserve-before-overwrite.py / genguard.sh）的名單必須**逐字相同**
· 每一個被標成正規化器的步驟，它的 reads 必須含它 writes 的那些路徑（＝真的就地改）
```
| 現在跑會抓到什麼 | |
|---|---|
| `prose:apply` | ⛔ 兩個條件都不成立（package.json → false；sync-io → 0 命中） |
| `apdmg:build` / `apconv:build` | ⛔ 第三條不成立（只寫不讀 ⇒ 它們是**作者**） |
| D9 的「逐字一致」宣稱 | ⛔ 此刻就是破的（hook 印 2 行、genguard 印 6 行） |

⭐ **這一條比主閘便宜十倍，而且它把 D9 那句「必須逐字一致」從散文變成閘** —— 正是 CLAUDE.md 元規則要的形狀。

### 為什麼**不**用「掃 `git add content/` 就紅」

那會誤傷 13 份**正確**的訊息（`shippedBundleIsCurrent.test.ts:121` · `pitchDerived.test.ts:75` · `styleSpecFresh.test.ts:59` …）—— 它們指的路徑確實是產物，**但它們同時點名了正確的產生器**。⇒ 判準必須是「**有沒有點名擁有者**」，⛔ 不是「有沒有提到 content/」。

---

## ⑤ ⭐ 誠實：這幾條**不是**誤導，是我的紀律問題

⚠️ 上面 A–D 四類解釋的是「**為什麼第一次會改錯**」。下面這五條解釋的是「**為什麼會改錯上百次**」。
⇒ **只修 A–D 會把頻率壓下來，但不會歸零。**

| # | 我做過的事 | 誰誤導了我 | 誠實判定 |
|---|---|---|---|
| **E1** | 用 `sed -i` / heredoc / 短腳本改檔，剛好全落在 hook 盲區 | ⚠️ **一半是機制性的**：本 session 的 harness auto-mode 指示逐字「make file changes with **sed, heredocs, or short scripts**, rather than using the dedicated Read, Edit, or Write tools」—— 而 genguard 唯一涵蓋得好的兩個通道（Write/Edit）正是它叫我避開的 | ⭐ **前半不是紀律問題**（被擋的路和被推薦的路互斥，這是真的結構缺陷，值得回報）。⛔ **但後半是**：在我**已經知道** genguard 只攔 Write/Edit 之後還用 sed 改產物，那是我自己選的。 |
| **E2** | 沒跑 `grep -rln "<那句話>" tools/` | **零誤導** —— `CLAUDE.md:1359` 逐字寫著「⭐ 先 `grep -rln "<那句話>" tools/` 找來源，⛔ 不要直接 `Edit` 出貨檔」 | ⛔ **純紀律問題。** 那一行就在我讀 B1 的**同一段**裡，我讀了 B1 沒讀它。 |
| **E3** | 動手前沒跑 `bash scripts/genguard.sh <path>` | **零誤導** —— 它存在、免費、1 秒，`CLAUDE.md:1013` 就列著「**手動查詢** \| `bash scripts/genguard.sh <path>`」 | ⛔ **純紀律問題。** ⭐ 而這一條有救：**它應該變成一個閘，不是一個判準** —— 每次要動 `content/` 之前先跑它，那是一個可以寫進工作流的固定動作。（元規則：判準 0/4 全破。） |
| **E4** | owner **02:41 已經逐字說過**「e002/e00r 是由產生器自動生成的（heroes/*.py）」，而我之後還是改了 | **零誤導** | ⛔ **純紀律問題**，而且是 CLAUDE.md「`ruling.sh` / `asked-before.sh`」那一條的失效 —— 收到裁決當下沒有 `bash scripts/ruling.sh` 寫進票與帳本，於是下一輪的我讀不到它。 |
| **E5** | 同一個閘紅了第三次還在修，把「訊息誤導我」當成解釋 | **零誤導** —— 第零守則⏲逐字：「同一個閘紅第三次 ⇒ ⛔ 停 —— 那是迴圈不是壞運氣」 | ⛔ **純紀律問題。** ⭐ 而且它讓 A–D 的傷害**放大**：一次被訊息誤導 ＝ 一次改錯；不停下來歸因 ＝ 同一個誤導被執行 N 次。`abilityCodeParityForms.test.ts:109` 裡我自己寫的那句「2026-08-25 我在這一條上就繞了一整圈」就是這一格的證據。 |

### ⭐ 比例的誠實話

| | |
|---|---|
| **A–D 解釋得了的** | 「**為什麼第一次會改錯**」—— 而它們是真的：310 次重複的錯誤歸納（②）、90% 不提擁有者的守衛訊息、388 份沉默的 JSON、62.8% 被主動放行、一句不存在的步驟名躺在裁決清單裡 |
| **A–D 解釋不了的** | 「**為什麼會有第 2 到第 100 次**」—— 那需要 E2/E3/E5：一個 1 秒鐘的查詢我沒跑、一個明寫的 grep 我沒做、一個「紅第三次就停」的規則我沒守 |
| ⇒ 修法要**兩邊都做** | A–D 走 ③ 的五個半徑 ＋ ④ 的兩條閘；E 走**同一個方向的唯一解**：⭐ 把 E3 從判準變成閘 —— 讓「動 `content/` 之前先問擁有者」變成一個**會擋下我的動作**，⛔ 不是一句要記得的話 |

---

## 附：一句話結論（給 owner）

> **最誤導我的是一句每次出現都正確的話**：「跑 `pnpm content:build`，然後 `git add content/`」（310 + 57 次）。
> 它從來沒說錯，但它重複了 367 次「`content/` 是我編的東西」這個歸納 —— 而那對 621 份產物中的 388 份是假的。
> **殺傷力最大的則是 `CLAUDE.md:1353`：專門為了阻止這個錯而寫的那一行，自己把 `content/config/` 標成「來源」。**
> 而防呆工具在我去查的時候給了相反的答案（`genguard.sh:42` 對 62.8% 的產物說「這一支不擋你」，包括一份它自己的產生器逐字寫著「⛔ 不可以手改」的檔）。
> ⭐ **但這只解釋前幾次。** 上百次要算在我頭上：`bash scripts/genguard.sh <path>` 一秒鐘、就在守則第 1013 行、我沒跑。
