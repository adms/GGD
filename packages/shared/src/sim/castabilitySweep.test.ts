/**
 * Task #128 — IN-GAME CASTABILITY COVERAGE SWEEP (diagnostic).
 *
 * The question this answers is NOT "is the ability doc shaped correctly" (that
 * is #78's nativeFidelity suite) nor "does it have a VFX" (#79). It is the
 * blunt one the user actually asked: for EVERY pickable champion, does pressing
 * Q / W / E / R / EX — and swinging the basic attack — actually DO something in
 * the real SimWorld, or is the button a dead no-op?
 *
 * WHAT IT DOES. For each of the 51 whitelisted champions it spins up a fresh
 * deterministic SimWorld with a dummy enemy (and a dummy ally, for the
 * heal/shield/buff spells that only accept friendlies) placed adjacent, then for
 * each slot:
 *   1. ranks the ability through the real rank-up / EX-unlock path,
 *   2. resolves a target appropriate to its castType (targeted → the adjacent
 *      enemy; ground → a point on the enemy; skillshot/dash → aimed at the
 *      enemy; self → self; ally spells → the adjacent ally),
 *   3. issues the cast through the real castAbility(),
 *   4. steps the sim far enough for any cast-time wind-up to resolve, and
 *   5. checks that SOMETHING measurable happened — a damage packet, a heal /
 *      mana restore, a shield, a status, a buff source, a spawned projectile, a
 *      dash, or a VFX — with no exception thrown.
 *
 * A slot that throws, is rejected, or is accepted-but-produces-nothing = FAIL.
 * A permanent WC3 passive (native Cool=0, no castable effects) is not a bug: it
 * is reported as PASSIVE and we verify its ModifierSource actually attaches.
 * ⭐ A slot that is accepted and produces ONLY a `spawnVfx` is its own verdict,
 * VFX_ONLY — neither PASS (it changes no number) nor FAIL (it is castable and
 * visible; what it needs is content, not wiring). See `castabilityVerdict.ts`.
 *
 * WHERE THE ROSTER COMES FROM. From TRACKED source: `starterChampions` in
 * apps/platform/internal/curation/starter.go, the hand-picked 51 a fresh
 * install seeds into the whitelist (see testkit/starterRoster.ts). It used to
 * read `data/curation/whitelist.json` — live operator state, `.gitignore`d —
 * which existed only on the owner's machine, so in every fresh clone, worktree
 * and CI run this suite died of ENOENT inside `beforeAll` and reported "1
 * skipped": it had never once verified a castability assertion off that
 * machine. The operator whitelist is still honoured where it exists, but only
 * ADDITIVELY: champions it enables beyond the tracked 51 are swept too and
 * flagged in the report, and they are excluded from the pinned counts so the
 * gates below mean the same thing everywhere.
 *
 * OUTPUT. The pass/fail matrix + summary + failure list is written to
 * docs/_castability-128.md every run, so the ability-fidelity / VFX owners have
 * a live diagnostic they can re-generate.
 *
 * WHAT GOES RED. This is a MEASUREMENT harness and it fixes nothing, but a
 * diagnostic that can never fail is the same dead weight as one that never
 * runs, so four gates hold over the tracked roster (the fourth, KNOWN_GAPS, is
 * the strict one — it pins every ❌/🟡 cell by name AND by kind):
 *   1. the sweep runs end-to-end — all tracked champions, 7 cells each;
 *   2. EVERY champion spawns (a champion that cannot enter a SimWorld is not a
 *      content no-op, it is broken content or a broken loader);
 *   3. a RATCHET on working cells (✅ PASS + 🟣 verified PASSIVE) — the floor is
 *      today's measurement (299 of 300), so a regression that kills a slot goes
 *      red while the one known no-op stays in the report as a finding rather
 *      than as a failure. Raise the floor when the number improves; never lower
 *      it to make a red run green.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { readStarterRoster, STARTER_GO_REL } from "../../testkit/starterRoster";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import {
  Arenas,
  Configs,
  Models,
  StatusEffects,
  VfxDefs,
  registerAll,
} from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { isTransformedBody } from "../content/championForms";
import { isRetiredChampionId } from "../content/championRetirement";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { castAbility, rankUpAbility, learnEx } from "./abilities/abilitySystem";
import { isPassiveOnly, isPassiveInnate, abilityPassiveSourceId } from "./abilities/abilityPassives";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import type { AbilityDef, CastType } from "./content/defs";
import { INNATE_SLOT, type CastTarget, type CastableSlot, type CoreAbilitySlot } from "./intents";
import { leapTicks } from "./movement/leap";
import { TICK_HZ } from "../constants";
import type { EffectDef } from "./effects/effect";
import { runEffects } from "./effects/effectRunner";
import {
  classifyCastOutcome,
  passiveFormGate,
  snapshotChannels,
  stochasticNodeKinds,
} from "./castabilityVerdict";
import { applyChampionForm, championFormIndex } from "./systems/ChampionFormSystem";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../.."); // packages/shared/src/sim -> repo root
const CONTENT_DIR = join(ROOT, "content");
/** DEV-ONLY operator state (gitignored). Additive; never required — see below. */
const WHITELIST = join(ROOT, "data/curation/whitelist.json");
const REPORT = join(ROOT, "docs/_castability-128.md");

/** The tracked roster is pinned at 51 by Go's TestFirstOpenRoster (GH#29 added 喪標麥可). */
// ⭐ 名單長度**從 starter.go 推導**（`starterRosterSize`），⛔ 不再抄一份數字。
//    2026-08-16 owner 下架四位（53→49）時，這個數字的四份副本讓四條測試
//    同時紅，而每一條都在講自己的功能壞了 —— 沒有一條說出「名單變短了」。
const ROSTER_SIZE = readStarterRoster(ROOT).length;
/**
 * RATCHET FLOOR — working cells (✅ PASS + 🟣 verified PASSIVE) over the 51
 * tracked champions × 6 slots = 300.
 *
 * HISTORY (the floor only ever goes UP):
 *   - 2026-07-24, 48 champions: measured 287/288 (280 PASS + 7 PASSIVE) → 287.
 *   - 2026-07-26, task #212 opened godie-efur and godie-hblm: re-measured at
 *     299/300 (291 PASS + 8 PASSIVE). All 12 new cells fire, so the floor is
 *     RATCHETED by exactly the 12 newly-measured working cells, 287 → 299. The
 *     number was read off a real run, not predicted.
 *   - 2026-07-26, task #247 (leap): re-measured at 300/300 (292 PASS + 8
 *     PASSIVE, 0 FAIL). The last gap was godie-u00n R — "a ground cast accepted
 *     with no measurable effect". It was never a content bug: at castTimeSec
 *     0.9 the ability resolves on tick 27, ONE tick after the 26-tick window
 *     closed (the KNOWN HARNESS ARTEFACT above). #247 rebound it to a real
 *     leap, and `leapWindow` extends the observation by exactly the authored
 *     flight time — so the harness now watches long enough to SEE the landing
 *     damage, and the cell measures green for the right reason. Floor ratcheted
 *     299 → 300, read off a real run.
 *
 * Do NOT lower this to green a red run: a drop means a slot that used to fire
 * no longer does.
 */
/**
 * ⭐ 2026-08-16 —— 棘輪從**絕對格數**改成**比例**。
 *
 * ⚠️ 這不是「把測試調鬆」，是修一個**單位錯誤**：owner 下架四位英雄之後
 * 名單從 53 變 49，格數從 53×6=318 變成 49×6=294 —— 而門檻 312 是個**絕對數**，
 * 於是「一格都沒壞」的那一次跑出 288，數學上必然低於 312。
 * 訊息會說「有 slot 退步了」，而真相是**分母變小了**。
 *
 * 實測比較（同一份內容，只差名單長度）：
 *   53 人：312 / 318 = 98.11%
 *   49 人：288 / 294 = 97.96%
 * ⇒ 覆蓋率**沒有退步**，退的只有絕對值。
 *
 * ⛔ 比例仍然只能往上調，不可以為了讓紅的變綠而降低 —— 那條規則沒有變，
 * 變的是它現在釘的是「這批英雄有幾成的格子會動」，而那才是名單長度變動時
 * 唯一還講得通的不變量。
 */
/**
 * ⭐ 2026-08-18（GH#374）—— 97.95% → **97.66%**，而這一次的下修**不是**放寬。
 *
 * 同一次改了量測儀器本身三處，所以舊的比例已經不是同一個量：
 *   ① **多了一欄**：天生技（owner 點名的六格之一）從來沒有被量過（洞①）。
 *      分母從 49×6 變成 49×7 扣掉「原作就沒有這一格」的 `NONE`。
 *   ② **`vfxSpawn` 不再算 ✅**（洞②）。舊的 97.95% 裡有**假的 PASS**：
 *      `godie-e00s` R 整棵樹只有特效，場上一個數字都不會變，而它以前是綠的。
 *      ⇒ 下修的那一段**正是儀器停止說謊**的那一段，⛔ 不是內容退步。
 *   ③ 新增 `NONE`（這位英雄沒有這一格）不進分子也不進分母。
 *
 * ⚠️ 為了讓「下修」不能被拿來藏東西，這一版同時加了一道**比它更嚴**的閘：
 * {@link KNOWN_GAPS} 是逐格釘死的名單，**多一格或少一格都紅**。
 * 比例棘輪從此是第二道防線，⛔ 兩道都不可以為了讓紅的變綠而放寬。
 */
/**
 * ⭐ 2026-08-19（GH#374 收尾）—— **地板保持 0.9766，而分子的定義又收緊了一次**。
 *
 * 這一輪把「只有 `spawnVfx`」從 ❌ 再拆出來成 `VFX_ONLY`（它以前被併進 FAIL，
 * 而在 GH#374 之前更是直接算 ✅）。⭐ 拆出來的那一格**留在分母、不進分子** ——
 * 也就是說這個比例的意思沒有變：**「按下去真的有東西動」的格數佔比**。
 *
 * ⚠️ 所以這一次量到的比例與上一輪相同（拆的是同一批不算數的格子的**標籤**，
 * 不是它們的**歸屬**）。⛔ 不要因為「數字沒動」就以為這一次沒事發生：
 * 真正變嚴的是 {@link KNOWN_GAPS} —— 它現在連**每一格是哪一種缺口**都釘死，
 * 於是「把一格真 no-op 改成噴個特效」不再能靜悄悄地換一個標籤過關。
 */
/**
 * ⭐ 2026-08-19（GH#374/#375/#385）—— **97.66% → 99.41%，量出來的**（340 / 342）。
 *
 * 這一次是純粹的**棘輪上調**：六格從 ❌🟡 變 ✅，而六格都不是內容改動 ——
 * 是量測儀器補上了它一直沒有的三件事（見 {@link KNOWN_GAPS} 的表）。
 * ⛔ 仍然只能往上，不可以為了讓紅的變綠而降低。
 */
const WORKING_CELL_RATIO_FLOOR = 1.0;

/**
 * ⭐ 首發名單上**今天量到的每一格缺口**（❌ 與 🟡），一格一列（GH#374）。
 *
 * ⛔ 這不是「這樣沒關係」的清單，是一張帳：修好一格就把那一列刪掉。
 * **三個方向都會紅** —— 冒出名單外的新缺口會紅（有人把一格改壞了）、
 * 名單上的某一格不再是缺口也會紅（修好了就要劃掉）、
 * ⭐ **同一格換了種類**也會紅（❌↔🟡：把一格空技能加上特效不是修好它）。
 * 這正是 `content/abilityNoOpEffects.test.ts` 那張 KNOWN 名單的形狀，
 * 而它比一個比例底線嚴格得多：比例可以被「一邊修好一格、一邊弄壞一格」騙過去。
 *
 * ⚠️ 只釘**版控名單**那 49 人 —— 營運白名單與骨架英雄是機器狀態／示範資料，
 * 釘它們會讓這條閘在別人的 clone 上意義不同。
 */
/**
 * ⭐ 2026-08-19（GH#374/#375/#385，owner「快修」）—— **六列一次劃掉，而六列都不是
 * 內容缺陷**。
 *
 * 逐格真的跑過（⛔ 不是推論）之後，這六格的共同點是：技能**本來就會動**，
 * 是量測儀器在該看的地方沒有看。三個機制各自解掉一批：
 *
 * | 原本 | 真相（實測） | 修在哪 |
 * |---|---|---|
 * | `godie-emns\|EX` ❌ | 交換筆記本**真的**把 572.5↔676.0 換掉了，但 `swapResource` 刻意繞開傷害／治療佇列 ⇒ 一個事件都沒發 | `swapResource` 發 `resourceSwap`，收進 `EFFECT_EVENTS` |
 * | `godie-emns\|E`、`godie-emns\|R` ❌ | 兩支都掛「目標身上有【詛咒】」的條件葉（44-01 的連招收尾），而普查的假人從來沒被標記過 | {@link satisfyDeclaredPreconditions} |
 * | `godie-e00r\|Q` ❌ | `devour` 是處決線（血高於門檻整段跳過），而普查把假人設在 50% 血 | 同上 |
 * | `godie-efur\|R`、`godie-e00s\|R` ❌🟡 | `randomArea` 的落點是隨機的，假人被釘在原地 ⇒ verdict 是**擲骰**（實測 24 顆 seed：12/24 與 16/24） | {@link nextScatterPoint} |
 *
 * ⚠️ `godie-e00s|R` 那一列原本寫「整棵樹只有 spawnVfx」——**那句話是假的**
 * （第三守則）：它的樹裡有**兩發 `damageArea`**，只是那一顆 seed 的四顆落點
 * 都沒有落在假人身上。
 */
const KNOWN_GAPS: readonly { key: string; verdict: "FAIL" | "VFX_ONLY"; why: string }[] = [
];

/**
 * ⭐ 首發名單上**因為形態閘而沒有被量到**的每一格（🔵），一格一列（2026-08-19）。
 *
 * ⛔ 它與 {@link KNOWN_GAPS} 是**兩本帳**，而且必須分開：那一本記的是「缺陷」，
 * 這一本記的是「儀器沒看的那一半」。合在一起的話，把一支空技能加上
 * `whileForm` 就能讓它從缺陷名單上消失 —— 而那不是修好它。
 *
 * 這一本同樣**三個方向都會紅**：冒出名單外的新 🔵（有人替一格加了形態閘）、
 * 名單上的某一格不再是 🔵（普查終於量得到它了，就把這一列刪掉）。
 */
/**
 * ⭐ 2026-08-20（GH#412）—— 這一本帳**清空了**，而且它現在幾乎不可能再有一列。
 *
 * 🔵 從此只剩下**唯一**一種成因：一份 rank 區塊寫著 `whileForm:"alternate"`，
 * 而這位英雄**根本沒有替身身體**（`transform.counterpartId` 缺失／指向未註冊的
 * doc）—— 那時普查連換都換不過去，說它「量過了」就是說謊。
 * ⛔ 「有替身但被動沒掛上」不再是 🔵，那是 ❌：普查現在真的走
 * `ChampionFormSystem.applyChampionForm` 換到替身身體再量一次（見 {@link testSlot}）。
 */
const FORM_GATED_CELLS: readonly { key: string; why: string }[] = [];

/**
 * ⭐ 2026-08-20（GH#407）—— **判定會隨 seed 改變**的格子，一格一列。
 *
 * ⛔ 這一本帳與 {@link KNOWN_GAPS} 又是分開的，理由和形態閘那一本一樣：
 * 那一本記「缺陷」，這一本記「**這一格的判定是擲骰，不是量測**」。合在一起的話，
 * 一支「55% 什麼都不發生」的技能會依這一次的 seed 隨機落進 ✅ 或 ❌ 兩本帳，
 * 而兩本都會說一個確定的謊。
 *
 * 判準住在 `castabilityVerdict.ts::stochasticNodeKinds`（`weightedBranch` /
 * `chance` 條件葉 / `randomArea`），普查對這些格子跨 {@link STOCHASTIC_SEEDS}
 * 顆 seed 各量一次；**全部一致才算量到**，只要有一顆不同就落進這一本。
 * 同樣三個方向都會紅。
 */
const SEED_DEPENDENT_CELLS: readonly { key: string; why: string }[] = [];
// 2026-08-13：300 → 312，量出來的（`docs/_castability-128.md` 首發 53 人 312/318）。
// ⚠️ 這一次的棘輪**不是**內容變好，是 {@link castWindow} 讓觀察者看得夠久 ——
//    同一天 owner 把吟唱改成 0.06~4.00 秒，141 支技能吃到 ≥1 秒的前搖，
//    而窗口還停在 26 tick（0.867 秒）⇒ 120 格假 FAIL（342→228）。
//    修好之後 **343 PASS / 6 FAIL**，比改吟唱前的 342 還多一格。

const NO_INTENTS = new Map();
const Z0 = SKELETON_ARENA.zones[0]!;
/** North of the zone centre — clear of the three SKELETON_ARENA pillars. */
const P = { x: Z0.center.x, z: Z0.center.z + 14 };
/** Adjacent spacing: bodies are r=0.6, so 1.35 keeps a 0.15u surface gap. */
const ADJ = 1.35;
/** A robust melee bruiser used as the enemy / ally punching bag. */
const DUMMY = "godie-hart" as ChampionId;
/**
 * Ticks stepped after each cast so a wind-up can resolve.
 *
 * ⚠️ 這是**基礎**窗口（動作解析、投射物飛行、狀態落地）。吟唱的那一段
 * **不在這裡**，它由 {@link castWindow} 逐支加上去 —— 理由見那一支。
 *
 * ── 歷史：這個常數曾經自己吞掉吟唱，而那讓它在 2026-08-13 整批說謊 ──────────
 * 舊註解寫「作者填的最長吟唱是 0.6 秒 = 18 tick，26 夠用」，然後 `godie-u00n.r`
 * 的 0.9 秒把它戳破一次（解析在 tick 27，窗口的**下一格**）。當時的結論是
 * 「記下來，不要偷偷改」——⛔ 但記下來的是**現象**，沒有人把它變成閘。
 *
 * 2026-08-13 owner 把吟唱規則改成「所有技能 0.06~4.00 秒」（`config.cast-time@1`），
 * 於是 **141 支**技能的 castTimeSec ≥ 1.0 秒（前一天是 **0** 支）。一個寫死 26 的
 * 觀察窗立刻讓 **120 格**回報「cast accepted but produced no measurable effect」——
 * 技能全部是好的，**是觀察者在該看的時候閉眼**。
 * 這正是 CLAUDE.md 的元規則：判準（「下次記得看一下」）擋不住，只有閘擋得住。
 */
const WINDOW = 26;
/**
 * ⭐ 吟唱多久，就多看多久 —— 和 {@link leapWindow} **完全同一條原理**：
 * 「效果被一段作者填的時間延後」時，觀察窗要涵蓋那一段，否則量到的是窗口長度，
 * 不是技能。
 *
 * ⛔ 這**不是**放寬判定：一格仍然要在窗口內產生**可量測的效果**才算 PASS，
 *    只是窗口不再假設吟唱是 0。⛔ 也不可以改成「把地板調低來變綠」——
 *    地板往下 = 一格本來會動的技能不動了也沒人叫。
 */
function castWindow(castTimeSec: number | undefined): number {
  if (typeof castTimeSec !== "number" || !Number.isFinite(castTimeSec) || castTimeSec <= 0) {
    return 0;
  }
  // `abilitySystem.ts` 用 `round(sec × TICK_HZ)` 決定解析 tick，這裡 +1 是為了
  // 看到解析**那一格**之後的結算（傷害事件在同一 tick 發，但狀態/投射物要下一格）。
  return Math.round(castTimeSec * TICK_HZ) + 1;
}
/**
 * TASK #247 — an ability whose effects are DEFERRED BEHIND A FLIGHT TIME needs a
 * window that covers the flight, or the harness stops watching before the thing
 * it is measuring happens. `leapWindow` adds exactly the authored tick budget of
 * the longest leap in the ability's effect tree, and NOTHING else: an ability
 * with no `leap` effect gets the same WINDOW it always had, so this cannot move
 * any pre-#247 measurement. (The self-leaps would pass anyway — `moved` sees the
 * nav override — but that would only prove the caster left the ground, never
 * that the LANDING DAMAGE lands. Watching the whole arc measures the real thing.)
 */
function leapWindow(effects: readonly EffectDef[]): number {
  let extra = 0;
  for (const e of effects) {
    if (e.kind === "leap") {
      extra = Math.max(extra, leapTicks(e.durationSec) + 1);
    } else if (e.kind === "spawnProjectile") {
      extra = Math.max(extra, leapWindow(e.onHit));
    }
  }
  return extra;
}
/** Ticks allowed for the FIRST basic-attack swing to land. */
const BASIC_WINDOW = 40;

/**
 * ⭐ 2026-08-18（GH#374）—— **天生技那一格補上去了**。
 *
 * owner 2026-08-18 點名的是**六格**：「天生技/Q/W/E/R/EX」。這份 sweep 從第一天
 * 掃的六格卻是 Q/W/E/R/EX + **普攻** —— 也就是說 78 位英雄各自都有的那一格
 * **從來沒有被量過**。GH#373 就是從這個洞漏出去的：5 支 `innateKind:"active"`
 * 的天生技（真的按得下去、真的付冷卻）整棵效果樹只有一個 `spawnVfx`，
 * 而這裡每一次跑都說一切正常。
 *
 * ⛔ 它**不是** `AbilitySlot`（那是「可以加點的字母表」，見 `sim/intents.ts`）：
 * 天生技從等級 1 就是 rank 1、永遠不能加點，但**可以施放**。所以這一列走
 * `CastableSlot`，與 `castAbility()` 收的型別是同一個。
 */
const SLOTS: CastableSlot[] = ["Q", "W", "E", "R", "EX", INNATE_SLOT];
type SlotName = "Q" | "W" | "E" | "R" | "EX" | "PASSIVE" | "basic";
/** 報表與閘一起走訪的那七欄（六個技能格 + 普攻），一份，⛔ 不要各自手打。 */
const COLS: SlotName[] = ["Q", "W", "E", "R", "EX", "PASSIVE", "basic"];

/**
 * ⭐ `NONE` 是 2026-08-18（GH#374）加的第四種，⛔ 它不是「放寬」。
 *
 * 天生技那一格補上去之後，**「這位英雄沒有這一格」**第一次變成一個會發生的
 * 情況：`innateActive.ts` 自己記著有 3 位英雄「genuinely have none」，而骨架示範
 * 英雄（sela / thorne）連 EX 都沒有。把它算成 ❌ 等於要求內容去補一個
 * **原作就不存在**的技能 —— 那不是缺陷，是事實。
 * ⛔ 它與 FAIL 的界線是硬的：`NONE` **只**在登錄表回不出 ability id 時成立，
 * 一支存在但什麼都不做的技能永遠是 FAIL。
 */
/**
 * ⭐ `VFX_ONLY` 是 GH#374 加的第五種，⛔ 它**不是**「放寬」也**不是**新的 FAIL。
 *
 * 一支技能放得出去、冷卻真的付了、玩家畫面上真的看得到東西 —— 而血量／位置／
 * 狀態一個都沒動。這是一個**真實存在的狀態**，值得被單獨數出來：
 *   · 併進 ✅ 是說謊 —— GH#373 那 5 支主動天生技就是這樣在全綠底下上架的；
 *   · 併進 ❌ 則把「按不下去／丟例外」跟「按得下去但是空的」混成同一個數字，
 *     而那兩件事要修的地方完全不同（前者是接線，後者是內容）。
 * 判定本身住在 `castabilityVerdict.ts`，⛔ 不在這個檔。
 */
/**
 * ⭐ `FORM_GATED` 是 2026-08-19 加的第六種，⛔ 它**不是**放寬，也**不是**新的 ❌。
 *
 * 一支被動的 rank 區塊寫著 `whileForm:"alternate"` —— 它只在**變身後**掛上來源，
 * 而普查永遠在**本體形態**開世界（`spawnChampion` 從來不變身）。所以量不到它
 * 是**儀器的範圍**，⛔ 不是內容的缺陷：79-002 虛化的格擋在卍解狀態下真的會生效。
 *
 * ⛔ 併進 ❌ 是把「內容壞掉」跟「這一格要換形態才看得到」混成同一個數字，
 * 而那一格會佔著一列缺陷帳單、卻沒有任何人修得動它（#128 從第一天就是這樣）。
 * ⛔ 併進 ✅ 也不行 —— 普查**沒有驗證過**它在另一個身體裡真的會動，
 * 說它是綠的就是說謊。⇒ 它自己一格，而且與 `NONE` 一樣**不進分子也不進分母**：
 * 這是「本次未量測」那一格，不是「量測結果」。
 * ⚠️ 為了不讓這一格變成傾倒場，{@link FORM_GATED_CELLS} 逐格釘死它（三個方向都紅）。
 */
type Verdict = "PASS" | "FAIL" | "VFX_ONLY" | "FORM_GATED" | "PASSIVE" | "NONE";
interface Cell {
  verdict: Verdict;
  channel?: string; // what fired (for PASS/PASSIVE); absent on FAIL
  castType?: CastType;
  reason?: string; // why it failed / extra note
  /** GH#407 —— 這一格的效果樹裡有哪幾種「換 seed 就走不同路」的節點。 */
  stochastic?: readonly string[];
  /** GH#407 —— 跨 seed 量到的分佈（只有跨過 seed 的格子才有）。 */
  seedTally?: string;
  /** GH#407 —— 判定隨 seed 改變（＝這一格今天是擲骰，不是量測）。 */
  seedDependent?: boolean;
}

/**
 * ⭐ GH#407 —— 帶隨機節點的格子要跨幾顆 seed 量。
 *
 * 24 是**沿用 GH#374 收尾那一次的樣本數**，所以這一批量到的分佈與那一次
 * （13-04 中 12/24、70-04 中 16/24）可以直接對照，⛔ 不是隨手挑的數字。
 * 成本量過：整份普查 448 格跑完 ~0.5 秒，帶隨機節點的只有個位數格，
 * ⇒ ×24 之後仍在同一個數量級。
 */
const STOCHASTIC_SEEDS = 24;
interface ChampResult {
  id: string;
  name: string;
  attackType: "melee" | "ranged";
  spawnOk: boolean;
  spawnError?: string;
  cells: Record<SlotName, Cell>;
  /** observed basic-attack shape: did it launch a projectile? */
  basicProjectile?: boolean;
  basicRangedFlag?: boolean;
}

const results: ChampResult[] = [];
/** Tracked 49; everything swept on top of it; where each came from. */
let tracked: string[] = [];
let extras: string[] = [];
/** 版控內、非變身態、非下架，但不在首發名單上的那些（GH#374 的 16 位）。 */
let contentExtras: string[] = [];
let rosterSource = "";

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const res = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(res.store);
});

/**
 * Read the DEV-ONLY operator whitelist, or null when it is absent (every fresh
 * clone, worktree and CI run). Absence is NORMAL and never fails the sweep —
 * but a whitelist that exists and is unreadable/malformed is an operator-state
 * bug worth surfacing, so that throws rather than being swallowed as "absent".
 */
function readOperatorWhitelist(): string[] | null {
  let raw: string;
  try {
    raw = readFileSync(WHITELIST, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const champions = (JSON.parse(raw) as { champions?: unknown }).champions;
  if (!Array.isArray(champions)) {
    throw new Error(`data/curation/whitelist.json has no \`champions\` array — operator state is corrupt`);
  }
  return champions as string[];
}

/**
 * The roster to sweep: the tracked 48, plus anything the operator has enabled
 * beyond them. Throws with an explanation if the tracked source cannot be read
 * — called from inside the test, so that surfaces as a red assertion instead of
 * a collection-time crash that vitest reports as a SKIP.
 */
function resolveRoster(): string[] {
  tracked = readStarterRoster(ROOT);
  const operator = readOperatorWhitelist();
  const operatorExtras = operator ? operator.filter((id) => !tracked.includes(id)) : [];
  // ⭐ 2026-08-18（GH#374 的第三個洞）—— **版控裡的其餘英雄也要掃**。
  //
  // 在這一段之前名單只有「starter.go ＋ 本機營運白名單」，於是 `content/champions/`
  // 裡剩下的 29 份文件的每一格**從來沒有被量過一次**。
  //
  // ⚠️ 2026-08-18 量到的訂正（第三守則）：GH#374 說那 29 份裡「12 位是真的英雄」，
  // **那句話是錯的**。逐一分類的結果是 7 位已下架 + **20 位是變身態的身體**
  // （`isTransformedBody`，玩家永遠選不到，伺服器側 `transformedBodyGate` 也擋）
  // + **只有 2 位**（`sela` / `thorne` 骨架示範英雄）是真的沒被量過的可選英雄。
  // 特別是 issue 點名的 `godie-o030`（臭作）**是變身態**，本體是 `godie-orkn`
  // —— 那正是 GH#373 為什麼會列出兩支一模一樣的 30-00 攝影機。
  //
  // ⭐ 名單**推導**，⛔ 不抄一份 id 清單（那是第四個住處，一定會過期）：
  // 登錄表裡的每一位，減掉「變身態的身體」（`isTransformedBody`，玩家選不到）
  // 與「已下架」（`config.roster@1.retiredChampions`）。兩個排除條件都是**內容
  // 事實**、都在 git 裡，所以任何 clone／CI 掃到的是同一份。
  contentExtras = [...Champions.ids()]
    .map(String)
    .filter(
      (id) =>
        !tracked.includes(id) &&
        !operatorExtras.includes(id) &&
        !isTransformedBody(id) &&
        !isRetiredChampionId(id),
    )
    .sort();
  extras = [...operatorExtras, ...contentExtras];
  rosterSource =
    `${STARTER_GO_REL}（${tracked.length}）＋ 版控內其餘可選英雄（${contentExtras.length}，扣掉變身態與已下架）` +
    (operator
      ? `＋ data/curation/whitelist.json 額外啟用（${operatorExtras.length}）`
      : "　— 本機無 data/curation/whitelist.json（正常：該檔為 gitignore 的營運狀態）");
  return [...tracked, ...extras];
}

// --------------------------------------------------------------------- helpers

let seatCounter = 0;
function spawn(world: SimWorld, championId: string, team: number, dx: number): EntityId {
  return spawnChampion(world, {
    championId: championId as ChampionId,
    seatId: asSeatId(seatCounter++),
    teamId: asTeamId(team),
    pos: { x: P.x + dx, z: P.z },
    zone: 0,
  });
}

/**
 * ⭐ 2026-08-18（GH#374 洞②）—— **量測儀器本身搬到 `castabilityVerdict.ts`**。
 *
 * 「哪些頻道算真的有效果」「`vfxSpawn` 算不算」以前整段住在這支測試檔的區域函式
 * 裡，於是那個決定**沒有辦法被夾具驗**：想證明「一支只有特效的假技能不會被算成
 * ✅」，唯一的路是掃這個檔的原始碼字串（七種失敗形態⑥）。
 * ⇒ `snapshotChannels()` / `EFFECT_EVENTS` / `classifyCastOutcome()` 現在是模組，
 * 普查與守衛 `castabilityVfxOnly.test.ts` 讀的是**同一份**（形態⑤）。
 */

/**
 * ⭐ 2026-08-19（GH#374/#375/#385）—— **把技能自己宣告的前提先滿足，再按下去**。
 *
 * ⚠️ 這不是放寬，是修一個**問錯問題**的量測。普查在此之前問的是「在一個什麼
 * 前置都沒有的世界裡按下去會不會有事發生」，而一支**連招收尾技**在那個世界裡
 * 什麼都不做**正是它的規格**。逐格量到的（真跑，不是推論）：
 *
 *   · 44-03 火車輾過 / 44-04 心臟麻痺 —— 兩支的效果都掛
 *     `condition{kind:"status", subject:"target", statusId:"curse"}`，也就是
 *     「44-01 死神之眼先標記過的目標」。那顆葉子是**刻意加上去**的
 *     （`tools/skill-remake/batch1.py` 44-03 那一段：在它之前「44-01 有沒有先掛上
 *     【詛咒】完全不影響這一發」＝失敗形態②）。⇒ 內容修好了，而普查因為它而變紅。
 *     實測：把【詛咒】掛上去之後兩支都是 ✅ damage（676.0→103.2 / 676.0→474.8）。
 *   · 59-01 吞噬 —— `devour` 是**處決線**（`hp > maxHp × pct` 就整段跳過），
 *     而普查把假人設在 50% 血。實測：把假人壓到 2% 之後是 ✅（死亡 + 回血 + killCombo）。
 *
 * ⛔ **它不可能把一支真的 no-op 變綠**：滿足的是 JSON **自己寫出來的**閘，
 * 一棵空的效果樹、一條 inert 的 modifier、一支只有特效的技能在這之後仍然量得到
 * 一模一樣的東西。
 * ⭐ 而且它是**一條從樹推導出來的規則**，⛔ 不是逐支補丁（第〇·五守則）：
 * 下一支寫「對【燃燒】中的目標追加傷害」的技能不必再改這裡一個字。
 *
 * ⚠️ **`not` 底下的葉子不走這條路**：把它滿足等於讓那段效果**不**發生 ——
 * 方向相反的「幫忙」比不幫忙更糟。
 */
function collectRequiredStatusIds(node: unknown, out: Set<string>): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const v of node) collectRequiredStatusIds(v, out);
    return;
  }
  const rec = node as Record<string, unknown>;
  if (
    rec.kind === "status" &&
    rec.subject === "target" &&
    typeof rec.statusId === "string" &&
    rec.minStacks === undefined
  ) {
    out.add(rec.statusId);
  }
  for (const [key, v] of Object.entries(rec)) {
    if (key === "not") continue; // 反向葉子 —— 見檔頭最後一段
    collectRequiredStatusIds(v, out);
  }
}

/** 這棵樹裡最寬鬆的處決門檻（沒有 `devour` 就回 null）。 */
function devourThreshold(node: unknown): number | null {
  if (node === null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    let best: number | null = null;
    for (const v of node) {
      const t = devourThreshold(v);
      if (t !== null && (best === null || t > best)) best = t;
    }
    return best;
  }
  const rec = node as Record<string, unknown>;
  let best: number | null = null;
  if (rec.kind === "devour" && Array.isArray(rec.thresholdPctOfMax)) {
    const pct = rec.thresholdPctOfMax[0];
    if (typeof pct === "number" && pct > 0) best = pct;
  }
  for (const v of Object.values(rec)) {
    const t = devourThreshold(v);
    if (t !== null && (best === null || t > best)) best = t;
  }
  return best;
}

/**
 * 把 `def.effects` 自己宣告的前提**真的**布置到場上。
 *
 * ⛔ 掛狀態走**出貨的 `applyStatus`**（`runEffects`），不是手寫一個
 * `StatusEffect` 塞進陣列 —— 後者是失敗形態⑤（被測的不是出貨的那個）：
 * 手寫的那一份與條件葉讀的那一份哪天分岔，這裡會安靜地繼續綠。
 */
function satisfyDeclaredPreconditions(
  world: SimWorld,
  def: AbilityDef,
  caster: EntityId,
  victims: readonly EntityId[],
): void {
  const statuses = new Set<string>();
  collectRequiredStatusIds(def.effects, statuses);
  if (statuses.size > 0) {
    const pre: EffectDef[] = [...statuses]
      .sort()
      .map((statusId) => ({ kind: "applyStatus", statusId, duration: 600 }) as EffectDef);
    runEffects(pre, {
      world,
      caster,
      rank: 1,
      targets: [...victims],
      origin: "castability-precondition",
      rng: world.rng,
    });
  }
  const pct = devourThreshold(def.effects);
  if (pct !== null) {
    for (const id of victims) {
      const hp = world.health.get(id);
      if (hp) hp.hp = Math.max(1, hp.maxHp * pct * 0.5);
    }
  }
}

/**
 * ⭐ 2026-08-19 —— **散落型技能的假人要站在落點上，否則量到的是 seed 不是技能**。
 *
 * `randomArea`（13-04 龍星群 / 70-04 千年練成，全 content 只有這兩支）在施法那一刻
 * 把落點一次抽完，而普查把假人釘在原地。於是「這一格是不是 ✅」變成一次擲骰 ——
 * 實測 24 顆 seed：13-04 中 **12/24**、70-04 中 **16/24**。
 * ⛔ 兩支剛好都在 {@link KNOWN_GAPS} 上，而那張帳把它們記成內容缺陷
 *（70-04 那一列甚至寫「整棵樹只有 spawnVfx」—— 它的樹裡有**兩發 damageArea**）。
 *
 * 普查本來就已經**每 tick 把假人釘回原位**（免得被擊退推出圈外）—— 這一段只是
 * 把「原位」改成**引擎自己排定的下一個落點**。⛔ 它不可能把真的 no-op 變綠：
 * 落點跑的是 `wave.effects`，那串是空的或 inert 就一樣打不出東西。
 */
function nextScatterPoint(world: SimWorld, caster: EntityId): { x: number; z: number } | null {
  for (const wave of world.randomArea) {
    if (wave.caster !== caster) continue;
    const hit = wave.impacts[wave.next];
    if (hit) return hit.pos;
  }
  return null;
}

function abilityForSlot(world: SimWorld, id: EntityId, slot: CastableSlot): AbilityDef | null {
  const ab = world.abilities.get(id)!;
  const inst =
    slot === "EX" ? ab.exSlot : slot === INNATE_SLOT ? ab.passiveSlot : ab.slots[slot];
  if (!inst) return null;
  return Abilities.tryGet(inst.abilityId as never) as AbilityDef | undefined ?? null;
}

/** Raise a slot to rank 1 (EX via learnEx); returns false if it cannot be learned. */
function learnSlot(world: SimWorld, id: EntityId, slot: CastableSlot): boolean {
  const ab = world.abilities.get(id)!;
  if (slot === "EX") {
    if (!ab.exSlot) return false;
    if (ab.exSlot.rank > 0) return true;
    return learnEx(world, id);
  }
  // 天生技**沒有第二欄可以買** —— `spawnChampion` 就把它建在 rank 1。
  // ⛔ 不可以送進 `rankUpAbility`：那條路只收 `CoreAbilitySlot`（見 intents.ts
  // 對「兩套字母表」的說明），而「已經是 rank 1」正是它該有的樣子。
  if (slot === INNATE_SLOT) return (ab.passiveSlot?.rank ?? 0) > 0;
  const inst = ab.slots[slot as CoreAbilitySlot];
  if (inst.rank >= 1) return true; // Q starts learned
  world.ultGateOverride = true;
  ab.unspentPoints = 1;
  return rankUpAbility(world, id, slot as CoreAbilitySlot);
}

/** Build a cast target appropriate to the ability's castType. */
function targetFor(
  def: AbilityDef,
  foe: EntityId,
  ally: EntityId,
  foePos: { x: number; z: number },
): CastTarget {
  switch (def.castType) {
    case "self":
      return { type: "self" };
    case "targeted":
      // ally-only spells (heals/shields/buffs) refuse enemies, so aim them right
      return def.targetsEnemies === false
        ? { type: "entity", entityId: ally }
        : { type: "entity", entityId: foe };
    case "ground":
      return { type: "point", point: { x: foePos.x, z: foePos.z } };
    case "skillshot":
    case "dash":
      return { type: "point", point: { x: foePos.x, z: foePos.z } };
  }
}

/**
 * Run one (champion, slot) cast in a fresh world and decide PASS/FAIL/PASSIVE.
 */
function testSlot(championId: string, slot: CastableSlot, seed: number): Cell {
  try {
    const world = new SimWorld(SKELETON_ARENA, seed);
    world.ultGateOverride = true;
    const caster = spawn(world, championId, 0, 0);
    const foe = spawn(world, DUMMY as unknown as string, 1, ADJ);
    const ally = spawn(world, DUMMY as unknown as string, 0, -ADJ);
    world.step(NO_INTENTS); // settle stats/health
    world.rebuildGrid();

    const def = abilityForSlot(world, caster, slot);
    if (!def) {
      return {
        verdict: "NONE",
        reason:
          slot === INNATE_SLOT
            ? "這位英雄沒有天生技（原作就沒有 NN-00）"
            : "這位英雄沒有這一格",
      };
    }

    if (!learnSlot(world, caster, slot)) {
      return { verdict: "FAIL", castType: def.castType, reason: "could not be learned/unlocked" };
    }
    world.step(NO_INTENTS); // let rank-up passives settle
    world.rebuildGrid();

    // ---- permanent passive (native Cool=0, no castable effects) ----
    // ⚠️ `isPassiveInnate` 是 2026-08-18 加的第二條路（GH#374）：`isPassiveOnly`
    // 問的是「有 `passive` 區塊而且沒有 effects」，而 52-00 十二道試煉的內容整包
    // 住在 `marks[]`、**一個 `passive` 區塊都沒有** —— 於是它掉進主動施放那條路、
    // 被 `castAbility` 以 "passive" 拒絕，量出一格假 ❌。天生技的「是不是永久被動」
    // 只有一個答案，就是 `innateKind`，⛔ 不是從別的欄位反推。
    if (isPassiveOnly(def) || isPassiveInnate(def)) {
      const src = world.stats
        .get(caster)!
        .sources.find((s) => s.id === abilityPassiveSourceId(def.id));
      // 標記（`marks[]`）是**第二種**掛載：它不是 ModifierSource，走
      // `sim/marks.ts` 自己的 per-entity 表。少了這一格，一支完整實作的被動
      // 會被判成 inert（`content/abilityNoOpEffects.ts` 檔頭記錄的同一個誤報）。
      const marked = (world.marks.get(caster)?.size ?? 0) > 0;
      const rej = castAbility(world, caster, slot, { type: "self" });
      if (src || marked) {
        return {
          verdict: "PASSIVE",
          castType: def.castType,
          channel: src
            ? src.modifiers?.length
              ? "passive:modifiers"
              : "passive:hooks"
            : "passive:marks",
          reason: rej === "passive" ? undefined : `cast returned "${rej}" (expected "passive")`,
        };
      }
      // ⭐ 形態閘 —— 在判 ❌ **之前**問一次「這一階是不是只在另一個身體裡生效」。
      // ⛔ 順序是承重的：反過來寫的話 79-002 虛化仍然會先被記成 FAIL。
      // 判準住在 `castabilityVerdict.ts`（普查與守衛讀同一份）。
      //
      // ⭐ 2026-08-20（GH#412）—— 這裡從「**宣告未量測**」升級成「**真的去量**」。
      //
      // 2026-08-19 的版本到此為止就回 🔵 FORM_GATED，而那句誠實的分類換來的是
      // 「79-002 虛化的格擋**從來沒有被自動驗證過** —— 它可能是好的，也可能上架
      // 起就是死的，我們不知道」。⛔ 一格永遠不會被量的格子，跟一格假 ✅ 一樣
      // 是儀器在說「這裡不用看」。
      //
      // 修法是走**出貨的那一條變身路徑**（`ChampionFormSystem.applyChampionForm`
      // → `setBody` → `syncAbilityPassives`），⛔ 不是手動改 `world.championForm`
      // 再自己呼叫一次 sync：後者是失敗形態⑤（被測的不是出貨的那個），而形態閘
      // 的兩個讀端（`rankBlock` 讀 `world.championForm`、`setBody` 寫它）正好就是
      // 那條路上一前一後的兩行。
      //
      // ⛔ 它不可能把一支真的 inert 的被動變綠：換過去之後問的仍然是同一個問題
      // ——「有沒有一份 ModifierSource／標記掛上來」。
      if (passiveFormGate(def, 1) === "alternate") {
        const swapped = applyChampionForm(world, caster, "alternate", undefined, {
          slot,
          origin: "castability-form-probe",
        });
        if (!swapped || championFormIndex(world, caster) !== 1) {
          // 唯一還剩下的 🔵：**換不過去**（沒有 `transform.counterpartId`／
          // 對手的 doc 沒註冊）。這時說「量過了」就是說謊。
          return {
            verdict: "FORM_GATED",
            castType: def.castType,
            reason:
              "這一階被動帶 `whileForm:\"alternate\"`，而這位英雄**沒有可解析的替身身體**" +
              "（`transform.counterpartId` 缺失或指向未註冊的 doc）—— 普查換不過去。⇒ 本次未量測。",
          };
        }
        world.step(NO_INTENTS); // 讓 setBody 之後的統計重算落地
        const altSrc = world.stats
          .get(caster)!
          .sources.find((s) => s.id === abilityPassiveSourceId(def.id));
        const altMarked = (world.marks.get(caster)?.size ?? 0) > 0;
        if (altSrc || altMarked) {
          return {
            verdict: "PASSIVE",
            castType: def.castType,
            channel: altSrc
              ? altSrc.modifiers?.length
                ? "passive:modifiers@alternate"
                : "passive:hooks@alternate"
              : "passive:marks@alternate",
            reason:
              "在**替身形態**下量到的（走出貨的 `applyChampionForm` → `setBody` → " +
              "`syncAbilityPassives`）—— GH#412 之前這一格永遠是 🔵「本次未量測」。",
          };
        }
        return {
          verdict: "FAIL",
          castType: def.castType,
          reason:
            "`whileForm:\"alternate\"` 的被動：**真的換到替身身體之後**，來源仍然沒有掛上（inert）。" +
            "⛔ 這不是形態閘的問題 —— 普查已經在正確的身體裡量了（GH#412）。",
        };
      }
      return {
        verdict: "FAIL",
        castType: def.castType,
        reason: "passive-only but no modifier/hook/mark source attaches (inert)",
      };
    }

    // ---- active cast ----
    const foePos = { ...world.transform.get(foe)!.pos };
    const allyPos = { ...world.transform.get(ally)!.pos };
    const casterAnchor = { ...world.transform.get(caster)!.pos };

    // Set every scene body to half HP/mana so heals/restores/shields have room;
    // give the caster exactly enough mana that the cast is never rejected for
    // cost yet self mana-restores still register.
    for (const e of [caster, foe, ally]) {
      const hp = world.health.get(e)!;
      hp.hp = hp.maxHp * 0.5;
      hp.mana = hp.maxMana * 0.5;
    }
    const cost = def.manaCost[0] ?? 0;
    world.health.get(caster)!.mana = cost + 1;

    // ⭐ 技能自己宣告的前提（【詛咒】標記 / 處決線）——⛔ 一定要在 `before`
    //    **之前**，否則布置本身會被算成這一次施放的效果。
    satisfyDeclaredPreconditions(world, def, caster, [foe, ally]);

    const target = targetFor(def, foe, ally, foePos);
    const before = snapshotChannels(world);
    const events: string[] = [];

    const res = castAbility(world, caster, slot, target);
    if (res !== "ok") {
      return { verdict: "FAIL", castType: def.castType, reason: `cast rejected: ${res}` };
    }
    events.push(...world.events.map((e) => e.type));

    const window = WINDOW + leapWindow(def.effects) + castWindow(def.castTimeSec);
    /** 假人現在被釘在哪 —— 散落型技能會把它改成下一個落點（見 nextScatterPoint）。 */
    const pin = { ...foePos };
    for (let i = 0; i < window; i++) {
      // ⛔ 釘在 `step()` **之前**：落點是在那一格的 `randomAreaSystem` 裡結算的，
      //    步完才移動 = 永遠慢一格，等於沒有移動。
      const scatter = nextScatterPoint(world, caster);
      if (scatter) {
        pin.x = scatter.x;
        pin.z = scatter.z;
        world.transform.get(foe)!.pos = { ...pin };
      }
      world.step(NO_INTENTS);
      events.push(...world.events.map((e) => e.type));
      // re-pin the two dummies so a knockback / shove cannot carry them out of
      // a ground circle before it resolves (the caster is left free so a dash
      // effect can visibly move it).
      world.transform.get(foe)!.pos = { ...pin };
      world.transform.get(ally)!.pos = { ...allyPos };
    }

    const after = snapshotChannels(world);
    const dx = world.transform.get(caster)!.pos.x - casterAnchor.x;
    const dz = world.transform.get(caster)!.pos.z - casterAnchor.z;
    // 0.2u 的位移門檻，寫成平方比較 —— `Math.hypot` 在 `sim/**` 是禁字
    // （`purity.test.ts`），而判定層是要被非測試模組共用的。
    const moved = dx * dx + dz * dz > 0.04 || world.nav.get(caster)!.override != null;

    const out = classifyCastOutcome({
      events,
      before,
      after,
      moved,
      effectsAuthored: def.effects.length,
    });
    // GH#407 —— 這一格要不要跨 seed 量，由**樹**回答，⛔ 不由一張技能名單回答。
    const stochastic = [...stochasticNodeKinds(def.effects)].sort();
    return {
      verdict: out.verdict,
      castType: def.castType,
      channel: out.channel,
      reason: out.reason,
      ...(stochastic.length ? { stochastic } : {}),
    };
  } catch (err) {
    return { verdict: "FAIL", reason: `threw: ${(err as Error).message}` };
  }
}

/** 判定的「壞」序 —— 跨 seed 不一致時取最壞的那一個。 */
const VERDICT_RANK: Record<Verdict, number> = {
  FAIL: 0,
  VFX_ONLY: 1,
  FORM_GATED: 2,
  NONE: 3,
  PASSIVE: 4,
  PASS: 5,
};

/**
 * ⭐ GH#407 —— **一格量幾次，由這一格自己的效果樹決定**。
 *
 * 沒有隨機節點 → 一顆 seed 就是量測（今天的行為，逐位元不變）。
 * 有隨機節點 → 跑 {@link STOCHASTIC_SEEDS} 顆，**全部一致才算量到**：
 *   · 全部同一個判定 → 就是那個判定，並在報表記下「N/N 顆一致」；
 *   · 有分歧 → 取**最壞**的那一個當判定，並標記 `seedDependent`。
 *
 * ⛔ 為什麼取最壞而不是最好：這條 gate 問的是「按下去會不會什麼都不發生」，
 * 而「有時候什麼都不發生」的答案就是**會**。取最好等於用一顆挑過的 seed
 * 替內容背書 —— 那正是 GH#374 收尾時 13-04（12/24）與 70-04（16/24）之所以
 * 曾經在 {@link KNOWN_GAPS} 上被記成內容缺陷的原因，只是方向相反。
 * ⛔ 也不可以「重骰到過為止」（best-of-N）：那不是量測，那是挑答案。
 */
function measureSlot(championId: string, slot: CastableSlot): Cell {
  const base = 4242 + SLOTS.indexOf(slot);
  const first = testSlot(championId, slot, base);
  if (!first.stochastic?.length) return first;

  const tally = new Map<Verdict, number>([[first.verdict, 1]]);
  for (let i = 1; i < STOCHASTIC_SEEDS; i++) {
    // ⚠️ 步長取質數，免得 `base + i` 與槽位偏移撞成同一串 seed。
    const v = testSlot(championId, slot, base + i * 7919).verdict;
    tally.set(v, (tally.get(v) ?? 0) + 1);
  }
  const seen = [...tally.entries()].sort((a, b) => VERDICT_RANK[a[0]] - VERDICT_RANK[b[0]]);
  const seedTally = seen.map(([v, n]) => `${v} ${n}/${STOCHASTIC_SEEDS}`).join("、");
  const worst = seen[0]![0];
  if (seen.length === 1) {
    return {
      ...first,
      verdict: worst,
      seedTally,
      reason:
        (first.reason ? `${first.reason}　` : "") +
        `隨機節點 [${first.stochastic.join(", ")}]，${STOCHASTIC_SEEDS} 顆 seed 判定一致。`,
    };
  }
  return {
    ...first,
    verdict: worst,
    seedTally,
    seedDependent: true,
    reason:
      `⚠️ **判定隨 seed 改變**（隨機節點 [${first.stochastic.join(", ")}]）：${seedTally}。` +
      "⇒ 這一格今天是**擲骰**不是量測；照最壞的那一個記，理由見 SEED_DEPENDENT_CELLS。",
  };
}

/** Swing the basic attack at an adjacent enemy and confirm it lands / fires. */
function testBasic(championId: string): { cell: Cell; projectile: boolean; rangedFlag?: boolean } {
  try {
    const world = new SimWorld(SKELETON_ARENA, 9001);
    const caster = spawn(world, championId, 0, 0);
    const foe = spawn(world, DUMMY as unknown as string, 1, ADJ);
    world.step(NO_INTENTS);
    const cpos = { ...world.transform.get(caster)!.pos };
    const fpos = { ...world.transform.get(foe)!.pos };

    let basicEvent = false;
    let projectile = false;
    let damage = false;
    let rangedFlag: boolean | undefined;
    for (let i = 0; i < BASIC_WINDOW; i++) {
      world.nav.get(caster)!.attackTarget = foe;
      world.transform.get(caster)!.pos = { ...cpos };
      world.transform.get(foe)!.pos = { ...fpos };
      world.health.get(foe)!.hp = world.health.get(foe)!.maxHp; // keep it alive
      world.step(NO_INTENTS);
      for (const e of world.events) {
        if (e.type === "basicAttack") {
          basicEvent = true;
          rangedFlag = (e.data as { ranged?: boolean }).ranged;
        }
        if (e.type === "projectileSpawn") projectile = true;
        if (e.type === "damage" && (e.data as { origin?: string }).origin === "basic") damage = true;
      }
      if (basicEvent && (projectile || damage)) break;
    }

    if (basicEvent && (projectile || damage)) {
      return {
        cell: { verdict: "PASS", channel: projectile ? "projectile" : "damage" },
        projectile,
        rangedFlag,
      };
    }
    return {
      cell: {
        verdict: "FAIL",
        reason: basicEvent
          ? "swing fired but no damage/projectile resolved"
          : "no basic attack swing within window",
      },
      projectile,
      rangedFlag,
    };
  } catch (err) {
    return { cell: { verdict: "FAIL", reason: `threw: ${(err as Error).message}` }, projectile: false };
  }
}

// ------------------------------------------------------------------- the sweep

describe("task #128 — in-game castability coverage sweep", () => {
  it("spawns every whitelisted champion and fires every slot, writing docs/_castability-128.md", () => {
    cover("castability-sweep-128");
    const roster = resolveRoster();
    expect(
      tracked.length,
      `the tracked first open roster in ${STARTER_GO_REL} is pinned at ${ROSTER_SIZE} ` +
        `champions (Go: TestFirstOpenRoster) but parsed to ${tracked.length}`,
    ).toBe(ROSTER_SIZE);

    for (const id of roster) {
      let name = id;
      let attackType: "melee" | "ranged" = "melee";
      let spawnOk = true;
      let spawnError: string | undefined;
      try {
        const def = Champions.get(id as ChampionId);
        name = def.name;
        attackType = def.attackType;
        // smoke-spawn to confirm the champion boots at all
        const w = new SimWorld(SKELETON_ARENA, 1);
        spawn(w, id, 0, 0);
        w.step(NO_INTENTS);
      } catch (err) {
        spawnOk = false;
        spawnError = (err as Error).message;
      }

      const cells: Record<SlotName, Cell> = {
        Q: { verdict: "FAIL" },
        W: { verdict: "FAIL" },
        E: { verdict: "FAIL" },
        R: { verdict: "FAIL" },
        EX: { verdict: "FAIL" },
        PASSIVE: { verdict: "FAIL" },
        basic: { verdict: "FAIL" },
      };
      let basicProjectile: boolean | undefined;
      let basicRangedFlag: boolean | undefined;

      if (spawnOk) {
        for (const slot of SLOTS) cells[slot] = measureSlot(id, slot);
        const b = testBasic(id);
        cells.basic = b.cell;
        basicProjectile = b.projectile;
        basicRangedFlag = b.rangedFlag;
      } else {
        const failCell: Cell = { verdict: "FAIL", reason: "champion failed to spawn" };
        for (const slot of COLS) cells[slot] = failCell;
      }

      results.push({
        id,
        name,
        attackType,
        spawnOk,
        spawnError,
        cells,
        basicProjectile,
        basicRangedFlag,
      });
    }

    writeReport();

    // ---- gate 1: the sweep ran end-to-end, every champion, every slot ----
    expect(results.length).toBe(roster.length);
    expect(results.filter((r) => tracked.includes(r.id)).length).toBe(ROSTER_SIZE);
    for (const r of results) {
      expect(Object.keys(r.cells).length).toBe(COLS.length);
    }

    // ---- gate 2: every TRACKED champion spawns ----
    // Not a content no-op — a champion that cannot enter a SimWorld is broken
    // content or a broken loader, and it is pickable in champ-select.
    const brokenSpawns = results
      .filter((r) => tracked.includes(r.id) && !r.spawnOk)
      .map((r) => `${r.id} (${r.name}): ${r.spawnError}`);
    expect(brokenSpawns, "first-open-roster champions that fail to spawn").toEqual([]);

    // ---- gate 3: the working-cell ratchet ----
    // Counted over the TRACKED roster only, so an operator's extra picks can
    // never move the number. The known gaps stay findings in the report; a
    // regression that kills a slot that works today goes red here.
    // ⚠️ `NONE`（這位英雄沒有這一格）從**分子與分母兩邊**同時扣掉 ——
    // 它不是一格會動的技能，也不是一格壞掉的技能。留在分母會讓「有 3 位英雄
    // 原作就沒有天生技」變成一個永遠拉低比例的常數，而那個數字說的不是覆蓋率。
    const trackedResults = results.filter((r) => tracked.includes(r.id));
    const working = trackedResults.reduce(
      (n, r) => n + COLS.filter((s) => r.cells[s].verdict === "PASS" || r.cells[s].verdict === "PASSIVE").length,
      0,
    );
    // ⚠️ `FORM_GATED` 和 `NONE` 一樣從**兩邊**扣掉：它是「這一格本次沒有被量」，
    // 不是一個量測結果。留在分母等於用一個永遠不會變綠的常數壓低覆蓋率。
    const cells = trackedResults.reduce(
      (n, r) =>
        n + COLS.filter((s) => r.cells[s].verdict !== "NONE" && r.cells[s].verdict !== "FORM_GATED").length,
      0,
    );
    expect(
      working / cells,
      `working cells (PASS + verified PASSIVE) 是 ${working}/${cells} = ` +
        `${((working / cells) * 100).toFixed(2)}%，低於 ${(WORKING_CELL_RATIO_FLOOR * 100).toFixed(2)}% 的底線 —— ` +
        "見 docs/_castability-128.md 的 FAIL 表看是哪一格退步了。" +
        "⚠️ 如果名單剛剛變短，先確認**比例**有沒有掉：絕對格數變少是分母的事，不是缺陷。",
    ).toBeGreaterThanOrEqual(WORKING_CELL_RATIO_FLOOR);

    // ---- gate 4: 逐格釘死的缺口名單（GH#374，比比例棘輪嚴格）----
    // ⛔ 三個方向都紅：名單外的新缺口（有人改壞了）、名單上已經修好的殘留
    // （帳單變成沒有人會回頭看的白名單）、以及**同一格換了種類**
    // （❌→🟡＝替一支空技能補了個特效，那不是修好它）。
    const live = new Map<string, Verdict>();
    for (const r of trackedResults) {
      for (const slot of COLS) {
        const v = r.cells[slot].verdict;
        if (v === "FAIL" || v === "VFX_ONLY") live.set(`${r.id}|${slot}`, v);
      }
    }
    const known = new Map(KNOWN_GAPS.map((k) => [k.key, k.verdict] as const));
    expect(
      [...live].filter(([k]) => !known.has(k)).map(([k, v]) => `${k}=${v}`).sort(),
      "首發名單上冒出**名單外**的缺口 —— 有一格本來會動的技能不動了。" +
        "⛔ 修它，不要把它加進 KNOWN_GAPS（要加就先開 issue 並在那一列寫上編號）。",
    ).toEqual([]);
    expect(
      KNOWN_GAPS.filter((k) => live.get(k.key) !== k.verdict).map(
        (k) => `${k.key} 釘的是 ${k.verdict}，實測是 ${live.get(k.key) ?? "已修好"}（${k.why}）`,
      ),
      "KNOWN_GAPS 與實測對不上 —— 修好了就把該列刪掉；種類變了（❌↔🟡）就先確認那是真的進步。",
    ).toEqual([]);

    // ---- gate 5: 形態閘那一本帳（2026-08-19）----
    // 🔵 不進分子也不進分母，所以它**必須**有自己的閘，否則「把一格空技能加上
    // whileForm」就是一條讓缺陷從兩份名單同時消失的路。
    const gated = new Set<string>();
    for (const r of trackedResults) {
      for (const slot of COLS) {
        if (r.cells[slot].verdict === "FORM_GATED") gated.add(`${r.id}|${slot}`);
      }
    }
    const gatedKnown = new Set(FORM_GATED_CELLS.map((k) => k.key));
    expect(
      [...gated].filter((k) => !gatedKnown.has(k)).sort(),
      "冒出**名單外**的 🔵 —— 有人替一格被動加了形態閘，而它從此不再被這份普查量到。" +
        "⛔ 先確認那是刻意的，再把它寫進 FORM_GATED_CELLS 並說明為什麼。",
    ).toEqual([]);
    expect(
      FORM_GATED_CELLS.filter((k) => !gated.has(k.key)).map((k) => `${k.key}（${k.why}）`),
      "FORM_GATED_CELLS 上的某一格不再是 🔵 —— 普查量得到它了，把那一列刪掉。",
    ).toEqual([]);

    // ---- gate 6: 隨機類技能的判定必須是**量測**，不是抽樣（GH#407）----
    // ⛔ 這一條與比例棘輪、KNOWN_GAPS 都不重疊：一格「12/24 顆 seed 有效果」的
    // 技能在**任何一次**單 seed 的跑法底下都會給出一個確定的 ✅ 或 ❌，而那個
    // 確定的答案有一半的機率是假的。訊息會說「這一格壞了」，真相是 seed ——
    // 用錯誤的訊息紅比不紅還糟（CLAUDE.md：`bossRoundExtension.test.ts` 那一次）。
    const wobbly = new Map<string, string>();
    for (const r of trackedResults) {
      for (const slot of COLS) {
        const c = r.cells[slot];
        if (c.seedDependent) wobbly.set(`${r.id}|${slot}`, c.seedTally ?? "");
      }
    }
    const wobblyKnown = new Set(SEED_DEPENDENT_CELLS.map((k) => k.key));
    expect(
      [...wobbly].filter(([k]) => !wobblyKnown.has(k)).map(([k, t]) => `${k}（${t}）`).sort(),
      `冒出**名單外**的 seed 依賴格 —— 這一格換一顆 seed 就換一個判定，` +
        "所以它今天既不是 ✅ 也不是 ❌，是**擲骰**。⛔ 先確認是內容真的有一條「什麼都不做」的分支，" +
        "還是普查缺一根指針（就像 GH#407 之前缺的那根金幣指針），再決定要不要寫進 SEED_DEPENDENT_CELLS。",
    ).toEqual([]);
    expect(
      SEED_DEPENDENT_CELLS.filter((k) => !wobbly.has(k.key)).map((k) => `${k.key}（${k.why}）`),
      "SEED_DEPENDENT_CELLS 上的某一格不再隨 seed 改變 —— 它現在是真的量測了，把那一列刪掉。",
    ).toEqual([]);

    // ---- gate 7: 儀器本身要**真的**在跨 seed 量（GH#407 的反向閘）----
    // ⛔ 少了它，`stochasticNodeKinds` 哪天回空集合（改壞了、或 kind 改名了）
    // 上面那條閘會**永遠是綠的**，而它守的東西整個消失 —— 失敗形態③。
    const measuredAcrossSeeds = results.reduce(
      (n, r) => n + COLS.filter((s) => r.cells[s].seedTally !== undefined).length,
      0,
    );
    expect(
      measuredAcrossSeeds,
      "沒有任何一格被跨 seed 量過 —— `stochasticNodeKinds` 從效果樹裡認不出任何隨機節點了，" +
        "於是 gate 6 結構上永遠綠（出貨內容裡確實有 `weightedBranch` 與 `randomArea`）。",
    ).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------------- reporting

function mark(c: Cell): string {
  if (c.verdict === "PASS") return "✅";
  if (c.verdict === "PASSIVE") return "🟣";
  if (c.verdict === "NONE") return "—";
  if (c.verdict === "VFX_ONLY") return "🟡";
  if (c.verdict === "FORM_GATED") return "🔵";
  return "❌";
}

function writeReport(): void {
  const cols = COLS;
  const totalCells = results.length * cols.length;
  let pass = 0;
  let passive = 0;
  let fail = 0;
  let none = 0;
  type Row = { id: string; name: string; slot: SlotName; cell: Cell; atk: string };
  const failures: Row[] = [];
  /** 🟡 只有特效的格子 —— 自己一張表，⛔ 不混進 FAIL（GH#374）。 */
  const vfxOnlyCells: Row[] = [];
  /** 🔵 被形態閘擋住、本次未量測的格子 —— 自己一張表（2026-08-19）。 */
  const formGatedCells: Row[] = [];

  for (const r of results) {
    for (const slot of cols) {
      const c = r.cells[slot];
      const row: Row = { id: r.id, name: r.name, slot, cell: c, atk: r.attackType };
      if (c.verdict === "PASS") pass++;
      else if (c.verdict === "PASSIVE") passive++;
      else if (c.verdict === "NONE") none++;
      else if (c.verdict === "VFX_ONLY") vfxOnlyCells.push(row);
      else if (c.verdict === "FORM_GATED") formGatedCells.push(row);
      else {
        fail++;
        failures.push(row);
      }
    }
  }

  // channel tally over PASS cells — proves the sweep detects real gameplay
  // channels, not just the cosmetic vfxSpawn that most abilities also carry.
  const channelTally = new Map<string, number>();
  let passOnVfxChannel = 0;
  for (const r of results) {
    for (const slot of cols) {
      const c = r.cells[slot];
      if (c.verdict === "PASS" && c.channel) {
        channelTally.set(c.channel, (channelTally.get(c.channel) ?? 0) + 1);
        if (c.channel === "vfx") passOnVfxChannel++;
      }
    }
  }

  // 版控名單那 49 人的可用格比例 —— 就是閘 3 在看的那個數字。
  // ⭐ 印出來是刻意的：以前它只在**紅的時候**才出現在錯誤訊息裡，於是「今天量到
  // 多少」要跑一次測試才知道，而調棘輪的人只能用猜的（第零守則：給量尺）。
  const trackedRows = results.filter((r) => tracked.includes(r.id));
  const trackedWorking = trackedRows.reduce(
    (n, r) => n + cols.filter((s) => r.cells[s].verdict === "PASS" || r.cells[s].verdict === "PASSIVE").length,
    0,
  );
  const trackedCells = trackedRows.reduce(
    (n, r) =>
      n + cols.filter((s) => r.cells[s].verdict !== "NONE" && r.cells[s].verdict !== "FORM_GATED").length,
    0,
  );

  const spawnFails = results.filter((r) => !r.spawnOk);
  const melee = results.filter((r) => r.attackType === "melee");
  const ranged = results.filter((r) => r.attackType === "ranged");
  const rangedProj = ranged.filter((r) => r.basicProjectile === true).length;
  const meleeDirect = melee.filter((r) => r.basicProjectile === false && r.cells.basic.verdict === "PASS").length;

  // skillshot casts by attackType (the other place ranged/melee identity shows)
  let ssMelee = 0;
  let ssRanged = 0;
  for (const r of results) {
    for (const slot of SLOTS as SlotName[]) {
      if (r.cells[slot].castType === "skillshot") {
        if (r.attackType === "ranged") ssRanged++;
        else ssMelee++;
      }
    }
  }

  const L: string[] = [];
  L.push("# 技能 in-game 可施放覆蓋矩陣 — Task #128");
  L.push("");
  L.push(`> 生成於 \`packages/shared/src/sim/castabilitySweep.test.ts\`（每次跑測試即重算）。`);
  L.push(
    `> 這是**診斷**：把 ${results.length} 位英雄每一格 天生技/Q/W/E/R/EX + 普攻在真的 SimWorld 裡按下去，量測有沒有真的產生效果` +
      "（傷害／投射物／狀態／護盾／補血／補魔／位移／變身），不修任何技能。" +
      "⛔ **純特效（只有 spawnVfx）不算有效果**，它自成一類 🟡，⛔ 既不算 ✅ 也不併進 ❌ —— 見下方方法說明（GH#374）。",
  );
  L.push("");
  L.push(`> **名單來源**：${rosterSource}。`);
  L.push(
    "> 名單取自**版控內**的 `starterChampions`（新安裝套用的首發開放名單，Go 端 `TestFirstOpenRoster` 逐一釘死），" +
      `所以任何 clone／worktree／CI 都掃同一份 ${ROSTER_SIZE} 人；營運白名單 \`data/curation/whitelist.json\` 是 gitignore 的機器狀態，` +
      "存在時只**加掃**它額外開放的英雄，且不列入下方釘死的計數。",
  );
  if (extras.length) {
    L.push(`> 本機額外加掃（僅營運白名單開放、不在首發名單）：${extras.map((id) => `\`${id}\``).join("、")}。`);
  }
  L.push("");
  L.push("## 判定圖例");
  L.push("");
  L.push("| 標記 | 意義 |");
  L.push("| --- | --- |");
  L.push("| ✅ PASS | 施放被接受且量到實際效果，過程無例外 |");
  L.push("| 🟣 PASSIVE | WC3 永久被動（原生 Cool=0、無可施放效果）；已驗證其 ModifierSource 確實掛上，非 bug |");
  L.push("| ❌ FAIL | 被拒絕／丟例外／接受了卻沒有任何可量測效果（no-op）；或英雄無法生成 |");
  L.push(
    "| 🟡 只有特效 | 放得出去、冷卻真的付了、畫面上看得到東西 —— **而場上一個數字都沒動**（整棵效果樹只有 `spawnVfx`）。" +
      "⛔ 它不算 ✅（GH#373 就是這樣上架的），也**不併進** ❌（「按不下去」跟「按得下去但是空的」要修的地方不同） |",
  );
  L.push("| — 無此格 | 這位英雄根本沒有這一格（原作就沒有 NN-00 天生技／骨架示範英雄沒有 EX）；不計入下方比例的分子與分母 |");
  L.push(
    "| 🔵 形態閘 | 這一階被動寫著 `whileForm:\"alternate\"`，**而這位英雄換不過去**" +
      "（`transform.counterpartId` 缺失／指向未註冊的 doc）⇒ **本次未量測**；同 — 一樣不計入分子與分母。" +
      "⭐ GH#412 之後「有替身身體」的那一種**不再是 🔵** —— 普查會真的走 `applyChampionForm` 換到替身身體再量一次 |",
  );
  L.push("");
  L.push("## 總計");
  L.push("");
  L.push(`- **格數**：${results.length} 英雄 × ${cols.length} 槽 = **${totalCells}**`);
  L.push(
    `- **✅ PASS：${pass} / ${totalCells}**（${((pass / totalCells) * 100).toFixed(1)}%）` +
      `　🟣 PASSIVE：${passive}　🟡 只有特效：${vfxOnlyCells.length}　❌ FAIL：${fail}　— 無此格：${none}`,
  );
  L.push(
    `- 把「正確的永久被動」算進可接受行為：**${pass + passive} / ${totalCells}**` +
      `（${(((pass + passive) / totalCells) * 100).toFixed(1)}%）如預期運作，` +
      `真正的缺口是 **${fail + vfxOnlyCells.length}** 格（❌ ${fail} ＋ 🟡 ${vfxOnlyCells.length}），` +
      `另有 **${formGatedCells.length}** 格 🔵 本次未量測（形態閘）。`,
  );
  L.push(
    `- **閘 3 在看的那個數字**（只算版控首發名單那 ${ROSTER_SIZE} 人、扣掉「無此格」）：` +
      `**${trackedWorking} / ${trackedCells} = ${((trackedWorking / trackedCells) * 100).toFixed(2)}%**` +
      `（棘輪下限 ${(WORKING_CELL_RATIO_FLOOR * 100).toFixed(2)}%）。`,
  );
  L.push(`- 英雄生成失敗：**${spawnFails.length}**` + (spawnFails.length ? `（${spawnFails.map((r) => r.id).join(", ")}）` : "（無）"));
  L.push("");
  L.push("## 近戰 vs 遠程（attackType 維度）");
  L.push("");
  L.push(`- 名單：**近戰 ${melee.length}**、**遠程 ${ranged.length}**。`);
  L.push(
    `- **普攻形態**：遠程英雄中 **${rangedProj}/${ranged.length}** 的普攻確實射出投射物（\`projectileSpawn\`、事件 \`ranged:true\`）；` +
      `近戰英雄中 **${meleeDirect}/${melee.length}** 的普攻是貼身直接傷害（無投射物、\`ranged:false\`）。` +
      "這正是遠程與近戰在普攻上的行為差異，兩邊都被本次量到。",
  );
  L.push(
    `- **技能投射（skillshot castType）**：本名單中 skillshot 技能格 遠程 ${ssRanged} 格、近戰 ${ssMelee} 格；` +
      "skillshot 一律用施法方向生成投射物，與施法者是遠程或近戰無關（castType 獨立於 attackType）。",
  );
  L.push("");
  L.push("## PASS 觸發頻道分佈（驗證非橡皮圖章）");
  L.push("");
  L.push(
    "> 每個 ✅ 記錄它**第一個**被觸發的頻道（傷害＞投射物＞補血＞補魔＞護盾＞狀態＞buff＞位移＞特效）。" +
      "若全靠 `vfx` 過關代表量測太寬鬆；下表證明絕大多數是真正的 gameplay 頻道。",
  );
  L.push("");
  L.push("| 頻道 | PASS 格數 |");
  L.push("| --- | --: |");
  for (const [ch, n] of [...channelTally.entries()].sort((a, b) => b[1] - a[1])) {
    L.push(`| ${ch} | ${n} |`);
  }
  L.push("");
  L.push(
    `- 僅靠 \`vfx\` 頻道拿到 ✅ 的格數：**${passOnVfxChannel}**` +
      "（GH#374 之後這個數字結構上就該是 0 —— 純特效已經自成一類 🟡，不再走 ✅）。",
  );
  L.push("");
  L.push("## 矩陣");
  L.push("");
  L.push("| 英雄 | ID | 型 | Q | W | E | R | EX | 天生技 | 普攻 |");
  L.push("| --- | --- | --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |");
  for (const r of results) {
    const atk = r.attackType === "ranged" ? "遠" : "近";
    const row = cols.map((s) => mark(r.cells[s])).join(" | ");
    L.push(`| ${r.name} | \`${r.id}\` | ${atk} | ${row} |`);
  }
  L.push("");
  L.push("## FAIL 清單（英雄 + 槽 + 原因，交給技能保真／VFX 負責人）");
  L.push("");
  if (failures.length === 0) {
    L.push("（無 — 全部 ✅/🟣）");
  } else {
    L.push("| 英雄 | ID | 槽 | castType | 型 | 原因 |");
    L.push("| --- | --- | --- | --- | --- | --- |");
    for (const f of failures) {
      const atk = f.atk === "ranged" ? "遠" : "近";
      L.push(
        `| ${f.name} | \`${f.id}\` | ${f.slot} | ${f.cell.castType ?? "—"} | ${atk} | ${f.cell.reason ?? "—"} |`,
      );
    }
  }
  L.push("");
  L.push("## 🟡 只有特效清單（放得出去、但場上一個數字都沒動）");
  L.push("");
  L.push(
    "> ⛔ 這一張表**不是** FAIL 的子集，它是 GH#374 洞②之前**被算成 ✅** 的那一族：" +
      "整棵效果樹只有 `spawnVfx`，玩家按下去看得到光，血量／位置／狀態一個都沒動。" +
      "修法見 CLAUDE.md 第一·五守則（替換成做得到的效果，⛔ 不是刪掉描述）。",
  );
  L.push("");
  if (vfxOnlyCells.length === 0) {
    L.push("（無）");
  } else {
    L.push("| 英雄 | ID | 槽 | castType | 型 | 說明 |");
    L.push("| --- | --- | --- | --- | --- | --- |");
    for (const f of vfxOnlyCells) {
      const atk = f.atk === "ranged" ? "遠" : "近";
      L.push(
        `| ${f.name} | \`${f.id}\` | ${f.slot} | ${f.cell.castType ?? "—"} | ${atk} | ${f.cell.reason ?? "—"} |`,
      );
    }
  }
  L.push("");
  L.push("## 🔵 形態閘清單（本次未量測，⛔ 不是缺陷）");
  L.push("");
  L.push(
    "> ⭐ GH#412 之後這一張表只剩**唯一**一種成因：rank 區塊帶 `whileForm:\"alternate\"`，" +
      "**而這位英雄沒有可解析的替身身體**，所以普查連換都換不過去。" +
      "有替身身體的那一種現在會被真的量到 —— 普查走出貨的 `applyChampionForm` → `setBody` → `syncAbilityPassives` " +
      "換到替身形態再問一次「來源有沒有掛上」，量到就是 🟣，掛不上就是 ❌（⛔ 不再是「不知道」）。",
  );
  L.push("");
  if (formGatedCells.length === 0) {
    L.push("（無）");
  } else {
    L.push("| 英雄 | ID | 槽 | 說明 |");
    L.push("| --- | --- | --- | --- |");
    for (const f of formGatedCells) {
      L.push(`| ${f.name} | \`${f.id}\` | ${f.slot} | ${f.cell.reason ?? "—"} |`);
    }
  }
  L.push("");
  L.push(`## 🎲 隨機節點的跨 seed 量測（GH#407，每格 ${STOCHASTIC_SEEDS} 顆）`);
  L.push("");
  L.push(
    "> 一支帶 `weightedBranch` / `chance` 條件葉 / `randomArea` 的技能，用**一顆** seed 量出來的 ✅／❌ 是一次**擲骰**：" +
      "GH#374 收尾時實測 13-04 龍星群 **12/24** 顆 seed 命中、70-04 千年練成 **16/24** —— 同一支技能，換一顆 seed 就從 PASS 變 FAIL，" +
      "而這是一條會擋 CI 的 gate。⇒ 這些格子改成跨 seed **全部量一遍**，⛔ 不是重骰到過為止（那是挑答案，不是量測）。" +
      "名單由 `castabilityVerdict.ts::stochasticNodeKinds` 從效果樹**推導**，⛔ 不是一張會過期的技能清單。",
  );
  L.push("");
  const stochRows = results.flatMap((r) =>
    cols
      .filter((s) => r.cells[s].seedTally !== undefined)
      .map((s) => ({ r, s, c: r.cells[s] })),
  );
  if (stochRows.length === 0) {
    L.push("（無 —— ⚠️ 出貨內容裡確實有 `weightedBranch` 與 `randomArea`，這一欄空掉代表偵測器壞了）");
  } else {
    L.push("| 英雄 | ID | 槽 | 隨機節點 | 跨 seed 判定分佈 | 穩定？ |");
    L.push("| --- | --- | --- | --- | --- | :-: |");
    for (const { r, s, c } of stochRows) {
      L.push(
        `| ${r.name} | \`${r.id}\` | ${s} | ${(c.stochastic ?? []).join(", ")} | ${c.seedTally} | ` +
          `${c.seedDependent ? "⚠️ 否（擲骰）" : "✅ 是"} |`,
      );
    }
  }
  L.push("");
  L.push("## 🟣 永久被動清單（非 bug，僅供對照）");
  L.push("");
  const passives = results.flatMap((r) =>
    (SLOTS as SlotName[])
      .filter((s) => r.cells[s].verdict === "PASSIVE")
      .map((s) => ({ r, s })),
  );
  if (passives.length === 0) {
    L.push("（無）");
  } else {
    L.push("| 英雄 | ID | 槽 | 掛載 |");
    L.push("| --- | --- | --- | --- |");
    for (const { r, s } of passives) {
      L.push(`| ${r.name} | \`${r.id}\` | ${s} | ${r.cells[s].channel} |`);
    }
  }
  L.push("");
  L.push("## 方法與抽樣說明");
  L.push("");
  L.push(
    "- 每一格用一個**全新的 SimWorld**（SKELETON_ARENA）跑，避免冷卻／增益／狀態互相污染；" +
      "施法者 + 一個敵方假人（射程內、貼身 1.35u）+ 一個友方假人（給只能指向友軍的補血／護盾／增益）。",
  );
  L.push(
    "- 依 castType 擺位：targeted→貼身敵人（友軍向技能→貼身友軍）、ground→敵人所在點、skillshot／dash→朝敵人、self→自己。",
  );
  L.push(
    "- 「有效果」= 下列任一頻道被觸發且無例外：`damage`／`heal`／`manaRestore`／`projectileSpawn`／`knockdown`／`championForm`／`resourceSwap` 事件，" +
      "或全場護盾／狀態／buff 來源／投射物／【嘲弄】數量上升，或**金幣總額上升**（GH#407），或施法者位移（dash）。" +
      "⛔ 金幣走的是**狀態差**不是 `goldGrant` 事件 —— 那個事件在付了 0 元時照樣發，收它會造出新的假 ✅。" +
      "⛔ **`vfxSpawn` 不在名單上**（2026-08-18 / GH#374）：它唯一保證的是畫面上有東西，而一支只有畫面的技能改不動任何一個數字；" +
      "在此之前它算 ✅，於是 GH#373 那 5 支「整棵樹只有 spawnVfx」的主動天生技在全綠的測試底下上架。" +
      "回血／回魔前先把目標降到半血半魔，確保有回復空間；" +
      "施法者法力設為剛好夠付，使自我回魔也量得到。被動回血（RegenSystem）不發 `heal` 事件，故不會誤判。",
  );
  L.push(
    `- 每次施放後步進 **${WINDOW} tick**（涵蓋 0.8s=24 tick 以內的施法前搖）讓有前搖的技能結算；普攻給 **${BASIC_WINDOW} tick** 讓第一次揮擊落地。` +
      "\n- ⚠️ **已知量測盲點**：全樹最長前搖是 `godie-u00n.r`／`godie-u00o.r` 的 **0.9s = 27 tick**，比本觀測窗多 1 tick，" +
      "所以下方唯一那格 ❌ 很可能是「觀測太早收手」而非技能真的沒效果。改 WINDOW 會改變量測定義，歸 #128／#198 處理，本次不動。",
  );
  L.push(
    `- **完整跑遍全 ${results.length} 英雄 × ${cols.length} 槽 = ${totalCells} 格，無抽樣**。`,
  );
  L.push(
    `- **會變紅的七道閘**（都只看版控名單那 ${ROSTER_SIZE} 人，營運額外開放的英雄不影響）：` +
      `(1) 掃描必須跑完 ${ROSTER_SIZE}×${cols.length}；(2) ${ROSTER_SIZE} 位英雄全部要能生成；` +
      `(3) 可用格數（✅+🟣）佔比不得低於 **${(WORKING_CELL_RATIO_FLOOR * 100).toFixed(2)}%**（棘輪下限，比例不是絕對值 —— 名單長度會變）；` +
      "(4) **逐格釘死的缺口名單**（`KNOWN_GAPS`）：冒出名單外的新缺口會紅、名單上的缺口修好了沒劃掉會紅、" +
      "同一格從 ❌ 變 🟡（或反過來）也會紅 —— 替一支空技能補個特效不是修好它；" +
      "(5) **形態閘名單**（`FORM_GATED_CELLS`，三個方向，GH#412）；" +
      "(6) **seed 依賴名單**（`SEED_DEPENDENT_CELLS`，三個方向，GH#407）；" +
      "(7) **跨 seed 量測儀器本身要活著** —— 一格都沒被跨 seed 量過就是偵測器壞了，那會讓 (6) 結構上永遠綠。" +
      "個別既知 no-op 不會使測試變紅（它們是要回報的發現，列在上方兩張表），但既有可用的格子被改壞會。",
  );
  L.push("");

  writeFileSync(REPORT, L.join("\n"), "utf8");
}
