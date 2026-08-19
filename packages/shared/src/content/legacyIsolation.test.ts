/**
 * GH#479 ② 的閘：**退場的英雄要真的離開內容樹**。
 * 四條關係與「為什麼名單一定要推導」寫在 `legacyIsolation.ts` 檔頭。
 *
 * ⛔ 這一條紅了不要改測試 —— 用 `git mv` 把檔案搬到 `content/_legacy/`，
 *    然後跑 `pnpm content:build`。
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { readStarterRoster } from "../../testkit/starterRoster";
import { abilityCode } from "./abilityCodeParity";
import { CHAMPION_FORM_PAIRS } from "./championForms";
import { retiredChampionIdsFromDoc } from "./championRetirement";
import { archivePlan, scanLegacyIsolation } from "./legacyIsolation";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../..");
const CONTENT = join(REPO, "content");

const fileIds = (dir: string): Set<string> =>
  new Set(
    readdirSync(dir)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => f.slice(0, -".json".length)),
  );

/** 出貨技能檔：擁有者英雄 id → 它宣告的 w3x 編號。⚠️ 讀 `name`，⛔ 不讀檔名。 */
function abilityCodesByChampion(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const dir = join(CONTENT, "abilities");
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as { name?: unknown };
    const champ = f.slice(0, f.indexOf("."));
    const code = abilityCode(doc.name);
    const bucket = out.get(champ) ?? [];
    if (code) bucket.push(code);
    out.set(champ, bucket);
  }
  return out;
}

const RETIRED = retiredChampionIdsFromDoc(
  JSON.parse(readFileSync(join(CONTENT, "config/roster.json"), "utf8")),
);

describe("_legacy 隔離", () => {
  it("★ 四條關係全綠（下架↔位置 · _legacy↔出貨樹 · _legacy↔白名單種子 · 編號↔擁有者）", () => {
    cover("legacy-isolation");
    const findings = scanLegacyIsolation({
      retired: RETIRED,
      pairs: CHAMPION_FORM_PAIRS,
      operationalChampions: fileIds(join(CONTENT, "champions")),
      legacyChampions: fileIds(join(CONTENT, "_legacy/champions")),
      abilityCodesByChampion: abilityCodesByChampion(),
      starterSeed: readStarterRoster(REPO),
    });
    expect(
      findings.map((f) => `${f.rule}  ${f.detail}`).join("\n"),
      "⛔ 退場的內容還在會被掃到的地方。⭐ 修法一律是 `git mv … content/_legacy/…` + " +
        "`pnpm content:build`，⛔ 不是把 id 加進某張豁免表（那正是 GH#479 要砍掉的形狀）。",
    ).toBe("");
  });

  it("⭐ 歸檔名單是**推導**出來的：下架一位本體，它的變身態自動一起被要求歸檔", () => {
    // ⚠️ 用**合成**的下架名單，⛔ 不抄出貨值 —— 這裡驗的是規則，不是今天有誰下架。
    const pairs = [{ baseId: "hero-base", alternateId: "hero-alt" }];
    const dragged = archivePlan(new Set(["hero-base"]), pairs);
    expect([...dragged.archive].sort()).toEqual(["hero-alt", "hero-base"]);
    expect(dragged.blocked).toEqual([]);

    // 反過來：只下架變身態時 ⛔ 不可以搬（只搬一半 = 變身當下房間會炸）。
    const half = archivePlan(new Set(["hero-alt"]), pairs);
    expect([...half.archive]).toEqual([]);
    expect(half.blocked.map((b) => b.id)).toEqual(["hero-alt"]);
  });
});
