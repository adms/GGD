/**
 * GH#354 的 13 個新時刻 —— 驗**接得起來**，⛔ 不逐一驗每種效果（第二守則）。
 *
 * 這一批的形狀是「一張表 + 兩格謂詞」，所以承重的性質有三條，不是十三條：
 *   ① 每一個新事件都**真的有人發**（`onLevelUp` 的前科：enum 有、發射點零）；
 *   ② `when` 切片真的在切（不切的話 `onUltimateCast` 會在每一次施法都響）；
 *   ③ `firesOutsideCombat` 真的讓【回合結束】穿得過早退（少了它整列消失）。
 *
 * 突變紀錄（承重的那一條）：`worldHookSystem` 的 `if (row.when …) continue;` 刪掉
 * → 「`when` 真的在切」當場紅；改回。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zHookEvent } from "../../content/schema/effect";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "WorldHookSystem.ts"), "utf8");
const REPO = join(HERE, "../../../../..");

/** 這一批新增的 13 個。⚠️ 逐字抄 owner 的清單，⛔ 不從 enum 反推（那會自我證明）。 */
const GH354 = [
  "onUltimateCast",
  "onUltimateHit",
  "onCrowdControlApplied",
  "onCrowdControlReceived",
  "onHeal",
  "onOverheal",
  "onAllyDamaged",
  "onProjectileExpire",
  "onBoundaryTouch",
  "onDashOrBlink",
  "onLethalDamage",
  "onRoundStart",
  "onRoundEnd",
] as const;

describe("GH#354 —— 13 個新 hook 事件", () => {
  it("① 每一個都在 zHookEvent 裡，而且在 WORLD_HOOKS 有一列（⛔ 不是下拉裡的死選項）", () => {
    const known = new Set(zHookEvent.options as readonly string[]);
    const missingEnum = GH354.filter((h) => !known.has(h));
    expect(missingEnum, "enum 少了這幾個").toEqual([]);
    // ⚠️ 讀的是**這一支系統的原始碼**：那張表是唯一的發射對照，一個沒有列的
    // 事件就是 `onLevelUp` 的重演（schema 收得下、後台存得起來、遊戲裡零發射）。
    const noRow = GH354.filter((h) => !SRC.includes(`hook: "${h}"`));
    expect(noRow, "有 enum 但沒有發射列").toEqual([]);
  });

  it("② 四個新的發射點真的存在（表上指名的 simEvent 有人 emit）", () => {
    const emits: readonly [string, string][] = [
      ["abilityHit", "packages/shared/src/sim/abilities/abilitySystem.ts"],
      ["displace", "packages/shared/src/sim/effects/dash.ts"],
      ["lethalDamage", "packages/shared/src/sim/combat/damage.ts"],
      ["roundStart", "apps/game-server/src/match/MatchController.ts"],
      ["roundEnd", "apps/game-server/src/match/MatchController.ts"],
    ];
    for (const [ev, file] of emits) {
      const body = readFileSync(join(REPO, file), "utf8");
      expect(body.includes(`emit("${ev}"`), `${file} 沒有在發 ${ev}`).toBe(true);
    }
  });

  it("③ 迴圈真的套用 when 與 firesOutsideCombat（拿掉任何一行整組時刻就消失）", () => {
    expect(SRC).toContain("row.when !== undefined && !row.when(world, ev.data)");
    expect(SRC).toContain('row.firesOutsideCombat !== true');
    // ⚠️ 早退**不可以**再看 combatActive —— 看了的話【回合結束】永遠發不出去。
    expect(SRC.includes("if (!world.combatActive) return;")).toBe(false);
  });
});
