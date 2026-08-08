/**
 * `onReflectSuccess` 的 **provenance 與 child chain** 守衛（2026-08-08）。
 *
 * `reflectHook.test.ts` 守的是「這一發**算不算**反彈成功」。這一檔守的是它之後
 * 的那一半 —— **事件有沒有把那一發反彈封包交給 hook 的效果**。
 *
 * ⛔ 為什麼這是一條獨立的承重線：`ReflectHookSystem` 少傳最後一個參數
 *（`ev.incoming`），`damage.incomingPct` 會走 `ctx.incoming === undefined` 的
 * early-return，於是 20-002「[反彈]成功時…每次造成 7 倍[反彈]傷害」**整條靜默
 * 變成 0**。事件照發、卡片照顯示、一條錯誤訊息都沒有 —— 失敗形態 ②。
 *
 * ── 兩個方向 ────────────────────────────────────────────────────────────
 *  ① 被反彈的那一發**真的**讓持有者的 child chain 打出傷害（且打在攻擊者身上
 *     —— 那就是「防禦者持有、攻擊者是 target」這個方向本身）。
 *  ② 沒有反彈的世界，同一張卡**一點傷害都不出**。
 *
 * ── ⭐ 它讀的是「反彈傷害」，不是「原傷害」 ──────────────────────────────
 * 這是 provenance 唯一有辦法被證明的方式，而且**不需要把任何出貨數值寫進斷言**：
 * 兩個世界只差在**反彈百分比**，原傷害一模一樣。`incoming` 若是原傷害，兩邊的
 * child chain 會打出同一個數；是反彈封包，才會跟著百分比走。
 *
 * 突變紀錄（都真的做過）:
 *   · `ReflectHookSystem` 的 `ev.incoming` 參數拿掉 → refl-provenance-child-chain 紅
 *   · `combat/damage.ts` push 的 `incoming: trigger` 換成觸發它的原封包 →
 *     refl-provenance-is-the-reflect 紅（另一條照樣綠，所以兩條都要）
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { combatResolveSystem } from "../combat/damage";
import { normalizeCombatEnv } from "../combatEnv";
import { attachSource } from "../stats/statPipeline";
import type { HookDef } from "../stats/modifiers";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

beforeAll(() => registerSkeletonContent());

const CENTER = SKELETON_ARENA.zones[0]!.center;

function hero(w: SimWorld, seat: number, team: number): EntityId {
  return spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: CENTER.x + seat, z: CENTER.z },
    zone: 0,
  });
}

/**
 * 一次完整的實驗，回傳**攻擊者**掉了多少血。
 *
 * `reflectPct` = 防禦者的反彈百分比（`undefined` = 完全不反彈）。
 * `card` = 要不要掛那張 `onReflectSuccess` 卡。
 *
 * ⚠️ 卡上的 `maxChainDepth: 1` 不是裝飾：反彈封包的 `reflectDepth` 已經是 1，
 * 省略（＝0）會被鏈深閘擋掉。那正是終止性在做它的事 —— 這張卡打出來的封包是
 * 深度 2，下一輪 `2 > 1` 就停了。
 */
function attackerHpLost(reflectPct: number | undefined, card: boolean): number {
  const w = new SimWorld(SKELETON_ARENA, 1);
  w.combatEnv = normalizeCombatEnv({ damageDealt: 1 });
  const attacker = hero(w, 0, 0);
  const victim = hero(w, 1, 1);

  const hooks: HookDef[] = [];
  if (reflectPct !== undefined) {
    hooks.push({
      on: "onDamageTaken",
      effects: [
        {
          kind: "damage",
          damageType: "true",
          amount: { flat: 0 },
          incomingPct: { perRank: [reflectPct] },
        },
      ],
    });
  }
  if (card) {
    hooks.push({
      on: "onReflectSuccess", // target 省略 = 事件的對象 = 攻擊者
      effects: [
        {
          kind: "damage",
          damageType: "true",
          amount: { flat: 0 },
          incomingPct: { perRank: [1], maxChainDepth: 1 },
        },
      ],
    });
  }
  attachSource(w, victim, { id: "src:reflect", kind: "item", hooks });

  const hp = w.health.get(attacker)!;
  hp.hp = hp.maxHp * 0.5; // 挖坑，讓掉的血不會被 maxHp 夾掉
  const before = hp.hp;

  w.damageQueue.push({
    source: attacker,
    target: victim,
    amount: 200,
    type: "physical",
    crit: false,
    origin: "basic",
  });
  combatResolveSystem(w);
  // ReflectHookSystem 在 step 裡跑（8b），它排出來的封包下一 tick 才落地。
  w.step(new Map());
  w.step(new Map());
  return before - hp.hp;
}

describe("onReflectSuccess —— provenance 真的到得了 child chain", () => {
  it("★ 被反彈的那一發讓 child chain 打出傷害；沒反彈的世界一點都不出", () => {
    cover("refl-provenance-child-chain");
    // ① 該發的發了：同樣有反彈，多掛一張卡就多掉一截血（打在攻擊者身上）。
    const withCard = attackerHpLost(0.5, true);
    const noCard = attackerHpLost(0.5, false);
    expect(withCard - noCard).toBeGreaterThan(0);

    // ② ⛔ 該不發的沒發：沒有反彈 hook，只有那張卡 → 攻擊者身上**一點差別都沒有**。
    //    少了這一條，一個「每次被打都發」的實作也會過（失敗形態 ④）。
    //    ⚠️ 讀的是 A/B 差額而不是「掉了 0 血」—— 兩個世界都在跑自然回血，
    //    絕對值是個微負數；差額才是那張卡的貢獻。
    expect(attackerHpLost(undefined, true) - attackerHpLost(undefined, false)).toBe(0);
  });

  it("★ 它交給 child chain 的是【反彈傷害】，不是【原傷害】", () => {
    cover("refl-provenance-is-the-reflect");
    // 兩個世界的**原傷害完全相同**，只差在反彈百分比。
    // `incoming` 若被換成觸發它的那一發原封包，下面兩個差額會相等 —— 那正是突變。
    const child = (pct: number): number => attackerHpLost(pct, true) - attackerHpLost(pct, false);
    expect(child(1)).toBeGreaterThan(child(0.25));
  });
});
