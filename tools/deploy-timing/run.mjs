#!/usr/bin/env node
/**
 * ⏱ **部署計時帳本** —— owner 2026-08-23 逐字:
 *
 *   「**跑太久了吧 已經超過一小時 改一個小地方 上線成本這麼高**⋯」
 *   「**你要記錄一下各單元到底花多少時間做什麼,並且分析如何減少時間**」
 *
 * ── 為什麼這支存在,而不是「記得計時」──────────────────────────────────────
 * 「這一小時花在哪」在此之前**沒有任何地方記著**。`tools/parallel-gates/run.mjs`
 * 已經在寫 `docs/_data/gate-timings.json`,但那只涵蓋 36 支唯讀閘 ——
 * `content:build` / `skills:sync` / `tsc` / 各包 vitest / git / 遠端 build /
 * 遠端重啟 / 煙霧測試 **一段都沒有被量過**。
 * ⇒ 於是「太久」永遠只能用猜的,而猜出來的優化會優化錯地方。
 *
 * ── 它有四個動詞 ─────────────────────────────────────────────────────────
 *   stage   量**一段**(包在既有指令外面,⛔ 不改那些指令)
 *   plan    印出某一級要跑哪些段(從 tiers.json 推導,⛔ 不寫死)
 *   tier    ⭐ **機械分級** —— 讀 git diff 的路徑集合,⛔ 不是「我覺得只是小改」
 *   ingest  把一份 host-deploy.sh 的 log 撈成遠端分段(⛔ 不必 ssh)
 *   report  「這一小時花在哪」
 *
 * ── ⚠️ 帳本**刻意帶時間戳**,所以它⛔ **永遠不可以被逐位元組 --check 比對** ──
 * CLAUDE.md 記著「任何隨時鐘變動的欄位都會讓 `--check` 只能被放寬,
 * 而一條被放寬的閘等於沒有閘」。那條規則管的是**產生的文件**;
 * 這一份是**時間序列帳本** —— 沒有時間就沒有資訊。
 * ⇒ 兩者的出路不同:那些不加時鐘,這一份加時鐘**並且不掛 --check 閘**。
 */
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const LEDGER = `${ROOT}docs/_data/deploy-timings.json`;
const TIERS = JSON.parse(readFileSync(new URL("./tiers.json", import.meta.url), "utf8"));
/** ⭐ 帳本只留最近 N 次 —— 它是累積的,但⛔ 不是無上限的。 */
const KEEP_RUNS = Number(process.env.GGD_DEPLOY_KEEP_RUNS ?? 60);

/**
 * ⚠️⭐ **`-c core.quotepath=false` 不是潔癖,它是這支工具的正確性條件。**
 *
 * git 預設把非 ASCII 路徑印成 **C 風格跳脫並加上雙引號**:
 *   `"docs/\346\212\200\350\203\275…​.md"`
 * ⇒ 那條字串**對不到 `tiers.json` 的任何一條規則**（連開頭的 `docs/` 都不是,
 *   因為第一個字元是 `"`）⇒ fail-closed 落 **T3**。
 *
 * 方向是安全的（往上倒），⛔ 但後果是這支工具在**這個 repo 上等於沒用**:
 * `docs/技能標記機制與效果規則.md` 這一族 CJK 檔名遍佈全樹,
 * 於是**一次純文件改動也會被判成「完整重建 191s」**。
 * 量到（2026-08-23，v0.25.6..v0.25.7 的 142 個檔）:1 條路徑因此變成 unknown。
 */
const git = (...a) => {
  try {
    return execFileSync("git", ["-c", "core.quotepath=false", ...a], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

/**
 * 一次「上架」的識別。同一天 + 同一個 ref = 同一次 ⇒ 多次 `stage` 呼叫會自動
 * 併進同一列,⛔ 不需要誰去傳一個 run id(那是一個會被忘記的步驟)。
 */
function runId() {
  if (process.env.GGD_DEPLOY_RUN) return process.env.GGD_DEPLOY_RUN;
  const day = new Date().toISOString().slice(0, 10);
  return `${day}/${git("describe", "--tags", "--always", "--dirty") || "nogit"}`;
}

function readLedger() {
  if (!existsSync(LEDGER)) return { schema: "ggd-deploy-timings@1", runs: [] };
  try {
    return JSON.parse(readFileSync(LEDGER, "utf8"));
  } catch {
    return { schema: "ggd-deploy-timings@1", runs: [] };
  }
}

/**
 * ⭐ **匯出的理由**（GH#621）：`tools/parallel-gates/ship.mjs` 也要記時,
 * 而它第一版自己寫了一份 `deploy-timings.json` —— **同一份知識兩個住處、
 * 兩個不相容的 schema**（第〇·四守則）。⇒ 它改成 import 這一支。
 * ⚠️ 這個檔在被 import 時什麼都不做（`__lib__` 那一支），所以 import 是安全的。
 */
export function appendStage(name, ms, code, extra = {}) {
  const led = readLedger();
  const id = runId();
  let run = led.runs.find((r) => r.id === id);
  if (!run) {
    run = { id, at: new Date().toISOString().slice(0, 16), ref: git("describe", "--tags", "--always", "--dirty"), stages: [] };
    led.runs.push(run);
  }
  run.stages.push({ name, ms, code, ...extra });
  led.runs = led.runs.slice(-KEEP_RUNS);
  mkdirSync(dirname(LEDGER), { recursive: true });
  writeFileSync(LEDGER, `${JSON.stringify(led, null, 2)}\n`, "utf8");
  return run;
}

const fmt = (ms) => (ms >= 60000 ? `${(ms / 60000).toFixed(1)}m` : `${(ms / 1000).toFixed(1)}s`);

// ─────────────────────────────────────────────────────────────────────────────
// stage —— 量一段
// ─────────────────────────────────────────────────────────────────────────────
async function cmdStage(argv) {
  const sep = argv.indexOf("--");
  const name = argv[0];
  if (!name || sep < 0) {
    console.error("用法: run.mjs stage <段名> -- <指令…>");
    process.exit(2);
  }
  const [bin, ...args] = argv.slice(sep + 1);
  const t0 = Date.now();
  const code = await new Promise((res) => {
    const p = spawn(bin, args, { cwd: ROOT, stdio: "inherit", shell: false });
    p.on("close", (c) => res(c ?? 1));
    p.on("error", () => res(127));
  });
  const ms = Date.now() - t0;
  appendStage(name, ms, code);
  console.error(`⏱ ${name}: ${fmt(ms)} (exit ${code}) → docs/_data/deploy-timings.json`);
  // ⭐ 透明轉發離開碼 —— 一支會吞掉紅燈的計時器比沒有計時器更糟。
  process.exit(code);
}

// ─────────────────────────────────────────────────────────────────────────────
// tier —— ⭐ 機械分級
// ─────────────────────────────────────────────────────────────────────────────
/** 一條路徑 → 級別。⛔ 沒有規則吃到就落 unknownTier(fail-closed)。 */
export function tierOf(path, tiers = TIERS) {
  for (const r of tiers.rules) {
    if (r.path && path === r.path) return { tier: r.tier, why: r.why, isProtocol: !!r.protocol };
    if (r.prefix && path.startsWith(r.prefix)) return { tier: r.tier, why: r.why, isProtocol: !!r.protocol };
  }
  // ⭐ `unknown` 是**旗標**,⛔ 不是「why 字串裡有沒有那幾個字」——
  //    下游（`shipPlan.mjs` 的閘選擇）要靠它 fail-closed,而字串比對會被一次
  //    文案潤飾靜默關掉（＝ CLAUDE.md 失敗形態⑥:掃字串代替行為）。
  return { tier: tiers.unknownTier, why: "⛔ 沒有任何規則吃到這條路徑 ⇒ fail-closed 落到全量重建", unknown: true };
}

/** 一組路徑 → 最高級別(order 越後面越高)。 */
export function classify(paths, tiers = TIERS) {
  const order = tiers.order;
  let best = "NOOP";
  let protocol = false;
  const reasons = new Map();
  for (const p of paths) {
    const { tier, why, isProtocol } = tierOf(p, tiers);
    if (isProtocol) protocol = true;
    if (!reasons.has(tier)) reasons.set(tier, { why, sample: p, n: 0 });
    reasons.get(tier).n += 1;
    if (order.indexOf(tier) > order.indexOf(best)) best = tier;
  }
  return { tier: best, reasons, protocol };
}

/**
 * ⭐ **T2 → T1 → T0 的降級**,而且它**機械可判**(⛔ 不是「我覺得只是改個值」)。
 *
 * 兩個條件都成立才降:
 *   ① 改到的 content 只有 `content/config/*.json`(產生的 bundle/索引不算數)
 *   ② 每一份的 **key 集合逐一相同** —— 只有值變
 *
 * ⚠️ ②為什麼是 key 集合而不是「檔案內容看起來很像」:後台那一格是 admin 映像
 * 裡的欄位表畫出來的。多一個 key ⇒ 後台畫不出來 ⇒ 走後台就改不到它。
 * ⛔ 而 schema 動了的話上面早就落 T3 了,所以這裡只需要問 key。
 *
 * @param readAt (ref, path) => string|null  取某個 ref 上那份檔的內容
 */
export function downgrade(paths, readAt, tiers = TIERS) {
  const d = tiers.downgrade;
  const isGenerated = (p) => d.generated.includes(p) || p.endsWith(d.generatedSuffix);
  const content = paths.filter((p) => p.startsWith("content/") && !isGenerated(p));
  if (!content.length) return { tier: "T2", why: "只有產生的索引/bundle 變了" };
  const nonConfig = content.find((p) => !p.startsWith(d.configPrefix));
  if (nonConfig) return { tier: "T2", why: `有非 config 的內容(${nonConfig})⇒ 後台改不到它` };

  const names = [];
  for (const p of content) {
    const [before, after] = readAt(p);
    if (before == null || after == null) return { tier: "T2", why: `${p} 是新增或刪除的檔 ⇒ ⛔ 不降級` };
    let a, b;
    try {
      a = keySet(JSON.parse(before));
      b = keySet(JSON.parse(after));
    } catch {
      return { tier: "T2", why: `${p} 讀不成 JSON ⇒ ⛔ fail-closed 不降級` };
    }
    if (a.size !== b.size || [...a].some((k) => !b.has(k))) {
      return { tier: "T2", why: `${p} 的 key 集合變了(⭐ 新欄位 ⇒ 後台畫不出來)` };
    }
    names.push(p.slice(d.configPrefix.length).replace(/\.json$/, ""));
  }
  const busOnly = names.every((n) => d.busDocs.includes(n));
  return busOnly
    ? { tier: d.toTierWhenBusOnly, why: `只動了 content-bus 認得的 ${names.join(",")} ⇒ 後台存檔即可` }
    : { tier: d.toTierWhenValuesOnly, why: `只有值變(${names.join(",")})⇒ 走 durable overlay` };
}

/** 遞迴收集所有 key path —— ⛔ 只看形狀,⛔ 不看值。 */
function keySet(obj, prefix = "", out = new Set()) {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const k of Object.keys(obj)) {
      out.add(`${prefix}${k}`);
      keySet(obj[k], `${prefix}${k}.`, out);
    }
  }
  return out;
}

function cmdTier(argv) {
  const arg = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const head = arg("--head") ?? "HEAD";
  let deployed = arg("--deployed") ?? process.env.GGD_DEPLOYED_REF;
  // ⭐ 版本徽章長 `v0.25.6-2-gc10e8d52 2026-08-23`(`git describe --tags --dirty`),
  //    所以線上那一版可以**直接從煙霧測試讀到的那一行**餵進來。
  const stamp = arg("--stamp");
  if (!deployed && stamp) deployed = stamp.trim().split(/\s+/)[0];

  if (!deployed) {
    console.error(
      `⛔ 不知道**線上正在服務哪一個 commit** ⇒ 拒絕分級,判定為 ${TIERS.unknownTier}(全量重建)。\n\n` +
        `   ⭐ 這是刻意 fail-closed 的:分級的起點必須是**線上那一版**,\n` +
        `      ⛔ 不是「我這次改了什麼」。2026-08-02 的事故就是那一次 push 裡\n` +
        `      content 與 schema 都動了,而只有 content 被送上去。\n\n` +
        `   怎麼拿到它(三選一):\n` +
        `     · 網站右下角的版本徽章 → run.mjs tier --stamp "v0.25.6-2-gc10e8d52"\n` +
        `     · host 上 pull 之前的 HEAD  → run.mjs tier --deployed <sha>\n` +
        `     · export GGD_DEPLOYED_REF=<sha>`,
    );
    console.log(TIERS.unknownTier);
    process.exit(3);
  }
  const range = `${deployed}..${head}`;
  const out = git("diff", "--name-only", range);
  if (!out) {
    // ⛔ 空的 diff 有兩個意思:真的沒改,或者那個 ref 這台機器不認得。要分開。
    const known = git("rev-parse", "--verify", `${deployed}^{commit}`);
    if (!known) {
      console.error(`⛔ 認不得 ref "${deployed}"(git fetch 了嗎?)⇒ fail-closed ${TIERS.unknownTier}`);
      console.log(TIERS.unknownTier);
      process.exit(3);
    }
    console.error(`✓ ${range} 沒有任何檔案改動 ⇒ NOOP(⛔ 不必部署)`);
    console.log("NOOP");
    return;
  }
  const paths = out.split("\n").filter(Boolean);
  const { tier: raw, reasons, protocol } = classify(paths);
  let tier = raw;
  let down = null;
  if (raw === "T2") {
    down = downgrade(paths, (p) => [git("show", `${deployed}:${p}`) || null, git("show", `${head}:${p}`) || null]);
    tier = down.tier;
  }
  const plan = TIERS.plans[tier];
  console.error(`\n⏱ 分級 ${range} —— ${paths.length} 個檔 ⇒ **${tier}**${plan ? `(${plan.label})` : ""}`);
  for (const t of [...TIERS.order].reverse()) {
    const r = reasons.get(t);
    if (r) console.error(`   ${t === raw ? "⭐" : "  "} ${t} ×${r.n}  例:${r.sample}\n        ${r.why}`);
  }
  if (down) console.error(`   ${down.tier === "T2" ? "⛔ 不降級" : `⭐ 降級 T2 → ${down.tier}`}:${down.why}`);
  if (plan) {
    console.error(`\n   指令: ${plan.remote}`);
    console.error(`   量到的成本: ~${plan.seconds}s(對照 T3 的 191s —— 逐段見 docs/_reports/deploy-cost_temp_20260823-1547.md)`);
    if (plan.skips.length) console.error(`   省下: ${plan.skips.join(" · ")}`);
    console.error(`   ⛔ 一段都不省的: ${plan.keeps.join(" · ") || "(無)"}`);
  }
  if (protocol) console.error(`\n${TIERS.protocolRider.join("\n")}`);
  console.log(tier);
}

// ─────────────────────────────────────────────────────────────────────────────
// ingest —— 把 host-deploy.sh 的 log 撈成遠端分段(⛔ 不必 ssh)
// ─────────────────────────────────────────────────────────────────────────────
/** buildkit 印 `#12 [edge build 7/17] RUN …` 與 `#12 DONE 3.4s`,把它們配起來。 */
export function parseBuildLog(text) {
  const clean = text.replace(/\x1b\[[0-9;]*m/g, "");
  const names = new Map();
  const dur = new Map();
  for (const line of clean.split("\n")) {
    const m = /^#(\d+) (\[[^\]]*\].*)$/.exec(line);
    if (m && !names.has(m[1])) names.set(m[1], m[2]);
    const d = /^#(\d+) DONE ([\d.]+)s$/.exec(line);
    if (d) dur.set(d[1], Math.round(Number(d[2]) * 1000));
  }
  /** 每個映像的**鏈**加總。⚠️ 三個映像是**並行**建的,所以 wall ≈ max(鏈),⛔ 不是 sum。 */
  const perImage = {};
  for (const [id, ms] of dur) {
    const img = (/^\[([a-z0-9-]+)/.exec(names.get(id) ?? "") ?? [, "?"])[1];
    perImage[img] = (perImage[img] ?? 0) + ms;
  }
  const steps = [...dur].map(([id, ms]) => ({ step: names.get(id) ?? `#${id}`, ms })).sort((a, b) => b.ms - a.ms);
  return { perImage, steps, sumMs: [...dur.values()].reduce((a, b) => a + b, 0) };
}

function cmdIngest(argv) {
  const file = argv[0];
  if (!file || !existsSync(file)) {
    console.error("用法: run.mjs ingest <host-deploy 的 log 檔>");
    process.exit(2);
  }
  const { perImage, steps, sumMs } = parseBuildLog(readFileSync(file, "utf8"));
  const wallish = Math.max(0, ...Object.values(perImage));
  for (const [img, ms] of Object.entries(perImage)) appendStage(`remote:build:${img}`, ms, 0, { source: file });
  console.error(`⏱ ${file} —— 遠端 build 分段:`);
  for (const [img, ms] of Object.entries(perImage).sort((a, b) => b[1] - a[1])) console.error(`   ${img.padEnd(10)} 鏈加總 ${fmt(ms)}`);
  console.error(`   ⇒ 累計 ${fmt(sumMs)},而三個映像並行 ⇒ **wall 下界 ≈ ${fmt(wallish)}**(最長那一條鏈)`);
  console.error(`   最貴五步:`);
  for (const s of steps.slice(0, 5)) console.error(`     ${fmt(s.ms).padStart(7)}  ${s.step.slice(0, 72)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// report / plan
// ─────────────────────────────────────────────────────────────────────────────
function cmdReport() {
  const led = readLedger();
  if (!led.runs.length) {
    console.error("帳本是空的 —— 先用 `run.mjs stage <名> -- <指令>` 包住幾段再回來。");
    return;
  }
  const agg = new Map();
  for (const r of led.runs) for (const s of r.stages) agg.set(s.name, [...(agg.get(s.name) ?? []), s.ms]);
  const rows = [...agg].map(([n, xs]) => ({ n, med: xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)], k: xs.length }));
  rows.sort((a, b) => b.med - a.med);
  const total = rows.reduce((s, r) => s + r.med, 0);
  console.error(`\n⏱ 部署計時帳本 —— ${led.runs.length} 次上架 · 中位數合計 ${fmt(total)}\n`);
  for (const r of rows) {
    const pct = ((r.med / total) * 100).toFixed(0);
    console.error(`  ${fmt(r.med).padStart(7)}  ${String(pct).padStart(3)}%  ${r.n}  (n=${r.k})`);
  }
  console.error(`\n  最近一次: ${led.runs.at(-1).id}`);
}

function cmdPlan(argv) {
  const t = (argv[0] ?? "").toUpperCase();
  const p = TIERS.plans[t];
  if (!p) {
    console.error(`用法: run.mjs plan <${Object.keys(TIERS.plans).join("|")}>`);
    process.exit(2);
  }
  console.error(`${t} —— ${p.label}\n  指令: ${p.remote}\n  省下: ${p.skips.join(" · ") || "(無)"}\n  ⛔ 不省: ${p.keeps.join(" · ")}`);
}

// ⚠️ 這一段**只在被直接執行時**跑。少了這道閘,`import { classify }` 會讓
//    CLI 拿 vitest 的 argv 去 dispatch —— 測試會去讀 `--head` 之類不存在的旗標,
//    而它長得像一個「工具壞了」的紅。
const RUN_AS_CLI = (process.argv[1] ?? "").endsWith("run.mjs");
const [verb, ...rest] = RUN_AS_CLI ? process.argv.slice(2) : ["__lib__"];
if (verb === "__lib__") {
  /* 被 import：⛔ 什麼都不做 */
} else if (verb === "stage") await cmdStage(rest);
else if (verb === "tier") cmdTier(rest);
else if (verb === "ingest") cmdIngest(rest);
else if (verb === "report") cmdReport();
else if (verb === "plan") cmdPlan(rest);
else if (verb) {
  console.error(`⛔ 不認得 "${verb}"`);
  process.exit(2);
} else {
  console.error(
    "⏱ 部署計時帳本\n" +
      "  stage <段名> -- <指令…>   量一段並寫進 docs/_data/deploy-timings.json\n" +
      "  tier [--stamp <徽章>|--deployed <ref>] [--head <ref>]   ⭐ 機械分級(fail-closed)\n" +
      "  ingest <deploy.log>       把遠端 docker build 的分段撈進帳本\n" +
      "  report                    這一小時花在哪\n" +
      "  plan <T0|T1|T2|T3>        某一級要跑什麼、省下什麼、⛔ 不省什麼",
  );
}
