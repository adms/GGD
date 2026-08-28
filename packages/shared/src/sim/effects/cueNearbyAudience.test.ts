/**
 * `screenShake/screenFlash` 的 `applyTo:"nearby"` —— **範圍限定的觀眾**（GH#838 N3）。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 承重的斷言是「**施法者自己也在名單上，而圈外的人不在**」
 * ---------------------------------------------------------------------------
 * ⛔ **不是**「名單非空」——`applyTo:"victim"` + `side:"enemies"` 也會給一份非空
 * 名單，而它**正好漏掉施法者**（他是自己的友軍）。JASS 是
 * `ForGroup(GetUnitsInRangeOfLoc**All**(R), CameraSetEQNoiseForPlayer)`
 * —— war3map.j 的 40 次鏡頭噪動裡 **38 次**是這個形狀，而施法者的玩家一定會震。
 * ⇒ 這條測試同時量**兩個方向**（該在的在、該不在的不在），因為單邊校準的尺
 * 「會在它最需要說話的時候沉默」（CLAUDE.md 第一守則）。
 *
 * ---------------------------------------------------------------------------
 * 突變紀錄（都真的做過）
 * ---------------------------------------------------------------------------
 *   · `clientCues.ts` 的 `nearbyBothSides` 只回 `side:"enemies"` 那一半 → 紅（施法者不見了）
 *   · 只回 `side:"allies"` 那一半                                       → 紅（敵人不見了）
 *   · `cueRecipients` 的 `nearby` 分支刪掉（掉回 self）                 → 紅（只剩 1 人）
 */
import { describe, it, expect } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import type { ScreenShakeEvent } from "./clientCues";
import { asSeatId, asTeamId, type EntityId } from "../../ids";
import { CUE_KINDS } from "../../content/cooldownTiers";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
import { zeroAttrBonus } from "../stats/attributes";

const C = SKELETON_ARENA.zones[0]!.center;

function rig(): { world: SimWorld; caster: EntityId; ally: EntityId; foe: EntityId; far: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 7);
  const place = (dx: number, seat: number, team: number): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x: C.x + dx, z: C.z },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.1,
      zone: 0,
    });
    world.health.set(id, { hp: 500, maxHp: 500, mana: 0, maxMana: 0, alive: true, shields: [] });
    world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
    world.nav.set(id, {
      order: null,
      moveTarget: null,
      override: null,
      attackTarget: null,
      attackTargetAuto: false,
    });
    world.status.set(id, { effects: [] });
    // ⭐ 夾具要像**出貨真的會發生**的樣子（形態⑩）：cue 的觀眾是**玩家**，
    //    而只有 champion 有擁有者 —— `alliedChampions` 走的正是 `world.champion`。
    world.champion.set(id, {
      championId: "test-champ",
      level: 1,
      xp: 0,
      gold: 0,
      items: [null, null, null, null, null, null],
      augments: [],
      statStacks: 0,
      attrBonus: zeroAttrBonus(),
      statCapstonePct: 0,
      pendingOrbSlots: 0,
      undoStack: [],
    } as never);
    return id;
  };
  const caster = place(0, 0, 0);
  const ally = place(2, 1, 0);
  const foe = place(3, 2, 1);
  const far = place(20, 3, 1); // ⛔ 圈外
  world.rebuildGrid();
  return { world, caster, ally, foe, far };
}

const SHAKE = {
  kind: "screenShake",
  shape: "circle",
  radius: 9.17, // JASS 500 wc3u × 11/600
  amplitude: 0.4,
  durationSec: 0.5,
  applyTo: "nearby",
} as EffectDef;

describe("cue 的 applyTo:'nearby' — 圓內的每一個人，敵我都算（GH#838 N3）", () => {
  it("⭐ 施法者在名單上（side:'enemies' 湊不出來的那一格），圈外的不在", () => {
    const r = rig();
    runEffects([SHAKE], {
      world: r.world,
      caster: r.caster,
      rank: 1,
      targets: [],
      point: { x: C.x, z: C.z },
      origin: "ability:test.nearby",
      rng: r.world.rng,
    } satisfies EffectContext);

    const ev = r.world.events.find((e) => e.type === "screenShake");
    expect(ev).toBeDefined();
    const p = ev!.data as unknown as ScreenShakeEvent;
    // ⛔ 不是廣播 —— 廣播的話「範圍限定」這件事等於沒發生。
    expect(p.broadcast).toBe(false);
    const subs = [...p.subjects].sort((a, b) => a - b);
    expect(subs).toContain(r.caster); // ⭐ 承重
    expect(subs).toContain(r.ally);
    expect(subs).toContain(r.foe);
    expect(subs).not.toContain(r.far); // ⭐ 另一個方向
  });
});

/**
 * ⭐⭐【`radius` 有兩個意思】GH#838 —— 這一條守的是**四個掃描器**的一致。
 *
 * `damageArea.radius` 回答「**誰被打到**」；`screenShake.radius`（`applyTo:"nearby"`）
 * 回答「**誰看得到**」。四支各自獨立的掃描器都把後者讀成前者，2026-08-28 一次
 * 撞出三種不同的症狀：
 *   ① `cooldownTiers.ts::mentions`      → 冷卻 60 **靜靜變成 120**
 *   ② `tierize.py::assign`              → 蓋上 `radiusTier` ⇒ `.strict()` **當場驗不過**
 *   ③ `skill-normalize/plan.ts::coverage` ┐ 要求補級別，而補下去 ②會拒絕
 *   ④ `content/skillNormalize.ts::radiusNodes` ┘ ⇒ **兩邊互相打架、永遠修不好的紅**
 *
 * TS 那三支現在共用 `cooldownTiers.ts` 匯出的 `CUE_KINDS`（單一住處）。
 * ⛔ Python 那一支跨語言、共用不了 ⇒ 這條測試就是它的閘。
 *
 * 突變紀錄：`tierize.py` 的 `CUE_KINDS` 拿掉一個成員 → 紅並指名那一個。
 */
describe("CUE_KINDS 的四個住處要說同一句話（GH#838）", () => {
  it("Python 那一份與 TS 的單一住處逐字相同", () => {
    // ⚠️ Python 端有**兩份**（跨語言共用不了）—— 兩份都要對。
    for (const rel of ["skill-remake/tierize.py", "w3a-translate/gen.py"]) {
      const py = readFileSync(join(__dirname, "../../../../../tools", rel), "utf-8");
      const m = /^CUE_KINDS = \(([^)]*)\)/m.exec(py);
      expect(m, `⛔ tools/${rel} 找不到 CUE_KINDS —— 它被改名或刪掉了`).not.toBeNull();
      const pyKinds = [...m![1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!).sort();
      expect(
        pyKinds,
        `⛔ tools/${rel} 的 CUE_KINDS 與 TS 分岔了 —— 症狀是「某支技能的冷卻／範圍莫名其妙變了」`,
      ).toEqual([...CUE_KINDS].sort());
    }
  });
});

