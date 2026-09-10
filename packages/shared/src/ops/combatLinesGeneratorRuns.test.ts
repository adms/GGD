/**
 * 🧪 2026-09-10 —— **戰鬥語音產生器要 join 出貨 roster，而且缺一格就指名**。
 *
 * `tools/voice-gen/src/build-combat-lines.mjs` 替 daemon 不擁有的 roster 英雄（74 名
 * b2-* / community-review-*）從**我們自己的內容**推導戰鬥語音台本：技能名（A）、擬聲（B）、
 * owner 手填的台詞（C，OWNER_LINES.csv）。⛔ 它一句台詞都不編。
 *
 * 這一條驗兩個方向（第二守則⑫）：
 *   ① 真的 repo：`--check` 要 EXIT 0（status.json 與來源一致）；
 *   ② 沙盒裡拿掉一位英雄的一支技能名 ⇒ EXIT 1，訊息**指名**那位英雄與那一格。
 *
 * ⛔ 不驗 mp3 的內容（那是 run-combat-gen 的兩軸尺＋ combatVoiceCoverage 的事）。
 *
 * ── 突變紀錄（一批一條）──────────────────────────────────────────────────────
 *  · 把產生器裡 `if (s.error) { fail(...); continue; }` 的 fail 拿掉 ⇒ 第 2 條紅
 *    （沙盒裡缺名字的技能被靜默跳過，EXIT 0）。實測過。
 */
import { describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const GEN = "tools/voice-gen/src/build-combat-lines.mjs";
const run = (cwd: string, ...args: string[]) =>
  spawnSync("node", ["--import", "tsx", GEN, ...args], { cwd, encoding: "utf8", env: { ...process.env, VOICE_GEN_PYTHON: "" } });

describe("戰鬥語音產生器 join 出貨 roster (combat-lines-generator-runs)", () => {
  it("⭐ 真的 repo：--check EXIT 0（status.json 與技能名／擬聲／owner 台詞一致）", () => {
    const r = run(REPO, "--check");
    expect(r.stdout + r.stderr).toMatch(/heroes · \d+ lines scripted/);
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it("⛔ 沙盒裡一支技能沒有名字 ⇒ EXIT 1 並指名英雄與那一格", () => {
    const root = mkdtempSync(join(tmpdir(), "ggd-combat-lines-"));
    for (const d of ["tools/voice-gen/src", "packages/shared/testkit", "apps/platform/internal/curation", "content/champions", "content/abilities"]) {
      mkdirSync(join(root, dirname(d)), { recursive: true });
      cpSync(join(REPO, d), join(root, d), { recursive: true });
    }
    const L = "content/assets/audio/voices/lines";
    mkdirSync(join(root, L), { recursive: true });
    // `node --import tsx` resolves tsx from the cwd's node_modules — lend the repo's.
    symlinkSync(join(REPO, "node_modules"), join(root, "node_modules"), "dir");
    for (const f of ["CATEGORIES.json", "ROSTER.json", "COMBAT_CASTING.json", "COMBAT_GRUNTS.json", "SKILL_READINGS.json", "OWNER_LINES.csv", "COMBAT_ORIGINALS.json"]) {
      cpSync(join(REPO, L, f), join(root, L, f));
    }
    // the donor wavs are gitignored material; point the sandbox at the real ones via symlink-free copy of ONE hero's donor
    const casting = JSON.parse(readFileSync(join(root, L, "COMBAT_CASTING.json"), "utf8"));
    const heroId = "b2-aladdin";
    const donor = casting.champions[heroId].donor as string;
    mkdirSync(join(root, "voice-reference-pipeline/approved/processed"), { recursive: true });
    cpSync(join(REPO, "voice-reference-pipeline/approved/processed", `${donor}.wav`), join(root, "voice-reference-pipeline/approved/processed", `${donor}.wav`));
    // Narrow the sandbox roster to that one hero so the run is fast and the message is about him.
    casting.champions = { [heroId]: casting.champions[heroId] };
    writeFileSync(join(root, L, "COMBAT_CASTING.json"), JSON.stringify(casting));
    const go = join(root, "apps/platform/internal/curation/starter.go");
    const src = readFileSync(go, "utf8");
    const start = src.indexOf("starterChampions = []string{");
    const end = src.indexOf("\n\t}", start);
    writeFileSync(go, src.slice(0, start) + `starterChampions = []string{\n\t\t"${heroId}",` + src.slice(end));
    // THE MUTATION UNDER TEST: one ability loses its name.
    const ab = join(root, "content/abilities", `${heroId}.w.json`);
    writeFileSync(ab, JSON.stringify({ ...JSON.parse(readFileSync(ab, "utf8")), name: "" }));

    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`${heroId}`);
    expect(r.stderr).toContain(`${heroId}.w 沒有 name`);
  });
});
