/**
 * 48-03 鮮血神殿（`godie-hvsh.e`）—— 行為守衛（GH#459）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 它為什麼存在
 *
 * 這一支的卡片承諾了六件事（結界 / 每秒扣血 / 降攻速 / 降移速 / 每個受傷單位回
 * Rider 生命 / 每殺 N 隻加全能力），而 2026-08-19 之前它的頂層 `effects` 是
 * **空陣列**，實際跑的是 `tpl-single-strike` 展開出來的**一發單體魔法傷害**。
 * 六件事一件都沒有 —— 而 schema 綠、`content:build` 綠、全套測試綠
 * （CLAUDE.md 第一·五守則：「卡片上不可以有說了但不會發生的字」）。
 *
 * ⚠️ 被測的是**出貨的那一份文件**（失敗形態⑤）：真的 `ContentLoader` +
 * `registerAll`，⛔ 沒有任何一個 EffectDef 是這裡手寫的。
 *
 * ⛔ 斷言裡**一個出貨數字都沒有**（第二守則：驗機制不驗數字）。半徑是「大」、
 * 每跳傷害 75/150/225/300、吸血 1%、持續 10 秒 —— 全部是 owner 每週在調的東西，
 * 抄進來就是第四個住處。這裡問的只有「這個機制會不會發生」。
 *
 * ⚠️ 誠實揭露：卡片的第六件事（每擊殺 14 個敵人 +1 全能力，`onKill` +
 * `grantAttribute.everyNth`）**沒有**行為覆蓋 —— 排一場 14 次擊殺的夾具比它值得
 * 的預算貴（第零守則②：一個功能一條承重的守衛）。它與這裡驗到的兩條 hook 掛在
 * **同一份** `applyBuff` 來源上，所以「來源沒掛上」這個唯一的全滅形態被下面蓋到。
 *
 * 突變紀錄：把 `content/abilities/godie-hvsh.e.json` 的 `hooks[0]`（onInterval）
 * 拿掉 → 這一支紅（「結界沒有每秒扣血」）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { castAbility } from "./abilities/abilitySystem";
import { Stat } from "./stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const RIDER = "godie-hvsh" as ChampionId;
const DUMMY = "godie-e001" as ChampionId;
const C = SKELETON_ARENA.zones[0]!.center;
const NO_INTENTS = (): Map<SeatId, IntentFrame> => new Map();

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
});

/** Rider 在區域中心（半血，好量吸血），`gaps` 每一格東邊一個敵人。 */
function rig(gaps: number[]): { world: SimWorld; rider: EntityId; foes: EntityId[] } {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  world.combatActive = true; // `intervalHookSystem` 的第一道閘
  const rider = spawnChampion(world, {
    championId: RIDER,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: 0 },
    zone: 0,
    level: 6,
  });
  const rh = world.health.get(rider)!;
  rh.hp = rh.maxHp / 2;
  const foes = gaps.map((gap, i) => {
    const id = spawnChampion(world, {
      championId: DUMMY,
      seatId: asSeatId(1 + i),
      teamId: asTeamId(1),
      pos: { x: C.x + gap, z: 0 },
      zone: 0,
      level: 6,
    });
    const hp = world.health.get(id)!;
    hp.maxHp = 8000;
    hp.hp = hp.maxHp;
    const sc = world.stats.get(id)!;
    sc.final[Stat.Armor] = 0;
    sc.final[Stat.MagicResist] = 0;
    return id;
  });
  world.rebuildGrid();
  world.abilities.get(rider)!.slots.E.rank = 1;
  world.rebuildGrid();
  return { world, rider, foes };
}

const step = (w: SimWorld, n: number): void => {
  for (let i = 0; i < n; i++) w.step(NO_INTENTS());
};

describe("48-03 鮮血神殿 (hvsh-e-blood-temple)", () => {
  it("結界持續扣圈內每一個敵人的血、降他們的攻速與移速，並把血折給 Rider", () => {
    cover("hvsh-e-blood-temple");
    const { world, rider, foes } = rig([2, 3.5]);
    const asBefore = foes.map((f) => world.stats.get(f)!.final[Stat.AttackSpeed]);

    expect(castAbility(world, rider, "E", { type: "self" })).toBe("ok");

    // ── ① 圈內**每一個**敵人都吃到，而且**不只吃一次** ────────────────────
    //    一發單體傷害（重製之前的實作）會讓 foes[1] 一滴血都不掉，
    //    而「打一次就沒了」會讓第二段的差是 0。
    step(world, 60);
    const mid = foes.map((f) => world.health.get(f)!.hp);
    step(world, 90);
    const late = foes.map((f) => world.health.get(f)!.hp);
    foes.forEach((_f, i) => {
      expect(mid[i]!, `圈內第 ${i + 1} 個敵人一滴血都沒掉 —— 結界不是範圍技`).toBeLessThan(8000);
      expect(late[i]!, `圈內第 ${i + 1} 個敵人只被打了一次 —— 結界沒有持續扣血`).toBeLessThan(
        mid[i]!,
      );
    });

    // ── ② 降攻速 + 降移速 ────────────────────────────────────────────────
    foes.forEach((f, i) => {
      expect(
        world.stats.get(f)!.final[Stat.AttackSpeed],
        `圈內第 ${i + 1} 個敵人的攻速沒有被結界壓下來`,
      ).toBeLessThan(asBefore[i]!);
      const st = world.status.get(f);
      expect(
        st?.effects.some((e) => (e.moveSpeedMult ?? 1) < 1 && e.expiresAtTick > world.tick),
        `圈內第 ${i + 1} 個敵人身上沒有結界的減速`,
      ).toBe(true);
    });
  });

  it("每一個被結界扣血的敵人都折一份生命給 Rider —— 沒有敵人時就沒有這一份", () => {
    cover("hvsh-e-blood-temple");
    // ⭐ 數的是 Rider 身上真的落地的 `heal` 事件（`combat/restore.ts::healTarget`
    //    發的那一顆，也就是畫面上跳綠字的那一顆），⛔ 不是「HP 有沒有變多」。
    //    兩個理由，兩個都是實測踩到的：
    //      ① `config.regen@1` 的自然回復會讓「HP 變多」對壞掉的實作也成立（形態④）；
    //      ② `world.combatActive` 打開之後敵人會自己打過來，Rider 的淨 HP 反而是
    //         **負的** —— 拿淨值當基準會讓一個完全正確的實作紅。
    // ⚠️ `world.events` 每一 tick 開頭清空，所以要邊跑邊收。
    const healPulses = (gaps: number[]): number => {
      const { world, rider } = rig(gaps);
      expect(castAbility(world, rider, "E", { type: "self" })).toBe("ok");
      let n = 0;
      for (let i = 0; i < 150; i++) {
        world.step(NO_INTENTS());
        n += world.events.filter(
          (e) =>
            e.type === "heal" &&
            (e as { data?: { target?: EntityId } }).data?.target === rider,
        ).length;
      }
      return n;
    };
    expect(healPulses([]), "空場也在回血 —— 這一條就不是在量結界的吸血了").toBe(0);
    expect(
      healPulses([2, 3.5]),
      "圈內有兩個敵人在挨打，Rider 卻一次都沒有被折血 —— 吸血那一項不存在",
    ).toBeGreaterThan(0);
  });
});
