import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify } from "./run.mjs";
import { TIERS, gateArgs, gatePlan, shipPlan } from "./shipPlan.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
/** ⭐ **真的歷史路徑集合**,⛔ 不是我編的夾具（失敗形態⑤:被測的不是出貨的那個）。 */
const diff = (range) =>
  execFileSync("git", ["-c", "core.quotepath=false", "diff", "--name-only", range], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
const ALL = ["apps/admin", "apps/client", "apps/content-api", "apps/editor", "apps/game-server", "apps/test-dashboard", "packages/shared"];

describe("分級 → 要不要重建映像（餵真實的 commit）", () => {
  it("v0.25.6..v0.25.7（142 檔,含 client/schema）⇒ T3 且**必須**重建映像", () => {
    const paths = diff("v0.25.6..v0.25.7");
    expect(paths.length).toBeGreaterThan(50);
    const p = shipPlan(paths, { tier: classify(paths).tier });
    expect(p.tier).toBe("T3");
    expect(p.rebuild).toBe(true);
    // ⭐ CJK 檔名（`docs/技能…md`）在 quotepath 修好之前會變成 unknown ⇒ 這裡順便釘住。
    expect(p.gates.why.join()).not.toMatch(/沒有任何規則吃到/);
  });

  it("85a995fc（純 docs 一個檔）⇒ NOOP:⛔ 不部署、⛔ 不 typecheck,而 packages/shared 仍然跑", () => {
    const paths = diff("85a995fc^..85a995fc");
    expect(classify(paths).tier).toBe("NOOP");
    const g = gatePlan(paths);
    expect(g.suites).toEqual(["packages/shared"]); // ⭐ ops 那一族讀 docs/、CLAUDE.md
    expect(g.typecheck).toBe(false);
    expect(g.serial).toBe(true); // docs/ 是產生器的產物 ⇒ 過期了要紅
    expect(shipPlan(paths, { tier: "NOOP" }).steps.every((s) => !s.cmd)).toBe(true);
  });
});

describe("⛔ fail-closed —— 任何不確定都往「多跑」倒", () => {
  it("沒被規則吃到的路徑 ⇒ T3 **而且**閘全跑（⛔ 不是只有分級 fail-closed）", () => {
    const g = gatePlan(["a-brand-new-toplevel/thing.ts"]);
    expect(classify(["a-brand-new-toplevel/thing.ts"]).tier).toBe(TIERS.unknownTier);
    expect(g.suites.sort()).toEqual(ALL);
    expect(g.serial && g.typecheck).toBe(true);
  });

  it("alwaysSuites 指到不存在的包（改名／搬家）⇒ 全跑,⛔ 不是靜默少跑一包", () => {
    const g = gatePlan(["apps/client/src/GameApp.ts"], { allSuites: ["apps/client"] });
    expect(g.why.join()).toMatch(/alwaysSuites/);
    expect(g.suites).toEqual(["apps/client"]);
  });

  it("⭐ 不帶旗標 ＝ 全跑；而少跑的那一次,ship.mjs **真的**少跑（⛔ 不是旗標接錯線）", () => {
    expect(gateArgs(gatePlan(diff("v0.25.6..v0.25.7")), { allSuites: ALL })).toEqual([]);
    // ⭐ 跑**出貨的那一支**問它「這次會跑哪幾支」,⛔ 不是自己算一份（失敗形態⑤）。
    const args = gateArgs({ serial: false, typecheck: false, suites: ["packages/shared"] }, { allSuites: ALL });
    const jobs = execFileSync("node", ["tools/parallel-gates/ship.mjs", "--list", ...args], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
    expect(jobs).toContain("vitest packages/shared");
    expect(jobs.filter((j) => j.startsWith("vitest ") && j !== "vitest tools/deploy-timing")).toHaveLength(1);
    expect(jobs).toContain("skills:check"); // ⛔ 36 支產生器閘從不打折
    expect(jobs).not.toContain("content:build");
  });
});

describe("表自己要自洽（⛔ 不是抄一份數字）", () => {
  it("宣稱省下 docker build 的級別 rebuild 必須是 false；rebuild 的級別⛔ 不可以宣稱省下任何東西", () => {
    for (const [name, p] of Object.entries(TIERS.plans)) {
      if (p.skips.some((s) => s.includes("docker build"))) expect(p.rebuild, name).toBe(false);
      if (p.rebuild) expect(p.skips, name).toEqual([]);
    }
  });

  it("部署目標與 CLAUDE.md 的那一條指令是同一個（⛔ 兩份會漂）", () => {
    const md = readFileSync(`${ROOT}CLAUDE.md`, "utf8");
    expect(md).toContain(`ssh -A ${TIERS.deploy.sshTarget} 'cd ${TIERS.deploy.remoteDir} &&`);
  });
});
