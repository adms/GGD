/**
 * GH#1041 —— 免疫控場（`invulnerable.blocksControl`）要擋得住【致盲】與【詛咒】。
 *
 * 那兩支走 `missChance`，而 `applyStatus.ts` 的 `isCc` 在此之前只讀
 * stun/root/feared/disarmed/moveSpeedMult<1 ⇒ 一具「免疫控場」的身體照樣被弄瞎。
 * `statusTagImmunity.ts` 的檔頭 2026-08-24 就寫下了這個缺口，⛔ 而沒有任何東西會紅。
 *
 * ── 兩層，全部跑**出貨內容 + 出貨 runner**（⛔ 不造 status 夾具，失敗形態⑤）──
 *  ① 承重：44-01 死神之眼（頂層 applyStatus→curse）與 92-04 馬勒戈壁
 *     （damageArea.onHitTargets→blind）。免疫用的是出貨 74-01 獄門的
 *     `invulnerable{blocksControl:true}`，由受害者施給自己。兩個方向都斷言：
 *     沒免疫 ⇒ `missChanceOf > 0`；免疫 ⇒ `missChanceOf === 0` 且發 `immuneControl`。
 *  ② 閘：通用地走每一份登錄的 ability / item / augment 的整棵 JSON，
 *     ⛔ 不列子鍵名單（onHit/hooks/onArrive… 名單會過期）——任何 `applyStatus`
 *     帶 `missChance>0` 的節點都逐個打到免控的身體上；掛得上就紅並指名。
 *
 * 突變（承重一條）：`applyStatus.ts` 的 `isCc` 拿掉 `missChance > 0` 那一句 ⇒ 紅。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentStore } from "../../content/store";
import { registerAll } from "../../content/registries";
import { Abilities, Augments, Items } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "./effectRunner";
import { missChanceOf } from "../combat/evasion";
import { rankScalarMax, type RankScalar } from "../perRank";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../../ids";
import type { EffectContext, EffectDef } from "./effect";
import type { IntentFrame } from "../intents";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const ZC = SKELETON_ARENA.zones[0]!.center;
const NO_INTENTS = new Map<SeatId, IntentFrame>();
/** 74-01 獄門 —— 出貨的 `invulnerable{blocksControl:true, applyTo:"self"}`。 */
const IMMUNITY_ABILITY = "godie-u00j.q";
const VICTIM = "godie-h02v" as ChampionId;

function docs(collection: string): Record<string, unknown>[] {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(CONTENT_DIR, collection, f), "utf-8")) as Record<string, unknown>);
}

beforeAll(() => {
  const store = new ContentStore();
  for (const c of ["ability-templates", "abilities", "champions", "projectiles", "status-effects", "items", "augments"]) {
    for (const doc of docs(c)) store.add(c, doc.id as string, doc);
  }
  registerAll(store);
});

interface Rig {
  w: SimWorld;
  caster: EntityId;
  victim: EntityId;
}

function rig(casterId: ChampionId): Rig {
  const w = new SimWorld(SKELETON_ARENA, 1041);
  w.combatActive = true;
  const at = (id: ChampionId, seat: number, team: number, dx: number): EntityId =>
    spawnChampion(w, { championId: id, seatId: asSeatId(seat), teamId: asTeamId(team), pos: { x: ZC.x + dx, z: ZC.z }, zone: 0 });
  const caster = at(casterId, 0, 0, 0);
  const victim = at(VICTIM, 1, 1, 3);
  w.step(NO_INTENTS);
  return { w, caster, victim };
}

function ctxOf(r: Rig, origin: string): EffectContext {
  return { world: r.w, caster: r.caster, rank: 1, targets: [r.victim], point: r.w.transform.get(r.caster)!.pos, origin, rng: r.w.rng };
}

/** 受害者把出貨獄門的免控施給自己（`applyTo:"self"`），走真的 runner。 */
function immunise(r: Rig): void {
  const inv = (Abilities.get(IMMUNITY_ABILITY as never).effects ?? []).filter((e) => e.kind === "invulnerable");
  expect(inv.length, `${IMMUNITY_ABILITY} 的 invulnerable 不見了 —— 免疫那一半是空的`).toBe(1);
  runEffects(inv, { world: r.w, caster: r.victim, rank: 1, targets: [r.victim], origin: `ability:${IMMUNITY_ABILITY}`, rng: r.w.rng });
}

function cast(r: Rig, abilityId: string): void {
  runEffects(Abilities.get(abilityId as never).effects ?? [], ctxOf(r, `ability:${abilityId}`));
}

const CASES = [
  { ability: "godie-emns.q", champion: "godie-emns" as ChampionId, status: "curse" },
  { ability: "godie-h02v.r", champion: "godie-h02v" as ChampionId, status: "blind" },
] as const;

describe("GH#1041 免疫控場 vs missChance —— 出貨技能、出貨 runner", () => {
  for (const c of CASES) {
    it(`${c.ability} → ${c.status}：沒免疫會失手；免疫時 missChanceOf 回 0 並發 immuneControl`, () => {
      const a = rig(c.champion);
      cast(a, c.ability);
      expect(missChanceOf(a.w, a.victim), `${c.ability} 沒免疫也沒失手 —— 場景是空的`).toBeGreaterThan(0);

      const b = rig(c.champion);
      immunise(b);
      cast(b, c.ability);
      expect(missChanceOf(b.w, b.victim), `免控中仍被 ${c.status} 弄到失手`).toBe(0);
      expect(b.w.status.get(b.victim)!.effects.some((s) => s.statusId === c.status), `${c.status} 掛上了免控的身體`).toBe(false);
      expect(
        b.w.events.some((e) => e.type === "immuneControl" && e.data.statusId === c.status),
        "被擋了但玩家看不見（沒發 immuneControl）",
      ).toBe(true);
    });
  }
});

interface MissSite {
  path: string;
  e: EffectDef & { applyTo?: string; condition?: unknown; statusId: string };
}

/** 通用地走整棵 JSON：任何 `kind:"applyStatus"` 且 `missChance` 最高階 > 0 的節點。 */
function* missSites(node: unknown, path: string): Generator<MissSite> {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) yield* missSites(node[i], `${path}[${i}]`);
    return;
  }
  if (node === null || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  if (o.kind === "applyStatus" && (rankScalarMax(o.missChance as RankScalar | undefined) ?? 0) > 0) {
    yield { path, e: o as unknown as MissSite["e"] };
  }
  for (const k of Object.keys(o).sort()) yield* missSites(o[k], `${path}.${k}`);
}

describe("GH#1041 閘：出貨內容裡每一處帶 missChance 的 applyStatus，免控都要擋得掉", () => {
  it("★ 掃 abilities / items / augments 的整棵效果樹 —— 穿過免控的就指名", () => {
    const sites: MissSite[] = [];
    const pools: [string, { id: string }[]][] = [["abilities", Abilities.all()], ["items", Items.all()], ["augments", Augments.all()]];
    for (const [coll, defs] of pools) {
      for (const d of defs) for (const s of missSites(d, `${coll}/${d.id}`)) if (s.e.applyTo !== "self") sites.push(s);
    }
    expect(sites.length, "掃描一處都沒找到 —— 這道閘是空的").toBeGreaterThan(0);

    const leaked: string[] = [];
    for (const s of sites) {
      const r = rig(CASES[0].champion);
      immunise(r);
      // `condition` 是「要不要發生」，⛔ 不是「免控擋不擋」—— 剝掉它，否則條件不成立的站點永遠綠。
      const { condition: _c, ...bare } = s.e;
      runEffects([bare as EffectDef], ctxOf(r, `gate:${s.path}`));
      if (r.w.status.get(r.victim)!.effects.length > 0) leaked.push(`${s.path} → ${s.e.statusId}`);
    }
    expect(
      leaked,
      `⛔ 這 ${leaked.length}/${sites.length} 處帶 missChance 的狀態穿過了免控（isCc 不認得它們）：\n${leaked.join("\n")}`,
    ).toEqual([]);
  });
});
