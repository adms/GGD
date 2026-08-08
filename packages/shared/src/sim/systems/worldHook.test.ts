/**
 * `worldHookSystem` 的行為守衛 —— 事件流上的世界時刻真的送得到卡片手上。
 *
 * ── 只釘兩條，因為這支系統只有兩種列 ────────────────────────────────────
 *
 *  ① `scope:"world"` —— 廣播給場上活人，**死人收不到**。
 *     兩個方向一起讀：只驗「活人收到」的話，一個「發給所有人」的實作照樣過，
 *     而那正是「趴著等王」變成策略的那個缺陷（失敗形態④）。
 *
 *  ② `scope:"actor"` —— ⚠️ 迴避那一列的 `actorKey`/`targetKey` 是**反的**
 *     （持有者＝閃掉的人，target＝攻擊者）。照抄別列會把卡片掛到攻擊者身上，
 *     而畫面上兩者都是「有人閃了一下」，看不出差別。
 *
 * ── 為什麼不逐一驗六列 ──────────────────────────────────────────────────
 * 六列走的是**同一個迴圈**，差別只有表上的參數。逐列再抄一份斷言驗的是同一段
 * 程式碼的第六份複本 —— 那不是覆蓋，是重複（CLAUDE.md 第零守則⑦）。
 * 表格本身由 TypeScript 的 `HookEvent` union 守著：打錯 hook 名編譯就紅。
 *
 * 突變紀錄（都真的做過，見 commit message）:
 *   · `WorldHookSystem.ts` 的 `scope === "world"` 那一支整段刪掉 → wh-world 紅
 *   · 迴避那一列的 `actorKey`/`targetKey` 對調                  → wh-evade-owner 紅
 *
 * ── GH#300 的四個新時刻（2026-08-09）—— 一個時刻一條，四條各一次突變 ────
 *   · `effects/shield.ts` 的 `emit("shieldGained")` 拿掉      → wh-shield-gained 紅
 *   · `WORLD_HOOKS` 的 `guardBreak` 那一列拿掉                → wh-shield-broken 紅
 *   · `WORLD_HOOKS` 的 `onAllyDeath` 那一列拿掉               → wh-ally-death 紅
 *   · `effects/applyStatus.ts` 的 `emit("statusApplied")` 拿掉 → wh-status-applied 紅
 * 四條各自只紅自己那一條（其餘 7 綠），所以它們沒有互相代打。
 *
 * ⭐ 四條都**跑出貨那條路**（真的施法／真的挨一發封包走完 `step()`／真的死），
 * 不是斷言 `world.emit` 被呼叫過 —— 後者對「事件發了但 `fireHooks` 的存活閘把它
 * 吃掉」是綠的，而那正是 #293 的形狀。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { attachSource } from "../stats/statPipeline";
import { worldHookSystem } from "./WorldHookSystem";
import { deathSystem } from "./DeathSystem";
import { reviveSystem } from "./ReviveSystem";
import { beginCombatRevives } from "../revive";
import { fireHooks } from "../effects/hooks";
import { runEffects } from "../effects/effectRunner";
import { addShield } from "../combat/damage";
import type { HookDef, HookEvent } from "../stats/modifiers";
import type { EffectDef } from "../effects/effect";
import type { IntentFrame } from "../intents";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../../ids";

const NO_INTENTS: ReadonlyMap<SeatId, IntentFrame> = new Map();

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;

function stage(): SimWorld {
  const w = new SimWorld(SKELETON_ARENA, 4);
  w.combatActive = true; // 整支系統的第一道閘
  return w;
}

function hero(w: SimWorld, seat: number, team: number): EntityId {
  return spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: C.x + seat, z: C.z },
    zone: 0,
  });
}

/**
 * 一張「這個時刻發生時，在**自己**身上蓋一個記號」的卡。
 * ⚠️ 用 `applyStatus` 而不是治療：治療要跟自然回血比大小，而那條路 2026-08-05
 * 已經騙過一次守衛（`reflectHook.test.ts` 檔頭）。記號沒有雜訊。
 */
function markCard(on: HookEvent, statusId: string): HookDef {
  return {
    on,
    target: "self",
    effects: [
      { kind: "applyStatus", statusId, durationSec: 30, moveSpeedMult: 1 } as unknown as EffectDef,
    ],
  } as HookDef;
}

function marks(w: SimWorld, id: EntityId): string[] {
  return (w.status.get(id)?.effects ?? []).map((e) => String(e.statusId)).sort();
}

describe("worldHookSystem —— 事件流 → hook 廣播", () => {
  it("⛔ 世界時刻廣播給活人,而死人收不到", () => {
    cover("wh-world");
    const w = stage();
    const alive = hero(w, 0, 0);
    const dead = hero(w, 1, 0);
    for (const id of [alive, dead]) {
      attachSource(w, id, { id: `src:${id}`, kind: "item", hooks: [markCard("onBossSpawn", "saw-boss")] });
    }
    w.health.get(dead)!.alive = false;

    w.emit("mobBossSpawn", { id: 999, zone: 0 });
    worldHookSystem(w);

    // ⛔ 兩個方向一起讀。只驗上面那行的話,「發給所有人」也會過。
    expect(marks(w, alive)).toEqual(["saw-boss"]);
    expect(marks(w, dead)).toEqual([]);
  });

  it("⛔ 迴避的持有者是**閃掉的那個**,不是攻擊者", () => {
    cover("wh-evade-owner");
    const w = stage();
    const evader = hero(w, 0, 0);
    const attacker = hero(w, 1, 1);
    for (const id of [evader, attacker]) {
      attachSource(w, id, { id: `src:${id}`, kind: "item", hooks: [markCard("onEvade", "dodged")] });
    }

    // `combat/evasion.ts` 的形狀:source = 攻擊者, target = 閃掉的人。
    w.emit("evade", { source: attacker, target: evader, x: 0, z: 0 });
    worldHookSystem(w);

    expect(marks(w, evader)).toEqual(["dodged"]);
    expect(marks(w, attacker)).toEqual([]);
  });

  it("⛔ #293 死亡時發得出去（持有者已經死了），而死者的其他 hook 仍然不響", () => {
    cover("wh-death-owner-dead");
    const w = stage();
    const victim = hero(w, 0, 0);
    const killer = hero(w, 1, 1);
    attachSource(w, victim, {
      id: "src:victim",
      kind: "item",
      hooks: [markCard("onDeath", "died"), markCard("onDamageTaken", "hurt")],
    });

    // 出貨那條路:`DeathSystem`（slot 9）**先**寫 alive=false 才 emit，
    // `worldHookSystem`（9f）晚它一步 —— 這個順序就是 #293 的全部。
    w.health.get(victim)!.hp = 0;
    deathSystem(w);
    expect(w.health.get(victim)!.alive).toBe(false); // 這條守衛的前提，不是結論
    worldHookSystem(w);
    expect(marks(w, victim)).toEqual(["died"]);

    // ⛔ 反向:存活閘還在。少了這一段，「把 fireHooks 的存活閘整個刪掉」
    // 也會讓上面那行變綠 —— 而那會讓屍體繼續吃 AoE 觸發被動。
    fireHooks(w, victim, "onDamageTaken", killer);
    expect(marks(w, victim)).toEqual(["died"]);
  });

  it("⛔ #294 復活時掛在被復活的人身上 —— 走真的復活圈那條路", () => {
    cover("wh-revive-owner");
    const w = stage();
    const victim = hero(w, 0, 0);
    const rescuer = hero(w, 1, 0); // 站在屍體旁 1u，在 radius 內
    for (const id of [victim, rescuer]) {
      attachSource(w, id, { id: `src:${id}`, kind: "item", hooks: [markCard("onRevive", "back")] });
    }
    // 夾具值（不是出貨值）:channelTicks 1 讓一個 tick 就完成詠唱。
    beginCombatRevives(
      w,
      { channelTicks: 1, radius: 2, decayMult: 2, revivesPerTeamPerRound: 1,
        reviveHpPctMax: 0.5, reviveManaPctMax: 0.5, contestPauses: true,
        damageInterrupts: false, ccInterrupts: true },
      [asTeamId(0)],
    );

    w.health.get(victim)!.hp = 0;
    deathSystem(w); //   9  —— emit death
    reviveSystem(w); //  9c —— 落下圈圈、隊友詠唱完成 → emit reviveComplete
    worldHookSystem(w); // 9f

    // `reviveComplete.id` 是**圈圈**（發完就 destroy），只有 `ownerId` 是英雄。
    expect(marks(w, victim)).toEqual(["back"]);
    expect(marks(w, rescuer)).toEqual([]); // 也不是頂著圈圈的那位
  });

  // ── GH#300 的四個新時刻 ────────────────────────────────────────────────
  // ⭐ 每一條都**真的跑出貨那條路**（真的施法／真的挨一發封包／真的死），
  // 不是斷言 `world.emit` 被呼叫 —— 後者對「發了但 fireHooks 吃掉」是綠的。
  // 突變紀錄見檔尾。

  it("⛔ 護盾產生時發給拿到盾的人,不是給盾的人", () => {
    cover("wh-shield-gained");
    const w = stage();
    const giver = hero(w, 0, 0);
    const ally = hero(w, 1, 0);
    for (const id of [giver, ally]) {
      attachSource(w, id, { id: `src:${id}`, kind: "item", hooks: [markCard("onShieldGained", "barrier")] });
    }
    // 真的跑出貨的 `shield` effect（不是手寫 emit）。
    runEffects([{ kind: "shield", amount: { flat: 100 }, duration: 5 } as EffectDef], {
      world: w, caster: giver, rank: 1, targets: [ally], origin: "ability:test.shield", rng: w.rng,
    });
    worldHookSystem(w);
    expect(marks(w, ally)).toEqual(["barrier"]);
    expect(marks(w, giver)).toEqual([]); // 持有者是收盾的那個
  });

  it("⛔ 護盾破碎只在真的被打空那一發,還有剩不算", () => {
    cover("wh-shield-broken");
    const w = stage();
    const victim = hero(w, 0, 0);
    const attacker = hero(w, 1, 1);
    attachSource(w, victim, { id: "src:v", kind: "item", hooks: [markCard("onShieldBroken", "shattered")] });
    addShield(w, victim, 100, 30, "ability:test.shield");

    // ① 打不破 → 不響。⛔ 少了這一段,「每一發傷害都發」也會讓②變綠。
    w.damageQueue.push({ source: attacker, target: victim, amount: 10, type: "physical", crit: false, origin: "basic" });
    w.step(NO_INTENTS);
    expect(marks(w, victim)).toEqual([]);

    // ② 打空 → 響。走完整 step()，所以 guardBreak(8) → worldHookSystem(9f)
    //    的槽位順序也一起被驗到。
    w.damageQueue.push({ source: attacker, target: victim, amount: 500, type: "physical", crit: false, origin: "basic" });
    w.step(NO_INTENTS);
    expect(marks(w, victim)).toEqual(["shattered"]);
  });

  it("⛔ 隊友陣亡發給活著的隊友,死者自己與敵人都收不到", () => {
    cover("wh-ally-death");
    const w = stage();
    const victim = hero(w, 0, 0);
    const ally = hero(w, 1, 0);
    const enemy = hero(w, 2, 1);
    for (const id of [victim, ally, enemy]) {
      attachSource(w, id, { id: `src:${id}`, kind: "item", hooks: [markCard("onAllyDeath", "avenge")] });
    }
    w.health.get(victim)!.hp = 0;
    deathSystem(w); //    9
    worldHookSystem(w); // 9f
    expect(marks(w, ally)).toEqual(["avenge"]);
    // ⛔ 兩個反向一起讀:少了它們,「發給全場」與「發給死者本人（＝onDeath）」
    // 兩種壞掉的實作都會讓上面那行變綠。
    expect(marks(w, victim)).toEqual([]);
    expect(marks(w, enemy)).toEqual([]);
  });

  it("⛔ 狀態掛上時發一次,續期不重發", () => {
    cover("wh-status-applied");
    const w = stage();
    const caster = hero(w, 0, 1);
    const target = hero(w, 1, 0);
    attachSource(w, target, { id: "src:t", kind: "item", hooks: [markCard("onStatusApplied", "reacted")] });
    const slow: EffectDef = { kind: "applyStatus", statusId: "slow-test", duration: 9, moveSpeedMult: 0.5 } as unknown as EffectDef;
    const ctx = { world: w, caster, rank: 1, targets: [target], origin: "ability:test.cc", rng: w.rng };

    runEffects([slow], ctx);
    worldHookSystem(w);
    expect(marks(w, target)).toEqual(["reacted", "slow-test"]);

    // 續期同一筆（同 statusId + 同 origin）→ ⛔ 不可以再發一次。記號卡自己會
    // 被續期而不是新增,所以計數改看事件流。
    w.events.length = 0;
    runEffects([slow], ctx);
    expect(w.events.filter((e) => e.type === "statusApplied")).toHaveLength(0);
  });
});
