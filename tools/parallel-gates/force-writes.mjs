#!/usr/bin/env node
/**
 * ⭐⭐ 把「**內容不同才寫**」的產生器逼出它的寫入端。
 *
 * ── 為什麼一定要逼 ────────────────────────────────────────────────────────
 * 三趟量完之後仍有 7 支**一個檔都沒寫**。它們不是不會寫,是**沒東西可寫**:
 * 上游剛把同一批檔寫成正確的,或基線那一版本來就已經是正確的。
 * ⇒ 圖上少掉它們的**出邊**,而少一條邊 = 併行時兩支同時寫同一個檔,
 *   ⛔ 而且**兩支都會說自己 OK**(第二守則的失敗形態:每個零件都對,只有組合是空的)。
 *
 * ── 邏輯(⭐ 這一步讓「0 個寫入」變成可以判定的)──────────────────────────
 * 一支**無條件寫**的工具在前三趟一定量得到寫入 ⇒ 還是 0 的那些,**必然**是
 * 「先讀出來比一比,不同才寫」的形狀 ⇒ **它一定讀得到自己的產物**。
 * ⇒ 把它讀過的每一個**文字檔**都加一個換行(⭐ JSON/CSV/MD/TS 加換行仍然合法,
 *   ⛔ 不會把工具弄壞),那麼「它會寫的那些」就必然跟磁碟上的不一樣 ⇒ 它非寫不可。
 *
 *   node tools/parallel-gates/force-writes.mjs <merged.json> --sandbox <dir> [--out <json>]
 */
import { spawn, execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const arg = (k, d) => (argv.indexOf(k) >= 0 ? argv[argv.indexOf(k) + 1] : d);
const IN = resolve(argv[0]);
const SANDBOX = resolve(arg("--sandbox", "/private/tmp/ggd-syncgraph-sandbox"));
const OUT = resolve(arg("--out", IN));
const HOOKS = `${SANDBOX}/tools/parallel-gates/hooks`;
const MARK = "/private/tmp/ggd-force.mark";
const TEXT = /\.(json|md|csv|ts|tsx|txt|yaml|yml|tsv)$/;

const io = JSON.parse(readFileSync(IN, "utf8"));
/**
 * ⚠️ 併好的檔裡 `reads` 只留了「有人寫過」的那些(⛔ 不然它 2.5MB)。
 * 要**擾動**就得拿**全量**的讀取清單 —— 不然工具的產物如果全 repo 沒有第二個寫入者,
 * 它就不在那份精簡清單裡,於是永遠擾動不到它。
 */
const RAW = new Map();
for (const f of (arg("--raw", "") ? arg("--raw", "").split(",") : [])) {
  for (const s of JSON.parse(readFileSync(resolve(f), "utf8")).steps) {
    RAW.set(s.name, new Set([...(RAW.get(s.name) ?? []), ...s.reads]));
  }
}
const targets = io.steps.filter((s) => s.writes.length === 0);
if (!targets.length) {
  console.log("✓ 每一支都量得到寫入端 —— ⛔ 不需要逼");
  process.exit(0);
}
console.log(`⏱  逼 ${targets.length} 支交出寫入端: ${targets.map((s) => s.name).join(" · ")}`);

const find = (mark) => {
  let out = "";
  try {
    out = execFileSync(
      "find",
      ["content", "docs", "tools", "packages", "apps", "scripts", "data", "-type", "f", "-newer", mark,
       "-not", "-path", "*/node_modules/*"],
      { cwd: SANDBOX, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch (e) { out = String(e.stdout ?? ""); }
  return out.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("tools/parallel-gates/"));
};

for (const step of targets) {
  // ⭐ 2026-08-26（GH#771）：沙盒保留了隔離區的 444 ⇒ 先整棵解鎖再量,
  //    不然「強迫寫」的那一寫也吃 EACCES,量到的仍然是 0（自我增強迴圈）。
  execFileSync("bash", ["-c", `find "${SANDBOX}" -type f ! -perm -u+w ! -path '*/.git/*' ! -path '*/node_modules/*' -exec chmod u+w {} +`], { stdio: "ignore" });
  execFileSync("bash", ["tools/parallel-gates/reset-sandbox.sh"], { cwd: SANDBOX, stdio: "ignore" });
  // ⭐ 每一個讀過的文字檔加一個換行 ⇒ 「它會寫的那些」必然跟磁碟上的不一樣
  let touched = 0;
  for (const r of RAW.get(step.name) ?? step.reads) {
    if (!TEXT.test(r)) continue;
    try {
      const p = `${SANDBOX}/${r}`;
      if (statSync(p).isFile()) { appendFileSync(p, "\n"); touched++; }
    } catch { /* 讀過但現在不在了 —— 跳過 */ }
  }
  writeFileSync(MARK, "");
  const code = await new Promise((done) => {
    const p = spawn("pnpm", [step.name], {
      cwd: SANDBOX, stdio: "ignore",
      env: { ...process.env, GGD_TRACE_ROOT: SANDBOX, GGD_QUARANTINE_OFF: "1", PYTHONPATH: HOOKS,
             NODE_OPTIONS: `--require ${HOOKS}/node-trace.cjs` },
    });
    p.on("close", done);
  });
  const w = find(MARK);
  step.writes = [...new Set([...step.writes, ...w])].sort();
  step.writeCount = step.writes.length;
  step.forced = true;
  console.log(`   ${step.name.padEnd(26)} 擾動 ${String(touched).padStart(4)} 檔 ⇒ 寫 ${w.length}${code ? `  (exit ${code})` : ""}`);
}

writeFileSync(OUT, `${JSON.stringify(io, null, 2)}\n`, "utf8");
const still = io.steps.filter((s) => s.writes.length === 0).map((s) => s.name);
console.log(`\n⭐ ${OUT}`);
console.log(still.length
  ? `✓ 逼完仍然 0 寫入 ⇒ **它們真的只讀不寫**(純檢查): ${still.join(" · ")}`
  : "✓ 全部交出寫入端");
