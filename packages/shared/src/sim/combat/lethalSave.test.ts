/**
 * 免死（具名標記）的行為守衛 —— 十二道試煉真的接在出貨的傷害管線上。
 *
 * ── 只釘三條，而且三條各擋一種**已經發生過**的失敗形態 ──────────────────
 *
 *  ① **兩個方向一起讀**：帶 `lethal` 的標記救得了人，**沒帶的救不了**。
 *     只驗上面那半的話，一個「身上有任何標記就不會死」的實作照樣全綠 ——
 *     而那會讓【風王結界】【縮地】這些純計數標記全部變成免死牌（失敗形態④：
 *     斷言方向跟缺陷無關）。
 *
 *  ② **讀最終血量，不讀 EffectDef 的形狀**。整條路是 `damageQueue.push` +
 *     一次真的 `world.step()`，斷言落在 `world.health.get(id).hp` 上。
 *     一個把規則存得完美、卻沒有在扣血迴圈裡問過它的實作必須紅（失敗形態⑥/⑦）。
 *
 *  ③ **永久加成要真的到得了 `final`**。`spent` 加對了但屬性沒動 = 失敗形態②
 *     （做了但玩家拿不到）。這一條同時是 `ModOp.PercentMult` 不乘 `stacks`
 *     那個坑的守衛：`syncPerStackSource` 自己乘 `spent`，所以作者寫 `pctAdd`
 *     或 `pctMult` 都必須有效。
 *
 * ── 為什麼不驗數字 ────────────────────────────────────────────────────────
 * 12 層、10%/層、1.5 秒無敵、50% 回復**一個都沒有寫進斷言**（第零守則⑦ /
 * `ggd-no-overtesting-tuning`）—— 那些是 owner 每週在改的出貨值，抄進測試就是
 * 第四個住處。這裡驗的是**機制會不會發生**：層數有沒有掉、人有沒有活、
 * 加成有沒有進 `final`。
 *
 * 突變紀錄（都真的做過，見 commit message）:
 *   · `damage.ts` 的 `if (floor !== undefined) dmg = Math.max(0, hp.hp - floor);`
 *     整行刪掉                                              → ls-saves 紅（人死了）
 *   · `lethalSave.ts` 的 `if (rule === undefined) continue;` 刪掉
 *                                                            → ls-plain-mark 紅
 *   · `marks.ts` 的 `syncPerStackSource` 內容清空            → ls-permanent 紅
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { installMark } from "../marks";
import { ModOp } from "../stats/modifiers";
import { Stat } from "../stats/statTypes";
import { MARK_DURATION_PERMANENT } from "../markLimits";
import type { MarkSpec } from "../marks";
import type { MarkLethalRule } from "./lethalSave";
import type { IntentFrame } from "../intents";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../../ids";

beforeAll(() => registerSkeletonContent());

const NO_INTENTS: ReadonlyMap<SeatId, IntentFrame> = new Map();
const Z0 = SKELETON_ARENA.zones[0]!;

interface Rig {
  world: SimWorld;
  hero: EntityId;
  foe: EntityId;
}

function rig(): Rig {
  const world = new SimWorld(SKELETON_ARENA, 20260808);
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

/** 一個【試煉】式的標記：永久、跨回合、免死、每失去一層永久 +AD。 */
function trialSpec(lethal: boolean, over: Partial<MarkLethalRule> = {}): MarkSpec {
  return {
    markId: "godie-hapm.passive",
    initial: 3,
    max: 3,
    durationSec: MARK_DURATION_PERMANENT,
    resetOn: "match",
    perStackLost: [{ stat: Stat.AttackDamage, op: ModOp.PercentAdd, value: 0.1 }],
    ...(lethal
      ? {
          lethal: {
            consume: 1,
            surviveHpPct: 0.01,
            damageTypes: ["physical", "magic", "true"],
            internalCooldown: 0.5,
            selfEffects: [],
            aoeEffects: [],
            aoeRadius: 0,
            ...over,
          },
        }
      : {}),
  };
}

/** 灌一發保證致死的傷害，跑一個真的 tick。 */
function killShot(r: Rig): void {
  const hp = r.world.health.get(r.hero)!;
  r.world.damageQueue.push({
    source: r.foe,
    target: r.hero,
    amount: hp.maxHp * 10,
    type: "physical",
    crit: false,
    origin: "ability:test.trial",
  });
  r.world.step(NO_INTENTS);
}

describe("免死 —— 具名標記接在出貨的傷害管線上", () => {
  it("⛔ 帶 lethal 的標記救得活，而且真的扣了一層", () => {
    cover("ls-saves");
    const r = rig();
    installMark(r.world, r.hero, trialSpec(true));

    killShot(r);

    const hp = r.world.health.get(r.hero)!;
    const st = r.world.marks.get(r.hero)!.get("godie-hapm.passive")!;
    expect(hp.alive).toBe(true);
    expect(hp.hp).toBeGreaterThan(0);
    expect(st.count).toBe(2); // 3 → 2，扣了一層
    expect(st.spent).toBe(1);
  });

  it("⛔ **沒有** lethal 規則的純計數標記救不了人（風王結界不是免死牌）", () => {
    cover("ls-plain-mark");
    const r = rig();
    installMark(r.world, r.hero, trialSpec(false));

    killShot(r);

    const hp = r.world.health.get(r.hero)!;
    const st = r.world.marks.get(r.hero)!.get("godie-hapm.passive")!;
    // 兩個方向一起讀：人該死，而且層數**一層都不准動**。
    expect(hp.alive).toBe(false);
    expect(st.count).toBe(3);
    expect(st.spent).toBe(0);
  });

  /**
   * GH#306 —— owner 2026-08-09 把語意講死了：
   *
   * > 「是**到生命 0 以下，再回到 20%**，不是停在 20%」
   *
   * 所以 `"restore"` 是一個**無條件設值**：免死觸發之後血量 == floor，
   * **與觸發前的血量無關**。守衛因此驗**兩個起始血量**（60% 要降下來、
   * 5% 要升上去），而斷言是「兩次落在同一格」——
   *
   * ⛔ 這正是三種候選實作分得開的唯一斷言：
   *   · 夾取（今天的 `clamp`）    60%→floor、5%→5%      ⇒ 兩次**不**同 ⇒ 紅
   *   · 低於才補 / 無條件設值      60%→floor、5%→floor   ⇒ 兩次相同 ⇒ 綠
   *
   * 只驗 60% 那一邊，三種實作全部會過（失敗形態④）；只驗 5% 那一邊，
   * 「低於才補」與「無條件設值」仍然分不開，但至少抓得到今天的缺陷。
   * ⚠️ 斷言寫「兩次相同」而不是「等於某個數字」，因為 `step()` 會跑一個 tick
   * 的回血 —— 釘死一個數字就是把回血速率抄進測試（第二守則：驗機制不驗數字）。
   */
  it("⛔ restore 是無條件設值：60% 與 5% 起手的免死落在同一格血量", () => {
    cover("ls-restore-mode");
    const run = (
      mode: "clamp" | "restore",
      startPct: number,
    ): { hp: number; floor: number; alive: boolean } => {
      const r = rig();
      installMark(r.world, r.hero, trialSpec(true, { surviveHpPct: 0.2, restoreMode: mode }));
      const hp = r.world.health.get(r.hero)!;
      hp.hp = hp.maxHp * startPct;
      killShot(r);
      // 地板取自**引擎自己發的那則事件**，不是測試再算一次 —— 抄一份算式就是
      // 第二個住處，而它會在 maxHp 的來源改變的那一天用錯誤的訊息紅。
      const saved = r.world.events.find((e) => e.type === "lethalSaved");
      expect(saved, "免死根本沒有發生").toBeDefined();
      return { hp: hp.hp, floor: (saved!.data as { hp: number }).hp, alive: hp.alive };
    };

    // ── restore：兩個方向都要走到同一格 ────────────────────────────────
    const fromHigh = run("restore", 0.6); // 挨打前遠高於地板 → 要**降下來**
    const fromLow = run("restore", 0.05); // 挨打前遠低於地板 → 要**升上去**
    expect(fromHigh.alive && fromLow.alive, "免死沒攔住").toBe(true);
    expect(
      Math.abs(fromHigh.hp - fromLow.hp),
      "restore 的血量還跟挨打前有關 —— 那就不是「回到 20%」而是「停在 20%」",
    ).toBeLessThan(0.001);
    expect(fromLow.hp, "低血起手沒有被拉到地板").toBeGreaterThanOrEqual(fromLow.floor);

    // ── clamp（出貨預設）：owner 描述的壞掉樣子，逐字保留 ──────────────
    const clampedLow = run("clamp", 0.05);
    expect(clampedLow.alive).toBe(true);
    expect(clampedLow.hp, "clamp 竟然補血了 —— 預設語意被改掉了").toBeLessThan(clampedLow.floor);
  });

  it("⛔ 每失去一層的永久加成真的到得了 final（不是只加在 spent 上）", () => {
    cover("ls-permanent");
    const r = rig();
    installMark(r.world, r.hero, trialSpec(true));
    const before = r.world.stats.get(r.hero)!.final[Stat.AttackDamage];

    killShot(r);

    const after = r.world.stats.get(r.hero)!.final[Stat.AttackDamage];
    expect(after).toBeGreaterThan(before);
  });
});
