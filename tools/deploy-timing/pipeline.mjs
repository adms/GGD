#!/usr/bin/env node
/**
 * 🚢🤖 **`pnpm ship`** —— 分級 → 只跑該跑的閘 → 版號 → push → release note → 部署 → 煙霧。
 *
 * > owner 2026-08-23 逐字：「或是其他**輕量級動態線上上架方式 (hotfix, patch)
 * >  設計與建議**，並且要**能自動化判斷執行**」
 * > ＋「最後記得**全部規則轉成自動化指令避免疏漏忘記**」
 *
 * ── 它取代的是**一串要記得的東西** ──────────────────────────────────────
 * 部署協定有六步、五個地雷、五項後置條件、一條煙霧測試，而 CLAUDE.md 自己記著
 * 「散文治不了『憑記憶重新推導一個五步序列』」。這一支就是那個序列的程式版。
 *
 * ── ⭐ 三件它**刻意不做**的事 ───────────────────────────────────────────
 *   ① ⛔ 不自己重寫分級 —— 分級走 `run.mjs tier`（同一支、同一張 `tiers.json`）
 *   ② ⛔ 不自己重寫跑閘 —— 閘走 `tools/parallel-gates/ship.mjs`（同一支）
 *   ③ ⛔ **會改到別人看得到的東西那幾步，預設只印不跑**（要 `--execute`）
 *
 * ── ⛔ fail-closed（三個入口，全部往「多跑」倒）─────────────────────────
 *   · 不知道線上服務哪一版 ⇒ T3 ＋ 閘全跑
 *   · 有路徑沒被 `tiers.json` 吃到 ⇒ T3 ＋ 閘全跑
 *   · 閘紅了 ⇒ ⛔ 後面一步都不做（⛔ 不是「先 tag 起來再說」）
 *
 * 用法:
 *   pnpm ship --stamp "v0.25.7-3-gabc1234"      # 線上徽章那一行,⭐ 最常用
 *   pnpm ship --deployed <sha> [--head <ref>]
 *   pnpm ship --plan-only                        # 只印計畫,⛔ 一個閘都不跑
 *   pnpm ship --execute --tag "說明" --notes docs/_release/xxx.md
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { appendStage } from "./run.mjs";
import { TIERS, gateArgs, gatePlan, shipPlan } from "./shipPlan.mjs";
import { packagesWithVitest } from "../parallel-gates/packages.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(k);
const opt = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const execute = flag("--execute");
const planOnly = flag("--plan-only");
const head = opt("--head", "HEAD");
const message = opt("--tag");
const notes = opt("--notes");

const sh = (bin, args) => [bin, ...args.map((a) => (/^[\w@./:=-]+$/.test(a) ? a : `'${a.replace(/'/g, "'\\''")}'`))].join(" ");
/** ⚠️ `-c core.quotepath=false`:⛔ 少了它,CJK 檔名會變成加引號的跳脫字串而對不到任何規則(理由見 run.mjs)。 */
const git = (...a) => spawnSync("git", ["-c", "core.quotepath=false", ...a], { cwd: ROOT, encoding: "utf8" }).stdout?.trim() ?? "";

// ── ① 分級 —— ⭐ 走既有的 `run.mjs tier`，⛔ 不重寫一份 ───────────────────
const tierArgs = ["tier", "--head", head];
for (const k of ["--deployed", "--stamp"]) if (opt(k)) tierArgs.push(k, opt(k));
const t = spawnSync("node", [new URL("./run.mjs", import.meta.url).pathname, ...tierArgs], {
  cwd: ROOT,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});
const tier = (t.stdout ?? "").trim().split("\n").filter(Boolean).pop() ?? TIERS.unknownTier;

// ── 路徑集合（閘的選擇讀它，⛔ 不讀級別）─────────────────────────────────
let deployed = opt("--deployed") ?? process.env.GGD_DEPLOYED_REF;
if (!deployed && opt("--stamp")) deployed = opt("--stamp").trim().split(/\s+/)[0];
const range = deployed ? `${deployed}..${head}` : null;
const diff = range ? git("diff", "--name-only", range) : "";
const paths = diff ? diff.split("\n").filter(Boolean) : [];
/** ⛔ 認不得起點 ⇒ ⛔ 不可以推論成「沒有東西改」。閘全跑。 */
const blind = !range || (t.status ?? 0) === 3;
const gates = blind
  ? { serial: true, typecheck: true, suites: packagesWithVitest(ROOT), ownGuards: true, why: ["⛔ 不知道線上正在服務哪一版 ⇒ 閘**全跑**（fail-closed）"] }
  : gatePlan(paths);

const version = spawnSync("bash", ["scripts/release.sh", "--next"], { cwd: ROOT, encoding: "utf8" }).stdout?.trim() || "<版號>";
const plan = shipPlan(paths, { tier, version, notes: notes ?? "<release note 檔>", message: message ?? "<說明>" });
plan.gates = gates;

// ── 印出計畫 ─────────────────────────────────────────────────────────────
const skipped = packagesWithVitest(ROOT).filter((s) => !gates.suites.includes(s));
console.log(`\n🚢 pnpm ship —— ${range ?? "(不知道起點)"} · ${paths.length} 個檔 ⇒ **${plan.tier}**（${TIERS.plans[plan.tier].label}）`);
console.log(`   重建映像: ${plan.rebuild ? "✅ 要（~191s）" : "⛔ 不必"}   下一個版號: ${version}`);
console.log(`\n   閘（⭐ 判準是路徑集合，⛔ 不是級別）:`);
console.log(`     ${gates.serial ? "✅" : "⛔ 略過"} 全域鎖 content:build → skills:sync`);
console.log(`     ${gates.typecheck ? "✅" : "⛔ 略過"} typecheck`);
console.log(`     ✅ skills:check（36 支，⛔ 從不打折）`);
console.log(`     ✅ vitest: ${gates.suites.join(" · ")}${skipped.length ? `\n     ⛔ 略過: ${skipped.join(" · ")}` : ""}`);
for (const w of gates.why) console.log(`       · ${w}`);
console.log(`\n   步驟:`);
for (const s of plan.steps) {
  const line = s.cmd ? sh(s.cmd[0], s.cmd[1]) : (s.manual ?? "—");
  console.log(`     ${s.mutating ? (execute ? "▶" : "🖨 只印") : "▶"} ${s.name.padEnd(12)} ${line}`);
  console.log(`        ${s.why}`);
}
if (plan.rider.length) console.log(`\n${plan.rider.join("\n")}`);

if (planOnly) process.exit(0);

// ── ② 閘 —— ⭐ 走既有的 ship.mjs ─────────────────────────────────────────
const t0 = Date.now();
const args = gateArgs(gates);
console.log(`\n⚡ 閘: node tools/parallel-gates/ship.mjs ${args.join(" ")}\n`);
const code = await new Promise((res) => {
  const p = spawn("node", [new URL("../parallel-gates/ship.mjs", import.meta.url).pathname, ...args], { cwd: ROOT, stdio: "inherit" });
  p.on("close", (c) => res(c ?? 1));
  p.on("error", () => res(127));
});
appendStage("ship:gates", Date.now() - t0, code, { tier: plan.tier, suites: gates.suites.length });
if (code !== 0) {
  console.error(`\n⛔ 閘紅了 ⇒ **後面一步都不做**。⭐ 一次修完再跑一次(⛔ 不要「修一個跑一次」)。`);
  process.exit(code);
}

// ── ③ 出貨的那幾步 ───────────────────────────────────────────────────────
if (plan.tier === "NOOP") {
  console.log(`\n✅ 閘全綠，而這一批 ⛔ 沒有任何會影響出貨的檔案改動 ⇒ 不必部署。`);
  process.exit(0);
}
if (!execute) {
  console.log(`\n✅ 閘全綠。⭐ 下面這幾行是**這一級該跑的**，逐行複製即可（⛔ 我不自己跑：push / gh / 部署是主 session 的）:\n`);
  for (const s of plan.steps.filter((x) => x.cmd || x.manual)) console.log(`  ${s.cmd ? sh(s.cmd[0], s.cmd[1]) : `# ${s.manual}`}`);
  console.log(`\n  （要它真的跑：pnpm ship --execute --tag "說明" --notes <release note 檔>）`);
  process.exit(0);
}

// ⛔ fail-closed：--execute 少了任何一個必要的東西就停，⛔ 不要編一個預設值。
if (!message) die(`⛔ --execute 需要 --tag "說明"（版號走 scripts/release.sh，⛔ 不手打 git tag）`);
if (!notes || !existsSync(`${ROOT}${notes}`)) die(`⛔ --execute 需要 --notes <存在的 release note 檔>（每次 push 都要帶 note）`);
for (const s of plan.steps) {
  if (!s.cmd) {
    console.log(`\n⏸ ${s.name} 需要人做: ${s.manual ?? s.why}`);
    continue;
  }
  console.log(`\n▶ ${s.name}: ${sh(s.cmd[0], s.cmd[1])}`);
  const st = Date.now();
  const c = await new Promise((res) => {
    const p = spawn(s.cmd[0], s.cmd[1], { cwd: ROOT, stdio: "inherit" });
    p.on("close", (x) => res(x ?? 1));
    p.on("error", () => res(127));
  });
  appendStage(`ship:${s.name}`, Date.now() - st, c, { tier: plan.tier });
  if (c !== 0) die(`⛔ ${s.name} 回 ${c} ⇒ 停。⛔ 後面的步驟不做（半套部署＝08-02 的形狀）。`);
}
console.log(`\n✅ ${plan.tier} 上架完成。⚠️ 最後一步是人做的: ${TIERS.plans[plan.tier].keeps.join(" · ")}`);

function die(msg) {
  console.error(`\n${msg}`);
  process.exit(2);
}
