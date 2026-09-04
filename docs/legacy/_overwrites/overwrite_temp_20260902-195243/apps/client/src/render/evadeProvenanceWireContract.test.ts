/**
 * ⭐⭐ **迴避來源的線路契約**（Codex 阻塞清單 P0-4）——
 * 「**是哪一份 grant 讓這一次迴避成功**」，從 sim 一路活到客戶端消費端。
 *
 * ⛔⛔ Codex 逐字：
 *   「它沒有指出是哪個技能、buff、道具或 grant 使本次迴避成功⋯
 *    ⛔ **不得從聚合後的 `Stat.Evasion` 猜第一個、最高或任意來源**。」
 *
 * ⭐ 這裡**整條線都用出貨的東西**：出貨內容 → 出貨英雄 → 出貨的三選一增益卡
 *   → 真的 `rollEvade` → 真的 `evade` 事件 → 真的 `EntityViewRegistry`。
 *   ⛔ 不自己捏一份 payload（那會量到一個**虛構通道**，失敗形態⑤）。
 *
 * ── 突變紀錄 ──────────────────────────────────────────────────────────────
 *  · `basicEvadeSource` 的分層歸因換成「取最高的那一份來源」
 *      → ② 紅：0.07 的那支被動**一次都沒有**抽中（3xx 次迴避全歸 0.25 的卡）
 *  · `basicEvadeSource` 的 `denom` 從 `max(Σflat, 聚合值)` 改回 `Σflat`
 *      → ③ 紅：`godie-u00j` 的 `base.evasion` 那一半被冒名頂替，`by === null` 絕跡
 *  · `EntityViewRegistry` 的 `case "evade"` 拿掉 `this.content.evadeCueFor?.(…)`
 *      → ④ 紅：專屬演出從來沒有被選過
 */
import { beforeAll, describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ContentLoader } from "@ggd/shared/content/loader";
import { shippedContentSource } from "@ggd/shared/content/__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "@ggd/shared/content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { applyAugmentPick } from "@ggd/shared/sim/economy/draft";
import { evasionOf, rollEvade, type EvadeEvent, type EvadeSourceRef } from "@ggd/shared/sim/combat/evasion";
import { asSeatId, asTeamId, type AugmentId, type ChampionId, type EntityId } from "@ggd/shared/ids";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { FANNED_OUT_EVENT_TYPES } from "../../../game-server/src/net/eventFanout";
import { EntityViewRegistry, type EntityViewState, type EvadeCue } from "./EntityViewRegistry";
import { AssetManager } from "./AssetManager";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;
/** 出貨標本：`abilityPassive:godie-e00l.q` 給 flat 0.07，`base.evasion` 是 0。 */
const TWO_SOURCE_HERO = "godie-e00l" as ChampionId;
const SHIPPED_PASSIVE = "abilityPassive:godie-e00l.q";
/** 出貨的三選一：迴避 +25%（`content/augments/phantom-step.json`）。 */
const SHIPPED_AUGMENT = "phantom-step" as AugmentId;
/** 出貨標本：`base.evasion 0.15` **＋** 被動 flat 0.15 ⇒ 一半沒有主人。 */
const HALF_BASE_HERO = "godie-u00j" as ChampionId;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

function duel(world: SimWorld, defenderId: ChampionId): { attacker: EntityId; defender: EntityId } {
  const attacker = spawnChampion(world, {
    championId: "thorne" as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0),
    pos: { x: C.x - 0.6, z: C.z }, zone: 0,
  });
  const defender = spawnChampion(world, {
    championId: defenderId, seatId: asSeatId(1), teamId: asTeamId(1),
    pos: { x: C.x + 0.6, z: C.z }, zone: 0,
  });
  world.step(new Map());
  return { attacker, defender };
}

/** ⭐ 直接搖出貨的 `rollEvade` N 次，收集**真的**送出去的 `evade` 酬載。 */
function realWirePayloads(defenderId: ChampionId, rolls: number, augment = false): EvadeEvent[] {
  const world = new SimWorld(SKELETON_ARENA, 20260902);
  const { attacker, defender } = duel(world, defenderId);
  if (augment) {
    // ⭐ 出貨的三選一發放路徑（`applyAugmentPick`），⛔ 不是手寫 attachSource。
    const ok = applyAugmentPick(
      world,
      { entity: defender, tier: "prismatic", choices: [SHIPPED_AUGMENT], picked: null },
      SHIPPED_AUGMENT,
    );
    expect(ok, "⛔ 出貨的三選一沒發下去 —— 標本失效了").toBe(true);
  }
  const out: EvadeEvent[] = [];
  for (let k = 0; k < rolls; k++) {
    world.events.length = 0;
    if (rollEvade(world, attacker, defender)) {
      const ev = world.events.find((e) => e.type === "evade");
      expect(ev, "⛔ rollEvade 說閃掉了卻沒有送事件").toBeDefined();
      out.push(ev!.data as unknown as EvadeEvent);
    }
  }
  expect(out.length, "⛔ 一次都沒閃到 —— 這一條在量空氣").toBeGreaterThan(20);
  return out;
}

describe("evade 的來源 provenance（Codex P0-4）", () => {
  it("①⭐⭐ 抽籤的**次數與位置一個都沒有變** —— 每一場既有錄影不動", () => {
    const w = new SimWorld(SKELETON_ARENA, 4242);
    const { attacker, defender } = duel(w, TWO_SOURCE_HERO);
    const p = evasionOf(w, defender);
    expect(p, "⛔ 標本沒有迴避").toBeGreaterThan(0);
    // 出貨路徑：rollEvade 走 `rng.next()` 並保留那個數字。
    const start = w.rng.state;
    const got: boolean[] = [];
    for (let k = 0; k < 300; k++) got.push(rollEvade(w, attacker, defender));
    const after = w.rng.state;
    // 參考路徑：同一個起點，跑 300 次 `rng.chance(p)`（＝ 這次改動之前的那一行）。
    w.rng.state = start;
    const ref: boolean[] = [];
    for (let k = 0; k < 300; k++) ref.push(w.rng.chance(p));
    expect(got, "⛔ 結果分岔 ⇒ 這不是同一次抽籤").toEqual(ref);
    expect(w.rng.state, "⛔ rng 狀態分岔 ⇒ 多抽或少抽了 ⇒ 每一場錄影 desync").toBe(after);
  });

  it("②⭐⭐ 兩份來源時，**兩份都真的抽中過**（⛔ 不是取最高／取第一個）", () => {
    const wire = realWirePayloads(TWO_SOURCE_HERO, 1200, true);
    const live = new Set<string>();
    const w = new SimWorld(SKELETON_ARENA, 20260902);
    const { defender } = duel(w, TWO_SOURCE_HERO);
    applyAugmentPick(
      w, { entity: defender, tier: "prismatic", choices: [SHIPPED_AUGMENT], picked: null }, SHIPPED_AUGMENT,
    );
    for (const s of w.stats.get(defender)!.sources) live.add(s.id);

    const hits = new Map<string, number>();
    for (const e of wire) {
      expect(e.channel, "⛔ 普攻通道的 channel 標錯了").toBe("basic");
      expect(e.by, "⛔ 兩份 grant 都在身上，卻報 null").not.toBeNull();
      // ⭐ 它必須是這個身體上**真的掛著**的一份來源，⛔ 不是一個編出來的字串。
      expect(live.has(e.by!.id), `⛔ \`${e.by!.id}\` 不在 sc.sources 裡`).toBe(true);
      hits.set(e.by!.id, (hits.get(e.by!.id) ?? 0) + 1);
    }
    const passive = hits.get(SHIPPED_PASSIVE) ?? 0;
    const aug = hits.get(`aug:${SHIPPED_AUGMENT}`) ?? 0;
    expect(
      passive,
      "⛔⛔ 0.07 的那支**出貨被動**一次都沒有抽中 ⇒ 這是「取最高」而不是歸因 " +
        "（Codex 逐字禁止），⭐ 而它貢獻了 0.07/0.32 的迴避率",
    ).toBeGreaterThan(0);
    expect(aug, "⛔ 0.25 的那張出貨卡一次都沒抽中 ⇒ 這是「取第一個」").toBeGreaterThan(0);
    // ⭐ 而且比例要對得上權重 0.07 : 0.25（寬帶 —— 驗的是**機制**不是數字）。
    const share = passive / (passive + aug);
    expect(share, `⛔ 被動只佔 ${share.toFixed(3)} ⇒ 分層歸因的邊際機率不對`).toBeGreaterThan(0.1);
    expect(share).toBeLessThan(0.36);
  });

  it("③⭐ `base.evasion` 那一半**沒有主人** ⇒ `by === null`（驗收②的通用回饋）＋ 真的過線", () => {
    expect(
      FANNED_OUT_EVENT_TYPES.has("evade"),
      "⛔ `evade` 不在 FANNED_OUT_EVENT_TYPES 裡 ⇒ 它到不了客戶端",
    ).toBe(true);
    const wire = realWirePayloads(HALF_BASE_HERO, 1200);
    const owned = wire.filter((e) => e.by !== null);
    const unowned = wire.filter((e) => e.by === null);
    expect(
      unowned.length,
      "⛔⛔ `godie-u00j` 的 `base.evasion: 0.15` 那一半被某份 grant 冒名頂替了 —— " +
        "⭐ 那正是 Codex 禁的「猜一個來源」，只是換了個包裝",
    ).toBeGreaterThan(0);
    expect(owned.length, "⛔ 那支出貨被動一次都沒抽中 ⇒ 歸因整個沒接上").toBeGreaterThan(0);
    for (const e of owned) expect(e.by!.id).toBe("abilityPassive:godie-u00j.passive");
    for (const e of owned) expect(e.by!.kind).toBe("passive");
    for (const e of wire) expect(e.chance).toBeCloseTo(evasionOf0(), 6);
  });

  it("④⭐⭐ 真的事件餵**真的** `EntityViewRegistry` ⇒ 演出由抽中的那一份來源選", () => {
    const wire = realWirePayloads(TWO_SOURCE_HERO, 1200, true);
    const byPassive = wire.find((e) => e.by?.id === SHIPPED_PASSIVE)!;
    const byAug = wire.find((e) => e.by?.id === `aug:${SHIPPED_AUGMENT}`)!;
    expect(byPassive, "⛔ 標本不足：沒有被動抽中的樣本").toBeDefined();

    const scene = new Scene(new NullEngine());
    const asked: (EvadeSourceRef | null)[] = [];
    const registry = new EntityViewRegistry(scene, new AssetManager(scene), {
      evadeCueFor: (by): EvadeCue | null => {
        asked.push(by);
        if (by?.id === SHIPPED_PASSIVE) return { rgb: [1, 0, 0] };
        if (by?.id === `aug:${SHIPPED_AUGMENT}`) return { rgb: [0, 0, 1] };
        return null; // ⭐ 沒有專屬設定 ⇒ 只有通用回饋
      },
    });
    const evader = byPassive.target;
    const ent: EntityViewState = {
      id: evader, kind: 0, seatId: 1, key: "champ.sela", teamId: 1,
      x: C.x, z: C.z, fx: 1, fz: 0, alive: true,
    };
    registry.sync({
      entities: [ent], poseFor: (e) => ({ x: e.x, z: e.z, fx: e.fx, fz: e.fz }),
      nowMs: 0, dtMs: 16, loadModels: false,
    });
    const view = registry.getChampionView(evader)!;
    expect(view, "⛔ 沒有 view ⇒ 下面在量空氣").toBeDefined();

    registry.handleEvent({ type: "evade", data: byPassive } as unknown as EventMessage, 100);
    // ① 通用回饋**永遠**播（Codex 驗收②）
    expect(view.anim.state, "⛔ 通用迴避演出沒播 ⇒ 既有回饋被吃掉了").toBe("dodge");
    // ② 而專屬演出問的是**真正抽中的那一份**
    expect(asked.at(-1)?.id, "⛔ 消費端沒有把來源轉給演出選擇器").toBe(SHIPPED_PASSIVE);
    registry.handleEvent({ type: "evade", data: byAug } as unknown as EventMessage, 400);
    expect(asked.at(-1)?.id, "⛔ 換一份來源時演出選擇器沒有跟著換").toBe(`aug:${SHIPPED_AUGMENT}`);
    expect(new Set(asked.map((b) => b?.id)).size, "⛔ 兩次問到同一份 ⇒ 沒有在區分來源").toBe(2);
    scene.dispose();
  });
});

/** `godie-u00j` 的聚合迴避（base 0.15 + 被動 0.15），從**出貨內容**量，⛔ 不抄字面值。 */
function evasionOf0(): number {
  const w = new SimWorld(SKELETON_ARENA, 1);
  const { defender } = duel(w, HALF_BASE_HERO);
  return evasionOf(w, defender);
}
