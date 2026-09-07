/**
 * 技能正規化的**止血閥**真的有讀端（GH#1053）：`config.skill-normalize@1` 的 `enabled:false` ⇒ 總閘不擋。
 *
 * 2026-08-21 → 09-06 這一格零讀端：`tools/skill-normalize/gen.ts` 的檔頭自稱止血閥，
 * ⛔ 而拉下去什麼都不會發生（第三守則：註解會說謊）。
 *
 * ⭐ 兩個方向、**同一棵壞樹**（一把只驗過單邊的尺不算自證過）：先把一支技能的級別改錯
 *（`skillNormalizeGate.test.ts` ② 的那一種壞），閥開 ⇒ 閘紅；閥關 ⇒ 同一棵樹 exit 0 且訊息指名止血閥。
 * ⛔ 全程在 tmp 副本上：不碰 `content/`、不跑 `skillnorm:build`。
 * ⚠️ 住 `ops/` 而不是 `tools/skill-normalize/`：那個目錄沒有 package.json，`pnpm -r test` 掃不到它。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unlockSandbox } from "./writeProduct";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DOC = "docs/技能五級距現況.md";

function check(root: string): { code: number; err: string } {
  const r = spawnSync("npx", ["tsx", join(REPO, "tools/skill-normalize/gen.ts"), "--check", "--root", root], {
    cwd: REPO,
    encoding: "utf8",
  });
  return { code: r.status ?? -1, err: r.stderr };
}

describe("skill-normalize.enabled 是活的止血閥（GH#1053）", () => {
  it("同一棵壞樹：閥開 ⇒ 紅、閥關 ⇒ exit 0 並指名止血閥", () => {
    const dir = mkdtempSync(join(tmpdir(), "ggd-skillnorm-valve-"));
    cpSync(join(REPO, "content"), join(dir, "content"), { recursive: true });
    unlockSandbox(join(dir, "content")); // 🔒 cp 保留 444，副本要可寫
    const BASE = "packages/shared/src/content/descriptionClaims.baseline";
    cpSync(join(REPO, BASE), join(dir, BASE), { recursive: true });
    mkdirSync(join(dir, "docs"), { recursive: true });
    cpSync(join(REPO, DOC), join(dir, DOC));

    // 第一支填了 cooldownTier 的技能，級別換成不是它現在那一格（⛔ 原始值不動、⛔ 不抄級距數字）。
    const AB = join(dir, "content/abilities");
    const file = readdirSync(AB)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .find((f) => typeof JSON.parse(readFileSync(join(AB, f), "utf8"))["cooldownTier"] === "string")!;
    const doc = JSON.parse(readFileSync(join(AB, file), "utf8")) as Record<string, unknown>;
    doc["cooldownTier"] = ["極小", "小", "中", "大", "極大"].find((n) => n !== doc["cooldownTier"])!;
    writeFileSync(join(AB, file), JSON.stringify(doc, null, 2) + "\n");
    expect(check(dir).code, "校準：閥開著這棵樹必須是紅的，否則下面的綠證明不了閥").not.toBe(0);

    const cfgPath = join(dir, "content/config/skill-normalize.json");
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8")) as { enabled: boolean };
    expect(cfg.enabled, "夾具前提：出貨閥是開的").toBe(true);
    writeFileSync(cfgPath, JSON.stringify({ ...cfg, enabled: false }, null, 2) + "\n");
    const r = check(dir);
    expect(r.code, `⛔ 閥拉下了閘還在擋：\n${r.err}`).toBe(0);
    expect(r.err, "exit 0 要來自止血閥那條路，⛔ 不是別的巧合").toContain("止血閥");
  });
});
