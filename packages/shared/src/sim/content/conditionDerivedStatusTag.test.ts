/**
 * 推導的狀態 tag —— 「它真的在做什麼」勝過「作者記得標什麼」的行為守衛。
 *
 * ⭐ **這一檔的意義全在第①條**：一份 tags **完全沒有提到 stun** 的狀態文件，被一支
 * `stun: true` 的技能掛上去之後，「目標帶有 stun 類狀態」必須成立。只驗「有標 tag
 * 的查得到」的話這個功能等於沒做 —— 那種測試對「只讀文件 tags」的舊實作也全綠，
 * 而出貨內容裡「暈眩」是六份不同文件，作者靠記憶補 tag 一定會漏。
 *
 * ⛔ 沒有任何一條斷言在讀 condition 物件的形狀、schema 欄位或 `StatusMeta` 上有沒有
 * `tags`（失敗形態 ⑦：掃屬性代替掃行為）。①②③ 跑真的 `fireHooks` → `runEffects`
 * → 傷害佇列，讀 `world.health` 上真的血量差；⑤ 跑出貨的 `applyStatus`，讀
 * `StatusComp.effects` 上真的有沒有那一筆。
 *
 * ⛔ 沒有出貨 id、沒有出貨數值住在這裡（第零守則⑦）：三個狀態 id 與 `BONUS` 都是
 * 這一檔自己的夾具，門檻讀的是 `condition.ts` 的具名常數而不是抄字面值。
 *
 * ── 突變紀錄 ────────────────────────────────────────────────────────────────
 * M1 `condition.ts` 的 `hasStatusTag` 拿掉推導那一行（`statusInstanceHasTag`）：
 *     × ①「沒標 tag 的暈眩查得到」        FAIL（期望 true 得到 false）
 *     × ③「moveSpeedMult 0.7 → slow」     FAIL
 *     × ⑤「cc 家族與 isCc 一致」          PASS（它讀的是 applyStatus，不是這一行）
 *     ○ ②④                                PASS
 * M2 `STATUS_FIELD_TAGS.moveSpeedMult` 的 `slow` 謂詞把 `< NEUTRAL` 改成
 *    `!== undefined`（也就是加速也算減速）：
 *     × ③ 的後半「1.3 不是 slow」          FAIL（期望 false 得到 true）
 *     ○ 其餘全綠 —— 所以③的兩個方向要一起讀，只驗前半的守衛對這個 bug 是瞎的。
 * M3 `applyStatus.ts` 的 `isCc` 拿掉 `e.feared === true`：
 *     × ⑤「feared」                       FAIL（免控的身體照樣被掛上恐懼）
 *    （`feared` 在此之前**沒有任何守衛** —— `invulnerable.test.ts` 只涵蓋
 *      stun / root / moveSpeedMult 三種。）
 * 三個都改回來 → 5/5 綠。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA, THORNE } from "./skeleton";
import { Statuses } from "./registry";
import { spawnChampion } from "../spawnChampion";
import { attachSource } from "../stats/statPipeline";
import { fireHooks } from "../effects/hooks";
import { runEffects } from "../effects/effectRunner";
import { rankScalar } from "../perRank";
import { grantImmunity } from "../effects/invulnerable";
import { asSeatId, asTeamId, type EntityId, type StatusId } from "../../ids";
import type { StatusEffect } from "../components";
import type { EffectOf } from "../effects/effectKind";
import {
  STATUS_FIELD_TAGS,
  statusInstanceHasTag,
  DERIVED_NEUTRAL_MULT,
  type EffectCondition,
} from "./condition";

/** ⭐ 夾具：這份文件的 tags **一個字都沒提 stun / slow**。不是出貨 id。 */
const QUIET = "test-quiet-doc" as StatusId;
const FLAVOUR = "test-flavour-only";
/** 夾具常數。不是平衡值。 */
const BONUS = 500;

type StatusPatch = Partial<Omit<EffectOf<"applyStatus">, "kind" | "statusId" | "duration">>;

beforeAll(() => {
  registerSkeletonContent();
  Statuses.register(QUIET, { polarity: "debuff", tags: [FLAVOUR] });
});

const C = SKELETON_ARENA.zones[0]!.center;

function stage(): { world: SimWorld; hero: EntityId; foe: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 7);
  world.combatActive = true;
  const mk = (n: number): EntityId =>
    spawnChampion(world, {
      championId: n === 0 ? SELA.id : THORNE.id,
      seatId: asSeatId(n),
      teamId: asTeamId(n),
      pos: { x: C.x + n, z: C.z },
      zone: 0,
    });
  const hero = mk(0);
  const foe = mk(1);
  world.step(new Map());
  return { world, hero, foe };
}

/** 走**出貨的** `applyStatus` 把 QUIET 這份文件掛到 `on` 身上，帶著 `patch` 的旗標。 */
function mark(world: SimWorld, caster: EntityId, on: EntityId, patch: StatusPatch): void {
  runEffects([{ kind: "applyStatus", statusId: QUIET, duration: 5, ...patch }], {
    world,
    caster,
    rank: 1,
    targets: [on],
    origin: "test:mark",
    rng: world.rng,
  });
}

/** 掛一條「條件成立才加 BONUS 真傷」的 proc，替目標掛上狀態，然後揮一下。 */
function swingWith(tag: string, patch: StatusPatch | null): boolean {
  const s = stage();
  if (patch !== null) mark(s.world, s.hero, s.foe, patch);
  const condition: EffectCondition = { kind: "status", subject: "target", tag };
  attachSource(s.world, s.hero, {
    id: "test:proc",
    kind: "item",
    hooks: [
      {
        on: "onBasicAttack",
        effects: [{ kind: "damage", damageType: "true", amount: { flat: BONUS } }],
        condition,
      },
    ],
  });
  const before = s.world.health.get(s.foe)!.hp;
  fireHooks(s.world, s.hero, "onBasicAttack", s.foe);
  s.world.step(new Map());
  // 掉血 = BONUS 減掉同一 tick 的回復，所以用半個 BONUS 分帶。
  return before - s.world.health.get(s.foe)!.hp > BONUS / 2;
}

describe("狀態 tag 同時看「宣告的」與「推導的」", () => {
  it("★ ① tags 沒提 stun 的文件 + `stun:true` 的技能 → 「帶有 stun 類」成立", () => {
    cover("condition-derived-status-tag-stun");
    expect(swingWith(FLAVOUR, { stun: true }), "宣告的那一半壞了").toBe(true);
    expect(swingWith("stun", { stun: true }), "推導的那一半沒接上").toBe(true);
  });

  it("★ ② 沒有任何 CC 旗標、也沒標 tag → 查 stun 不成立（閘本身）", () => {
    cover("condition-derived-status-tag-inert");
    expect(swingWith("stun", {})).toBe(false);
  });

  it("★ ③ 減速推導 slow，**加速不推導** —— 兩個方向一起讀", () => {
    cover("condition-derived-status-tag-threshold");
    const slower = DERIVED_NEUTRAL_MULT - 0.3;
    const faster = DERIVED_NEUTRAL_MULT + 0.3;
    expect(swingWith("slow", { moveSpeedMult: slower }), "減速沒推導出 slow").toBe(true);
    expect(swingWith("slow", { moveSpeedMult: faster }), "加速被標成了減速").toBe(false);
    expect(swingWith("haste", { moveSpeedMult: faster }), "加速沒有自己的 tag").toBe(true);
  });

  it("★ ④ 推導表對**每一格** StatusEffect 表態 —— 少一格就 typecheck 紅", () => {
    cover("condition-derived-status-tag-exhaustive");
    // 真正的閘是宣告處的 `Record<keyof StatusEffect, …>`：往 `components.ts` 加一格
    // 旗標而不在推導表表態，`pnpm typecheck` 就回非零（不是這一條測試會紅）。
    // 這一行守的是**那道閘還在不在**：若有人把型別放寬成 `Partial<>`，下面的錯誤
    // 就消失，而 `@ts-expect-error` 會因為「沒有錯誤可期待」而編譯失敗。
    // @ts-expect-error 少了 `stun` 以外的每一格
    const incomplete: typeof STATUS_FIELD_TAGS = { statusId: [] };
    expect(incomplete).toBeDefined();
  });
});

/**
 * ⭐ `cc` 這個 tag 的成員必須跟 `effects/applyStatus.ts` 的 `isCc` 一致 —— 那是
 * 「免控擋不擋得掉」的同一個問題。這一條是**表驅動**的：下一個在推導表裡標了
 * `cc` 的旗標，若 `isCc` 不認得它，這裡就紅，不需要有人記得回來加一個 case。
 */
const CC = "cc";
const CC_PROBES: readonly { readonly label: string; readonly patch: StatusPatch }[] = [
  { label: "stun", patch: { stun: true } },
  { label: "root", patch: { root: true } },
  { label: "feared", patch: { feared: true } },
  // ⭐ S8【繳械】—— 2026-08-10 加進推導表的第五個 cc 旗標。這一列是被**這條測試
  // 本身**要出來的：`condition.ts` 標了 `cc`，樣本數還是 4，所以它紅了並指名
  // 「推導表多了一個 cc 旗標，這裡卻沒有樣本」。它問的不是「有沒有這個欄位」，
  // 而是「免控擋不擋得掉繳械」—— 少了 `applyStatus.ts::isCc` 那一行就會紅。
  { label: "disarmed", patch: { disarmed: true } },
  { label: "slow", patch: { moveSpeedMult: DERIVED_NEUTRAL_MULT - 0.6 } },
  // ⭐ GH#1041：致盲／詛咒（missChance）—— 推導表第六個 cc 旗標，與 `applyStatus.ts::isCc` 同日一起加。
  { label: "miss", patch: { missChance: 0.5 } },
];

/**
 * ⚠️ 授權形狀 ≠ 執行期形狀。GH#299（G2）之後 `applyStatus` 的
 * `moveSpeedMult` / `missChance` 是 {@link RankScalar}（純量**或**逐階陣列），
 * 而掛在身上的那一筆 `StatusEffect` 一定是**解好的數字** —— `applyStatus.ts`
 * 在掛上去之前就 `rankScalar(…, ctx.rank)` 過了。所以這裡不能直接 spread。
 */
const asInstance = (patch: StatusPatch): StatusEffect => ({
  statusId: QUIET,
  sourceId: "test",
  expiresAtTick: 0,
  ...patch,
  moveSpeedMult: rankScalar(patch.moveSpeedMult, 1),
  missChance: rankScalar(patch.missChance, 1),
});

/** 掛完之後，那個身體身上到底有沒有多一筆？ */
function attachedOnImmune(patch: StatusPatch): boolean {
  const s = stage();
  grantImmunity(s.world, s.foe, {
    physicalUntil: 0,
    magicUntil: 0,
    trueUntil: 0,
    controlUntil: s.world.tick + 60,
  });
  mark(s.world, s.hero, s.foe, patch);
  return s.world.status.get(s.foe)!.effects.length > 0;
}

describe("推導的 `cc` 家族 == applyStatus 的 isCc", () => {
  it("★ ⑤ 每一個標了 cc 的旗標，免控都擋得掉；沒標的擋不掉", () => {
    cover("condition-derived-status-tag-cc-matches-iscc");
    const ccRules = Object.values(STATUS_FIELD_TAGS)
      .flat()
      .filter((r) => r.tag === CC);
    expect(CC_PROBES.length, "推導表多了一個 cc 旗標，這裡卻沒有樣本").toBe(ccRules.length);

    for (const p of CC_PROBES) {
      expect(statusInstanceHasTag(asInstance(p.patch), CC), `${p.label} 樣本推不出 cc`).toBe(true);
      expect(attachedOnImmune(p.patch), `${p.label} 標了 cc，isCc 卻不認得它`).toBe(false);
    }

    // 反向：沉默**刻意**不算 CC（`components.ts` 明說），所以免控擋不掉它 ——
    // 少了這一條，一個「什麼都當成 CC」的 isCc 也會全綠。
    const silence: StatusPatch = { silenced: true };
    expect(statusInstanceHasTag(asInstance(silence), CC)).toBe(false);
    expect(attachedOnImmune(silence), "沉默被當成 CC 擋掉了").toBe(true);
  });
});
