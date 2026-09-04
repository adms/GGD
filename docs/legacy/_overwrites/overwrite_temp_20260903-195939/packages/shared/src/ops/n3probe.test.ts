// TEMP PROBE — GH#961 逐份判定用，跑完即刪。⛔ 不 commit。
import { describe, it, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentStore } from "../content/store";
import { registerAll } from "../content/registries";
import { SimWorld } from "../sim/SimWorld";
import { SKELETON_ARENA } from "../sim/world/ArenaDef";
import { spawnChampion } from "../sim/spawnChampion";
import { abilityPassiveSourceId, syncAbilityPassives } from "../sim/abilities/abilityPassives";
import { fireHooks } from "../sim/effects/hooks";
import { runEffects } from "../sim/effects/effectRunner";
import { asSeatId, asTeamId, type ChampionId, type StatusId } from "../ids";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");
const ABILITIES = join(CONTENT, "abilities");
const ZC = SKELETON_ARENA.zones[0]!.center;
const BATCH = [
  "godie-e00l.r",
  "godie-h00l.r",
  "godie-e00w.passive",
  "godie-emfr.ex",
  "godie-e00r.ex",
  "godie-nbbc.passive",
  "godie-hapm.q",
  "godie-e00s.ex",
  "godie-edem.r",
  "godie-h01u.r",
  "godie-e00s.w",
  "godie-efur.passive",
];

beforeAll(() => {
  const store = new ContentStore();
  for (const c of ["ability-templates", "abilities", "champions", "projectiles", "status-effects"] as const)
    for (const f of readdirSync(join(CONTENT, c)).filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
      const d = JSON.parse(readFileSync(join(CONTENT, c, f), "utf-8")) as { id: string };
      store.add(c, d.id, d);
    }
  registerAll(store);
});

function walk(n: unknown, path: string, out: [string, Record<string, unknown>][]): void {
  if (Array.isArray(n)) return void n.forEach((v, i) => walk(v, `${path}[${i}]`, out));
  if (n === null || typeof n !== "object") return;
  for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
    if (k === "hooks" && Array.isArray(v))
      v.forEach((h, i) => {
        if (h && typeof h === "object" && typeof (h as { on?: unknown }).on === "string")
          out.push([`${path}/hooks[${i}]`, h as Record<string, unknown>]);
      });
    walk(v, `${path}/${k}`, out);
  }
}

describe("probe", () => {
  it("逐份", () => {
    for (const id of BATCH) {
      const doc = JSON.parse(readFileSync(join(ABILITIES, `${id}.json`), "utf-8")) as Record<string, unknown>;
      const hs: [string, Record<string, unknown>][] = [];
      walk(doc, "", hs);
      for (const [path, hook] of hs) {
        const pm = /^\/passive\/ranks\[(\d+)\]\/hooks\[(\d+)\]$/.exec(path);
        const bm = /^\/effects\[(\d+)\]\/hooks\[(\d+)\]$/.exec(path);
        if (!pm && !bm) {
          // eslint-disable-next-line no-console
          console.log(`${id} ${path} on=${String(hook["on"])} → 巢狀更深（外層 hook 先發動才存在）`);
          continue;
        }
        const outer = Number((pm ?? bm)![1]);
        const index = Number((pm ?? bm)![2]);
        const w = new SimWorld(SKELETON_ARENA, 20260903);
        w.combatActive = true;
        const champ = id.slice(0, id.lastIndexOf(".")) as ChampionId;
        const own = spawnChampion(w, { championId: champ, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: ZC.x + 8, z: ZC.z }, zone: 0 });
        const foe = spawnChampion(w, { championId: champ, seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: ZC.x + 11, z: ZC.z }, zone: 0 });
        const sc = w.stats.get(own)!;
        const ab = w.abilities.get(own)!;
        const rank = pm ? outer + 1 : 1;
        for (const s of ["Q", "W", "E", "R"] as const) ab.slots[s].rank = rank;
        if (ab.exSlot) ab.exSlot.rank = rank;
        syncAbilityPassives(w, own);
        let attached: Record<string, unknown> | undefined;
        let sid = "";
        if (pm) {
          const src = sc.sources.find((s) => s.id === abilityPassiveSourceId(id));
          attached = src?.hooks?.[index] as Record<string, unknown> | undefined;
          sid = src?.id ?? "";
        } else {
          const eff = (doc["effects"] as unknown[] | undefined)?.[outer];
          const before = new Set(sc.sources.map((s) => s.id));
          runEffects([eff as never], { world: w, caster: own, rank: 1, targets: [own], origin: `ability:${id}`, rng: w.rng });
          const src = sc.sources.find((s) => !before.has(s.id) && s.hooks !== undefined);
          attached = src?.hooks?.[index] as Record<string, unknown> | undefined;
          sid = src?.id ?? "";
        }
        if (!attached) {
          // eslint-disable-next-line no-console
          console.log(`${id} ${path} on=${String(hook["on"])} → ⛔ 掛不上`);
          continue;
        }
        const c = hook["condition"] as { kind?: string; subject?: string; tag?: string; statusId?: string } | undefined;
        if (c?.kind === "status") {
          const who = c.subject === "target" ? foe : own;
          w.status.set(who, { effects: [{ statusId: (c.tag ?? c.statusId) as StatusId, sourceId: "p", expiresAtTick: w.tick + 600 }] });
        }
        if (c?.kind === "stat") {
          const h = w.health.get(c.subject === "target" ? foe : own);
          if (h) h.hp = Math.max(1, Math.floor(h.maxHp * 0.05));
        }
        const needsPkt = ["damageSource", "damageType", "damageCrit", "critSource", "reflectedDamageSource", "reflectedDamageType"].some((k) => hook[k] !== undefined);
        const pkt = needsPkt
          ? {
              raw: 100, mitigated: 100, hpLost: 100,
              origin: hook["damageSource"] === "basic" ? "basic" : "ability:t.q",
              reflectDepth: 1, resolvePass: 0,
              type: (hook["damageType"] ?? "magic") as never,
              crit: hook["damageCrit"] === "crit",
              ...(hook["critSource"] === "thisSource" ? { critSources: [sid] } : {}),
              ...(hook["reflectedDamageSource"] !== undefined || hook["reflectedDamageType"] !== undefined
                ? { reflectedFrom: { origin: hook["reflectedDamageSource"] === "basic" ? "basic" : "ability:t.q", type: (hook["reflectedDamageType"] ?? "magic") as never } }
                : {}),
            }
          : undefined;
        const only = (h: unknown): boolean => h === attached;
        const rolls = hook["chance"] !== undefined ? 200 : 1;
        let n = 0;
        for (let i = 0; i < rolls && n === 0; i++) {
          n += fireHooks(w, own, String(hook["on"]) as never, foe, hook["abilitySlot"] as never, pkt as never, undefined, only as never);
          if (rolls > 1) w.tick++;
        }
        // eslint-disable-next-line no-console
        console.log(`${id} ${path} on=${String(hook["on"])} 閘=[${Object.keys(hook).filter((k) => !["on", "effects", "target"].includes(k)).join(",")}] → fired=${n}`);
      }
    }
    // ── 巢狀更深的那兩條：先讓外層 onDamageTaken 發動，再問 onInterval ────────
    {
      const id = "godie-e00r.ex";
      const w = new SimWorld(SKELETON_ARENA, 20260903);
      w.combatActive = true;
      const own = spawnChampion(w, { championId: "godie-e00r" as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: ZC.x + 8, z: ZC.z }, zone: 0 });
      const foe = spawnChampion(w, { championId: "godie-e00r" as ChampionId, seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: ZC.x + 11, z: ZC.z }, zone: 0 });
      const sc = w.stats.get(own)!;
      w.abilities.get(own)!.exSlot!.rank = 1;
      syncAbilityPassives(w, own);
      const h = w.health.get(own)!;
      h.hp = Math.max(1, Math.floor(h.maxHp * 0.05));
      const before = new Set(sc.sources.map((s) => s.id));
      const outerFired = fireHooks(w, own, "onDamageTaken" as never, foe);
      const born = sc.sources.filter((s) => !before.has(s.id) && s.hooks?.length);
      const iv = born.flatMap((s) => (s.hooks ?? []).filter((x) => (x as { on?: string }).on === "onInterval"));
      let n = 0;
      for (const one of iv) n += fireHooks(w, own, "onInterval" as never, undefined, undefined, undefined, undefined, ((x: unknown) => x === one) as never);
      // eslint-disable-next-line no-console
      console.log(`${id} 巢狀 onInterval：外層 fired=${outerFired} → 生出 ${born.length} 個帶 hook 的來源、${iv.length} 條 onInterval → fired=${n}`);
    }
  });
});
