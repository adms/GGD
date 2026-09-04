# 🧱 積木收斂盤點（2026-09-04）—— ⭐ 16 塊待收，⛔ 而**一個機制解掉 11 塊**

> owner 2026-09-04（逐字，這份盤點的來源）：
> 「我們之前花了許多時間做了很多類似的票，是否也可以請你參考，**沒有收斂結果最後變成是積木**？」
> 「請你**不要浪費遺漏我們之前做的所有成果**，都可以收斂成 type N」

方法：29 個 agent（**4 條宣稱各 2 個反駁者** ＋ **8 族映射** ＋ **13 個空殼** ＋ 1 個完整性稽核），
每一條結論要求 `檔案:行號`。⭐ 反駁輪**推翻了我自己的兩個結論**（見 §4）。

---

## 0. ⭐⭐ 一句話：**這不是 16 件工作，是 1 件**

`packages/shared/src/content/templates/expand.ts` 的 `FAMILIES` 今天有 **29 個 key**。
⭐ 而 **11 塊積木**（3 份有完整參數的 draft ＋ 8 個判定可收斂的空殼）
卡住的**是同一件事**：⛔ **那張表裡沒有它們那一列。**

⇒ ⭐ 第〇·五守則逐字：**按「擋住幾支」排序做機制，⛔ 不是按順序做技能。**
⛔ 把它當成 16 張票逐張做 = 16 輪；⭐ 當成一次 `FAMILIES` 擴充 = 1 輪。

---

## 1. ⭐ 三份「分析做完、參數寫好、引擎沒接線」（`analysedButUnwired`）

| id | 參數 | exemplar | 出處 |
|---|---:|---|---|
| `tpl-dragon-quake` | **12** | 38-03 邪王炎殺黑龍波 | `A09I`，逐行讀過 |
| `tpl-dragon-serpent` | **12** | 38-002 究極暴走黑龍波 | 同上 |
| `tpl-dragon-shockwave` | **9** | 38-03 邪王炎殺黑龍波 | 同上 |

⚠️ ⭐ **⛔ 修法不是把 `status` 翻成 `enabled`。** 系統是 fail-soft
（`templateFailSoft.test.ts`）⇒ 展開失敗**只降級那一支**，而那一支
「技能還在，但一個模板效果都沒有」⇒ ⛔ 出貨一招什麼都不做的技能。
⇒ ⭐ 補 `FAMILIES` 條目。閘已落地：`templateStatusIsHonest.test.ts`（兩個方向）。

---

## 2. ⭐ 十三個空殼 —— 逐個判定（⛔ 不是「都值得填」）

### ⭐ 可收斂（8）—— 全部卡在同一個 `FAMILIES` 缺列

| id | exemplar | 參數出處齊了嗎 | 額外卡點 |
|---|---|---|---|
| `tpl-pull-throw` | 52-02 蹂躪編年史（`A0U1`） | ⭐ 齊（`docs/design/grab-family.md` 70KB 逐格帶 j:行號） | ⭐ 機制早就落地（`sim/effects/pull.ts`）；`docs/_reports/541-147_temp_20260822-1600.md:194` 逐字說它「可以脫離 draft 了」 |
| `tpl-growth-charge` | 07-00 獸化心靈 | ⭐ 齊（14 格裡 9 格指得到 `j:14163/14166/14225`） | ⭐ 機制 100% 出貨（`grantAttribute` 檔頭第 9 行逐字點名這支技能） |
| `tpl-life-manipulate` | 99-002 把你給MikuMiku掉（`A11F`） | ⭐ 齊（10 格全部 `j:`／census／derived） | 我逐行 awk 對過 war3map.j，行號全部存在且逐字相符 |
| `tpl-drain-leech` | 90-00 寄生種子（`A0KV`） | ⭐ 齊（JASS 逐行 ＋ w3a 逐欄） | —— |
| `tpl-resource-ops` | 92-04 馬勒戈壁（`A06Y`） | ⭐ 齊（含 owner 2026-09-01 的裁決原話） | 需要一次範圍裁決 |
| `tpl-team-synergy` | 18-04 億年樹 | ⭐ 齊（6 個出貨節點可逐位元抄） | ⭐ 逐字「不卡，今天就填得完」 |
| `tpl-range-gamble` | 06-00 猜猜拳（`A08Y`） | ⭐ 連續軸齊、分段軸缺一片條件葉 | ⚠️ 要拆兩條軸，⛔ 不要混成一格 |
| `tpl-barrier-domain` | 48-03 鮮血神殿 | ⭐ 齊 | ⛔ **見下面的否決** |

### ⛔ 今天不該收斂（5）—— ⭐ 每一個都有**能被反駁的**理由

| id | ⛔ 為什麼 |
|---|---|
| `tpl-strip-transform` | ⭐ **需求 = 1** —— `docs/ability-templates.csv` 498 列裡這一族只有 **1 列**。一個 N=1 的「家族」就是專屬積木 |
| `tpl-death-mechanic` | ⭐ 機制其實**已經有了**（5 份出貨道具在用 `onDeath`＋`revive`），⛔ 而 ability 側需求 = 0。空殼自己記的 `gapScore:2「死亡hook無」` 是**過期的散文**（第三守則） |
| `tpl-global-rule` | ⛔ 缺三個機制，`emit_templates_md.py:33` 逐字「**不可表; 標記為特殊勝負手**」，`score_gap.py:23` 給它全表最低的 **gapScore 1** |
| `tpl-channel-beam` | ⛔ 定義性行為「**中斷即停**」引擎零支援（`interruptOn` 只有 `none`/`damage`）。⭐ 但 6 個成員逐條有 j:行號 —— 機制補上就能收 |
| `tpl-pure-cosmetic` | ⛔ **住處歸屬要一次裁決**：`vfx-script@1` 的檔頭逐字說它就是「一支技能的**純演出**時間軸」⇒ 填進 template 會是第三個住處 |

### ⛔⛔ `tpl-barrier-domain` 我**否決**（⭐ 逆轉那條 lane 的建議）

那條 lane 判 `canConverge: true`。⛔ 而完整性稽核逐條駁倒了它，而且它是對的：

- **N = 2**，⭐ 而那兩支**沒有一格共同值**：`durationSec` 10 vs 6 · `slowMoveSpeedMult` 0.5 vs 0.7 ·
  `attackSpeedMult` −0.5 vs −1.0 · `onKillSubjectKind` any vs champion · `castTimeSec` 1.033 vs 0.667
- ⭐ **17 格 default 有 13 格的出處是同一支技能**（`godie-hvsh.e`）
- ⇒ ⛔ 那是**替一支技能做的專屬積木，外面包一層模板** ——
  直接違反 CLAUDE.md 規矩 4：「⛔ 一個參數如果值得逐支覆寫，就要先問**家族預設是誰的量值**」

⭐ 判準逐字是「**它擋住幾支**」，而這一族算出來是 **0–2**。

---

## 3. ⭐ 順序（⛔ 不要逐塊做）

| 步 | 做什麼 | 解掉幾塊 |
|---:|---|---:|
| **1** | ⭐ 一次 `FAMILIES` 擴充：3 dragon ＋ 8 空殼 | **11** |
| **2** | `tpl-channel-beam` 的「中斷即停」機制（`interruptOn` 加值） | 1（＋6 個成員） |
| **3** | `tpl-pure-cosmetic` 的住處裁決（或一格開關） | 1 |
| **⛔** | `tpl-strip-transform`(N=1) · `tpl-death-mechanic`(需求 0) · `tpl-global-rule`(不可表) · `tpl-barrier-domain`(N=2 無共同值) | ⛔ **不做**，理由進豁免表 |

---

## 4. ⚠️ 這一輪**推翻了我自己的兩個結論** —— 記下來免得下一輪重犯

| 我原本說 | ⛔ 實際 | 出處 |
|---|---|---|
| 「`applyArtParams` 已經是語意等價的積木，只差接縫」 | ⛔ **只有一半**：它不換 `doc.id`（而池 key 就是它）；`count` 只寫 `burstCount` 而拖尾是 continuous（**349/629**）只讀 `doc.rate` ⇒ 那一格對拖尾**是死的** | `artParams.ts:103,140` · `VfxSystem.ts:1114` · `particleFactory.ts:402` |
| 「`scaleAxis` 在 `vfx@1` 上結構性表達不了」 | ⛔ **錯**：`stretched`+`tailLength`（**205 份**在用）與 ring `radius`+`thickness`（26 份）⇒ ⭐ 正解是**翻譯**，⛔ 不是退回 `count × spacing` 排一排 | `vfx.ts:270-272` · `particleFactory.ts:429-434` |

⚠️ 兩個都是「**我從形狀相似推論語意等價**」——
⭐ 而兩次都是**兩個反駁者用出貨原始碼**推翻的，⛔ 不是我自己想到的。

---

## 5. ⛔ 稽核也抓到一條**已完成卻被寫成待辦**的

`classic-horizontal-beam` 那條 lane 說「`tpl-beam-roll` 缺 `tint`/`alpha`/`scaleAxis`/`clipTimeScale`/`anchor` 五格」。
⛔ 而它跑的時候 `da3d46e7d` 已經補了其中**四格** —— ⭐ 真正還缺的只有 `scaleAxis`
（`grep -l '"scaleAxis"' content/ability-templates/*.json` ⇒ **0**）。
⚠️ ⭐ 而 `scaleAxis` **開不了 slot**：`zParamType` 沒有 vec3，
而 `spawnModelFx.scaleAxis` 是三元組 ⇒ 那是 schema 改動。
