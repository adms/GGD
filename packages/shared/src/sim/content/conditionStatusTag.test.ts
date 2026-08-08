/**
 * `condition.target-status-tag@1` —— 「目標身上有**某一類**狀態時」的行為守衛。
 *
 * ⭐ **「同類但不同 id」是這一檔存在的全部理由。** 只用同一個 id 去測，這個功能
 * 等於沒做 —— 那樣的測試對「tag 分支其實還是在比對 statusId」的實作也會全綠。
 * 所以 ① 與 ② 掛的是**兩份不同的狀態文件**，只有 tag 相同，而條件從頭到尾沒有
 * 提過任何一個 id。
 *
 * ⭐ 兩個方向一起讀：同類的狀態在身上時效果真的落下去，**別類**的在身上時真的
 * 沒有。只驗前者的守衛對「tag 比對永遠回 true」是全綠的，而那正是這顆葉子最可能
 * 壞掉的方向（它是一個閘，壞掉的樣子是「它從不擋」）。
 *
 * ⛔ 沒有任何一條斷言在讀 condition 物件的形狀、schema 有沒有這個欄位、或
 * `StatusMeta` 上有沒有 `tags`（失敗形態 ⑦：掃屬性代替掃行為）。每一條都跑真的
 * `fireHooks` → `runEffects` → 傷害佇列，讀的是 `world.health` 上真的血量差。
 *
 * 標記是走**出貨的** `applyStatus` 掛上去的，tag 是走**出貨的** `Statuses` 登錄表
 * 讀的（也就是 `content/registries.ts` 真的會寫進去的那一張表）——
 * 失敗形態 ⑤：手寫進 `StatusComp.effects` 的那一版會在 `applyStatus` 改了到期
 * 算法的那一天繼續全綠。
 *
 * ⛔ 也沒有任何**出貨數值或出貨 id** 住在這裡（第零守則⑦）：三個狀態 id 與
 * `BONUS` 都是這一檔自己的夾具，出貨內容怎麼調 tag 都不會讓這一檔用錯誤的訊息紅。
 *
 * ── 突變紀錄 ────────────────────────────────────────────────────────────────
 * `sim/content/condition.ts` 的 `hasStatusTag` 內層改成無條件 `return true`
 * （讓類別比對永遠成立）：
 *   × 「③ 別類的狀態 → 不觸發」 FAIL（期望 false 得到 true）
 *   ○ 「① / ② 同類 → 觸發」    PASS（正確的實作也會過，所以它們一個人不算守衛）
 * 改回來 → 4/4 綠。
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
import { asSeatId, asTeamId, type EntityId, type StatusId } from "../../ids";
import type { EffectCondition } from "./condition";

/** 夾具：**同一類、不同 id** 的兩份狀態，外加一份別類的。全部不是出貨 id。 */
const TAG = "test-family";
const KIN_A = "test-kin-a" as StatusId;
const KIN_B = "test-kin-b" as StatusId;
const STRANGER = "test-stranger" as StatusId;
/** 夾具常數。不是平衡值，不是出貨值。 */
const BONUS = 500;

beforeAll(() => {
  registerSkeletonContent();
  // `content/registries.ts` 真的會寫進去的那一張表，欄位名逐字相同。
  Statuses.register(KIN_A, { polarity: "debuff", tags: [TAG] });
  Statuses.register(KIN_B, { polarity: "debuff", tags: ["something-else", TAG] });
  Statuses.register(STRANGER, { polarity: "debuff", tags: ["not-that-family"] });
});

const C = SKELETON_ARENA.zones[0]!.center;

/** 一位英雄 + 一位敵方英雄。先跑一 tick，broad-phase 才建得起來。 */
function stage(): { world: SimWorld; hero: EntityId; foe: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 7);
  world.combatActive = true;
  const hero = spawnChampion(world, {
    championId: SELA.id,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  const foe = spawnChampion(world, {
    championId: THORNE.id,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: C.x + 1, z: C.z },
    zone: 0,
  });
  world.step(new Map());
  return { world, hero, foe };
}

/** 走出貨的 `applyStatus` 把某一份狀態掛到 `who` 身上。 */
function mark(world: SimWorld, who: EntityId, statusId: StatusId): void {
  runEffects([{ kind: "applyStatus", statusId, duration: 5 }], {
    world,
    caster: who,
    rank: 1,
    targets: [who],
    origin: "test:mark",
    rng: world.rng,
  });
}

/** 掉血 = BONUS 減掉同一 tick 的回復，所以用半個 BONUS 分帶。 */
const landed = (hpLost: number): boolean => hpLost > BONUS / 2;

/** 掛一條「條件成立才加 BONUS 真傷」的 proc，替目標掛上 `on`，然後揮一下。 */
function swingWith(condition: EffectCondition, on: StatusId | null): boolean {
  const s = stage();
  if (on !== null) mark(s.world, s.foe, on);
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
  return landed(before - s.world.health.get(s.foe)!.hp);
}

/** ⭐ 條件裡**一個 id 都沒有** —— 它問的是類別。 */
const HAS_FAMILY: EffectCondition = { kind: "status", subject: "target", tag: TAG };

describe("目標身上有某一類狀態時", () => {
  it("★ ① 目標帶著這一類的其中一份 → 加成真的落下去了", () => {
    cover("condition-target-status-tag-present");
    expect(swingWith(HAS_FAMILY, KIN_A)).toBe(true);
  });

  it("★ ② 換成同類的**另一個 id** → 一樣成立（這一條是這個功能本身）", () => {
    cover("condition-target-status-tag-other-id");
    expect(swingWith(HAS_FAMILY, KIN_B)).toBe(true);
  });

  it("★ ③ 目標帶著**別類**的狀態 → 一點都沒加（這一條是閘本身）", () => {
    cover("condition-target-status-tag-absent");
    expect(swingWith(HAS_FAMILY, STRANGER)).toBe(false);
  });

  it("★ ④ `not` 是「沒有這一類」的唯一寫法，而且方向真的相反", () => {
    cover("condition-target-status-tag-negated");
    const noFamily: EffectCondition = { not: HAS_FAMILY };
    expect(swingWith(noFamily, STRANGER)).toBe(true);
    expect(swingWith(noFamily, KIN_A)).toBe(false);
  });

  /**
   * ⭐ 上面四條都是我**自己**把 tags 塞進 `Statuses` 的。那證明求值端會用它，
   * 但**不證明出貨的載入路徑會把它送到那裡** —— 而「算出來了卻從沒送到」正是
   * 這個 repo 反覆踩的失敗形態 ②（`applyStatus` 從來沒把 `polarity` 寫進去，
   * 於是每一發淨化都拔不到東西，而所有測試全綠）。
   *
   * 所以這一條從一份**真的 `status-effect@1` 文件**出發，走真的 `registerAll`，
   * 最後由同一條揮擊讀出來 —— `registries.ts` 那一行漏掉 `tags` 就會紅。
   */
  it("★ ⑤ tags 是從 `status-effect@1` 文件經 `registerAll` 送進 sim 的", async () => {
    cover("condition-target-status-tag-wired-from-content");
    const { ContentStore } = await import("../../content/store");
    const { registerAll } = await import("../../content/registries");
    const store = new ContentStore();
    store.add("status-effects", "wired-kin", {
      id: "wired-kin",
      schema: "status-effect@1",
      name: "夾具·同族",
      polarity: "debuff",
      tags: [TAG],
    });
    registerAll(store);
    expect(swingWith(HAS_FAMILY, "wired-kin" as StatusId)).toBe(true);
  });
});
