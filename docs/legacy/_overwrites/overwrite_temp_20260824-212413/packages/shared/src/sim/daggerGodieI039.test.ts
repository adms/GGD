/**
 * 幻之匕首 (godie-i039) — the 20% on-hit, driven through the real sim (GH#641).
 *
 * owner 2026-08-23:
 *   > 「幻之匕首似乎沒有20%傷害」
 *
 * The card's claim IS the spec: 「[普通攻擊時] 3%機率造成敵方 20%生命傷害」.
 * Reconciliation (this file's reason to exist) measured the SHIPPED doc through
 * the SHIPPED pipeline — spawn, grant, auto-engage, swing, hook roll, packet —
 * and the chunk lands at exactly hpPct × 現有生命 × mitigation on BOTH the melee
 * swing path (BasicAttackSystem:568) and the projectile hit path
 * (ProjectileSystem:118). So the guard pins what the probe proved, end to end:
 * a synthetic payload here would measure a fictional channel (失敗形態 ⑤).
 *
 * EVERY expected factor is derived at runtime — the hpPct column from the
 * registry-loaded doc, the global mult from `world.combatEnv`, the armor curve
 * from `mitigationMult` — no shipped number is baked into an assertion
 * (第二守則: 驗機制不驗數字). The one literal left is the owner's own 0.2/0.03,
 * asserted against the LOADED doc so a Zod strip or a doc edit is visible.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentStore } from "../content/store";
import { registerAll } from "../content/registries";
import { Items } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { grantItemFree } from "./economy/shop";
import { mitigationMult } from "./combat/penetration";
import { Stat } from "./stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;
const DAGGER = "godie-i039" as ItemId;
const MELEE = "godie-o02l" as ChampionId;

function docs(collection: string): Record<string, unknown>[] {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(CONTENT_DIR, collection, f), "utf-8")) as Record<string, unknown>);
}

beforeAll(() => {
  const store = new ContentStore();
  for (const c of ["ability-templates", "abilities", "champions", "projectiles", "status-effects", "items"] as const) {
    for (const doc of docs(c)) store.add(c, doc.id as string, doc);
  }
  registerAll(store);
});

describe("幻之匕首 [普通攻擊時] 3%機率造成敵方 20%生命傷害", () => {
  it("THE LOADED DOC still carries the proc — Zod kept hpPct, basis current", () => {
    // The registry copy, not the file: a schema that silently strips `hpPct`
    // would leave `amount:{}` alone = a 0-damage proc that looks authored.
    const hook = (Items.get(DAGGER).passive ?? []).find((h) => h.on === "onBasicAttack");
    expect(hook, "幻之匕首's on-hit hook").toBeDefined();
    expect(hook!.chance).toBe(0.03);
    const eff = hook!.effects[0]!;
    if (eff.kind !== "damage") throw new Error(`expected damage, got ${eff.kind}`);
    expect(eff.damageType).toBe("physical");
    expect(eff.hpPct?.basis).toBe("current");
    expect(eff.hpPct?.perRank[0]).toBe(0.2);
  });

  it("a real auto-attack duel procs it, and each chunk is hpPct × the victim's CURRENT hp", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    let seat = 0;
    const spawn = (team: 0 | 1, dx: number): EntityId =>
      spawnChampion(world, {
        championId: MELEE,
        seatId: asSeatId(seat++),
        teamId: asTeamId(team),
        pos: { x: Z0.center.x + dx, z: Z0.center.z + 8 },
        zone: 0,
      });
    const holder = spawn(0, -0.6);
    const victim = spawn(1, 0.6);
    expect(grantItemFree(world, holder, DAGGER)).toBeGreaterThanOrEqual(0);
    const vh = world.health.get(victim)!;
    const hh = world.health.get(holder)!;
    vh.maxHp = 1e9; vh.hp = 1e9; // big pool: many procs at DIFFERENT current hp
    hh.maxHp = 1e9; hh.hp = 1e9;
    world.nav.get(holder)!.attackTarget = victim;

    // Every factor below comes off the live world, not a literal: the doc's
    // own column, the shipped env knob, the victim's real armor curve.
    const eff = (Items.get(DAGGER).passive ?? [])[0]!.effects[0]!;
    const pct = eff.kind === "damage" ? (eff.hpPct?.perRank[0] ?? 0) : 0;
    const factor = (): number =>
      world.combatEnv.damageDealt *
      mitigationMult(
        world.stats.get(victim)!.final[Stat.Armor],
        world.mitigationRules.negativeResistAmplifyCeiling,
      );

    let basics = 0;
    const r6 = (n: number): number => Number(n.toFixed(6));
    const quietSwings = new Set<number>(); // basic amounts on NON-proc ticks
    const procs: { amount: number; hpBefore: number; basicAmt?: number; vfxId?: string }[] = [];
    for (let t = 0; t < 4000; t++) {
      const hpBefore = vh.hp;
      world.step(NO_INTENTS);
      let basicAmt: number | undefined;
      let proc: { amount: number; hpBefore: number; basicAmt?: number; vfxId?: string } | undefined;
      for (const ev of world.events) {
        if (ev.type === "vfxSpawn") {
          // the dagger's spawnVfx runs in the same effects list right after its
          // damage effect, so the FIRST vfxSpawn after the proc packet is its own
          if (proc && proc.vfxId === undefined) proc.vfxId = (ev.data as { vfxId?: string }).vfxId;
          continue;
        }
        if (ev.type !== "damage") continue;
        const d = ev.data as { origin?: string; amount?: number; target?: unknown };
        if (d.target !== victim) continue;
        if (d.origin === "basic") {
          basics++;
          basicAmt = d.amount;
        } else if (String(d.origin).includes(DAGGER)) {
          proc = { amount: d.amount ?? 0, hpBefore };
          procs.push(proc);
        }
      }
      if (proc) proc.basicAmt = basicAmt;
      else if (basicAmt !== undefined) quietSwings.add(r6(basicAmt));
    }
    expect(procs.length, "the 3% never fired in 4000 ticks of auto-attacks").toBeGreaterThanOrEqual(2);
    // 「3%機率」 is a real gate: procs stay RARE relative to swings, not 1:1.
    expect(procs.length).toBeLessThan(basics * 0.2);
    // GH#641 (reopened) 方向②: the swing that PROCS carries the same basic packet
    // as any quiet swing — the 20% chunk is a SEPARATE packet, never a swing
    // inflated by 1.2 (and quiet swings carry no hidden extra: their amounts are
    // the only members of this set).
    const vfxBinding = (Items.get(DAGGER).passive ?? [])[0]!.effects.find((e) => e.kind === "spawnVfx");
    if (vfxBinding?.kind !== "spawnVfx") {
      throw new Error("幻之匕首的觸發缺噴血綁定 —— passive[0].effects 裡沒有 spawnVfx (GH#641)");
    }
    for (const p of procs) {
      // basis=current is load-bearing here: hp DECAYS across the duel, so a
      // max-basis (constant chunk) or flat-damage regression cannot track this.
      expect(p.amount / (p.hpBefore * pct * factor())).toBeCloseTo(1, 5);
      expect(p.basicAmt, "a proc without its swing's own basic packet").toBeDefined();
      expect(quietSwings.has(r6(p.basicAmt!))).toBe(true);
      // GH#641 血花綁定: the proc tick REALLY emits the item's declared vfx —
      // the vfxId is read off the LOADED doc, never a literal (mutation line:
      // delete the spawnVfx entry from godie-i039.json → red here).
      expect(p.vfxId).toBe(vfxBinding.vfxId);
    }
  });
});
