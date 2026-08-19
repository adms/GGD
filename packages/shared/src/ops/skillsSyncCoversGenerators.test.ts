/**
 * skillsSyncCoversGenerators.test.ts —— ⭐ **聚合指令自己不可以過期。**
 *
 * owner 2026-08-20：
 *
 * > 「每一次更動技能相關機制或內容，要整理所有相關技能 —— 包含球體綁定位置、
 * >  特效 pitch/scale/color/透明度、特效音效綁定、五級距、說明↔實際實作 JSON ——
 * >  都請整理更新到 **JSON** 並讓 **script 動態更新**所有相關文件與 codex 編輯器契約文件、
 * >  後台設定參數與介面更新等，**避免資訊不同步造成的錯誤**」
 *
 * ⇒ `pnpm skills:sync` / `pnpm skills:check` 就是那條指令。
 *
 * ⚠️ 但**聚合指令本身是一個新的單點失效**：這個 repo 已經有 **14 支**新鮮度守衛，
 * 有人加第 15 支而忘了接進 `skills:check`，那支就悄悄地不在「一次跑完」的範圍內 ——
 * 而且**沒有任何東西會紅**（正是元規則說的「判準 0/4 全破」的形狀）。
 *
 * ⇒ 這一條把它關起來：**package.json 裡每一支 `*:check` 都必須**
 * 要嘛在 `skills:check` 裡，要嘛在下面的豁免表裡**帶著理由**。
 * 加一支新的產生器而不做選擇 → 紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * 豁免 = 「這支的產出**不可能**因為技能／特效／級距／卡面說明的改動而變」。
 * ⛔ 理由要具體到能被反駁；⛔ 不接受「跟技能無關」這種同義反覆。
 */
const EXEMPT: Record<string, string> = {
  "voxel:check": "體素**角色身體**產生器 —— 讀的是英雄外觀，不讀 abilities/vfx/級距",
  "voxel:build:check": "同上，只是驗產物",
  "scenery:check": "競技場**道具散佈** —— 讀 arena 幾何，不讀技能",
  "todo:check": "掃原始碼裡的 TODO 註解，與內容無關",
  "docs:status:test": "這是那支產生器**自己的單元測試**，不是新鮮度閘",
};

function scripts(): Record<string, string> {
  return JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")).scripts;
}

describe("skills:sync / skills:check 涵蓋所有產生器", () => {
  it("每一支 *:check 不是被 skills:check 跑到,就是帶著理由被豁免", () => {
    cover("skills-sync-covers");
    const s = scripts();
    const aggregate = s["skills:check"] ?? "";
    expect(aggregate, "skills:check 不見了").toBeTruthy();

    const missing = Object.keys(s)
      .filter((k) => k.endsWith(":check") && k !== "skills:check")
      .filter((k) => !aggregate.includes(k) && !(k in EXEMPT));

    expect(
      missing,
      `這幾支產生器沒有被 skills:check 跑到,也沒有豁免理由:\n  ${missing.join("\n  ")}\n` +
        `→ 把它加進 package.json 的 skills:check,或在 EXEMPT 裡寫下為什麼它不會過期。`,
    ).toEqual([]);
  });

  it("skills:sync 對每一個被 skills:check 驗的東西都有重生成的辦法", () => {
    const s = scripts();
    // ⭐ 只驗「有沒有對應的重生成路徑」,⛔ 不驗指令字串長什麼樣(那會變成第二個住處)
    const aggregate = s["skills:check"] ?? "";
    const checked = Object.keys(s).filter(
      // ⚠️ 一定要先篩 `:check` —— `skills:check` 的字串裡含有 "docs:readme:check",
      // 而 "docs:readme" 是它的**子字串**,少了這一道 `docs:readme` 自己會被當成一支 check。
      (k) => k.endsWith(":check") && k !== "skills:check" && aggregate.includes(k),
    );
    const unbuildable = checked.filter((k) => {
      const base = k.slice(0, -":check".length);
      // roster:check 是純守衛沒有產物;其餘都要有一支能重生成它的 script
      if (base === "roster") return false;
      return !(base in s || `${base}:build` in s || `${base}:export` in s);
    });
    expect(
      unbuildable,
      `這幾支驗得到卻**重生成不了** —— 閘紅了沒有人知道要跑什麼:\n  ${unbuildable.join("\n  ")}`,
    ).toEqual([]);
  });
});
