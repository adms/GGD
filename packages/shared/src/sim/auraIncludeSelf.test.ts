/**
 * 70-00 芬多精 DOES NOT HEAL 白木卡迪那 — `includeSelf: false` on the shipped
 * doc, delivered through the shipped 虛擬蝗蟲群.
 *
 * WHY THIS IS A SEPARATE GUARD FROM auraCarrierContent.test.ts
 * ------------------------------------------------------------
 * That suite asserts the ALLY side (+5 % healthRegen inside 4.58) and says
 * nothing about the host, so it is green whether or not 白木 buffs itself. The
 * host side is the half with a real w3x answer, and the half that was wrong:
 *
 *   w3a `A0GM` 70-00 芬多精(效果) has `base = Aoar` and writes only
 *   `area{1} = 250` and `data{1}{1} = 0.05`. `targets_allowed` is EMPTY, so the
 *   stock row governs, and Blizzard's `Units\AbilityData.slk` says
 *
 *     Aoar  targs1 = ground,air,organic,vuln,invu,friend,neutral
 *
 *   — no `self`. That is not an oversight in the table: the stock FRIENDLY aura
 *   rows DO carry `self` (`air,ground,friend,self,vuln,invu` — Devotion,
 *   Command, Endurance, Brilliance, Trueshot, Thorns, Unholy, Vampiric and
 *   every `ItemAura*`), and the ones that omit it are exactly the emplacement
 *   regen auras `Aoar` (Ward) and `Aabr` (Statue), while `AIgx` — the same
 *   regeneration aura carried by a HERO as an item — adds `self` back.
 *   Blizzard distinguishes "the thing projecting this heals itself" from "it
 *   does not", and 芬多精 is on the side that does not.
 *
 * WHAT IT WOULD HAVE CAUGHT
 * -------------------------
 * `includeSelf` is tested in `auraSystem` as `target === <self>`, and the
 * carrier is NOT the host: `rebuildGrid` keeps 虛擬蝗蟲群 out of the broad
 * phase, so `queryOverlap` can never return the emitter, and the host arrives
 * through the `affects: "ally"` branch instead. Before this guard the field was
 * therefore UNREACHABLE for every carried aura — content could author
 * `includeSelf: false` and the number on the host would not move. That is S8's
 * sibling ② 「算出來但玩家拿不到」, and it is why the census entry for
 * `auras[].includeSelf` could not honestly be waved through as "default-live".
 *
 * The assertions read the FINISHED stat (`stats.final[healthRegen]`) rather
 * than the presence of a source, because a source that recomputeStats ignores
 * would pass a source-shaped assertion and change nothing a player can see.
 *
 * ⚠️⚠️ **這一支點名的 content/ 檔是產生器的產物,⛔ 不是可以直接編的東西。**
 * 改之前先查它是誰的:`bash scripts/genguard.sh content/abilities/godie-e010.passive.json`
 *   · `content/abilities/godie-e010.passive.json` 是 **tiers:apply** 的產物,而且住在**產物隔離區**
 *     (chmod 444 —— 用檔案 API 直寫會吃 PermissionError,⛔ 不是靜默成功)。
 *   · 要動它:改**來源**再 `bash scripts/genrun.sh tiers:apply`。⛔ 手改出貨 JSON 會被下一次
 *     sync 打回來,而那個「又紅了」看起來像**新的**錯(owner 2026-08-24:「發生上百次」)。
 *   · ⭐ **精確範圍**(逐支讀過那支產生器,⛔ 不是照抄稽核的一句話):
 *     apply_tiers.py 只重算**五級距那幾格**(damageTier/flat · cooldownTier · manaCostTier ·
 *     radiusTier · rangeTier),並把 MIRRORED 欄位**單向**鏡射進 content/champions/ 的內嵌副本;
 *     其餘欄位是**原封寫回** ⇒ 那些手改會留下來 —— ⛔ 但那是繞過隔離區的手改,仍然要走 genrun。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentStore } from "../content/store";
import { registerAll } from "../content/registries";
import { Abilities } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { castAbility } from "./abilities/abilitySystem";
import { championFormIndex } from "./systems/ChampionFormSystem";
import { Stat } from "./stats/statTypes";
import { activeAuraSources } from "./aura/aura";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;

/** Clear of the skeleton zone's centre pillar — see aura.test.ts for the trap. */
const LINE_X = Z0.center.x + 12;
const P = (dz: number): { x: number; z: number } => ({ x: LINE_X, z: Z0.center.z + dz });

const BASE = "godie-e00s" as ChampionId;
const ROOTED_INNATE = "godie-e010.passive" as AbilityId;
/** w3a `A0GM` `data{1}{1}` — 「加速生命的回復5%」. */
const AURA_PCT = 0.05;

function docs(collection: string): Record<string, unknown>[] {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map(
      (f) =>
        JSON.parse(readFileSync(join(CONTENT_DIR, collection, f), "utf-8")) as Record<
          string,
          unknown
        >,
    );
}

beforeAll(() => {
  const store = new ContentStore();
  // ability-templates FIRST: `registerAll` expands 鑄技工坊 refs at registration.
  for (const c of [
    "ability-templates",
    "abilities",
    "champions",
    "projectiles",
    "status-effects",
  ] as const) {
    for (const doc of docs(c)) store.add(c, doc.id as string, doc);
  }
  registerAll(store);
});

let seat = 0;
function spawn(world: SimWorld, team: 0 | 1, dz: number): EntityId {
  return spawnChampion(world, {
    championId: BASE,
    seatId: asSeatId(seat++),
    teamId: asTeamId(team),
    pos: P(dz),
    zone: 0,
  });
}

const regenOf = (world: SimWorld, id: EntityId): number =>
  world.stats.get(id)!.final[Stat.HealthRegen];

describe("70-00 芬多精 — allies only, never 白木 itself (w3a A0GM ← Aoar, no `self`)", () => {
  it("THE SHIPPED DOC says so: godie-e010.passive authors includeSelf: false", () => {
    // Anti-⑤ 「被測的不是出貨的那個」: read the registry the sim reads, not a
    // hand-built fixture. If someone drops the field, the behaviour assertion
    // below still fails — but this one names the file to edit.
    const aura = Abilities.get(ROOTED_INNATE).passive?.ranks[0]?.auras?.[0];
    expect(aura, "70-00 芬多精's aura block").toBeDefined();
    expect(aura!.affects).toBe("ally");
    expect(
      aura!.includeSelf,
      // ⚠️ 上一行註解寫「this one names the file to edit」—— 而**那個檔是產物**。
      // 指名一條出貨路徑就結束 = 誤導源(owner 2026-08-24:「發生上百次」)。
      "content/abilities/godie-e010.passive.json —— ⚠️ 那是 **tiers:apply** 的產物(隔離區 chmod 444)。" +
        "查誰寫它:bash scripts/genguard.sh content/abilities/godie-e010.passive.json;" +
        "要動它改**來源**再 bash scripts/genrun.sh tiers:apply,⛔ 手改會被下一次 sync 打回來。",
    ).toBe(false);
  });

  it("紮根: the ally inside the radius gains +5 %, 白木 itself gains NOTHING", () => {
    const world = new SimWorld(SKELETON_ARENA, 70702);
    world.combatActive = true; // 每場開始要重新打開設定 (owner)
    const host = spawn(world, 0, 0);
    const ally = spawn(world, 0, 3); // 3 < 4.58 → inside
    world.step(NO_INTENTS);

    const before = { host: regenOf(world, host), ally: regenOf(world, ally) };
    // Guard the guard: a zero base makes both a ×1.05 and a ×1.00 assertion
    // pass vacuously, so neither direction would mean anything.
    expect(before.host, "白木's base healthRegen is a real number").toBeGreaterThan(0);
    expect(before.ally).toBeGreaterThan(0);

    expect(castAbility(world, host, "PASSIVE", { type: "self" }), "the 紮根 press").toBe("ok");
    for (let i = 0; i < 20; i++) world.step(NO_INTENTS);
    expect(championFormIndex(world, host), "the body really rooted").toBe(1);
    expect(world.auraCarrier.size, "…and the 蝗蟲群 spawned").toBe(1);

    // The positive control. Without it a broken carrier (no aura at all) would
    // satisfy the host assertion for entirely the wrong reason.
    expect(regenOf(world, ally), "the ALLY inside 4.58").toBeCloseTo(
      before.ally * (1 + AURA_PCT),
      6,
    );
    // THE ASSERTION. `includeSelf: false` + `Aoar`'s missing `self` flag.
    //
    // ⚠️ 這裡以前還有一條 `regenOf(host) ≈ before.host`，2026-08-13 拿掉了 ——
    //    ⛔ 不是因為它不方便，是因為它**變成假的了而且原因與光環無關**：
    //    70-00 紮根的 owner 規格有「[力量]增加10點」，而力量**推導** healthRegen
    //    （`sim/stats/derive.ts`）⇒ 宿主的基礎回血在變身那一刻就已經不是
    //    `before.host` 了。留著它等於「同時釘住光環語意與力量係數」的假斷言，
    //    而它紅的時候會說「芬多精治療了自己」—— 一個錯誤的訊息（第二守則：
    //    測試會用錯誤的訊息紅，那比不紅更貴）。
    // ⇒ 驗**機制**：宿主身上一筆光環來源都沒有。這一條對「芬多精有沒有算到
    //    自己」是充分的，而且力量怎麼改都不會動到它。
    expect(activeAuraSources(world, host), "白木 carries no aura source at all").toEqual([]);
  });
});
