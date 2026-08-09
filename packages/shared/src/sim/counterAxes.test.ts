/**
 * 疊層的三條軸（GH#304，owner 2026-08-09「隨觸發／隨時間／隨回合 增加/減少」）
 * —— 一條軸一條承重的線，外加一條相容性。
 *
 * ── 為什麼四條就夠 ────────────────────────────────────────────────────────
 * 三條軸在**寫入端**是同一支函式（`marks.adjustMarkCount`），差別只有「誰去
 * 呼叫它」。所以這裡驗的是那三個呼叫路徑真的通，不是同一段夾取邏輯驗三次。
 *
 * ⛔ **一個數字都不釘**：12 層 / 10% 每層 / 3 秒週期一個都沒有寫進斷言
 *（第零守則⑦）。驗的是「層數會不會動」「動的方向對不對」「是不是每 N 秒
 * 動一次而不是每 tick」——機制，不是數值。
 *
 * ⭐ 三條都跑**真的東西**：軸①走出貨的 `fireHooks` → `runEffects` →
 * `EFFECT_HANDLERS.applyStatus`；軸②走真的 `world.step()`（`IntervalHookSystem`
 * → `HookDef.internalCooldown`）；軸③走出貨的 `resetMarksForRound`，也就是
 * `MatchController.enterCombat` 呼叫的那一支。⛔ 沒有任何一條在手寫預期狀態
 *（失敗形態⑤：被測的不是出貨的那個）。
 *
 * 突變紀錄（四個都真的做過，見 commit message）：
 *   ① `effects/applyStatus.ts` 的 mark 路由整段（`adjustMarkCount` + `continue`）
 *      刪掉                → axis-trigger 紅（標記停在 3，層數長在一筆假的
 *                             status 上 —— 正是這條軸要擋的「假層數」）
 *   ② 夾具的 `internalCooldown` 拿掉 → axis-time 紅（一秒掉 30 層不是 1 層）
 *   ③ `marks.ts` 的 `if (st.roundDelta !== 0) { adjustMarkCount(...) }` 刪掉
 *                          → axis-round 紅（層數不動）
 *   ④ `marks.ts` 的 `st.spent += -applied` 刪掉 → compat 紅（永久加成沒長）
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { installMark, markCount, markSpent, resetMarksForRound } from "./marks";
import type { MarkSpec } from "./marks";
import { fireHooks } from "./effects/hooks";
import { statusStacks } from "./effects/effectCommon";
import { MARK_DURATION_PERMANENT } from "./markLimits";
import { ModOp } from "./stats/modifiers";
import type { HookDef } from "./stats/modifiers";
import { Stat } from "./stats/statTypes";
import type { IntentFrame } from "./intents";
import {
  asSeatId,
  asTeamId,
  type ChampionId,
  type EntityId,
  type SeatId,
  type StatusId,
} from "../ids";

beforeAll(() => registerSkeletonContent());

const NO_INTENTS: ReadonlyMap<SeatId, IntentFrame> = new Map();
const Z0 = SKELETON_ARENA.zones[0]!;
/** 計數器的身分 = 一份既有文件的 id（`sim/marks.ts` ②）。 */
const COUNTER = "godie-hapm.passive" as StatusId;

function rig(): { world: SimWorld; hero: EntityId; foe: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 20260809);
  world.combatActive = true;
  const mk = (seat: number, team: number): EntityId =>
    spawnChampion(world, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(seat),
      teamId: asTeamId(team),
      pos: { x: Z0.center.x + seat, z: Z0.center.z + 14 },
      zone: 0,
    });
  return { world, hero: mk(0, 0), foe: mk(1, 1) };
}

function counter(over: Partial<MarkSpec> = {}): MarkSpec {
  return {
    markId: COUNTER,
    initial: 3,
    max: 5,
    durationSec: MARK_DURATION_PERMANENT,
    resetOn: "match",
    ...over,
  };
}

/** 把一條 hook 掛到持有者身上，走 `StatsComp.sources` —— 出貨的天生技走同一格。 */
function armHook(world: SimWorld, id: EntityId, hook: HookDef): void {
  world.stats.get(id)!.sources.push({ id: "test:counter", kind: "passive", hooks: [hook] });
}

/** 「計數器 ±N」在內容側的樣子 —— 三條軸共用的**同一個** effect。 */
function adjust(stacks: number): HookDef["effects"][number] {
  return {
    kind: "applyStatus",
    statusId: COUNTER,
    duration: 1,
    applyTo: "self",
    stacks,
    refresh: "keep",
  };
}

describe("疊層的三條軸（GH#304）", () => {
  it("軸①【隨觸發】—— 掛在 hook 上就是 ±N，而且動到的是**真的那個計數器**", () => {
    cover("counter-axis-trigger");
    const { world, hero, foe } = rig();
    installMark(world, hero, counter());
    armHook(world, hero, { on: "onBasicAttack", target: "self", effects: [adjust(1)] });

    fireHooks(world, hero, "onBasicAttack", foe);

    // 方向 ①：層數真的長了。
    expect(markCount(world, hero, COUNTER)).toBe(4);
    // 方向 ②（承重的那一半）：它長在**標記**上，沒有在旁邊長出一份平行的
    // status 層數。少了路由，上面那條斷言仍然可以由一筆假的 status 滿足，
    // 而免死／`perStackLost` 讀的是標記 —— 那一層會是看得到、用不到的。
    const parallel = world.status.get(hero)?.effects.some((s) => s.statusId === COUNTER);
    expect(parallel ?? false).toBe(false);
    // 而「問層數」的那一顆條件葉讀得到它（合併的讀取端）。
    expect(statusStacks(world, hero, COUNTER)).toBe(4);
  });

  it("軸①【隨觸發】—— 負數就是減層，而且撞到 0 就停", () => {
    cover("counter-axis-trigger-down");
    const { world, hero, foe } = rig();
    installMark(world, hero, counter({ initial: 1 }));
    armHook(world, hero, { on: "onDamageTaken", target: "self", effects: [adjust(-1)] });

    fireHooks(world, hero, "onDamageTaken", foe);
    expect(markCount(world, hero, COUNTER)).toBe(0);
    // 第二次觸發不會變成負數，也不會再記一次「失去一層」。
    fireHooks(world, hero, "onDamageTaken", foe);
    expect(markCount(world, hero, COUNTER)).toBe(0);
    expect(markSpent(world, hero, COUNTER)).toBe(1);
  });

  it("軸②【隨時間】—— 每 N 秒 ±M，不是每 tick（真的 step 一秒）", () => {
    cover("counter-axis-time");
    const { world, hero } = rig();
    installMark(world, hero, counter({ initial: 5 }));
    // ⭐ 節奏由 `internalCooldown` 表達，不是由第二個「每 N 秒」欄位表達
    //（`systems/IntervalHookSystem.ts` 決策 1）。
    armHook(world, hero, {
      on: "onInterval",
      target: "self",
      internalCooldown: 1,
      effects: [adjust(-1)],
    });

    const ticksPerSecond = Math.round(1 / world.dt);
    for (let i = 0; i < ticksPerSecond; i++) world.step(NO_INTENTS);

    // ⛔ 機制斷言：一秒之內**動了，而且只動了一次**。少了 ICD 這條軸會是
    // 每 tick 一層（30×），而那在畫面上只看得出「怎麼一瞬間就空了」。
    const after = markCount(world, hero, COUNTER);
    expect(after).toBeLessThan(5);
    expect(after).toBe(4);
  });

  it("軸③【隨回合】—— 回合邊界 ±N，而且 `resetOn:\"round\"` 的補滿沒有被它取代", () => {
    cover("counter-axis-round");
    const { world, hero, foe } = rig();
    // 同一個世界上兩個持有者、兩種政策 —— 兩條路要各走各的。
    installMark(world, hero, counter({ initial: 3, roundDelta: -1 }));
    installMark(world, foe, counter({ initial: 3, max: 5, resetOn: "round" }));
    // 讓 foe 先花掉一層，才看得出「補回 initial」真的發生。
    world.marks.get(foe)!.get(COUNTER)!.count = 1;

    resetMarksForRound(world);

    expect(markCount(world, hero, COUNTER)).toBe(2); // ±N
    expect(markCount(world, foe, COUNTER)).toBe(3); // 補回 initial
    // 掉層要記帳（永久加成的分母），補滿不記帳。
    expect(markSpent(world, hero, COUNTER)).toBe(1);
    expect(markSpent(world, foe, COUNTER)).toBe(0);
  });

  it("相容性 —— 十二道試煉那一組設定（永久 · match · perStackLost）行為不變", () => {
    cover("counter-compat-trial");
    const { world, hero } = rig();
    const trial = counter({
      initial: 3,
      max: 3,
      resetOn: "match",
      perStackLost: [{ stat: Stat.AttackDamage, op: ModOp.PercentAdd, value: 0.1 }],
    });
    installMark(world, hero, trial);
    world.step(NO_INTENTS);
    const adBefore = world.stats.get(hero)!.final[Stat.AttackDamage];

    // ① 跨回合共享：`resetOn:"match"` 且沒有 `roundDelta` → 回合邊界一層都不動。
    world.marks.get(hero)!.get(COUNTER)!.count = 1;
    resetMarksForRound(world);
    expect(markCount(world, hero, COUNTER)).toBe(1);

    // ② 「每失去一層永久提升」要真的到得了 `final`（失敗形態②）。
    armHook(world, hero, { on: "onDamageTaken", target: "self", effects: [adjust(-1)] });
    fireHooks(world, hero, "onDamageTaken");
    world.step(NO_INTENTS);
    expect(markSpent(world, hero, COUNTER)).toBe(1);
    expect(world.stats.get(hero)!.final[Stat.AttackDamage]).toBeGreaterThan(adBefore);
  });
});
