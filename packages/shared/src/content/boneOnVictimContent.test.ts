/**
 * ⛔⛔ GH#809 內容批 —— **原作那一族「掛在受擊者身上」的掛件，出貨內容真的掛得到人**。
 *
 * ── 為什麼機制那條守衛不夠 ──────────────────────────────────────────────────
 * `sim/effects/spawnVfx.test.ts` 已經把**機制**驗透了（`attachTo` 過線、落點跟著換、
 * 沒有受擊者就一則都不發）—— ⛔ 但它餵的是一顆 `zEffectDef.parse({...})` 手寫的效果。
 * ⇒ 「引擎做得到」與「**出貨的技能真的用了它**」是兩個宣稱，而 2026-08-30 之前
 *    整棵 `content/` 的 `boneOn` 是 **0 筆**：機制全綠、玩家一個像素都沒看到
 *    （CLAUDE.md 失敗形態⑤「被測的不是出貨的那個」）。
 *
 * ⇒ 這一條**整條線都用出貨的東西**：出貨內容 → 出貨技能的 `effects` → 真的
 *   `runEffects` → 真的 `vfxSpawn` 事件。⛔ 不自造 payload、⛔ 不抄座標。
 *
 * ── 它同時關掉三個方向（少一個都還原得出一個壞）────────────────────────────
 *  ① **錨定的人**：`attachTo` 是被打的那個人，⛔ 不是施法者
 *     （原作 j:37573 的第二個參數是 `GetEnumUnit()`，⛔ 不是 `GetTriggerUnit()`）。
 *  ② **扇出**：線上打到 N 個人就發 N 則、N 個**不同的** `attachTo`
 *     （原作那一段是 `ForGroup` 的迴圈體 ⇒ 每個人各一發）。
 *     ⚠️ 這一格靠 `onHitTargetsMode:"perTarget"`；漏掉它 `ctx.targets[0]` 只會餵出**一則**。
 *  ③ **這一批真的落地了**：7 支翻過去的技能逐一還在，且指到一份**存在的** vfx@1。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）───────────────────────────────────
 *  · ⭐ 承重線 —— `tools/skill-remake/heroes/godie-h01n.py` 的 79-03 拿掉
 *    `onHitTargetsMode="perTarget"`（＝把扇出還原成 batch）→ 重生成 →
 *    紅：「expected 1 to be 3」。⇒ 這一條真的在量「每個受擊者各一發」，
 *    ⛔ 不是「有沒有送事件」。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "./registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../sim/content/registry";
import { SimWorld } from "../sim/SimWorld";
import { SKELETON_ARENA } from "../sim/world/ArenaDef";
import { runEffects } from "../sim/effects/effectRunner";
import type { EffectContext, EffectDef } from "../sim/effects/effect";
import { asSeatId, asTeamId, type AbilityId, type EntityId } from "../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;

/**
 * 這一批逐支翻譯過去的技能 → 原作的 JASS 行號（`…/raw/war3map.j`）。
 * ⛔ 這張表**不是**「應該要有幾支」的願望清單 —— 每一列都指得到一行
 * `AddSpecialEffectTargetUnitBJ( <attach>, <受擊者>, "BloodBreathStream.mdx" )`。
 */
const TRANSLATED: readonly (readonly [string, number, string])[] = [
  ["godie-h01n.w", 37475, "chest"], // udg_BleachTarget = GetAttackedUnitBJ() (j:37472)
  ["godie-h01o.w", 37475, "chest"], // 79 卍解態，同編號 ⇒ 兩邊一起動
  ["godie-h01n.e", 37573, "hand"], // ForGroup 迴圈體的 GetEnumUnit()
  ["godie-h01o.e", 37573, "hand"],
  ["godie-u00v.r", 50120, "chest"], // udg_PKnockBack_Target = GetSpellTargetUnit() (j:50106)
  ["godie-nsjs.w", 27948, "chest"], // udg_plantUnit = GetSpellTargetUnit() (j:27910)
  ["godie-n00p.w", 27948, "chest"],
];

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

/** 施法者在西、`n` 個敵人排在它正東方 ⇒ 一條 `damageLine` 打得到全部。 */
function rig(n: number): { world: SimWorld; caster: EntityId; enemies: EntityId[] } {
  const world = new SimWorld(SKELETON_ARENA, 7);
  const place = (x: number, team: number, seat: number): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x, z: C.z },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.3,
      zone: 0,
    });
    world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
    world.health.set(id, { hp: 9000, maxHp: 9000, mana: 0, maxMana: 0, alive: true, shields: [] });
    return id;
  };
  const caster = place(C.x, 0, 0);
  const enemies = Array.from({ length: n }, (_, i) => place(C.x + 1.5 + i * 1.5, 1, i + 1));
  world.rebuildGrid();
  return { world, caster, enemies };
}

/** 深度優先走完一份 doc 的 `effects` 樹，把每一顆 `spawnVfx` 交出來。 */
function everySpawnVfx(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) for (const n of node) everySpawnVfx(n, out);
  else if (node !== null && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (o["kind"] === "spawnVfx") out.push(o);
    for (const v of Object.values(o)) everySpawnVfx(v, out);
  }
  return out;
}

describe("GH#809 內容批 —— 掛件錨在受擊者身上", () => {
  it("⭐ 出貨的 79-03 月牙天衝：線上每個人各一發，錨在**他自己**身上（⛔ 不是施法者）", () => {
    cover("gh809-bone-on-victim-content");
    const { world, caster, enemies } = rig(3);
    const def = Abilities.tryGet("godie-h01n.e" as AbilityId);
    expect(def, "godie-h01n.e 不在註冊表裡 —— 標本被改名或內容載入失敗了").toBeDefined();
    runEffects((def!.effects ?? []) as EffectDef[], {
      world,
      caster,
      rank: 1,
      targets: [...enemies],
      point: { x: C.x + 6, z: C.z },
      direction: { x: 1, z: 0 },
      origin: "ability:godie-h01n.e",
      rng: world.rng,
    } as EffectContext);

    const spawns = world.events
      .filter((e) => e.type === "vfxSpawn")
      .map((e) => e.data as { attachTo?: EntityId; caster: EntityId; attach?: string });
    const anchored = spawns.filter((d) => d.attachTo !== undefined);
    // ① 扇出 —— 打到 3 個人就有 3 則（⛔ batch 模式只會有 1 則）
    expect(anchored, "⛔ 每個受擊者要各一發（onHitTargetsMode:\"perTarget\"）").toHaveLength(
      enemies.length,
    );
    // ② 錨定的人 —— 三個**不同**的敵人，一個都不是施法者
    expect(new Set(anchored.map((d) => d.attachTo!)).size).toBe(enemies.length);
    for (const d of anchored) {
      expect(enemies, `⛔ 錨定到了不是受擊者的東西：${String(d.attachTo)}`).toContain(d.attachTo);
      expect(d.attachTo, "⛔ 錨定單位退回了施法者 —— 這正是這張票要修的那個病").not.toBe(caster);
      expect(d.attach).toBe("hand"); // j:37573 的第一個參數
    }
  });

  it("⭐ 這一批 7 支逐一還在，而且指得到一份存在的 vfx@1", () => {
    cover("gh809-bone-on-victim-content");
    const missing: string[] = [];
    for (const [id, jassLine, attach] of TRANSLATED) {
      const def = Abilities.tryGet(id as AbilityId);
      const hit = everySpawnVfx(def?.effects).find(
        (v) => v["at"] === "bone" && v["boneOn"] === "victim" && v["attach"] === attach,
      );
      if (!hit) {
        missing.push(`${id}（j:${jassLine} 的 attach="${attach}" 不見了）`);
        continue;
      }
      if (VfxDefs.tryGet(String(hit["vfxId"])) === undefined) {
        missing.push(`${id} 指到不存在的 vfx@1：${String(hit["vfxId"])}`);
      }
    }
    expect(
      missing.join("\n"),
      "⛔ 這一批的翻譯掉了 —— 每一列都指得到 war3map.j 的一行 " +
        "`AddSpecialEffectTargetUnitBJ( <attach>, <受擊者>, … )`，⛔ 不是願望清單。",
    ).toBe("");
  });
});
