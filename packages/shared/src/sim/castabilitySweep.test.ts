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
 * runs, so three gates hold over the tracked roster:
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
 * {@link KNOWN_FAILS} 是逐格釘死的名單，**多一格或少一格都紅**。
 * 比例棘輪從此是第二道防線，⛔ 兩道都不可以為了讓紅的變綠而放寬。
 */
const WORKING_CELL_RATIO_FLOOR = 0.9766;

/**
 * ⭐ 首發名單上**今天量到的每一格 ❌**，一格一列（GH#374）。
 *
 * ⛔ 這不是「這樣沒關係」的清單，是一張帳：修好一格就把那一列刪掉。
 * **兩個方向都會紅** —— 冒出名單外的新 ❌ 會紅（有人把一格改壞了），
 * 名單上的某一格不再 ❌ 也會紅（修好了就要劃掉）。
 * 這正是 `content/abilityNoOpEffects.test.ts` 那張 KNOWN 名單的形狀，
 * 而它比一個比例底線嚴格得多：比例可以被「一邊修好一格、一邊弄壞一格」騙過去。
 *
 * ⚠️ 只釘**版控名單**那 49 人 —— 營運白名單與骨架英雄是機器狀態／示範資料，
 * 釘它們會讓這條閘在別人的 clone 上意義不同。
 */
const KNOWN_FAILS: readonly { key: string; why: string }[] = [
  { key: "godie-e00r|Q", why: "初號機 Q：接受施放但量不到效果（#128 舊有）" },
  { key: "godie-e00s|R", why: "白木卡迪那 R：整棵樹只有 spawnVfx —— GH#374 洞②抓到的第一格真 no-op" },
  { key: "godie-efur|R", why: "揍敵客桀諾 R：接受施放但量不到效果（#128 舊有）" },
  { key: "godie-emns|E", why: "夜神月 E：接受施放但量不到效果（#128 舊有）" },
  { key: "godie-emns|R", why: "夜神月 R：接受施放但量不到效果（#128 舊有）" },
  { key: "godie-emns|EX", why: "夜神月 EX：接受施放但量不到效果（#128 舊有）" },
  {
    key: "godie-h01n|EX",
    why: "黑崎一護 EX 79-002 虛化：rank 帶 whileForm:\"alternate\"，本體形態下本來就不掛來源 —— 已知的量測侷限（#128 舊有）",
  },
  {
    key: "godie-u00k|PASSIVE",
    why:
      "死之王 71-00 暗夜契約：`passive.ranks[0].modifiers` 是空的，機制整包住在專屬的 `sim/nightPact.ts`（旗子要等有人陣亡才立起來）。" +
      "⇒ 通用量測看不到它，而那本身就是第〇·五守則要講的事：一支靠專屬系統活著的技能，在「技能＝JSON 模板組合」的尺上量起來是空的。",
  },
];
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
type Verdict = "PASS" | "FAIL" | "PASSIVE" | "NONE";
interface Cell {
  verdict: Verdict;
  channel?: string; // what fired (for PASS/PASSIVE); absent on FAIL
  castType?: CastType;
  reason?: string; // why it failed / extra note
}
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

/** Broad snapshot of the effect-bearing channels regen/movement cannot spoof. */
function snapshot(world: SimWorld): {
  shields: number;
  statuses: number;
  buffs: number;
  projectiles: number;
  taunts: number;
} {
  let shields = 0;
  for (const hp of world.health.values()) shields += hp.shields.length;
  let statuses = 0;
  for (const st of world.status.values()) statuses += st.effects.length;
  let buffs = 0;
  for (const sc of world.stats.values()) buffs += sc.sources.filter((s) => s.kind === "buff").length;
  // ⭐ 2026-08-18 —— 【嘲弄】是**第五個**看得見的頻道。
  //
  // ⚠️ 它在此之前是量測盲點，而那是這份 sweep 自己的檔頭警告過的形態
  // （「THIS LIST IS THE MEASURING INSTRUMENT，漏掉一個 kind 是假 ❌ 不是內容缺陷」，
  // `championForm` 已經踩過一次）：`taunt` 既不發事件、也不是護盾／狀態／buff／
  // 投射物 —— 它寫的是 `world.taunt`（受害者 → 被迫打誰、到哪一絕對 tick）。
  // 於是 86-00 裝可愛接上真的嘲弄之後，這裡照樣回報「只有特效」。
  // ⛔ 它不可能被回血／移動偽造：唯一的寫入者是 `sim/taunt.ts::applyTaunt`。
  return { shields, statuses, buffs, projectiles: world.projectile.size, taunts: world.taunt.size };
}

/**
 * Events that constitute "a real effect happened" (excludes abilityCast/castBegin).
 *
 * THIS LIST IS THE MEASURING INSTRUMENT, and a kind missing from it is a FALSE
 * ❌, not a content bug. `championForm` (task #249 變身) is the case that proved
 * it: the moment 妖狐變化 / ChangeDNA / 瘋狂皮卡丘 were bound to the real body
 * swap, all three measured "cast accepted but produced no measurable effect" —
 * the swap rewrites `ChampionComp.championId` + `StatsComp.championId` and
 * emits `championForm`, and NONE of `snapshot()`'s four counters can see that
 * (no shield, no status, no buff source, no projectile, and the body does not
 * move). So a working transform read as a broken slot.
 *
 * The bar for adding a kind here is the same one the original six meet: the
 * event fires ONLY from an effect actually resolving, never from regen, upkeep
 * or movement. `championForm` is emitted from exactly one place —
 * `ChampionFormSystem.setBody` — so it cannot be spoofed by anything else.
 */
const EFFECT_EVENTS = new Set([
  "damage",
  "heal",
  "manaRestore",
  "projectileSpawn",
  "knockdown",
  "championForm",
]);

/**
 * ⛔ **`vfxSpawn` 被刻意從上面那張表拿掉了**（2026-08-18 / GH#374 洞②）。
 *
 * 這份 sweep 問的是「按下去**有沒有真的產生效果**」。`vfxSpawn` 唯一保證的是
 * **畫面上有東西**，而一支只有畫面的技能逐位元改不動任何一個數字 —— 把它算成
 * ✅ 等於讓這份量測對 CLAUDE.md 第一·五守則整族缺陷永遠說謊。
 * 報表自己的註解早就寫著「若全靠 vfx 過關代表量測太寬鬆」，而那個數字
 * （`vfxOnly`）**沒有任何閘在看**；GH#373 的 5 支主動天生技就是這樣在
 * 全綠的測試底下上架的。
 *
 * ⚠️ `projectileSpawn` **留著**，那不是同一件事：一顆投射物是場上真的存在、
 * 會碰撞、會擋視線的實體，⛔ 不是一張貼圖。（它自己的 payload 空不空由
 * `content/abilityNoOpEffects.ts` 的 `projectile-no-payload` 那條規則管。）
 *
 * 保留這個常數只為了報表分頻道：純特效的格子現在是 ❌，而報表要說得出
 * 「它只有特效」而不是一句沒有內容的 no-op。
 */
const COSMETIC_ONLY_EVENT = "vfxSpawn";

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
function testSlot(championId: string, slot: CastableSlot): Cell {
  try {
    const world = new SimWorld(SKELETON_ARENA, 4242 + SLOTS.indexOf(slot));
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

    const target = targetFor(def, foe, ally, foePos);
    const before = snapshot(world);
    const events: string[] = [];

    const res = castAbility(world, caster, slot, target);
    if (res !== "ok") {
      return { verdict: "FAIL", castType: def.castType, reason: `cast rejected: ${res}` };
    }
    events.push(...world.events.map((e) => e.type));

    const window = WINDOW + leapWindow(def.effects) + castWindow(def.castTimeSec);
    for (let i = 0; i < window; i++) {
      world.step(NO_INTENTS);
      events.push(...world.events.map((e) => e.type));
      // re-pin the two dummies so a knockback / shove cannot carry them out of
      // a ground circle before it resolves (the caster is left free so a dash
      // effect can visibly move it).
      world.transform.get(foe)!.pos = { ...foePos };
      world.transform.get(ally)!.pos = { ...allyPos };
    }

    const after = snapshot(world);
    const moved =
      Math.hypot(
        world.transform.get(caster)!.pos.x - casterAnchor.x,
        world.transform.get(caster)!.pos.z - casterAnchor.z,
      ) > 0.2 || world.nav.get(caster)!.override != null;

    // pick the first channel that fired, for the report
    const fired = (t: string): boolean => events.includes(t);
    let channel = "";
    if (fired("damage")) channel = "damage";
    else if (fired("projectileSpawn")) channel = "projectile";
    else if (fired("heal")) channel = "heal";
    else if (fired("manaRestore")) channel = "manaRestore";
    else if (after.shields > before.shields) channel = "shield";
    else if (after.statuses > before.statuses) channel = "status";
    else if (after.buffs > before.buffs) channel = "buff";
    else if (after.taunts > before.taunts) channel = "taunt";
    else if (moved) channel = "dash";
    // 變身 (#249) sits ABOVE `vfx` for the same reason `dash` does: it is a
    // gameplay channel (the body's whole stat sheet is replaced), and the
    // report's "if everything passes on vfx the measurement is too loose" note
    // would misread it as decoration.
    else if (fired("championForm")) channel = "championForm";
    else if (fired(COSMETIC_ONLY_EVENT)) channel = "vfx";

    const anyEvent = events.some((t) => EFFECT_EVENTS.has(t));
    const anyState =
      after.shields > before.shields ||
      after.statuses > before.statuses ||
      after.buffs > before.buffs ||
      after.projectiles > before.projectiles ||
      after.taunts > before.taunts ||
      moved;

    if (anyEvent || anyState) {
      return { verdict: "PASS", castType: def.castType, channel };
    }
    return {
      verdict: "FAIL",
      castType: def.castType,
      channel: channel || undefined,
      reason:
        def.effects.length === 0
          ? "no effects authored (empty effect list)"
          : channel === "vfx"
            ? "只有特效（spawnVfx）—— 場上沒有任何一個數字改變（GH#374 洞②：vfx 不再算 PASS）"
            : "cast accepted but produced no measurable effect (no-op)",
    };
  } catch (err) {
    return { verdict: "FAIL", reason: `threw: ${(err as Error).message}` };
  }
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
        for (const slot of SLOTS) cells[slot] = testSlot(id, slot);
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
    const cells = trackedResults.reduce(
      (n, r) => n + COLS.filter((s) => r.cells[s].verdict !== "NONE").length,
      0,
    );
    expect(
      working / cells,
      `working cells (PASS + verified PASSIVE) 是 ${working}/${cells} = ` +
        `${((working / cells) * 100).toFixed(2)}%，低於 ${(WORKING_CELL_RATIO_FLOOR * 100).toFixed(2)}% 的底線 —— ` +
        "見 docs/_castability-128.md 的 FAIL 表看是哪一格退步了。" +
        "⚠️ 如果名單剛剛變短，先確認**比例**有沒有掉：絕對格數變少是分母的事，不是缺陷。",
    ).toBeGreaterThanOrEqual(WORKING_CELL_RATIO_FLOOR);

    // ---- gate 4: 逐格釘死的 ❌ 名單（GH#374，比比例棘輪嚴格）----
    // ⛔ 兩個方向都紅：名單外的新 ❌（有人改壞了）與名單上已經修好的殘留
    // （帳單變成沒有人會回頭看的白名單）。
    const live = new Set<string>();
    for (const r of trackedResults) {
      for (const slot of COLS) {
        if (r.cells[slot].verdict === "FAIL") live.add(`${r.id}|${slot}`);
      }
    }
    const known = new Set(KNOWN_FAILS.map((k) => k.key));
    expect(
      [...live].filter((k) => !known.has(k)).sort(),
      "首發名單上冒出**名單外**的 ❌ —— 有一格本來會動的技能不動了。" +
        "⛔ 修它，不要把它加進 KNOWN_FAILS（要加就先開 issue 並在那一列寫上編號）。",
    ).toEqual([]);
    expect(
      KNOWN_FAILS.filter((k) => !live.has(k.key)).map((k) => `${k.key}（${k.why}）`),
      "這幾格已經不再是 ❌ —— 修好了就把該列從 KNOWN_FAILS 刪掉。",
    ).toEqual([]);
  });
});

// ------------------------------------------------------------------- reporting

function mark(c: Cell): string {
  if (c.verdict === "PASS") return "✅";
  if (c.verdict === "PASSIVE") return "🟣";
  if (c.verdict === "NONE") return "—";
  return "❌";
}

function writeReport(): void {
  const cols = COLS;
  const totalCells = results.length * cols.length;
  let pass = 0;
  let passive = 0;
  let fail = 0;
  let none = 0;
  const failures: { id: string; name: string; slot: SlotName; cell: Cell; atk: string }[] = [];

  for (const r of results) {
    for (const slot of cols) {
      const c = r.cells[slot];
      if (c.verdict === "PASS") pass++;
      else if (c.verdict === "PASSIVE") passive++;
      else if (c.verdict === "NONE") none++;
      else {
        fail++;
        failures.push({ id: r.id, name: r.name, slot, cell: c, atk: r.attackType });
      }
    }
  }

  // channel tally over PASS cells — proves the sweep detects real gameplay
  // channels, not just the cosmetic vfxSpawn that most abilities also carry.
  const channelTally = new Map<string, number>();
  let vfxOnly = 0;
  for (const r of results) {
    for (const slot of cols) {
      const c = r.cells[slot];
      if (c.verdict === "PASS" && c.channel) {
        channelTally.set(c.channel, (channelTally.get(c.channel) ?? 0) + 1);
        if (c.channel === "vfx") vfxOnly++;
      }
    }
  }

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
      "⛔ **純特效（只有 spawnVfx）不算有效果** —— 見下方方法說明（GH#374）。",
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
  L.push("| — 無此格 | 這位英雄根本沒有這一格（原作就沒有 NN-00 天生技／骨架示範英雄沒有 EX）；不計入下方比例的分子與分母 |");
  L.push("");
  L.push("## 總計");
  L.push("");
  L.push(`- **格數**：${results.length} 英雄 × ${cols.length} 槽 = **${totalCells}**`);
  L.push(
    `- **✅ PASS：${pass} / ${totalCells}**（${((pass / totalCells) * 100).toFixed(1)}%）` +
      `　🟣 PASSIVE：${passive}　❌ FAIL：${fail}　— 無此格：${none}`,
  );
  L.push(
    `- 把「正確的永久被動」算進可接受行為：**${pass + passive} / ${totalCells}**` +
      `（${(((pass + passive) / totalCells) * 100).toFixed(1)}%）如預期運作，只有 **${fail}** 格是真正的缺口。`,
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
  L.push(`- 僅靠 \`vfx\`（純特效、無 gameplay 頻道）過關：**${vfxOnly}** 格` + (vfxOnly ? "（下方以註記標出）" : "。"));
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
    "- 「有效果」= 下列任一頻道被觸發且無例外：`damage`／`heal`／`manaRestore`／`projectileSpawn`／`knockdown`／`championForm` 事件，" +
      "或全場護盾／狀態／buff 來源／投射物數量上升，或施法者位移（dash）。" +
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
    `- **會變紅的三道閘**（都只看版控名單那 ${ROSTER_SIZE} 人，營運額外開放的英雄不影響）：` +
      `(1) 掃描必須跑完 ${ROSTER_SIZE}×${cols.length}；(2) ${ROSTER_SIZE} 位英雄全部要能生成；(3) 可用格數（✅+🟣）佔比不得低於 **${(WORKING_CELL_RATIO_FLOOR * 100).toFixed(2)}%**（棘輪下限，比例不是絕對值 —— 名單長度會變）。` +
      "個別內容 no-op 不會使測試變紅（no-op 本身就是要回報的發現，列在下方 FAIL 清單），但既有可用的格子被改壞會。",
  );
  L.push("");

  writeFileSync(REPORT, L.join("\n"), "utf8");
}
