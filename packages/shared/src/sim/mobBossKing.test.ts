/**
 * ⭐ 殭屍王會自己打架 —— GH#577 / GH#602（owner 2026-08-23）。
 *
 * 驗的是**機制**，⛔ 不是數字（第二守則）：10% 真傷 / 回復 100% / 追加 50% /
 * 冷卻 30 秒 / 攻速 4 / 回魔 1000 全部各有三個住處＋自己的 drift 守衛，
 * 在這裡再抄一份就是第四個住處，而它一定會過期並用錯誤的訊息紅。
 *
 * ⭐ 跑的是**出貨的那一份**：真的 `content/` 樹（`registerAll`）＋真的
 * `content/config/arena-rules.json`，所以「王真的會放技能」這句話講的是玩家會遇到
 * 的那一隻，⛔ 不是一份手搭的夾具（失敗形態⑤）。
 *
 * ⚠️ 「小怪在結構上不可能施法」那條斷言的**例外只開給王**，反向那一半釘在
 * `mobs.control.test.ts`（一般殭屍與特殊殭屍仍然沒有任何組件）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import { mobRulesFromConfig, summonMobBoss, type MobRules, type MobWavesConfigLike } from "./mobs";
import { beginCombatMobs } from "./systems/MobSystem";
import { TICK_HZ } from "../constants";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const ARENA_RULES = join(CONTENT, "config/arena-rules.json");

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
});

function shippedMobWaves(): MobWavesConfigLike {
  const doc = JSON.parse(readFileSync(ARENA_RULES, "utf8")) as { mobWaves?: MobWavesConfigLike };
  if (!doc.mobWaves) throw new Error("arena-rules.json 沒有 mobWaves");
  return doc.mobWaves;
}

const ZC = SKELETON_ARENA.zones[0]!.center;

interface Field {
  w: SimWorld;
  rules: MobRules;
  boss: EntityId;
  /** 血最少的英雄，站在**場地另一頭**（「無上限施法距離」的證據） */
  weak: EntityId;
  /** 滿血的英雄，站在王**臉上**（「⛔ 不是最近的」的對照組） */
  near: EntityId;
}

/**
 * 一隻王 + 兩位英雄。⚠️ 兩位英雄的「近」與「弱」是**相反**的，所以任何一個
 * 「打最近的」實作在這裡都會挑錯人。
 */
function kingField(humanSeats?: ReadonlySet<SeatId>): Field {
  const w = new SimWorld(SKELETON_ARENA, 4242);
  w.combatActive = true;
  const near = spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: ZC.x + 1.5, z: ZC.z },
    zone: 0,
  });
  const weak = spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(0),
    pos: { x: ZC.x - 18, z: ZC.z + 8 },
    zone: 0,
  });
  const rules = mobRulesFromConfig(shippedMobWaves(), w.dt, 9, undefined, undefined, humanSeats);
  beginCombatMobs(w, rules, [0]);
  const boss = summonMobBoss(w, 0, rules, near, 100);
  if (boss === null) throw new Error("殭屍王沒有被召喚出來 —— 這條測試失去對象");
  // 王從邊緣走進來；把它挪到區域中心，讓「近」的那位真的貼在它臉上。
  const bt = w.transform.get(boss)!;
  bt.pos = { x: ZC.x, z: ZC.z };
  // 血最少的那一位（絕對值，owner 的字面規格），而且他離王最遠。
  const wh = w.health.get(weak)!;
  // ⚠️ 0.9 而不是 0.1：他仍然是**全場血量最少**的那一位（另一位滿血），但撐得住
  //    王撲過來之後順手揮的那一刀 —— 死了就沒有人可以吃那一口真傷，而測到的
  //    會是「普攻很痛」而不是「[leap吸血] 咬到了」。
  wh.hp = wh.maxHp * 0.9;
  return { w, rules, boss, weak, near };
}

/** 王掉到內建技的門檻以下。⛔ 讀 config，不抄 0.2。 */
function bleedKing(f: Field): void {
  const king = f.rules.boss!.king!;
  const hp = f.w.health.get(f.boss)!;
  hp.hp = hp.maxHp * king.innateCastHpPct * 0.5;
}

describe("殭屍王 [leap吸血] + 自動施法 (GH#577 / GH#602)", () => {
  it("⭐ 血低於門檻 ⇒ 撲向**全場血量最少**的英雄，咬一口真傷並回血", () => {
    cover("mob-king-leap-drain");
    const f = kingField();
    bleedKing(f);
    const before = f.w.health.get(f.boss)!.hp;
    const weakBefore = f.w.health.get(f.weak)!.hp;
    const bossStart = { ...f.w.transform.get(f.boss)!.pos };

    let cast = false;
    let trueHitOnWeak = false;
    let trueHitOnNear = false;
    for (let i = 0; i < TICK_HZ * 3; i++) {
      f.w.step(new Map());
      for (const ev of f.w.events) {
        if (ev.type === "abilityCast" && ev.data.caster === f.boss) cast = true;
        if (ev.type !== "damage" || ev.data.source !== f.boss || ev.data.type !== "true") continue;
        if (ev.data.target === f.weak) trueHitOnWeak = true;
        if (ev.data.target === f.near) trueHitOnNear = true;
      }
      // 王的血會被自己的回血推回門檻以上,而它已經進冷卻 —— ⛔ 不要每 tick 重新放血,
      // 那樣測到的是「一直在放」而不是「放得出來」。
    }

    // ① 它**真的施法了**（讀事件，⛔ 不讀旗標）
    expect(cast, "殭屍王一發技能都沒放出來").toBe(true);
    // ② 它**撲過去了** —— 位移方向是血最少的那一位，⛔ 不是貼臉的那一位
    const bossEnd = f.w.transform.get(f.boss)!.pos;
    const weakPos = f.w.transform.get(f.weak)!.pos;
    const dStart = Math.hypot(bossStart.x - weakPos.x, bossStart.z - weakPos.z);
    const dEnd = Math.hypot(bossEnd.x - weakPos.x, bossEnd.z - weakPos.z);
    expect(dEnd, "王沒有朝血最少的英雄移動").toBeLessThan(dStart - 5);
    // ③ 咬下去的那一口是**真傷**，而且落在血最少的那一位身上。
    //    ⚠️ 對照組讀的是**真傷**而不是「血有沒有掉」：貼臉那位本來就會挨王的普攻
    //    （物理），拿血量當判準會把一發普攻誤讀成「咬錯人了」。
    expect(trueHitOnWeak, "血最少的英雄沒有吃到真實傷害").toBe(true);
    expect(trueHitOnNear, "貼臉的那位也吃到真傷 —— 咬的不是血最少的那一個").toBe(false);
    expect(f.w.health.get(f.weak)!.hp).toBeLessThan(weakBefore);
    // ④ **吸血**：王的血比咬之前多（`damage.refund` 走的是實際掉的量）
    expect(f.w.health.get(f.boss)!.hp).toBeGreaterThan(before);
  });

  it("⭐ 王有技能欄與屬性表，而同一場的一般殭屍一個都沒有", () => {
    cover("mob-king-kit-only-boss");
    const f = kingField();
    // 王：兩個組件都在，天生技槽是**內建**的那一支（⛔ 不是那張臉自己的天生技）
    expect(f.w.abilities.has(f.boss)).toBe(true);
    expect(f.w.stats.has(f.boss)).toBe(true);
    expect(f.w.abilities.get(f.boss)!.passiveSlot?.abilityId).toBe(
      f.rules.boss!.king!.innateAbilityId,
    );
    // ⛔ 沒有 ChampionComp —— 有的話王會領一份英雄擊殺金並且進計分板
    expect(f.w.champion.has(f.boss)).toBe(false);
    // 魔力池被開出來了（0 的話每一支要錢的技能都會被靜默擋掉）
    expect(f.w.health.get(f.boss)!.maxMana).toBeGreaterThan(0);

    // 同一場跑滿一波，一般殭屍仍然一個組件都沒有
    let sawPlain = false;
    for (let i = 0; i < TICK_HZ * 5; i++) f.w.step(new Map());
    for (const [id, mob] of f.w.mob) {
      if (mob.kind === "boss") continue;
      sawPlain = true;
      expect(f.w.abilities.has(id)).toBe(false);
      expect(f.w.stats.has(id)).toBe(false);
    }
    expect(sawPlain, "這一場沒有一般殭屍 —— 反向那一半是空的").toBe(true);
  });

  it("⭐ 優先攻擊玩家角色而非 bot（真人在遠處，bot 貼臉）", () => {
    cover("mob-king-prefers-humans");
    // 座位 1 = 那位站在場地另一頭的英雄。座位 0（貼臉那位）是 bot。
    const f = kingField(new Set([asSeatId(1)]));
    // ⛔ 不放血 —— 這一條驗的是**普攻索敵**，不是內建技。
    f.w.step(new Map());
    expect(f.w.mob.get(f.boss)!.target).toBe(f.weak);

    // 對照組：沒有真人座位時退回「誰近打誰」（host 還沒交座位表 / 全 bot 的練習賽）。
    const g = kingField();
    g.w.step(new Map());
    expect(g.w.mob.get(g.boss)!.target).toBe(g.near);
  });
});
