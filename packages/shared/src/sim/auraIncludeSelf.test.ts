/**
 * 70-00 芬多精 **也治療白木自己** — `includeSelf: true` on the shipped doc,
 * delivered through the shipped 虛擬蝗蟲群。
 *
 * ⭐ owner 2026-08-13 逐字裁決（這一條**推翻了**這支守衛原本的方向）：
 *
 *     「70-00 follow new rule not w3a. healing friend and self.」
 *
 * ── 為什麼原本是反過來的，以及為什麼那不再算數 ───────────────────────────
 * 這支守衛原本釘的是「白木**不會**回自己的血」，理由是 w3a `A0GM` 的 base 是
 * `Aoar`，而 Blizzard 的 `AbilityData.slk` 裡 `Aoar` 的 `targs1` 沒有 `self`
 * —— 那個考證是對的，而且不是筆誤（stock 的友方光環 `Adev`/`Acoa`/`Aakb` 都帶
 * `self`，只有據點型的 `Aoar`(Ward) 與 `Aabr`(Statue) 不帶）。
 *
 * ⛔ 但它是**第 5 層**（w3x 原始設定），而 owner 的新版說明是**第 1 層**。
 * CLAUDE.md 第〇·六守則：GGD 是重製不是移植，設計贏過考古。
 * ⭐ 被取代的原作事實**另存**在 `docs/_w3x-fidelity-superseded.md` ——
 *    測試可以跟著設計走，**知識不可以無聲消失**。
 *
 * ── 這支守衛為什麼仍然值得存在（方向變了，價值沒變）───────────────────
 * `includeSelf` 在 `auraSystem` 是 `target === <self>`，而載體**不是**宿主：
 * `rebuildGrid` 把 虛擬蝗蟲群 排除在 broad phase 之外，所以 `queryOverlap`
 * 永遠回不到發射器，宿主是從 `affects:"ally"` 那條分支進來的。
 * ⇒ 在這支守衛出現以前，這一格對每一個「被載體帶著的光環」**都是不可達的**：
 *   內容寫 `includeSelf` 任何值，宿主身上的數字都不會動（失敗形態②）。
 *   那正是 `auras[].includeSelf` 不能被當成 "default-live" 揮手放過的原因。
 *
 * 斷言讀的是**完成後的屬性**（`stats.final[healthRegen]`），⛔ 不是「有沒有一筆
 * 來源」—— 一筆 recomputeStats 不理會的來源會通過「來源形狀」的斷言而什麼都不改。
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

describe("70-00 芬多精 — 友軍**與白木自己**（owner 2026-08-13 新版規則，⛔ 不是 w3a）", () => {
  it("出貨文件就是這樣寫的：godie-e010.passive 的 includeSelf 是 true", () => {
    // Anti-⑤ 「被測的不是出貨的那個」: read the registry the sim reads, not a
    // hand-built fixture. If someone drops the field, the behaviour assertion
    // below still fails — but this one names the file to edit.
    const aura = Abilities.get(ROOTED_INNATE).passive?.ranks[0]?.auras?.[0];
    expect(aura, "70-00 芬多精's aura block").toBeDefined();
    expect(aura!.affects).toBe("ally");
    expect(aura!.includeSelf, "content/abilities/godie-e010.passive.json").toBe(true);
  });

  it("紮根：半徑內的隊友 +5%，**白木自己也 +5%**", () => {
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
    expect(regenOf(world, ally), "半徑 4.58 內的隊友").toBeCloseTo(
      before.ally * (1 + AURA_PCT),
      6,
    );
    // THE ASSERTION. `includeSelf: false` + `Aoar`'s missing `self` flag.
    // ⭐ owner 2026-08-13「healing friend and self」⇒ 宿主拿到**同一份** 5%。
    //    ⛔ 不要只斷言「有一筆來源」：那種形狀的斷言對一筆 recomputeStats 不理會
    //    的來源也會過（失敗形態⑦：掃屬性代替掃行為）。
    // ⭐ owner 2026-08-13「healing friend and self」⇒ 宿主也拿到那 5%。
    // ⚠️ ⛔ 不可以拿 `before.host × 1.05` 當基準：紮根同時給 +10 力量
    //    （規格的「[力量]增加10點」），而力量**推導** healthRegen ——
    //    宿主的**基礎**回血在變身那一刻就已經不是 before.host 了。
    //    抄一個 1.05 的乘積進來會變成「同時釘住光環與力量係數」的假斷言。
    // ⇒ 驗**機制**：宿主身上真的有一筆光環來源，而且它讓最終回血比
    //    「同樣紮根但沒有這個光環」高。後者用隊友當對照 —— 隊友沒有力量加成，
    //    所以 `ally = allyBase × 1.05` 是乾淨的那一半（上面已經斷言過）。
    const hostSources = activeAuraSources(world, host);
    expect(hostSources.length, "宿主身上真的有一筆來自光環的來源").toBeGreaterThan(0);
    expect(regenOf(world, host), "白木 也回自己的血（owner 新版規則）").toBeGreaterThan(
      before.host,
    );
  });
});
