/**
 * ⭐⭐ **一擊必殺的夾限**（GH#928）—— 走出貨那條路，⛔ 不自己算公式。
 *
 * owner 2026-09-02（逐字）：「我們來檢討傷害排行榜上的技能傷害」（他貼了榜單前 100）。
 *
 * ⛔⛔ 量到的：**12 列**打掉單一英雄超過 **100% 最大生命**，最高 **401%**。
 * ⭐ 根因是**五級距只管加法項**（`傷害 = 級距 + 0.8×AP`，而級距是從**純基礎**
 * 血量反推的 ⇒ 那個空間裡 AP＝0，⛔ 而榜上 100 列沒有一列在那個空間裡）。
 *
 * ⭐⭐ **出貨 `enabled: true`**（2026-09-06 翻開，GH#1017，owner「先做 A」）⇒ 這條夾限今天**在每一場比賽裡跑**。
 * ⚠️ 而那正是這一支**最重要**的斷言：⛔ 一格「本來就沒開」的開關，
 * 與一格「開了也沒用」的開關，在出貨的量測上長得一模一樣。
 * ⇒ ⭐ 所以**兩個方向都跑**：出貨（開著）⇒ 真的被夾住；開著＋半條 ⇒ 夾在半條；小怪 ⇒ 預設不夾。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 `damage.ts` 的 `if (cap > 0 && impact > cap) impact = cap;` 拿掉
 *    → 🔴 ②「開著時要被夾住」FAIL（掉血仍然超過上限）
 *    ⭐ ③仍綠（「量尺活著」，⛔ 對壞掉的實作也會過）；① 自 2026-09-06 出貨開著起**也會紅**（它現在斷言出貨那一發被夾住）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "../effects/effectRunner";
import { SHIPPED_ONE_SHOT_CLAMP } from "../../content/schema/config/oneShotClamp";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import type { EffectDef } from "../effects/effect";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;
/** ⭐ 大到一定超過滿血 —— ⛔ 不靠「剛好」，那會讓斷言變成運氣。 */
const HUGE = 999_999;

interface Rig {
  world: SimWorld;
  hero: EntityId;
  victim: EntityId;
}

function rig(): Rig {
  const world = new SimWorld(SKELETON_ARENA, 11);
  const mk = (seat: number, team: number, dx: number): EntityId =>
    spawnChampion(world, {
      zone: 0,
      championId: SELA.id as ChampionId,
      seatId: asSeatId(seat),
      teamId: asTeamId(team),
      pos: { x: C.x + dx, z: C.z },
    });
  return { world, hero: mk(0, 0, 0), victim: mk(1, 1, 1.2) };
}

/** 打一發真傷，回傳**掉了多少血**（⚠️ 傷害走佇列 ⇒ 要 step 一次才落地）。 */
function hit(r: Rig): { lost: number; maxHp: number } {
  const before = r.world.health.get(r.victim)!;
  const maxHp = before.maxHp;
  const hp0 = before.hp;
  runEffects(
    [{ kind: "damage", damageType: "true", amount: { flat: HUGE } } as EffectDef],
    { world: r.world, caster: r.hero, rank: 1, targets: [r.victim], origin: "probe", rng: r.world.rng },
  );
  r.world.step(new Map());
  return { lost: hp0 - (r.world.health.get(r.victim)?.hp ?? 0), maxHp };
}

describe("一擊必殺的夾限（GH#928）", () => {
  it("★★ ⭐⭐ 出貨預設**開著**（owner 2026-09-06「先做 A」，GH#1017）⇒ 那一發被夾在整條血以內", () => {
    // ⚠️ 2026-09-06 之前這一條斷言「出貨關著 ⇒ 打滿」—— 翻開之後它紅**不是回歸，是前提消失**（#1017 Test 一節）。
    expect(SHIPPED_ONE_SHOT_CLAMP.enabled, "⛔ 出貨值被關回去了 —— owner 2026-09-06 裁決「先做 A」（翻開）").toBe(true);
    const r = rig();
    const { lost, maxHp } = hit(r);
    expect(lost, "⛔ 量尺壞了：那一發沒有掉血，這一支的結論全部作廢").toBeGreaterThan(0);
    expect(
      lost,
      "⛔ 出貨**開著**卻沒夾住 —— HUGE 那一發應該被壓在 maxHp × maxFractionOfMaxHp 以內",
    ).toBeLessThanOrEqual(maxHp * SHIPPED_ONE_SHOT_CLAMP.maxFractionOfMaxHp + 0.001);
  });

  it("★★ ⭐⭐ 打開之後那一發**被夾在上限以內**（⛔ 沒有這條就只是一格死開關）", () => {
    const r = rig();
    r.world.oneShotClamp = { ...SHIPPED_ONE_SHOT_CLAMP, enabled: true, maxFractionOfMaxHp: 0.5 };
    const { lost, maxHp } = hit(r);
    expect(
      lost,
      `⛔⛔ 開了夾限而那一發還是打掉 ${lost} / 上限 ${maxHp * 0.5}\n` +
        "  ⭐ 去看 `combat/damage.ts` 的 `if (cap > 0 && impact > cap) impact = cap;` 還在不在，\n" +
        "  以及它是否在 `mitigate()` **之後**（在之前會夾到「原始傷害」而不是「他真的吃多少」）。",
    ).toBeLessThanOrEqual(maxHp * 0.5 + 0.001);
    expect(lost, "⛔ 夾成 0 了 —— 那是把技能關掉，⛔ 不是夾住").toBeGreaterThan(0);
  });

  it("⭐ 小怪**預設不夾**（榜單的 B 類打的正是小怪，⛔ 而那不是缺陷）", () => {
    expect(
      SHIPPED_ONE_SHOT_CLAMP.alsoClampMinions,
      "⛔ 預設夾小怪會把「掃一排小怪」的技能一起砍掉 —— 那不是這張票要修的東西",
    ).toBe(false);
  });
});
