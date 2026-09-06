/**
 * #1017 量測：翻開一擊必殺夾限之後，實際會被夾到的比例。
 * 跑真的 headless 比賽（MatchController + 12 bots + 出貨內容），夾限**關著**收每一發打在英雄身上的
 * `damage` 事件，算 amount / 受害者 maxHp；> maxFractionOfMaxHp 的就是翻開後會被夾的那些。
 * ⚠️ `damage` 事件的 amount 是落地的掉血（護盾之後）；夾限夾的是護盾之前的 impact ⇒ 這裡量到的是**下界**。
 */
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { SHIPPED_ONE_SHOT_CLAMP } from "@ggd/shared/content/schema/config/oneShotClamp";
import { CONTENT } from "./testkit/contentFixtures";
import { MatchController, type SeatSpec } from "./match/MatchController";
import { resolveArenaRules } from "./match/arenaRules";

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

const seeds = (process.env.SEEDS ?? "4242,7,99").split(",").map(Number);
const FRACTION = SHIPPED_ONE_SHOT_CLAMP.maxFractionOfMaxHp;

registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);

let heroHits = 0;
let clamped = 0;
let trimSum = 0; // Σ (fraction - FRACTION) / fraction  = 被夾掉幾成
const perAbility = new Map<string, { hits: number; clamped: number; maxFrac: number }>();
const byRound = new Map<number, { hits: number; clamped: number }>();
let matches = 0;
let rounds = 0;

for (const seed of seeds) {
  const ctl = new MatchController(`clamp-${seed}`, seed, allBots(), undefined, undefined, resolveArenaRules());
  const w = ctl.world;
  w.oneShotClamp = { ...SHIPPED_ONE_SHOT_CLAMP, enabled: false };
  const orig = w.emit.bind(w);
  let curRound = 0;
  w.emit = (type: string, data: Record<string, unknown>) => {
    if (type === "damage") {
      const target = data["target"] as number;
      const amount = data["amount"] as number;
      if (w.champion.has(target) && amount > 0) {
        const hp = w.health.get(target);
        if (hp && hp.maxHp > 0) {
          const frac = amount / hp.maxHp;
          heroHits++;
          const origin = String(data["origin"] ?? "?");
          const key = origin.startsWith("ability:") ? origin.slice("ability:".length) : origin;
          const pa = perAbility.get(key) ?? { hits: 0, clamped: 0, maxFrac: 0 };
          pa.hits++;
          pa.maxFrac = Math.max(pa.maxFrac, frac);
          const br = byRound.get(curRound) ?? { hits: 0, clamped: 0 };
          br.hits++;
          if (frac > FRACTION) {
            clamped++;
            pa.clamped++;
            br.clamped++;
            trimSum += (frac - FRACTION) / frac;
          }
          perAbility.set(key, pa);
          byRound.set(curRound, br);
        }
      }
    }
    orig(type, data);
  };
  let seenRound = 0;
  for (let n = 0; n < 400_000 && ctl.phase.phase !== "matchEnd"; n++) {
    if (ctl.phase.phase === "combat" && ctl.phase.round !== seenRound) {
      seenRound = ctl.phase.round;
      curRound = seenRound;
      rounds++;
    }
    ctl.tick();
  }
  matches++;
  console.log(`seed ${seed}: rounds ${seenRound}, hero hits so far ${heroHits}, clamped so far ${clamped}`);
}

console.log(`\nMATCHES ${matches}  ROUNDS ${rounds}  HERO-HITS ${heroHits}`);
console.log(`> ${FRACTION}×maxHp (would be clamped): ${clamped}  = ${((100 * clamped) / Math.max(1, heroHits)).toFixed(3)}%`);
console.log(`avg trim among clamped: ${clamped ? ((100 * trimSum) / clamped).toFixed(1) : "n/a"}%`);
console.log("\nby round:");
for (const [r, v] of [...byRound.entries()].sort((a, b) => a[0] - b[0])) console.log(`  r${r}: hits ${v.hits} clamped ${v.clamped}`);
console.log("\ntop sources by maxFrac:");
for (const [k, v] of [...perAbility.entries()].sort((a, b) => b[1].maxFrac - a[1].maxFrac).slice(0, 15))
  console.log(`  ${k.padEnd(28)} hits ${String(v.hits).padStart(5)} clamped ${String(v.clamped).padStart(4)} maxFrac ${(100 * v.maxFrac).toFixed(0)}%`);
