/**
 * ⭐⭐ GH#1092 —— 04-03 龍破斬**一次施放對同一個人只結算一發**。
 *
 * ── 原作逐行（`war3map.j`，`Trig_DragonSlaveMove_*`）─────────────────────────
 * 火球飛行的每一格（j:30114）與落點那一刻（j:30120）都只做**一件事**：
 * `ForGroupBJ(GetUnitsInRangeOfLocAll(200/450, movePoint), … GroupAddUnitSimple)`
 * —— ⛔ **收人進 `udg_DragonSlaveGroup`，一發傷害都不打**。
 * 真正的傷害只有一處：j:30129 `ForGroupBJ(udg_DragonSlaveGroup, …Func006A)`，
 * 而 `Func006A`（j:30044）裡面是一個 **if/else**（建築 ×0.50 / 一般 ×1.00）。
 * ⇒ ⭐⭐ **群組是集合、去重過、整組只結算一次 —— 一個單位吃到的是「其中一行」。**
 *
 * ── ⛔ 而 GGD 把那兩個收集點翻成了兩段**各自付款**的班表 ────────────────────
 * `spawnModelFx.onTouch`（沿途）與 `onArrive.damageArea`（落點）是兩串
 * `DelayedWave`，各自有自己的 `struck` 去重集合 —— ⛔ 兩串之間沒有任何東西比對。
 * 站在落點的人**同時**落在 3.67 半徑的沿途膠囊與 8 半徑的落點圓裡
 * ⇒ ⭐ 修之前實測：同一個身體吃到 **兩發**（t=10 沿途 1510 ＋ t=14 落點 1523）。
 * 那正是 owner 2026-09-06 逐字說的「對到 LINA 龍破斬 都是直接死」。
 *
 * ── 修法：把 `udg_DragonSlaveGroup` 的**集合語意**翻出來 ──────────────────
 * 沿途那一段掛一個 0.6 秒的內部標記 `dragon-slave-swept`，落點的圓用
 * `victimCondition: {not:{status …}}` 跳過已經被收走的人。⭐ 兩段因此**互斥**，
 * ⛔ 不是「刪掉一段」——刪掉沿途那一段等於原作 200 半徑收的人全部不吃傷害。
 * ⚠️ 兩段的 `amount` 因此必須**逐位元相同**（原作只有一個 `udg_DragonSlaverDamage`，
 * 而它含 INT 項）—— 否則被沿途收走的人會吃到一個少了 AP 項的數字，而卡面
 * 「點選惡夢魔王碎片增幅後，可增加威力」對他就成了謊話（第一·五守則）。
 * 那一條由下面第 ② 條斷言守著。
 *
 * ── 🧬 突變紀錄（實跑：改壞 → 🔴 → 還原）──────────────────────────────────
 // ⚠️⚠️ 改之前先查那一份是誰的：bash scripts/genguard.sh content/abilities/godie-hjai.e.json
 //   （castderive:build:raw · tiers:apply 就地改欄位）⇒ 產生器的產物就改**來源**再 bash scripts/genrun.sh <step>，
 //   ⛔ 直接改出貨 JSON 會被下一次 sync 打回來，而那個「又紅了」看起來像**新的**錯。
 * M1【承重】`content/abilities/godie-hjai.e.json`（＝下面 `ABILITY` 讀的那一份）的
 *    `onArrive.damageArea.victimCondition` 整格拿掉（＝去重消失，⭐ 而畫面上跟正確的一模一樣）
 *      → 🔴 ①「⛔⛔ 落點(12,0) 吃到 2 發 —— 應該是 1（實測：落點(12,0)=2 · 路徑上(3,0)=2
 *        · 只有爆炸(12,5)=1）」⭐ 而且 ④ 也同時紅（普查把它掃回豁免表的差集）——
 *        ⭐ 兩條**互相獨立**的偵測器，⛔ 不是同一條寫兩遍。
 *    ⚠️ 還原走結構化腳本（重跑 `scratchpad/apply_1092.py` 的同一段），
 *    ⛔ 不是 `git checkout <檔>`（CLAUDE.md：那是不可逆的刪除）。
 *
 * ⛔ 一條斷言都沒有抄出貨數值（第二守則「驗機制不驗數字」）：①數的是**發數**，
 * ②比的是**兩個節點之間**，③比的是**標記秒數與飛行時間**的關係。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../content/loader";
import { shippedContentSource } from "../content/__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { normalizeCombatEnv } from "./combatEnv";
import { runEffects } from "./effects/effectRunner";
import { DEFAULT_AUTO_ENGAGE } from "./combatFeel";
import type { EffectContext, EffectDef } from "./effects/effect";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "../ids";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;
const ABILITY = "godie-hjai.e";
const CASTER: ChampionId = "godie-hjai" as ChampionId;

/**
 * 三個座標各排掉一個解釋（⛔ 不是隨手擺的），而且**兩個方向都有**：
 *  · 落點 (12,0)  —— 沿途膠囊 ∩ 落點圓 ＝ 修之前吃兩發的那一格（已知**有**的那一邊）
 *  · 路徑上 (3,0) —— 只被沿途掃到（`shippedModelFxAbilities` 用的同一格）
 *  · 只有爆炸 (12,5) —— 側偏 5 > touchRadius 3.67 ⇒ 沿途碰不到（已知**沒有**的那一邊：
 *    它必須**照樣**吃到一發，否則「互斥」就退化成「落點整段死掉」而測試照樣綠）
 */
const SPOTS = [
  { tag: "落點(12,0)", x: 12, z: 0 },
  { tag: "路徑上(3,0)", x: 3, z: 0 },
  { tag: "只有爆炸(12,5)", x: 12, z: 5 },
] as const;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

/** 出貨的那一份 `spawnModelFx`（級距／預設已由 `registerAll` 解析）。 */
function beamNode(id: string): Record<string, unknown> {
  const effects = Abilities.get(id as AbilityId).effects ?? [];
  const n = (effects as unknown as Record<string, unknown>[]).find(
    (e) => e["kind"] === "spawnModelFx" && e["onTouch"] !== undefined,
  );
  expect(n, `${id} 的沿途班表不見了 —— 這一支的前提消失了`).toBeDefined();
  return n!;
}

/** 施放一次，回傳每個身體吃到**幾發**這支技能的傷害。 */
function hitsPerBody(): number[] {
  const world = new SimWorld(SKELETON_ARENA, 1);
  // ⛔ `combatActive` 留 false —— 開著它場上的人會互相普攻，於是「有掉血」對
  //    壞掉的實作也會過（失敗形態③）。
  world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
  world.combatFeel = { ...world.combatFeel, autoEngage: { ...DEFAULT_AUTO_ENGAGE, enabled: false } };
  const caster = spawnChampion(world, {
    championId: CASTER, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: C.x, z: C.z }, zone: 0,
  });
  const bodies: EntityId[] = SPOTS.map((s, i) =>
    spawnChampion(world, {
      championId: CASTER, seatId: asSeatId(i + 1), teamId: asTeamId(1),
      pos: { x: C.x + s.x, z: C.z + s.z }, zone: 0,
    }),
  );
  world.step(new Map());
  world.transform.get(caster)!.facing = { x: 1, z: 0 }; // `path:"forward"` 讀這一格
  const origin = `ability:${ABILITY}`;
  const ctx: EffectContext = { world, caster, rank: 1, targets: bodies, origin, rng: world.rng };
  runEffects(beamOwner(), ctx);
  const hits = bodies.map(() => 0);
  // ⭐ 數的是 `damage` **事件**，⛔ 不是「掉了幾次血」—— 沿途最後一發與落點
  //    落在**同一個 tick**，逐 tick 比血量的量尺對它是瞎的（單邊校準的尺）。
  for (let t = 0; t < 90; t++) {
    world.step(new Map());
    for (const e of world.events) {
      if (e.type !== "damage") continue;
      const d = e.data as { target: EntityId; origin: string };
      if (d.origin !== origin) continue;
      const i = bodies.indexOf(d.target);
      if (i >= 0) hits[i]! += 1;
    }
  }
  return hits;
}

function beamOwner(): EffectDef[] {
  return (Abilities.get(ABILITY as AbilityId).effects ?? []) as EffectDef[];
}

describe("GH#1092 · 04-03 龍破斬一次施放只結算一發", () => {
  it("★★ ① 三個座標各吃到**恰好一發**（⛔ 落點那一格修前是兩發）", () => {
    const hits = hitsPerBody();
    const table = SPOTS.map((s, i) => `${s.tag}=${hits[i]}`).join(" · ");
    for (let i = 0; i < SPOTS.length; i++) {
      expect(
        hits[i],
        `⛔⛔ ${SPOTS[i]!.tag} 吃到 ${hits[i]} 發 —— 應該是 1（實測：${table}）。\n` +
          "  · 2 發 ⇒ 沿途與落點沒有互斥（`onArrive.damageArea.victimCondition` 掉了）\n" +
          "  · 0 發 ⇒ 互斥過頭：落點整段被跳過（標記秒數太長／`touchSide` 被動過）\n" +
          "  ⭐ 原作 j:30129 只 `ForGroupBJ(udg_DragonSlaveGroup, …)` 一次，群組是集合。",
      ).toBe(1);
    }
  });

  it("★★ ② 兩段的 `amount` 逐位元相同（⭐ 原作只有一個 `udg_DragonSlaverDamage`）", () => {
    const n = beamNode(ABILITY);
    const touch = (n["onTouch"] as Record<string, unknown>[]).find((e) => e["kind"] === "damage");
    const blast = (n["onArrive"] as Record<string, unknown>[]).find((e) => e["kind"] === "damageArea");
    // ⭐ 2026-09-07 更正這一條的判準：AP 係數公式**按節點形狀**判（單體 `damage` vs 範圍 `damageArea`
    //   查的是不同的冷卻／形狀表）⇒ 兩段的 `ratios[].coeff` **天生就不會相同**，逐位元比對是一個
    //   `ap-coefficient.enabled` 開著時永遠不成立的宣稱（GH#1035 之後）。
    //   ⭐ 真正的不變量是「**兩段都吃得到 EX 增幅**」—— 那才是卡面承諾的東西（第一·五守則），
    //   ⛔ 而係數大小是公式的事，⛔ 不是這一條在守的。
    const exGated = (a: unknown): boolean =>
      JSON.stringify((a as { ratios?: unknown[] } | undefined)?.ratios ?? []).includes('"slot":"EX"');
    for (const [what, amount] of [["沿途", touch?.["amount"]], ["落點", blast?.["amount"]]] as const) {
      expect(
        exGated(amount),
        `⛔⛔ ${what}那一段吃不到 EX 增幅 —— 兩段互斥之後，一個人只會吃到其中一段，\n` +
          "  於是少掉增幅的那一半就是「卡面『點選惡夢魔王碎片增幅後，可增加威力』對他不會發生」（第一·五守則）。",
      ).toBe(true);
    }
    expect(
      (touch?.["amount"] as { damageTier?: unknown } | undefined)?.damageTier,
      "⛔ 兩段的傷害級距不同 ⇒ 被沿途收走的人拿到的是另一把尺量出來的數字",
    ).toBe((blast?.["amount"] as { damageTier?: unknown } | undefined)?.damageTier);
  });

  it("★★ ③ 標記活得比火球飛完全程久（⛔ 早一格到期＝去重靜默失效）", () => {
    const n = beamNode(ABILITY);
    const mark = (n["onTouch"] as Record<string, unknown>[]).find(
      (e) => e["kind"] === "applyStatus" && e["statusId"] === "dragon-slave-swept",
    );
    const flightSec = (n["distance"] as number) / (n["speed"] as number);
    expect(
      mark?.["duration"] as number,
      `⛔ 標記 ${String(mark?.["duration"])}s 撐不完 ${flightSec.toFixed(2)}s 的飛行 —— ` +
        "⭐ 先被掃到的人在落點結算前就沒有標記了 ⇒ 他又吃第二發，⛔ 而沒有任何東西會紅。",
    ).toBeGreaterThan(flightSec);
  });

  it("★ ④ 全庫「多個無條件傷害節點」逐支在豁免表上（⭐ 新增一支要寫下理由）", () => {
    const exempt = JSON.parse(
      readFileSync(join(HERE, "dragonSlaveDoubleDamageExemptions.json"), "utf8"),
    ) as { exempt: Record<string, { verdict: string; ownerRuling: string }> };
    const found = [...Abilities.ids()].filter((id) => ungatedDamageNodes(id) >= 2).sort();
    expect(
      found,
      "⛔ 普查結果與豁免表不一致 —— ⭐ 多一支：去 `dragonSlaveDoubleDamageExemptions.json` " +
        "讀那支的 JASS 並寫下判定（if/else 被翻成兩段 ⇒ 修；真的兩段 ⇒ 記理由）。\n" +
        "  ⭐ 少一支：某支被修好了 ⇒ 把它從表上刪掉。",
    ).toEqual(Object.keys(exempt.exempt).sort());
    for (const [id, row] of Object.entries(exempt.exempt))
      expect(row.ownerRuling, `⛔ ${id} 沒有一個能被反駁的理由`).not.toEqual("");
  });
});

/** 這一支技能上「沒有被任何條件擋住」的傷害節點有幾個。 */
function ungatedDamageNodes(id: AbilityId): number {
  const KINDS = new Set(["damage", "damageArea", "damageLine"]);
  const CHAIN = ["effects", "onArrive", "onTouch", "onHit", "onHitTargets", "finalEffects", "onLand", "onExpire"];
  let n = 0;
  const walk = (node: unknown, gated: boolean): void => {
    if (Array.isArray(node)) return void node.forEach((x) => walk(x, gated));
    if (node === null || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    const g = gated || rec["condition"] !== undefined;
    if (KINDS.has(String(rec["kind"])) && !g && rec["victimCondition"] === undefined) n += 1;
    for (const [k, v] of Object.entries(rec)) {
      if (["amount", "when", "condition", "victimCondition"].includes(k)) continue;
      if (Array.isArray(v) || (v !== null && typeof v === "object")) walk(v, CHAIN.includes(k) ? g : g);
    }
  };
  walk(Abilities.get(id).effects ?? [], false);
  return n;
}
