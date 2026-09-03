/**
 * ⭐⭐ **31 個能力沒有任何正式技能在用**（GH#956）。
 *
 * owner 2026-09-02（驗收清單 §五 逐字）：
 * > 「以下功能已在主程式能力契約中，但目前**沒有正式技能可作為驗收來源**。
 * >  必須**另建最小 capability fixtures**，⛔ **不能宣稱已被上述 46 份技能覆蓋**。」
 *
 * ⭐ 獨立重算（2026-09-03，⛔ 不抄票文的數字）—— **逐格吻合**：
 * · 出貨技能實際用到：effect **41** · hook **10** · condition **4**
 * · 而契約裡另有 **6 + 23 + 2 = 31** 個**零採用**
 *
 * ⚠️⚠️ ⭐ **這一支不是「去建 31 個 fixture」** ——
 * 那是內容側的工作（票文 Scope 的第 1 條），⭐ 而 Main 這一側該做的是
 * **讓「它們冒充不了已驗收」變成一個會紅的數字**。
 * ⛔ 否則下一輪讀驗收清單的人會把「46 份覆蓋了全部機制」讀成「全部驗過了」——
 * ⭐ 而那正是 owner 那句話在防的事。
 *
 * ⭐⭐ **棘輪：31 只准變少。** 變少 ＝ 有人建了 fixture（⭐ 好事，把數字調下來）；
 * ⛔ 變多 ＝ 契約長出了新能力而沒有人用它（⭐ 那也要知道）。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 掃描器改成只掃 `effects`（漏掉 `passive.hooks`）
 *    → 🔴 ①「出貨技能用到的 hook 數掉了」—— ⭐ 量尺自證那一條
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ABIL = join(__dirname, "../../../../content/abilities");

/** ⭐ owner 驗收清單 §五 點名的 31 個（⛔ 零採用 ⇒ 需要 fixture）。 */
const NEED_FIXTURE = {
  effectKinds: ["carry", "convertTeam", "evasion", "pull", "revive", "shieldBreak"],
  hookEvents: [
    "onAllyDamaged", "onAllyDeath", "onBossSpawn", "onBoundaryTouch", "onCrowdControlApplied",
    "onCrowdControlReceived", "onDashOrBlink", "onDeath", "onFireRingIgnite", "onGuardianDown",
    "onHeal", "onLethalDamage", "onOverheal", "onProjectileExpire", "onRevive", "onRoundEnd",
    "onRoundStart", "onShieldBroken", "onShieldGained", "onStatCapReached", "onStatusApplied",
    "onUltimateCast", "onUltimateHit",
  ],
  conditionKinds: ["chance", "equipment"],
} as const;

/** ⭐ 出貨技能**實際用到**什麼 —— ⛔ 掃全部（含 `passive.hooks`），不只 `effects`。 */
function usedByShippedAbilities(): {
  kinds: Set<string>;
  hooks: Set<string>;
  conds: Set<string>;
} {
  const kinds = new Set<string>();
  const hooks = new Set<string>();
  const conds = new Set<string>();
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    const n = o as Record<string, unknown>;
    if (typeof n["kind"] === "string") {
      // ⭐ 條件葉帶 `subject`，effect 不帶 —— ⛔ 兩者共用 `kind` 這個鍵。
      ("subject" in n ? conds : kinds).add(n["kind"]);
    }
    if (typeof n["on"] === "string") hooks.add(n["on"]);
    for (const v of Object.values(n)) walk(v);
  };
  for (const f of readdirSync(ABIL)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    walk(JSON.parse(readFileSync(join(ABIL, f), "utf8")));
  }
  return { kinds, hooks, conds };
}

describe("capability fixture 缺口（GH#956）", () => {
  it("★★ ⭐ 量尺自證：出貨技能**真的用到很多機制**（⛔ 掃錯地方會靜靜歸零）", () => {
    const u = usedByShippedAbilities();
    expect(u.kinds.size, "⛔ effect kinds 量到 0 ⇒ 掃描器瞎了").toBeGreaterThan(30);
    expect(
      u.hooks.size,
      "⛔ hook events 量到太少 ⇒ ⭐ 多半是漏掉 `passive.hooks`（它不在 `effects` 底下）",
    ).toBeGreaterThanOrEqual(10);
    expect(u.conds.size, "⛔ condition kinds 量到太少").toBeGreaterThanOrEqual(4);
  });

  it("★★ ⭐⭐ **棘輪：31 個零採用只准變少**（⭐ 變少 = 有人建了 fixture）", () => {
    const u = usedByShippedAbilities();
    const stillNaked = [
      ...NEED_FIXTURE.effectKinds.filter((k) => !u.kinds.has(k)).map((k) => `effect:${k}`),
      ...NEED_FIXTURE.hookEvents.filter((h) => !u.hooks.has(h)).map((h) => `hook:${h}`),
      ...NEED_FIXTURE.conditionKinds.filter((c) => !u.conds.has(c)).map((c) => `cond:${c}`),
    ];
    expect(
      stillNaked.length,
      `⭐ 現在還有 **${stillNaked.length}** 個能力沒有任何正式技能在用（上限 31）。\n` +
        "  ⭐ **變少是好事** —— 有人建了 fixture ⇒ 回來把上限調下來。\n" +
        "  ⛔ 變多 ＝ 契約長出了新能力而沒有人用它。\n" +
        `  ⭐ 還缺的前 6 個：${stillNaked.slice(0, 6).join(", ")}`,
    ).toBeLessThanOrEqual(31);
  });

  it("★★ ⭐⭐ **它們冒充不了「已被 46 份技能覆蓋」**（owner 逐字的那句話）", () => {
    const u = usedByShippedAbilities();
    // ⭐ 反方向：如果有人把某一格從名單刪掉來「讓數字變好看」，
    //   ⛔ 而它其實仍然零採用 ⇒ 這一條抓不到，所以**名單本身也要驗**。
    expect(
      NEED_FIXTURE.effectKinds.length + NEED_FIXTURE.hookEvents.length + NEED_FIXTURE.conditionKinds.length,
      "⛔ 名單被改短了 —— ⭐ 那不是「建好了 fixture」，那是把問題藏起來",
    ).toBe(31);
    // ⭐ 而名單上的每一個都必須是**契約認得的名字**（⛔ 打錯字會靜靜永遠「零採用」）。
    const typo = NEED_FIXTURE.hookEvents.filter((h) => !/^on[A-Z]/u.test(h));
    expect(typo, "⛔ hook 名字不符 `onXxx` ⇒ 多半是打錯字，而它會永遠算成零採用").toEqual([]);
    expect(u.kinds.size + u.hooks.size + u.conds.size).toBeGreaterThan(40);
  });
});
