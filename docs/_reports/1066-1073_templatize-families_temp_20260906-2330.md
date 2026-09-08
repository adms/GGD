# #1066 · #1069 · #1071 · #1072 · #1073 —— 五個模板家族（N 同型＝K 模板＋一張表）

> ⚠️ 暫存報告（`{用途}_temp_{timestamp}`）。量測時間 **2026-09-06 23:30**，主工作樹 `main`（第三波 lane，⛔ 未 commit）。
> 上一輪 `docs/_reports/993_templatize_temp_20260906-1815.md`（26 支接上、231）；收編時 12 支因 `abilityCodeParity` 退回 ⇒ 今天的產物是 **243**、帳本 14 筆。

---

## 0. 一句話

**五個家族全部卡在同一個檔上：`packages/shared/src/content/templates/expand.ts` 的 `FAMILIES` 是手寫的展開器表，⛔ 模板 JSON 多一格槽或多一份檔，展開器不讀就是空宣稱** ——
`paramsSchema.test.ts:177` 逐格逼「MOVES 展開結果」、`:128` 逼「enabled 一定 isExpandable」、`brickCensusRatchet` 逼「engineMissing 只准變少」。
那個檔在本 lane 的柵欄外（另一條 lane 正在修 mergeExpansion），⇒ ⭐ 本 lane 做到的是：

| 做了 | 量到 |
|---|---|
| ⭐ **`templatize.py` 五個家族的比對器全部就位、自我門控**（模板／槽不在就把技能放進「差一格／沒有模板」桶並印票號） | 拿提案中的 6 份模板 dry-run：**34 支**提案（single-strike＋status 17 · heal 5 · blink 5 · apply-status 4 · drain-leech 3） |
| ⭐ **變身對子守門**（`abilityCodeParity` 的鏡子）—— 一邊轉不了就兩邊都不轉，並指名另一半為什麼 | 第二波退回的 12 支**逐支給得出理由**（見 §3）；本輪 15 支被它擋下 |
| ⭐ **#1066 族 B 今天就接上 2 支**（`tpl-proxy-cast` 的下拉本來就有 slow40 —— 上一輪只問了 proxy-fanout） | `templatizeEquivalence` 16/16 綠 · `abilityCodeParity` 綠 · 突變紅（指名 godie-u010.w） |
| 6 份模板檔（3 新 3 改）＋ expand.ts／template.ts／paramsSchema.ts 的逐行 patch | 寫在 §5（主 session 同一個 commit 落地） |

⛔ **沒做到**：五張票的主體（27／7／7／5／5）**一支都沒轉**（除了族 B 的 2 支）—— 不是形狀對不上，是柵欄。

---

## 1. 為什麼「先採用再新建」在這五族上走不通（逐族）

| 票 | 既有 46 份裡最近的 | 差在哪一格 | 補那一格要動誰 |
|---|---|---|---|
| #1066 A（targeted `[damage, applyStatus]`，22） | `tpl-single-strike`（23 位採用者） | 沒有 `status` 槽；而 5/22 的狀態（slow60 0.4 · confusion berserk＋targetsAllies · alcohol-enema 0.9）**任何 enum 都表達不了** ⇒ 槽的型別要是「一整個 applyStatus 節點」 | `template.ts`（zParamType）· `paramsSchema.ts`（slotSchema）· `expand.ts`（讀取器＋single-strike）· 模板 JSON |
| #1066 B（ground `[damage, applyStatus]`，5） | ⭐ **`tpl-proxy-cast`**（8 位採用者；下拉 burnstun/root/slow25/30/40） | **零** —— n01g.q／u010.w／uvng.w 逐位元對得上（radius 6.0 ↔ 327.27 wc3u 逐位元回 6.0） | ⛔ 不用動任何程式（**今天轉了 2 支**；n01g.q 見 §3） |
| #1069（`blink to:point`，7） | `tpl-teleport`（0 採用；發 leap＋onLand）· `tpl-blink-strike`（to:targetUnit＋必填 onArrive） | 兩份都是**另一台機器**；正解是零參數新家族 `tpl-blink` | `expand.ts`（FAMILIES 一格）· `editorCapabilities.ts`（FAMILY_PROBE_LIST）· 模板 JSON |
| #1071（`[applyStatus]`，7） | 沒有任何家族只發 applyStatus（proxy-cast／fanout 的 damage 是必填） | 新家族 `tpl-apply-status`（`status` 槽＋optional radius） | 同上 ＋ 與 #1066 共用 `status` 槽型別 |
| #1072（`[heal]`，5） | `tpl-life-manipulate` 發 `restore`（kind 不同） | 新家族 `tpl-heal`（`target` self/ally · `amount` scaling · optional `applyTo`） | 同上 |
| #1073（`[damage, dot]`，5） | `tpl-drain-leech`（`leechFlat` 必填 ⇒ 永遠帶 heal） | `leechFlat` 改 optional ＋ 展開器 `has()` 才發 heal；**3/5** 對得上，另 2 支（09-01 界王拳 ×2）是 `applyTo:self` 真傷 flat 自燒 ⇒ 另一台機器（N=2 且是孿生 ⇒ N=1，⛔ 不模板化） | `expand.ts`（一行）· 模板 JSON |

⭐ 判準：每一族「差的那一格」都是**展開器要不要讀它**，⛔ 不是模板 JSON 能自己補的 —— 這正是 `paramsSchema.test.ts` 那條「每一格都要 MOVES」存在的理由（一格沒人讀的槽就是第一·五守則的空宣稱）。

---

## 2. 做了什麼（柵欄內）

### 2.1 `tools/skill-remake/templatize.py`（676 → 960 行）

| 改動 | 內容 |
|---|---|
| 規矩④ **變身對子守門** | `parity_guard()`：照 `abilityCodeParity.ts` 的算法（`COSMETIC_FIELDS` 之外全部是機制欄位、`canonicalJson` 的整數化／6 位捨入／鍵排序／`<self>` 摺疊）算「轉了之後這一組同編號會不會冒出**新的**漂移鍵」—— 會 ⇒ 擋並指名另一半為什麼沒轉（產物／差一格／沒有模板／不在 --only）；會**修好**既有鍵 ⇒ 預設也擋（baseline 要跟著拿掉那一列），`--allow-parity-fix` 才放行。跑到不動點（擋掉 A 之後 A 的孿生 B 也會被擋） |
| 規矩⑤ **未落地的模板也讀得懂** | `m_single_strike` 讀 `status` 槽（`_has_status_slot()`，型別 `applyStatus`）· `m_proxy_fanout` 雙路（今天走 CC_MECHANIC 下拉，落地後走 `status`）· `m_drain_leech` 收 `[damage, dot]`（只在 `leechFlat.optional` 時）· 新 `m_blink`／`m_apply_status`／`m_heal` |
| ⭐ 新 `m_proxy_cast` | 8 位採用者、下拉含 slow25/40；anchor 由 castType 推回（point↔ground · target↔targeted · self↔self）；排在 proxy-fanout 前面（採用者多的先） |
| `PLANNED_SHAPES` | 「沒有模板發這個形狀」桶的每一行印出**在等哪一張票、哪一份模板** |
| `SKELETON_PREFIXES` | `sela.*`／`thorne.*` 預設跳過（`skeleton.ts` 的值要與 content 對齊、`loader.test.ts` 在守），`--include-skeleton` 才提案 |
| 旗標 | `--templates-dir <dir>`（拿提案中的模板 dry-run；⛔ 配 `--apply` 直接 exit 2）· `--allow-parity-fix` · `--include-skeleton` |

### 2.2 轉了 2 支（`--apply --only godie-u010.w,godie-uvng.w`）

`38-02 邪王炎殺煉獄焦`（變身對子，一起轉）→ `tpl-proxy-cast {anchor:point, radius:327.27, damage{小, ap 0.5 ＋ 0.5 when evil-eye}, damageType:magic, statusId:slow40, statusDurationSec:1.5, castTimeSec:1.133}`。
帳本 14 → **16** 筆。⛔ 沒動任何數值（radius 6.0 逐位元回來、狀態 0.6×1.5s 逐位元）。

### 2.3 三條閘（一次跑）＋ 突變

| 閘 | 結果 |
|---|---|
| `templatizeEquivalence.test.ts` | ✅ 16/16（含新 2 支） |
| `abilityCodeParity.test.ts` | ✅（兩支一起轉 ⇒ 38-02 零新鍵） |
| `templateFamiliesAreAdopted.test.ts` | ✅（proxy-cast 本來就有客戶，表不動；改了 2 列理由，見 2.4） |
| **突變** | `godie-u010.w` 的 `template.params` 清成 `{}` ⇒ 🔴「1/16 支 … godie-u010.w: 展開 ≠ 轉換前」；Edit 改回（與孿生 uvng.w 逐位元相同，已驗） |
| `handWrittenAbilitiesRatchet.test.ts` | ✅ 243（產物仍是 243；⚠️ sync 後會量到 **241** ⇒ 那時把 `HAND_WRITTEN_BASELINE` 改 241，檔頭已寫預期數字） |
| `pnpm typecheck` | EXIT 1 —— **2 個錯全在 `apps/editor/src/forge/ConditionEditor.tsx`**（別條 lane 的 condition.ts 在飛），本 lane 的檔零命中 |

vitest 跑了 3 次（①三閘 ②突變 ③改完理由字串再驗兩閘）、typecheck 1 次。測試檔只改字串／註解（0 行新斷言 vs 實作 +284 行）。

### 2.4 `templateFamiliesAreAdopted.test.ts` 兩列理由改成量到的

- `tpl-teleport`：#1069 的正解是零參數新家族 `tpl-blink`；這一份留給「抵達點才結算 onLand」（`destination` 三個值各 0 支客戶），⛔ 不要為了讓它有客戶把 blink 塞進來。
- `tpl-drain-leech`：加上 #1073 量到的「3 支只差 leechFlat 必填；界王拳 2 支是另一台機器」。

---

## 3. 變身對子 —— 第二波那 12 支為什麼被退回（⭐ 現在是機器答的，⛔ 不是猜的）

`python3 tools/skill-remake/templatize.py`（出貨模板）今天的 `🔗 變身對子` 桶，13 支：

| 想轉的 | 另一半 | 另一半為什麼轉不了 |
|---|---|---|
| e007.e（single-strike） | ewar.e | 產物且 effects 為空 |
| e00n.q（buff-self） | e001.q | 差一格：applyBuff 帶 `perRank` |
| e00n.r / h020.ex / h02r.ex / n01g.ex / o00x.e | e001.r / hjai.ex / hgam.ex / n003.ex / ogrh.e | 沒有模板發 `applyBuff + championForm`（#1067） |
| e00x.e / h01o.r | e00w.e / h01n.r | `skillremake:json` 的產物 ⇒ batch1.py |
| e00x.ex | e00w.ex | effects 為空 |
| n00p.e / o02l.r | nsjs.e / ofar.r | 沒有模板發 `championForm`（#1067） |
| **n01g.q**（proxy-cast） | n003.q（已是 tpl-proxy-cast） | ⭐ 轉了會**修好** `42-01\|effects` ⇒ 要同 commit 從 `abilityCodeParity.baseline/42.json` 拿掉那一列 ⇒ 本 lane 沒轉（`--allow-parity-fix` 給主 session） |

⇒ ⭐ 這張表就是「12 支退回」的根因表：**它們的另一半全部卡在別的票上**（#1067 變身家族 5 支、batch1.py 2 支、perRank 1 支）。一邊轉、一邊等別的票 ⇒ 守衛必紅。

⚠️ 順帶量到（⛔ 沒動）：`n003.q`（tpl-proxy-cast，radius **300** wc3u ＝ 5.5）與 `n01g.q`（手寫 radius **6.0**）是同一支 42-01，**在遊戲裡半徑不同**，而文件層兩邊都寫 `radius: 6.0` ⇒ `abilityCodeParity` 看不到（它比文件，不比展開）。GH#417 那一族；沒開票（一格資料，等 owner 裁決哪一邊）。

---

## 4. 提案中的模板落地後會收幾支（`--templates-dir` 實跑，⛔ 不是估）

| 模板 | 支 | 技能 |
|---|---:|---|
| `tpl-single-strike`＋`status` | **17** | e001.e · e00n.e · e008.q · h020.q · hjai.q · huth.w · n00b.r · o02l.e · ofar.e · o030.w · orkn.w · u00h.q · u00n.q · u00n.w · u00o.q · u00o.w · udea.e |
| `tpl-heal`（新） | **5** | n003.w · n01g.w（self）· n01c.q · nbbc.q · o02p.w（ally） |
| `tpl-blink`（新） | **5** | n00b.e · o00k.w · o00x.w · ogrh.w · udea.q |
| `tpl-apply-status`（新） | **4** | h02r.w · hgam.w（範圍）· o030.q · orkn.q |
| `tpl-drain-leech`（leechFlat optional） | **3** | o030.e · orkn.e · ogld.w |
| 合計 | **34** | ⇒ 棘輪 243 → 241（今天）→ **207** |

**轉不了的（逐支，差在哪）**：

| 支 | 為什麼 | 住在 |
|---|---|---|
| u01u.e · udre.e | 別條 lane 的檔（ratio）—— 形狀對得上，lane 完成後 `--only` 兩支一起轉 | 主 session |
| e007.q ↔ ewar.q | ewar.q 是產物 ⇒ batch1.py 的來源列出 `template:` | batch1.py |
| e010.e ↔ e00s.e | e00s.e 是產物且形狀是 `damageArea + onHitTargets`（70-03 已在 parity baseline 8 列）⇒ 轉 e010.e 會多一列 `70-03\|template` ⇒ 等 70-03 那一組的裁決 | owner／#417 |
| emns.r · emns.q | 產物；emns.r 的 damage 帶 `condition`＋`resourcePct`（⛔ 不是 single-strike）；emns.q（逐階 duration＋missChance）`tpl-apply-status` 收得下 ⇒ batch1.py | batch1.py |
| o02l.passive · ofar.passive · hvwd.passive | PASSIVE＋innateKind:active ⇒ #1065 的三個洞 | #1065 |
| o00x.q · ogrh.q（界王拳） | `dot{damageType:true, applyTo:self, flat 10}` 自燒 ⇒ 不是 drain-leech；N=2 孿生 ⇒ N=1 | ⛔ 不模板化 |
| sela.e · thorne.r | fail-open 骨架的孿生（`--include-skeleton` 才提案；proxy-cast 對得上） | 主 session 決定 |
| n01g.q | §3 | `--allow-parity-fix` |

---

## 5. 需要主 session 動的（柵欄外）—— ⭐ 全文在 `<scratchpad>/lane-tpl5/main-session-patch.md`，模板檔在 `<scratchpad>/lane-tpl5/templates/`

⚠️ **模板檔與展開器要同一個 commit**：先落模板檔 ⇒ `paramsSchema.test`（enabled 無展開路徑）紅；落成 draft ⇒ sync 後 `brickCensusRatchet` 的 `engineMissing` +3 紅。

1. `schema/template.ts`：`zParamType` 加 `"applyStatus"`。
2. `templates/paramsSchema.ts`：`case "applyStatus": return zApplyStatus.omit({ kind: true });`（與展開器同一個 schema，同 `condition` 槽的做法）。
3. `templates/expand.ts`：
   - 讀取器 `statusNode()`（`raw()` → 補 `kind` → `zApplyStatus.safeParse`，失敗擲 ExpandError）；
   - `single-strike`：`...(has(t,p,"status") ? [statusNode(t,p,"status")] : [])`；
   - `proxy-fanout`：`if (has(t,p,"status")) effects.push(statusNode(...))`，**刪 `CC_MECHANIC`**；
   - `drain-leech`：heal 節點改 `...(has(t,p,"leechFlat") ? [heal] : [])`；
   - 三個新家族 `blink` / `apply-status` / `heal`（程式在 patch 檔 ③-e，各 ≤ 15 行，⛔ 一個 `if (family)` 都沒有）。
4. `editorCapabilities.ts`：`FAMILY_PROBE_LIST` 加 `"blink", "apply-status", "heal"`。
5. `paramsSchema.test.ts`：`probesFor` 加 `case "applyStatus"`（兩個候選：root 1s / burnstun 1s）。
6. `orbitProxy.test.ts:30／52-59`：`statusId` → `status`。
7. `godie-u01u.w.json` params 與帳本 `params`：`statusId/statusDurationSec` → `status:{statusId:"burnstun",duration:0.8,stun:true}`。
8. `templateOriginBaseline.json`：`tpl-proxy-fanout.params` 拿掉 `statusId`、`statusDurationSec`。
9. `cp` 6 份模板檔 → `python3 tools/skill-remake/templatize.py --apply --exclude …`（應寫 34 支）→ 六支閘 → `pnpm skills:sync` → 棘輪改 207、豁免表刪 `tpl-drain-leech`。
10. 追加：`--apply --only godie-n01g.q --allow-parity-fix`＋拿掉 `42-01|effects`；u01u.e／udre.e 等另一條 lane；batch1.py 的 ewar.q／emns.q。

### 6 份模板檔的重點（每格 default 都帶出處 token；`j:` 引用 0 個，⛔ 沒有引我沒讀過的行）

| 檔 | 槽 | default 出處 |
|---|---|---|
| `tpl-blink.json`（新，family `blink`，`requires: []`） | `castTimeSec` optional 0.467 | census: 7/7 支逐位元 |
| `tpl-apply-status.json`（新，family `apply-status`） | `status` `{root,1.5,root:true}` · `radius` optional 327.27 · `castTimeSec` optional 0.833 | census: 7 支裡 root 4 支最多 · derived: 90-02 的 6.0 · derived: exemplar 70-03 |
| `tpl-heal.json`（新，family `heal`） | `target` enum self/ally（ally）· `amount` scaling（08-01 逐位元）· `applyTo` optional 無 default · `castTimeSec` optional 0.067 | taxonomy: 3/5 指定隊友 · derived: godie-n01c.q · —— · census: 5/5 |
| `tpl-single-strike.json`（改） | `status` optional **無 default**（23 位採用者一個狀態都沒有；預設塞一個暈眩就是替每張新卡編一格） | —— |
| `tpl-proxy-fanout.json`（改） | `statusId`＋`statusDurationSec` → `status` optional，default `{root,4,root:true}` | derived: 原兩格的預設合成 |
| `tpl-drain-leech.json`（改） | `leechFlat` 加 `optional:true`（default 50 留著當建議值） | 原 j:26608 不動 |

⚠️ 回血**沒有級距表**（`damage-tiers.json` 是傷害的）⇒ `tpl-heal.amount` 走 perRank —— 5 支出貨文件本來就是字面 perRank，這裡沒有第二個住處（#1072 票文的 Known risks 那一句，答案是「沒有，走 perRank，理由如上」）。

---

## 6. 順手發現、⛔ 沒動的

| 發現 | 住在 |
|---|---|
| `tpl-blink-strike.requires:["blink"]` 而 `SIM_CAPABILITIES` 沒有 `blink` 列 ⇒ `missingCaps` 回缺失 ⇒ 編輯器對一份可展開、有客戶的模板印「blink 未支援」（第一·五守則） | **#1081**（開了票；提案的 `tpl-blink` 為此寫 `requires: []`） |
| `tpl-proxy-fanout` ≡ `tpl-proxy-cast{anchor:point}`（同一台機器，前者下拉更窄、1 位採用者）—— 第〇·四「同一語意兩個住處」的形狀；#1066 落地後 proxy-fanout 的 `status` 槽會比 proxy-cast 寬，兩份的關係要有人裁 | 記錄用（沒開票；#1066 的 Known risks 可補一句） |
| n003.q vs n01g.q 同編號 42-01 在遊戲裡半徑 5.5 vs 6.0（§3） | GH#417 族，記錄用 |
| 上一輪報告把 n01g.q／u010.w／uvng.w 判成「proxy-fanout 下拉只有 slow30」的差一格 —— ⛔ 只查了 proxy-fanout 沒查 proxy-cast（「我查的那條路上沒有」≠「它不存在」，第一守則）。本輪用 `PROXY_CAST_STATUS` 表把那條路接上 | 本檔 |

---

## 7. 動到的檔案

| 檔 | |
|---|---|
| `tools/skill-remake/templatize.py` | +284 行：規矩④⑤、`m_proxy_cast`、五族比對器、變身對子守門、三個旗標 |
| `tools/skill-remake/templatize-ledger.json` | 14 → 16 筆（u010.w · uvng.w） |
| `content/abilities/godie-u010.w.json` · `godie-uvng.w.json` | `effects: []` ＋ `template:{ref:"tpl-proxy-cast", params}` |
| `packages/shared/src/content/templateFamiliesAreAdopted.test.ts` | 2 列理由（tpl-teleport · tpl-drain-leech） |
| `packages/shared/src/ops/handWrittenAbilitiesRatchet.test.ts` | 檔頭註解：243 的由來 ＋ 預期 241／207（常數不動，等 sync） |
| `docs/_reports/1066-1073_templatize-families_temp_20260906-2330.md` | **新**（本檔） |
| `docs/_reports/1066-1073_main-session-patch_temp_20260906-2330.md` | **新** —— 柵欄外 patch 全文 ＋ 6 份模板檔全文（附錄；與 scratchpad 那份相同） |
| `<scratchpad>/lane-tpl5/main-session-patch.md` · `templates/*.json`（6 份） | 主 session 的落地材料（⛔ 不在 repo；本檔 §5 是摘要，全文在 patch 檔） |

⛔ 沒碰：`expand.ts` · `template.ts` · `paramsSchema.ts` · `editorCapabilities.ts` · `content/champions/**` · `content/ability-templates/*`（出貨目錄一份都沒動）· 任何 `*:build` · git。
