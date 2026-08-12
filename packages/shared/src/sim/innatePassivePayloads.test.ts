/**
 * 天生技 PAYLOADS — the #224 residue, proved on the SHIPPED docs.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SUITE EXISTS
 * ---------------------------------------------------------------------------
 * `sim/aura/aura.test.ts` says so itself in its own header: 「This lane writes
 * no content doc … the reference case throughout is `79-00 靈壓`」 — and it
 * then proves the aura mechanism on a FIXTURE it builds inline
 * (`emit(world, id, REIATSU)`). `sim/stealth.ts` is the same story: the whole
 * 隱形 / 真視 feature — `VisionGrant`, `syncVisionGrants`, `StealthState`,
 * `TrueSightState`, `canSee` — was built, and until this commit **not one
 * document in `content/` carried a `vision` block**. Both are failure form ②
 * (算出來了但從沒送到): mechanism green, player gets nothing.
 *
 * So the ONE thing this suite may not do is build its own fixture. Every world
 * below is spawned from the REAL `content/` tree through the REAL
 * `registerAll` → `spawnChampion` → `syncAbilityPassives` path, and every
 * assertion reads runtime state (`world.stats.get(x).final`, `world.stealth`,
 * `canSee`) — never the shape of a document. Delete the payload block from any
 * doc named below and the matching test goes red; that is the whole point.
 *
 * ---------------------------------------------------------------------------
 * THE THREE MECHANISM GROUPS AND WHERE THEIR NUMBERS COME FROM
 * ---------------------------------------------------------------------------
 * Join chain used to recover every one of them (NOT name-matching, NOT
 * proximity grep): `<cid>` → hero rawcode → `OBJECTS.heroes[RC].abilities` ∪
 * `.hero_abilities` → the entry whose `name` is the doc's `name` → that
 * ability's `base` → `stock/STOCK_ABILITIES.json`. All四 heroes below joined by
 * EXACT NAME. ⚠️ The 天生技 sits in `heroes[RC].abilities`, NOT in
 * `.hero_abilities` — the latter is the learnable Q/W/E/R list plus `Aamk`.
 *
 *   G-AURA (fully ported — `Area` and `Data` both present in the w3a)
 *     · 79-00 靈壓 `A0LH` (godie-h01n) base `AOae` Chieftain - Endurance Aura.
 *       `area` 500 → 9.17, `DataB1` −0.25. The map's own prose:
 *       「降低範圍500內敵人攻擊速度25%」.
 *       ⚠️ owner 2026-08-12 裁決:「ok」—— 2026-08-08 的 90 支重製稿把它改寫成
 *       「[攻擊速度] 減半」,所以出貨值**不再是** w3x 的 −25%。上面那兩個 w3a
 *       數字留著是**出處**(它們解釋這支技能從哪裡來),不是今天的出貨值;今天的
 *       出貨值由 `reiatsuAsPct()` 從文件讀,理由寫在那支函式的檔頭。
 *     · 40-00 我~是~孩~子~王~ `A07G` (godie-n01b/godie-nman) base `Aakb`
 *       Aura - War Drums, `DataA1` −0.19, `targets_allowed` "enemies,organic".
 *       ⚠️ ITS RADIUS IS **NOT** PORTED: `A07G.area` is `{}` and the stock row
 *       carries no `Area` column, so 6.42 is a DESIGN CHOICE — the modal aura
 *       radius among the innate docs, the same basis and the same wording
 *       `config.ts`'s `auraRadius` uses for 71-00 暗夜契約. Only the −19 % is
 *       fidelity.
 *
 *   G-STEALTH (fully ported)
 *     · 27-00 永久性的隱形術 `Apiv` (godie-naka) — the map OVERRIDES the stock
 *       `Dur`/`HeroDur` 2 with **4**, which for Permanent Invisibility is the
 *       FADE TIME, matching its own prose 「在4秒內不做任何攻擊或施法動作」.
 *
 *   G-TRUESIGHT (radius NOT ported — read this before trusting the number)
 *     · 16-00 通靈能力 `Atru` (godie-nplh, godie-u01f) and 21-00 灼眼 `A0BE`
 *       base `ANtr` (godie-e008). Both bases are WC3 Detect, whose true-sight
 *       reach comes from the UNIT's sight radius, not from the ability: the
 *       w3a `cast_range` is `{}` and stock `DataA1` is 3 (a detection-type
 *       enum, not a length). 9.17 is taken from `schema/effect.ts`'s own
 *       `zVisionGrant` comment, which asserts 「`Atru` 16-00 通靈能力: 500 →
 *       9.17」 — an assertion that could NOT be re-derived from
 *       `OBJECTS.json`. Shipping that exact figure at least makes the comment
 *       true instead of false, and the field is per-doc editable with bounds.
 *       Treat it as a design value pending owner review, not as fidelity.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 2026-08-13 —— 三位主角**不在營運名單上**了, 而其中一位帶走了整個機制
 * ---------------------------------------------------------------------------
 * owner 把沒上架的英雄連技能一起搬進 `content/_legacy/`（不在 `COLLECTION_NAMES`
 * 裡, 引擎預設讀不到）。這一份點名的四位裡有三位在裡面:
 *   · G-AURA   胖虎 `godie-n01b` / `godie-nman`（40-00 我~是~孩~子~王~）
 *   · G-STEALTH 小次郎 `godie-naka`（27-00 永久性的隱形術）
 *
 * ⭐ 小次郎那一位是**內容發現, 不只是測試問題**: 我掃過留下的 461 支技能,
 * `stealthFadeDelaySec` 在營運母體裡**一支都不剩**。留下來的三支真視
 * （21-00 灼眼 `godie-e008`、16-00 通靈能力 `godie-nplh` / `godie-u01f`）現在
 * 沒有任何東西可以偵測 —— 也就是 CLAUDE.md 第二守則的失敗形態 ②「算出來了但玩家
 * 拿不到」, 只是這一次是**內容側**造成的。⛔ 不在這裡修, 已回報給 owner 裁決。
 *
 * ⛔ 斷言一條都沒有動, 也沒有任何 `.skip` —— 改的只有那三位的文件**去哪裡拿**:
 * 逐位點名地從封存區補進這個 store（`ARCHIVED_SUBJECTS`）, ⛔ 不是把整個
 * `_legacy/` 載進來。理由同 CLAUDE.md ⭐「『分開』不是『丟掉』…… 知識不可以無聲
 * 消失」: 「光環/隱形/真視的 payload 從沒送到玩家手上」是這一批補起來的缺陷,
 * 而它會不會回來跟文件放在哪個資料夾無關。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentStore } from "../content/store";
import { registerAll } from "../content/registries";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { activeAuraSources } from "./aura/aura";
import { canSee, isHidden } from "./stealth";
import { Stat } from "./stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;

/** 開外掛的死神 - 黑崎一護 #79 — G-AURA, attack-speed debuff. */
const ICHIGO = "godie-h01n" as ChampionId;
/** 地獄歌神 - 憤怒的胖虎 #40 — G-AURA, attack-damage debuff. */
const GIAN = "godie-n01b" as ChampionId;
/** 猿飛佐助 - 風魔小次郎 #27 — G-STEALTH. */
const NINJA = "godie-naka" as ChampionId;
/** 通靈人 - 麻倉葉 #16 — G-TRUESIGHT. */
const SEER = "godie-nplh" as ChampionId;
/**
 * The aura tests' TARGET DUMMY. It must be a champion that emits NO aura of its
 * own, or the "enemies" standing in for the measurement would debuff each other
 * AND the emitter, and the `includeSelf` assertion below would be measuring the
 * fixture instead of `aura.ts`. 麻倉葉's 天生技 is a `vision` grant, which
 * touches no stat — every `it` re-asserts that before it measures anything, so
 * if a later lane gives him an aura this suite says so instead of drifting.
 */
const DUMMY = SEER;

/**
 * 79-00 靈壓的攻速減益 —— **從出貨文件推導**,不是抄一個字面值。
 *
 * owner 2026-08-12 裁決:「ok」(B-5)—— 舊行為是 w3a `A0LH` `DataB1` 的 **−25%**
 * (2026-07-25 那一版逐字照抄 w3x),新規格是 2026-08-08 的 90 支重製稿逐字寫的
 * 「[攻擊速度] 減半」= **−50%**。
 *
 * ⛔ 這一格刻意**不再**寫死一個數字。CLAUDE.md 第二守則:出貨數值已經住在
 * `content/abilities/godie-h01n.passive.json`(而且那是後台可編輯的欄位),測試裡
 * 再抄一份就是**第四個住處**,而它沒有守衛 —— owner 這次把 25 改成 50 就是證據:
 * 抄一份的代價是每一次調整都要來改一條跟這個機制無關的測試。
 *
 * 牙齒沒有掉:這支自己 assert「它必須是一個真的減益」,所以「文件被改成 0 / 正數 /
 * 那一格整個消失」三種退化都會在這裡當場紅,而不是靜默讓下面那條 `toBeCloseTo`
 * 退化成 `near === far` 的恆真式。
 */
function reiatsuAsPct(): number {
  const doc = docs("abilities").find((d) => d.id === "godie-h01n.passive");
  const rank0 = (doc?.passive as { ranks?: { auras?: unknown[] }[] } | undefined)?.ranks?.[0];
  const mods = (rank0?.auras as { modifiers?: { stat: string; value: number }[] }[] | undefined)?.[0]
    ?.modifiers;
  const pct = mods?.find((m) => m.stat === "as")?.value;
  expect(pct, "godie-h01n.passive 的光環裡找不到 as 的修飾 —— 靈壓整格不見了").toBeTypeOf("number");
  expect(pct!, "靈壓不是減益了(0 或正數)—— 這條光環現在在幫敵人").toBeLessThan(0);
  return pct!;
}
/**
 * w3a `A07G` `DataA1` —— ⚠️ 這一格**仍然**是字面值,而且是刻意的:−19% 是 w3x 的
 * **保真度事實**(不是 owner 的平衡旋鈕),90 支重製稿一個字都沒有動它。
 * 可調的數值才從文件推導;保真度事實留在測試裡當對照。
 */
const GIAN_AD_PCT = -0.19;
/** w3a `Apiv` `Dur1`/`HeroDur1` as overridden by the map. */
const FADE_SEC = 4;

/**
 * Docs BY PATH, not through `ContentLoader` — the same choice
 * championFormToggle.test.ts makes, so the suite is green both before and after
 * `pnpm content:build` rewrites `_index.json`.
 */
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

/**
 * Heroes named above that now live in `content/_legacy/` (see the 2026-08-13
 * note in the header). ⛔ 逐位點名, ⛔ 不是整個封存區 —— 其餘 38 位沒有守衛在等
 * 他們, 全載進來只會讓這個 store 跟營運母體不一樣。
 */
const ARCHIVED_SUBJECTS = ["godie-n01b", "godie-nman", "godie-naka"] as const;
const ARCHIVE_DIR = join(CONTENT_DIR, "_legacy");

/** Put one archived champion + its ability docs into `store`, never shadowing live. */
function addArchivedChampion(store: ContentStore, cid: string): void {
  // If a hero ever returns to the operational roster the live doc must win —
  // otherwise this suite would quietly go on measuring the archived copy
  // (失敗形態 ⑤: 被測的不是出貨的那個).
  if (store.has("champions", cid)) return;
  const champPath = join(ARCHIVE_DIR, "champions", `${cid}.json`);
  if (!existsSync(champPath)) {
    throw new Error(`${cid}: 營運目錄與 content/_legacy/ 都沒有這位英雄`);
  }
  store.add("champions", cid, JSON.parse(readFileSync(champPath, "utf-8")));
  for (const f of readdirSync(join(ARCHIVE_DIR, "abilities"))) {
    if (!f.startsWith(`${cid}.`) || !f.endsWith(".json")) continue;
    const doc = JSON.parse(readFileSync(join(ARCHIVE_DIR, "abilities", f), "utf-8")) as {
      id: string;
    };
    if (!store.has("abilities", doc.id)) store.add("abilities", doc.id, doc);
  }
}

beforeAll(() => {
  const store = new ContentStore();
  for (const c of [
    "ability-templates",
    "abilities",
    "champions",
    "projectiles",
    "status-effects",
  ] as const) {
    for (const doc of docs(c)) store.add(c, doc.id as string, doc);
  }
  for (const cid of ARCHIVED_SUBJECTS) addArchivedChampion(store, cid);
  registerAll(store);
});

/**
 * Everyone stands on `x = centre.x + 12`, varying only in z — aura.test.ts's
 * line, and for its reason: the skeleton zone has a `radius: 2.5` pillar on its
 * exact centre, so spawning at the centre puts a body inside an obstacle and
 * MovementSystem shoves it out over the following ticks, silently changing the
 * distance under test.
 */
const LINE_X = Z0.center.x + 12;
const P = (dz: number): { x: number; z: number } => ({ x: LINE_X, z: Z0.center.z + dz });

let seat = 0;
function spawn(
  world: SimWorld,
  championId: ChampionId,
  team: 0 | 1,
  at: { x: number; z: number },
): EntityId {
  return spawnChampion(world, {
    championId,
    seatId: asSeatId(seat++),
    teamId: asTeamId(team),
    pos: at,
    zone: 0,
  });
}

/**
 * Advance with every body pinned where it was placed and every order cleared.
 * Pinning matters twice over: it isolates the aura radius from the AI (as
 * aura.test.ts does), and it keeps 小次郎 from swinging — a basic attack calls
 * `breakStealth` and re-arms the 4 s clock, which would make the stealth test
 * fail for a reason that has nothing to do with the doc.
 */
function idle(world: SimWorld, held: Map<EntityId, { x: number; z: number }>, ticks = 1): void {
  for (let k = 0; k < ticks; k++) {
    for (const [, nav] of world.nav) {
      nav.attackTarget = null;
      nav.moveTarget = null;
      nav.order = null;
    }
    for (const [id, at] of held) {
      const t = world.transform.get(id);
      if (t) {
        t.pos.x = at.x;
        t.pos.z = at.z;
      }
    }
    world.step(NO_INTENTS);
  }
}

// ───────────────────────────────────────────────────────────── G-AURA

describe("G-AURA — 天生技 that project an enemy aura", () => {
  // owner 2026-08-12 裁決:「ok」—— 舊行為是 −25% 攻速(w3a `A0LH` DataB1),
  // 新規格是 2026-08-08 重製稿的「[攻擊速度] 減半」。標題不再寫死百分比,因為那個
  // 數字現在是後台旋鈕(見 `reiatsuAsPct`)。
  it("79-00 靈壓 (godie-h01n): an enemy standing inside really loses the shipped attack speed", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const ichigo = spawn(world, ICHIGO, 0, P(0));
    const near = spawn(world, DUMMY, 1, P(3));
    const far = spawn(world, DUMMY, 1, P(20));
    const held = new Map([
      [ichigo, P(0)],
      [near, P(3)],
      [far, P(20)],
    ]);
    idle(world, held, 2);

    const nearAs = world.stats.get(near)!.final[Stat.AttackSpeed];
    const farAs = world.stats.get(far)!.final[Stat.AttackSpeed];

    // `far` is the baseline: same champion, same level, outside the radius.
    expect(farAs).toBeGreaterThan(0);
    expect(nearAs).toBeCloseTo(farAs * (1 + reiatsuAsPct()), 6);
    // ...and it is the AURA doing it, not some other source.
    expect(activeAuraSources(world, near).length).toBe(1);
    expect(activeAuraSources(world, far).length).toBe(0);
    // Doubles as BOTH controls: an "enemy" aura never reaches its own emitter
    // (aura.ts `includeSelf`), AND the dummy standing 3 units away emits
    // nothing back — so the number measured above is 一護's aura and only his.
    expect(activeAuraSources(world, ichigo).length).toBe(0);
  });

  it("40-00 我~是~孩~子~王~ (godie-n01b): an enemy inside really loses 19% attack damage", () => {
    const world = new SimWorld(SKELETON_ARENA, 11);
    const gian = spawn(world, GIAN, 0, P(0));
    const near = spawn(world, DUMMY, 1, P(2));
    const far = spawn(world, DUMMY, 1, P(20));
    const held = new Map([
      [gian, P(0)],
      [near, P(2)],
      [far, P(20)],
    ]);
    idle(world, held, 2);

    const nearAd = world.stats.get(near)!.final[Stat.AttackDamage];
    const farAd = world.stats.get(far)!.final[Stat.AttackDamage];
    expect(farAd).toBeGreaterThan(0);
    expect(nearAd).toBeCloseTo(farAd * (1 + GIAN_AD_PCT), 6);
    expect(activeAuraSources(world, near).length).toBe(1);
    expect(activeAuraSources(world, far).length).toBe(0);
  });

  it("godie-nman carries the SAME 40-00 block as godie-n01b (two units, one hero)", () => {
    // 胖虎 exists as two unit records in the source map and both point at `A07G`.
    // Asserted through the runtime, not by diffing the two JSON files: a doc
    // that parsed but never attached would pass a file diff.
    const world = new SimWorld(SKELETON_ARENA, 13);
    const gian = spawn(world, "godie-nman" as ChampionId, 0, P(0));
    const near = spawn(world, DUMMY, 1, P(2));
    const far = spawn(world, DUMMY, 1, P(20));
    idle(
      world,
      new Map([
        [gian, P(0)],
        [near, P(2)],
        [far, P(20)],
      ]),
      2,
    );
    const nearAd = world.stats.get(near)!.final[Stat.AttackDamage];
    const farAd = world.stats.get(far)!.final[Stat.AttackDamage];
    expect(nearAd).toBeCloseTo(farAd * (1 + GIAN_AD_PCT), 6);
  });
});

// ──────────────────────────────────────────── G-STEALTH + G-TRUESIGHT

describe("G-STEALTH / G-TRUESIGHT — the first content to reach sim/stealth.ts", () => {
  it("27-00 永久性的隱形術 (godie-naka): 4 idle seconds and the body is hidden", () => {
    const world = new SimWorld(SKELETON_ARENA, 17);
    const ninja = spawn(world, NINJA, 0, P(0));
    const held = new Map([[ninja, P(0)]]);

    // The grant exists from spawn, but the clock starts NOW — a hero must walk
    // out of the spawn ring before he disappears (stealth.ts "FIRST ARM").
    idle(world, held, 1);
    expect(world.stealth.get(ninja)).toBeDefined();
    expect(isHidden(world, ninja)).toBe(false);

    // THE number. `fadeDelayTicks` is the doc's 4 s converted once, so this is
    // what fails if the w3a value is edited to anything else — as opposed to
    // "eventually invisible", which any positive number would satisfy. Asserted
    // on the delay rather than on `hiddenFromTick` because the latter also
    // encodes WHICH tick the grant first armed on, which is not under test.
    expect(world.stealth.get(ninja)!.fadeDelayTicks).toBe(Math.round(FADE_SEC / world.dt));

    // One tick BEFORE the deadline he is still visible.
    const deadline = world.stealth.get(ninja)!.hiddenFromTick;
    while (world.tick < deadline - 1) idle(world, held, 1);
    expect(isHidden(world, ninja)).toBe(false);
    idle(world, held, 1);
    expect(isHidden(world, ninja)).toBe(true);
  });

  it("a plain enemy cannot see the hidden ninja, but 16-00 通靈能力 can", () => {
    const world = new SimWorld(SKELETON_ARENA, 19);
    const ninja = spawn(world, NINJA, 0, P(0));
    // 一護 carries an aura but NO vision grant — the negative control.
    const blind = spawn(world, ICHIGO, 1, P(6));
    // 麻倉葉 carries `trueSightRadius: 9.17`, and 6 < 9.17, so he is in range.
    const seer = spawn(world, SEER, 1, P(-6));
    const held = new Map([
      [ninja, P(0)],
      [blind, P(6)],
      [seer, P(-6)],
    ]);

    idle(world, held, 2 + Math.round(FADE_SEC / world.dt));
    expect(isHidden(world, ninja)).toBe(true);

    // THE payoff assertion. It needs BOTH docs to be right: break the `vision`
    // block on godie-naka and the first line fails (nothing is hidden); break
    // it on godie-nplh and the second fails (the seer goes blind).
    expect(canSee(world, blind, ninja)).toBe(false);
    expect(canSee(world, seer, ninja)).toBe(true);
    // A stealthed hero always sees itself, or it would be unplayable.
    expect(canSee(world, ninja, ninja)).toBe(true);
  });

  it("true sight is a RADIUS, not a flag — the same seer goes blind out of range", () => {
    const world = new SimWorld(SKELETON_ARENA, 23);
    const ninja = spawn(world, NINJA, 0, P(0));
    const seer = spawn(world, SEER, 1, P(15)); // 15 > 9.17
    const held = new Map([
      [ninja, P(0)],
      [seer, P(15)],
    ]);
    idle(world, held, 2 + Math.round(FADE_SEC / world.dt));
    expect(isHidden(world, ninja)).toBe(true);
    expect(canSee(world, seer, ninja)).toBe(false);

    // Walk him in and the eye opens, with no re-spawn and no re-attach.
    held.set(seer, P(6));
    idle(world, held, 1);
    expect(canSee(world, seer, ninja)).toBe(true);
  });

  it("21-00 灼眼 (godie-e008) is in the same group with the same parameter", () => {
    const world = new SimWorld(SKELETON_ARENA, 29);
    const ninja = spawn(world, NINJA, 0, P(0));
    const shana = spawn(world, "godie-e008" as ChampionId, 1, P(6));
    const held = new Map([
      [ninja, P(0)],
      [shana, P(6)],
    ]);
    idle(world, held, 2 + Math.round(FADE_SEC / world.dt));
    expect(world.trueSight.get(shana)?.radius).toBe(9.17);
    expect(canSee(world, shana, ninja)).toBe(true);
  });

  it("16-00 通靈能力 on godie-u01f is the same group with the same parameter", () => {
    const world = new SimWorld(SKELETON_ARENA, 31);
    const zhangfei = spawn(world, "godie-u01f" as ChampionId, 0, P(0));
    idle(world, new Map([[zhangfei, P(0)]]), 2);
    expect(world.trueSight.get(zhangfei)?.radius).toBe(9.17);
  });
});
