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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { FsContentSource } from "./node/FsContentSource";
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
const CONTENT_DIR = join(HERE, "../../../../content");

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

  "field:items.block.lethalBasis": {
    status: "default-live",
    why: "省略 = \"hpAndShields\" = 血 + 這一發吃得到的護盾,也就是「這一發真的會殺死我嗎」。晨曦之光 / 殺豬刀 兩件都用預設,所以零採用正是它該有的樣子。寫 \"hp\" 是文案的字面讀法(只看血條),留著是因為那是 owner 會想切的一題 —— 見 sim/combat/block.ts BlockLethalBasis。",
  },

  // ── 傷害型別轉換 items@1.damageTypeOverride (2026-08-01) ──────────────────
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
  "field:items.damageTypeOverride.applyAt": {
    status: "default-live",
    why: "省略 = \"afterGates\",而且那個預設**真的在跑**:sim/combat/damageTypeOverride.ts 的 resolveDamageConversion 逐個來源比對 `(ov.applyAt ?? \"afterGates\") !== phase`,三件出貨武器全部走這一條。它的意思是無敵/免疫與閃避**先用原本的型別**判定,轉換只影響護甲魔抗與護盾型別過濾 —— 也就是 owner 文案「無視防禦」字面上要的東西,一點不多。寫 \"beforeGates\" 是「連魔法免疫也穿透」,那是一個沒有人要求過的隱性升級,所以零採用正是它該有的樣子。兩側都由 sim/combat/damageTypeOverride.test.ts 的「applyAt —— the conservative default leaves 魔法免疫 working」逐條驅動(預設那條與 beforeGates 那條各一),所以這一格不是「schema 有個欄位」。",
  },
  "enum:items.damageTypeOverride.scope=all": {
    status: "debt",
    why: "sim 認得它(originInScope 的 `scope === \"all\"` 早退,由 damageTypeOverride.test.ts 的 origin 分類表逐列驅動,含 hook: / mob / guardian 三種只有 \"all\" 抓得到的封包),但沒有任何一件出貨道具要它:三件的文案分別講「普攻」與「技能」,而 \"all\" 會額外把道具 proc、小怪與守衛塔封包一起轉成真傷 —— 惡夢魔王碎片 godie-i067 的 authoringNote 就是這樣寫的:「那是另一件道具」。這一格是**列舉比內容寬**,不是壞掉的機制;掛 debt 是因為六個 status 裡只有它能讓這一列永遠留在 banner 上而不說謊(理由見上面那段)。刪掉這一條的日子,是有人真的做出「這位持有者打出去的每一發都是真傷」那件道具的日子;若 owner 裁定永遠不會有,誠實的做法是把成員從 zItemDamageTypeOverride 拿掉,不是改成一個聽起來比較舒服的 status。",
  },
  "enum:items.damageTypeOverride.becomes=magic": {
    status: "debt",
    why: "`becomes` 被**刻意**做成完整的 DamageType 而不是 `toTrue: boolean` —— 理由寫在 sim/combat/damageTypeOverride.ts 的 DamageTypeOverride.becomes:WC3 有一整族「攻擊屬性轉換」(物理↔魔法)的道具與光環,用同一個機制就寫得出來,而多開一個 boolean 才是把決策烘進程式(第一守則)。所以這一格的零是**那個決定的必然結果**,不是有人忘了填:今天三件出貨全部是 \"true\",而 GGD 還沒有匯入任何一件物理↔魔法轉換道具。sim 這一側是活的(CONVERSION_RANK 的全序由 damageTypeOverride.test.ts 的「two conflicting sources resolve the same way in EITHER attach order」用 becomes:\"magic\" 真的驅動)。掛 debt 而不是 landing:沒有遷移在路上,而 30 天的鬧鐘只會逼出一件為了餵測試而生的道具。",
  },
  "enum:items.damageTypeOverride.becomes=physical": {
    status: "debt",
    why: "同 becomes=magic 的另一半:「把魔法傷害打成物理」。它比 magic 更遠 —— 出貨內容裡連一句承諾這種轉換的文案都沒有(掃過 219 份 item 文件的 description)。留著的理由是列舉鏡射 DamageType 這個決定本身,而不是有人要求過。⚠️ 它與 magic 的差別值得記一筆:magic 那格在 sim 測試裡被真的驅動過(CONVERSION_RANK 排序),physical 只作為排序表的最低位存在。所以如果 owner 裁定這一族永遠不進 GGD,physical 是第一個該被拿掉的成員,而拿掉它會同時簡化 CONVERSION_RANK。",
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
  "field:abilities.passive.ranks[].auras[].hooks": {
    status: "landing",
    since: "2026-07-30",
    why: 'NOT "nobody needs it": 86 map abilities derive from a stock aura row and only 5 are ported. Waiting on three Thorns auras (`ACah` CP-00 棘刺之光, `AEah` 25-04 無想轉生 7/14/21 %, `A0XK`) and three Plague auras (`Aap1`/`Aap2`/`Aap3` 汗臭味 / 疫病雲) — neither reflection nor a periodic tick is expressible as a `StatModifier`. Resolve by porting 無想轉生 onto an `onDamageTaken` aura hook.',
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
  "enum:abilities.effects[]#applyBuff.hooks[].victim=enemyChampion": {
    status: "landing",
    since: "2026-08-04",
    why: "批 1 決策點 1-2 的成員：17 張稜彩卡有 13 個 hook 位置寫「敵方英雄」，而在它之前引擎的 `champion` 對隊友也成立。sim 那一側已經完整實作並有行為守衛（sim/effects/hookVocabulary.test.ts ①，突變驗證過），等的是批 2/4 的卡片文件。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].victim=allyChampion": {
    status: "landing",
    since: "2026-08-04",
    why: "`enemyChampion` 的另一半（同一次列舉加寬）。它比 enemyChampion 更遠：17 張卡裡沒有一張需要「只對隊友觸發」，留著是因為做成單邊的過濾器會讓下一張『鼓舞隊友』的卡再改一次 union。守衛同上 ①。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].victim=enemy": {
    status: "landing",
    since: "2026-08-04",
    why: "⭐ 批 1 決策點 1-1，全計畫最重要的一格：owner 已裁決不給殭屍 StatsComp，所以 9 張在殭屍波裡半殘的卡唯一的活路就是這個成員。零採用是因為那 9 張卡本身還沒寫（跨批 2/3/4/5）。全域覆寫在 config/augment-filter.json，守衛在 sim/effects/hookVocabulary.test.ts ①。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].damageSource=ability": {
    status: "landing",
    since: "2026-08-04",
    why: "批 1 決策點 1-3：`nonBasic` 把技能、DoT、火圈、守衛、小怪混成一堆，而戰爭交響曲說的是「普攻**或技能**」—— 火圈燒到人不該回血。判斷重用 combat/damageTypeOverride.ts 的 originInScope（不是第二份 startsWith）。第一個消費者是 symphony-of-war，它跨 5 批。守衛：hookVocabulary.test.ts ②，突變驗證過。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].damageSource=other": {
    status: "landing",
    since: "2026-08-04",
    why: "`ability` 的補集（既不是普攻也不是技能：火圈、守衛塔、小怪）。列舉加寬時一起做，因為「只加正面那一半」的過濾器等於逼下一個作者用 not() 繞路。守衛同上 ②。",
  },
  "field:abilities.effects[]#applyBuff.hooks[].internalCooldownScope": {
    status: "landing",
    since: "2026-08-04",
    why: "批 1 決策點 1-4：末日預言的 perAbilityCooldown 不是第二個冷卻數字，是既有 internalCooldown 的**作用域**。省略 = \"source\" = 這個欄位出現之前每一份文件的行為，所以零採用等於零位移。第一個消費者是 doomsayer（批 2）。守衛：hookVocabulary.test.ts ③，突變驗證過。",
  },
  "field:items.passive[].internalCooldownScope": {
    status: "landing",
    since: "2026-08-04",
    why: "同一個欄位落在共用的 zHookDefBase 上，所以普查在道具與技能 applyBuff 兩個節點各看到一次（同 fromResource 那一格的形狀）。道具這一側今天沒有需求：每一件道具被動的 ICD 都是「這件裝備多久觸發一次」，不分槽位。分兩份 schema 只為了讓其中一邊閉嘴，會讓這條規則變成兩份。",
  },

  "field:items.passive[].abilitySlot": {
    status: "landing",
    since: "2026-07-30",
    why: "Restricts an item hook to one ability slot. No shipped item wants that yet — every item passive today keys off 普攻/受擊/施法 in general, not off Q vs W. New census key from the item-hook split, not a new capability.",
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
  "enum:abilities.effects[]#invulnerable.blocksDamage=none": {
    status: "landing",
    since: "2026-07-30",
    why: "純免控 (07-01 臨、兵、鬥「可抵擋對方負性魔法」) — the one shape that blocks CC while still taking damage; text-only, same follow-up pass.",
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
  "enum:abilities.effects[]#shield.absorbs=all": {
    status: "default-live",
    why: "`all` IS the absent behaviour, and combat/damage.ts `addShield` NORMALISES an explicit \"all\" away rather than storing it — so a doc that writes it produces a byte-identical pool to a doc that omits it. Zero adoption is the designed resting state (every one of the other shipped shields is an all-shield spelled by omission); a non-zero count here would mean somebody wrote the default into a doc for no behaviour change.",
  },
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
    status: "landing",
    since: "2026-07-26",
    why: "task #229's 鑄形工坊 studio authors this block and task #226's `pnpm voxel:gen` consumes it; the field is the seam BETWEEN the two, so it lands with the schema and is populated when the first generated model doc is written (the studio's own save, or #226's five archetype docs). Zero adoption today is correct — no generated model exists yet — and NOT permanent: `packages/shared/src/voxel/doc.test.ts` proves a populated doc validates, so the only thing missing is a saved character. Delete this entry the moment one lands.",
  },

  // "enum:abilities.effects[]#applyBuff.modifiers[].op=capRaise" exemption
  // DELETED 2026-07-28 (#188/#189), exactly as its own text instructed: the
  // owner made the balance call the entry was waiting on, and TWO shipped docs
  // now author the op — `augments/limit-breaker` (稜彩 攻速 ×2 + 解鎖 10.0) and
  // `items/endless-edge` (傳說近戰武器). The mechanism is no longer a mechanism
  // with no content.

  // --- an enum member with a documented decision to stay unused.
  "enum:arenas.groundStyle=wood": {
    status: "default-live",
    why: "apps/client/src/render/groundMaterials.test.ts:25 already pins this: `wood` is in the enum, no shipped arena uses it, and groundTextureSet falls back to stone. Deliberate.",
  },

  // ===================================================================
  // DEBT — real S8s. Each of these is a mechanism that ships and never
  // happens. They print as a banner on every run until someone fixes them.
  // ===================================================================
  // "field:abilities.passive.ranks[].auras" exemption DELETED 2026-07-25: the
  // JASS effect-audit batch converted 66-04 靈壓震撼 (godie-e00t.r, A0IC/A0ID)
  // to a passive slow-aura — the first content aura, so the key is adopted.
  "field:abilities.descriptionRoles": {
    status: "debt",
    why: "task #114 (semantic colour-role markup) is marked COMPLETE and the render path handles it, but the importer has never been re-run, so 0 of 662 abilities carry it and every tooltip falls back to plain text. schema/ability.ts predicted exactly this: 'absent until the importer re-runs'.",
  },
  "field:champions.abilities.*.descriptionRoles": {
    status: "debt",
    why: "the champion-embedded mirror of the above; same missing importer run.",
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
  "enum:abilities.effects[]#applyBuff.hooks[].on=onDamageDealt": {
    status: "debt",
    why: "sim/combat/damage.ts:582 FIRES this hook every time damage is dealt, and no content subscribes to it across all 43 hook-carrying docs (abilities, items, augments, champion passives). Every on-damage-dealt proc in the source map is currently unimported.",
  },
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
  // 30 天後這四條會自己再紅一次 —— 那時該有的是原語,不是更長的理由。
  "field:abilities.effects[]#applyBuff.hooks[].damageType": {
    status: "landing",
    since: "2026-08-05",
    why: "B2 的機制今天上架且有行為守衛;唯一講得出這件事的文案(天堂之劍 godie-i01n)卡在一個不存在的原語「治療觸發這一發的 X%」。見本段上方的完整說明。",
  },
  "field:abilities.effects[]#applyBuff.hooks[].damageCrit": {
    status: "landing",
    since: "2026-08-05",
    why: "同上 —— B2 的另一半。【暴擊時】的第一個消費者是天堂之劍的第二句,而那一句需要的原語還沒有。",
  },
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
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|0.op=!=": {
    status: "landing",
    since: "2026-07-31",
    why: "比較運算子,鑄技工坊 ConditionEditor 的下拉選單成員之一(apps/editor/src/forge/ConditionEditor.tsx)。出貨的條件卡都是門檻式(`<=` / `>`),沒有一張需要相等比較。第一個自然的採用者是「等級剛好 N」或「層數 == 上限」這種整數比較 —— 目前沒有這種卡。若 30 天後仍是 0,誠實的結論是這兩個成員該從 zCondition 拿掉,而不是硬編一張卡去餵它。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|0.op===": {
    status: "landing",
    since: "2026-07-31",
    why: "同上。相等比較在整數軸(level / 層數)才有意義,而條件目前唯一被授權的整數軸是 level,還沒有卡用它。",
  },

  // ── 觸發條件的屬性軸 ───────────────────────────────────────────────────
  // 出貨的兩張條件卡都讀 `hp`。下面十個成員是同一個下拉選單的其他選項。
  // 它們共用一條 why:機制是同一條 `evaluateCondition` 的 `stat` 分支,
  // 已經被 hp 證明會動(sim/content/condition.test.ts 讀真的 world.stats)。
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|1.stat=ad": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的屬性軸。`hp` 已採用並由 condition.test.ts 讀真實 world.stats 驗證,所以走訪路徑是活的;這十個成員差在「有沒有一張卡想讀它」。攻擊力門檻的自然客戶是「攻擊力高於 N 時追加」這一類 —— owner 2026-07-30 明說要的「>=< 某個常數或某個數值條件」正是這個軸,所以它是 landing 不是 debt。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|1.stat=agi": {
    status: "landing",
    since: "2026-07-31",
    why: "同 stat=ad。三圍軸(str/agi/int)在 #248 之後才真的活起來(三圍→AD/攻速/AP),條件讀它是下一步而不是這一步。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|1.stat=ap": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的法強軸。`hp` 已採用並由 condition.test.ts 讀真實 world.stats 驗證,所以走訪路徑是活的;差的是「有沒有一張卡想讀它」。法強門檻的自然客戶是法系的「法強超過 N 時改放強化版」—— w3x 那批「智力達 X」的敘述今天全部靠 perRank 表達,而 perRank 是技能等級不是屬性。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|1.stat=armor": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的防禦軸。同一條 `stat` 分支,已由 hp 證明會動。防禦門檻的自然客戶是穿透類:「對防禦高於 N 的目標改走真實傷害」—— 這正是 owner 2026-07-30 講的「>=< 某個常數或某個數值條件」在坦克向上的讀法,所以是 landing 不是 debt。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|1.stat=attackSpeed": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的攻速軸。同一條 `stat` 分支。自然客戶是攻速流的「攻速達上限後把溢出換成傷害」—— 要等 #286(攻速解鎖上限 10.0)落地才有意義,所以它排在那張票後面。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|1.stat=int": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的智力軸。三圍(str/agi/int)在 #248 之後才真的活起來(三圍→AD/攻速/AP),而條件讀三圍是再下一步:今天所有「智力達 X」的敘述都寫在描述文字裡,沒有一支變成可判定的門檻。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|1.stat=level": {
    status: "landing",
    since: "2026-07-31",
    why: "同 stat=ad,而且是這十個裡最可能先被採用的一個:w3x 有一整批「N 級之後才…」的天生技,它們今天全部靠 perRank 表達,那是升技能等級不是升英雄等級 —— 兩者在這個遊戲裡並不同步。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|1.stat=magicResist": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的魔抗軸。同 armor,兩者在 w3x 的敘述裡幾乎總是成對出現(「防禦或魔抗高於 N」),所以它們會同時被採用或同時留在 0。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|1.stat=moveSpeed": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的移速軸。同一條 `stat` 分支。自然客戶是追擊類的「目標移速低於 N 時追加傷害」(配合減速),w3x 有這個家族但今天都只做了減速那一半。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|1.stat=str": {
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
  "field:abilities.effects[]#applyBuff.hooks[].damageSource": {
    status: "landing",
    since: "2026-08-01",
    why: "同一個欄位的第二個 census 節點(item 那個節點已被 godie-i03m 採用)。這裡指的是「一個**暫時**的 buff 授予的 proc」要不要只吃普攻,自然的第一個客戶是 25-04 無想轉生 / CP-00 棘刺之光 這一族的荊棘 —— 它們今天是 `abilities.passive.ranks[].auras[].hooks`(也還在 landing)而不是 applyBuff。30 天後若仍為 0,該重新分流的是「反彈要不要也做成一個限時 buff」,不是把這一條續期。",
  },
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
  "enum:abilities.effects[]#applyStatus.applyTo=target": {
    status: "default-live",
    why: "sim/effects/applyStatus.ts:20 `e.applyTo === \"self\" ? [ctx.caster] : ctx.targets` —— 缺席就是 target。唯一被寫出來的是 \"self\"(暴走把 berserk 貼在自己身上、moon-combo 的連段視窗),而那是因為它跟預設相反。target 永遠會是 0,除非有人為了可讀性刻意寫滿。",
  },
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
  "enum:abilities.effects[]#damage.amount.attrRatios[].basis=base": {
    status: "default-live",
    why: "缺席 = \"total\"(`sim/effects/effect.ts` 的 `resolveScaling`:`attrs(r.attr, r.basis ?? \"total\")`),對應 Blizzard 的 `GetHeroStatBJ(…, true)` = 含裝備。兩份寫了 `attrRatios` 的出貨文件(龍神槍 godie-i018 的 on-hit 閃電、GH#250 的 01-04 超究武神霸斬 終結段)在 JASS 裡讀的都是 `true`,所以兩份都明寫 \"total\"。\"base\" 對應 `GetHeroStatBJ(…, false)`,原作**確實用過**(蒼月潮 07-00 獸化心靈 的 120 敏上限),只是那一支走的是 `grantAttribute.maxAttributeBasis` 而不是 `attrRatios`。所以這一格的零是「沒有一支用 attrRatios 的技能需要不含裝備的讀法」,不是機制沒接上。",
  },
  "enum:abilities.effects[]#damage.amount.attrRatios[].attr=agi": {
    status: "debt",
    why: "**移植覆蓋率的缺口,不是壞掉的程式**。`resolveScaling` 對 agi 與對 str 走同一行,所以寫上去就會生效;零的原因是目前只有兩支技能用 `attrRatios`,而它們的 JASS 都讀 `bj_HEROSTAT_STR`(龍神槍 godie-i018「傷害 = 總力量」、01-04 超究武神霸斬「+STR×等級」)。原作裡確實有讀 AGI 的招式(例如 蒼月潮 07-00 的敏捷門檻),只是還沒有一支被改寫成「傷害隨敏捷成長」。記成 debt 而不是 default-live,是因為零在這裡**不是**因為有一個更好的預設值 —— 它單純代表「還沒移植到」,而那是一件要做的事。",
  },
  "enum:abilities.effects[]#damage.amount.attrRatios[].attr=int": {
    status: "debt",
    why: "同 `attr=agi`:程式路徑共用、寫上去就生效,零的原因是兩支用 `attrRatios` 的技能在 JASS 裡讀的都是力量。智力在 GGD 走的是 `ratios[{stat:\"ap\"}]`(combat-env `intToAbilityPower` 把智力折進 AP),所以「智力係數」今天有兩種寫法而只有一種被用;哪一種才是對的要看被移植那一支的 JASS 讀的是 `bj_HEROSTAT_INT` 還是法術傷害欄位 —— 在有第一支這樣的技能之前不要替它決定。",
  },
  "field:abilities.effects[]#dot.tickOnApply": {
    status: "default-live",
    why: "缺席 = false = 「等一個 interval 才第一次結算」(`dot.ts` 的 `firstTick`)。寫 true 是**多加**一次結算,而四份出貨 DoT 的數字都是照『總量 ÷ 次數』寫的:血染八月「88流血傷害,持續3秒」= 29.33×3、妖物碎殺牙「255傷害,持續3秒」= 85×3、揍敵客 R「持續 2 秒、每 0.2 秒」= 10 跳。任何一支打開它,玩家吃到的總量就會比 owner 文案上的數字多一跳。所以這一格空著不只是預設,是**文案正確性的條件**。",
  },
  "field:abilities.effects[]#knockback.applyTo": {
    status: "default-live",
    why: "缺席就是「每個被打到的人」。寫出來只有一個用途:`self`,也就是後座力(自己被自己的招震退)。四支出貨的擊退全部是正常的推人,所以這一格空著才是對的。",
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
  "field:abilities.effects[]#knockback.subtractGap": {
    status: "default-live",
    why: "缺席 = true,也就是 GH#193 的「站越遠推越少」。這是全遊戲共用的擊退規則,owner 定它是為了讓擊退是近戰的工具而不是遠程的放風箏工具;寫 false 等於為某一支破例。四支出貨的擊退都遵守它 —— 描述裡的「6.0 單位 −(你們的距離)」就是這條。",
  },
  "field:abilities.effects[]#knockback.uncontrollable": {
    status: "default-live",
    why: "缺席 = true(擊退期間進 world.knockdown,不能下指令)。寫 false 是「推開但保留控制權」,四支出貨的擊退都不要那個 —— 牙突的價值有一半在那段躺平時間。",
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
  "enum:abilities.effects[]#knockback.from=pull": {
    status: "landing",
    since: "2026-07-31",
    why: "把人拉過來而不是推開。出貨的四支擊退都是推(caster / facing)。w3x 有明確的客戶:52-00 那一類鉤索與 13-002 之外的抓取投擲(godie-hapm.w 是全遊戲唯一的抓取投擲,它今天走 leap 不走 knockback)。把它改寫成 pull 是一次內容決策,不是機制缺口。",
  },
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
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|0.op=>": {
    status: "debt",
    why:
      "條件比較子 `>` 在 2026-08-02 之前唯一的內容使用者是 52-00 十二道試煉的" +
      "`onInterval` hook(「只在生命高於最大生命的 1% 時才流失」)。owner 的更正把那條流失" +
      "搬去 `healthDrainPctOfMax` + `config.regen@1` 的地板 —— 因為 hook 的 `condition` 是" +
      "**發不發射**的前提而不是一條夾值(把流失調到比門檻大就會穿過去把人打死)," +
      "而且 hook 走傷害管線會被 `combatEnv.damageDealt` 乘過,「1%」就不是 1%。" +
      "所以 `>` 掉到 0 是那次搬家的直接後果,不是有人忘了寫。" +
      "比較子本身還在編輯器的條件選單上、`effects/hooks.ts` 也照樣解析它;" +
      "第一支需要「數值高於門檻才觸發」的卡出現時,這條豁免就該被刪掉。",
  },
};

let census: Census;
let store: ContentStore;

beforeAll(async () => {
  const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
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
            `     "superseded" (dead field kept for compat), or "debt" (it IS broken,`,
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
    // Anchored on the zStat SITE plus membership in ALL_STATS, so it survives
    // the next rename: the `.op=` rows under the same prefix are excluded by
    // the membership test (flat/pctAdd/… are not Stats), and the narrower stat
    // enums on the CONDITION path (`condition|0|1|1.stat`, a 10-member subset)
    // are excluded by the prefix.
    const MODIFIER_STAT_SITE = "enum:abilities.effects[]#applyBuff.modifiers[].";
    const isStat = new Set<string>(ALL_STATS);
    const statRows = census.rows.filter(
      (r) => r.key.startsWith(MODIFIER_STAT_SITE) && isStat.has(r.key.split("=").pop() ?? ""),
    );
    expect(statRows.map((r) => r.key.split("=").pop()).sort()).toEqual(
      [...ALL_STATS].sort(),
    );
    // `evasion` is the canary: it was the audit's headline zero, and it landed
    // in content while this file was being written. The row must EXIST; this
    // test deliberately does not assert what its count is.
    expect(statRows.some((r) => r.key.endsWith("=evasion"))).toBe(true);
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
