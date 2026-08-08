/**
 * `zMarkSpec` 的守衛 —— 只釘**機制**，不釘出貨數值。
 *
 * ⛔ 這裡刻意沒有 12 層 / 10% / 1.5 秒 這些數字：它們住在 `content/abilities/`
 * 與 `sim/markLimits.ts`，抄進斷言就是第四個住處（CLAUDE.md 第零守則⑦）。
 * 這一條測的是「schema 會不會放行 / 擋下」，不是「數值是多少」。
 */
import { describe, expect, it } from "vitest";
import { ModOp } from "../../sim/stats/modifiers";
import { Stat } from "../../sim/stats/statTypes";
import { MARK_DURATION_PERMANENT, MARK_MIN_DURATION_SEC } from "../../sim/markLimits";
import { zMarkSpec } from "./mark";

/** 一個「永久 + 跨回合 + 帶免死牌 + 帶每層永久加成」的完整 spec。 */
const trialSpec = {
  markId: "godie-hapm.passive",
  initial: 3,
  max: 3,
  durationSec: MARK_DURATION_PERMANENT,
  resetOn: "match",
  perStackLost: [{ stat: Stat.AttackDamage, op: ModOp.PercentAdd, value: 0.1 }],
  lethal: {
    consume: 1,
    surviveHpPct: 0.01,
    damageTypes: ["physical", "magic"],
    internalCooldown: 0.5,
    selfEffects: [{ kind: "heal", amount: { flat: 1 } }],
    aoeEffects: [{ kind: "knockback", distance: 2, speed: 8 }],
    aoeRadius: 4,
  },
};

describe("zMarkSpec", () => {
  it("完整的「永久標記 + 免死牌 + 每層永久加成」解析得過", () => {
    const res = zMarkSpec.safeParse(trialSpec);
    if (!res.success) throw new Error(JSON.stringify(res.error.issues, null, 2));
    expect(res.data.markId).toBe(trialSpec.markId);
    expect(res.data.lethal?.damageTypes).toContain("physical");
  });

  it("★ 小於半 tick 的 durationSec 被拒 —— 否則標記掛上去同一瞬間就過期", () => {
    const tooShort = MARK_MIN_DURATION_SEC / 2;
    const res = zMarkSpec.safeParse({ ...trialSpec, durationSec: tooShort });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.issues.some((i) => i.path.includes("durationSec"))).toBe(true);
  });

  it("★ 真傷擋不擋是一個欄位，不是一個分支：damageTypes 空陣列被拒", () => {
    const res = zMarkSpec.safeParse({
      ...trialSpec,
      lethal: { ...trialSpec.lethal, damageTypes: [] },
    });
    expect(res.success).toBe(false);
  });
});
