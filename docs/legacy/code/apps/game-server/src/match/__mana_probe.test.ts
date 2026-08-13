/**
 * MANA BUDGET PROBE (forensics, task #265). Owner: 「魔力倍率似乎太高了 根本用
 * 不完 MP」. Runs REAL bot matches through MatchController with the shipped
 * combat-env and samples every champion's mana every tick, so the answer is a
 * measured curve, not a paper formula (the ×0.2 cooldown factor changes how
 * often a bot can even try to cast).
 */
import { describe, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCombatEnv, type CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { Champions } from "@ggd/shared/sim/content/registry";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { championStatBase } from "@ggd/shared/sim/stats/attributes";
import type { FireRingConfig } from "@ggd/shared/content";
import type { ChampionId, EntityId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "./MatchController";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../..");
const CONTENT = join(ROOT, "content");

let ENV: CombatEnvMultipliers;
let FR: FireRingConfig;
let COMBAT_MAX_SEC = 180;

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
  const doc = JSON.parse(
    readFileSync(join(CONTENT, "config/config.match.json"), "utf8"),
  ) as { match: { fireRing: FireRingConfig; combatMaxSec: number } };
  FR = doc.match.fireRing;
  COMBAT_MAX_SEC = doc.match.combatMaxSec;
  ENV = normalizeCombatEnv(
    (JSON.parse(readFileSync(join(CONTENT, "config/combat-env.json"), "utf8")) as {
      multipliers: Record<string, number>;
    }).multipliers,
  );
});

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

describe("mana budget", () => {
  it("A1 — paper sheet: max mana, regen/s, and the all-in cost/s per champion", () => {
    const rows: {
      id: string;
      name: string;
      role: string;
      maxMana: number;
      regen: number;
      costPerSec: number;
      net: number;
      secondsToEmpty: number;
    }[] = [];
    for (const def of Champions.all()) {
      // final = base(attributes+env coefficients) × the stat's env factor
      const maxMana = championStatBase(def, Stat.MaxMana, 1, ENV) * ENV.maxMana;
      const regen = championStatBase(def, Stat.ManaRegen, 1, ENV) * ENV.manaRegen;
      // ALL-IN: every core slot at rank 1, fired at its own shortest cooldown
      let costPerSec = 0;
      for (const slot of ["Q", "W", "E", "R"] as const) {
        const a = def.abilities[slot];
        const cost = a.manaCost[0] ?? 0;
        const cd = Math.max(0.1, (a.cooldown[0] ?? 1) * ENV.cooldown);
        if (cost > 0) costPerSec += cost / cd;
      }
      rows.push({
        id: def.id,
        name: def.name,
        role: def.role,
        maxMana,
        regen,
        costPerSec,
        net: regen - costPerSec,
        secondsToEmpty: costPerSec > regen ? maxMana / (costPerSec - regen) : Infinity,
      });
    }
    const neg = rows.filter((r) => r.net < 0);
    console.log(
      `A1: ${rows.length} champions | net regen NEGATIVE (mana can run out) for ${neg.length}` +
        ` | net POSITIVE (mana is free) for ${rows.length - neg.length}`,
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    const SAMPLE = [
      "godie-e002", // Saber (melee fighter)
      "godie-h020", // 莉娜因巴斯 (mage)
      "godie-hart", // bruiser / tank punching bag
      "godie-ogld", // 黑人牙膏 (long-range mage)
      "godie-e00j", // 皇者 騜
      "godie-hlgr", // 鋼彈 煌
      "godie-o01z", // 高町奈葉
      "godie-n003", // 依文潔琳
    ];
    for (const id of SAMPLE) {
      const r = byId.get(id);
      if (!r) continue;
      console.log(
        `A1  ${r.id} ${r.name} [${r.role}] maxMana=${r.maxMana.toFixed(0)} regen=${r.regen.toFixed(
          2,
        )}/s allInCost=${r.costPerSec.toFixed(2)}/s net=${r.net.toFixed(2)}/s emptyIn=${
          r.secondsToEmpty === Infinity ? "never" : r.secondsToEmpty.toFixed(1) + "s"
        }`,
      );
    }
    // what the three knobs do, separately
    const at = (mm: number, mr: number) => {
      let negCount = 0;
      let sumFrac = 0;
      for (const def of Champions.all()) {
        const regen = championStatBase(def, Stat.ManaRegen, 1, ENV) * mr;
        let cps = 0;
        for (const slot of ["Q", "W", "E", "R"] as const) {
          const a = def.abilities[slot];
          const cost = a.manaCost[0] ?? 0;
          const cd = Math.max(0.1, (a.cooldown[0] ?? 1) * ENV.cooldown);
          if (cost > 0) cps += cost / cd;
        }
        if (regen - cps < 0) negCount++;
        const maxMana = championStatBase(def, Stat.MaxMana, 1, ENV) * mm;
        sumFrac += cps > 0 ? Math.min(1, (cps - regen) / Math.max(cps, 1e-9)) : 0;
        void maxMana;
      }
      return { negCount, sumFrac };
    };
    for (const [mm, mr, label] of [
      [3, 4, "SHIPPED  maxMana×3 manaRegen×4"],
      [1, 4, "maxMana×1 manaRegen×4"],
      [3, 1, "maxMana×3 manaRegen×1"],
      [1, 1, "maxMana×1 manaRegen×1 (neutral)"],
      [3, 2, "maxMana×3 manaRegen×2"],
    ] as const) {
      const r = at(mm, mr);
      console.log(`A1 knob ${label}: champions whose all-in drains faster than regen = ${r.negCount}/${rows.length}`);
    }
  });

  it("A2 — real bot match: sample the mana curve every tick of combat", () => {
    const cfg = {
      champSelectTicks: 2,
      intermissionTicks: 3,
      combatMaxTicks: COMBAT_MAX_SEC * 30,
      resolutionTicks: 3,
    };
    // per-entity: ticks alive-in-combat, ticks below 50%, below 20%, at 0
    const agg = { ticks: 0, below50: 0, below20: 0, atZero: 0, below80: 0 };
    const perChamp = new Map<string, { ticks: number; below50: number; min: number }>();
    let roundLens: number[] = [];
    for (let seed = 1; seed <= 5; seed++) {
      const ctl = new MatchController(
        "mana" + seed,
        seed * 7919,
        allBots(),
        cfg,
        undefined,
        undefined,
        undefined,
        undefined,
        ENV,
        FR,
      );
      while (ctl.phase.phase !== "combat") ctl.tick();
      const t0 = ctl.world.tick;
      let g = 0;
      while (ctl.phase.phase === "combat" && g++ < 20000) {
        ctl.tick();
        for (const [id, champ] of ctl.world.champion) {
          const hp = ctl.world.health.get(id as EntityId);
          if (!hp?.alive || hp.maxMana <= 0) continue;
          const frac = hp.mana / hp.maxMana;
          agg.ticks++;
          if (frac < 0.8) agg.below80++;
          if (frac < 0.5) agg.below50++;
          if (frac < 0.2) agg.below20++;
          if (hp.mana <= 0.01) agg.atZero++;
          const key = champ.championId as string;
          const rec = perChamp.get(key) ?? { ticks: 0, below50: 0, min: 1 };
          rec.ticks++;
          if (frac < 0.5) rec.below50++;
          if (frac < rec.min) rec.min = frac;
          perChamp.set(key, rec);
        }
      }
      roundLens.push((ctl.world.tick - t0) / 30);
    }
    const pct = (n: number) => ((100 * n) / Math.max(1, agg.ticks)).toFixed(2) + "%";
    console.log(
      `A2 rounds sampled: ${roundLens.length} (lengths ${roundLens
        .map((x) => x.toFixed(0) + "s")
        .join(",")}) | champion-ticks ${agg.ticks}`,
    );
    console.log(
      `A2 time below 80% mana: ${pct(agg.below80)} | below 50%: ${pct(agg.below50)} | below 20%: ${pct(
        agg.below20,
      )} | at 0: ${pct(agg.atZero)}`,
    );
    const never50 = [...perChamp.values()].filter((r) => r.below50 === 0).length;
    const never80 = [...perChamp.values()].filter((r) => r.min >= 0.8).length;
    console.log(
      `A2 champions that NEVER dropped below 50% mana: ${never50}/${perChamp.size}` +
        ` | never below 80%: ${never80}/${perChamp.size}`,
    );
    const mins = [...perChamp.entries()].sort((a, b) => a[1].min - b[1].min).slice(0, 10);
    for (const [id, r] of mins) {
      const def = Champions.tryGet(id as ChampionId);
      console.log(
        `A2 lowest ${id} ${def?.name ?? ""} min=${(r.min * 100).toFixed(1)}% below50=${(
          (100 * r.below50) / r.ticks
        ).toFixed(1)}%`,
      );
    }
  }, 600_000);

  it("A3 — the same match with manaRegen×1 and with maxMana×1, for comparison", () => {
    const cfg = {
      champSelectTicks: 2,
      intermissionTicks: 3,
      combatMaxTicks: COMBAT_MAX_SEC * 30,
      resolutionTicks: 3,
    };
    for (const [label, over] of [
      ["SHIPPED (mm3, mr4)", {}],
      ["manaRegen x1", { manaRegen: 1 }],
      ["maxMana x1", { maxMana: 1 }],
      ["both x1", { maxMana: 1, manaRegen: 1 }],
      ["manaRegen x1 + cooldown x1", { manaRegen: 1, cooldown: 1 }],
    ] as const) {
      const env = normalizeCombatEnv({ ...ENV, ...over });
      const agg = { ticks: 0, below50: 0, below20: 0, atZero: 0 };
      for (let seed = 1; seed <= 3; seed++) {
        const ctl = new MatchController(
          "cmp" + seed,
          seed * 7919,
          allBots(),
          cfg,
          undefined,
          undefined,
          undefined,
          undefined,
          env,
          FR,
        );
        while (ctl.phase.phase !== "combat") ctl.tick();
        let g = 0;
        while (ctl.phase.phase === "combat" && g++ < 20000) {
          ctl.tick();
          for (const [id] of ctl.world.champion) {
            const hp = ctl.world.health.get(id as EntityId);
            if (!hp?.alive || hp.maxMana <= 0) continue;
            const frac = hp.mana / hp.maxMana;
            agg.ticks++;
            if (frac < 0.5) agg.below50++;
            if (frac < 0.2) agg.below20++;
            if (hp.mana <= 0.01) agg.atZero++;
          }
        }
      }
      const pct = (n: number) => ((100 * n) / Math.max(1, agg.ticks)).toFixed(2) + "%";
      console.log(
        `A3 ${label}: below50 ${pct(agg.below50)} below20 ${pct(agg.below20)} atZero ${pct(agg.atZero)}`,
      );
    }
  }, 900_000);
});
