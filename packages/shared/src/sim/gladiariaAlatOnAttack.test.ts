/**
 * ⭐⭐ 77-03 GLADIARIA ALAT（`godie-e00x.e`）—— 展翼之後的**普攻附傷真的發生在一次普攻上**（GH#1100）。
 *
 * ⛔⛔ 在這一天之前那支技能是**一個裸的頂層 `damage`**：卡面逐字寫著
 * 「對英雄攻擊附帶額外 {{ap}}% [AP] 傷害」（＝普攻 proc），⛔ 而 JSON 裡沒有任何
 * `onBasicAttack`。⇒ 卡面說了一件不會發生的事（第一·五守則），而且 AP 係數公式
 * 把它當成一支 60 秒單體大招 ⇒ 偏離 **6.19×**（`apCoeffDeviation.test.ts`）。
 *
 * ── 階梯（第〇·六守則）的出處 ────────────────────────────────────────────────
 * · 第 3 層 JASS：`war3map.j:49669` `Trig_InshouATK_Conditions` 逐字
 *   `GetUnitTypeId(GetAttacker()) == 'E00X'`（＝展翼型態才算），
 *   `:49745` `UnitDamageTargetBJ(udg_Inshou, GetTriggerUnit(), AGI, ATTACK_TYPE_NORMAL,
 *   DAMAGE_TYPE_MAGIC)`（＝打**被攻擊的那個人**，魔法傷害）。
 * · 出貨形狀抄的是 **15-02 疾風迅雷 `godie-emfr.w`**（同型，報告逐字點名）：
 *   `applyBuff{duration, hooks:[{on:"onBasicAttack", target:"event"}]}`。
 *
 * ── 這條守衛量什麼（⛔ 不是屬性，是**被打的那個人身上的傷害事件**）────────────
 * ⭐ **兩個方向都跑**（第一守則：一把只驗過單邊的尺不算自證過）：
 *   ① 還沒按 E ⇒ 受害者身上的**魔法**傷害事件 = 0（⛔ 而普攻本身照樣在發生 —— 量尺自證）
 *   ② 按下 E ⇒ 同一個受害者身上開始出現魔法傷害事件
 * ⛔ 全程沒有手寫 payload、沒有手動呼叫 `fireHooks`：接敵、揮擊、`fireHooks(onBasicAttack)`、
 *    hook 的 `damage` 效果、傷害結算，全部是出貨管線（失敗形態⑤）。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）──────────────────────────────────────
 * M1 `content/abilities/godie-e00x.e.json` 的 `"on": "onBasicAttack"` → `"on": "onKill"`
 *    → 🔴「按下 E 之後普攻仍然沒有追加魔法傷害」（0 顆魔法傷害事件）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentStore } from "../content/store";
import { registerAll } from "../content/registries";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { castAbility } from "./abilities/abilitySystem";
import { Stat } from "./stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const C = SKELETON_ARENA.zones[0]!.center;
/** 神鳴流劍士 - 櫻綻剎那的**展翼型態**（`transform.role: "alternate"`），77-03 就住在它的 E。 */
const SETSUNA_WINGED = "godie-e00x" as ChampionId;
const DUMMY = "godie-e001" as ChampionId;

beforeAll(() => {
  const store = new ContentStore();
  for (const c of ["ability-templates", "abilities", "champions", "projectiles", "status-effects"] as const)
    for (const f of readdirSync(join(CONTENT, c)).filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
      const doc = JSON.parse(readFileSync(join(CONTENT, c, f), "utf-8")) as { id: string };
      store.add(c, doc.id, doc);
    }
  registerAll(store);
});

function rig(): { world: SimWorld; caster: EntityId; victim: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 20260907);
  const mk = (championId: ChampionId, team: 0 | 1, dx: number, seat: number): EntityId =>
    spawnChampion(world, {
      championId,
      seatId: asSeatId(seat),
      teamId: asTeamId(team),
      pos: { x: C.x + dx, z: C.z },
      zone: 0,
      level: 6,
    });
  const caster = mk(SETSUNA_WINGED, 0, -0.6, 0);
  const victim = mk(DUMMY, 1, 0.6, 1);
  for (const id of [caster, victim]) {
    const h = world.health.get(id)!;
    h.maxHp = 1e9;
    h.hp = h.maxHp;
  }
  // 護甲／魔抗歸零：這條守衛問的是「有沒有第二顆傷害」，⛔ 不是它有多大。
  for (const id of [victim]) {
    const sc = world.stats.get(id)!;
    sc.final[Stat.Armor] = 0;
    sc.final[Stat.MagicResist] = 0;
  }
  world.abilities.get(caster)!.slots.E.rank = 1;
  world.nav.get(caster)!.attackTarget = victim;
  world.rebuildGrid();
  return { world, caster, victim };
}

/** 跑 n 個 tick，回報落在 `victim` 身上的傷害事件（依 `type` 分兩桶）。 */
function hits(world: SimWorld, victim: EntityId, n: number): { magic: number; physical: number } {
  const out = { magic: 0, physical: 0 };
  for (let i = 0; i < n; i++) {
    world.step(NO_INTENTS);
    for (const e of world.events) {
      if (e.type !== "damage") continue;
      const d = e.data as { target?: EntityId; type?: string };
      if (d.target !== victim) continue;
      if (d.type === "magic") out.magic++;
      else if (d.type === "physical") out.physical++;
    }
  }
  return out;
}

describe("77-03 GLADIARIA ALAT — 展翼期間的普攻附傷（GH#1100）", () => {
  it("⭐ 按 E 之前普攻不帶魔法傷害；按 E 之後同一個普攻管線就帶了", () => {
    const { world, caster, victim } = rig();

    // ① 已知**沒有** ⇒ 量不到。⭐ 而普攻本身要真的在發生 —— ⛔ 否則這把尺是瞎的。
    const before = hits(world, victim, 200);
    expect(before.physical, "⛔ 200 tick 內一次普攻都沒打到 ⇒ 這條守衛在量空氣").toBeGreaterThan(0);
    expect(before.magic, "⛔ 還沒按 E 就已經有魔法傷害 ⇒ 這一發不是 77-03 給的").toBe(0);

    // ② 已知**有** ⇒ 量得到。⛔ 沒有手寫 payload：按下去，然後讓管線自己跑。
    expect(castAbility(world, caster, "E", { type: "self" }), "77-03 按不下去").toBe("ok");
    const after = hits(world, victim, 200);
    expect(
      after.magic,
      "⛔⛔ 按下 77-03 之後普攻仍然沒有追加魔法傷害 —— 卡面逐字寫著「攻擊附帶額外 [AP] 傷害」，\n" +
        "  而 `applyBuff.hooks[onBasicAttack]` 那一格沒有把它接到普攻上。\n" +
        "⚠️⚠️ 改之前先查那一份是誰的：bash scripts/genguard.sh content/abilities/godie-e00x.e.json\n" +
        "  · 產生器的產物 ⇒ 改**來源**（tools/…）再 bash scripts/genrun.sh <step>。\n" +
        "    ⛔ 直接改出貨 JSON 會被下一次 sync 打回來，而那個「又紅了」看起來像**新的**錯。\n" +
        "  · ⚠️ 同一支技能在內容樹裡有**兩份**：standalone content/abilities/godie-e00x.e.json ＋\n" +
        "    內嵌 content/champions/godie-e00x.json 的 abilities.E —— **兩份都要動**。",
    ).toBeGreaterThan(0);
    expect(after.physical, "⛔ 第二段連普攻都停了 ⇒ 兩段不可比").toBeGreaterThan(0);
  });
});
