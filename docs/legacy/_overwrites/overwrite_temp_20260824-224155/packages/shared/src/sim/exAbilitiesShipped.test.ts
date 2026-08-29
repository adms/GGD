/**
 * 兩支 owner 點名的 EX「空殼」（第一·五守則：卡面說了但不會發生）的**出貨內容**守衛。
 *
 * ⛔ 機制層各自已有夾具守衛（`abilityAugmentCastAndScope` / `reflectHook` /
 * `lane3Kinds`），它們對「**出貨 JSON 根本沒把機制接上**」永遠是綠的
 * （失敗形態⑤：被測的不是出貨的那個）。這裡跑的全部是出貨內容 + 真的
 * `SimWorld.step()`，斷言全部讀血條，⛔ 一格出貨數值都不進斷言
 * （第二守則：驗機制不驗數字）。
 *
 * ① 09-002 十倍龜派氣功（兩份 mirror：godie-ogrh.ex / godie-o00x.ex）
 *    卡面：「使出龜派氣功將額外附加250% [AP]點傷害」
 *    ⇒ 學了 EX 的悟空施放 09-04 龜派氣功（R，skillshot＋真投射物），
 *      受害者掉的血要**多於**沒學 EX 的同一場。
 *
 * ② 20-002 解放.約束勝利劍MAX（godie-e002.ex，passive onReflectSuccess）
 *    卡面：「[反彈]成功時發動，給予敵人連續七次斬擊…最後施展約束與勝利之劍」
 *    ⇒ 反彈成功之後，攻擊者要在**後續多個不同的 tick** 繼續中刀
 *      （delayed 序列真的排進佇列落地，⛔ 不是讀文件欄位）。
 *
 * ── 突變紀錄（一批一條，挑最承重的線）────────────────────────────────────
 *  · 把 `content/abilities/godie-ogrh.ex.json` 的 `augment` 區塊整個拿掉
 *    （＝這一批新增的內容整條撤銷；EX 照樣解鎖、buff 照樣在，只有卡面那句
 *     「額外附加250% [AP]」變回謊話）
 *    → 紅（逐字）：expected 4741.86… to be greater than 3403.61…
 *      變成 expected 3403.61… to be greater than 3403.61…（兩場掉血完全相同）
 *    → 改回來 → 綠。
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
import { castAbility, learnEx } from "./abilities/abilitySystem";
import { runEffects } from "./effects/effectRunner";
import { normalizeCombatEnv } from "./combatEnv";
import { DEFAULT_AUTO_ENGAGE } from "./combatFeel";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { EffectContext, EffectDef } from "./effects/effect";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const ZC = SKELETON_ARENA.zones[0]!.center;

/** 讀磁碟上的 JSON，不經 `_index.json` —— 不依賴 `pnpm content:build`。 */
function docs(collection: string): Record<string, unknown>[] {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map(
      (f) =>
        JSON.parse(readFileSync(join(CONTENT_DIR, collection, f), "utf-8")) as Record<
          string,
          unknown
        >,
    );
}

beforeAll(() => {
  const store = new ContentStore();
  for (const c of [
    "ability-templates",
    "abilities",
    "champions",
    "projectiles",
    "status-effects",
  ] as const) {
    for (const doc of docs(c)) store.add(c, doc.id as string, doc);
  }
  registerAll(store);
});

function newWorld(): SimWorld {
  const w = new SimWorld(SKELETON_ARENA, 20260824);
  w.combatActive = true;
  w.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
  // 不讓自動接敵的平砍混進量測 —— 這裡量的是技能封包。
  w.combatFeel = { ...w.combatFeel, autoEngage: { ...DEFAULT_AUTO_ENGAGE, enabled: false } };
  return w;
}

function spawnAt(w: SimWorld, id: ChampionId, seat: number, team: number, dx: number): EntityId {
  return spawnChampion(w, {
    championId: id,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: ZC.x + dx, z: ZC.z },
    zone: 0,
  });
}

/** 等級推上去（法力/血量夠用），⛔ 等級本身不是這裡要驗的東西。 */
function levelAndFill(w: SimWorld, id: EntityId, level: number): void {
  w.champion.get(id)!.level = level;
  w.stats.get(id)!.dirty = true;
  w.step(NO_INTENTS);
  const hp = w.health.get(id)!;
  hp.hp = hp.maxHp;
  hp.mana = hp.maxMana;
}

describe("EX 空殼守衛：出貨 JSON 施放之後玩家真的拿得到", () => {
  it("① 09-002：學了 EX，兩個形態的龜派氣功都要打得更痛（augment 真的到得了出貨 R）", () => {
    for (const form of ["godie-ogrh", "godie-o00x"] as ChampionId[]) {
      const lostWith = (withEx: boolean): number => {
        const w = newWorld();
        const goku = spawnAt(w, form, 0, 0, 0);
        const victim = spawnAt(w, form, 1, 1, 6);
        w.step(NO_INTENTS);
        levelAndFill(w, goku, 9);
        levelAndFill(w, victim, 9);
        w.abilities.get(goku)!.slots.R.rank = 1;
        if (withEx) expect(learnEx(w, goku), `${form} EX 解鎖`).toBe(true);
        const aim = w.transform.get(victim)!.pos;
        expect(
          castAbility(w, goku, "R", { type: "point", point: { x: aim.x, z: aim.z } }),
          `${form} R 按得下去`,
        ).toBe("ok");
        let lost = 0;
        for (let t = 0; t < 150; t++) {
          w.step(NO_INTENTS);
          const hp = w.health.get(victim)!;
          lost += hp.maxHp - hp.hp;
          hp.hp = hp.maxHp; // 每 tick 回滿：量的是累計封包，不讓死亡把比較截斷
        }
        return lost;
      };
      const plain = lostWith(false);
      const ex = lostWith(true);
      expect(plain, `${form} 的 R 根本沒打到 —— 下面的比較是空的`).toBeGreaterThan(0);
      expect(
        ex,
        `${form}：學了 EX 的龜派氣功沒有比較痛 —— 卡面「額外附加250% [AP]」沒有發生`,
      ).toBeGreaterThan(plain);
    }
  });

  it("② 20-002：反彈成功之後，攻擊者要在後續多個 tick 繼續中刀（七連斬真的落地）", () => {
    const w = newWorld();
    const saber = spawnAt(w, "godie-e002" as ChampionId, 0, 0, 0);
    const attacker = spawnAt(w, "godie-ogrh" as ChampionId, 1, 1, 8);
    w.step(NO_INTENTS);
    levelAndFill(w, saber, 18);
    levelAndFill(w, attacker, 18);
    expect(learnEx(w, saber), "Saber EX 解鎖").toBe(true);

    // 出貨的 20-04 永恆的理想鄉（反彈 buff）—— 與 avalonReflectFeedback 同一條路。
    const rDoc = JSON.parse(
      readFileSync(join(CONTENT_DIR, "abilities/godie-e002.r.json"), "utf8"),
    ) as { effects: EffectDef[] };
    const ctx: EffectContext = {
      world: w,
      caster: saber,
      rank: 1,
      targets: [saber],
      origin: "ability:godie-e002.r",
      rng: w.rng,
    };
    runEffects(rDoc.effects, ctx);

    // 敵人打一發魔法傷害 → 反彈成功 → EX 的 onReflectSuccess 排出延遲序列。
    w.damageQueue.push({
      source: attacker,
      target: saber,
      amount: 60,
      type: "magic",
      crit: false,
      origin: "ability:enemy",
    });
    let hitTicks = 0;
    for (let t = 0; t < 90; t++) {
      const a = w.health.get(attacker)!;
      const s = w.health.get(saber)!;
      a.hp = a.maxHp;
      s.hp = s.maxHp;
      w.step(NO_INTENTS);
      if (w.health.get(attacker)!.hp < a.maxHp - 1e-9) hitTicks++;
    }
    expect(hitTicks, "反彈根本沒打到攻擊者 —— 場景是空的").toBeGreaterThan(0);
    expect(
      hitTicks,
      "反彈成功了，但後續沒有連續斬擊 —— 卡面「連續七次斬擊」沒有發生（EX hook 沒接上或 delayed 序列沒落地）",
    ).toBeGreaterThanOrEqual(3);
  });
});
