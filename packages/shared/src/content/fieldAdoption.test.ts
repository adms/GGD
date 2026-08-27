/**
 * THE FIELD ADOPTION CENSUS — detection recipe **S8** as a standing CI guard.
 *
 * S8 (docs/_false-completions.md) is 「機制上線、內容 0 筆」: the schema, the sim
 * and the UI all ship, every test is green, and not one content document fills
 * the field — so the mechanism never happens in a match and nothing anywhere
 * says so. It is the quietest of the 27 false completions because there is no
 * error to find: the code is correct, it is simply never reached.
 *
 * WHAT MAKES THIS TEST WORTH KEEPING (and not just a restatement of the audit)
 * --------------------------------------------------------------------------
 * Both sides of the comparison are derived AT TEST TIME:
 *
 *   supply  ← `nameSchemas`/`register` walk the Zod schemas in ./schema
 *   demand  ← the real `content/` tree, loaded through the real loader
 *
 * Nothing below hard-codes what is currently wrong. A field is censused because
 * it EXISTS, on the commit that adds it — so the next S8, the one nobody has
 * thought of yet, fails this test the day it lands. The audit doc's own version
 * of the recipe was `grep -rl '"hitFeel"' content/ | wc -l`, and a grep can only
 * ever find what you already suspected.
 *
 * That is not a hypothetical distinction. Of the three zeroes the audit named:
 *   • `hitFeel` is now on 142 ability docs and 112 champion docs,
 *   • champion weapon tags are on 33 of 113 champions (katana 20, sword 8,
 *     greatsword 3, gun 1, bow 1 — so `attackKatana`/`attackGreatsword`/
 *     `gunshot` are all reachable now),
 *   • `evasion` reached content DURING the writing of this file (7 docs).
 * A test that asserted the audit's findings would have been wrong within hours.
 * This one recomputes them and reports whatever is true today.
 *
 * WHAT IT ASSERTS
 * ---------------
 *  1. Every registered, reachable, sufficiently-sampled key has at least one
 *     content doc using it — or a documented exemption saying why not.
 *  2. No exemption is STALE. An exemption whose key has since been adopted is
 *     a hard failure, because a permanently-true exemption list is how the
 *     guard rots into a rubber stamp (same discipline as
 *     apps/game-server/src/net/eventFanout.test.ts).
 *  3. No `landing` grace has expired. See THE NEW-FIELD PROBLEM below.
 *  4. The census actually measured the whole tree (guard the guard).
 *
 * THE NEW-FIELD PROBLEM
 * ---------------------
 * A brand-new field is legitimately at zero on the day it lands — the schema
 * change and the content migration are usually two commits, often two people.
 * Failing that is how a guard gets disabled. But "it's new" with no expiry is
 * how a guard gets useless: every S8 in the audit doc was new once.
 *
 * The answer here is a BOUNDED, SELF-EXPIRING grace: status `"landing"` with a
 * `since` date. It suppresses the failure for `GRACE_DAYS`, and then the test
 * fails and names the entry. The clock does the follow-up nobody remembers to
 * do. Deliberately not `"debt"`, which never expires but is printed as a loud
 * banner on every single run — a debt you have to look at is a debt you might
 * pay; a debt that is silent is the pathology itself.
 *
 * WHAT THIS DOES NOT CATCH (stated so nobody mistakes green for coverage)
 * ----------------------------------------------------------------------
 *  • ADOPTION > 0 BUT MEANINGLESS. One doc setting a field is enough to make
 *    this test green. `craftRole: "service"` on 2 of 214 items passes here; if
 *    that is too few to matter, that is a balance/curation question and needs
 *    its own guard. This test answers exactly one question: is it ZERO.
 *  • SMALL SAMPLES. `MIN_REACH` (3) mutes every `config@1` singleton and any
 *    container present in fewer than 3 docs — `projectiles.meshShape`'s `orb`
 *    and `shard`, the `gore.style` options, the per-hook `abilitySlot` filter.
 *    A dead option inside a one-doc container will not be reported.
 *  • REQUIRED FIELDS. Present in 100 % of docs by construction, so they cannot
 *    be an S8 — but a required field the SIM never reads is a different
 *    pathology this does not look for.
 *  • CURATION. A field adopted only by docs outside the operator's whitelist
 *    still counts as adopted. Whether the whitelist reaches it is P0-2's
 *    question, not this one.
 *  • FREE-TEXT VOCABULARIES the code reads out of `string[]` fields are only
 *    censused when declared in `TAG_VOCABULARIES`. `weaponClass` is declared;
 *    a future `if (tags.includes("…"))` in some system is invisible until
 *    someone adds it there. This is the one place the guard needs a human.
 *  • THE OTHER DIRECTION. Content that sets a field NO code reads (the mirror
 *    pathology) is not this test — see the `onLevelUp` note in EXEMPTIONS,
 *    which this census found only because the member also had zero adoption.
 *
 * COST: one `ContentLoader` pass over the real tree (~1450 docs) plus a paired
 * schema/value walk. Measured ~1.4 s wall for the load and ~90 ms for the
 * census itself on an M-series laptop — the same order as
 * castTimeCoverage.test.ts, which loads the identical tree. Cheap enough to
 * run on every commit; that is the point of it existing at all.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import {
  censusAdoption,
  formatCensus,
  unadopted,
  MIN_REACH,
  TAG_VOCABULARIES,
  type Census,
} from "./fieldAdoption";
import type { ContentStore } from "./store";
import { ALL_STATS } from "../sim/stats/statTypes";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../../../..");
const CONTENT_DIR = join(REPO_ROOT, "content");

/**
 * How long a `"landing"` exemption may suppress a failure. 30 days is roughly
 * "the schema commit and the content commit are in the same月", and short
 * enough that a forgotten migration surfaces while the author still remembers
 * writing it.
 */
export const GRACE_DAYS = 30;

type ExemptionStatus =
  /** the behaviour ships from a CODE DEFAULT; the field only overrides it, so
   *  zero adoption means "nobody needed to override", not "mechanism dead". */
  | "default-live"
  /** the field is filled by code that SYNTHESIZES docs at runtime, so it can be
   *  live in a match while no doc on disk carries it. */
  | "runtime-authored"
  /** content CANNOT legally set it here — another schema rule forbids it. */
  | "schema-impossible"
  /** a dead field kept for compatibility; adopting it would be the bug. */
  | "superseded"
  /**
   * ⭐ 2026-08-13 —— the mechanism HAS content, and that content is sitting in
   * `content/_legacy/`. owner 2026-08-13 pulled 41 champions + 236 abilities out
   * of the operating tree («沒開放的英雄…預設不要再被讀取到了»), so a handful of
   * keys went to zero WITHOUT anything being new, broken, or defaulted.
   *
   * None of the other five statuses tells that truth: it is not `debt` (nothing
   * is broken — the doc is authored and correct), not `landing` (no migration is
   * in flight, and a 30-day alarm can only be cleared by inventing content
   * nobody asked for), and certainly not `default-live` (there is no code
   * default covering for the zero — the mechanism genuinely does not happen in
   * any shipped match right now).
   *
   * ⛔ It is NOT a free pass. Every entry must name a `witness` — the legacy doc
   * that adopts the key — and the well-formedness test below opens that file.
   * So the exemption dies the moment its evidence does, and the STALE test above
   * kills it the moment the champion is brought back into the roster.
   */
  | "legacy-parked"
  /** a REAL S8. Never expires, but is printed as a loud banner every run. */
  | "debt"
  /** brand new; adoption expected. EXPIRES after GRACE_DAYS — see above. */
  | "landing";

interface Exemption {
  readonly status: ExemptionStatus;
  /** why zero is acceptable, or (for `debt`) what is actually broken. */
  readonly why: string;
  /** ISO date. Required for `landing`; the grace counts from here. */
  readonly since?: string;
  /**
   * Required for `legacy-parked`: a repo-relative path under `content/_legacy/`
   * holding a doc that DOES adopt this key. Checked on disk, not trusted as
   * prose — see the well-formedness test.
   */
  readonly witness?: string;
}

/**
 * ===========================================================================
 * THE EXEMPTION LIST — every key the census reports at zero, with a reason.
 * ===========================================================================
 *
 * RULES OF THE ROAD
 *   • A key here must currently be at zero. If it gets adopted, this test goes
 *     red and the entry must be DELETED (test 2). That is the whole reason the
 *     list cannot quietly grow into a rubber stamp.
 *   • Never add a key to silence a failure you have not understood. The three
 *     honest outcomes are: fix the content, mark it `debt` with what is
 *     actually broken, or mark it `landing` and finish the migration.
 *   • The `why` is for a reader six months from now who has never seen the
 *     field. "not used" is not a reason.
 *
 * Sorted by key, matching the census output order.
 */
const EXEMPTIONS: Readonly<Record<string, Exemption>> = {
  "enum:abilities.effects[]#applyBuff.modifiers[].msBonusTier=極大": {
    status: "landing", since: "2026-08-27",
    why:
      "移速加成五級距的**天花板格**（4.0 ＝ +400%）—— owner 2026-08-27 逐字給的是" +
      "「上下限 **0.1~4**」，⭐ 上限是**梯子的邊界**，⛔ 不是一個承諾會有技能用到的值。" +
      "實測逐格採用：極小 7 · 小 7 · 中 3 · 大 5 · **極大 0** —— 出貨 31 列裡最大的 % 是 " +
      "3.0（赤色彗星，而它另有原作哏豁免留字面值）。⇒ 零採用是**正確的現況**，" +
      "⛔ 不是「機制做了沒人用」。反駁方式：哪天真的有一支 +400% 的技能，這一列自動失效（會有人用）；" +
      "或 owner 改了上限，這一列要跟著那次改動一起檢討。",
  },
  "enum:abilities.augment.targets[].ops[].op=modifierValue": {
    status: "landing", since: "2026-08-24",
    why: "augment 家族 09-002 首發只用到 damageCoeffAp/add —— 其餘成員等 #649/#684 的下一批採用者（機制與 schema 一起出貨是刻意的:分批出 schema 會讓 Codex 契約抖動）。",
  },
  "enum:abilities.augment.targets[].ops[].op=thresholdPct": {
    status: "landing", since: "2026-08-24",
    why: "augment 家族的門檻型 op —— 09-002 首發只用 damageCoeffAp/add,門檻型等 #649/#684 的下一批採用者;schema 整族一次出貨是刻意的(分批出會讓 Codex 契約抖動)。",
  },
  "field:abilities.augment.targets[].condition": {
    status: "landing", since: "2026-08-24",
    why: "augment 的條件葉掛點 —— 09-002 首發無條件(SSJ3 條件今天表達不出來,EX lane 報告記錄在案),掛點等 #684 模板共用批的採用者。",
  },
  "field:abilities.augment.targets[].ops[].hookOn": {
    status: "landing", since: "2026-08-24",
    why: "augment 的 hook 掛點 —— 09-002 首發是常駐 add,⛔ 不掛事件;hook 型 augment 等 #670 序列演出批的採用者。",
  },
  "field:abilities.augment.targets[].ops[].scope": {
    status: "landing", since: "2026-08-24",
    why: "augment 的作用域選擇 —— 09-002 首發只指名單一 abilityId,scope 廣域型等下一批;留在 schema 是讓 #684 不必再動契約。",
  },
  "field:abilities.augment.targets[].ops[].stat": {
    status: "landing", since: "2026-08-24",
    why: "augment 指名屬性的那一格 —— 首發的 op=damageCoeffAp 自帶屬性語意不需要它;stat 型 op(modifierValue)的採用者到位時這格一起活。",
  },
  "enum:vfx#vfx@1.orient.yawFrom=world": {
    status: "default-live",
    since: "2026-08-24",
    why: "`world` 是 `yawFrom` 的**預設值的顯式拼法** —— 欄位省略即 world（文件自己的 yawDeg 直接用），所以永遠不會有內容需要明寫它；它留在 enum 是讓「不跟瞄準轉」可以被**明說**（GH#641 的 aim 是第一個非預設採用者）。⭐ 可反駁：哪天預設改成 aim，這一列就該刪、world 就該有採用者。",
  },
  // ⚠️ `field:abilities.effects[]#spawnModelFx.anchor` 的 landing 豁免 2026-08-25
  //    **兌現了而且過期了**（HEAD 上已有 20 份 ability 文件填它）—— 這條守衛的
  //    STALE 斷言逐字點名它「now adopted by 22 doc(s)」並說「DELETE the listed
  //    entries; that is the entire fix」。⇒ 照規矩刪掉，⛔ 不是留著一句謊話。
  // ═══ GH#693 蝗蟲群模板化 2026-08-25 ═══════════════════════════════════════
  // ⚠️ `field:abilities.effects[]#spawnModelFx.alpha` 的 landing 豁免（同日寫的）
  //    **兌現了**：GH#690 把 census 的 57 個 `SetUnitVertexColorBJ` 呼叫點回填進
  //    出貨內容（01-04 超究武神霸斬 α0.6 · 11-04 三千世界 α0.5 ×2，含 champion
  //    鏡射共 6 份文件），而那一列自己寫著「第一支回填的技能出現那天這一列就會
  //    stale 而紅」。⇒ 照規矩刪掉，⛔ 不是留著一句謊話。
  //    值的對帳在 `content/runtimeAlphaBackfill.test.ts`（census ↔ 內容，兩個方向）。
  "field:abilities.effects[]#spawnModelFx.spacing": {
    status: "default-live",
    why:
      "⭐ **值住模板，⛔ 不住技能** —— 這一格 2026-08-25 之前唯一的兩個字面採用者" +
      "（09-04 龜派氣功的火柱 ×2）在 GH#693 改成引用 `tpl-locust-line` 了，而" +
      "`spacing:2`（原作 h006 `loop i=1..6 × 200` ÷100）現在住那份模板的 " +
      "`params.spacing.default`。⇒ 這份普查讀的是**磁碟原文**（⛔ 不是 " +
      "`resolveModelFxPreset` 之後的節點），所以一格「被正確地收進共用表」的欄位" +
      "在這裡必然掉到 0 —— 那正是第〇·四守則要的結果，⛔ 不是 S8。\n" +
      "⚠️ 這條豁免說的是「今天 0 筆是對的」，⛔ 不是「這個機制沒有人守」：" +
      "`templates/locustTemplates.test.ts` ② 逐格斷言補完之後的節點真的帶著 " +
      "`spacing: 2`，`sim/effects/spawnModelFx` 的 static 沿線測試斷言它真的被讀。\n" +
      "⭐ 可反駁：哪天有一支技能要**覆寫**間距（原作 59-04 是 150 ⇒ 1.5，" +
      "與模板預設 2 不同），它就會在自己的節點上寫出這一格，這一列就 stale 而紅。",
  },
  // ═══ GH#698 tpl-locust-strike 收攏 o00E 那 13 個節點 2026-08-25 ═══════════
  // ⚠️ 下面三列與上面的 `spacing` 是**逐字同一件事**：值被收進 `tpl-locust-strike`
  //    的 `params[*].default`，而這份普查讀的是磁碟原文 ⇒ 必然掉到 0。
  //    ⛔ 它們**不是**新機制沒人用，是舊機制**不再有第二個住處**。
  // ⭐ 2026-08-25（QUAD lane）：`spawnModelFx.clip` 的豁免列照它自己寫的反駁條件
  //    刪掉了 —— GH#688 Phase 6 的 orb 批（TORNADO 9 節點＋QUAD 9 節點）在自己的
  //    節點上寫出了 `clip:"idle"`，普查量到 29 個採用者 ⇒ 那一列已經是謊話。
  "enum:abilities.effects[]#spawnModelFx.path=static": {
    status: "default-live",
    why:
      "⭐ 同上一列 —— `static` 現在是 `tpl-locust-strike`／`tpl-locust-line` 的 " +
      "`params.path.default`，13 個 o00E 節點與 2 支火柱都靠模板補它。" +
      "⛔ 逐支再寫一次就是把家族的路徑抄成 13 份會各自漂的複本。\n" +
      "⭐ 可反駁：哪天有一支 static 技能**不**走這兩份模板（手寫節點），它就會寫出 " +
      "`path:\"static\"`，這一列 stale 而紅。",
  },
  "enum:abilities.effects[]#spawnModelFx.anchor=point": {
    status: "default-live",
    why:
      "⭐ 同上一列 —— `point` 是 `tpl-locust-strike` 的 `params.anchor.default`" +
      "（census 量到 13 個 o00E 節點裡 7 個落在地板點，是這一族最常見的落點）。" +
      "另外兩個值 `self`／`target` **仍然逐支寫在節點上**（它們與家族預設不同），" +
      "所以這個 enum 家族並不是整族 0 —— 掉到 0 的只有「等於預設值的那一個成員」。\n" +
      "⭐ 可反駁：哪天預設換成 `self`，`point` 就會變成逐支明寫的那一個，這一列 stale 而紅。",
  },
  "field:abilities.effects[]#spawnVfx.attach": {
    status: "landing",
    since: "2026-08-24",
    why: "`at:\"bone\"` 的掛點字串（hand,right / chest / weapon…）—— 同上，schema refine 把它與那一格 enum 綁成**成對**（缺一半就是第一·五守則的「說了但不會發生」），所以兩列必然同進同出。43 支的內容批在 GH#649 第 2 批。",
  },
  "field:abilities.persistentVfx[].scale": {
    status: "landing",
    since: "2026-08-24",
    why: "常駐特效的尺寸覆寫。同 `alpha` 的理由：四份在用的內容都讓粒子文件自己決定大小（第〇·四守則）。⭐ 可反駁：哪天同一份粒子要在兩支技能上有不同大小，填上去這一列就 stale 而紅。",
  },
  "field:abilities.persistentVfx[].when": {
    status: "landing",
    since: "2026-08-24",
    why: "常駐特效的**掛載條件**。四份內容都刻意缺席 —— 缺席逐字等於「這一格技能學到了（rank>0）就一直掛著」，而那正是這四份要的語意（Saber 的金粉在她拿著劍的時候一直閃、南方之月的光環在 EX 學到之後一直在）。⭐ 可反駁：哪天有一支要「只在某個狀態下才掛」（例如變身態才有的拖曳緞帶），填上去這一列就 stale 而紅。⚠️ ⛔ 不要為了讓它變綠去替某一支填 `when` —— 那會**改變畫面上看得到的東西**。",
  },
  "field:abilities.persistentVfx[].alpha": {
    status: "landing",
    since: "2026-08-24",
    why: "常駐特效的整體透明度覆寫。三份在用常駐特效的內容（`godie-h020.ex` / `godie-hjai.ex` / 新的 `godie-e002.e` 金粉）都讓粒子文件自己決定 alpha —— ⭐ 那是**對的預設**（第〇·四守則：值住一個地方）。這一格是給「同一份粒子文件要在兩支技能上有不同濃度」用的出口，今天沒有那個案例。⚠️ 下界刻意是 0.05 ⛔ 不是 0（`alpha: 0` ＝「看不見但還在算粒子」，正是 #262 要禁的那件事）。⭐ 可反駁：哪天有一支技能真的要調淡它的常駐特效，填上去這一列就 stale 而紅。",
  },
  // ═══ GH#649 球體/蝗蟲群 第 1 批 · 2026-08-24 —— **機制先行，內容在第 2 批** ═══
  // ⭐ 這兩格是這一批**刻意**的形狀（第〇·五守則：引擎做機制、JSON 做技能）：
  //    原作 823 列特效證據裡，238 具 dummy 是「定點不動播動畫」（擋 60 支）、
  //    285 次掛件是「掛在施法者骨頭上」（擋 43 支）。⇒ 先做兩個機制，
  //    ⛔ 不逐支改內容（那是 103 支的內容批，排在 #649 的第 2 批）。
  // ⚠️ 用 `landing` 而不是 `default-live` 是刻意的:30 天後它會**再紅一次** ——
  //    第 2 批沒做完的話，這條線不可以安靜地消失。
  // ⭐ 可反駁：第 2 批一落地，這兩列就會 stale 而紅，⇒ 刪掉它們就是那時候的修法。
  // （`path=static` 那一列在 2026-08-25 被自己的 stale 斷言點名刪掉 ——
  //   GH#688 Phase 5 pilot 的 09-04 沿線火柱節點是第一個逐字寫 `path:"static"`
  //   的內容採用者，豁免照規矩回收。）
  "enum:abilities.effects[]#spawnVfx.at=bone": {
    status: "landing",
    since: "2026-08-24",
    why: "一次性掛骨頭（`90fb4167`）—— 同上：機制＋出貨鏈守衛已在（含「替身骨架沒有那根骨 ⇒ 退回胸口仍然畫」那一格），43 支的內容批在 GH#649 第 2 批。",
  },
  // ═══ 2026-08-23 · M2 狀態閘 + M5 紮根/主屬性覆寫（變身態退場的前提）═══════
  // ⭐ 這三格（`whileStatus` / `immobile` / `primaryAttribute`）是 GH#599「變身態
  //    退場」量出來的**擋路機制**：19 對變身裡有 4 對的全部差別住在
  //    「換一整份英雄卡」才拿得到的東西上 —— 被動的形態閘（20-01 風王結界的
  //    100% 暴擊、79-002 虛化的 AD 翻倍、70-00 紮根的力量+10）、紮根那一格布林、
  //    以及 STR→INT。機制不在，「退場」的答案結構性地只能是「不能」。
  // ⛔ **內容改寫刻意不在這一批**：哪幾對真的退場是 owner 要勾的（第零守則⑧
  //    排序是他的權力），而動一支出貨技能就會改變那一場比賽。
  // ⚠️ 用 `landing` ⛔ 不是 `default-live`：30 天後它會**再紅一次** ——
  //    如果那時候一對都沒退，這幾格就該被承認為死機制並移除，⛔ 不可以靜靜留著。
  // ⚠️ `primaryAttribute` 還有第二層邊界，量到的：它唯一的消費端是
  //    `perLevelBonusFor` 的 `appliesTo:"primary"/"nonPrimary"`，而出貨的
  //    `content/config/per-level-bonus.json` 是 `"all"` ⇒ **今天連英雄卡上那一格
  //    `attributes.primary` 本身也不影響任何數字**。這一格能不能改變比賽，
  //    取決於 owner 有沒有把那個模式打開。
  "field:abilities.effects[]#applyBuff.immobile": {
    status: "landing",
    since: "2026-08-23",
    why: "M5【紮根】剛落地（GH#599）。⛔ 內容改寫是 owner 勾完「哪幾對變身態退場」之後的另一批 —— 動一支出貨技能就會改變那一場比賽。30 天後再紅一次是刻意的。",
  },
  "field:abilities.effects[]#applyBuff.primaryAttribute": {
    status: "landing",
    since: "2026-08-23",
    why: "M5【主屬性覆寫】剛落地（GH#599）。⚠️ 而且它唯一的消費端 `perLevelBonusFor` 在出貨設定下走 `appliesTo:\"all\"` ⇒ 今天連英雄卡的 `attributes.primary` 都不影響任何數字。要不要打開那個模式是 owner 的旋鈕。",
  },
  "field:abilities.passive.ranks[].immobile": {
    status: "landing",
    since: "2026-08-23",
    why: "同 `applyBuff.immobile` —— 70-00 紮根要的是「天生技 rank 配狀態閘」這一條路，⛔ 不是再換一份英雄卡。內容改寫等 owner 勾。",
  },
  "field:abilities.passive.ranks[].primaryAttribute": {
    status: "landing",
    since: "2026-08-23",
    why: "同 `applyBuff.primaryAttribute`。70-00 紮根形態的 STR→INT 就住在這一格上。",
  },
  "field:abilities.passive.ranks[].whileStatus": {
    status: "landing",
    since: "2026-08-23",
    why: "M2 狀態閘剛落地（GH#599）。⭐ 79-04 卍解**今天已經**同時掛 `championForm` 與 `statusId:\"bankai\"`，所以 `godie-h01n.ex` 換成這一格是零風險的一行 —— ⛔ 但那一行屬於「退場」那一批，而退場是 owner 要勾的。",
  },
  "field:augments.immobile": {
    status: "landing",
    since: "2026-08-23",
    why: "第十格授予落在**四個授權面**上（道具／天生技 rank／增益卡／applyBuff），⛔ 不是四份程式。增益卡這一面今天沒有內容用它，與上面同一批。",
  },
  "field:augments.primaryAttribute": {
    status: "landing",
    since: "2026-08-23",
    why: "同 `augments.immobile` —— 一份轉發表落在四個授權面上，增益卡這一面等內容。",
  },

  // ═══ 2026-08-23 · M4 攻擊型態覆寫（同一批「變身態退場」的擋路機制）═════════
  // ⭐ 第十二格授予。逐對量下來有 **2 對**變身的差別裡包含「這具身體是近戰還是
  //    遠程」（`godie-n00p` 妖狐 melee→ranged · `godie-o02l` 皮卡 ranged→melee），
  //    而 `attackType` 在此之前是 `ChampionDef` 的**必填欄位** ⇒「變成遠程」
  //    結構性地只有換一整份英雄卡（＝變身）做得到。
  // ⛔ 那 2 對**同時**還缺 M3（身體換模型），所以它們的內容要等兩個機制都在 ——
  //    ⭐ 這一批做的就是那兩個機制，⛔ 內容（哪一支技能填哪一格）是 M1 那一批
  //    在 `content/config/form-visuals.json` 與技能 JSON 上填的東西。
  // ⚠️ 用 `landing` ⛔ 不是 `default-live`：出貨英雄卡上的 `attackType` **不是**
  //    這一格的預設值 —— 它是「沒有人覆寫」時的答案，而覆寫本身零採用就是零。
  //    30 天後再紅一次是對的：那時要嘛 M1 那一批填了它，要嘛它該被承認為死機制。
  "field:abilities.effects[]#applyBuff.attackType": {
    status: "landing",
    since: "2026-08-23",
    why: "M4【攻擊型態覆寫】的機制剛落地（GH#599）。⭐ 內容由 **M1 那一批**填（`godie-n00p` 妖狐 melee→ranged 與 `godie-o02l` 皮卡 ranged→melee 的變身技能），⛔ 不是「還沒收」：那 2 對同時還需要 M3（一格狀態換 modelKey），兩個機制都在了才動得了它們，而動一支出貨技能會改變那一場比賽 —— 排序是 owner 的權力（第零守則⑧）。`applyBuff` 這一面是「大招期間變成遠程 8 秒」唯一寫得出來的形狀，到期由那份 buff 自己收掉。",
  },
  "field:abilities.passive.ranks[].attackType": {
    status: "landing",
    since: "2026-08-23",
    why: "同上，天生技 rank 那一面 —— 一份 `sourceGrants()` 轉發落在四個授權面上，⛔ 不是四份程式。妖狐／皮卡那兩對如果做成「變身狀態常駐」而不是限時 buff，寫的就是這一格。內容由 M1 那一批填。",
  },
  "field:augments.attackType": {
    status: "landing",
    since: "2026-08-23",
    why: "同上，三選一增益卡那一面。「這一場你的普攻變成遠程」是一張顯而易見的卡而且零程式；今天沒有任何一張三選一卡用它，與上面兩格同進退。",
  },

  // ═══ 2026-08-22 · `condition.is` 的三個實體類別（機制先落地）═══════════════
  // ⭐ 這三格是**條件葉**的實體類別（守衛塔／小怪／召喚物），機制在引擎上已經通了，
  //    ⛔ 但出貨內容裡還沒有一支技能寫「只對守衛塔／只對小怪／只對召喚物」。
  // ⚠️ 用 `landing` ⛔ 不是 `default-live`：30 天後它會**再紅一次** ——
  //    一個沒有任何內容在用的條件葉，跟一個壞掉的條件葉在畫面上長得一模一樣。
  //    ⇒ 到期時要嘛有技能用了它（豁免自動失效），要嘛承認它是死機制並移除。
  "enum:abilities.effects[]#applyBuff.condition|0|2.is=guardian": {
    status: "landing",
    since: "2026-08-22",
    why: "條件葉的實體類別剛落地，出貨內容還沒有一支技能用它。⚠️ 30 天後要嘛有內容採用、要嘛承認它是死機制 —— ⛔ 不可以靜靜留著。",
  },
  "enum:abilities.effects[]#applyBuff.condition|0|2.is=mob": {
    status: "landing",
    since: "2026-08-22",
    why: "條件葉的實體類別剛落地，出貨內容還沒有一支技能用它。⚠️ 30 天後要嘛有內容採用、要嘛承認它是死機制 —— ⛔ 不可以靜靜留著。",
  },
  "enum:abilities.effects[]#applyBuff.condition|0|2.is=summon": {
    status: "landing",
    since: "2026-08-22",
    why: "條件葉的實體類別剛落地，出貨內容還沒有一支技能用它。⚠️ 30 天後要嘛有內容採用、要嘛承認它是死機制 —— ⛔ 不可以靜靜留著。",
  },

  // ═══ GH#445 冷卻五級距 · GH#447 傷害五級距 2026-08-20 ═════════════════════
  // ⭐ **機制先落地，內容改寫是分開的一批**（而且是一批**平衡改動**）。
  //    冷卻：出貨 358 支有冷卻的技能裡，單體 38% / 範圍 49% 落在 owner 給的
  //    格點之外，中位 55 秒；傷害：中位 532，而級距的「中」是 2500。
  //    ⇒ 把 461 支一次收進級距**會改變每一場比賽**，那是 owner 要勾的事
  //    （第零守則⑧：排序是 owner 的權力），⛔ 不是這一批順手做掉。
  // ⚠️ 用 `landing` 而不是 `default-live` 是刻意的：30 天後它會**再紅一次**，
  //    而那正是我們要的 —— 這一批不做完，這條線不可以安靜地消失。
  // ═══ GH#602 無上限施法距離 2026-08-23 ═════════════════════════════════════
  "field:champions.abilities.*.rangeUnlimited": {
    status: "landing",
    since: "2026-08-23",
    why: "「無上限施法距離」（owner 2026-08-23 的殭屍王 [leap吸血]）住在 **standalone** 技能文件上（`abilities.rangeUnlimited` 那一格已經被採用），而英雄內嵌的那一份鏡像只有 Q/W/E/R —— 今天沒有任何一位英雄的四格技能是「全場」的。⭐ 可反駁：哪一天有一支英雄大招真的是全場（原作那兩支 29.33 / 24 的候選就在 GH#310 的清單上），填上去這一列就會 stale 而紅。⛔ 不要為了讓它變綠去替某一支技能填這一格 —— 那會**改變每一場比賽**。",
  },
  // ═══ GH#607 橫放 beam 的第三個軸 2026-08-23 ═══════════════════════════════
  "enum:models.fxLongAxis=z": {
    status: "default-live",
    why:
      "`fxLongAxis` 是**三選一的座標軸**，⛔ 不是一個功能 —— `x` 與 `y` 都有模型在用" +
      "（`imported.fireblast` = x、`imported.netherstrike` = y、`imported.darkraor` = x）。" +
      "⭐ 而這一格的值是 **`tools/beam-orient/scan.py` 從 `.glb` 的幾何推導**出來的" +
      "（bbox 最長軸 ＋ 偏心方向兩個訊號），⛔ 不是人挑的 ——" +
      "所以「沒有任何一份模型的長軸是 z」是一個**量到的事實**，⛔ 不是漏填。\n" +
      "⚠️ ⛔ **不要為了讓它變綠去替某一份模型填 `z`** —— 那會讓那支技能的光束轉 90 度。\n" +
      "⭐ 可反駁：哪一天匯入一份長軸真的沿 z 的 `.glb`，`pnpm beam:write` 會提案填它，" +
      "這一列就會從 0 筆變成有採用而自動失效。",
  },
  // ═══ GH#688 Phase 4 機制② 模型級透明度 2026-08-25 ═════════════════════════
  "field:models.fxAlpha": {
    status: "landing",
    since: "2026-08-25",
    why:
      "蝗蟲群掃描（locust_scan/synthesis 缺口表）量到 alpha 是唯一「兩側都空白」的欄：" +
      "原作 w3u 結構上沒有 alpha 欄（ucua 全檔 0 次），它只存在 runtime 的 57 個 " +
      "SetUnitVertexColorBJ 呼叫點。這一格是**模型級恆定半透明**那一半（幻影 50% 那一族），" +
      "機制先行；採用者要等 57 個呼叫點的逐技能接線批（GH#688 Phase 6 的 alpha 掃描）" +
      "把「哪幾具 dummy 是恆定半透明」從 JASS 撈出來 —— ⛔ 不要為了讓它變綠自己挑一具調透明。",
  },
  // ═══ 週期領域機制落地 2026-08-23 ══════════════════════════════════════════
  "field:abilities.effects[]#delayed.anchor": {
    status: "landing",
    since: "2026-08-23",
    why:
      "「圈跟著人走」那一格（`tpl-periodic-field` 的機制那一半）。⭐ 機制**這一批才落地**，" +
      "而內容那一半刻意留給下一輪：全技能形狀掃描量到 **44 支技能的說明宣稱「迴圈」** " +
      "而 JSON 一格迴圈機制都沒有 ⇒ 那 44 支是這一格的採用者。\n" +
      "⛔ **一次改 44 支而機制沒被玩過是最貴的錯法** —— 先用兩三支驗過再推廣。\n" +
      "⭐ 可反駁：那 44 支接上去之後這一列就會有採用而自動失效；" +
      "⛔ 而如果三個月後它還在 0 筆，那代表那個機制沒有人要，該刪的是機制不是這一列。",
  },
  // ═══ GH#606 移動特效離地高度 2026-08-23 ═══════════════════════════════════
  // ⚠️ 前綴 `#chainLightning.amount.*` 會騙人 —— `amount` 是共用的 `zScaling`，
  //    普查給共用子樹的命名是「字母序第一個宣告它的 effect kind」。理由完整
  //    寫在下面 GH#451 那一段，⛔ 不要以為這只影響連鎖閃電。

  // ═══ 五級距全轉 2026-08-21（owner ①「B 全轉」）══════════════════════════
  // ⭐ 上面那三筆 `landing` 豁免在這一批**兌現了**（cooldownTier 358 支、
  //    damageTier 203 支、英雄內嵌 70 份）—— 所以它們被刪掉，⛔ 不是留著。
  //
  // ⚠️ 但**梯子的上半截仍然是零**，而那不是漏掉，是量到的事實：
  //    出貨語料的滿階招牌傷害中位數落在 600 這一格附近，snap 之後
  //    **極小 181 / 小 33 / 中 0 / 大 0 / 極大 0**。要有一支技能填「中」(3000)，
  //    它現在的卡面基礎傷害得在 2250 以上 —— 全庫最高的一支是 1800。
  // ⇒ 零在這裡代表「**這一級還沒有任何一支技能夠格**」，那是 owner 的平衡題
  //    （他要不要把某幾支拉上去），⛔ 不是一個沒接好的機制：同一個
  //    `resolveDamageTier` 已經有 203 份文件在走，路是通的。
  // ⚠️ 用 `landing` 而不是 `default-live`：30 天後再紅一次，逼我們回來問
  //    「owner 到底要不要有 3000 以上的技能」。⛔ 不可以安靜地消失。

  // ═══ GH#451 連鎖閃電 2026-08-20 ═══════════════════════════════════════════
  // ⚠️ 先讀這一段再讀下面十二列,否則你會以為 `damage` 的三格被弄丟了。
  //
  // ⭐ **`#chainLightning.amount.*` 這個前綴會騙人 —— 它不是 chainLightning 專屬的。**
  //    `amount` 是**共用的** `zScaling`(schema/common.ts),`damage`・`dot`・
  //    `damageArea`… 全部指向同一棵子樹。普查給共用子樹的命名是「**字母序第一個
  //    宣告它的 effect kind**」,而 `chainLightning` 今天排到了 `damage` 前面
  //    → 整棵 `amount.*` 換了前綴。分母 `3/342` 就是證據:342 是**整個 union**
  //    的 amount 站點數,⛔ 不是四份 chainLightning。
  //    ⇒ 下面三列與被它們取代的 `#damage.amount.attrRatios[].*` **是同一件事**,
  //      `why` 逐字保留(⛔ 只有前綴改了);STALE 那半邊要求舊鍵消失,所以是**搬家**
  //      不是刪除 —— 知識不可以無聲消失。
  //    ⚠️ 下一次有人加一個字母序更前面的 effect kind,這三列會**再搬一次家**。
  //      那不是缺陷,照樣改前綴即可。
// 🔴 2026-08-21 —— **`attrRatios` 那三列退場**，而它們是被 owner 的裁決收走的，
  //    ⛔ 不是「修好了」。
  //
  //    > 「檢查所有技能 原本有屬性額外傷害的部分**都換成 AP**」
  //
  //    ⇒ `pnpm apconv:build` 把 01-04 超究武神霸斬（唯一一支用 `attrRatios` 表達
  //      「屬性額外傷害」的技能）換成了 `ratios[{stat:"ap"}]`，於是整棵
  //      `amount.attrRatios` 的 reach 從 2 掉到 **1**，低於 `MIN_REACH 3`
  //      ⇒ 普查**不再對它宣稱任何事**，留著那三列就是三句謊話（STALE 那半邊會紅）。
  //    ⭐ 三段 `why` 的內容（為什麼 agi/int 是零、`basis:"base"` 對應哪一個 JASS 讀法）
  //      逐字另存在 `docs/legacy/_ap-conversion-superseded.md`，
  //      ⛔ 知識不可以無聲消失 —— 這裡刪的是**豁免**，不是那份知識。
  //    ⚠️ 唯一還在用 `attrRatios` 的是龍神槍 `godie-i018`（on-hit 閃電，讀總力量），
  //      它**沒有**被換算：那是道具的被動，卡面沒有「力量*N」那種宣稱。

  // ── 以下九列才是真的 chainLightning 自己的欄位 ──────────────────────────
  // 出貨兩支(86-04 打雷絕招 godie-o00k.r / 65-04 天譴 godie-udea.r,各含 champion
  // 鏡像共四份)都是 `shape:"circle"`,而 owner 2026-08-20 的裁決把這支技能的身分
  // 定在「**隨機選擇單位、遞減、逐發有時間差**」上(`decay` 0.9 + `jumpIntervalSec`
  // 0.05),所以下面這些格子的零全部是**兩支技能不需要**,⛔ 不是機制沒接線 ——
  // `sim/effects/variants/chainLightning.ts` 每一格都真的讀。
  "enum:abilities.effects[]#chainLightning.shape=single": {
    status: "landing",
    since: "2026-08-20",
    why: "`single` = 原作那顆**單獨**的鏈鎖閃電(A04H,說明「傳遞16次」),`circle` = 圈內每個敵人各起一條。出貨那兩支的 JASS 都是後者(所以 owner 說「聚集越多敵人威力越強」),⛔ 這不是預設值在服務它 —— `shape` 是**必填**,寫 `single` 與寫 `circle` 一樣容易。零純粹代表**還沒有一支被移植成單體鏈**。**到期**:任何一支單體連鎖(原作 A04H 直接移植)填了它。",
  },
  "enum:abilities.effects[]#chainLightning.centre=target": {
    status: "landing",
    since: "2026-08-20",
    why: "起始圈的圓心。出貨兩支分別用 `caster`(天譴,JASS 讀施法者位置)與 `point`(打雷,落點),`target` 要等一支「**指定某個單位**、以他為圓心炸開連鎖」的技能。⛔ 三個成員走同一行(`variants/chainLightning.ts` 的圓心解析),寫上去就生效。**到期**:第一支指定型連鎖。",
  },
  "field:abilities.effects[]#chainLightning.maxTotalJumps": {
    status: "default-live",
    why: "**保險絲,不是平衡旋鈕**。留空 = `DEFAULT_CHAIN_MAX_TOTAL_JUMPS` = `CHAIN_MAX_TOTAL_JUMPS`(480 = 20 來源 × 24 跳 = 兩個上界都拉滿),⭐ 它**刻意不咬人**:出貨兩支是 20 × 16 = 320,本來就在下面。⇒ 明寫它今天是位元級的 no-op。⛔ 這不是「沒有上限」—— 缺席時的上限是有限的 480,而那正是它存在的目的(擋 O(來源數×跳數) 落在同一 tick)。**到期**:某一支需要比 480 更緊的保險絲。",
  },
  "field:abilities.effects[]#chainLightning.revisit": {
    status: "default-live",
    why: "留空 = 同一條連鎖裡**不能**跳回同一個人 —— 那正是原作 A04H 的行為,也是出貨兩支要的。⚠️ 不同連鎖打到同一個人一律允許(那才是「越多單位越痛」),所以這一格與 owner 那句裁決無關。⭐ 機制不在零:`variants/chainLightning.ts` 的終止性證明明寫「`revisit: true` 也停得下來」(jumps 與 maxTotalJumps 兩個都嚴格遞增)。",
  },
  "field:abilities.effects[]#chainLightning.canCrit": {
    status: "default-live",
    why: "逐字沿用 `damage.canCrit` 的判例:省略 = 不暴擊 = 出貨行為,而同一條 `sim/combat/critStrike.ts` 管線在 `damageArea.canCrit`・`damageLine.canCrit` 上都有客戶 ⇒ **機制不在零**。90 支重製稿裡 11 處[暴擊]逐字讀都是**普攻**暴擊(走 critStrike grant)。",
  },
  "field:abilities.effects[]#chainLightning.condition": {
    status: "default-live",
    why: "`EFFECT_COMMON_SHAPE` 的共用條件葉 —— 省略 = 無條件觸發。出貨兩支是絕招,按下去就放。⭐ 機制**遠遠不在零**:同一顆條件葉在 `applyBuff`・`damage` 等處都有客戶(第〇·五守則的那個條件葉)。",
  },
  "field:abilities.effects[]#chainLightning.onHitTargetsMode": {
    status: "landing",
    since: "2026-08-20",
    why: "逐字沿用 `damageLine.onHitTargetsMode`:batch(預設,下一段收到整群人一次)還是 perTarget。⛔ 三個 kind 在這一族上必須同名同語意。出貨只有天譴帶 `onHitTargets`(spendMana),而它要的正是 batch。⭐ 圓形那一半(`damageArea`)已於 2026-08-18 落地並拿掉豁免。**到期**:某一支連鎖要「每跳各自結算一次下游」。",
  },
  "field:abilities.effects[]#chainLightning.runOnEmptyHit": {
    status: "landing",
    since: "2026-08-20",
    why: "逐字沿用 `damageArea.runOnEmptyHit`:一個人都沒打到時要不要照樣跑下游。省略 = false = 今天什麼都不會發生的那個語意。",
  },
  // ── GH#373 / GH#374 2026-08-18：5 支主動天生技接上真的機制之後浮出來的三格 ──
  // ⭐ 三格都是**同一個形狀**：一個機制在某個授權面上第一次有內容用它，於是
  //    「整族零採用」被級聯規則藏起來的那幾格單獨浮出來（同 GH#333 的判例）。
  //    ⛔ 三格都不是「機制沒接線」。
  "field:abilities.effects[]#taunt.condition": {
    status: "landing",
    since: "2026-08-18",
    why: "GH#373 —— 86-00 裝可愛與 57-00 四次元口袋是**技能側第一次**用 `taunt`（在此之前只有道具：鍊金術之盾／戰鬥力探測器）。於是同一族裡沒被用到的那幾格從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 處理器與 schema 都在（`sim/effects/taunt.ts`），是還沒有一支技能需要「只有在某個條件成立時才嘲弄」。**到期**：任何一支帶條件的嘲弄填了它，這一列會被 STALE 那半邊叫，刪掉即可。",
  },
  "field:augments.vision": {
    status: "landing",
    since: "2026-08-18",
    why: "GH#373 —— [隱形／真視] 變成 `SOURCE_GRANT_SHAPE` 的一格（53-00 空間穿梭「持續 20 秒」與 30-00 攝影機需要**限時**的 vision，而它在此之前只掛得到道具與天生技 rank，兩者都是永久）。⛔ 逐字沿用 `block`・`critStrike`・`penetration`・`typeStreakImmunity` 的判例：schema 一次補齊四個授權面，內容今天走的是 `applyBuff`（兩支天生技）與 `items.vision`（至尊魔戒／晨曦之光）。增益卡那一面是零，而那是誠實的 —— 三選一還沒有一張「這一場你看得見隱形」。**到期**：任何一張增益卡填了它。",
  },
  // ── [EX∅ 根源] 2026-08-18 這一批新開的授權面 ─────────────────────────────
  // ⭐ 五件寶具解鎖的三個機制**都已經有內容在用**（`items.typeStreakImmunity` ←
  //    slime-suit、`items.auras[].scaleByNearby` ← sasumata、`carry`/`convertTeam`
  //    兩個 kind ← nezuko-box / master-ball），所以那四個鍵**沒有**豁免，也不該有。
  //    下面這幾格是**同一個機制的其他授權面**：schema 一次補齊四面（道具／天生技
  //    rank／增益卡／applyBuff）是刻意的（走 block・critStrike・penetration 的同一個
  //    判例），而內容今天只走道具那一面。
  "field:abilities.effects[]#applyBuff.typeStreakImmunity": {
    status: "landing",
    since: "2026-08-18",
    why: "GH#355 [EX∅ 根源] 史萊姆裝把「連續同型傷害後免疫該型別」做成 `SOURCE_GRANT_SHAPE` 的一格，於是它**一次出現在四個授權面**（道具／天生技 rank／增益卡／applyBuff）—— 逐字沿用 `block`・`critStrike`・`penetration` 的判例，⛔ 不是四份各自的實作。內容今天只走道具那一面（`items.typeStreakImmunity` = slime-suit）。⛔ 這不是機制沒接線：閘在 `sim/combat/damage.ts`，`sourceGrants()` 四面共用同一條轉發。**到期**：任何一張「一段時間內免疫某型別連擊」的 buff 填了它，這一列會被 STALE 那半邊叫，刪掉即可。",
  },
  "field:abilities.passive.ranks[].typeStreakImmunity": {
    status: "landing",
    since: "2026-08-18",
    why: "同上（天生技 rank 那一面）。⚠️ 這一面是**最可能自然變綠**的一個 —— 一支「越挨打越硬」的天生技就是這一格。⛔ 若三十天後仍是 0，正確的處置是問「有沒有英雄該拿這個」，不是延長豁免。",
  },
  "field:augments.typeStreakImmunity": {
    status: "landing",
    since: "2026-08-18",
    why: "同上（三選一增益卡那一面）：schema 一次補齊四個授權面是刻意的判例，內容今天只走道具那一面（slime-suit）。⛔ 這不是機制沒接線 —— 增益卡與道具共用同一支 `sourceGrants()`，一張「這一回合免疫連續同型傷害」的卡片今天就寫得出來。**到期**：owner 的下一批增益卡填了它。",
  },
  // ⭐ GH#656【選擇性狀態免疫】—— 第十三格授予。判例與上面 `typeStreakImmunity`
  //    相同，⛔ 但**授權面是三個不是四個**：`SOURCE_GRANT_SHAPE` 展開在
  //    `zAbilityPassiveRank` / `zAbilityPassive`(whileOn) / `applyBuff` / `augment`
  //    上，而 **`item@1` 逐格手列它要的授予、⛔ 不展開那份形狀**（實測：
  //    `items.statusImmunity` 根本不是一個註冊鍵）。
  //    ⇒ 道具那一面（抗性靴／淨化護符）是**刻意留白**的：一個沒有任何內容的
  //    授權面就是 S8 本身，等第一件抗控裝真的要做的那天再開它一格。
  //    內容今天走**天生技 rank** 那一面（殭屍王的內建天生技
  //    `godie-zombieking.passive`，所以 `abilities.passive.ranks[].statusImmunity`
  //    **沒有**豁免，也不該有）。下面兩列是其餘兩面。
  "field:abilities.effects[]#applyBuff.statusImmunity": {
    status: "landing",
    since: "2026-08-24",
    why: "GH#656 owner「殭屍王**免疫負面狀態** 包含暈眩緩慢詛咒致盲 但可被吸血、暴擊、淨化跟其他技能標記與疊層」。落地成 `SOURCE_GRANT_SHAPE` 的一格 ⇒ 一次出現在四個授權面。內容今天只走天生技 rank 那一面（常駐身分）。⛔ 這不是機制沒接線：消費端 `sim/effects/applyStatus.ts` 走 `StatsComp.sources` 而不問 kind，四面共用同一支 `sourceGrants()`。**到期**：第一支「接下來 N 秒免疫減速／免疫暈眩」的限時 buff 填了它 —— 那是這一面最自然的形狀（LoL 的水銀鞋），這一列會被 STALE 那半邊叫，刪掉即可。",
  },
  "field:augments.statusImmunity": {
    status: "landing",
    since: "2026-08-24",
    why: "同上（三選一增益卡那一面）。⛔ 不是接線問題 —— 一張「這一場你不吃減速」的卡片今天就寫得出來。**到期**：owner 的下一批增益卡填了它。",
  },
  // ⭐ 三格都是 v0.22.0 的新機制，而它們零採用的**理由各不相同** —— ⛔ 不要當成同一批放掉。
  "field:abilities.effects[]#delayed.advance": {
    status: "landing",
    since: "2026-08-19",
    why: "GH#393 —— 34-04 奧義˙蒼龍破的「沿向量分段推進」。⚠️ 這一格的零採用是**普查看不到**，不是沒有內容：蒼龍破走 `template.ref: tpl-traveling-wave`，`advance` 是**展開時**才長出來的，而這支普查掃的是磁碟上的原始 JSON（同 `abilityNoOpEffects` 檔頭記載的「106 支技能的 effects 住在 template.ref 裡，掃原始 JSON 會得到假的空技能」）。實測展開結果：`delayed{count:12, advance{stepDist:1.23, dir:\"facing\"}, hitOncePerTarget:true}`。⛔ 這不是機制沒接線 —— `sim/effects/delayed.ts` 有處理器、`travelingWaveAdvance.test.ts` 跑真的 SimWorld 驗過它。**到期**：任何一支**不經模板**直接寫 `delayed`+`advance` 的技能，或普查學會展開模板（見 GH#413）。",
  },
  "field:abilities.effects[]#delayed.hitOncePerTarget": {
    status: "landing",
    since: "2026-08-19",
    why: "同上（同一個模板展開出來的第二格）。它的存在理由是**平衡**：12 段各結算一次，若不去重，一個站在線上不動的人會挨 12 份傷害，而卡片寫的是 600。⛔ 所以它跟 `advance` 是綁在一起的，不會單獨變綠。",
  },
  "field:arenas.decor[].y": {
    status: "landing",
    since: "2026-08-19",
    why: "GH#386 —— `decor[]` 在此之前**根本沒有 y**（`ArenaScene.placeInstance()` 寫的是 `root.position.set(x, 0, z)`，那個 `0` 是字面值），所以任何「架在別的東西上面」的構件（屋頂／橫梁／天花板）只會平躺在地板 —— 6 件 C 級 CC0 素材裡有 4 件卡在這個缺口上。⭐ **這一版刻意「機制上線、內容 0 筆」**：用 `.optional()` 而非 `.default(0)`，讓 13 張出貨 arena 的 JSON **逐位元組不變**，也讓「沒填」真的是沒有這個 key。⚠️ 第一支填它的內容那一版**必須完整重建映像**（⛔ 不可 `--content-only`）。**到期**：任何一張 arena 把那 4 件屋頂類架起來。",
  },
  "field:maps.backgroundProps[].y": {
    status: "landing",
    since: "2026-08-19",
    why: "`arenas.decor[].y` 的**來源側孿生欄位** —— 出貨 arena 是 `compileMap()` 從 `content/maps/*.json` 產生的，所以高度要能表達必須兩邊都有這一格，否則編譯時就掉了。零採用的理由與去向逐字同 `field:arenas.decor[].y`（機制上線、內容 0 筆、13 張 arena JSON 逐位元組不變）。**到期**：同那一列 —— 它們會一起變綠。",
  },
  "field:maps.landmarkProps[].y": {
    status: "landing",
    since: "2026-08-19",
    why: "同上（地標道具那一族）。⚠️ 這一族**比背景道具更可能先變綠**：地標本來就常是「架在台座／柱頂上」的東西，而那正是缺 y 時唯一表達不出來的形狀。",
  },
  "field:abilities.passive.ranks[].auras[].scaleByNearby": {
    status: "landing",
    since: "2026-08-18",
    why: "GH#355 [EX∅ 根源] 討伐叉把「這一圈的強度隨範圍內人數變化」做成 `zAuraDef` 的一格，而 `zAuraDef` **同時**被 `item@1.auras[]` 與 `ability@1.passive.ranks[].auras[]` 用 —— ⛔ 掛在圈上不掛在 `zStatModifier` 上是刻意的（後者會同時開放給沒有「範圍」概念的四個授權面）。道具那一面已經有採用者（sasumata），天生技靈氣那一面還沒有。⛔ 這不是機制沒接線：`auraSystem` PASS 1 不分來源，兩面走同一段程式。**到期**：任何一支「隊友越多光環越強」的天生技填了它。",
  },

  // ── 特效方位（GH#366 / #377）───────────────────────────────────────────
  // ⭐ 這一族**只豁免一半**，而那一半是刻意的。`orient` 三格裡：
  //    · `swirlDegPerSec` → 7 份 tornado 文件在用（龍捲風的旋轉）
  //    · `pitchDeg`       → `fx.prim.{holy,lightning}.beam-flat` 在用
  //                         （owner 2026-08-18 點名的「橫放的柱狀砲」），
  //                         layer 那一面則是 15-01 雷神槍 / 45-03 千鳥
  //    · `yawFrom`        → `fx.prim.{holy,lightning}.beam-flat`（GH#377 落地）
  //    · `yawDeg`         → 下面這兩列。⛔ 它**永遠不該**被靜態填成一個方向。
  "field:vfx#vfx@1.orient.yawDeg": {
    status: "runtime-authored",
    why:
      "⭐ GH#377 已落地（2026-08-18）：`yawDeg` 現在由**施法當下**寫進去 —— `VfxSystem` 的 `abilityCast` 用 `yawDegToward(caster→目標/落點)` 算出世界方位角，`artParams.applyAimYaw` 把它折進**這一格**（走 `scale`/`tint`/`alpha` 同一條 `applyArtParams` 路徑，⛔ 不是平行管線）。所以磁碟上的 0 是**正確且永久**的：靜態寫一個值的意思是「這一招永遠朝世界的那個方向噴，不管你瞄哪裡」—— 那是一個**會發生但發生錯方向**的效果。內容要宣告的是 `orient.yawFrom: \"aim\"`（已被 `fx.prim.{holy,lightning}.beam-flat` 採用），`yawDeg` 只在需要**偏移**（180 = 往身後噴的塵尾）時才填。守衛：`apps/client/src/vfx/aimYaw.test.ts`（真的跑 `VfxSystem.handleEvent`，讀 Babylon 粒子的世界方向）。",
  },
  "field:abilities.vfxLayers[].facingDeg": {
    status: "default-live",
    why:
      "GH#377 落地之後這一格的語意變了，所以豁免的理由也跟著變：**方位現在有一個程式預設**（`orient.yawFrom:\"aim\"` 的文件每次施法都朝目標），而 `facingDeg` 只是疊在它上面的**偏移** —— 一把三段的斬擊 = 同一份 doc 的 −25 / 0 / +25 三層。零採用＝「還沒有哪一支技能需要偏離瞄準方向」，⛔ 不是機制沒接線（`abilityLayers.artParamsOf` → `applyArtParams` → `applyAimYaw` 是同一條路，`playLayeredCast` 刻意在套完層覆寫**之後**才疊瞄準）。⚠️ 對照組在隔壁：`pitchDeg` 沒有豁免，因為仰角是真的靜態性質（15-01 雷神槍 / 45-03 千鳥在用）。**到期**：任何一支扇形斬擊或需要偏角的技能填了它。",
  },

  // ── 場地場景特色（GH#362）─────────────────────────────────────────────
  "enum:arenas.scenery.lighting.wave=none": {
    status: "default-live",
    why: "「光不會動」是**程式預設**（`DEFAULT_SCENERY_LIGHTING.wave === \"none\"`），而且它是每一張**沒有宣告 `scenery`** 的場地實際跑的那一條路 —— 出貨前 13 張全部走它。owner 2026-08-18 明說「不是靜態不會變動的光」，所以 13 張出貨場地**刻意**一張都不填 `none`：這一格的零採用正是這條需求被滿足的證據。⛔ 不要為了讓這一列消失而把某張圖改成 `none`。**到期**：`none` 不再是 schema 預設的那一天（那時它就變成一個真的沒人用的選項）。",
  },

  // ── 具名標記（marks）家族裡沒被用到的那幾格 ─────────────────────────────
  // ⚠️ 這兩列**不是**這一批造成的：2026-08-18 之前 `abilities.marks[]` 唯一的採用者
  //    是 `godie-hapm.passive`（十二道試煉），它填 `resetOn:"match"` 且沒有 `roundDelta`
  //    ⇒ 這兩格從標記上架那天起就是 0，只是一直沒有人替它們寫豁免。
  //    這一批（millennium-puzzle 用 `resetOn:"round"`）只是讓 `round` 那一格變綠。
  "enum:abilities.marks[].resetOn=never": {
    status: "default-live",
    why: "三個重置語意裡的第三個。`match`（十二道試煉：一場比賽用完就沒有）與 `round`（千年積木：每回合補回去）都有採用者，而 `never` 的意思是「**連比賽結束都不重置**」—— `SimWorld` 一場比賽一個，所以它在遊戲裡與 `match` 逐位元同義，只有跨場持久化真的存在時才會分岔。⛔ 不要為了讓這一列消失而把某張卡改成 `never`：那會讓兩個語意在內容裡看起來是兩件事，而引擎裡是同一件。**到期**：跨場（meta）標記真的做出來的那一天。",
  },
  "field:abilities.marks[].roundDelta": {
    status: "default-live",
    why: "「每個回合開始自動加/減幾層」。省略 = 0 = 回合邊界不自動變動，而今天兩份標記文件要的都正是這個：十二道試煉是**用掉就沒了**（`resetOn:\"match\"`），千年積木是**整份補滿**（`resetOn:\"round\"`）—— 兩者都不是「每回合慢慢長回來」。⛔ 這不是機制沒接線（`resetMarksForRound()` 讀它，守衛 `apps/game-server/src/match/markRoundReset.test.ts`），是還沒有一張卡要那種節奏。**到期**：任何一張「每回合回復一次充能」的卡。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].on=onLethalDamage": {
    status: "default-live",
    why: "⚠️ 這一列**不是**這一批造成的 —— `onLethalDamage` 在**道具的 passive hook** 那一層一直有採用者（gantz-suit / millennium-puzzle 改寫前都掛在 `items.passive[].on`），零採用的是**巢在一張 buff 裡面的那一份**（`applyBuff.hooks[]`）。⛔ 而且今天寫這種卡的正解**不是**這一格：`combat/damage.ts:1012` 的 `if (dmg > 0)` 讓「擋滿的那一發」根本不發 `lethalDamage`，所以走 `block` + `onLethalDamage` 的免死卡後續效果一次都不會觸發（2026-08-18 兩件寶具就是這樣被改寫成 `marks` + `lethal` 的）。⇒ 這一格今天是**做得出來但不該用**的一條路。**到期**：那個閘被修好，或某張 buff 真的需要在自己身上聽致命傷害。",
  },

  "enum:abilities.effects[]#revive.side=any": {
    status: "default-live",
    why:
      "GH#355 批的 [EX∅ 根源] 讓 `revive` 從 2 份長到 4 份，於是同一族裡**沒被用到的那幾格**單獨浮出來。⛔ 這不是機制沒接線：`side:\"ally\"` 是四份文件全部要的語意（只復活隊友），而 `\"any\"`（連敵人也復活）今天沒有任何一張卡想要。**到期**：有人寫出一張復活敵人的卡時，這一列會被 STALE 那半邊叫，刪掉即可。",
  },
  "enum:abilities.effects[]#revive.teamCharge=requireAndSpend": {
    status: "default-live",
    why:
      "同上。四份文件全部填 `\"ignore\"`，而那是**刻意**的：`requireAndSpend` 花的是**全隊共用的復活圈額度**，用它等於「隊友用過復活圈就沒有這件寶具」—— 那不是任何一張卡寫的東西（見 `teardrop-of-rebirth.authoringNote` 的同一段推導）。",
  },
  "enum:abilities.effects[]#applyBuff.damageTypeOverride.impactType=converted": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `applyBuff` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].damageCrit=any": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `applyBuff` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].damageCrit=nonCrit": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `applyBuff` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].onConsumed=stop": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `applyBuff` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "enum:abilities.effects[]#blink.applyTo=target": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `blink` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "enum:abilities.effects[]#blink.shape=circle": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `blink` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "enum:abilities.effects[]#blink.to=caster": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `blink` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "enum:abilities.effects[]#dispel.order=oldest": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `dispel` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "enum:abilities.effects[]#eventValueConversion.basis=mitigated": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `eventValueConversion` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "enum:abilities.effects[]#eventValueConversion.basis=raw": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `eventValueConversion` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "enum:abilities.effects[]#eventValueConversion.shape=circle": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `eventValueConversion` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "enum:abilities.effects[]#eventValueConversion.source=targetCurrentHealth": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `eventValueConversion` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "enum:abilities.effects[]#eventValueConversion.who=target": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `eventValueConversion` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "enum:abilities.effects[]#proxyCast.payCosts=mana": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `proxyCast` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "enum:abilities.effects[]#proxyCast.payCosts=manaAndCooldown": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `proxyCast` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "enum:abilities.effects[]#proxyCast.rankMode=fixed": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `proxyCast` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "enum:abilities.effects[]#proxyCast.shape=circle": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `proxyCast` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "field:abilities.effects[]#blink.condition": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `blink` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "field:abilities.effects[]#blink.maxTargets": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `blink` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "field:abilities.effects[]#blink.radius": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `blink` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "field:abilities.effects[]#blink.radiusTier": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `blink` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "field:abilities.effects[]#blink.side": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `blink` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "field:abilities.effects[]#eventValueConversion.condition": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `eventValueConversion` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "field:abilities.effects[]#eventValueConversion.maxTargets": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `eventValueConversion` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "field:abilities.effects[]#eventValueConversion.radius": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `eventValueConversion` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "field:abilities.effects[]#eventValueConversion.radiusTier": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `eventValueConversion` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "field:abilities.effects[]#eventValueConversion.side": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `eventValueConversion` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "field:abilities.effects[]#proxyCast.abilityId": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `proxyCast` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "field:abilities.effects[]#proxyCast.condition": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `proxyCast` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "field:abilities.effects[]#proxyCast.fixedRank": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `proxyCast` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "field:abilities.effects[]#proxyCast.maxTargets": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `proxyCast` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "field:abilities.effects[]#proxyCast.radius": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `proxyCast` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "field:abilities.effects[]#proxyCast.radiusTier": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `proxyCast` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "field:abilities.effects[]#proxyCast.side": {
    status: "landing",
    since: "2026-08-17",
    why: "GH#333 —— 60 張聖杯願望讓 `proxyCast` 這一族**第一次有內容用它**，於是同一族裡**沒被用到的那幾格**從「整族零採用」浮出來變成單獨的零採用鍵。⛔ 這不是新機制沒接線：處理器與 schema 都在，是內容還沒有一張願望需要這個參數組合。**到期**：owner 的下一批願望（或任何技能）填了它的那一刻，這一列會被「STALE」那半邊叫，刪掉即可。",
  },
  "enum:maps.interactions[].kind=channel": {
    status: "landing",
    since: "2026-08-14",
    why: "GH#324 —— 互動點的 `kind` 是**既有系統的擺放錨點**：`pickup` → 治療花開在這裡、`capture` → 守衛塔站在這裡、`toggleGate` → 玩家站著撐開的門。三種都有引擎消費端。⭐ `channel`（站著讀條）**還沒有消費端**，所以七張圖刻意一個都不用它 —— ⛔ 留著一個沒有人讀的 kind 在內容裡，就是「作者以為擺了東西、引擎一個都不看」那個形態本身（這一批修的正是它）。**到期**：`channel` 長出消費端（例如佔領進度條）的那一刻，把它填回地圖並刪掉這兩列。",
  },
  "enum:arenas.zones[].interactions[].kind=channel": {
    status: "landing",
    since: "2026-08-14",
    why: "同上 —— 這是編譯後的那一份（`arena@1`），內容一樣沒有人填 `channel`。",
  },
  "enum:arenas.backdrop.layers[].profile=waves": {
    status: "landing",
    since: "2026-08-15",
    why: "GH#324 —— `profile` 是**外緣輪廓的通用波形**（flat 平滑環／towers 城垛／peaks 山稜／shards 碎岩／waves 起伏丘陵），跟主題無關,七張圖各挑各的。⭐ 出貨的七張裡沒有一張的主題是**開闊丘陵** —— 迷宮／天空／洞窟／無限城／大墳墓／城牆／世界樹全部是垂直或封閉的景，所以它們挑了 peaks 與 towers。⛔ 為了讓這一列變綠去把別人的圖改成丘陵，就是**內容被測試壓力寫出來的**，比零採用更糟。**到期**：下一張開闊地形的圖（草原／海岸／荒野）出現的那一刻 —— 那時候 `waves` 是它的第一順位，不用再推導一次。",
  },
  // ── GH#324：兩格是「另一條路的預設」，零採用是對的 ────────────────────────
  "variant:arenas.zones[].bounds#disc": {
    status: "default-live",
    why: "`bounds` 整格 optional，**省略就是圓** —— 那是既有 6 張手寫場地的行為，也是引擎的預設。⇒ 顯式寫 `{kind:\"disc\"}` 沒有任何人需要（寫了跟不寫一模一樣）。產生器只在矩形場地才填這一格。⛔ 這一格留著是為了讓「這張圖刻意是圓的」講得出口，不是漏填。",
  },
  // ── GH#324：七張動漫圖每一張都有機制，所以「沒有機制」那一格沒人填 ────────
  "enum:maps.gimmick.kind=none": {
    status: "default-live",
    why: "owner 2026-08-14 的七張圖**逐張指定了一個機制**（房間連接改變／城門關閉／黑泥封路／守護者封鎖／魔法門／傳送捷徑／競技場開闔），所以 `none` 沒有人填。⭐ 而「沒有機制」本來就是**預設行為** —— 既有 6 張手寫場地連 `map@1` 都不是，它們的世界裡根本沒有 gimmick 這個概念。⇒ 零採用是對的：`none` 是給「將來有一張刻意不上機制的圖」留的，⛔ 不是漏填。",
  },
  // ── GH#324：gate 機制是 Phase 5，出貨的無限城還沒有門 ──────────────────
  "field:arenas.zones[].obstacles[]#circle.gateGroup": {
    status: "landing",
    since: "2026-08-14",
    why: "GH#324 —— **可開關的幾何**（route swap／城門／崩塌的橋）。Phase 2 出貨的無限城 `gimmick.kind` 是 `none`，所以一個 gate 都沒有，而那是**對的**：⛔ 一張圖最多一個特殊機制，母版刻意先不上機制，讓「graybox 好不好玩」這件事單獨被驗。⚠️ 而且既有 6 張手寫場地的圓柱也一格都不該填它（省略＝永遠擋路，就是它們今天的行為）。**到期**：Phase 5 把 route swap 接上去、無限城長出第一組 gateGroup 的那一刻。",
  },
  "enum:abilities.effects[]#applyBuff.damageTypeOverride.scope=all": {
    status: "default-live",
    why: "59-02 高週波短刀的規格逐字是「將**該次攻擊**轉為真傷」⇒ `scope:\"basic\"`（只蓋普攻）。`all` 要的是「這段期間**連技能傷害**也一起變真傷」—— 那是一個強得多的效果，出貨內容裡沒有任何一支這樣寫。⇒ 零採用是對的。",
  },
  // ⭐ 2026-08-13 B3 新曝光：父欄位被採用之後這一格才進普查母體。
  "field:abilities.effects[]#damage.incomingPct.basis": {
    status: "default-live",
    why: "省略＝反彈基數用「這一發打進來的量」。B3-A 的五支反彈全部要的就是那個讀法，所以零採用正是它該有的樣子 —— 這一格是換一種基數時才寫的覆寫鈕。",
  },
  // ⭐ 2026-08-13 B3 新曝光：父欄位被採用之後這一格才進普查母體。
  "field:abilities.effects[]#damage.incomingPct.whenTooLate": {
    status: "default-live",
    why: "省略＝引擎預設的「反彈封包比原傷害晚到」處理（照樣送出，不丟棄）。B3-A 的五支反彈（20-04 理想鄉 · 45-00 寫輪眼 · 60-04 完美盾反 · 15-002 太陰道）都沒有要改這個時序邊界，而改它會影響的是「同一 tick 內兩面互相反彈」這種罕見情況 —— 沒有客戶就不該填，填了反而多一份沒有人驗過的行為。",
  },
  // ⭐ 2026-08-13 B3 新曝光：父欄位被採用之後這一格才進普查母體。
  // ⭐ 2026-08-13 B3 新曝光：父欄位被採用之後這一格才進普查母體。
  "field:abilities.effects[]#damage.incomingPct.applyGlobalDamageMult": {
    status: "default-live",
    why: "省略＝反彈量**不再**吃一次全域傷害倍率（`config.combat-env@1` 的 damageDealt）。原傷害進來時已經乘過一次，反彈量若再乘一次就是同一發被放大兩次 —— 保守的那一邊才是預設。要打開它是平衡決策，屬於 owner 的旋鈕，不是這一批技能的內容。",
  },
  // ⭐ 2026-08-13 B3 新曝光：父欄位被採用之後這一格才進普查母體。
  "enum:abilities.effects[]#applyBuff.hooks[].damageType=any": {
    status: "default-live",
    why: "**省略這一格就等於 any**（60-04 完美盾反正是靠省略來同時反彈魔法與物理），所以明寫 any 的文件永遠是 0 —— 零採用是這個列舉值的正確狀態。",
  },
  // ⭐ 2026-08-13 B3 新曝光：父欄位被採用之後這一格才進普查母體。
  "enum:abilities.effects[]#applyBuff.hooks[].damageType=physical": {
    status: "landing",
    since: "2026-08-13",
    why: "B3-A 的五支反彈裡，只有 45-00 寫輪眼與 15-002 太陰道指定了型別，而兩支都指定 magic（規格逐字是「反彈魔法([AP])傷害」）；60-04 完美盾反刻意省略以同時反彈魔法與物理。「只反彈物理」這個讀法在這 90 支裡沒有客戶 —— 下一批出現時填這一格就好。",
  },
  // ⭐ 2026-08-13 B3 新曝光：父欄位被採用之後這一格才進普查母體。
  "enum:abilities.effects[]#applyBuff.hooks[].damageType=true": {
    status: "landing",
    since: "2026-08-13",
    why: "真傷專屬的觸發在這 90 支裡沒有客戶：真傷本來就是「穿透一切」的那一類，設計上很少有技能只對它反應。這一格留著是為了下一批（例：對真傷免疫的護盾），今天寫它會做出一個沒有人驗過的分支。",
  },
  // ⭐ 2026-08-13 B3 新曝光：父欄位被採用之後這一格才進普查母體。
  "field:abilities.effects[]#modifyCooldown.abilityId": {
    status: "landing",
    since: "2026-08-13",
    why: "60-002 用 hookKey 指名一條 hook 的 ICD，不是指名一支技能。指名技能的客戶還沒出現。",
  },
  // ⭐ 2026-08-13 B3 新曝光：父欄位被採用之後這一格才進普查母體。
  // ⭐ 2026-08-13 B3 新曝光：父欄位被採用之後這一格才進普查母體。
  // ⭐ 2026-08-13 B3 新曝光：父欄位被採用之後這一格才進普查母體。
  "field:abilities.effects[]#modifyCooldown.maxTargets": {
    status: "default-live",
    why: "省略＝單體（shape:「single」）。三支出貨的 modifyCooldown 都是對自己。",
  },
  // ⭐ 2026-08-13 B3 新曝光：父欄位被採用之後這一格才進普查母體。
  "field:abilities.effects[]#modifyCooldown.radius": {
    status: "default-live",
    why: "三支出貨的 modifyCooldown（79-04 卍解 · 79-002 虛化 · 60-002 勇者意志）全部是`shape:「single」` 對自己，單體不需要半徑。範圍式的冷卻操作（例：對周圍友軍集體減冷卻）是一個還沒有人設計的技能形狀，⛔ 不要為了讓這一列變綠去發明一支技能。",
  },
  // ⭐ 2026-08-13 B3 新曝光：父欄位被採用之後這一格才進普查母體。
  "field:abilities.effects[]#modifyCooldown.radiusTier": {
    status: "default-live",
    why: "同 radius —— 三支都是單體對自己。radiusTier 是「小/中/大/超大」那張級距表的入口，它只有在 shape 是 circle 的時候才有意義，而今天沒有一支是。",
  },
  // ⭐ 2026-08-13 B3 新曝光：父欄位被採用之後這一格才進普查母體。
  "field:abilities.effects[]#modifyCooldown.side": {
    status: "default-live",
    why: "省略＝跟著 who 決定敵我。三支都是 `who:「self」`，所以 side 沒有可以表達的東西。它要等到出現「縮短友軍冷卻」或「延長敵人冷卻」那一類技能才有第一個客戶。",
  },
  // ⭐ 2026-08-13 B3 新曝光：父欄位被採用之後這一格才進普查母體。
  "enum:abilities.effects[]#modifyCooldown.shape=circle": {
    status: "landing",
    since: "2026-08-13",
    why: "範圍式的冷卻操作在這 90 支裡沒有客戶：三支全部是對施法者自己一個人。circle 這個成員的存在是為了「光環式的冷卻縮減」那一族，而那一族要等到下一批內容。",
  },
  // ⭐ 2026-08-13 B3 新曝光：父欄位被採用之後這一格才進普查母體。
  "enum:abilities.effects[]#modifyCooldown.who=target": {
    status: "landing",
    since: "2026-08-13",
    why: "「延長敵人的冷卻」是一個很強的控場設計，這 90 支裡沒有任何一支規格寫了它。三支出貨的 modifyCooldown 都是 self（自己的技能冷卻縮短或重置）。⛔ 零採用是正確的 —— 憑空給某支技能加這個效果就是在改設計。",
  },
  // ⭐ 2026-08-13 B3 新曝光：父欄位被採用之後這一格才進普查母體。
  "enum:abilities.effects[]#modifyCooldown.mode=reduceFlat": {
    status: "landing",
    since: "2026-08-13",
    why: "出貨的三支用的是 `reduce`（按比例縮短 50%，79-04／79-002）與 `reset`（直接重置，60-002），規格寫的都是比例或重置。「固定縮短 N 秒」這個讀法在這 90 支裡沒有客戶，而它與 reduce 是**真的兩件事**（比例對長冷卻更有價值），所以留著等第一個客戶。",
  },
  // --- 職業限定閘 / 道具光環 (owner 2026-07-30 的四類傳說武器) --------------
  // Three keys became REACHABLE today because `item@1` grew two surfaces:
  // `auras` (so an item can project 「周圍的友軍…」 — the three tier-5 積分獎勵
  // needed it) and its own hook variant `zItemHookDef` (`zHookDef` + `requires`).
  //
  // ⚠️ The two `items.passive[].*` keys below are NOT new FIELDS — `abilitySlot`
  // and `victim` were always authorable on an item passive. They are new CENSUS
  // KEYS: `items.passive` used to be the very same schema node as an ability's
  // hooks, so the walker counted them once, under the ability path. Extending
  // only the item's copy split that node in two, and the item side is genuinely
  // at zero. Nothing regressed; the census simply stopped rounding two surfaces
  // into one. (See schema/item.ts for why the field was added to the item's
  // copy rather than to the shared `zHookDef`.)
  // --- 觸發條件 (owner 2026-07-30 「on-attack by condition 這個一定要實作」) ---
  // ONE field on the shared `zHookDef`, so the census sees it twice: once under
  // the ability-passive hook node and once under `items.passive`, which item.ts
  // split off when it added `requires`. The ability side is still at zero and
  // is expected to move as the 鑄技工坊 pass re-authors the proc families — the
  // 攻擊觸發 template already ships the 獸矛 gate as its slot default, so the
  // FIRST card expanded from it adopts the ability-side key.
  //
  // ⚠️ It is `landing` and NOT `default-live`: an absent condition really does
  // mean 「無條件觸發」, so a code default is not covering for the zero. If this
  // is still red in 30 days, the honest conclusion is that no content adopted
  // the mechanism and it should be re-triaged, not re-granted.
  //
  // 2026-08-01 —— `field:items.passive[].condition` 的豁免**已刪除**(棘輪生效)。
  // 它預期的第一批客戶到了,而且正好就是註解寫的那兩種形狀:鍊金術之盾
  // godie-i06q「HP 低於 5% 的敵人」、死之王的意志 godie-i060 [斬殺]「生命低於 3%」、
  // 螺旋劍 godie-i01v 與 光魔杖 godie-i027 的「自身法力 ≥ N%」。

  // --- 套裝 item@1.sets (死之王套裝, 2026-08-01) ---------------------------
  // Three OPTIONAL knobs on a field whose three required halves (`id`/`pieces`/
  // `modifiers`) are 3/3 adopted, so the mechanism itself is NOT at zero — the
  // shipped 死之王套裝 pays out and `sim/lichkingSet.test.ts` drives it end to
  // end. Each of these three exists so a DECISION lives in the 後台 instead of
  // in a code branch (CLAUDE.md 第一守則), and the shipped set deliberately
  // takes the default on all three. That is the textbook shape of
  // "default-live" rather than "landing": zero adoption here means 「沒有人需要
  // 覆寫」, and if it stayed red on a 30-day clock the only way to clear it
  // would be to author a set whose terms nobody wants.
  "field:champions.archetype": {
    status: "landing",
    since: "2026-08-12",
    why: "推導有預設值（deriveArchetype：主屬性 lv10 權重 × 攻擊型別），74 位全部判得出來，所以英雄卡不需要填。這一欄是覆寫用的。機制與守衛在 content/statNormalization.ts + statNormalization.test.ts（突變驗過）。",
  },
  "field:items.sets[].requiredPieces": {
    status: "default-live",
    why: "省略 = pieces 的全部件數(sim/economy/itemSets.requiredPieces),也就是「同時裝備 A、B、C」最嚴格的讀法。死之王套裝要三件全帶,正是預設值,所以出貨文件沒有理由寫它。填比 pieces 少 = 部分套裝加成,是留給下一套的旋鈕。",
  },
  "field:items.sets[].countDuplicates": {
    status: "default-live",
    why: "省略 = false = 一套講的是不同的件數,同一件帶兩份仍算一件(itemSets.countHeld)。這是保守的那一邊 —— 打開之後才可能靠疊同一件湊滿一套,而沒有任何出貨套裝要那個讀法。",
  },
  "field:items.sets[].enabled": {
    status: "default-live",
    why: "省略 = 開。這是一個**關掉**用的開關(同 draftEligible 的理由:不刪文件也能停掉一套),所以「零採用」正是它該有的樣子 —— 有人寫它的那天,意思是有一套被暫時停掉了。",
  },

  // --- 格擋 item@1.block.lethalBasis (2026-08-01) --------------------------
  // The field's three required halves (`damageTypes`/`chance`/`fraction`) are
  // 4/4 adopted and `lethalOnly` is 2/4, so the MECHANISM is not at zero —
  // `sim/combat/block.shipped.test.ts` drives all four shipped docs end to end.
  // This one knob exists so 「超過現存生命」's denominator is an editor decision
  // instead of a code branch (CLAUDE.md 第一守則), and both death-save items
  // deliberately take the default. Textbook "default-live", not "landing":
  // clearing a 30-day clock would mean authoring an item whose reading nobody
  // asked for.
  // --- 資源衍生屬性 (光魔杖 godie-i027「AP+ (目前MP的 5%)」, 2026-08-01) -----
  //
  // `fromResource` landed on the SHARED `zStatModifierFields`, so the census
  // sees it on BOTH the item modifier node and the ability `applyBuff` one.
  // The item side is ADOPTED (光魔杖 is the whole reason it exists); the ability
  // side is at zero and that is the honest state — no buff in the tree wants a
  // stat term that drains with a resource yet.
  // ⭐ 2026-08-12 —— `radiusTier` 的**四筆豁免全部刪除**（棘輪第一次收成）。
  // 2026-08-11 的那一段寫著：級距要由 owner 手動重製的那一批技能填進來，
  // 「30 天之後這一條會自己再紅一次 —— 如果重製那一批交回來還是一支都沒填級距，
  // 這個機制就是白做的」。那一批今天交回來了，而且**填了**：
  //   · field:abilities.radiusTier                      → 15 份
  //   · field:abilities.effects[]#damageArea.radiusTier → 38 份
  //   · field:champions.abilities.*.radiusTier          → 10 份（英雄卡孿生）
  //   · field:abilities.effects[]#dispel.radiusTier     →  2 份
  // 連「兩個節點一定同時變綠」的預測都成立（standalone 與 embedded 共用
  // `registries.ts` 的同一支 resolveRadiusTier）。
  "field:abilities.effects[]#applyBuff.modifiers[].fromResource": {
    status: "landing",
    since: "2026-08-01",
    why: "同一個欄位落在共用的 zStatModifierFields 上,所以普查會在道具與技能 applyBuff 兩個節點各看到一次。道具那一側**已經採用**(光魔杖 godie-i027 就是它存在的理由);技能這一側是零,而且零是誠實的 —— 樹上還沒有任何一個 buff 想要一條會隨資源縮水的屬性項。分開兩份 schema 只為了讓其中一邊閉嘴,會讓「percentOf 一定要有來源」這條規則變成兩份(見 schema/common.ts 檔頭對這一點的警告)。機制在 sim/stats/resourceStats.ts。",
  },
  // `field:items.modifiers[].from` WENT BACK TO ZERO on 2026-08-01, and that is
  // a CORRECTION rather than a regression: 光魔杖 was its only item-side user,
  // and its 「目前MP」 line moved from `from: "maxMana"` (最大魔力, frozen at
  // recompute time) to `fromResource: "mp"` (當下魔力). The stat-to-stat form is
  // still live on the ABILITY side (78-00 銅皮鐵骨「防禦力額外增加自身攻擊力的
  // 50%」), so the mechanism is not dead — no ITEM needs it today.
  "field:items.modifiers[].from": {
    status: "default-live",
    why: "「把 A 屬性的 X% 加到 B」在道具上目前沒有客戶。它唯一的道具客戶是 2026-08-01 之前的光魔杖,而那一行文案寫的是「目前MP」,所以它換成了 fromResource: \"mp\" —— 換句話說這一格歸零是**把一個近似值改成正確值**的結果,不是機制死掉。同一個 op 在技能那一側活著(78-00 銅皮鐵骨「防禦力額外增加自身攻擊力的 50%」),而 sim/stats/statPipeline.ts 的第二趟兩種來源域都走。",
  },
  // --- 變身唯一狀態的碰撞規則 champion@1.transform.reenter (2026-08-08) ------
  // 【變身】的**互斥**不需要這個欄位、也不需要任何內容:一個實體只有一格
  // `world.championForm`,身體只有一個 `championId`。這一格只決定互斥必然帶來的
  // 那個決策 —— 重複進入時舊形態的剩餘時間怎麼辦 —— 而預設 `restart` 正是
  // 2026-08-08 之前出貨的行為,所以 26 對變身全部**刻意**吃預設。
  "field:champions.transform.reenter": {
    status: "default-live",
    why: "機制(同時只能有一個形態)是結構性的,不靠這個欄位 —— 它只是把「重複變身時計時器從哪裡算」這個決策從程式挪到後台(CLAUDE.md 第一守則)。預設 restart = 出貨現況,所以 26 對變身零採用是**正確且刻意**的:要一份文件寫 keepLongest/reject 只為了讓這一列變綠,等於替 owner 決定了一支英雄的手感。機制與三種規則的守衛在 sim/championFormExclusive.test.ts(四個突變都驗過會紅)。",
  },

  // ⚠️ 這一格的**名字換過兩次,兩次都是「名字換了而不是欄位消失了」**:
  //   · 2026-08-08 `field:items.block.lethalBasis` → `field:abilities.passive.ranks[].block.lethalBasis`
  //     (`zItemBlockGrant` 變成 `zBlockGrant` 的別名,技能被動也授予格擋)
  //   · 2026-08-09 → `field:abilities.effects[]#applyBuff.block.lethalBasis`
  //     (`applyBuff` 也授予格擋了,而它在 schema 走訪順序上比 passive 早)
  // `nameSchemas()` 依**物件識別**給每個 schema 一個正規名字,所以這一顆共用的
  // grant 的子欄位一律掛在**第一個被走到**的那條路徑底下;外層那幾格
  // (`field:items.block` 4/4、`field:augments.block`、…) 各自還在。
  // ⛔ 不要為了讓名字穩定就把 schema 拆成兩份 —— 那正是上面 `fromResource` 那一格
  // 已經寫過的警告:「分開兩份 schema 只為了讓其中一邊閉嘴,會讓規則變成兩份」。
  // 技能授予格擋 —— 引擎側 2026-08-08 接通(`abilities/abilityPassives.ts` 把
  // `passive.ranks[].block` 轉發到同一個 `ModifierSource.block`,行為守衛
  // `sim/combat/blockFromPassive.test.ts`,兩個突變都驗過會紅)。內容側是 owner
  // 正在手寫的 90 支技能文案裡的兩支:20-00 銀色甲胄(Saber 天生技,
  // 「有30%機率格擋100%魔法傷害」)與 79-002 虛化(卍解狀態下的物理格擋,
  // 配 whileForm: "alternate")。這兩支一落地,這一筆就該刪掉。
  // ⭐ 2026-08-12 B2：landing 豁免移除 —— **它落地了**（20-00 銀色甲胄 + 79-002 虛化）。
  //    出口在 `tools/skill-remake/batch1.py` 開了、表格填了值，採用率從 0 變成有。

  // ── 授權格放寬:格擋 / 暴擊來源(owner GH#299 第 2 · 6 條,2026-08-09) ────
  //
  // ⭐ 這五格是**同一次**改動,而且**沒有一格改到引擎** —— 真的跑過模擬量到
  // `combat/block.ts::blockCutFor` 與 `combat/critStrike.ts::rankedGrants`
  // 從第一天起就**不看 `ModifierSource.kind`**(把 grant 掛在 augment / passive /
  // buff 三種來源上,擋跟乘的行為與道具逐條相同)。所以「只有道具寫得出來」從來
  // 不是引擎的限制,是**授權格**的限制:schema 少一格 + 建構點少一次轉發。
  // 這一批加的就是那兩樣,轉發集中在 `sim/stats/sourceGrants.ts`(一份,不是四份)。
  //
  // 零採用是**內容決定**:content/abilities/ 這一輪由 owner 手動重製、
  // content/augments/ 的 31 張卡是 #260 那一版的三圍卡,兩邊都還沒有人寫暴擊卡。
  // 第一份內容落地時這五筆就該一起刪掉。
  // ⭐ 2026-08-12 B2：landing 豁免移除 —— **它落地了**（77-02 雷鳴劍 + 89-01 憤怒的頭槌）。
  //    出口在 `tools/skill-remake/batch1.py` 開了、表格填了值，採用率從 0 變成有。
  "field:abilities.effects[]#applyBuff.block": {
    status: "landing",
    since: "2026-08-09",
    why: "引擎側已通:限時來源現在授予得起格擋,所以「接下來 5 秒內格擋」與「主動技能給格擋」兩個授權格一起補上了(⛔ 不開新的 effect kind —— 那會變成第二套格擋)。到期走這份 buff 自己的 expiresAtTick,blockCutFor 本來就在跳過過期的 source。零採用是內容決定:owner 手寫的 90 支技能還沒寫進 content/abilities/。",
  },
  "field:abilities.effects[]#applyBuff.critStrike": {
    status: "landing",
    since: "2026-08-09",
    why: "同上,暴擊那一半:「這支大招期間 20% 機率 3 倍」在此之前完全沒有形狀。rankedGrants 本來就在跳過過期的 source,所以限時不需要第二個時鐘。",
  },
  "field:augments.critStrike": {
    status: "landing",
    since: "2026-08-09",
    why: "引擎側已通。⭐ 這一格是 critRules.stackMode:\"multiply\"(owner 2026-08-09)的理由指向的東西:那條規則存在就是為了「玩家的第二張暴擊卡不可以是廢牌」,而在這一格之前一張卡根本沒有辦法**成為**第二條獨立的暴擊來源(只能加聚合屬性)。零採用是內容決定,不是機制缺席。",
  },

  // ── GH#299 第一輪「授權格」(2026-08-09) ────────────────────────────────────
  // ⭐ 這一整批的共同性質：**引擎那一半從第一天就在跑**，擋住作者的只有 schema
  // 上那一格與一行轉發。owner 2026-08-09：「引擎會做那件事，但 JSON 上沒有那一格
  // 可以填，所以作者寫不出來。=> 請修正」。
  //
  // 零採用因此是**內容決定**而不是機制缺席：content/abilities/ 這一輪由 owner
  // 手動重製，那 90 支還沒寫進樹裡（⛔ 不可以由我代寫，見 CLAUDE.md）。
  // 每一筆的「哪一支技能會用它」寫在 why 裡，那一支落地時這一筆就該刪掉。
  "field:abilities.effects[]#dot.applyTo": {
    status: "landing",
    since: "2026-08-09",
    why: "同 damage.applyTo 的另一個 kind:一段燒在**自己**身上的持續傷害（獻祭型代價）。dot 的 handler 與 damage 走同一條 subjects 選擇,所以兩者行為對得起來,不是第二套語意。零採用同上:owner 手寫的那批技能還沒進樹。",
  },
  // ⭐ GH#459（2026-08-19）：`heal.applyTo` 的 landing 豁免**刪掉了** —— 它落地了。
  //    48-03 鮮血神殿（godie-hvsh.e）的「每有一名敵人被結界扣血，Rider 回復自身
  //    1% 最大生命」走的就是 `damageArea.onHitTargets` 裡的 `heal{applyTo:"self"}`。
  // ⭐ 2026-08-12 B2：landing 豁免移除 —— **它落地了**（52-04 巨神一擊 + 92-002 最終戈壁）。
  //    出口在 `tools/skill-remake/batch1.py` 開了、表格填了值，採用率從 0 變成有。
  // ⭐ 2026-08-13：`damageLine.resourcePct` 也移除 —— 20-002 的收尾終於帶上規格
  //    寫了三個月的「(**現存魔力**+AP)×7」那一半（上面這一筆自己就預告了它）。
  "field:abilities.effects[]#shield.stackKey": {
    status: "landing",
    since: "2026-08-09",
    why: "S1 —— 59-03 的文案明寫「[護盾]不會疊加」,而實測連放兩次拿到**兩片各 300 點**的獨立池子:卡片說不疊、遊戲裡疊,而兩片盾在畫面上跟一片厚的長得一樣。缺席 = 每次都是新的一片 = 2026-08-09 之前的行為,所以既有 20 份文件逐字不變。",
  },
  "field:abilities.effects[]#shield.onExisting": {
    status: "landing",
    since: "2026-08-09",
    why: "同上的另一半(replace/keepLarger/stack)。⛔ 兩格要一起填 —— 只填 onExisting 會被 refineEffectDef 擋下並指名那一格,免得它變成一個永遠不會被讀到的欄位。",
  },
  // ⭐ 2026-08-12 B2：landing 豁免移除 —— **它落地了**（77-03 GLADIARIA ALAT 的翅膀）。
  //    出口在 `tools/skill-remake/batch1.py` 開了、表格填了值，採用率從 0 變成有。

  // ── 跨技能強化 ability@1.augment (2026-08-08) ─────────────────────────────
  //
  // 一支技能指名改寫**另一支**技能的數字(冷卻/傷害/持續/射程…)。引擎側 2026-08-08
  // 接通,行為守衛在 sim/abilities/abilityAugment.test.ts。
  //
  // ⚠️ 這兩格必須**一起**豁免,而且理由是同一個。`champions.abilities.*.augment`
  // 是鏡像側(champion 文件內嵌的技能副本),`ggd-mirror-authority-model` 規定同步
  // 方向永遠是 standalone→embedded,所以它不可能先於 standalone 有採用。分開處理
  // 會讓其中一格在另一格落地時仍然紅,然後被當成「鏡像同步壞了」查半天。
  //
  // 零採用的原因是**內容決定,不是機制缺席**:owner 2026-08-08 明說
  // 「我正在手動重製所有英雄技能,稍安勿躁」,而這一族的四支目標(89-00 我要活著
  // 回去 / 52-04 十二道試煉 / 79-01 斷界 / 15-04 影分身)都在那 90 支裡,將由
  // Codex 技能模板編輯器產出 JSON 匯入。第一支落地時這一筆就該刪掉。
  // ⭐ 2026-08-13 B4-K：landing 豁免移除 —— **它落地了**（77-002 御雷劍，
  //    全 repo 第一份帶 `augment` 的技能文件）。
  "field:champions.abilities.*.augment": {
    status: "landing",
    since: "2026-08-08",
    why: "同上,而且是**鏡像側**:同步方向永遠 standalone→embedded,所以它結構上不可能早於 field:abilities.augment 有採用。兩格要一起刪。",
  },

  // ══ Lane 3（2026-08-10）—— 六個 lane 的 schemaChanges 一次落地 ══════
  //
  // ⭐ 這一整批的共同性質與 GH#299 那一輪逐字相同：**引擎那一半要嘛已經在跑、
  // 要嘛 handler 排在下一階段**，而擋住作者的是 schema 上那一格。每一格省略時的
  // 意思都等於今天的行為，所以既有內容逐位元不變 —— 零採用因此是**內容決定**
  // 而不是機制缺席（owner 正在手動重製全部英雄技能，⛔ 不可以由我代寫）。
  //
  // ⚠️ 兩個新 kind（delayed / proxyCast）的 handler **還沒落地**，registry 上是
  // 會丟具名錯誤的 stub。它們的豁免到期時要先確認 handler 在了再寫內容。
  // ⭐ 2026-08-12 B2：landing 豁免移除 —— **它落地了**（52-04「若敵人具有[恐懼]則額外追加」）。
  //    出口在 `tools/skill-remake/batch1.py` 開了、表格填了值，採用率從 0 變成有。
  "field:abilities.effects[]#damageArea.maxTargetsCounts": {
    status: "landing",
    since: "2026-08-10",
    why: "G1 —— 「最多幾人」數的是通過過濾的前 N 個（卡面「最多 5 名帶〔恐懼〕的敵人」）還是最近 N 個再過濾。真的 A/B，所以是欄位；預設 qualified。沒填 victimCondition 時無作用。",
  },
  // ⭐ 2026-08-12 移除 `damageArea.onHitTargets` 的 landing 豁免 —— **它落地了**。
  //    B1-B 把兄弟酬載自動折進 onHitTargets（`batch1.py::_fold_onhit`），採用率
  //    從 **0** 變成 15 個節點 / 10 支。這條豁免因此過期，而**這個帳本自己叫了** ——
  //    它是這一批唯一一個「不必人去查就會說話」的採用率訊號。
  "field:abilities.effects[]#damageArea.runOnEmptyHit": {
    status: "landing",
    since: "2026-08-10",
    why: "G1 ② —— 一個人都沒打到時要不要照樣跑下游。省略 = false = 今天什麼都不會發生的那個語意。",
  },
  // ⭐ 2026-08-18 · `damageArea.onHitTargetsMode` **落地了**（items/godie-i01i），
  //    所以它的 landing 豁免照這份清單自己的規矩被刪掉 —— ⛔ 不是放寬，是它不再需要。
  "field:abilities.effects[]#damageLine.victimCondition": {
    status: "landing",
    since: "2026-08-10",
    why: "同 damageArea.victimCondition 的膠囊版本。⚠️ 兩個 kind 在這一族上是同一個機制的兩個形狀，欄位名一旦分岔，編輯器上長得一樣的兩格就會是兩件事 —— 所以四格同名同語意、共用同一組常數。",
  },
  "field:abilities.effects[]#damageLine.maxTargetsCounts": {
    status: "landing",
    since: "2026-08-10",
    why: "同 damageArea.maxTargetsCounts —— 「最多幾人」數的是通過過濾的前 N 個還是最近 N 個再過濾。⛔ 兩個 kind 這一族的欄位名與語意必須完全一致，否則編輯器上長得一樣的兩格會是兩件事。",
  },
  // ⭐ 2026-08-12 同 damageArea.onHitTargets：landing 豁免移除，它落地了（B1-B）。
  "field:abilities.effects[]#damageLine.runOnEmptyHit": {
    status: "landing",
    since: "2026-08-10",
    why: "同 damageArea.runOnEmptyHit —— 一個人都沒打到時要不要照樣跑下游。省略 = 不跑 = 今天什麼都不會發生的那個語意。",
  },
  "field:abilities.effects[]#damageLine.onHitTargetsMode": {
    status: "landing",
    since: "2026-08-10",
    why: "batch（預設，下一段收到整群人一次）還是 perTarget（一個一個分開跑）。⛔ 兩個 kind 在這一族上必須同名同語意：欄位名一旦分岔，編輯器上長得一樣的兩格就會是兩件事，那是最難查的一種缺陷。⭐ 圓形那一半（damageArea）已於 2026-08-18 落地並拿掉豁免；膠囊這一半還沒有內容需要它。",
  },
  "field:abilities.effects[]#applyBuff.modifiers[].scopeSlot": {
    status: "landing",
    since: "2026-08-10",
    why: "G9 —— 只針對某一格技能的持續性冷卻縮減（79-04 卍解「[瞬步] 冷卻縮短 50% 持續 8 秒」）。今天 Stat.CooldownReduction 是一顆全域純量，全 sim 只有一個消費點。缺席 = 全域 = 每一條既有 modifier 的行為。⚠️ 帶 scope 的加成**不進** sc.final，所以它不會出現在面板的冷卻縮減那一列 —— 那是對的（它不是全域的），但要說出來。",
  },
  "field:abilities.effects[]#applyBuff.modifiers[].scopeAbilityId": {
    status: "landing",
    since: "2026-08-10",
    why: "G9 的另一半：指名一支具名技能而不是槽位。兩格互斥（理由與 modifyCooldown 的 slot/abilityId 逐字相同：一半的卡講的是「這一格」、另一半講的是「這一支」）。⚠️ 軟參照，打錯 id 會安靜地不生效 —— ⛔ 不要假裝它會紅。",
  },
  "field:items.modifiers[].scopeSlot": {
    status: "landing",
    since: "2026-08-10",
    why: "同上，道具那一面。⚠️ zStatModifier 是道具／三選一／applyBuff／天生技／靈氣**五個授權面共用**的同一份，所以加一格會同時開在五處 —— 而只有冷卻縮減有讀取端。那道 superRefine（scope 只收 CooldownReduction）就是這一格不會變成一堆死設定的閘。",
  },
  "field:items.modifiers[].scopeAbilityId": {
    status: "landing",
    since: "2026-08-10",
    why: "G9 —— 道具那一面的具名技能版本（「這件裝備只縮短瞬步的冷卻」）。與 scopeSlot 互斥；⚠️ 軟參照，打錯 id 會安靜地不生效，⛔ 不要假裝它會紅。",
  },
  "field:abilities.effects[]#applyBuff.hooks[].perTarget": {
    status: "landing",
    since: "2026-08-10",
    why: "S3/S6/S8/S10（Lane 3，2026-08-10）—— 觸發器上的六格新詞彙一次落地：key（讓「重置這條觸發器的冷卻」指得到它，⛔ 不用陣列索引定址）、maxTriggers/consumeOn/onConsumed/perTarget（「下一次普攻」那一族的**次數**界 —— ⛔ 不是靠一個 duration 極短的增益假裝，那是時間界，攻速一高就吃到兩次而畫面上一模一樣）、critSource（89-01「這一招自己的暴擊」vs「這位英雄任何一次暴擊」）、reflectedDamageSource/Type（60-04「若成功反彈敵方**技能** AP 傷害」—— 只有 onReflectSuccess 帶得到原封包，schema 已經擋住掛錯事件）。零採用是**內容決定**：content/abilities/ 這一輪由 owner 手動重製，那批技能還沒寫進樹裡。（這一筆是限時增益授予的觸發器那一面；⚠️ 同一格 zHookDefBase 欄位在普查裡會出現兩次，兩邊要一起刪。）",
  },
  // ⭐ 2026-08-13 B3：landing 豁免移除 —— 它落地了（89-01 憤怒的頭槌）。
  // ⭐ 2026-08-13 B3：landing 豁免移除 —— 它落地了（60-04 完美盾反）。
  // ⭐ 2026-08-13 B3：landing 豁免移除 —— 它落地了（60-04 完美盾反）。
  "field:items.passive[].consumeOn": {
    status: "landing",
    since: "2026-08-10",
    why: "S3/S6/S8/S10（Lane 3，2026-08-10）—— 觸發器上的六格新詞彙一次落地：key（讓「重置這條觸發器的冷卻」指得到它，⛔ 不用陣列索引定址）、maxTriggers/consumeOn/onConsumed/perTarget（「下一次普攻」那一族的**次數**界 —— ⛔ 不是靠一個 duration 極短的增益假裝，那是時間界，攻速一高就吃到兩次而畫面上一模一樣）、critSource（89-01「這一招自己的暴擊」vs「這位英雄任何一次暴擊」）、reflectedDamageSource/Type（60-04「若成功反彈敵方**技能** AP 傷害」—— 只有 onReflectSuccess 帶得到原封包，schema 已經擋住掛錯事件）。零採用是**內容決定**：content/abilities/ 這一輪由 owner 手動重製，那批技能還沒寫進樹裡。（這一筆是道具被動那一面；⚠️ 同一格 zHookDefBase 欄位在普查裡會出現兩次，兩邊要一起刪。）",
  },
  "field:items.passive[].onConsumed": {
    status: "landing",
    since: "2026-08-10",
    why: "S3/S6/S8/S10（Lane 3，2026-08-10）—— 觸發器上的六格新詞彙一次落地：key（讓「重置這條觸發器的冷卻」指得到它，⛔ 不用陣列索引定址）、maxTriggers/consumeOn/onConsumed/perTarget（「下一次普攻」那一族的**次數**界 —— ⛔ 不是靠一個 duration 極短的增益假裝，那是時間界，攻速一高就吃到兩次而畫面上一模一樣）、critSource（89-01「這一招自己的暴擊」vs「這位英雄任何一次暴擊」）、reflectedDamageSource/Type（60-04「若成功反彈敵方**技能** AP 傷害」—— 只有 onReflectSuccess 帶得到原封包，schema 已經擋住掛錯事件）。零採用是**內容決定**：content/abilities/ 這一輪由 owner 手動重製，那批技能還沒寫進樹裡。（這一筆是道具被動那一面；⚠️ 同一格 zHookDefBase 欄位在普查裡會出現兩次，兩邊要一起刪。）",
  },
  "field:items.passive[].perTarget": {
    status: "landing",
    since: "2026-08-10",
    why: "S3/S6/S8/S10（Lane 3，2026-08-10）—— 觸發器上的六格新詞彙一次落地：key（讓「重置這條觸發器的冷卻」指得到它，⛔ 不用陣列索引定址）、maxTriggers/consumeOn/onConsumed/perTarget（「下一次普攻」那一族的**次數**界 —— ⛔ 不是靠一個 duration 極短的增益假裝，那是時間界，攻速一高就吃到兩次而畫面上一模一樣）、critSource（89-01「這一招自己的暴擊」vs「這位英雄任何一次暴擊」）、reflectedDamageSource/Type（60-04「若成功反彈敵方**技能** AP 傷害」—— 只有 onReflectSuccess 帶得到原封包，schema 已經擋住掛錯事件）。零採用是**內容決定**：content/abilities/ 這一輪由 owner 手動重製，那批技能還沒寫進樹裡。（這一筆是道具被動那一面；⚠️ 同一格 zHookDefBase 欄位在普查裡會出現兩次，兩邊要一起刪。）",
  },
  "field:items.passive[].critSource": {
    status: "landing",
    since: "2026-08-10",
    why: "S3/S6/S8/S10（Lane 3，2026-08-10）—— 觸發器上的六格新詞彙一次落地：key（讓「重置這條觸發器的冷卻」指得到它，⛔ 不用陣列索引定址）、maxTriggers/consumeOn/onConsumed/perTarget（「下一次普攻」那一族的**次數**界 —— ⛔ 不是靠一個 duration 極短的增益假裝，那是時間界，攻速一高就吃到兩次而畫面上一模一樣）、critSource（89-01「這一招自己的暴擊」vs「這位英雄任何一次暴擊」）、reflectedDamageSource/Type（60-04「若成功反彈敵方**技能** AP 傷害」—— 只有 onReflectSuccess 帶得到原封包，schema 已經擋住掛錯事件）。零採用是**內容決定**：content/abilities/ 這一輪由 owner 手動重製，那批技能還沒寫進樹裡。（這一筆是道具被動那一面；⚠️ 同一格 zHookDefBase 欄位在普查裡會出現兩次，兩邊要一起刪。）",
  },
  "field:items.passive[].reflectedDamageSource": {
    status: "landing",
    since: "2026-08-10",
    why: "S3/S6/S8/S10（Lane 3，2026-08-10）—— 觸發器上的六格新詞彙一次落地：key（讓「重置這條觸發器的冷卻」指得到它，⛔ 不用陣列索引定址）、maxTriggers/consumeOn/onConsumed/perTarget（「下一次普攻」那一族的**次數**界 —— ⛔ 不是靠一個 duration 極短的增益假裝，那是時間界，攻速一高就吃到兩次而畫面上一模一樣）、critSource（89-01「這一招自己的暴擊」vs「這位英雄任何一次暴擊」）、reflectedDamageSource/Type（60-04「若成功反彈敵方**技能** AP 傷害」—— 只有 onReflectSuccess 帶得到原封包，schema 已經擋住掛錯事件）。零採用是**內容決定**：content/abilities/ 這一輪由 owner 手動重製，那批技能還沒寫進樹裡。（這一筆是道具被動那一面；⚠️ 同一格 zHookDefBase 欄位在普查裡會出現兩次，兩邊要一起刪。）",
  },
  "field:items.passive[].reflectedDamageType": {
    status: "landing",
    since: "2026-08-10",
    why: "S3/S6/S8/S10（Lane 3，2026-08-10）—— 觸發器上的六格新詞彙一次落地：key（讓「重置這條觸發器的冷卻」指得到它，⛔ 不用陣列索引定址）、maxTriggers/consumeOn/onConsumed/perTarget（「下一次普攻」那一族的**次數**界 —— ⛔ 不是靠一個 duration 極短的增益假裝，那是時間界，攻速一高就吃到兩次而畫面上一模一樣）、critSource（89-01「這一招自己的暴擊」vs「這位英雄任何一次暴擊」）、reflectedDamageSource/Type（60-04「若成功反彈敵方**技能** AP 傷害」—— 只有 onReflectSuccess 帶得到原封包，schema 已經擋住掛錯事件）。零採用是**內容決定**：content/abilities/ 這一輪由 owner 手動重製，那批技能還沒寫進樹裡。（這一筆是道具被動那一面；⚠️ 同一格 zHookDefBase 欄位在普查裡會出現兩次，兩邊要一起刪。）",
  },
  // ⭐ 2026-08-23（GH#563）——「dash.onEnd 零採用」這一列**劃掉了**：74-02 八刀一閃
  //    現在走 `dash{onEnd:[damageArea]}`（JASS `OneCutMove` 是先位移、抵達之後才對
  //    落點 400×400 的敵人結算，war3map.j:48461-48470）。⛔ 不要把它加回來。
  "field:abilities.effects[]#dash.onEndOn": {
    status: "landing",
    since: "2026-08-10",
    why: "S7 —— 被地形擋下來的衝刺算不算「衝完」。真的岔路：位移系統今天把「撞牆停下」與「跑完距離」合成同一個結束條件。預設 always，因為卡面說「衝刺後揮出」，而一刀被場景取消是玩家看不見的失敗。",
  },
  "field:abilities.effects[]#dash.onEndWhenDead": {
    status: "landing",
    since: "2026-08-10",
    why: "S7 —— 衝刺途中陣亡還要不要揮。省略 = 不揮，形狀與精神逐字沿用 randomArea.stopOnCasterDeath。",
  },
  "field:champions.abilities.*.innateActivePassive": {
    status: "landing",
    since: "2026-08-10",
    why: "同上，而且是**鏡像側**：同步方向永遠 standalone→embedded。⚠️ 2026-08-13 更正：standalone 那一格已經被 70-00 紮根採用而刪掉了，但這一格**不可以跟著刪** —— `innateActivePassive` 只長在 slot PASSIVE 上，而鏡射迴圈只跑 Q/W/E/R，所以鏡像側是**結構性永遠 0**，刪掉會在反方向紅（unexplained zero）。⛔ 舊文案「兩格要一起刪」是錯的。",
  },

  // ── 傷害型別轉換 items@1.damageTypeOverride (2026-08-01) ──────────────────
  //
  // ⚠️ 2026-08-09 —— 下面四個 key **改名了，不是消失了**（第三次同型改名，理由與
  // `items.block.lethalBasis` 那兩次逐字相同）。G7 把 `zItemDamageTypeOverride`
  // 變成 `schema/effect.ts` 的 `zDamageTypeOverrideGrant` 的**別名**，因為授予它的
  // 不再只有道具（`SOURCE_GRANT_SHAPE` 展開它 → 天生技一階 / 三選一 / applyBuff）。
  // `nameSchemas()` 依**物件識別**命名，所以這一顆共用 schema 的子欄位一律掛在
  // **第一個被走到**的路徑（`applyBuff`）底下。外層那格 `field:items.damageTypeOverride`
  // 的 3/3 採用一格沒動 —— 動的只有名字。
  // ⛔ 不要為了名字穩定就把 schema 拆兩份（見 `fromResource` 那一格的同一則警告）。
  //
  // 三件出貨:霸王破甲槍 godie-i00f / 死之王的長槍 godie-i01d (scope "basic")、
  // 惡夢魔王碎片 godie-i067 (scope "ability")。所以**機制本身完全不在零** ——
  // `becomes=true` 3/3、`scope=basic` 2/3、`scope=ability` 1/3、`impactType` 1/3,
  // 而 sim/combat/damageTypeOverride.shipped.test.ts 逐件把出貨的 scope 釘死。
  // 下面四格是同一族的**剩餘選項**,而且**兩種零的理由不一樣**,所以 status 不同:
  //
  //   · `applyAt` 有程式預設(`ov.applyAt ?? "afterGates"`)→ default-live
  //   · `scope` / `becomes` 是**必填**,沒有「不寫就是它」→ 不可以寫 default-live
  //
  // ⚠️ 為什麼那三個 enum 成員是 `debt` 而不是別的:六個 status 裡**沒有一個**在講
  // 「這個列舉是**故意**開得比今天的內容寬」。`landing` 是謊(沒有任何遷移在路上)、
  // `default-live` 是謊(必填欄位沒有預設)、`superseded` 是謊(寫下去不是 bug)、
  // `schema-impossible` 是謊(寫下去載得進來)、`runtime-authored` 是謊。剩下 `debt`
  // 是唯一**不會讓這一列消失**的永久 status,而且這份檔案已經有一模一樣形狀的前例 ——
  // `enum:abilities.effects[]#shield.absorbs=physical`(同樣是鏡射 DamageType 的
  // 列舉、同樣 sim 有跑、同樣沒有內容要它、同樣明說「留 debt 不留 landing,免得它
  // 到期之後變成沉默」)。所以這裡跟它一致。代價要講清楚:banner 會把一個**刻意的
  // 設計選擇**印成「ACCEPTED FAILURE」,那句話對這三格是重的。真正的修法是替
  // ExemptionStatus 加一個講「列舉比內容寬,而且是故意的」的成員 —— 但那個成員必須
  // 照樣印在 banner 上,否則它就是一個更好聽的沉默鍵,也就是這份普查存在要擋的東西。
  //
  // ── 2026-08-13：這一族的四格豁免**整組被刪掉了**,因為容器 FELL BACK UNDER
  //    MIN_REACH（形狀與上面「靈氣 (auras)」那一段逐字相同）。
  //
  //    霸王破甲槍 godie-i00f 是 owner 2026-08-13 點名改掉的：它從
  //    `damageTypeOverride{becomes:"true"}` 換成 `penetration{scope:"basic",
  //    armorPct:1}`（真傷 → 100% 護甲穿透）。於是 `damageTypeOverride` 的採用從
  //    **3 份掉到 2 份**（死之王的長槍 godie-i01d、惡夢魔王碎片 godie-i067），
  //    跨回 `MIN_REACH` = 3 以下 —— 普查從此對這一族的**子欄位**不再有任何宣稱，
  //    而「一個不再有宣稱的鍵留著豁免」就是這份檔案自己定義的 STALE。
  //
  //    ⛔ 這不是把守衛改弱換綠燈：那四筆的作用是**壓下報告**，刪掉它們是把壓制
  //    拿掉，不是把斷言放寬。真正的內容側守衛（機制本身有沒有在跑）沒有動：
  //    `sim/combat/damageTypeOverride.shipped.test.ts` 的雙向 ratchet 現在釘的是
  //    **兩件**，而 `penetration.test.ts` 釘 godie-i00f 那一件。
  //
  //    ⚠️ 它們會回來：只要第三份文件再採用 `damageTypeOverride`，reach 就跨回
  //    MIN_REACH，這四個鍵會立刻以 unexplained 的身分重新出現在報告上。那一天請去
  //    `git log -p` 這一段把原文撈回來（`applyAt` 是 default-live，另外三個 enum
  //    成員是 debt，理由是上面那整段「列舉比內容寬，而且是故意的」）——
  //    ⛔ 不要重寫一份新的理由，那會是第二份會分家的說法。

  // ══ G7 授權格第二批 2026-08-09（GH#299 第 6 條「授權格要放寬」）════════════
  //
  // ⚠️ 這六筆是**同兩個欄位**在三個新授權面上的節點，不是六個機制。
  // `attributes`（三圍）與 `damageTypeOverride`（傷害型別轉換）在 2026-08-09
  // 之前**只有道具**寫得出來，而擋住其餘三面的從來不是引擎 —— 真的跑過模擬：
  // 把兩者掛在 `kind:"buff"/"augment"/"passive"` 的來源上，`liveAttribute` 與
  // `resolveDamageConversion` 一律照讀（`stats/attrSources.ts` 與
  // `combat/damageTypeOverride.ts` 都走 `StatsComp.sources` 而不問 `kind`）。
  // 擋住的只有 schema 那一格與轉發，這一批補的就是那兩樣。
  //
  // 零採用是**內容決定不是機制缺席**：owner 正在手動重製 90 支技能，
  // ⛔ 契約層依令沒有動 `content/abilities/`；三選一增益卡池也還沒重排（#149）。
  // 行為守衛：`sim/stats/sourceGrants.test.ts`（三個授權面各讀出貨消費端，
  // 兩個突變都驗過會紅 —— 拿掉轉發 4 條紅、拿掉 schema 授權格最後那條紅）。
  //
  // 30 天到期。到期仍是 0 時，誠實的問題是「那 90 支技能為什麼還沒進來」。
  "field:abilities.effects[]#applyBuff.attributes": {
    status: "landing",
    since: "2026-08-09",
    why: "限時三圍（「這支大招期間力量 +30」）。以前只有道具授予得起，所以這句話在編輯器上沒有形狀。到期走這份 buff 自己的 expiresAtTick（`sourceAttrGrants` 已經在跳過過期來源），沒有第二個時鐘。",
  },
  // ⭐ 2026-08-12 B2：landing 豁免移除 —— **它落地了**（60-03 三角神力．勇氣 + 44-02 死神的規則）。
  //    出口在 `tools/skill-remake/batch1.py` 開了、表格填了值，採用率從 0 變成有。
  "field:abilities.passive.ranks[].damageTypeOverride": {
    status: "landing",
    since: "2026-08-09",
    why: "天生技授予傷害型別轉換（「這位英雄的普攻無視防禦」在此之前只能靠一件裝備）。與道具同一格、同一個解析器、同一組 scope 語意。",
  },
  "field:augments.attributes": {
    status: "landing",
    since: "2026-08-09",
    why: "三選一增益卡授予三圍。⚠️ 與 #260 的「能力屬性強化」**不是**同一條路：那張卡走 `ChampionComp.attrBonus`（永久累加），這一格騎在 source 上（卡片被移除就跟著消失），兩者由 `sourceAttrGrants` 折在同一個地方，下游分不出來。",
  },

  "field:champions.abilities.*.marks": {
    status: "landing",
    since: "2026-08-08",
    why: "具名標記（十二道試煉／風王結界／縮地）剛上架。standalone 那一半已經有使用者（`abilities.marks` = 1/696，`godie-hapm.passive`），紅的是 **champion 文件裡的內嵌鏡像**。⚠️ 這一格的零採用是**結構性的、預期永遠成立的**，不是「還沒有人用」：champion doc 的 `abilities` 只內嵌 Q/W/E/R，PASSIVE 與 EX 走 `passiveAbility`/`exAbility` 兩個字串參照（見 `content/champions/godie-hapm.json`）。而標記天生屬於天生技那一族 —— 它是「這個英雄整場帶著的東西」。所以要讓這一格自然變綠，需要的是一支把標記掛在 Q/W/E/R 上的技能（完全合法，例如「Q 命中累積層數，滿 5 層強化 R」），而不是把十二道試煉搬進鏡像。⛔ 若三十天後仍是 0，正確的處置是問「Q/W/E/R 標記到底該不該存在」，不是延長這筆豁免。",
  },

  "field:items.auras[].lingerSec": {
    status: "landing",
    since: "2026-07-30",
    why: "WC3's aura buff-tail. There is NO number to port — `Dur`/`HeroDur` is 0 on all 32 stock aura rows (see zAuraDef.lingerSec), so an authored value is a design choice or the anti-flicker knob. The three item auras shipped today are all pure in/out, which is the intended resting state.",
  },

  // ── RESTORED 2026-07-30, and the reason is the whole point of this census ──
  // These three were DELETED earlier today, correctly: fixing 66-04 靈壓震撼
  // (it was a permanent, free, always-on −65 % enemy attack-speed field AND a
  // dead R button) dropped `passive.ranks[].auras` to reach 1, and the CASCADE
  // rule hid its optional children. Their triage was preserved as prose ~350
  // lines below so the next aura to ship could restore them verbatim.
  //
  // That next aura arrived the same day: the 天生技 lane shipped four
  // (`godie-h01n` / `h01o` / `n01b` / `nman`), reach went 1 → 5, the cascade
  // stopped hiding the children, and the census went red again — correctly,
  // because a visible key with zero adoption and no exemption is exactly what
  // it is built to shout about. Restored below with the ORIGINAL triage, which
  // was measured against the retail MPQ `AbilityData.slk` plus the map's own
  // w3a — not against the schema comments, which disagreed with it.
  "field:abilities.passive.ranks[].auras[].lingerSec": {
    status: "landing",
    since: "2026-07-30",
    why: "MEASURED, there is no number to port: `Dur1`/`HeroDur1` is 0 on all 32 stock aura rows AND on both imported auras (`A0GM`, `A0ID`). WC3's tail is ENGINE behaviour; authoring one would be inventing content. If we ever want it, it is uniform across every aura and belongs in a 後台-tunable default, not per-doc.",
  },
  // ⭐ 2026-08-19 —— `field:abilities.passive.ranks[].auras[].hooks` 的豁免**刪掉了**：
  // 71-00 暗夜契約的「敵方在附近施法有 12% 機率魔力全失」就是靠它落地的
  // （`affects:"enemy"` 的一圈 × `on:"onAbilityCast"` × `spendMana`）。
  // ⚠️ 那半支技能在此之前是 `sim/nightPact.ts` 裡的 55 行專屬程式，
  // 而這一格豁免的存在正好證明了它：機制早就在，只是沒有人用它寫技能。
  // --- 【死亡遺留】的另外兩個授權面（2026-08-19）--------------------------
  "field:abilities.effects[]#applyBuff.deathWard": {
    status: "landing",
    since: "2026-08-19",
    why: "第九個「騎在來源上的授予」一次落在五個授權面上（天生技 rank / 切換技 whileOn / 道具 / 增益卡 / applyBuff），而落地的第一支只用了天生技那一面（71-00 暗夜契約）。⛔ 這一格不是投機：`applyBuff` 那一面是「大招期間陣亡的人才留下遺留物」唯一寫得出來的形狀，而它到期由那份 buff 自己收掉。要嘛有人 author 第一支限時死亡遺留技能，要嘛把 `deathWard` 從 `SOURCE_GRANT_SHAPE` 拿掉改成只掛 rank —— 兩條都是明確的動作，⛔ 不是永久豁免。",
  },
  "field:augments.deathWard": {
    status: "landing",
    since: "2026-08-19",
    why: "同上，三選一增益卡那一面。「這一場剩下的時間，敵人陣亡處留下一圈治療」是一張顯而易見的卡，而它零程式；今天沒有任何一張三選一卡用它。與上面那一格同進退。",
  },
  "enum:abilities.passive.ranks[].auras[].affects=all": {
    status: "landing",
    since: "2026-07-30",
    why: "A DECISION, not a migration. No teamless unit can receive an aura under any value of `affects` (`world.stats.set` is called only in spawnChampion.ts / auraCarrier.ts), and 0 of the 86 aura-derived map abilities target friend and enemy together. Either author the first friend-and-foe aura or DELETE the member together with `AuraAffects` and the `affects === \"all\"` early-return in `affectsTarget`.",
  },
  // --- 批 1 · Hook 詞彙加寬（稜彩卡計畫，2026-08-04）-----------------------
  // 這一批的**設計就是零採用**：它「解鎖 0 張卡，是 10 張卡的前置」。三個新的
  // union 成員與一格 scope 是後面 11 批寫內容時要引用的字彙 —— 先立字彙，
  // 後面每一批才不會各自發明一套。第一批真的會用到它們的內容是批 2（
  // master-of-duality / doomsayer 的堆層）與批 4（mystic-punch）。
  //
  // ⚠️ 為什麼是 `landing` 而不是 `default-live`：這些成員**沒有**程式預設可以
  // 退回去。`victim: "enemyChampion"` 不會從任何地方自己發生，它要有一份文件
  // 寫下來才存在。所以 30 天之後這一格再紅一次是對的 —— 那時候如果還是零，
  // 代表批 2/4 沒有落地，而那才是真正該被看到的事實。
  "enum:abilities.effects[]#applyBuff.hooks[].victim=allyChampion": {
    status: "landing",
    since: "2026-08-04",
    why: "`enemyChampion` 的另一半（同一次列舉加寬）。它比 enemyChampion 更遠：17 張卡裡沒有一張需要「只對隊友觸發」，留著是因為做成單邊的過濾器會讓下一張『鼓舞隊友』的卡再改一次 union。守衛同上 ①。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].damageSource=other": {
    status: "landing",
    since: "2026-08-04",
    why: "`ability` 的補集（既不是普攻也不是技能：火圈、守衛塔、小怪）。列舉加寬時一起做，因為「只加正面那一半」的過濾器等於逼下一個作者用 not() 繞路。守衛同上 ②。",
  },
  "field:items.passive[].internalCooldownScope": {
    status: "landing",
    since: "2026-08-04",
    why: "同一個欄位落在共用的 zHookDefBase 上，所以普查在道具與技能 applyBuff 兩個節點各看到一次（同 fromResource 那一格的形狀）。道具這一側今天沒有需求：每一件道具被動的 ICD 都是「這件裝備多久觸發一次」，不分槽位。分兩份 schema 只為了讓其中一邊閉嘴，會讓這條規則變成兩份。",
  },

  // `field:items.passive[].victim` LOST ITS EXEMPTION on 2026-08-01: 天生牙
  // (godie-i031) adopted it, and the field is the whole design of that card —
  // 「殺死任一個敵方**英雄**單位」 revives, 「殺死任一個敵方**單位**」 heals, and the
  // two clauses are otherwise identical. 甘豆腐之袍 (godie-i03f) is the second
  // customer. Deleting the entry is the entire fix, per this file's own message.

  // --- 無敵/免疫 (GH#289 lane P3, content bound 2026-07-30) ---------------
  // These four enum members were UNREACHABLE until today: the census only
  // descends into a variant's own fields once the variant itself has adoption,
  // and `variant:abilities.effects[]#invulnerable` was 0/805 until the 13 docs
  // below were bound. So they are new-today in exactly the sense `landing` is
  // for, and the clock starts now.
  //
  // WHAT IS ACTUALLY MISSING. The 13 bound docs are the ones with a JASS
  // site to point at (`SetUnitInvulnerable` / `UnitAddAbility('Avul')` in
  // war3map.j) — every one of them is a full-invulnerability window on the
  // CASTER, i.e. `applyTo:"self"` + `blocksDamage:"all"`. The other three
  // damage modes are the map's OTHER invulnerability family, described in
  // ability TEXT with no JASS trigger:
  //   · 魔法免疫  47-04 天翔龍閃 / 97-04 火產靈神 / 99-04  → blocksDamage:"magic"
  //   · 純免控    07-01 臨、兵、鬥「可抵擋對方負性魔法」    → blocksDamage:"none"
  // Binding those needs a description-vs-JASS adjudication (the map has no
  // trigger for them, so the WC3 native ability data is the only source), and
  // that is a separate pass — NOT something to guess at here.
  //
  // ⚠️ CORRECTION 2026-07-30 (第三守則 — the previous version of this comment
  // was WRONG and is kept visible rather than quietly rewritten). It claimed
  // "every one of the bound docs is a window on the CASTER" and that
  // `applyTo:"target"` is text-only with "no JASS trigger". Re-reading
  // war3map.j, both halves are false — there are TWO `UnitAddAbilityBJ('Avul', …)`
  // sites whose subject is the SPELL TARGET, not the caster:
  //   · :51731  Trig_Trample_Start   → udg_Buncle_trample_Target  (52-02 蹂躪編年史)
  //   · :52065  Trig_Nine_Lives_EX   → udg_Buncle_Nine_Target     (52-002 射殺百頭,
  //             which grants Avul to the caster at :52064 AND the target at :52065)
  // So `applyTo:"target"` has a real JASS provenance, and the two 52-xx docs
  // currently ship `applyTo:"self"` — 52-002 is half-right (it keeps the caster
  // grant, drops the target one) and 52-02 is inverted outright.
  // NOT fixed here on purpose: in WC3 the victim's Avul is a MECHANIC SHIELD
  // (PauseUnit + SetUnitPathing false + 'Arav' raven form) that keeps the body
  // alive while it is carried, and the ability's own damage lands only after
  // :51835 removes it. Porting that as-is would make our trample refuse its own
  // damage packet. Whether GGD wants the fidelity or the simpler self-window is
  // a DESIGN DECISION for the owner, not something to guess at while the
  // exemption clock is the only thing forcing the question.
  // `blocksDamage:"physical"` has no known case in this map at all; if the
  // 30 days expire with it still empty, `debt` or deletion is the honest call.
  "enum:abilities.effects[]#invulnerable.applyTo=target": {
    status: "landing",
    since: "2026-07-30",
    why: "Has REAL JASS provenance — war3map.j:51731 (52-02 蹂躪編年史) and :52065 (52-002 射殺百頭) both add 'Avul' to the spell TARGET — plus the AoE form 29-03 有功夫無懦夫「統統進入無敵狀態」. Not bound yet because in the source the victim's Avul is a mechanic shield removed (:51835) before the ability's own damage lands; porting it literally would make the skill refuse its own damage. Needs an owner decision (fidelity vs. the simpler self-window), which is why the 30-day clock is the right pressure here.",
  },
  "enum:abilities.effects[]#invulnerable.blocksDamage=physical": {
    status: "landing",
    since: "2026-07-30",
    why: "No 物理免疫-only ability is known in this map; the enum member exists for symmetry. If this is still empty when the grace expires, the honest outcome is `debt` or removing the member.",
  },

  // --- hit-feel: the sim DERIVES every one of these from the damage tier.
  // An authored value is an override, so zero authored overrides is the
  // designed resting state, not a dead mechanism (task #133).
  "enum:abilities.hitFeel.sparkKind=counter": {
    status: "default-live",
    why: "sim/combat/hitFeel.ts:131 emits `counter` itself when the hit is a counter — content authoring it would only pin what the default already picks situationally.",
  },
  "enum:abilities.hitFeel.sparkKind=hit": {
    status: "default-live",
    why: "`hit` IS the default spark (hitFeel.ts SparkKind head). Authoring it explicitly writes the fallback into 662 docs for no behaviour change.",
  },
  "field:abilities.hitFeel.exFreeze": {
    status: "default-live",
    why: "cosmetic client-side EX freeze; the default already applies it to EX hits only. An override is for an ability that wants a non-EX freeze.",
  },

  // --- recovery / cast root: LIVE BY DEFAULT, deliberately (task #181,
  // sim/abilities/abilityRecovery.ts DEFAULT_RECOVERY_SEC = 0.6). Absence of
  // the field does NOT mean absence of the 後搖 — every ability has one.
  // --- #244 hook victim filter. `"any"` IS the absent behaviour, so writing it
  // into a doc is a no-op. The two filtering members ("mob"/"champion") are
  // authored on 黑泥吞噬 and 飛將神弓 respectively, which is the proof the
  // mechanism works end to end.
  "field:abilities.recoveryRoots": {
    status: "default-live",
    why: "defaults false ON PURPOSE (recovery locks output, not movement — abilityRecovery.ts DECISION 2). Zero adoption = no ability has opted into the full lock.",
  },
  "field:abilities.rootWhileCasting": {
    status: "default-live",
    why: "abilitySystem.ts:239 `def.rootWhileCasting !== false` — every cast roots unless a doc opts out, and none does.",
  },
  "field:champions.abilities.*.recoveryRoots": {
    status: "default-live",
    why: "mirror of field:abilities.recoveryRoots.",
  },
  "field:champions.abilities.*.rootWhileCasting": {
    status: "default-live",
    why: "mirror of field:abilities.rootWhileCasting.",
  },

  // ⭐ 2026-08-12 —— 【切換】`ability@1.toggle` 的**兩筆豁免已刪除**（棘輪生效）。
  // 2026-08-08 寫下的預測逐字命中：「兩個客戶（20-01 風王結界 · 70-00 紮根）
  // 住在 content/abilities/，而那個目錄正在被 owner 手動重製」。那一批今天交
  // 回來，20-01 風王結界（`abilities/godie-e002.w`）就是第一份寫 `toggle` 的
  // 文件，英雄卡孿生（`champions/godie-e002`）同一天跟上 —— 舊註解「鏡像規則
  // 要求兩份同時寫，所以它會與標準文件同一天離開這張表」也一起兌現了。

  // --- #205 多層特效模板: the OPTIONAL per-layer overrides ---------------------
  //
  // `field:abilities.vfxLayers` and its champion-embedded mirror USED to sit
  // here as `landing`. Both were deleted on 2026-07-30 because they got
  // adopted: 10 standalone ability docs and 8 champion docs now ship a stack
  // (godie-e008.q/.e, godie-h02r.q, godie-hgam.q, godie-hlgr.e, godie-hvwd.e,
  // godie-nman.w, godie-o02v.w, godie-othr.w, godie-u00j.ex). That is the
  // migration this census was holding open, and it happened.
  //
  // What is left at zero is a DIFFERENT thing: the four optional per-layer
  // override cells and one enum member. Those 10 shipped stacks author
  // `attachTo:"point"`, `delayMs`, `flyHeight` and `w3xScale` — measured, not
  // assumed — and spell every other knob by omission. Each entry below names
  // the admin cell that writes it and the runtime line that reads it, and the
  // WHOLE chain (admin form cell → ability doc → real zAbilityDoc → real
  // VfxSystem → real Babylon ParticleSystem) is driven by
  // apps/client/src/vfx/VfxSystem.layerKnobs.test.ts. So none of these is
  // "schema has a field": an operator who fills the cell sees the picture
  // change, and if that ever stops being true, that file goes red — not this
  // one.
  "enum:abilities.vfxLayers[].attachTo=caster": {
    status: "default-live",
    why: "`caster` IS the absent behaviour: schema/abilityVfx.ts:231 resolves `layer.attachTo ?? \"caster\"`, and render/vfx/abilityLayers.ts:126 only leaves the caster when the value is \"point\". Writing it explicitly therefore produces a byte-identical ResolvedVfxLayer — and because attachTo is not one of the picked override fields it does not enter the pool-key signature either, so not even the particle pool can tell the two apart. The admin dropdown offers it (vfxLayers.ts:134-138 ATTACH_OPTIONS) so an operator can pin a layer down deliberately; all 10 shipped stacks spell it by omission, which is the designed resting state. The sibling member \"point\" is authored on 6 of those 10 docs, which is what proves the enum is read at all.",
  },
  "field:abilities.vfxLayers[].enabled": {
    status: "default-live",
    why: "ABSENT == play. schema/abilityVfx.ts:227 `if (layer.enabled === false) continue` is the only thing this field can do, so `enabled: true` is a no-op and `enabled: false` is a WORKBENCH state — 'mute this layer but keep its settings' while an operator auditions a stack in 鑄技工坊 (admin vfxLayers.ts:157/236, label 「這一層播不播」). Shipped content at zero is therefore correct by construction: a layer that ships disabled is a layer that should have been deleted. Proven live by VfxSystem.layerKnobs.test.ts, which switches the second layer off in the form and watches the engine come back with one emitter instead of two.",
  },
  "field:abilities.vfxLayers[].tint": {
    status: "default-live",
    why: "ABSENT == untinted (keep the template's own ramp). Admin writes it as three 0-255 cells that must be filled together or left blank together (vfxLayers.ts:164-166/248-251 + validateLayerDraft's all-or-nothing rule); runtime consumes it at render/vfx/abilityLayers.ts:56, dividing by 255 into ArtParams before applyArtParams re-hues every stop. Zero adoption = every shipped stack points at a template whose colour is already the colour it wants — which is exactly what #205's 'one prototype, many looks' promises when the prototype was picked well. VfxSystem.layerKnobs.test.ts fills 255/40/40 on an icy-blue template and reads r > b back off the engine, so the recolour is measured, not asserted.",
  },

  // --- absent == identity. Writing the neutral value into every doc is
  // explicitly forbidden by the schema comments (zTintRgb / zAlpha: "we never
  // write [1,1,1]"), so zero here is the schema's own instruction being obeyed.
  "field:champions.alpha": {
    status: "default-live",
    why: "zAlpha: ABSENT == 1 (opaque). No w3x champion is authored translucent, and schema/champion.ts forbids writing the identity value.",
  },
  "field:skins.alpha": {
    status: "default-live",
    why: "same contract as champions.alpha; the 5 shipped skins are all opaque.",
  },
  "field:skins.tint": {
    status: "default-live",
    why: "zTintRgb: ABSENT == untinted, and `[1,1,1]` must never be written. Skin tint is for a recolour variant; none has shipped.",
  },

  // --- structurally impossible here.
  "field:champions.abilities.*.innateKind": {
    status: "schema-impossible",
    why: "zChampionDoc pins the embedded slots to Q/W/E/R, and zAbilityDoc.refineInnate REJECTS innateKind on anything but slot PASSIVE. A doc setting it would fail to load.",
  },

  // --- dead fields kept for compatibility. Adoption would be the bug.
  "field:items.iconKey": {
    status: "superseded",
    why: "the skeleton-era symbolic key, replaced by `icon` (214/214 adopted). schema/item.ts calls it legacy in so many words.",
  },
  "field:status-effects.iconKey": {
    status: "superseded",
    why: "same legacy key as items.iconKey; status effects render from `polarity` + tags today.",
  },

  // --- filled by code, not by files.
  "field:vfx#vfx@1.spriteSheet": {
    status: "runtime-authored",
    why: "apps/client/src/render/vfx/w3xEmitter.ts:520 SYNTHESIZES the VfxDoc and sets spriteSheet from the w3x emitter's rows/cols at load; particleFactory.ts:244 consumes it. Live in matches, absent from content/.",
  },

  // --- 變身 (#249). The `championForm` VARIANT itself is adopted — 3 of the 26
  // w3x pairs ship the effect today (godie-nsjs.e 妖狐變化, godie-umal.r
  // ChangeDNA, godie-ofar.r 瘋狂皮卡丘), which is what proves the path runs end
  // to end. These are its two OTHER direction values, and both are waiting on
  // content that is deliberately not in the first batch:
  "enum:abilities.effects[]#championForm.to=base": {
    status: "landing",
    since: "2026-07-29",
    why: "`to: \"base\"` is a MANUAL cancel — 'drop the form now, before it expires'. No w3x ability asks for one: all 26 metamorphoses either time out on `ahdu` or are toggles, and the automatic reverts (expiry, death, combat end) go through `revertToBaseForm` in ChampionFormSystem, not through an authored effect. It is exercised by championFormContent.test.ts on all 26 pairs, so the direction works; what is missing is a DESIGN decision that some hero should be able to cancel early. Resolve by authoring it on that hero, or reclassify to \"runtime-authored\" once the owner rules that no hero ever will.",
  },
  // --- 護盾類型過濾 (GH#289 lane P6). owner 2026-07-30:「護盾的確有分**吸收所有
  // 傷害**跟**吸收 AP 傷害 only**」. The `magic` member is ADOPTED — 破法對咒
  // (godie-o00l.e / godie-o02s.r plus both champion-embedded mirrors) is the
  // WC3 `Aam2` anti-magic barrier and now says so, which is what proves the
  // filter runs end to end. These are the three OTHER members, and each is
  // zero for a DIFFERENT reason:
  "enum:abilities.effects[]#shield.absorbs=physical": {
    status: "debt",
    why: "the sim honours it (sim/effects/shieldAbsorb.test.ts drives a real step for every member) but NO shipped doc is a physical-only barrier: the map's three shield spells are 破法對咒 (magic, now authored), 守護之光 「阻擋任何傷害」 and 機警 「可抵擋90%傷害」, both genuinely all-type. The member exists because the enum mirrors `DamageType` — the seam's stated reason (sim/effects/effect.ts) — not because content asked. Kept `debt` rather than `landing` so it stays in the banner instead of expiring into silence; delete this entry when a physical-only barrier is imported, or narrow the enum to `\"all\" | \"magic\"` if owner rules none ever will be.",
  },
  "enum:abilities.effects[]#shield.absorbs=true": {
    status: "debt",
    why: "same story as the physical member, one step further: a true-damage-absorbing pool would also eat the arena fire ring (#270 made the burn true damage), which is a balance decision nobody has made. Live in the sim, unused by content, deliberately visible here until it is either authored or removed.",
  },

  // "enum:abilities.effects[]#championForm.to=toggle" exemption DELETED
  // 2026-07-29, exactly as its own text instructed. It held the three w3x
  // toggles back because both halves of each pair share one modelKey, so the
  // swap is invisible — but the owner ruled 「紮根 + 取代芬多精變形」 for
  // 白木卡迪那 #70, and `godie-e00s.passive` (70-00 紮根, A0O6) now ships
  // `to: "toggle"` on the 天生技 slot. The direction is adopted; what a player
  // sees change is the STAT SHEET (armor 2 → 10, the w3a's own
  // 「初使裝甲增加為10點」) and the snapshot's FORM bit, not the mesh.
  // Guarded end-to-end by sim/championFormToggle.test.ts.

  // --- landing: the schema arrived on this branch, the content arrives with
  // the bake it describes.
  "field:models.voxel": {
    status: "debt",
    since: "2026-07-26",
    why: "task #229's 鑄形工坊 studio authors this block and task #226's `pnpm voxel:gen` consumes it; the field is the seam BETWEEN the two, so it lands with the schema and is populated when the first generated model doc is written (the studio's own save, or #226's five archetype docs). Zero adoption today is correct — no generated model exists yet — and NOT permanent: `packages/shared/src/voxel/doc.test.ts` proves a populated doc validates, so the only thing missing is a saved character. Delete this entry the moment one lands. ⚠️ 2026-08-26: re-filed from `landing` to `debt` — the 30-day grace expired and no generated model doc has been written since 2026-07-26. Nothing about the seam changed; what changed is the honesty of the label: `landing` promised imminent adoption and that promise is a month old. `debt` keeps it visible in the banner every run instead of expiring into silence.",
  },

  // "enum:abilities.effects[]#applyBuff.modifiers[].op=capRaise" exemption
  // DELETED 2026-07-28 (#188/#189), exactly as its own text instructed: the
  // owner made the balance call the entry was waiting on, and TWO shipped docs
  // now author the op — `augments/limit-breaker` (稜彩 攻速 ×2 + 解鎖 10.0) and
  // `items/endless-edge` (傳說近戰武器). The mechanism is no longer a mechanism
  // with no content.

  // `enum:arenas.groundStyle=wood` exemption DELETED 2026-08-17 (GH#342): the
  // arena-art batch gave 天空鬥技場 a real `wood` floor, so the member is adopted
  // and this row would now be STALE. It also outlived its own justification —
  // `groundMaterials.ts` used to carry a hand-written `wood → stone` fallback,
  // i.e. anyone who did use `wood` got silently downgraded to flagstone. That
  // table is gone; the style ids now live in `schema/groundStyle.ts` and every
  // one of them has a painter and a PNG on disk.

  // --- the same id, on the OTHER axis: authored in `map@1` but not yet used there.
  "enum:abilities.effects[]#applyBuff.hooks[].on=onUltimateHit": {
    status: "default-live",
    why: "GH#354（owner 2026-08-17 的引擎盤點）—— 「大絕打中的時候⋯」——`abilityHit` 的 slot 切片。 機制**整條路都通了**（enum → WorldHookSystem 的發射列 → fireHooks），內容側 0 筆是因為這一批是**先開路再寫卡**：owner 列這張清單的理由就是「現在寫不出這種句型」。⚠️ 這條豁免的到期日就是第一張用它的卡上架的那天，而那天這一列會因為 STALE 而紅 —— ⛔ 到時候刪掉它，不要延期。守衛：sim/systems/worldHookGh354.test.ts（驗每一個都真的有人發，⛔ 不是掃 enum）。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].on=onCrowdControlApplied": {
    status: "default-live",
    why: "GH#354（owner 2026-08-17 的引擎盤點）—— 「控到人的時候⋯」——`statusApplied` 裡帶 `cc` 標籤的那些，施加者視角。 機制**整條路都通了**（enum → WorldHookSystem 的發射列 → fireHooks），內容側 0 筆是因為這一批是**先開路再寫卡**：owner 列這張清單的理由就是「現在寫不出這種句型」。⚠️ 這條豁免的到期日就是第一張用它的卡上架的那天，而那天這一列會因為 STALE 而紅 —— ⛔ 到時候刪掉它，不要延期。守衛：sim/systems/worldHookGh354.test.ts（驗每一個都真的有人發，⛔ 不是掃 enum）。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].on=onHeal": {
    status: "default-live",
    why: "GH#354（owner 2026-08-17 的引擎盤點）—— 「治療生效的時候⋯」——`heal` 事件（`restore.ts` 已經擋掉零治療）。 機制**整條路都通了**（enum → WorldHookSystem 的發射列 → fireHooks），內容側 0 筆是因為這一批是**先開路再寫卡**：owner 列這張清單的理由就是「現在寫不出這種句型」。⚠️ 這條豁免的到期日就是第一張用它的卡上架的那天，而那天這一列會因為 STALE 而紅 —— ⛔ 到時候刪掉它，不要延期。守衛：sim/systems/worldHookGh354.test.ts（驗每一個都真的有人發，⛔ 不是掃 enum）。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].on=onProjectileExpire": {
    status: "default-live",
    why: "GH#354（owner 2026-08-17 的引擎盤點）—— 「投射物消失的時候⋯」——`projectileEnd`，持有者是**發射者**不是投射物。 機制**整條路都通了**（enum → WorldHookSystem 的發射列 → fireHooks），內容側 0 筆是因為這一批是**先開路再寫卡**：owner 列這張清單的理由就是「現在寫不出這種句型」。⚠️ 這條豁免的到期日就是第一張用它的卡上架的那天，而那天這一列會因為 STALE 而紅 —— ⛔ 到時候刪掉它，不要延期。守衛：sim/systems/worldHookGh354.test.ts（驗每一個都真的有人發，⛔ 不是掃 enum）。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].on=onBoundaryTouch": {
    status: "default-live",
    why: "GH#354（owner 2026-08-17 的引擎盤點）—— 「碰到場地邊界的時候⋯」——火圈就是這張地圖的邊界，吃 `fireRingDamage`。 機制**整條路都通了**（enum → WorldHookSystem 的發射列 → fireHooks），內容側 0 筆是因為這一批是**先開路再寫卡**：owner 列這張清單的理由就是「現在寫不出這種句型」。⚠️ 這條豁免的到期日就是第一張用它的卡上架的那天，而那天這一列會因為 STALE 而紅 —— ⛔ 到時候刪掉它，不要延期。守衛：sim/systems/worldHookGh354.test.ts（驗每一個都真的有人發，⛔ 不是掃 enum）。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].on=onRoundStart": {
    status: "default-live",
    why: "GH#354（owner 2026-08-17 的引擎盤點）—— 「回合開始時⋯」——`MatchController` 發，`world` scope。 機制**整條路都通了**（enum → WorldHookSystem 的發射列 → fireHooks），內容側 0 筆是因為這一批是**先開路再寫卡**：owner 列這張清單的理由就是「現在寫不出這種句型」。⚠️ 這條豁免的到期日就是第一張用它的卡上架的那天，而那天這一列會因為 STALE 而紅 —— ⛔ 到時候刪掉它，不要延期。守衛：sim/systems/worldHookGh354.test.ts（驗每一個都真的有人發，⛔ 不是掃 enum）。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].on=onRoundEnd": {
    status: "default-live",
    why: "GH#354（owner 2026-08-17 的引擎盤點）—— 「回合結束時⋯」——同上，而且是唯一帶 `firesOutsideCombat` 的一列。 機制**整條路都通了**（enum → WorldHookSystem 的發射列 → fireHooks），內容側 0 筆是因為這一批是**先開路再寫卡**：owner 列這張清單的理由就是「現在寫不出這種句型」。⚠️ 這條豁免的到期日就是第一張用它的卡上架的那天，而那天這一列會因為 STALE 而紅 —— ⛔ 到時候刪掉它，不要延期。守衛：sim/systems/worldHookGh354.test.ts（驗每一個都真的有人發，⛔ 不是掃 enum）。",
  },
  "enum:maps.groundStyle=sand": {
    status: "default-live",
    why: "`sand` (raked arena sand) IS shipped and IS on screen — `content/arenas/arena.colosseum.json` (羅馬大擂台) uses it. What has zero adoption is the `map@1` half: colosseum is a hand-authored arena doc that predates the map compiler (GH#324/#342), so no `content/maps/*.json` declares `sand`. The painter, the PNG and the runtime lookup all exist; this row is about which AUTHORING surface reaches it, not about a dead mechanism. It expires the day someone rebuilds colosseum as a compiled map.",
  },

  // ===================================================================
  // DEBT — real S8s. Each of these is a mechanism that ships and never
  // happens. They print as a banner on every run until someone fixes them.
  // ===================================================================
  // "field:abilities.passive.ranks[].auras" exemption DELETED 2026-07-25: the
  // JASS effect-audit batch converted 66-04 靈壓震撼 (godie-e00t.r, A0IC/A0ID)
  // to a passive slow-aura — the first content aura, so the key is adopted.
  // ⚠️ 2026-08-27（GH#757）—— 這兩列**在此之前指不到任何開著的票**：它們引用的
  //    #114 早就被關掉，而 debt 的定義（本檔 :53-55）是「每一次跑都印一條 banner」
  //    ⇒ 一條每跑必吼、而吼給誰聽沒有人說得出來的債。順帶：舊 why 寫的「662 支技能」
  //    也早就過期（今天是 421 份 ability doc · 71 份 champion doc）——
  //    第三守則的形狀：一個被散文守著的數字活過了保存期限，而沒有東西變紅。
  "field:abilities.descriptionRoles": {
    status: "debt",
    why: "GH#757（接手已關的 #114）—— 語意色彩鏈**有渲染沒有輸入**：schema 開了欄位、`abilityText.ts::parseRoleMarkup` → Tooltip / Codex 四個消費端全部活著，而 2026-08-27 實查 `content/abilities`（**421** 份）與 `content/champions`（**71** 份）採用數仍是 **0**，importer 的產出函式 `tools/w3x-import/w3xlib/wts.py::to_role_markup` **零呼叫者** ⇒ 重跑 importer 也產不出東西。⭐ #757 要的是**收乾淨（拆或餵，選一條）**，⛔ 不是把這一列改成 landing 讓它安靜。⚠️ 選『餵』之前必須先修 `abilityText.ts` 兩條正則與 `parseRoleMarkup` 的呼叫順序（先 rescale 再 parse ⇒ 插入 `[/c]` 之後冷卻/傷害數字不再被乘倍率，卡面會直接說謊）。⚠️ 兩條出路**都動不了只有 schema 的一半**：拿掉這個欄位會讓 `content/editor-target-profile.json`（skillremake:json）、`docs/editor-contract/ggd-runtime-capabilities.{md,json}`（caps:export）、`docs/技能標記機制與效果規則.md`（spec:build）四份產物同時過期。",
  },
  "field:champions.abilities.*.descriptionRoles": {
    status: "debt",
    why: "GH#757 —— 上面那一列的 champion-embedded 鏡像（STRICT 鏡像規則 ⇒ 兩邊一起動、一起收）。2026-08-27 實查 71 份 champion doc 採用數 0。⛔ 不要單獨處置這一列：只收一邊就是把鏡像規則破掉。",
  },
  // `field:champions.abilities.*.hitFeel` was exempt here as "a MIRROR GAP, not a
  // plain zero" — 30 standalone ability docs carried hitFeel and 0 of their
  // champion-embedded twins did. The gap is closed: all 30 embedded copies now
  // carry it, so the exemption became a lie and this suite said so. Deleted
  // rather than re-worded, which is what the stale-exemption check asks for.
  "field:champions.baseAttackTime": {
    status: "debt",
    why: "task #144 (per-champion w3x movement/attack speed) is still pending, so all 113 champions use BasicAttackSystem.ts:173's `?? 1.0` and every hero attacks at the same base cadence — the w3x per-hero values were never imported.",
  },
  // ⭐ 2026-08-13 B3：landing 豁免移除 —— 它落地了（89-01）。
  // --- B2 · damageType / damageCrit (2026-08-05) ----------------------------
  //
  // 機制今天上架:`TriggerDamage` 多了 `type` 與 `crit`,`hooks.ts` 兩道閘坐在
  // ICD 與骰子之前,載入時的閘擋掉掛錯事件的文件,行為守衛在
  // `sim/effects/hookVocabulary.test.ts`(⑤ 段,五個突變都驗過)。
  //
  // ⛔ **內容是零,而且原因是具體的,不是「還沒空寫」**:
  // 全 repo 只有一份文件的文案在講這件事 —— 天堂之劍 `godie-i01n`:
  //
  //     「[暴擊吸血] 6%機率造成10倍暴擊傷害,暴擊時吸血回復100%傷害」
  //
  // 它的第二句需要一個**今天不存在的原語**:「治療觸發這一發的 X%」。
  // `heal` 只吃 `zScaling`(flat / perRank / ratios),讀不到那一發打了多少;
  // 對稱的東西只有 `damage.incomingPct`(反彈那一發的 X%),而它是傷害不是治療。
  // 硬寫成 `heal{flat: N}` 等於**發明一個 owner 沒說過的數字**,那比零採用更糟。
  //
  // ⚠️ 順帶查到的、更嚴重的事:天堂之劍**整段上半都沒實作** —— 它今天只有
  // `maxHealth −50%`,是一件**純壞處**的道具。已開 issue,不在這一批處理
  //(改它的暴擊數值是平衡決策,而它是 `craftRole: "quest"` 且 quest-rewards
  // 已在 `retiredLootTables` 裡,所以今天沒有玩家拿得到)。
  //
  // ⭐ 2026-08-12 —— 四條剩三條:`field:abilities.effects[]#applyBuff.hooks[].damageType`
  // 的豁免**已刪除**(棘輪生效)。上面那句「全 repo 只有一份文件的文案在講這件事」
  // 在 90 支重製技能進來之後不再成立 —— `godie-e002.passive` 與 `godie-edem.passive`
  // 各自用 `damageType` 把觸發器窄化到一種傷害型別,而它們**不需要**那個缺席的原語。
  // ⚠️ 真正卡在「治療觸發這一發的 X%」上的只有 `damageCrit` 那一半。
  // 30 天後這三條會自己再紅一次 —— 那時該有的是原語,不是更長的理由。
  // ⭐ 2026-08-13 B3：landing 豁免移除 —— 它落地了（89-01）。
  "field:items.passive[].damageType": {
    status: "landing",
    since: "2026-08-05",
    why: "同上,道具那一面的同一格。天堂之劍正是一件道具,所以它會是這一格的第一個採用者。",
  },
  "field:items.passive[].damageCrit": {
    status: "landing",
    since: "2026-08-05",
    why: "道具那一面的【暴擊時】。這四格裡它是最接近被採用的一格 —— 天堂之劍 godie-i01n 是一件道具,它的文案「暴擊時吸血回復100%傷害」就是這一格的第一個消費者,卡住它的是缺一個「治療觸發這一發的 X%」原語(`heal` 只吃 zScaling,對稱的 `damage.incomingPct` 是傷害不是治療)。",
  },
  "enum:items.craftRole=token": {
    status: "legacy-parked",
    witness: "content/_legacy/items/godie-i04y.json",
    why: "8 件 `craftRole:\"token\"` 的兌換券（兌換空罐頭／兌換仙后座／認領寵物…）在 2026-08-18 隨「已經沒上架的武器道具」一起搬進 `content/_legacy/items/`。它們零 payload、零價格、`arena-rules.itemDraft.excludedCraftRoles` 出貨值逐字含 `token`，而且不在任何一張抽獎表上 —— 所以歸零是**移出營運樹**的結果，⛔ 不是引擎少了什麼：`shopCatalogue` 與 `itemOfferableTo` 兩條路都還讀得懂這個成員，只是這一版沒有一件內容用它。",
  },
  "enum:items.craftRole=direct": {
    status: "debt",
    why: "extract_item_roles.py recovers 7 roles from the map triggers and assigned `direct` to nothing across 214 items. Either the extractor never emits it (a recovery gap worth checking against the JASS) or the role is redundant and should leave the enum.",
  },
  // `enum:status-effects.polarity=buff` used to sit here: all 5 shipped
  // status-effect docs were debuffs. The #247 JASS-fidelity follow-up adopted
  // it — `moon-combo` is the 者、皆、陣 combo window (war3map.j:34438), a
  // caster-side marker that is unambiguously positive — so the exemption became
  // a lie and was deleted, which is exactly what this census asks for.
  // 鑄技工坊 (Skill Forge P1, #141/#205). `field:abilities.template` USED TO SIT
  // HERE, exempted with 「NO existing content doc references a template yet」.
  // On 2026-08-02 that stopped being true: 143 standalone ability docs were
  // re-authored onto the enabled families, each one proved lossless against its
  // pre-conversion `git show HEAD:` effects, so the entry became a lie and was
  // DELETED — which is exactly what this census asks for.
  //
  // ⚠️ `field:champions.abilities.*.template` ALSO used to sit here, exempted as
  // 「the mirror writeback was not part of that lane」. The standalone→embedded
  // sync ran the same day (106 embedded slots across 47 champions), so that
  // exemption became a lie too and was deleted. This census is what caught it:
  // it went red the moment the mirror adopted the key, which is the whole point
  // of pinning exemptions to MEASURED adoption rather than to a hand-kept list.
  // Both of these only became REACHABLE (denominator 0 → 143) when the docs above
  // adopted templates; neither is a gap the adoption failed to fill.
  "field:abilities.template|0.onConflict": {
    status: "default-live",
    why: "the stack conflict policy is only expressible in the {cards,onConflict} binding shape, and all 143 adopters use the 1-card {ref,params} shape — where a conflict is arithmetically impossible (there is no second card to collide with). The shipped behaviour comes from DEFAULT_TEMPLATE_CONFLICT=\"reject\" in schema/template.ts; the field exists to OVERRIDE it on a real multi-card stack.",
  },
  "field:abilities.template|0.cards[].version": {
    status: "debt",
    why: "the §5 breaking-migration hook. zAbilityTemplateCard accepts it, but NOTHING reads it — normalizeTemplateBinding/expandStack never branch on a card version, so a doc that set it would be inert (the same shape as the onLevelUp hook above). Resolve by implementing version-aware re-expansion or by deleting the member — do not 'adopt' it.",
  },

  // ── 靈氣 (auras) — the container FELL BACK UNDER MIN_REACH on 2026-07-30 ---
  // It crossed the floor on 2026-07-29 when 66-04 靈壓震撼 (abilities/
  // godie-e00t.r + its champion mirror) joined 70-00 芬多精 (abilities/
  // godie-e010.passive). 66-04 has since been withdrawn from the aura family,
  // and NOT as a balance whim: `A0IC`'s base is `AEim` (Immolation), a TOGGLE,
  // and war3map.j hands the slow aura `A0ID` to the player ONLY while that
  // toggle is up — `SetPlayerAbilityAvailableBJ(false,'A0ID',…)` at spawn
  // (j:48787), `true` on the `immolation` order (j:48915), `false` again the
  // moment buff `B025` drops (j:48941). Authored as a PERMANENT passive it was
  // a free, always-on −65 % enemy attack-speed field, and the R button was
  // simultaneously dead (`isPassiveOnly` → `"passive"`). It is now a real cast;
  // see abilities/godie-e00t.r.json and sim/abilities/inertActives.test.ts.
  //
  // So `passive.ranks[].auras` is back to reach 1 (70-00 芬多精 alone), THE
  // CASCADE RULE hides its optional children again, and the three exemptions
  // that used to sit below — `…auras[].lingerSec`, `…auras[].hooks` and
  // `enum:…auras[].affects=all` — were DELETED rather than re-worded, which is
  // what this census asks for when it stops claiming anything about a key.
  // Their triage is preserved here so the next aura to ship can restore them:
  //   · lingerSec — MEASURED, there is no number to port: `Dur1`/`HeroDur1` is
  //     0 on all 32 stock aura rows AND on both imported auras (`A0GM`,
  //     `A0ID`). WC3's tail is ENGINE behaviour; authoring one would be
  //     inventing content, and if we ever want it, it is uniform across every
  //     aura and belongs in a 後台-tunable default.
  //   · hooks — NOT "nobody needs it": 86 map abilities derive from a stock
  //     aura row and only 1 is now ported. Waiting: three Thorns auras (`ACah`
  //     CP-00 棘刺之光, `AEah` 25-04 無想轉生 7/14/21 %, `A0XK`) and three
  //     Plague auras (`Aap1`/`Aap2`/`Aap3` 汗臭味 / 疫病雲). Neither reflection
  //     nor a periodic tick is expressible as a `StatModifier`. Resolve by
  //     porting 無想轉生 onto an `onDamageTaken` aura hook.
  //   · affects=all — a DECISION, not a migration. No teamless unit can receive
  //     an aura under any value of `affects` (`world.stats.set` is called only
  //     in spawnChampion.ts / auraCarrier.ts), and 0 of the 86 aura-derived map
  //     abilities target friend and enemy together. Either author the first
  //     friend-and-foe aura or DELETE the member together with `AuraAffects`
  //     and the `affects === "all"` early-return in `affectsTarget`.
  //
  // All four were triaged against the SOURCE (`Units\AbilityData.slk` out of
  // the retail MPQs + the map's own w3a) rather than against the schema
  // comments, and they did NOT come out the same way. The evidence, once:
  //
  //   · stock FRIENDLY aura rows in AbilityData.slk list `self` in
  //     `targs1`; the ones that do not are the emplacement regen auras `Aoar`
  //     (Ward) and `Aabr` (Statue) — while `AIgx`, the same aura carried by a
  //     hero as an item, puts `self` back.
  //   · `Dur1` / `HeroDur1` is 0 on ALL 32, and on both imported auras.
  //   · the map derives 86 abilities from those 32 rows; 2 are ported.
  //   · 0 of the 86 target friend AND enemy.
  //
  // `field:abilities.passive.ranks[].auras[].includeSelf` was exempt here as
  // "default-live — both shipped auras want the default". The source says
  // otherwise: 70-00 芬多精 is `A0GM`, base `Aoar`, `targets_allowed` NOT
  // overridden, so it carries no `self` and does not heal 白木卡迪那 itself.
  // The honest resolution was option 1 (AUTHOR THE CONTENT), so
  // `abilities/godie-e010.passive.json` now ships `includeSelf: false` and the
  // entry is deleted. It also took a code fix to become real: `includeSelf` is
  // tested as `target === self` and a 虛擬蝗蟲群 is kept out of the broad phase,
  // so the host used to arrive through the `ally` branch and the field could
  // not move a number — aura.ts now resolves 「self」 through
  // `world.auraCarrier`. Guarded end-to-end by sim/auraIncludeSelf.test.ts.
  "variant:abilities.effects[]#evasion": {
    status: "landing",
    since: "2026-07-30",
    why: "GH#289 lane P5 landed the MECHANISM (sim/effects/evasion.ts + the DECISION-5 ability channel in combat/evasion.ts); the content half is a separate lane and content/ is a single-threaded domain this session. NOT 'nobody needs it' — the source map has named abilities waiting: the timed-dodge shape is 12-00 感應意脈 (+20% 迴避), 74-00 JENOVA (15%), 92-00 憂鬱的眼神 (18%). Note the STAT half is already adopted (13 content files author `stat: evasion` on 3 champion docs, 8 ability docs and the phantom-step augment), so what is unadopted is specifically the TIMED-GRANT effect variant, not the evasion axis. Resolve by porting one of those three onto an `evasion` effect with an explicit durationSec; the 30-day expiry is the reminder, because 'the primitive landed, the content did not' is exactly the S8 this census exists to catch.",
  },
  // ══ 2026-08-22 · #541【連段】與 #147【吸引】═══════════════════════════════
  // 兩支都是**機制先落地、內容接在後面**的同一個形狀，而且兩支都有**點名的**
  // 技能在等（⛔ 不是「沒有人需要」）—— 那正是這條普查要的那種豁免理由。
  "variant:abilities.effects[]#pull": {
    status: "landing",
    since: "2026-08-22",
    why: "#147 落地的是**機制**（sim/effects/pull.ts：destination 三檔 caster / point / anchorRing，等分錨點環用單位旋轉常數表因為 sim/** 禁三角函式），內容那一半由主 session 接。⛔ NOT 「沒有人需要」：A091 05-03 及喀爾度（godie-h021.e / godie-hblm.e）的 JASS 白紙黑字是 `2×等級` 個錨點 + `250+100×等級` 半徑（war3map.j:28224-28233），而它今天寫不出來 —— `knockback` 的 from:\"pull\" 只推得動一段長度而且會走 GH#193 的距離減法（對拉是反過來的）。`content/ability-templates/tpl-pull-throw.json` 也還掛著 status:\"draft\" 等這一格。接內容的做法寫在報告的『需要主 session 接線』。機制由 sim/effects/comboAndPull.test.ts 釘住（兩具身體真的被搬到環上、而且去的是不同的錨點）。",
  },
  "variant:abilities.effects[]#summon": {
    status: "landing",
    since: "2026-07-30",
    why: "GH#289 lane P2 landed the MECHANISM (sim/effects/summon.ts + sim/summons.ts: real bodies through the SHARED mobs.spawnUnitBody, the champion stat pipeline via the SummonComp level seam, formation/lifetime/team/cap/owner-death as content fields, and summonSystem at step slot 9d″); the content half is a separate lane and content/ is a single-threaded domain this session. NOT 'nobody needs it', and that is MEASURED not asserted: docs/ability-templates.md classifies 52 map abilities as 「召喚代理」 — the largest single behaviour family in the game — and the TRUE-summon subset among them is named and sourced. 96-04 獨孤九劍 spawns 9 sword spirits 'o02X' with a 10 s timed life (j:44907-44930); 91-002 亡靈大軍 rings 8 ghouls 'u031' at 450u and orders them at the target point (j:53391); 18-04 億年樹 summons 'n010' for 9 s × level (j:28040-28106); 37-02 黑核晶 caps concurrent crystals at 7 and 「超過殺最舊」 (j:44592-44657) — which is literally where `maxAlive` + `onCap: \"replaceOldest\"` come from; 35-00 召喚佩 is a persistent pet (j:42909-42915); 33-01 放山雞 spawns 'n000'. Today every one of those is text-only. Resolve by porting 96-04 or 91-002 onto a `summon` effect (both are `formation: \"ring\"` + `durationSec`, i.e. no new mechanism needed). The mechanism itself is proven end to end by sim/effects/summon.test.ts, which runs a real SimWorld.step() and reads the bodies back off world.transform / world.health / world.team, with recorded mutations on expiry, cap, eviction and owner-death. The 30-day expiry is the reminder, because 'the primitive landed, the content did not' is exactly the S8 this census exists to catch.",
  },
  // ══ 2026-07-31 技能批次:條件系統 + 擊退 + 變身天生技一起落地 ══════════════
  // 這一整段是同一天四條 lane 的產物,所以它們的 zero 有同一個形狀:
  // **機制上線了,而第一批內容只用了每個選項裡的一個**。逐條分開寫的理由是
  // status 不同 —— 有一半是「不寫就是它」(default-live,永遠會是 0),
  // 另一半是「真的還沒有人選」(landing,30 天後要回來看)。

  // ── 觸發條件的比較運算子 ───────────────────────────────────────────────
  // 出貨內容用到 `<=`(59-00 暴走:生命 ≤ 5%,owner 2026-08-03 定稿的字面用字)
  // 與 `>`(52-00 十二道試煉:生命 > 1% 才流失)。其餘兩個是鑄技工坊下拉選單裡
  // 真的選得到的成員。
  // ⚠️ 不是 default-live:`op` 是必填,沒有「不寫就是這個」的預設。
  //
  // 2026-08-03:`<=` 的豁免**已刪除**(它被 59-00 採用了)。原本的理由寫著
  // 「`<=` 與 `<` 在浮點生命百分比上差異幾乎為零,所以它會是最後一個被採用的
  // 成員」—— 那句話對「機制上量不量得到」是對的(`onDamageTaken` 在扣血之後才
  // 發射,所以「正好等於門檻」是測度為零的事件),但對「內容會不會用它」是錯的:
  // 內容用的是 **owner 說出口的那個符號**,而他說的是「≤」。
  "enum:abilities.effects[]#applyBuff.condition|0|1|0.op=!=": {
    status: "landing",
    since: "2026-07-31",
    why: "比較運算子,鑄技工坊 ConditionEditor 的下拉選單成員之一(apps/editor/src/forge/ConditionEditor.tsx)。出貨的條件卡都是門檻式(`<=` / `>`),沒有一張需要相等比較。第一個自然的採用者是「等級剛好 N」或「層數 == 上限」這種整數比較 —— 目前沒有這種卡。若 30 天後仍是 0,誠實的結論是這兩個成員該從 zCondition 拿掉,而不是硬編一張卡去餵它。",
  },
  "enum:abilities.effects[]#applyBuff.condition|0|1|0.op===": {
    status: "landing",
    since: "2026-07-31",
    why: "同上。相等比較在整數軸(level / 層數)才有意義,而條件目前唯一被授權的整數軸是 level,還沒有卡用它。",
  },

  // ── 觸發條件的屬性軸 ───────────────────────────────────────────────────
  // 出貨的兩張條件卡都讀 `hp`。下面十個成員是同一個下拉選單的其他選項。
  // 它們共用一條 why:機制是同一條 `evaluateCondition` 的 `stat` 分支,
  // 已經被 hp 證明會動(sim/content/condition.test.ts 讀真的 world.stats)。
  "enum:abilities.effects[]#applyBuff.condition|0|1|1.stat=agi": {
    status: "landing",
    since: "2026-07-31",
    why: "同 stat=ad。三圍軸(str/agi/int)在 #248 之後才真的活起來(三圍→AD/攻速/AP),條件讀它是下一步而不是這一步。",
  },
  "enum:abilities.effects[]#applyBuff.condition|0|1|1.stat=armor": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的防禦軸。同一條 `stat` 分支,已由 hp 證明會動。防禦門檻的自然客戶是穿透類:「對防禦高於 N 的目標改走真實傷害」—— 這正是 owner 2026-07-30 講的「>=< 某個常數或某個數值條件」在坦克向上的讀法,所以是 landing 不是 debt。",
  },
  "enum:abilities.effects[]#applyBuff.condition|0|1|1.stat=attackSpeed": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的攻速軸。同一條 `stat` 分支。自然客戶是攻速流的「攻速達上限後把溢出換成傷害」—— 要等 #286(攻速解鎖上限 10.0)落地才有意義,所以它排在那張票後面。",
  },
  "enum:abilities.effects[]#applyBuff.condition|0|1|1.stat=int": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的智力軸。三圍(str/agi/int)在 #248 之後才真的活起來(三圍→AD/攻速/AP),而條件讀三圍是再下一步:今天所有「智力達 X」的敘述都寫在描述文字裡,沒有一支變成可判定的門檻。",
  },
  "enum:abilities.effects[]#applyBuff.condition|0|1|1.stat=magicResist": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的魔抗軸。同 armor,兩者在 w3x 的敘述裡幾乎總是成對出現(「防禦或魔抗高於 N」),所以它們會同時被採用或同時留在 0。",
  },
  "enum:abilities.effects[]#applyBuff.condition|0|1|1.stat=moveSpeed": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的移速軸。同一條 `stat` 分支。自然客戶是追擊類的「目標移速低於 N 時追加傷害」(配合減速),w3x 有這個家族但今天都只做了減速那一半。",
  },
  "enum:abilities.effects[]#applyBuff.condition|0|1|1.stat=str": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的力量軸。同 int:三圍在 #248 之後才活,而條件讀三圍還沒有任何一張卡。力量門檻的自然客戶是「力量高於 N 時擊退距離加倍」這種近戰卡。",
  },

  // ── 三圍門檻機率 `chanceFrom` (朗基努斯之槍 godie-i018, 2026-08-01) ────────
  //
  // 跟下面的 `damageSource` 完全同一個形狀:一個欄位落在共用的 `zHookDefBase`
  // 上,census 因此在兩個節點各看到它一次。ITEM 那一個節點**已經採用**
  // (`field:items.passive[].chanceFrom` = 1/51,朗基努斯之槍「(總敏捷)% 機率」),
  // 這一條是另一個節點。
  //
  // ⚠️ 這個 key 的**名字會誤導人**,不要照字面讀。`abilities.effects[]#applyBuff.
  // hooks[]` 只是 `zHookDef` 這個 schema 實例的最短路徑名(fieldAdoption.ts 的
  // `nameSchemas`);同一個實例其實掛在 applyBuff.hooks、`abilities.passive.
  // ranks[].hooks`、`…ranks[].auras[].hooks`、`augments.hooks`、以及 champion
  // 內嵌鏡像 —— 也就是**除了道具以外的每一個 hook 載體**,合計 reach 54。所以
  // 「技能那一側」指的是這五個地方全部是零,不是只有臨時 buff。
  //
  // ⚠️ 而且它的子欄位**已經是綠的,而且綠的來源是那件道具**:
  // `enum:…chanceFrom.attr=agi` 與 `…chanceFrom.basis=total` 兩列的 example 都是
  // `items/godie-i018`。子欄位共用實例、父欄位不共用,所以同一件事在這份報告裡
  // 一半綠一半紅。記在這裡,免得下一個人以為子欄位綠就代表這一列也該綠。
  "field:abilities.effects[]#applyBuff.hooks[].chanceFrom": {
    status: "landing",
    since: "2026-08-01",
    why: "共用 zHookDefBase 的第二個 census 節點(道具那一個節點已被 朗基努斯之槍 godie-i018 採用,機制因此不在零:sim/effects/hooks.ts 的 hookProcChance 讀真的三圍,而且抽籤的次數與位置一個位元都沒動)。技能那一側是零,而且**有名字的客戶在等**:96-01 華山劍法 godie-o02w.q「攻擊時有 (5+敏捷/15)% 機率造成額外 10+敏捷*1 點傷害」與 06-04 傑桑變化 godie-u034.r / godie-ucrl.r「攻擊時有 (5+敏捷/10)% 的機率隨機使出猜猜拳,持續 7 秒」—— 後者正好就是這個 key 名字寫的那個形狀(一個限時 buff 授予一條 proc)。⚠️ 但採用它**需要先做一個決定,不是照抄**:今天的 chanceFrom 是 `clamp(三圍 × coeff, min, max)`,沒有常數項,所以 w3x 那個 `(常數 + 敏捷/N)%` 的家族寫不進來 —— 拿 `min` 當那個常數會得到 `max(0.05, agi×coeff)`,在 75 敏以下就跟文案差最多 5 個百分點,而「描述不可以說謊」正是這一批的原則。所以 30 天後要問的是「chanceFrom 要不要加一個 flat 項」,而不是把這一條續期,更不是為了讓這一列變綠而寫一個近似值上去。",
  },

  // ── [反彈] 2026-08-01:`damageSource` 是 `zHookDef` 上的**一個**欄位,所以
  //    census 會在每一個掛 hook 的節點各看到它一次。ITEM 那一個節點今天就已經
  //    被採用了(反射之盾 godie-i03m 的 `damageSource: "basic"` —— 沒有它,
  //    owner 文案裡的「反彈**普通攻擊**傷害」會變成「反彈所有傷害」),下面這個
  //    是 applyBuff 臨時 proc 的那一個節點,它是新的、而且還沒有客戶。
  // ⭐ 2026-08-13 B3：landing 豁免移除 —— 它落地了（89-01）。
  // ⚠️ 上面那條是 `field:`(「有沒有人寫這個欄位」),下面兩條是 `enum:`
  //    (「這個下拉選單的每一個選項有沒有人選」)。兩者**不是**同一個 key,而
  //    2026-08-01 [反彈] 上線時只登記了前者 —— 於是 census 一天後就把兩個
  //    enum 成員報成未解釋的 S8。列在一起,免得下次又只補一半。
  //    enum 的名字取的是最短路徑(fieldAdoption.ts 的 `nameSchemas`),所以這
  //    一個 key 其實**同時**涵蓋 item 與 ability 兩個節點 —— `=basic` 因此是
  //    5/5(反射之盾那一族),不在這裡。
  "enum:abilities.effects[]#applyBuff.hooks[].damageSource=any": {
    status: "default-live",
    why: "`effects/hooks.ts` 的過濾是 `if (hook.damageSource !== undefined && hook.damageSource !== \"any\")` —— 缺席與寫 \"any\" 走的是同一個分支,行為位元級相同。寫出來的只會是跟預設相反的那兩個(\"basic\" 已採用)。這一格永遠是 0 才是對的,除非有人為了可讀性把預設值寫滿。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].damageSource=nonBasic": {
    status: "landing",
    since: "2026-08-01",
    why: "「只吃**非**普攻的那一發」。`\"basic\"` 出貨當天就有客戶(反射之盾 godie-i03m 的「反彈普通攻擊傷害 200%」),反向的還沒有。自然的第一個客戶是 w3x 的**法術**反傷/吸收家族(魔法護盾一類:普攻照打、技能才反彈),GGD 今天把那一族全部做成 `shield` 或 `invulnerable.blocksDamage`,沒有一支走 onDamageTaken 的封包過濾。30 天後仍為 0 的話,要問的是「那一族該不該改用這條路」,不是把這一條續期。",
  },

  // ── 不寫就是它(default-live):寫出來與不寫出來產生一模一樣的行為 ──────
  // ── dot 的兩個覆寫欄位(2026-08-01 第一次被 census 看見) ─────────────────
  //    ⚠️ 它們不是新欄位,也不是「掉了最後一個使用者」。這一批把 `dot` 從 2 份
  //    文件(godie-efur 的 R + 他的 champion 鏡像)推到 4 份(血染八月
  //    godie-i06o、妖物碎殺牙 godie-i06a),於是 `reach` 跨過了 `MIN_REACH` = 3,
  //    census 這才開始報它們。**零從來沒有變過,是取樣門檻變了** —— 記在這裡,
  //    免得下一個人以為是這一批弄壞的。
  // ── grantAttribute 的三圍上限讀哪一種三圍 (2026-08-01) ────────────────────
  //
  // ⚠️ 一個 refuter 把這一格標成「真的沒有使用者:沒有內容文件、也**沒有測試文件**,
  // 所以改掉它的預設不會有任何東西紅」。前半是對的,後半**當時也是對的,而且是量出來
  // 的**:把 `e.maxAttributeBasis ?? "base"` 改成 `?? "total"`,全樹提到 maxAttribute
  // 的三個測試檔(laneB.innates 16/16、itemAttributes 14/14、killTriggerSchema 8/8)
  // 一條都不紅。
  //
  // 那位 refuter 建議的解法是「把它寫進 蒼月潮 07-00 獸化心靈 那份文件」。**那個解法
  // 是錯的,而且方向相反**:寫 `maxAttributeBasis: "base"` 是把預設值抄進唯一一份會走
  // `??` 的文件,於是那條 `??` 從此不再被任何出貨內容執行 —— 這一列會變綠,而預設值
  // 會比現在**更**不可觀測。所以資源 #1(AUTHOR THE CONTENT)在這一格是化妝,不是修理。
  //
  // 真正的修理是補守衛:`sim/grantAttributeMaxBasis.test.ts` 讓 蒼月潮 站在
  // 「基礎敏捷 < 120 ≤ 總敏捷」的窗口裡(戴四魂之玉 力敏智+30),證明預設的 "base"
  // 讓他繼續賺、而明寫 "total" 會拒發同一次獎勵。兩個突變都真的跑過,記在那個檔頭。
  "field:abilities.effects[]#grantAttribute.maxAttributeBasis": {
    status: "default-live",
    why: "省略 = \"base\"(`sim/effects/grantAttribute.ts`:`liveAttribute(world, id, attr, e.maxAttributeBasis ?? \"base\")`),而這個預設**是出貨行為**:全樹唯一寫 `maxAttribute` 的文件是 蒼月潮 07-00 獸化心靈 godie-hpb1.passive 的 120 敏上限,而它的 JASS 就是 `GetHeroStatBJ(1,GetKillingUnit(),false)` —— 第三個參數 false = 不含裝備 = \"base\"。所以零採用的意思是「沒有人需要覆寫」,而不是機制死掉;寫 \"total\" 是給未來那種上限本來就該讀「總敏捷」的卡,而讓一把武器把英雄的天生技提早關掉不是任何人要求過的行為。⚠️ **不要靠寫預設值進文件來讓這一列變綠** —— 那會讓那條 `??` 不再被任何出貨文件執行,預設值反而更難被守住。守衛在 sim/grantAttributeMaxBasis.test.ts(蒼月潮 基礎敏捷 < 120 ≤ 總敏捷 的窗口,兩個突變都跑過)。",
  },

  "field:abilities.effects[]#dot.maxStacks": {
    status: "default-live",
    why: "`sim/effects/dot.ts` 的 `dotEffect.apply`:`stacking === \"stack\" ? Math.max(1, Math.floor(e.maxStacks ?? DOT_MAX_STACKS)) : 1` —— 這個欄位**只有** `stacking:\"stack\"` 的 DoT 讀得到,而出貨的 DoT 沒有一份是 stack(godie-efur.r 與其 champion 鏡像寫 refresh,兩件武器省略 = refresh,GH#250 的 godie-hart.r 兩段寫 independent)。所以今天寫上去是位元級的 no-op,零是對的。缺席時的上限是 `DOT_MAX_STACKS` = 99,本來就是有限的,不是「沒有上限」。⚠️ 它的前提 `enum:…#dot.stacking=stack` **在 2026-08-01 浮出來了**:GH#250 把 01-04 超究武神霸斬 改寫成兩段 dot,reach 從 2 跨過 MIN_REACH,census 開始報它。這一句以前寫「等第三份 stack 型 DoT 出現才會浮出來」是**錯的** —— 浮出來只需要第三份 DoT,不需要它是 stack 型。那一列現在有自己的豁免,就在下面。",
  },
  // ── GH#250 把 reach 推過門檻的兩組(2026-08-01) ────────────────────────────
  //    ⚠️ 跟上面 dot 那一批一樣:**零從來沒有變過,是取樣門檻變了**。
  //    01-04 超究武神霸斬 從「一發 damage」改寫成「兩段 dot + 一個 STR 係數」
  //    (war3map.j `Trig_SuperFF7_Actions` 的七連斬),於是
  //      · `dot` 的 reach 2 → 4  →  `stacking=stack` 露出來
  //      · `attrRatios` 的 reach 2 → 3(原本只有 龍神槍 godie-i018 一份 + 它的
  //        鏡像) →  `attr=agi` / `attr=int` / `basis=base` 露出來
  //    三條都不是這一批弄壞的,是這一批讓 census 第一次看得見。
  "enum:abilities.effects[]#dot.stacking=stack": {
    status: "default-live",
    why: "缺席 = \"refresh\"(`sim/effects/dot.ts` 的 `stacking = e.stacking ?? \"refresh\"`),而出貨的四份 DoT 只需要兩種語意:同一支技能重複點燃就延長期限(refresh,揍敵客 R 龍星群 + 兩件武器),或每一次施放各自獨立計時(independent,GH#250 的 01-04 超究武神霸斬 —— 七連斬的基礎段與終結段是同一個 origin 的兩條線,必須互不合併)。stack 是第三種語意「疊層數、傷害相乘」,而原作沒有任何一支被移植過來的燒傷是這樣算的 —— 它的存在是給未來的疊毒用的,不是壞掉。⚠️ 不要為了讓這一列變綠而把某一支改成 stack:那會直接改變玩家吃到的總傷害。",
  },
        "field:abilities.effects[]#dot.tickOnApply": {
    status: "default-live",
    why: "缺席 = false = 「等一個 interval 才第一次結算」(`dot.ts` 的 `firstTick`)。寫 true 是**多加**一次結算,而四份出貨 DoT 的數字都是照『總量 ÷ 次數』寫的:血染八月「88流血傷害,持續3秒」= 29.33×3、妖物碎殺牙「255傷害,持續3秒」= 85×3、揍敵客 R「持續 2 秒、每 0.2 秒」= 10 跳。任何一支打開它,玩家吃到的總量就會比 owner 文案上的數字多一跳。所以這一格空著不只是預設,是**文案正確性的條件**。",
  },
  "field:abilities.effects[]#knockback.hpBasis": {
    status: "default-live",
    why: "缺席就是 \"max\",也就是 GH#193 的出貨規則(擊退距離對照的是最大生命)。\"current\" 是處決風味的另一種讀法,兩者差一個下拉選單。四支出貨的擊退都要可預測的距離,所以都吃預設。",
  },
  "field:abilities.effects[]#knockback.impactPower": {
    status: "default-live",
    why: "缺席 = 只有 `distance` 那個地板值,不跑 GH#193 的重量法則。它是「這一擊有多重」的額外軸(以傷害為單位但不造成傷害),四支出貨的擊退都是招式自帶固定距離(13-02 牙突 6.0、13-002 7.0、13-03 佈壁 4.5),所以沒有一支需要再按體重換算。",
  },
  "field:abilities.effects[]#knockback.launchHeight": {
    status: "default-live",
    why: "缺席 = 貼地推(不是拋物線)。> 0 才是「擊飛」。四支出貨的擊退都是牙突/佈壁那種水平推,擊飛留給 06-00 猜猜拳「擊飛目標」那一批 —— 它們今天還是純文字(見 variant#knockback 那條被刪掉的 landing 記錄:機制已經被 13-02 採用了,擊飛這個子選項還沒有)。",
  },
  "enum:abilities.passive.ranks[].whileForm=any": {
    status: "default-live",
    why: "abilityPassives.ts:113 `block.whileForm ?? \"any\"` —— 缺席就是「兩個形態都生效」。被寫出來的只有 \"alternate\"(只有變身後才有的天生技),因為那是跟預設相反的那一個。",
  },
  // ── 抽卡池開關:曾經有兩位使用者,owner 2026-08-01 親手把它們拿掉 ─────────
  "field:items.draftEligible": {
    status: "default-live",
    why:
      "缺席 = `true`(`sim/economy/offerEligibility.ts` 的 `itemOfferableTo`:`if (def.draftEligible === false) return false;`),所以 219 份文件全部空著 = 「今天沒有任何一件道具需要被擋在抽卡池外」,不是機制死了。" +
      "這個 0 是**被作者做出來的**,不是被忘記的:2026-07-30 唯一的兩位使用者是天堂之劍(godie-i01n)與仙后座(godie-i01s),理由是「代價做了、回報沒做」;" +
      "owner 2026-08-01 重寫了這兩份文件並補上真的 payload(i01n:critChance 0.06 / critDamage 8.25 / maxHealth pctAdd -0.5;i01s:evasion 0.25 / maxMana pctAdd 1.0 / manaRegen 25),同時把它們登錄進棱彩三選一,於是 `draftEligible: false` 被拿掉是**這個決定的一部分**。" +
      "它是一顆預設「開」的開關(CLAUDE.md 第一守則的決策點),沒有東西需要關的時候就該是 0 —— 跟 `knockback.applyTo` 同一類,不是 landing。" +
      "⚠️ 這條豁免只說「內容 0 筆是對的」;那條 `=== false` 分支**本身**還會不會動,由 `sim/economy/questDraftGate.test.ts` 的 ① 抽卡閘負責 —— 那一支在同一天因為這次內容改動而紅了(它是拿真文件當夾具),誰修它都要把「機制」跟「今天剛好沒人用」分開,不要把守衛一起刪掉。",
  },

  // ── 真的還沒有人選(landing) ───────────────────────────────────────────
  "enum:abilities.passive.ranks[].whileForm=base": {
    status: "landing",
    since: "2026-07-31",
    why: "「只有本體形態才生效」的天生技。第三個成員裡唯一沒有客戶的一個:出貨的變身天生技都是「變身後才有」(alternate),還沒有一支是「變身後就失去」。w3x 裡這種存在(本體的被動在 Emeu 那半邊沒有被登記),所以這是待補的內容不是多餘的成員。",
  },
  // 2026-08-01 —— `enum:abilities.effects[]#damage.hpPct.basis=current` 的豁免
  // **已刪除**(棘輪生效)。豁免的預測是對的:「第一個自然的採用者是 w3x 那批
  // 『對殘血追加』的招式」,而實際到位的是同一族的三件傳說武器 ——
  // 名刀-天狼 godie-i00u「敵方英雄現存生命 6%」、幻之匕首 godie-i039
  // 「敵方 20%生命傷害」、落魂的嗜血劍 godie-i00l「每秒損失 3%現存生命」。
  // "max" 仍然是 13-02 牙突的出貨值,兩個成員現在都有客戶。
  // 2026-08-12 —— `enum:abilities.effects[]#knockback.from=pull` 的豁免**已刪除**
  //(棘輪生效)。2026-07-31 的理由寫著「w3x 有明確的客戶:52-00 那一類鉤索與
  // 13-002 之外的抓取投擲」,而真正到位的是 90 支重製裡的 79-04(`godie-h02k.r`
  //「有機率將對方抓取過來」)加它的英雄卡孿生 —— 同一族(抓取),不同一支。
  // 2026-08-01 REMOVED — `spendMana.applyTo=target` 的豁免到期了,而且是這條測試
  // 自己抓到的。豁免的理由寫著「出貨的五支 spendMana 全部是自己付錢…w3x 的 mana
  // burn 家族還沒有被移植」,那句話在 熾天使之弓 godie-i012 出貨「每次削去敵方英雄
  // 現存 MP 3%」的那一刻就變成假的。**豁免到期就是刪掉,不是延期** —— 一條寫著
  // 「還沒有人用」的豁免留在有人用之後,就是把 S8 普查的訊號改成雜訊。

  // ── owner 在 24 小時內把同一件事翻了一次面(2026-08-02)─────────────────
  //
  // 8/1:「Berserker HP 回血 1%每秒,沒有保底」→ 做成 `healthRegenPctOfMax`,
  //      唯一的使用者是 `godie-hapm`。
  // 8/2:「Berseker 是每秒**損失** 1%生命, 直到生命不足1%」→ 那一格翻成
  //      `healthDrainPctOfMax`(1/1 採用),回血那一格就此掉到 0。
  //
  // 下面兩條豁免都是**同一次改動的帳單**,而且刻意記成 `debt`(每一輪都印出
  // 大字報、永不到期)而不是 `landing`:沒有任何一份內容「即將」採用它們,
  // 假裝 30 天後會有人用是說謊。
  "field:champions.healthRegenPctOfMax": {
    status: "debt",
    why:
      "8/1 做的「每秒回最大生命的 N%」機制還活著、還可調、還有行為守衛" +
      "(`sim/berserkerPctRegen.test.ts` 用手寫夾具跑真世界),但 8/2 之後**沒有任何一位出貨英雄填它**。" +
      "留著而不是刪掉是刻意的:owner 在 24 小時內把這件事翻過一次面,下一次翻回來時它必須是" +
      "「英雄卡上填一個數字」,不是一次 schema 改動 + rebuild + 部署(CLAUDE.md 第一守則)。" +
      "⚠️ 這條豁免說的是「今天 0 筆是對的」,不是「這個機制不用測」——" +
      "`berserkerPctRegen.test.ts` 另有一條掃全 119 份英雄卡的守衛釘住「真的沒有人填」," +
      "所以第一位採用者出現的那一天,那一條會紅,而**這條豁免就該被刪掉**。",
  },
  // ⭐ 2026-08-18 已刪除:`enum:…applyBuff.condition|0|1|0.op=>`
  //
  // 那條豁免自己的最後一句寫著「第一支需要**數值高於門檻才觸發**的卡出現時,
  // 這條豁免就該被刪掉」—— 那一支出現了:`items/teardrop-of-rebirth` 再誕之淚珠
  // 的復活後增益掛了 `{hp, percent, op:">", value:0}`,用來確認**復活真的成功**
  // (火圈全閉合時 `reviveChampionAt` 回 null,那 6 秒倍率會掛在屍體上)。
  // ⛔ 不要把它加回來 —— 這條普查的整個意義就是「機制出貨了、內容 0」,
  // 而它現在不是 0 了。

  // ── 【淨化】dispel 的四格「不寫最好」旋鈕 (A4b, 2026-08-05, #278) ─────────
  //
  // ⚠️ 先講**機制不在零**:`dispel` 這個 kind 本身 3/3 採用(朗基努斯之槍
  // godie-i018 / 仙后座 godie-i01s / 光之聖劍 godie-i031),`shape` 3/3、
  // `polarity` 3/3(buff 1 + debuff 2)、`count` 3/3,而
  // `sim/effects/dispel.test.ts` 從真世界兩個方向驗它。
  //
  // 下面這幾格全部是「省略 = 讀 `config.dispel@1`」的那一種:寫進文件等於在
  // **一支道具上**烘死一個本來全域可調的決定。零採用正是它們該有的樣子 ——
  // 有人寫它的那天,意思是「這一支要跟全域規則不一樣」,那才是它存在的理由。
  //
  // ⭐ 2026-08-12 —— 四格剩三格:`field:abilities.effects[]#dispel.pools` 的豁免
  // **已刪除**(棘輪生效),而刪的理由正是上面那一句 —— 90 支重製裡真的出現了
  // 三份「這一支要跟全域規則不一樣」的文件(`godie-ewar.w` 的淨化自身法術狀態、
  // `godie-h00l.passive`,加英雄卡孿生)。⚠️ 它的子欄位 `dispel.pools.shields`
  // 是**這一刻才第一次可回報**的(父容器跨過 MIN_REACH),記在檔尾那一段。

  // ⭐ 2026-08-12 —— Lane 1 / Lane 2 / Lane 3 的**九個新 kind 豁免全部刪除**
  // （棘輪生效，這是這張表史上最大的一次收成）。2026-08-08 與 2026-08-09 寫下的
  // 停止條件逐字是「那幾支文件上架的那天，這幾條豁免就該被刪掉」，而 owner 的
  // 90 支重製技能今天就是那一天：
  //   devour 6 份 · weightedBranch 3 · randomArea 4 · delayed 3 · blink 2 ·
  //   modifyCooldown 2 · extendBuff 2 · proxyCast 2 · swapResource 1 ·
  //   eventValueConversion 1 · manaBarrier 1
  // 一起走的還有 `onReflectSuccess`(4 份)與 `onEvade`(3 份)兩個 hook 事件、
  // `applyStatus` 的 disarmed / feared / silenced / targetsAllies 四格狀態、
  // 以及 `applyBuff.statusId` / `hooks[].key` / `hooks[].consumeOn`。
  // ⚠️ 它們留下的**帳**寫在檔尾 2026-08-12 那一段：父容器一被採用，它們沒填的
  // optional 子欄位就第一次跨過 MIN_REACH 而變得可回報（THE CASCADE RULE）。

  "field:abilities.effects[]#dispel.maxTargets": {
    status: "default-live",
    why:
      "只對 `shape: \"circle\"` 有意義,省略 = 圈內全中。唯一的圓形出貨(光之聖劍 godie-i031 " +
      "的隊友淨化光環)刻意不設上限 —— 一個「有時候會漏掉某個隊友」的光環, " +
      "玩家看到的是「這道具壞了」而不是「這是設計」。" +
      "留著是因為攻擊型範圍淨化(敵方圓)一定會需要它,那時候上限是平衡旋鈕不是 bug。",
  },
  // ── 被淨化那一側的三格 authoring 欄位 (GH#295, 2026-08-09) ────────────────
  //
  // 這三格是 #295 的修法:在此之前**執行期三個型別都有 `dispellable`,而沒有任何
  // Zod 欄位可以把它填成 true**,於是 `dispel.pools.buffs` 是一個死開關
  //(出貨預設 false × 沒有辦法標 true = 相乘為零)。現在填得到了。
  //
  // 三格都是「省略 = 讀 `config.dispel@1` 的那一格全域預設」,所以零採用正是它們
  // 該有的樣子 —— 有人寫它的那天,意思是「這一筆跟全域規則不一樣」。
  "field:abilities.effects[]#dot.dispellable": {
    status: "default-live",
    why:
      "同上,省略 = `dispelRules.dotDefaultDispellable`(出貨 **true** —— 燃燒/中毒本來就該解得掉)。" +
      "它與 status 分開一格是因為 `world.dot` 在 A4 之前完全沒有移除路徑,打開它是一次真的能力增加。",
  },
  // ── C4 睡眠 + A6 重創的五格「等內容」(2026-08-05, #278) ──────────────────
  //
  // ⚠️ 這五格是**兩個機制的介面**,而它們的行為守衛已經在跑真世界:
  //   `sim/statusBreak.test.ts`(三條,含「打醒不會順手解掉其他 status」)
  //   `sim/grievousWounds.test.ts`(四條,含「吸血不可以打折兩次」)
  // 所以「機制不存在」不是這裡的狀況 —— 缺的是**誰用它**,而那是一個
  // owner 的內容決定(哪一支技能是睡眠、哪一件道具掛重創),不是我可以代填的。
  //
  // 記成 `landing` 而不是 `debt` 是刻意的:owner 已經逐字裁決過重創
  //(「【減療 / 禁療】=> 用重創代替就好」+ 裁決⑥ 三格 0.5),所以內容**真的**
  // 在路上,30 天的自動到期正好是那份內容該落地的時窗。
  // GH#304 —— 疊層三條軸的「續不續期」旋鈕。
  //
  // 零採用是**成對的**（同 `condition.target-status@1` 的 `minStacks` 那一則）：
  // 這一格只在一個計數器**每隔一段時間自己增減**的時候才有意義，而出貨的 28 份
  // status 文件沒有一份寫 `stacks`，所以今天沒有任何一支疊層狀態可以填它。
  // ⛔ 不要為了餵綠它去硬加一張卡：先有一支真的疊層的技能（owner 手動重製中），
  // 這一格才有東西可寫。機制本身由 `sim/counterAxes.test.ts` 走真的 `world.step()`
  // 驗過（軸②那條就是靠它才不會續期續成永久）。
  "field:abilities.effects[]#applyStatus.breakOnDamage": {
    status: "landing",
    since: "2026-08-05",
    why:
      "C4【睡眠】的閘 ——「受傷即提早解除**這一筆**」。引擎在 `sim/statusBreak.ts`," +
      "呼叫點在 `combat/damage.ts` 的傷害落地處,守衛 `sim/statusBreak.test.ts` 跑真的傷害管線。" +
      "零採用是因為樹上今天沒有任何一支技能是睡眠系 —— 那是一個內容決定。" +
      "第一支睡眠技能上架的那天,這條豁免就該被刪掉。",
  },
  "field:abilities.effects[]#applyStatus.breakOnDamageMin": {
    status: "landing",
    since: "2026-08-05",
    why:
      "睡眠的打醒門檻。省略 = 0 = 任何傷害都醒(WC3 沉睡的語意),所以**零採用正是** " +
      "它該有的樣子。它存在的理由是第 3 回合之後場上到處是 DoT:一個「被燃燒每 tick " +
      "3 點打醒」的睡眠等於沒有睡眠,而那是設計決定不是常數。與 `breakOnDamage` 同一批。",
  },
  // ⭐ 2026-08-18 · A6【重創】三格（`healingTakenMult` / `lifestealMult` /
  //    `regenMult`）的 landing 豁免**全部刪掉** —— `items/ultimate-mod-shiranui`
  //    真的掛上了重創，三格同時從零採用畢業。⛔ 這不是放寬，是它們不再需要豁免。
  //    （引擎那一側從 2026-08-05 就備妥：三個讀取點 + `sim/grievousWounds.test.ts`
  //    的四條守衛。缺的一直只是「掛重創的那張卡」，而那張卡現在存在了。）

  // ⭐ 2026-08-12 —— C1【沉默】+ C2【混亂】的**兩筆豁免已刪除**(棘輪生效)。
  // 2026-08-05 的停止條件逐字是「樹上今天沒有任何一支技能是沉默系或混亂系,
  // 第一支上架的那天,這兩條豁免就該被刪掉」。90 支重製裡兩支都到了:
  // `silenced` → `godie-edem.ex`;`targetsAllies` → `godie-ewar.q` /
  // `godie-h02k.r` 加兩張英雄卡孿生。兩條行為守衛(`sim/c1c2.test.ts`)沒有動。

  // ── 事件流廣播的六個時刻 (2026-08-06, `sim/systems/WorldHookSystem.ts`) ──
  //
  // ⚠️ 這六個與其他 landing 豁免的形狀**不一樣**,值得寫清楚:一般的零採用是
  // 「機制剛做好,還沒有人寫卡」;這六個是**機制早就在跑了** —— sim 每一場都在
  // `world.emit()` 這六個時刻(給客戶端畫面用),缺的只是把它們轉成 hook 的
  // 那一個廣播器。所以「零採用」在這裡的意思是「作者從今天起才寫得出來」。
  //
  // 行為守衛 `sim/systems/worldHook.test.ts` 兩條,兩個突變都驗過會紅
  //(刪掉 world 廣播分支 / 把迴避那一列的 actorKey 與 targetKey 對調)。
  //
  // ⛔ 六筆分開記而不是合成一筆,是因為它們**會各自被採用**:第一支「死亡時
  // 爆炸」的技能上架時,只有 onDeath 那一筆該被刪掉,其餘五筆仍然誠實。
  "enum:abilities.effects[]#applyBuff.hooks[].on=onGuardianDown": {
    status: "landing",
    since: "2026-08-06",
    why: "守衛塔倒下(世界廣播)。⚠️ 打倒守衛塔**不發 `onKill`**(獎勵由 GuardianSystem 自己付),所以在這個成員之前,「塔倒了」在內容側完全接不到。⭐ 它同時是 GH#263(拆塔即勝)的掛載點。",
  },

  "enum:abilities.effects[]#dispel.polarity=any": {
    status: "default-live",
    why:
      "`any` = 增益減益一起拔。三支出貨全部是有方向的(對敵拔增益 / 對己拔減益)," +
      "因為**無差別淨化會拔掉自己隊友的增益**,那幾乎一定是作者手滑而不是意圖。" +
      "所以零採用正是它該有的樣子:它要留在選單上(WC3 的 Dispel Magic 本體就是無差別," +
      "1:1 還原那一支的那天要用得到),但不該是任何人不小心選到的預設。",
  },

  // ══ 契約層 2026-08-09（GH#299 / #300 / #301）══════════════════════════════
  //
  // ⚠️ **先讀這一段再看下面 25 筆**，否則它看起來像一次「把普查關掉」。
  //
  // ── ① 13 個 key **改名了，不是消失了** ────────────────────────────────────
  // `enum:…#applyBuff.hooks[].condition|…` 全部變成 `enum:…#applyBuff.condition|…`。
  // 原因與 2026-08-08 `items.block.lethalBasis` 那一次逐字相同：`nameSchemas()`
  // 依**物件識別**給每個 schema 一個正規名字，而 `zEffectCondition` 現在也掛在
  // 每一個 effect 上（owner 的裁決，見 ②），所以它第一次被走訪到的路徑變成
  // `applyBuff.condition`。條件系統本身一格沒動，採用數也一格沒變。
  // ⛔ 不要為了讓名字好看就把 schema 拆兩份 —— 那正是 `fromResource` 那一格
  // 已經寫過的警告：兩份 schema 會讓規則變成兩份。
  //
  // ── ② 19 筆 `#<kind>.condition` 是**同一個欄位**在 19 個節點上 ────────────
  // owner 2026-08-09 裁決：條件不只能掛在 hook 上，也要能掛在**效果**上
  //（「若目標身上有〔恐懼〕則追加」在主動技的 effects[] 上本來寫不出來）。
  // 它是共用的 `EFFECT_COMMON_SHAPE`（一份，不是 19 份），普查在每個 kind 的
  // 節點各看到一次。零採用是**內容決定不是機制缺席**：owner 正在手動重製 90 支
  // 技能，⛔ 契約層依令沒有動 `content/abilities/`。
  // ⚠️ 求值端由 lane A 接（同一個 `evaluateCondition`，⛔ 不是第二套）——
  // 在那之前這 19 筆是「schema 收得下、引擎不讀」，這正是 landing 而不是
  // default-live 的原因：省略確實等於無條件執行，但**寫了**今天還不會發生任何事。
  //
  // ── ③ 四個 hook 事件今天是**零發射點** ───────────────────────────────────
  // 契約層先定名字（四路平行實作要 import 同一個字面量），發射點是 GH#300。
  // ⛔ #300 收尾時沒接到的那幾個要從 `zHookEvent` **刪掉**，不是留在這裡。
  //
  // 三族全部 30 天到期。到期時若仍是 0，誠實的結論不是「再展延」。
  // ⭐ 2026-08-13 B3：landing 豁免移除 —— 它落地了（B3-C 條件葉：8 份文件）。
  "field:abilities.effects[]#championForm.condition": {
    status: "landing",
    since: "2026-08-09",
    why: "效果上的觸發條件（owner 2026-08-09 裁決，GH#300）。共用 EFFECT_COMMON_SHAPE 的**同一格**，普查在 19 個 kind 節點各看到一次；型別/求值器/葉子與 hook 上的那一格逐字相同。零採用＝owner 手動重製中的 90 支技能還沒進 content/abilities/，⛔ 不是機制缺席。⚠️ 求值端（逐一過濾目標）由 lane A 接。",
  },
  // ⭐ 2026-08-13 B3：landing 豁免移除 —— 它落地了（B3-C：44-04 · 79-03）。
  "field:abilities.effects[]#damageLine.condition": {
    status: "landing",
    since: "2026-08-09",
    why: "效果上的觸發條件（owner 2026-08-09 裁決，GH#300）。共用 EFFECT_COMMON_SHAPE 的**同一格**，普查在 19 個 kind 節點各看到一次；型別/求值器/葉子與 hook 上的那一格逐字相同。零採用＝owner 手動重製中的 90 支技能還沒進 content/abilities/，⛔ 不是機制缺席。⚠️ 求值端（逐一過濾目標）由 lane A 接。",
  },
  "field:abilities.effects[]#dash.condition": {
    status: "landing",
    since: "2026-08-09",
    why: "效果上的觸發條件（owner 2026-08-09 裁決，GH#300）。共用 EFFECT_COMMON_SHAPE 的**同一格**，普查在 19 個 kind 節點各看到一次；型別/求值器/葉子與 hook 上的那一格逐字相同。零採用＝owner 手動重製中的 90 支技能還沒進 content/abilities/，⛔ 不是機制缺席。⚠️ 求值端（逐一過濾目標）由 lane A 接。",
  },
  "field:abilities.effects[]#dot.condition": {
    status: "landing",
    since: "2026-08-09",
    why: "效果上的觸發條件（owner 2026-08-09 裁決，GH#300）。共用 EFFECT_COMMON_SHAPE 的**同一格**，普查在 19 個 kind 節點各看到一次；型別/求值器/葉子與 hook 上的那一格逐字相同。零採用＝owner 手動重製中的 90 支技能還沒進 content/abilities/，⛔ 不是機制缺席。⚠️ 求值端（逐一過濾目標）由 lane A 接。",
  },
  "field:abilities.effects[]#grantAttribute.condition": {
    status: "landing",
    since: "2026-08-09",
    why: "效果上的觸發條件（owner 2026-08-09 裁決，GH#300）。共用 EFFECT_COMMON_SHAPE 的**同一格**，普查在 19 個 kind 節點各看到一次；型別/求值器/葉子與 hook 上的那一格逐字相同。零採用＝owner 手動重製中的 90 支技能還沒進 content/abilities/，⛔ 不是機制缺席。⚠️ 求值端（逐一過濾目標）由 lane A 接。",
  },
  "field:abilities.effects[]#heal.condition": {
    status: "landing",
    since: "2026-08-09",
    why: "效果上的觸發條件（owner 2026-08-09 裁決，GH#300）。共用 EFFECT_COMMON_SHAPE 的**同一格**，普查在 19 個 kind 節點各看到一次；型別/求值器/葉子與 hook 上的那一格逐字相同。零採用＝owner 手動重製中的 90 支技能還沒進 content/abilities/，⛔ 不是機制缺席。⚠️ 求值端（逐一過濾目標）由 lane A 接。",
  },
  "field:abilities.effects[]#invulnerable.condition": {
    status: "landing",
    since: "2026-08-09",
    why: "效果上的觸發條件（owner 2026-08-09 裁決，GH#300）。共用 EFFECT_COMMON_SHAPE 的**同一格**，普查在 19 個 kind 節點各看到一次；型別/求值器/葉子與 hook 上的那一格逐字相同。零採用＝owner 手動重製中的 90 支技能還沒進 content/abilities/，⛔ 不是機制缺席。⚠️ 求值端（逐一過濾目標）由 lane A 接。",
  },
  "field:abilities.effects[]#knockback.condition": {
    status: "landing",
    since: "2026-08-09",
    why: "效果上的觸發條件（owner 2026-08-09 裁決，GH#300）。共用 EFFECT_COMMON_SHAPE 的**同一格**，普查在 19 個 kind 節點各看到一次；型別/求值器/葉子與 hook 上的那一格逐字相同。零採用＝owner 手動重製中的 90 支技能還沒進 content/abilities/，⛔ 不是機制缺席。⚠️ 求值端（逐一過濾目標）由 lane A 接。",
  },
  "field:abilities.effects[]#leap.condition": {
    status: "landing",
    since: "2026-08-09",
    why: "效果上的觸發條件（owner 2026-08-09 裁決，GH#300）。共用 EFFECT_COMMON_SHAPE 的**同一格**，普查在 19 個 kind 節點各看到一次；型別/求值器/葉子與 hook 上的那一格逐字相同。零採用＝owner 手動重製中的 90 支技能還沒進 content/abilities/，⛔ 不是機制缺席。⚠️ 求值端（逐一過濾目標）由 lane A 接。",
  },
  // ⚠️ 2026-08-18 —— 這一筆是**掉回零**的，⛔ 不是新機制。唯一的採用者是
  // `items/all-might-hair` 的 `revive.condition{target hp <= 0.001}`，而那一發 `revive`
  // 掛在 `target:"event"` 的 hook 上 ⇒ `ctx.targets` 是剛被普攻打中的**敵人**，
  // `revive.ts` 的 `side:"ally"` 閘再把他剔掉 ⇒ 復活數永遠是 0（第一·五守則的紅線）。
  // 結構修正把那條 hook 拆成 `target:"allies"` 的 `ofa-return`，條件隨之不再需要。
  // ⇒ 這一格回到「機制在、內容還沒用」，與同族其他 18 個 kind 同一個狀態。
  // ⭐ 求值端本身**現在有活的證人**：`items/senzu-bean` 同時採用了 `restore.condition`
  //    與 `dispel.condition`（同一格 `EFFECT_COMMON_SHAPE`、同一支 `gateOnCondition`），
  //    所以這裡的 0 逐字只代表「沒有一張卡需要有條件的復活」。
  "field:abilities.effects[]#revive.condition": {
    status: "landing",
    since: "2026-08-18",
    why: "效果上的觸發條件（owner 2026-08-09 裁決，GH#300）。共用 EFFECT_COMMON_SHAPE 的**同一格**，普查在 19 個 kind 節點各看到一次；型別/求值器/葉子與 hook 上的那一格逐字相同。零採用＝owner 手動重製中的 90 支技能還沒進 content/abilities/，⛔ 不是機制缺席。⚠️ 求值端（逐一過濾目標）由 lane A 接。 ⚠️ 2026-08-18 由 1 掉回 0：見上面那段，唯一的採用者是一發**從來不會發生**的復活。",
  },
  "field:abilities.effects[]#shield.condition": {
    status: "landing",
    since: "2026-08-09",
    why: "效果上的觸發條件（owner 2026-08-09 裁決，GH#300）。共用 EFFECT_COMMON_SHAPE 的**同一格**，普查在 19 個 kind 節點各看到一次；型別/求值器/葉子與 hook 上的那一格逐字相同。零採用＝owner 手動重製中的 90 支技能還沒進 content/abilities/，⛔ 不是機制缺席。⚠️ 求值端（逐一過濾目標）由 lane A 接。",
  },
  "field:abilities.effects[]#spawnProjectile.condition": {
    status: "landing",
    since: "2026-08-09",
    why: "效果上的觸發條件（owner 2026-08-09 裁決，GH#300）。共用 EFFECT_COMMON_SHAPE 的**同一格**，普查在 19 個 kind 節點各看到一次；型別/求值器/葉子與 hook 上的那一格逐字相同。零採用＝owner 手動重製中的 90 支技能還沒進 content/abilities/，⛔ 不是機制缺席。⚠️ 求值端（逐一過濾目標）由 lane A 接。",
  },
  "field:abilities.effects[]#spawnVfx.condition": {
    status: "landing",
    since: "2026-08-09",
    why: "效果上的觸發條件（owner 2026-08-09 裁決，GH#300）。共用 EFFECT_COMMON_SHAPE 的**同一格**，普查在 19 個 kind 節點各看到一次；型別/求值器/葉子與 hook 上的那一格逐字相同。零採用＝owner 手動重製中的 90 支技能還沒進 content/abilities/，⛔ 不是機制缺席。⚠️ 求值端（逐一過濾目標）由 lane A 接。",
  },
  "field:abilities.effects[]#spendMana.condition": {
    status: "landing",
    since: "2026-08-09",
    why: "效果上的觸發條件（owner 2026-08-09 裁決，GH#300）。共用 EFFECT_COMMON_SHAPE 的**同一格**，普查在 19 個 kind 節點各看到一次；型別/求值器/葉子與 hook 上的那一格逐字相同。零採用＝owner 手動重製中的 90 支技能還沒進 content/abilities/，⛔ 不是機制缺席。⚠️ 求值端（逐一過濾目標）由 lane A 接。",
  },
  "field:abilities.effects[]#knockback.launchDistance": {
    status: "landing",
    since: "2026-08-09",
    why: "擊飛四檔落點（owner 2026-08-09，GH#301-1：「應該要可以[指定落點]，但簡化成 一小段/預設/一大段/到底部 四種」）。省略＝default＝今天的推算行為，所以既有 5 份文件一格都不用改。⭐ 引擎側**已經落地**（`sim/effects/knockback.ts` 的 `tierDistance`），四檔的實際距離住在 `config.combat-feel@1` 的 `knockback.launchShortUnits` / `launchLongUnits` / `launchEdgeUsesFireRing`（⛔ 不是引擎常數，第一守則）。零採用＝owner 手動重製中的技能還沒挑這一格。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].on=onShieldGained": {
    status: "landing",
    since: "2026-08-09",
    why: "護盾產生時。持有者＝拿到護盾的人,target＝給護盾的人。✅ 發射點已接（GH#300）：`effects/shield.ts` 每一次 `addShield` 發一則 `shieldGained`，`systems/WorldHookSystem.ts` 那張表轉成 hook。⚠️ 口徑是「新出現一片盾」不是「這個人身上的盾變多了」——一發 AoE 給三個人＝三則。零採用＝owner 手動重製中的技能還沒進 content/abilities/。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].on=onShieldBroken": {
    status: "landing",
    since: "2026-08-09",
    why: "護盾破碎時(護盾池歸零那一格)。✅ 發射點已接（GH#300）：吃 `combat/damage.ts` 早就在發的 `guardBreak`（判準逐字就是「打之前 >0、這一發吃到、之後合格總量 <=0」），沒有第二套判斷。⚠️ 三件**不算**破碎:被打到但還有剩 · 自然到期 · 【破盾】(`shieldBreak` effect)主動拆掉別人的——最後這一項是**已知缺口不是漏掉**（那是動作，這是時刻），要不要納入是 owner 的裁決。零採用＝owner 手動重製中的技能還沒進 content/abilities/。",
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // ⭐ 2026-08-12 —— owner 的 90 支重製技能落地之後，**第一次可回報**的那一批
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // owner 2026-08-12 裁決（逐字）：「只要讓 EX **照技能說明**正常實作 被動或主動
  // 即可」「全做」「(c) 分開，但預設**一律以我新版的優先**」「是的，我**刻意減少
  // 變身**的技能，減少額外設定開銷」。—— 舊行為：那 90 支的文件不在樹上，
  // 於是 delayed / devour / randomArea / weightedBranch / dispel.pools / restore /
  // hooks[].abilitySlot 這些容器的 reach 是 0；新規格：它們今天全部有文件了。
  //
  // ⚠️ 這一整段裡**沒有一筆是新的 S8**。它們是 THE CASCADE RULE 那條測試自己
  // 寫過的那句話在兌現 ——「adopting the parent is what makes the children
  // visible — one finding at a time, outermost first」。父容器一被採用，它**沒填
  // 的 optional 子欄位**就第一次跨過 MIN_REACH，於是第一次進得了報表。
  // ⛔ 所以「今天多了 29 列零」不代表引擎退步了，代表普查第一次看得到這一層。

  // ── ①「填了就會紅」：`refineDispelShape` 明文禁止的六格 ────────────────────
  // `schema/effect.ts` 的 `refineDispelShape` 對 `delayed` 與 `devour` 都生效
  //（它的 kind 聯集逐字列著這兩個），而它的反向那一段是：`shape:"single"` 卻寫了
  // `radius` / `side` / `maxTargets` → **載入時**就加 issue，訊息是「這一格是一個
  // 看起來有設、其實沒有人讀的數字」。出貨的 3 份 delayed 與 6 份 devour **全部**
  // 是 `shape:"single"`（見下面 ③ 那兩列 `shape=circle` 都是 0），所以這六格今天
  // 在樹上是寫不進去的。
  // ⛔ 不是 default-live：省略不是在吃一個好用的預設值，是這份文件根本不准有它。
  // 第一發圓形的 delayed / devour 上架的那天，這六筆會自己變 stale 而被刪掉。
  "field:abilities.effects[]#delayed.radius": {
    status: "schema-impossible",
    why:
      "`refineDispelShape` 的反向檢查：`shape:\"single\"` 填了這一格就是**載入時**的解析錯誤，" +
      "而出貨的 3 份 delayed 全部是 single。所以零採用不是「沒有人需要」，是「沒有人寫得進去」——這一格要跟 `shape:\"circle\"` 一起出現才合法。" +
      "⛔ 不要把它降級成 default-live：那會把一條「填了就紅」的規則講成「留白剛好」，下一個作者就會以為自己可以填。",
  },
  "field:abilities.effects[]#delayed.side": {
    status: "schema-impossible",
    why:
      "`refineDispelShape` 的反向檢查：`shape:\"single\"` 填了這一格就是**載入時**的解析錯誤，" +
      "而出貨的 3 份 delayed 全部是 single。所以零採用不是「沒有人需要」，是「沒有人寫得進去」——這一格要跟 `shape:\"circle\"` 一起出現才合法。" +
      "⛔ 不要把它降級成 default-live：那會把一條「填了就紅」的規則講成「留白剛好」，下一個作者就會以為自己可以填。",
  },
  "field:abilities.effects[]#delayed.maxTargets": {
    status: "schema-impossible",
    why:
      "`refineDispelShape` 的反向檢查：`shape:\"single\"` 填了這一格就是**載入時**的解析錯誤，" +
      "而出貨的 3 份 delayed 全部是 single。所以零採用不是「沒有人需要」，是「沒有人寫得進去」——這一格要跟 `shape:\"circle\"` 一起出現才合法。" +
      "⛔ 不要把它降級成 default-live：那會把一條「填了就紅」的規則講成「留白剛好」，下一個作者就會以為自己可以填。",
  },

  // ── ② `radiusTier`：⚠️ 它**不在**那道 refine 裡（讀過原始碼才知道） ──────────
  // 交辦稿說 delayed/devour 的四格（radius / radiusTier / side / maxTargets）都是
  // `schema-impossible`。⛔ 那是錯的，而且錯得很細：`refineDispelShape` 的那個
  // 迴圈逐字只有 `["radius", "side", "maxTargets"]` —— **`radiusTier` 不在裡面**。
  // 也就是說一份 `shape:"single"` 的 delayed 寫 `radiusTier` 會**載入成功**，然後
  // 那一格沒有人讀（幾何只在 circle 那一支解析）。那是一個真的、但很小的 schema
  // 缺口（不在這個 lane 的範圍：⛔ 本輪不准動 schema/），所以這兩筆誠實地記成
  // landing，和 ③ 的 `shape=circle` 同一個時鐘 —— 它們必然同時變綠。
  // ⭐ GH#489（2026-08-21）—— devour 的**五筆豁免一起刪掉了**，⛔ 不是過期，是被
  //    反駁：59-01 吞噬改成被動之後是一顆真的圓（`shape:"circle"` + radius +
  //    radiusTier + side + maxTargets 全部有人用），也就是這五筆當初寫的
  //    「反駁方式」逐字發生了。⛔ 不要因為 delayed 那一族還在就把它們留著 ——
  //    豁免是**逐 kind** 的，而 devour 這一族已經沒有東西要豁免了。
  "field:abilities.effects[]#delayed.radiusTier": {
    status: "landing",
    since: "2026-08-12",
    why:
      "AoE 級距落在共用的幾何欄位群上，普查在每一個 AoE-shaped kind 各看到一次。⚠️ 與同族的 radius/side/maxTargets **不同**：`refineDispelShape` 的反向迴圈只列了那三格，" +
      "`radiusTier` 不在其中，所以 `shape:\"single\"` 寫它會載入成功而沒有人讀。零採用的真正原因是出貨的 3 份 delayed 一支都不是圓形 —— 它會與 `enum:…#delayed.shape=circle` 同一天變綠。" +
      "⛔ 30 天後它再紅一次是對的：如果那時仍然沒有圓形的 delayed，該做的是補上那道 refine，不是續發豁免。",
  },

  // ── ③ 兩個 kind 的 `shape` 只被選了一半 ──────────────────────────────────
  // `shape` 這一格本身是 100% 採用（它是必填），零的是 `circle` 這個**成員**。
  // 圓形那一支的引擎路徑不是死的 —— 同一支 `shapeTargets` 被 dispel / weightedBranch
  // 等 kind 以 circle 走過（`godie-h02v.ex` 的 weightedBranch 就是 `shape:"circle"`
  // + `side:"allies"`），所以這是**內容還沒選**，不是機制缺席。
  "enum:abilities.effects[]#delayed.shape=circle": {
    status: "landing",
    since: "2026-08-12",
    why:
      "`shape` 是必填所以欄位本身 100%，零的是 circle 這個成員：出貨的 3 份 delayed 全部是單體。" +
      "⭐ 圓形那一支不是死路 —— 同一支 `shapeTargets` 已經被別的 kind 以 circle 走過（`godie-h02v.ex` 的 weightedBranch 是 circle + side:\"allies\"）" +
      "，所以缺的是內容不是引擎。它變綠的那一天，上面 ① 的三格幾何與 ② 的 radiusTier 會一起解禁。",
  },

  // ── ④ 四個新 kind 上的 `condition`：併進既有的 19 筆那一族 ────────────────
  // 這四筆與檔案上方那 19 筆 `…#<kind>.condition` 是**同一格** schema
  //（`EFFECT_COMMON_SHAPE.condition`），只是它們的父 variant 到 2026-08-12 才被
  // 內容採用，所以普查現在才數得到。since 跟著**機制落地那天**（2026-08-09）走，
  // 讓 23 筆同一個時鐘、同一天到期 —— 一個機制不該因為晚被看見就多拿 3 天寬限。
  "field:abilities.effects[]#delayed.condition": {
    status: "landing",
    since: "2026-08-09",
    why:
      "效果上的觸發條件（owner 2026-08-09 裁決，GH#300）。共用 EFFECT_COMMON_SHAPE 的**同一格**，" +
      "普查在每一個 kind 節點各看到一次；型別/求值器/葉子與 hook 上的那一格逐字相同。⚠️ 這一個 kind 的節點是 2026-08-12 才**第一次可回報**的（父 variant 被採用，" +
      "reach 跨過 MIN_REACH），所以 since 跟著機制落地的那天走，與另外 19 筆同一個時鐘、同一天到期。" +
      "零採用＝重製那一批沒有一支需要逐目標過濾，⛔ 不是機制缺席。",
  },
  "field:abilities.effects[]#devour.condition": {
    status: "landing",
    since: "2026-08-09",
    why:
      "效果上的觸發條件（owner 2026-08-09 裁決，GH#300）。共用 EFFECT_COMMON_SHAPE 的**同一格**，" +
      "普查在每一個 kind 節點各看到一次；型別/求值器/葉子與 hook 上的那一格逐字相同。⚠️ 這一個 kind 的節點是 2026-08-12 才**第一次可回報**的（父 variant 被採用，" +
      "reach 跨過 MIN_REACH），所以 since 跟著機制落地的那天走，與另外 19 筆同一個時鐘、同一天到期。" +
      "零採用＝重製那一批沒有一支需要逐目標過濾，⛔ 不是機制缺席。",
  },
  "field:abilities.effects[]#randomArea.condition": {
    status: "landing",
    since: "2026-08-09",
    why:
      "效果上的觸發條件（owner 2026-08-09 裁決，GH#300）。共用 EFFECT_COMMON_SHAPE 的**同一格**，" +
      "普查在每一個 kind 節點各看到一次；型別/求值器/葉子與 hook 上的那一格逐字相同。⚠️ 這一個 kind 的節點是 2026-08-12 才**第一次可回報**的（父 variant 被採用，" +
      "reach 跨過 MIN_REACH），所以 since 跟著機制落地的那天走，與另外 19 筆同一個時鐘、同一天到期。" +
      "零採用＝重製那一批沒有一支需要逐目標過濾，⛔ 不是機制缺席。",
  },
  // ⭐ 2026-08-13 B3：landing 豁免移除 —— 它落地了（B3-C4：89-002 俄羅斯輪盤）。

  // ── ⑤「省略正是出貨行為」的九格旋鈕（default-live） ────────────────────────
  // 每一格都逐字對過 sim 的那一行 `?? 預設`，不是憑印象分類的。
  "field:abilities.effects[]#devour.onDevourPer": {
    status: "default-live",
    why:
      "省略 = `\"victim\"`，而 schema 自己的註解就寫死了關鍵：「⚠️ 對 `shape:\"single\"`（出貨唯一形狀）" +
      "兩者完全等價，也就是預設值不替任何人做決定」。6 份 devour 全部是 single，所以這一格今天**選哪個都一樣** —— 零採用不是缺席，" +
      "是這個決策在目前的內容下還不存在。",
  },
  "field:abilities.effects[]#dot.onCasterDeath": {
    status: "default-live",
    why:
      "省略 = `\"continue\"`（`sim/effects/dot.ts` 的 `e.onCasterDeath ?? \"continue\"`）" +
      "＝點燃的火不會因為放火的人倒下就熄掉，那是出貨行為也是玩家預期。`\"stop\"` 是「維持型」DoT 的讀法（施法者一死就停）" +
      "，10 份 dot 沒有一支要那個語意。",
  },
  "field:abilities.effects[]#knockback.getupTicks": {
    status: "default-live",
    why:
      "省略 = `0`（`sim/effects/knockback.ts` 的 `clampKb(e.getupTicks, …)" +
      "`，而 `clampKb` 的 `fallback = 0`）＝落地即可行動，沒有額外的爬起來硬直。14 份擊退全部吃這個預設是**刻意**的：多加一格硬直是設計決策，" +
      "而它一旦有人寫就會出現在這張表上。",
  },
  "field:abilities.effects[]#damage.canCrit": {
    status: "default-live",
    why:
      "省略 = 不暴擊（`sim/effects/damage.ts` 的 `if (e.canCrit)`）＝技能傷害預設不吃暴擊，" +
      "那是出貨行為。⭐ 機制**不在零**：同一條 `sim/combat/critStrike.ts` 管線在 `damageArea.canCrit`（1/49）" +
      "與 `damageLine.canCrit`（2/16）上都有客戶。90 支重製稿裡 11 處提到[暴擊]，逐字讀都是**普攻**暴擊（走 critStrike grant，" +
      "不走這一格），所以單體技能傷害沒有人要暴擊是誠實的。",
  },

  // ── ⑥ 五個「真的還沒有人選」的成員（landing，30 天後回來看） ────────────────
  // 與 ⑤ 的差別是一句話：⑤ 的省略等於一個活著的預設值，這五個的省略等於**另一個
  // 選擇被選走了**，沒有預設值在替它服務。所以它們吃 30 天的時鐘。
  "enum:abilities.effects[]#knockback.from=facing": {
    status: "landing",
    since: "2026-08-12",
    why:
      "擊退的方向來源。預設是 `\"caster\"`（`sim/effects/knockback.ts` 的 `e.from ?? \"caster\"`，" +
      "從施法者往外推），`\"pull\"` 今天剛被 `godie-h02k.r` 的抓取採用，只剩 `\"facing\"`（照**受害者自己的面向**推）" +
      "沒有人選。它是「把人往他自己看的方向推」那一種招式的寫法，14 份擊退沒有一支是。",
  },
  "enum:abilities.effects[]#randomArea.who=target": {
    status: "landing",
    since: "2026-08-12",
    why:
      "隨機落點的圓心放誰身上。預設是 `\"self\"`（`sim/effects/randomArea.ts` 的 `(e.who ?? \"self\")" +
      "`），而 4 份 randomArea 都明寫了 `\"self\"`。`\"target\"`（以解出來的第一個目標為圓心）是「對著那個人頭上下流星雨」" +
      "的寫法，還沒有一支技能要。",
  },

  // ── ⑦ ⛔ **這一筆是 debt，不是豁免** —— 有客戶，而且客戶被寫壞了 ────────────
  //
  // 交辦稿的第三個陷阱逐字是：「有客戶但寫壞了的不可以豁免……那要**回報**，
  // 不是豁免」。`applyBuff.hooks` 正是那一種，所以它記成 `debt`：⛔ 永不到期，
  // 而且**每一次跑都印在 KNOWN DEAD MECHANISMS 橫幅上**。
  //
  // 掃過整棵樹（1,959 份文件）之後，`hooks` 出現的位置只有三種：
  //   passive.ranks[].hooks（絕大多數）· items 的 passive.hooks · auras[].hooks
  // 一份都沒有掛在 `applyBuff` 上。而 `applyBuff.hooks` 存在的理由只有一個：
  // 「接下來 N 秒內，每次普攻/受擊會…」—— 觸發器**跟著那個限時增益一起消失**。
  //
  // 四支需要它的技能被寫成了**沒有閘門的常駐 passive hook**（＝從第一回合起、
  // 不用施放、永遠有效）：
  //   · `godie-emfr.e`  「持續12秒…普通攻擊附加火焰傷害」→ applyBuff(12s) 只放了
  //                      一格 ms −50%，onBasicAttack / onAbilityHit 兩條掛在常駐 passive
  //   · `godie-emfr.r`  「持續12秒…施放技能後的下一次普攻」→ 同上，onBasicAttack 常駐
  //   · `godie-hapm.q`  「進入狂怒…持續6秒…期間每承受…」→ applyBuff(6s, statusId:"rage")
  //                      有了，但 onDamageTaken 那一條沒有跟著它，永遠在
  //   · `godie-h01n.ex` 「[卍解] 狀態下…月牙天衝冷卻縮短50%」→ 少了 whileForm 閘，
  //                      沒卍解也吃得到
  // ⚠️ 對照組證明這不是「大家都這樣寫」：`godie-e002.w`（20-01 風王結界）的同型
  // 觸發器**有**兩道閘（`whileForm:"alternate"` + `condition` mp ≥ N），寫法是對的。
  //
  // ⛔ 我沒有改內容（本輪只動測試，且第零守則⑧：順手發現的缺陷不當場修）。
  // ⭐ 2026-08-13 B3：landing 豁免移除 —— 它落地了（B3-A 反彈：20-04 · 60-04 · 15-002 把 hook 掛進限時 buff）。

  // ── ⑧ 營運母體縮編的三個副作用（owner 2026-08-13 的 legacy 搬遷）────────────
  //
  // 41 位未上架英雄 + 236 支技能搬進 `content/_legacy/`（不在 COLLECTION_NAMES 裡，
  // 引擎讀不到）。這三個 key 的**唯一**採用者剛好全在那 41 位裡面，所以它們是
  // 「零採用」的第七種原因：不是新的、不是壞的、也不是有預設值頂著 —— 是內容被
  // 停用了。⭐ 三筆都帶 `witness`，測試會真的去開那個檔（見 well-formed 那條）。
  //
  // ⚠️ 這三筆與上面任何一筆的差別值得說清楚：它們**曾經是綠的**，而且是靠一份
  // 真的文件綠的。所以它們不需要「先做出第一份客戶」，只需要那位英雄回到名單上 ——
  // 而那一天 STALE 那條測試會自己紅並要求刪掉這裡的條目。
  "tag:weaponClass=gun": {
    status: "legacy-parked",
    witness: "content/_legacy/champions/godie-hlgr.json",
    why: "全名單唯一的槍械英雄是 03 鋼彈-煌（godie-hlgr，tags 帶 \"gun\"），而他在 2026-08-13 隨未上架名單搬進 _legacy。⚠️ 這一格不是裝飾：WEAPON_TAGS → client audio/combatSfx.ts WEAPON_SFX 是普攻音效的選擇鍵，所以零採用的實際意思是「這一版沒有任何英雄會發出槍聲」。引擎與音效表都還在，缺的只是一位持槍的英雄回到營運名單。",
  },
  "field:abilities.vfxLayers[].flyHeight": {
    status: "legacy-parked",
    witness: "content/_legacy/abilities/godie-nman.w.json",
    why: "唯一填過分層高度的是 40-02 必殺！爆熱神音（godie-nman.w，三層 sonicbreathstream 各自 148/161/169 的離地高度），而 40 號英雄在 2026-08-13 隨未上架名單搬進 _legacy。省略時特效貼地，所以留下來的 17 份 vfxLayers 文件逐字不變、畫面上也沒有東西壞掉 —— 這是一個「沒有人需要抬高特效」的零，不是一條死掉的渲染路徑。",
  },
  // ══ 2026-08-18 · 道具光環的兩格,隨 7 件無取得路徑的任務道具一起退場 ════════
  //
  // 那 7 件只被**已宣告退場**的 `quest-rewards` 引用（`retiredLootTables.ts`），
  // 而那張表沒有任何回合／gacha／備援入口 ⇒ 玩家一場也拿不到。判準是「拿不拿得
  // 到」，所以它們搬進 `content/_legacy/items/`。⚠️ 光環機制本身**沒有**退場：
  // `items.auras[].radius/affects/modifiers` 還有 godie-i00z / i060 / i061 三份
  // 現役客戶在用，零的只有下面這兩格 —— 它們的唯一客戶剛好都在那 7 件裡。
  "field:items.auras[].includeSelf": {
    status: "legacy-parked",
    witness: "content/_legacy/items/godie-i02h.json",
    why: "「光環也套在自己身上」的唯一客戶是戰旗 godie-i02h（warbanner-ad，ad pctAdd +35% 含自己）、復仇之袍 godie-i02j 與惡魔吉他 godie-i02k，三件都在 2026-08-18 隨 7 件無取得路徑的任務道具搬進 _legacy。留在營運樹上的三份 auras 文件都是純隊友光環，所以這是一個「沒有人需要把自己算進去」的零，⛔ 不是一條死掉的光環路徑。",
  },
  "field:items.auras[].hooks": {
    status: "legacy-parked",
    witness: "content/_legacy/items/godie-i02j.json",
    why: "「光環給範圍內的人掛一個 hook」的唯一客戶是復仇之袍 godie-i02j（vengeance-thorns：onDamageTaken 回敬 40 + 2×armor 魔法傷害，0.5s internalCooldown）與惡魔吉他 godie-i02k（guitar-melee-drain：onBasicAttack 吸取），兩件都在 2026-08-18 退場。現役的三份 auras 只用 modifiers，所以零的是**授權面**而不是機制 —— sim 那一側照樣把 aura hooks 發出去。",
  },
  "field:items.unique": {
    status: "legacy-parked",
    witness: "content/_legacy/items/swift-boots.json",
    why: "「同一件只能持有一份」的唯一採用者是輕靈之靴 swift-boots（`\"unique\": true`），而它在 2026-08-18（#356）隨 101 件退場道具一起搬進 `content/_legacy/items/`。⛔ 機制沒有退場：`sim/economy/shop.ts` 的 `unique-owned` 拒買、`MerchantShop` 的灰卡、`EquipmentBar` 的獨佔外框三條路都還在讀這一格，只是這一版沒有一件現役道具宣告它。⭐ 所以它是 `legacy-parked` 而不是 `landing` —— 它曾經是綠的、靠一份真的文件綠的，缺的不是內容而是那件道具回到營運樹上（那一天 STALE 那條會自己紅並要求刪掉這一列）。",
  },
  "enum:abilities.effects[]#invulnerable.blocksDamage=magic": {
    status: "legacy-parked",
    witness: "content/_legacy/abilities/godie-hlgr.passive.json",
    why: "「只免疫魔法傷害」這個成員的唯一客戶是 03-00 相轉移裝甲（godie-hlgr.passive，每 3 秒續期一次的 magic-only 免疫），跟著鋼彈-煌一起進了 _legacy。留在營運樹上的 22 份 invulnerable 全部是全類型免疫（缺省），所以這一格是**列舉比現役內容寬**：sim 那一側照樣分辨得出三種 blocksDamage，只是這一版沒有一支技能挑魔法那一種。",
  },

  // ══ 2026-08-13 · 護甲穿透（`penetration`）的三個授權面 ════════════════════
  //
  // ⭐ **機制本身不在零**：`field:items.penetration` 已經被霸王破甲槍
  // `godie-i00f` 採用（owner 2026-08-13 點名把它從真傷改成 100% 護甲穿透），
  // 而 `sim/combat/penetration.test.ts` 用**真的出貨文件**裝上去打一發。
  // 下面三格是**同一格授權**在另外三個面上的節點，不是三個機制 ——
  // `sourceGrants.ts` 的轉發表對四個面一視同仁（該檔的雙向對齊守衛在守）。
  "field:abilities.effects[]#applyBuff.penetration": {
    status: "landing",
    since: "2026-08-13",
    why:
      "`applyBuff` 授予的穿透（限時的「破甲藥水」那一族）。⭐ 引擎這一側是活的：" +
      "`resolvePenetration` 走的是 `ModifierSource` 上的那一格，而 `applyBuff` 與道具" +
      "**共用同一條**授權路徑（`sourceGrants.ts` 的轉發表），所以出貨的道具那一件就是" +
      "這條路徑的證人。零採用＝這一批技能沒有一支的規格寫了「暫時無視 N% 護甲」，" +
      "⛔ 不是機制缺席。憑空給某支技能加穿透就是在改設計（第〇·六守則第 1 層）。",
  },
  "field:abilities.passive.ranks[].penetration": {
    status: "landing",
    since: "2026-08-13",
    why:
      "天生技逐階授予的穿透。同上：同一格授權、同一條轉發路徑，只是掛在天生技的" +
      "rank 上。零採用＝出貨的 100 支天生技沒有一支的規格寫了穿透。⚠️ 這一格存在的" +
      "理由是**授權面要一致**：只開道具不開天生技，作者會遇到「編輯器畫得出來、" +
      "引擎讀不到」——那正是 `sourceGrants.ts` 檔頭警告的形態。",
  },
  "field:augments.penetration": {
    status: "landing",
    since: "2026-08-13",
    why:
      "三選一增益卡授予的穿透。同上第三個面。31 張出貨增益卡沒有一張是穿透卡；" +
      "⛔ 加一張是內容決策，屬於 owner 的排序，不是這一批引擎工作的一部分。",
  },

  // ══ 2026-08-18 · 位移級距（`distanceTier`，GH#318）════════════════════════
  //
  // ⭐ **欄位那一列的豁免已經刪掉** —— `items/godie-i01s` 填了 `"小"`，所以
  // `field:abilities.effects[]#dash.distanceTier` 不再是零採用，照這份清單自己的
  // 規矩（STALE 那一條）它必須消失。⛔ 這不是放寬。
  //
  // 但那一格採用**只用掉四個刻度裡的一個**，於是剩下三個 enum 成員從「整個欄位
  // 零採用」底下浮出來，變成三個單獨的零採用鍵。⚠️ 它們**不是**新機制沒接線：
  // `displacementTiers.test.ts` 的「級別贏過手寫值」用一支只填 `distanceTier` 的
  // 技能真的跑過三條註冊路徑，四個刻度共用同一段查表程式 —— 差別只在查到第幾格。
  //
  // ⛔ 也**不要**為了讓這三列變綠去替既有技能填級別：把一支 dash 從手寫距離改成
  // 中／大／極大，是 −14.3%..+22.2% 的手感變更，owner 沒勾過（第〇·六守則：
  // 可以停就停）。⭐ 唯一「零數值變更」的補法是**距離正好落在該刻度上**的節點。
  "enum:abilities.effects[]#dash.distanceTier=小": {
    status: "landing",
    since: "2026-08-18",
    why:
      "GH#318 位移級距。第一個採用（`items/godie-i01s`）在 2026-08-18 落地 —— ⚠️ 它當時填的字是「小」，"
      + "GH#463 把級距名整體左移一格之後那一筆變成「**極小**」（值一個都沒動）。" +
      "四個刻度共用同一段查表，所以這一列講的是**內容還沒有一支中距離位移需要改用級別**，" +
      "⛔ 不是引擎少了什麼。等哪一支距離正好落在「中」的刻度上時把它改過去，這一列就會自己過期。",
  },
  "enum:abilities.effects[]#dash.distanceTier=中": {
    status: "landing",
    since: "2026-08-18",
    why:
      "共用同一段查表的第三格，引擎那一側與已落地的「極小」逐字是同一條路。" +
      "⚠️ 這一格 GH#463 之前叫「大」—— 合併級距詞彙時挑了 owner 2026-08-11 的舊版（含「超大」），\n      而他同一天稍晚給冷卻級距時已經改口成 極小/小/中/大/極大；改回來是**純改名**，值一個都沒動。" +
      "零採用講的是內容排序（沒有一支這個距離的位移需要改用級別），⛔ 不是機制缺口。",
  },
  // ⭐ 2026-08-22 —— #539 常駐特效。standalone 那一半已經有內容（莉娜的兩份 EX），
  //    champion **內嵌**那一半是零，而那是**外形**問題不是採用問題（見 why）。
  // ── ⭐ 2026-08-22 GH#551/#543/#549 —— 四個新 kind，機制落地當天內容是 0 ──────
  //
  // owner 逐字：「Saber約束勝利之劍(**翻滾光束**), 依文世界終結(**圓周噴發大冰塊**),
  // 莉娜龍破斬(**一直線火球衝擊波後目的地火焰大爆炸**) 都是**動畫特效**」
  // 「將 w3x jass + **球體 + 蝗蟲群單位 3d model 特效** 完美實作出來」
  // 「畫面**閃爍**及**震動** 不然都不知道發生什麼事情有沒有反擊成功」
  // 「別忘了還有**特效文字**」
  //
  // ⛔ 這四筆是 `landing` **不是** `default-live`：它們沒有任何 code 預設在跑,
  //    內容不填就是**什麼都不會發生**。30 天後要嘛有內容採用、要嘛承認是死機制。
  // ⭐ 2026-08-23 —— `floatingText.applyTo=victim` 的豁免**在這裡被刪掉了**，
  //    ⛔ 不是被放寬：它不再是零採用。上一版的理由寫著「首批內容全部掛 `self` ⋯
  //    `udg_FF7_CastedUnit` 其實是被打的人，但 GGD 這一側 `self` 已經對得上畫面」
  //    —— 而那句話在克勞德真的長出七連斬的特效文字之後就不成立了：
  //    施法者站在原地、目標最遠 8 格，`self` 會把「1Hit…7Hit」冒在**離戰鬥現場
  //    八格外的施法者頭上**。⇒ 三支連段技（`godie-hart.r` · `godie-e002.ex` ·
  //    `godie-e00l.ex`）照 JASS 掛 `victim`，這一列於是 stale 而被移除。
  // ── ⭐ 2026-08-22 —— 四個新 kind 的**選用參數**，首批 5 份內容還沒走到 ──────
  //
  // ⚠️ 這 22 列**不是** 22 個缺口:kind 本身已經被採用（三支驗收技能 + 理想鄉反彈），
  //    ⛔ 沒被採用的是它們的**選用子欄位與 enum 成員**。三組：
  //    ① `EFFECT_COMMON_SHAPE` 的公共外殼（condition/radius/side/maxTargets/shape）
  //    ② `spawnModelFx` 自己的其餘路徑與選項（首批只用了 forward ×2 + radial ×1）
  //    ③ `screenShake` 的對象（出貨是 `all`，owner 要「兩邊都感覺到」）
  // ⭐ 全部 `landing` ⇒ 30 天後自動失效,逼人回來看「它到底有沒有人要」。
  "field:abilities.effects[]#screenShake.condition": {
    status: "landing",
    since: "2026-08-22",
    why:
      "⭐ 這一格來自 `EFFECT_COMMON_SHAPE`（每一個 effect kind 都被迫帶著的公共外殼），"
      + "⛔ 不是 `screenShake` 自己的設計。⚠️ 對一個**畫面層**的提示來說 `radius`/`side`/`maxTargets` "
      + "語意上本來就很少用得到 —— 它作用在**看的人**身上,⛔ 不是場上一圈單位。"
      + "⇒ 零採用是**外殼的形狀**,⛔ 不是缺口。⭐ 要反駁它:拿出一個「這個提示要按半徑挑對象」"
      + "的真實需求(例:只讓爆炸半徑內的人畫面震動) —— 那一天這一列就該刪掉。",
  },
  "field:abilities.effects[]#screenShake.radius": {
    status: "landing",
    since: "2026-08-22",
    why:
      "⭐ 這一格來自 `EFFECT_COMMON_SHAPE`（每一個 effect kind 都被迫帶著的公共外殼），"
      + "⛔ 不是 `screenShake` 自己的設計。⚠️ 對一個**畫面層**的提示來說 `radius`/`side`/`maxTargets` "
      + "語意上本來就很少用得到 —— 它作用在**看的人**身上,⛔ 不是場上一圈單位。"
      + "⇒ 零採用是**外殼的形狀**,⛔ 不是缺口。⭐ 要反駁它:拿出一個「這個提示要按半徑挑對象」"
      + "的真實需求(例:只讓爆炸半徑內的人畫面震動) —— 那一天這一列就該刪掉。",
  },
  "field:abilities.effects[]#screenShake.side": {
    status: "landing",
    since: "2026-08-22",
    why:
      "⭐ 這一格來自 `EFFECT_COMMON_SHAPE`（每一個 effect kind 都被迫帶著的公共外殼），"
      + "⛔ 不是 `screenShake` 自己的設計。⚠️ 對一個**畫面層**的提示來說 `radius`/`side`/`maxTargets` "
      + "語意上本來就很少用得到 —— 它作用在**看的人**身上,⛔ 不是場上一圈單位。"
      + "⇒ 零採用是**外殼的形狀**,⛔ 不是缺口。⭐ 要反駁它:拿出一個「這個提示要按半徑挑對象」"
      + "的真實需求(例:只讓爆炸半徑內的人畫面震動) —— 那一天這一列就該刪掉。",
  },
  "field:abilities.effects[]#screenShake.maxTargets": {
    status: "landing",
    since: "2026-08-22",
    why:
      "⭐ 這一格來自 `EFFECT_COMMON_SHAPE`（每一個 effect kind 都被迫帶著的公共外殼），"
      + "⛔ 不是 `screenShake` 自己的設計。⚠️ 對一個**畫面層**的提示來說 `radius`/`side`/`maxTargets` "
      + "語意上本來就很少用得到 —— 它作用在**看的人**身上,⛔ 不是場上一圈單位。"
      + "⇒ 零採用是**外殼的形狀**,⛔ 不是缺口。⭐ 要反駁它:拿出一個「這個提示要按半徑挑對象」"
      + "的真實需求(例:只讓爆炸半徑內的人畫面震動) —— 那一天這一列就該刪掉。",
  },
  "enum:abilities.effects[]#screenShake.shape=circle": {
    status: "landing",
    since: "2026-08-22",
    why:
      "⭐ E1 硬約束逼每一個 kind 帶 `shape`，而首批內容三支全部是 `single`。⚠️ `circle` 對 `screenShake` 要等到有一支技能真的需要「一圈各發一份」才會被用到。⛔ 零採用是**約束的形狀**，不是缺口。",
  },
  "field:abilities.effects[]#floatingText.condition": {
    status: "landing",
    since: "2026-08-22",
    why:
      "⭐ 這一格來自 `EFFECT_COMMON_SHAPE`（每一個 effect kind 都被迫帶著的公共外殼），"
      + "⛔ 不是 `floatingText` 自己的設計。⚠️ 對一個**畫面層**的提示來說 `radius`/`side`/`maxTargets` "
      + "語意上本來就很少用得到 —— 它作用在**看的人**身上,⛔ 不是場上一圈單位。"
      + "⇒ 零採用是**外殼的形狀**,⛔ 不是缺口。⭐ 要反駁它:拿出一個「這個提示要按半徑挑對象」"
      + "的真實需求(例:只讓爆炸半徑內的人畫面震動) —— 那一天這一列就該刪掉。",
  },
  "field:abilities.effects[]#floatingText.radius": {
    status: "landing",
    since: "2026-08-22",
    why:
      "⭐ 這一格來自 `EFFECT_COMMON_SHAPE`（每一個 effect kind 都被迫帶著的公共外殼），"
      + "⛔ 不是 `floatingText` 自己的設計。⚠️ 對一個**畫面層**的提示來說 `radius`/`side`/`maxTargets` "
      + "語意上本來就很少用得到 —— 它作用在**看的人**身上,⛔ 不是場上一圈單位。"
      + "⇒ 零採用是**外殼的形狀**,⛔ 不是缺口。⭐ 要反駁它:拿出一個「這個提示要按半徑挑對象」"
      + "的真實需求(例:只讓爆炸半徑內的人畫面震動) —— 那一天這一列就該刪掉。",
  },
  "field:abilities.effects[]#floatingText.side": {
    status: "landing",
    since: "2026-08-22",
    why:
      "⭐ 這一格來自 `EFFECT_COMMON_SHAPE`（每一個 effect kind 都被迫帶著的公共外殼），"
      + "⛔ 不是 `floatingText` 自己的設計。⚠️ 對一個**畫面層**的提示來說 `radius`/`side`/`maxTargets` "
      + "語意上本來就很少用得到 —— 它作用在**看的人**身上,⛔ 不是場上一圈單位。"
      + "⇒ 零採用是**外殼的形狀**,⛔ 不是缺口。⭐ 要反駁它:拿出一個「這個提示要按半徑挑對象」"
      + "的真實需求(例:只讓爆炸半徑內的人畫面震動) —— 那一天這一列就該刪掉。",
  },
  "field:abilities.effects[]#floatingText.maxTargets": {
    status: "landing",
    since: "2026-08-22",
    why:
      "⭐ 這一格來自 `EFFECT_COMMON_SHAPE`（每一個 effect kind 都被迫帶著的公共外殼），"
      + "⛔ 不是 `floatingText` 自己的設計。⚠️ 對一個**畫面層**的提示來說 `radius`/`side`/`maxTargets` "
      + "語意上本來就很少用得到 —— 它作用在**看的人**身上,⛔ 不是場上一圈單位。"
      + "⇒ 零採用是**外殼的形狀**,⛔ 不是缺口。⭐ 要反駁它:拿出一個「這個提示要按半徑挑對象」"
      + "的真實需求(例:只讓爆炸半徑內的人畫面震動) —— 那一天這一列就該刪掉。",
  },
  "enum:abilities.effects[]#floatingText.shape=circle": {
    status: "landing",
    since: "2026-08-22",
    why:
      "⭐ E1 硬約束逼每一個 kind 帶 `shape`，而首批內容三支全部是 `single`。⚠️ `circle` 對 `floatingText` 要等到有一支技能真的需要「一圈各發一份」才會被用到。⛔ 零採用是**約束的形狀**，不是缺口。",
  },
  // ⭐ `screenFlash` 與上面兩族（`screenShake` / `floatingText`）是**同一種東西**：
  //    一個畫面層的提示。它 2026-08-23 落地時帶著 3 份出貨文件，於是同一族的
  //    公共外殼欄位從「整族零採用」浮出來變成單獨的零採用鍵。理由逐字沿用。
  "field:abilities.effects[]#screenFlash.condition": {
    status: "landing",
    since: "2026-08-23",
    why:
      "⭐ 這一格來自 `EFFECT_COMMON_SHAPE`（每一個 effect kind 都被迫帶著的公共外殼），"
      + "⛔ 不是 `screenFlash` 自己的設計。⚠️ 對一個**畫面層**的提示來說 `radius`/`side`/`maxTargets` "
      + "語意上本來就很少用得到 —— 它作用在**看的人**身上,⛔ 不是場上一圈單位。"
      + "⇒ 零採用是**外殼的形狀**,⛔ 不是缺口。⭐ 要反駁它:拿出一個「這個閃光要按半徑挑對象」"
      + "的真實需求(例:只讓爆炸半徑內的人畫面閃白) —— 那一天這一列就該刪掉。",
  },
  "field:abilities.effects[]#screenFlash.radius": {
    status: "landing",
    since: "2026-08-23",
    why:
      "⭐ 這一格來自 `EFFECT_COMMON_SHAPE`（每一個 effect kind 都被迫帶著的公共外殼），"
      + "⛔ 不是 `screenFlash` 自己的設計。⚠️ 對一個**畫面層**的提示來說 `radius`/`side`/`maxTargets` "
      + "語意上本來就很少用得到 —— 它作用在**看的人**身上,⛔ 不是場上一圈單位。"
      + "⇒ 零採用是**外殼的形狀**,⛔ 不是缺口。⭐ 要反駁它:拿出一個「這個閃光要按半徑挑對象」"
      + "的真實需求(例:只讓爆炸半徑內的人畫面閃白) —— 那一天這一列就該刪掉。",
  },
  "field:abilities.effects[]#screenFlash.side": {
    status: "landing",
    since: "2026-08-23",
    why:
      "⭐ 這一格來自 `EFFECT_COMMON_SHAPE`（每一個 effect kind 都被迫帶著的公共外殼），"
      + "⛔ 不是 `screenFlash` 自己的設計。⚠️ 對一個**畫面層**的提示來說 `radius`/`side`/`maxTargets` "
      + "語意上本來就很少用得到 —— 它作用在**看的人**身上,⛔ 不是場上一圈單位。"
      + "⇒ 零採用是**外殼的形狀**,⛔ 不是缺口。⭐ 要反駁它:拿出一個「這個閃光要按半徑挑對象」"
      + "的真實需求(例:只讓爆炸半徑內的人畫面閃白) —— 那一天這一列就該刪掉。",
  },
  "field:abilities.effects[]#screenFlash.maxTargets": {
    status: "landing",
    since: "2026-08-23",
    why:
      "⭐ 這一格來自 `EFFECT_COMMON_SHAPE`（每一個 effect kind 都被迫帶著的公共外殼），"
      + "⛔ 不是 `screenFlash` 自己的設計。⚠️ 對一個**畫面層**的提示來說 `radius`/`side`/`maxTargets` "
      + "語意上本來就很少用得到 —— 它作用在**看的人**身上,⛔ 不是場上一圈單位。"
      + "⇒ 零採用是**外殼的形狀**,⛔ 不是缺口。⭐ 要反駁它:拿出一個「這個閃光要按半徑挑對象」"
      + "的真實需求(例:只讓爆炸半徑內的人畫面閃白) —— 那一天這一列就該刪掉。",
  },
  "enum:abilities.effects[]#screenFlash.shape=circle": {
    status: "landing",
    since: "2026-08-23",
    why:
      "⭐ E1 硬約束逼每一個 kind 帶 `shape`，而首批內容三支全部是 `single`。⚠️ `circle` 對 `screenFlash` 要等到有一支技能真的需要「一圈各發一份」才會被用到。⛔ 零採用是**約束的形狀**，不是缺口。",
  },
  // ⛔ `field:abilities.effects[]#screenFlash.scripted` 的 `debt` 豁免在 2026-08-23
  // **刪掉**了（GH#602）：owner 那天的裁決 ③ 是 (a)「讓『劇本指定的演出』可以豁免全域上限」，
  // 而 `content/abilities/godie-zombieking.passive.json` 的 `screenFlash` 已經填上 `scripted: true`。
  // ⭐ 刪掉這一列本身就是那一格的閘：`scripted` 再被拿掉 ⇒ 零採用又沒有豁免 ⇒ 這一支紅。
  "field:abilities.effects[]#spawnModelFx.condition": {
    status: "landing",
    since: "2026-08-22",
    why:
      "⭐ 這一格來自 `EFFECT_COMMON_SHAPE`（每一個 effect kind 都被迫帶著的公共外殼），"
      + "⛔ 不是 `spawnModelFx` 自己的設計。⚠️ 對一個**畫面層**的提示來說 `radius`/`side`/`maxTargets` "
      + "語意上本來就很少用得到 —— 它作用在**看的人**身上,⛔ 不是場上一圈單位。"
      + "⇒ 零採用是**外殼的形狀**,⛔ 不是缺口。⭐ 要反駁它:拿出一個「這個提示要按半徑挑對象」"
      + "的真實需求(例:只讓爆炸半徑內的人畫面震動) —— 那一天這一列就該刪掉。",
  },
  "field:abilities.effects[]#spawnModelFx.radius": {
    status: "landing",
    since: "2026-08-22",
    why:
      "⭐ 這一格來自 `EFFECT_COMMON_SHAPE`（每一個 effect kind 都被迫帶著的公共外殼），"
      + "⛔ 不是 `spawnModelFx` 自己的設計。⚠️ 對一個**畫面層**的提示來說 `radius`/`side`/`maxTargets` "
      + "語意上本來就很少用得到 —— 它作用在**看的人**身上,⛔ 不是場上一圈單位。"
      + "⇒ 零採用是**外殼的形狀**,⛔ 不是缺口。⭐ 要反駁它:拿出一個「這個提示要按半徑挑對象」"
      + "的真實需求(例:只讓爆炸半徑內的人畫面震動) —— 那一天這一列就該刪掉。",
  },
  "field:abilities.effects[]#spawnModelFx.side": {
    status: "landing",
    since: "2026-08-22",
    why:
      "⭐ 這一格來自 `EFFECT_COMMON_SHAPE`（每一個 effect kind 都被迫帶著的公共外殼），"
      + "⛔ 不是 `spawnModelFx` 自己的設計。⚠️ 對一個**畫面層**的提示來說 `radius`/`side`/`maxTargets` "
      + "語意上本來就很少用得到 —— 它作用在**看的人**身上,⛔ 不是場上一圈單位。"
      + "⇒ 零採用是**外殼的形狀**,⛔ 不是缺口。⭐ 要反駁它:拿出一個「這個提示要按半徑挑對象」"
      + "的真實需求(例:只讓爆炸半徑內的人畫面震動) —— 那一天這一列就該刪掉。",
  },
  "field:abilities.effects[]#spawnModelFx.maxTargets": {
    status: "landing",
    since: "2026-08-22",
    why:
      "⭐ 這一格來自 `EFFECT_COMMON_SHAPE`（每一個 effect kind 都被迫帶著的公共外殼），"
      + "⛔ 不是 `spawnModelFx` 自己的設計。⚠️ 對一個**畫面層**的提示來說 `radius`/`side`/`maxTargets` "
      + "語意上本來就很少用得到 —— 它作用在**看的人**身上,⛔ 不是場上一圈單位。"
      + "⇒ 零採用是**外殼的形狀**,⛔ 不是缺口。⭐ 要反駁它:拿出一個「這個提示要按半徑挑對象」"
      + "的真實需求(例:只讓爆炸半徑內的人畫面震動) —— 那一天這一列就該刪掉。",
  },
  "enum:abilities.effects[]#spawnModelFx.shape=circle": {
    status: "landing",
    since: "2026-08-22",
    why:
      "⭐ E1 硬約束逼每一個 kind 帶 `shape`，而首批內容三支全部是 `single`。⚠️ `circle` 對 `spawnModelFx` 要等到有一支技能真的需要「一圈各發一份」才會被用到。⛔ 零採用是**約束的形狀**，不是缺口。",
  },
  "enum:abilities.effects[]#spawnModelFx.touchSide=allies": {
    status: "landing",
    since: "2026-08-22",
    why:
      "路徑上碰到**友軍**才觸發。⛔ 首批三支都是攻擊技能（`enemies`）。⭐ 它為「掃過去幫隊友補血/加速」那一族留著 —— 那正是 owner 說的「模板」該吃得下的另一半。",
  },
  "enum:abilities.effects[]#screenShake.applyTo=self": {
    status: "landing",
    since: "2026-08-22",
    why:
      "⭐ #549 的出貨用的是 `all` —— owner 的理由逐字：「**不然都不知道發生什麼事情有沒有反擊成功**」，⇒ **兩邊都要感覺到**。`self`（只有施法者自己）留給「不該讓對手知道」的那一族（潛行、埋伏），⛔ 而那一族今天還沒有內容。",
  },
  "enum:abilities.effects[]#screenShake.applyTo=victim": {
    status: "landing",
    since: "2026-08-22",
    why:
      "⭐ #549 的出貨用的是 `all` —— owner 的理由逐字：「**不然都不知道發生什麼事情有沒有反擊成功**」，⇒ **兩邊都要感覺到**。`victim`（只有被打的那一個）留給「不該讓對手知道」的那一族（潛行、埋伏），⛔ 而那一族今天還沒有內容。",
  },
  // ⭐ 2026-08-22 —— #147 的擊退還原之後，「大」這一格空了；
  //    ⭐ 2026-08-23（GH#563）**又有內容了**，所以這一列劃掉：74-02 八刀一閃的衝刺
  //    是 JASS `OneCutMove` 的 16 步 × 50 wc3 = **800 wc3**，照 `GGD_PER_WC3 = 11/600`
  //    正是 **14.67** —— 逐位元等於 travel 梯的「大」。⛔ 不要把它加回來。
  // ⭐ 2026-08-21 —— 耗魔級距（`config.mana-tiers@1`），五軸的**最後一軸**。
  // ⚠️ 它落地當天四格就有內容（極小 / 小 / 中 / 大 分佈在 204 支上），只有頂格是零。
  "enum:abilities.manaCostTier=極大": {
    status: "landing",
    since: "2026-08-21",
    why:
      "五格共用 `resolveManaCostTier` 同一段查表，另外四格當天就有 204 支在走 —— " +
      "路是通的。「極大」＝**魔力池的一半**（owner 2026-08-19 的兩個錨長出來的頂格：" +
      "連續兩發清空魔條），而全庫最貴的一支首階 MP 是 650，離它還有一段。" +
      "⛔ 不要為了讓這一列變綠把某支技能的耗魔拉上去 —— 那是**平衡改動**，是 owner 的題。",
  },
  // ⭐ 2026-08-21 —— 速度成長級距（`config.speed-growth-tiers@1`），掛在**英雄卡**上。
  // ⚠️ 它與另外五軸的形狀相反：那五軸落地當天四格就有內容，而這一軸**刻意只有兩格**。
  //    量到的起點是 49 位可選本體的 ms 每級成長**全部 0**、as 全部 0.02（一個都不差），
  //    所以「值等於他們今天的成長」的那兩格（ms 極小 / as 小）各有 49 位，其餘八格是零。
  //    ⛔ 那八格要有人，就是一次**平衡改動** —— 那是 owner 的題，⛔ 不是我可以自己填的
  //    （`config.speed-growth-tiers@1` 的 `requireAuthoredParity` 正在守這件事）。
  // 🔴 2026-08-21（同日下午）—— **`as` 那五格全部退場**。owner 逐字：
  //   「看不懂你第二第三選項，**請你照出身表的規劃來設定就好**」
  //   ⇒ `as` 進了 `config.stat-normalization@1` 的 `appliesTo`，`growth.as` 的主人
  //   變成**出身五級距**，而 `pnpm speedtiers:build` 從 `appliesTo` × `channel`
  //   **推導**自己該管哪幾條軸 ⇒ 它不再敲 `asGrowthTier`，並把 49 張卡上那一行刪掉。
  //   ⛔ 一條軸只能有一個主人：級距包在正規化**外面**（`registries.ts`），
  //   兩邊都留著會讓出身表那一半被靜靜吃掉（失敗形態②）。
  //   ⚠️ 機制**一行都沒刪** —— 兩把梯子的 `as` 欄、`resolveSpeedGrowthTiers` 的
  //   `as` 分支、後台那一格全都在；差別只在今天沒有一張卡填它。
  "field:champions.asGrowthTier": {
    status: "superseded",
    why:
      "`growth.as` 的主人在 2026-08-21 交給了 `config.stat-normalization@1` 的出身五級距" +
      "（owner：「請你照出身表的規劃來設定就好」）。⇒ 這個欄位**刻意**是 0 —— " +
      "`tools/speed-growth/gen.ts` 從 `appliesTo` × `channel` 推導，只要 `as` 還在名單上就" +
      "不敲它，而且會把卡上舊的那一行刪掉。⭐ 欄位與整條解析路徑都留著（`ms` 正在走同一條），" +
      "owner 哪天把 `as` 從 `appliesTo` 拿掉，產生器會自動把它寫回 49 張卡 ⇒ 這一列自動變綠。" +
      "⛔ 不要為了讓它變綠去手填一張卡：那會讓兩個系統同時寫 growth.as，而出身表那一半" +
      "會被靜靜吃掉。前後對照在 `docs/legacy/_attr-growth-zeroed-superseded.md` ⑤。",
  },
  ...Object.fromEntries(
    [
      "enum:champions.msGrowthTier=小",
      "enum:champions.msGrowthTier=中",
      "enum:champions.msGrowthTier=大",
      "enum:champions.msGrowthTier=極大",
    ].map((key) => [
      key,
      {
        status: "landing",
        since: "2026-08-21",
        why:
          "五格共用 `resolveSpeedGrowthTiers` 同一段查表，而其中一格（ms「極小」）" +
          "當天就有 **49 位**在走 —— 路是通的，⛔ 不是機制沒接上。零的那四格是**設計空間**：" +
          "這一版宣告零平衡改動（49 位一律填「值等於他今天成長」的那一格），把任何一位移出去" +
          "都是在改他跑多快。⛔ 不要為了讓這一列變綠去動任何一張英雄卡 —— " +
          "到期條件是 owner 的速度平衡盤，不是這條測試。" +
          "⚠️ `as` 的那五格在同一天**退場**了（交給出身表，見上面 `field:champions.asGrowthTier`）。",
      } satisfies Exemption,
    ]),
  ),
  // ⭐ GH#414 施法距離級距／AoE 級距的零採用列**已經全部到期並刪掉**（2026-08-21
  //    五級距全轉：rangeTier 188 支、radiusTier 85 支、manaCostTier 204 支落地）。
  //    ⚠️ 留這一段是為了說明**為什麼這裡現在是空的** —— 它們不是被放寬掉的，
  //    是內容真的填上去了；STALE 那半邊當天就把四列叫出來要求刪除。
};

let census: Census;
let store: ContentStore;

beforeAll(async () => {
  const result = await new ContentLoader(shippedContentSource(CONTENT_DIR)).load();
  store = result.store;
  census = censusAdoption(store);
}, 60_000);

/** Days between an ISO date and now, floored. */
function daysSince(iso: string, now: number): number {
  return Math.floor((now - Date.parse(iso)) / 86_400_000);
}

/** Entries whose `landing` grace has run out at `now`. */
function expiredGraces(now: number): string[] {
  return Object.entries(EXEMPTIONS)
    .filter(([, e]) => e.status === "landing")
    .filter(([, e]) => e.since === undefined || daysSince(e.since, now) > GRACE_DAYS)
    .map(([k]) => k);
}

describe("field adoption census (recipe S8: mechanism shipped, content 0)", () => {
  it("prints the census — this is the owner-facing report", () => {
    // Always emitted, pass or fail. The numbers ARE the deliverable: which
    // mechanisms content actually reaches, and how hard.
    // eslint-disable-next-line no-console
    console.log("\n" + formatCensus(census) + "\n");

    const debts = Object.entries(EXEMPTIONS).filter(([, e]) => e.status === "debt");
    if (debts.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        [
          `\n  ${"═".repeat(74)}`,
          `  KNOWN DEAD MECHANISMS — ${debts.length} registered features that never happen in a match.`,
          `  These are ACCEPTED FAILURES, not passing checks. They print every run on purpose.`,
          `  ${"═".repeat(74)}`,
          ...debts.map(([k, e]) => `   • ${k}\n     ${e.why}`),
          "",
        ].join("\n"),
      );
    }
    expect(census.rows.length).toBeGreaterThan(0);
  });

  it("every registered field / Stat / enum member / effect kind is adopted, or exempted", () => {
    const zeroes = unadopted(census);
    const unexplained = zeroes.filter((r) => EXEMPTIONS[r.key] === undefined);

    const message =
      unexplained.length === 0
        ? ""
        : [
            "",
            "S8 — A REGISTERED MECHANISM WITH ZERO CONTENT ADOPTION.",
            "",
            "These keys are offered by the schemas (or by a code vocabulary) and NOT ONE",
            "content document uses them. Nothing will error; the feature simply never",
            "happens in a match. That is exactly the shape docs/_false-completions.md",
            "catalogues as S8, and it is why this test exists.",
            "",
            ...unexplained.map(
              (r) => `  ${r.key}\n      0 of ${r.reach} docs that could have used it`,
            ),
            "",
            "THREE WAYS TO RESOLVE THIS — pick one deliberately:",
            "",
            "  1. AUTHOR THE CONTENT. Usually the right answer. Editing one doc in",
            "     content/ is enough to turn the row green, and that one doc is proof the",
            "     path works end to end.",
            "",
            "  2. IT IS NEW — add it to EXEMPTIONS in this file with",
            `     { status: "landing", since: "<today, ISO>", why: "…" }.`,
            `     That suppresses the failure for ${GRACE_DAYS} days and then fails again,`,
            "     so the migration cannot be forgotten.",
            "",
            "  3. ZERO IS CORRECT AND PERMANENT — add it to EXEMPTIONS with the status",
            `     that says WHY: "default-live" (the behaviour ships from a code default`,
            `     and the field only overrides it), "runtime-authored" (code synthesizes`,
            `     the doc), "schema-impossible" (another rule forbids setting it here),`,
            `     "superseded" (dead field kept for compat), "legacy-parked" (the only`,
            `     doc that adopts it moved to content/_legacy/ — name it as \`witness\`),`,
            `     or "debt" (it IS broken,`,
            "     you are recording it rather than fixing it now — debts print as a loud",
            "     banner on every run).",
            "",
            "Do NOT delete the field, the Stat, or the enum member just to make this",
            "pass unless you actually mean to remove the mechanism.",
            "",
          ].join("\n");

    expect(unexplained.map((r) => r.key), message).toEqual([]);
  });

  it("no exemption is STALE — an adopted key must lose its exemption", () => {
    // The self-cleaning half. Without it the list only ever grows, and a list
    // that is always true is a list nobody reads.
    const zeroKeys = new Set(unadopted(census).map((r) => r.key));
    const byKey = new Map(census.rows.map((r) => [r.key, r]));
    const stale = Object.keys(EXEMPTIONS).filter((k) => !zeroKeys.has(k));

    const message = [
      "",
      "STALE EXEMPTION(S) — these keys are no longer at zero, so their entries in",
      "EXEMPTIONS (packages/shared/src/content/fieldAdoption.test.ts) are now lies.",
      "DELETE the listed entries; that is the entire fix.",
      "",
      ...stale.map((k) => {
        const r = byKey.get(k);
        if (r === undefined) {
          return `  ${k}\n      no longer a registered key at all — the schema changed under it`;
        }
        if (r.reach < MIN_REACH) {
          return `  ${k}\n      reach fell to ${r.reach} (< MIN_REACH ${MIN_REACH}); the census no longer claims anything about it`;
        }
        return `  ${k}\n      now adopted by ${r.docs} doc(s), e.g. ${r.examples.join(", ")}`;
      }),
      "",
    ].join("\n");

    expect(stale, message).toEqual([]);
  });

  it("no `landing` grace has expired — a new field cannot stay new forever", () => {
    const expired = expiredGraces(Date.now());
    expect(
      expired,
      `\nThese exemptions were filed as "landing" (brand-new field, adoption imminent)\n` +
        `and are now older than ${GRACE_DAYS} days. Either finish the content migration,\n` +
        `or re-file them with an honest status — "debt" if the migration is not going to\n` +
        `happen soon, which at least keeps them visible in the banner every run.\n` +
        expired.map((k) => `  ${k}`).join("\n") +
        "\n",
    ).toEqual([]);
  });

  it("the grace really does expire (the mechanism, not today's data)", () => {
    // Exercised on synthetic entries so the assertion holds no matter what the
    // EXEMPTIONS table contains — otherwise this logic would be dead code the
    // day the table has no `landing` rows, which is most days.
    const now = Date.parse("2026-07-24T00:00:00Z");
    expect(daysSince("2026-07-24T00:00:00Z", now)).toBe(0);
    expect(daysSince("2026-06-24T00:00:00Z", now)).toBe(30);
    expect(daysSince("2026-06-23T00:00:00Z", now)).toBe(31);
    // …and a `landing` entry with no `since` is expired on sight, so it cannot
    // be used as an unbounded silencer.
    expect(daysSince("2026-06-23T00:00:00Z", now) > GRACE_DAYS).toBe(true);
    expect(daysSince("2026-06-24T00:00:00Z", now) > GRACE_DAYS).toBe(false);
  });

  it("every exemption is well-formed: a status, a real reason, and a date when required", () => {
    const bad: string[] = [];
    for (const [key, e] of Object.entries(EXEMPTIONS)) {
      if (!/^(field|enum|variant|tag):/.test(key)) bad.push(`${key}: not a census key`);
      // A reason short enough to be "n/a" is not a reason. This is the rule
      // that stops the list degrading into a list of keys.
      if (e.why.trim().length < 40) bad.push(`${key}: why is too short to be a reason`);
      if (e.status === "landing" && e.since === undefined) bad.push(`${key}: landing needs since`);
      if (e.since !== undefined && Number.isNaN(Date.parse(e.since))) {
        bad.push(`${key}: since is not a date`);
      }
      // ⭐ `legacy-parked` is the one status that claims a FACT about another
      // file ("the adopter is parked in content/_legacy/"), so it is the one
      // status that can be checked instead of believed. Open the witness and
      // look for the doc. A witness that vanished (deleted, or restored into the
      // operating roster) makes the exemption a lie, and this goes red before
      // anyone has to notice the census row.
      if (e.status === "legacy-parked") {
        if (e.witness === undefined) {
          bad.push(`${key}: legacy-parked needs a witness doc under content/_legacy/`);
        } else if (!e.witness.startsWith("content/_legacy/")) {
          bad.push(`${key}: witness ${e.witness} is not under content/_legacy/`);
        } else if (!existsSync(join(REPO_ROOT, e.witness))) {
          bad.push(`${key}: witness ${e.witness} does not exist — the exemption's evidence is gone`);
        } else {
          // …and the witness must actually MENTION the thing. A cheap textual
          // check on purpose: it costs one read and it is the difference between
          // "a path that resolves" and "a doc that adopts the key".
          const needle = key.slice(key.lastIndexOf(key.includes("=") ? "=" : ".") + 1);
          const text = readFileSync(join(REPO_ROOT, e.witness), "utf8");
          if (!text.includes(needle)) {
            bad.push(`${key}: witness ${e.witness} never mentions "${needle}"`);
          }
        }
      }
      if (e.status !== "legacy-parked" && e.witness !== undefined) {
        bad.push(`${key}: witness only means something for legacy-parked`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("GUARD THE GUARD: the census measured the whole tree, not three documents", () => {
    // Every assertion above is vacuously true against an empty census. These
    // are the numbers that make a green run mean something. They are floors,
    // not pins, so authoring content never breaks them.
    expect(census.totalDocs).toBeGreaterThan(1400);
    expect(census.rows.length).toBeGreaterThan(250);

    const kinds = new Set(census.rows.map((r) => r.kind));
    expect([...kinds].sort()).toEqual(["enum", "field", "tag", "variant"]);

    // The four things the recipe names must each be genuinely reachable, or a
    // refactor could silently stop censusing one of them and still pass.
    const reachable = census.rows.filter((r) => r.reach >= MIN_REACH);
    expect(reachable.filter((r) => r.kind === "field").length).toBeGreaterThan(80);
    expect(reachable.filter((r) => r.kind === "enum").length).toBeGreaterThan(60);
    expect(reachable.filter((r) => r.kind === "variant").length).toBeGreaterThan(10);
    expect(reachable.filter((r) => r.kind === "tag").length).toBe(
      TAG_VOCABULARIES.reduce((n, v) => n + v.members.length, 0),
    );

    // Stats arrive through zStat as a nativeEnum; if that walk ever breaks,
    // "a Stat nothing references" stops being detectable and this test would
    // pass for the wrong reason. Counted against ALL_STATS rather than a
    // literal, so adding a Stat cannot quietly fall outside the census.
    //
    // ⚠️ THE SEGMENT IS `*`, NOT `stat`, AND THIS GUARD ONCE FAILED SILENTLY
    // BECAUSE OF IT. `zStatModifier` grew `from: zStat.optional()` on
    // 2026-07-31 (ModOp.PercentOf needs to name the stat the percentage is
    // taken OF). `unwrap()` strips the `.optional()`, so `stat` and `from` now
    // resolve to the SAME zStat instance, and the walker's sibling-collapse
    // renames BOTH segments to `*` (fieldAdoption.ts:256). The 16 rows are all
    // still there — only their key changed — but the old `"].stat="` filter
    // matched NOTHING, so `statRows` went empty and every assertion below it
    // became vacuous. That is this guard's own failure mode, caught by itself.
    //
    // ⚠️ AND IT HAPPENED A SECOND TIME ON 2026-08-10, FOR A DIFFERENT REASON —
    // which is why the site is no longer written down anywhere. `applyBuff`
    // grew `maxStat: { stat: zStat, … }` (S4b, the absolute stat ceiling). The
    // walker names each schema INSTANCE at exactly one path and prefers the
    // lexicographically smaller one (fieldAdoption.ts:238), and
    // `applyBuff.maxStat.stat` sorts before `applyBuff.modifiers[].*` — so all
    // 16 rows moved to the new field's path. Nothing about the census broke
    // (the rows are instance-anchored: `docs`/`reach` still count every
    // occurrence anywhere), but a hard-coded prefix pointed at a site that no
    // longer holds them. The general lesson: ANY new field that reuses an
    // existing zod instance can relocate that instance's rows, so a literal
    // path in this file is a guard with an expiry date.
    //
    // So the site is DISCOVERED, not asserted: find the enum site that carries
    // the complete Stat set. That excludes the narrower stat enums on the
    // CONDITION path (`condition|0|1|1.stat`, a 10-member subset) by counting
    // rather than by prefix, and the `.op=` rows by membership in ALL_STATS
    // (flat/pctAdd/… are not Stats). It fails, loudly, exactly when it should:
    // when no site in the whole census enumerates every Stat.
    const isStat = new Set<string>(ALL_STATS);
    const statSites = new Map<string, Set<string>>();
    for (const r of census.rows) {
      if (r.kind !== "enum") continue;
      const cut = r.key.lastIndexOf("=");
      const value = r.key.slice(cut + 1);
      if (!isStat.has(value)) continue;
      const site = r.key.slice(0, cut);
      let vals = statSites.get(site);
      if (!vals) statSites.set(site, (vals = new Set()));
      vals.add(value);
    }
    const fullSites = [...statSites].filter(([, vals]) => vals.size === ALL_STATS.length);
    expect(
      fullSites.map(([site]) => site),
      `no census site enumerates all ${ALL_STATS.length} Stats — the zStat walk broke, ` +
        `so "a Stat nothing references" is no longer detectable. Sites seen: ` +
        [...statSites].map(([s, v]) => `${s} (${v.size})`).join(", "),
    ).not.toEqual([]);
    // `evasion` is the canary: it was the audit's headline zero, and it landed
    // in content while this file was being written. The row must EXIST; this
    // test deliberately does not assert what its count is.
    expect(fullSites.every(([, vals]) => vals.has("evasion"))).toBe(true);
  });

  it("THE CASCADE RULE: a child of an unadopted container is not an independent finding", () => {
    // hitFeel has ten optional children. If `hitFeel` itself were unset the
    // report would name eleven problems that are one problem. Anything with
    // reach 0 is suppressed, so adopting the parent is what makes the children
    // visible — one finding at a time, outermost first.
    const suppressed = census.rows.filter((r) => r.reach === 0);
    for (const r of suppressed) expect(r.docs).toBe(0);
    // There must actually BE some, or this rule is untested. Today's example
    // is everything under `passive.ranks[].auras`, whose container has zero
    // adoption: the aura's own radius/affects/lingerSec are ONE finding, not
    // four. Adopting the container is what makes its children visible.
    expect(suppressed.length).toBeGreaterThan(0);
    // Suppressed rows appear in neither the report nor the failure set.
    const report = formatCensus(census);
    const zeroKeys = new Set(unadopted(census).map((r) => r.key));
    for (const r of suppressed) {
      expect(report, `${r.key} should be cascade-suppressed`).not.toContain(r.key);
      expect(zeroKeys.has(r.key), `${r.key} must not be a reported failure`).toBe(false);
    }
  });

  it("the census is deterministic — same store, same rows, same order", () => {
    // Key stability is what lets EXEMPTIONS be written down at all. The schema
    // naming walk picks shortest-path names with a lexicographic tiebreak, so a
    // second pass over the same store must reproduce the keys byte for byte.
    // (A Map-iteration-order dependency here would make the exemption list
    // flap between runs, which is worse than having no guard.)
    const again = censusAdoption(store);
    expect(again.rows.map((r) => `${r.key}:${r.docs}:${r.reach}`)).toEqual(
      census.rows.map((r) => `${r.key}:${r.docs}:${r.reach}`),
    );
  });
});
