/**
 * Task #228 — CAST-TELEGRAPH COVERAGE SWEEP (the gate, plus a live matrix).
 *
 * THE QUESTION. 「角色施展時的預告特效…不是每個角色都實作確實」. For EVERY ability
 * of EVERY champion on the open roster, does a telegraph shape actually resolve
 * — and is it the shape the SIM will hit?
 *
 * WHY IT HAS TO BE A SWEEP. The pre-#228 telegraph was not "mostly there": it
 * covered 43 of 255 castable cells honestly (16.9 %), drew a fabricated circle
 * on 93 more, and nothing on the remaining 118 — and NO test would have gone
 * red for any of that, because none existed. A per-champion visual check is the
 * only other detector and it is exactly what the owner was doing by hand. So
 * the derivation is a pure function and the whole roster runs through it here.
 *
 * WHAT GOES RED.
 *   1. any castable ability resolving to NO shape (`resolveTelegraphShape`
 *      returning null) — the single, loud failure mode;
 *   2. any `ground` AoE whose drawn radius is not exactly the sim's
 *      `resolveAbilityRadius(radius ?? 1)` within 0.01 u — the ring may never
 *      re-acquire a fabricated size (#136/#125);
 *   3. the sweep failing to run at all (empty roster, unreadable content).
 *
 * WHERE THE ROSTER COMES FROM. Tracked source, exactly as #128's castability
 * sweep does it: `starterChampions` in apps/platform/internal/curation/
 * starter.go via testkit/starterRoster.ts. The operator whitelist is `.gitignore`d
 * live state and reading it would make this suite pass vacuously off the owner's
 * machine.
 *
 * OUTPUT. `docs/_telegraph-coverage-228.md`, regenerated every run: one row per
 * ability → castType → derived shape → OK / AMBIGUOUS / MISSING.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { readStarterRoster, STARTER_GO_REL } from "@ggd/shared/testkit/starterRoster";
import { effectsOf } from "@ggd/shared/testkit/expandedEffects";
import {
  SIM_GROUND_DEFAULT_RADIUS,
  deriveTelegraphGeometry,
  isPassiveOnlyAbility,
  resolveTelegraphShape,
  type TelegraphAbilityLike,
  type TelegraphCastType,
  type TelegraphEnv,
  type TelegraphGeometry,
} from "./telegraphShape";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const CONTENT = join(REPO_ROOT, "content");
const REPORT = join(REPO_ROOT, "docs", "_telegraph-coverage-228.md");

/** The slots a champion doc can own, in the #192 bar order. */
const SLOTS = ["PASSIVE", "Q", "W", "E", "R", "EX"] as const;
type Slot = (typeof SLOTS)[number];

type Verdict = "OK" | "AMBIGUOUS" | "MISSING" | "PASSIVE";

interface Cell {
  champion: string;
  championName: string;
  slot: Slot;
  abilityId: string;
  abilityName: string;
  castType: TelegraphCastType | "—";
  verdict: Verdict;
  shape: string;
  source: string;
}

interface AbilityDoc extends TelegraphAbilityLike {
  id: string;
  name?: string;
  castTimeSec?: number;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/**
 * 把一份 ability doc 變成**出貨登錄表裡的那個形狀**。
 *
 * ⚠️ 這一層不能省。v0.9.24 有 143 支技能改綁模板,它們的原始 JSON 是
 * `effects: []` + 一個 `template` 綁定 —— 而 `registerAll` 會經過
 * `content/templates/resolve` 把模板展開,所以**執行期拿到的 def 有 effects**。
 * 少了這一層,這個檔就會對著「原始檔」宣告 `godie-uvng.e` / `godie-e002.e`
 * 沒有預告可畫,而遊戲裡它們兩支都有 `spawnProjectile`（實測過）——
 * 也就是 CLAUDE.md 失敗形態 ⑤：**被測的不是出貨的那個**，只是方向相反：
 * 它報一個不存在的缺陷，代價是下一個人花時間去追一個沒有的 bug。
 */
function shipped(doc: AbilityDoc): AbilityDoc {
  if ((doc as { template?: unknown }).template == null) return doc;
  return { ...doc, effects: effectsOf(doc as never) as AbilityDoc["effects"] };
}

let roster: string[] = [];
let cells: Cell[] = [];
let env: TelegraphEnv;
let abilityRange = 1;

beforeAll(() => {
  roster = readStarterRoster(REPO_ROOT);

  // The SAME multiplier the sim applies (#136) and the client's `envFactor`
  // reads — taken from the live combat-env doc, not hard-coded, so the sweep
  // measures the running configuration.
  const combatEnv = readJson<{ multipliers?: Record<string, number> } & Record<string, unknown>>(
    join(CONTENT, "config", "combat-env.json"),
  );
  const mults = (combatEnv.multipliers ?? combatEnv) as Record<string, unknown>;
  abilityRange = typeof mults.abilityRange === "number" ? mults.abilityRange : 1;

  // ⚠️ 2026-08-01 (#251) —— 這裡本來是一份**手打的 5 個 id 白名單**
  // （`imported.bolt` / `imported.wave` / `sela.q.bolt` / `thorne.e.thorn` /
  // `basic-attack`）。內容側後來把匯入的彈道拆成帶元素後綴的版本
  // （`imported.wave.physical` / `imported.wave.arcane` / `imported.bolt.ki` …
  // 出貨 18 份），白名單沒有跟著長 —— 於是 **16 支 skillshot 被這個測試自己的
  // stub 判成「沒有可畫的預告」**，而它們在遊戲裡走的是真的 registry、畫得出來。
  // 也就是說這條 gate 對那 16 支既是假紅、也早就沒有守備力了。
  //
  // 改成讀**出貨的整個 `projectiles` 目錄**：一份清單，不可能再漂開。
  const projectiles = new Map<string, { maxRange: number; hitRadius: number }>();
  const projDir = join(CONTENT, "projectiles");
  for (const f of readdirSync(projDir)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const doc = readJson<{ id: string; maxRange: number; hitRadius: number }>(join(projDir, f));
    projectiles.set(doc.id, doc);
  }
  // 一個都沒讀到 = 下面整張表都會是 MISSING，那是「測試壞了」不是「內容壞了」。
  expect(projectiles.size, "一份彈道文件都沒讀到 —— 這個 sweep 沒有在測東西").toBeGreaterThan(5);
  env = { abilityRange, projectile: (id) => projectiles.get(id) ?? null };

  for (const championId of roster) {
    const champ = readJson<{
      name?: string;
      abilities?: Record<string, AbilityDoc>;
      exAbility?: string;
      passiveAbility?: string;
    }>(join(CONTENT, "champions", `${championId}.json`));

    const byslot = new Map<Slot, AbilityDoc>();
    for (const slot of ["Q", "W", "E", "R"] as const) {
      const doc = champ.abilities?.[slot];
      if (doc) byslot.set(slot, shipped(doc));
    }
    // EX and 天生技 live as standalone docs referenced by id
    for (const [key, slot] of [
      ["exAbility", "EX"],
      ["passiveAbility", "PASSIVE"],
    ] as const) {
      const id = champ[key];
      if (!id) continue;
      byslot.set(slot, shipped(readJson<AbilityDoc>(join(CONTENT, "abilities", `${id}.json`))));
    }

    for (const slot of SLOTS) {
      const def = byslot.get(slot);
      if (!def) continue;
      cells.push(judge(championId, champ.name ?? championId, slot, def));
    }
  }
});

function judge(champion: string, championName: string, slot: Slot, def: AbilityDoc): Cell {
  const base = {
    champion,
    championName,
    slot,
    abilityId: def.id,
    abilityName: def.name ?? def.id,
  };
  // A permanent WC3 passive is never cast, so it has no wind-up to warn about.
  if (isPassiveOnlyAbility(def)) {
    return { ...base, castType: "—", verdict: "PASSIVE", shape: "—", source: "never cast" };
  }
  const geom = deriveTelegraphGeometry(def, env);
  if (geom === null) {
    return {
      ...base,
      castType: def.castType,
      verdict: "MISSING",
      shape: "—",
      source: "NOT DERIVABLE from content",
    };
  }
  // AMBIGUOUS = derivable, but from a SIM DEFAULT rather than authored data.
  // It is still exact (the sim uses the same default), so it draws the true hit
  // area — but it is a content gap worth listing.
  const defaulted = def.castType === "ground" && typeof def.radius !== "number";
  return {
    ...base,
    castType: def.castType,
    verdict: defaulted ? "AMBIGUOUS" : "OK",
    shape: describe_(geom),
    source: geom.source,
  };
}

function describe_(g: TelegraphGeometry): string {
  switch (g.kind) {
    case "circle":
      return `circle r=${g.radius.toFixed(2)}u`;
    case "lock":
      return `lock r=${g.radius.toFixed(2)}u`;
    case "self":
      return `self r=${g.radius.toFixed(2)}u`;
    case "line":
      return `line ${g.length.toFixed(2)}×${g.width.toFixed(2)}u`;
  }
}

/** A cast event shaped exactly as the sim emits one for this castType. */
function castEventFor(def: AbilityDoc): Parameters<typeof resolveTelegraphShape>[1] {
  const casterX = 0;
  const casterZ = 0;
  switch (def.castType) {
    case "ground":
    case "targeted":
      return { casterX, casterZ, point: { x: 3, z: 4 }, direction: { x: 0.6, z: 0.8 } };
    case "skillshot":
    case "dash":
      return { casterX, casterZ, point: null, direction: { x: 0.6, z: 0.8 } };
    default:
      return { casterX, casterZ, point: null, direction: null };
  }
}

describe("every enabled ability resolves to a telegraph (task #228)", () => {
  it("the sweep actually runs over the tracked open roster", () => {
    cover("telegraph-coverage-228");
    expect(roster.length, `${STARTER_GO_REL} declared an empty roster`).toBeGreaterThanOrEqual(40);
    // 48 champions × up to 6 slots — a sweep that silently found 3 cells would
    // be a green test that proves nothing (the #128 lesson).
    expect(cells.length).toBeGreaterThanOrEqual(roster.length * 5);
  });

  it("NO castable ability is MISSING a telegraph — this is the gate", () => {
    cover("telegraph-coverage-228");
    const missing = cells.filter((c) => c.verdict === "MISSING");
    expect(
      missing,
      missing.length === 0
        ? ""
        : "abilities with no derivable telegraph (a player cannot dodge what is not drawn):\n" +
          missing.map((c) => `  ${c.champion} ${c.slot} ${c.abilityId} (${c.castType})`).join("\n"),
    ).toHaveLength(0);
  });

  it("every castable cell also PLACES its shape from the event the sim emits", () => {
    cover("telegraph-coverage-228");
    // Deriving the geometry is only half of it: the event has to be able to put
    // it somewhere. A ground AoE with no `point`, or a corridor with no aim,
    // must not silently render at the origin.
    const unplaceable: string[] = [];
    for (const c of cells) {
      if (c.verdict === "PASSIVE") continue;
      const def = abilityDocFor(c);
      if (resolveTelegraphShape(def, castEventFor(def), env) === null) {
        unplaceable.push(`${c.champion} ${c.slot} ${c.abilityId} (${c.castType})`);
      }
    }
    expect(unplaceable, unplaceable.join("\n")).toHaveLength(0);
  });

  it("a ground AoE draws the SIM's radius × abilityRange, never a fabricated one", () => {
    cover("telegraph-coverage-228");
    let checked = 0;
    for (const c of cells) {
      if (c.castType !== "ground" || c.verdict === "PASSIVE") continue;
      const def = abilityDocFor(c);
      const g = deriveTelegraphGeometry(def, env)!;
      const simRadius = (typeof def.radius === "number" && def.radius > 0
        ? def.radius
        : SIM_GROUND_DEFAULT_RADIUS) * abilityRange;
      expect(g.kind).toBe("circle");
      expect(
        Math.abs((g as { radius: number }).radius - simRadius),
        `${c.abilityId} draws ${(g as { radius: number }).radius} but the sim hits ${simRadius}`,
      ).toBeLessThan(0.01);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("a single-target cast never draws an AoE circle (the 93-cell lie)", () => {
    cover("telegraph-coverage-228");
    const targeted = cells.filter((c) => c.castType === "targeted");
    expect(targeted.length).toBeGreaterThan(0);
    for (const c of targeted) {
      expect(c.shape.startsWith("lock"), `${c.abilityId} drew ${c.shape}`).toBe(true);
    }
  });

  it("writes the per-ability coverage matrix", () => {
    cover("telegraph-coverage-228");
    writeFileSync(REPORT, renderReport(), "utf8");
    expect(readFileSync(REPORT, "utf8").length).toBeGreaterThan(500);
  });
});

/** Re-read the ability doc behind a reported cell (cheap; ~290 small files). */
function abilityDocFor(c: Cell): AbilityDoc {
  if (c.slot === "EX" || c.slot === "PASSIVE") {
    return shipped(readJson<AbilityDoc>(join(CONTENT, "abilities", `${c.abilityId}.json`)));
  }
  const champ = readJson<{ abilities?: Record<string, AbilityDoc> }>(
    join(CONTENT, "champions", `${c.champion}.json`),
  );
  return shipped(champ.abilities![c.slot]!);
}

function renderReport(): string {
  const count = (v: Verdict): number => cells.filter((c) => c.verdict === v).length;
  const castable = cells.filter((c) => c.verdict !== "PASSIVE").length;
  const byType = new Map<string, number>();
  for (const c of cells) byType.set(c.castType, (byType.get(c.castType) ?? 0) + 1);

  const lines: string[] = [];
  lines.push("# 技能預告特效覆蓋率 — cast-telegraph coverage (task #228)");
  lines.push("");
  lines.push(
    "> GENERATED by `apps/client/src/vfx/telegraphCoverage.test.ts` on every run. Do not hand-edit.",
  );
  lines.push("");
  lines.push(
    "Every ability of every champion on the tracked open roster " +
      `(\`${STARTER_GO_REL}\`), run through the pure derivation in ` +
      "`apps/client/src/vfx/telegraphShape.ts` — the same function `VfxSystem` " +
      "calls for a live cast. Sizes are post-`abilityRange` " +
      `(#136, live value **${abilityRange}**), i.e. exactly the geometry the sim's ` +
      "own hit query uses.",
  );
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| verdict | cells | meaning |");
  lines.push("| --- | ---: | --- |");
  lines.push(`| ✅ OK | ${count("OK")} | shape derived from the ability's own authored data |`);
  lines.push(
    `| 🟡 AMBIGUOUS | ${count("AMBIGUOUS")} | derived from the SIM's default (\`def.radius ?? ${SIM_GROUND_DEFAULT_RADIUS}\`) — still the true hit area, but the doc should author it |`,
  );
  lines.push(`| ❌ MISSING | ${count("MISSING")} | no derivable shape — **fails the test** |`);
  lines.push(`| 🟣 PASSIVE | ${count("PASSIVE")} | permanent WC3 passive, never cast, nothing to warn about |`);
  lines.push("");
  lines.push(
    `**${count("OK") + count("AMBIGUOUS")} / ${castable} castable cells telegraph honestly ` +
      `(${((100 * (count("OK") + count("AMBIGUOUS"))) / Math.max(1, castable)).toFixed(1)} %).** ` +
      "Before #228 the honest number was 43 / 255 (16.9 %): only `ground` casts reached the " +
      "floor, `targeted` drew a fabricated 0.72 u ring that lied about a single-target hit, " +
      "and `self` / `skillshot` / `dash` drew nothing at all.",
  );
  lines.push("");
  lines.push("## By castType");
  lines.push("");
  lines.push("| castType | cells | shape language |");
  lines.push("| --- | ---: | --- |");
  const LANGUAGE: Record<string, string> = {
    ground: "circle — the real `enemiesInCircle` disc; you can walk out",
    targeted: "lock (arc at the victim + tether to the caster) — walking does not help",
    skillshot: "line — the projectile's corridor; step sideways",
    dash: "line — the sweep of the dash body",
    self: "self marker at the caster's feet",
    "—": "not cast",
  };
  for (const [t, n] of [...byType].sort((a, b) => b[1] - a[1])) {
    lines.push(`| \`${t}\` | ${n} | ${LANGUAGE[t] ?? ""} |`);
  }
  lines.push("");
  lines.push("## Per-ability matrix");
  lines.push("");
  lines.push("| champion | slot | ability | castType | telegraph | verdict | derived from |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  const ICON: Record<Verdict, string> = {
    OK: "✅",
    AMBIGUOUS: "🟡",
    MISSING: "❌",
    PASSIVE: "🟣",
  };
  for (const c of cells) {
    lines.push(
      `| ${c.championName} \`${c.champion}\` | ${c.slot} | ${c.abilityName} | \`${c.castType}\` | ` +
        `${c.shape} | ${ICON[c.verdict]} ${c.verdict} | ${c.source} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
