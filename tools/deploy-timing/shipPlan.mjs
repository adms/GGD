#!/usr/bin/env node
/**
 * 🚢 **一次上架要跑哪幾段** —— `pnpm ship` 的**純函式**那一半。
 *
 * > owner 2026-08-23 逐字：「或是其他**輕量級動態線上上架方式 (hotfix, patch)
 * >  設計與建議**，並且要**能自動化判斷執行**」
 * > ＋「最後記得**全部規則轉成自動化指令避免疏漏忘記**」
 *
 * ── ⭐ 兩個**不同**的問題，⛔ 不可以用同一個答案 ────────────────────────────
 *
 *   ① **要不要重建映像？**  ⇒ 分級（`run.mjs` 的 `classify` + `downgrade`）
 *   ② **這次的改動可能弄壞誰？** ⇒ 閘的選擇（這一支）
 *
 * ⚠️ 把②交給①是**這支腳本最容易犯的錯**：一次 `content/` ＋ `tools/` 的改動
 * 分級是 **T2**（⛔ 不重建映像），而它照樣讓 36 支產生器閘全部過期。
 * ⇒ 兩個問題各自讀**同一份路徑集合**，⛔ 不互相推導。
 *
 * ── ⛔ 這支⛔ **不削弱任何既有的閘** ────────────────────────────────────
 * 它只回答「跑不跑」。每一支閘的指令、斷言、離開碼逐字不動 ——
 * 08-01／08-02 兩次「全綠而線上整個掛掉」的教訓是**閘不夠**，⛔ 不是閘太多。
 *
 * ── fail-closed 的三個入口（⛔ 全部都往「多跑」倒）──────────────────────
 *   · 路徑沒被 `tiers.json` 的 rules 吃到  ⇒ 分級 T3 **且**閘全跑
 *   · 認不得 `alwaysSuites` 裡的包名        ⇒ 閘全跑（⛔ 不是靜默略過）
 *   · 不知道線上正在服務哪一版              ⇒ `run.mjs tier` 自己回 T3
 */
import { readFileSync } from "node:fs";
import { tierOf } from "./run.mjs";
import { packagesWithVitest } from "../parallel-gates/packages.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
export const TIERS = JSON.parse(readFileSync(new URL("./tiers.json", import.meta.url), "utf8"));

/** 前綴（結尾有 `/`）或整條路徑，兩種寫法都吃。 */
const hits = (p, list) => list.some((x) => (x.endsWith("/") ? p.startsWith(x) : p === x));

/**
 * ⭐ **哪幾支閘要跑** —— 判準是**路徑集合**，⛔ 不是級別。
 *
 * @param {string[]} paths      這次上架涵蓋的 git diff 路徑集合
 * @param {object}   [o]
 * @param {object}   [o.tiers]  預設讀出貨的 tiers.json
 * @param {string[]} [o.allSuites] 有 vitest 的包（⭐ 掃出來的，⛔ 不是手寫）
 */
export function gatePlan(paths, { tiers = TIERS, allSuites = packagesWithVitest(ROOT) } = {}) {
  const g = tiers.gatePlan;
  const why = [];
  if (!paths.length) {
    return { serial: false, typecheck: false, suites: [], ownGuards: false, why: ["沒有任何檔案改動 ⇒ 沒有東西要驗"] };
  }

  // ── fail-closed ①：有路徑沒被任何規則吃到 ⇒ 全跑 ──────────────────────
  const unknown = paths.filter((p) => tierOf(p, tiers).unknown);
  // ── fail-closed ②：alwaysSuites 指到一個不存在的包（改名／搬家）⇒ 全跑 ──
  const missing = g.alwaysSuites.filter((s) => !allSuites.includes(s));
  if (missing.length) why.push(`⛔ alwaysSuites 指到不存在的包(${missing.join(",")}) ⇒ 全跑`);
  if (unknown.length) why.push(`⛔ ${unknown.length} 條路徑沒有任何規則吃到(例:${unknown[0]}) ⇒ 全跑`);
  const forceAll = unknown.length > 0 || missing.length > 0;

  // ── 序列段（content:build → skills:sync，全域鎖）──────────────────────
  // ⛔ 判準是「產生器**讀**得到誰」，⛔ 不是「這次是不是內容改動」：
  //    tools/ 裡一支產生器改一行，出貨的 JSON 與 12 份文件會同時過期。
  const serial = forceAll || paths.some((p) => hits(p, g.syncInputs));
  if (serial && !forceAll) why.push("動到產生器讀得到的東西 ⇒ 跑全域鎖那一段");

  // ── typecheck ──────────────────────────────────────────────────────────
  const typecheck = forceAll || paths.some((p) => g.typecheckExts.some((e) => p.endsWith(e)));

  // ── vitest：哪幾包 ─────────────────────────────────────────────────────
  // ⭐ `packages/shared` **永遠跑**：`src/ops/` 那一族讀的是 `scripts/`、
  //    `CLAUDE.md`、`apps/admin/`、`docs/` —— 它是跨全 repo 的閘，
  //    ⛔ 「我沒有動 packages/shared」推不出「它不會紅」。
  const global = paths.some((p) => hits(p, g.globalInputs));
  let suites;
  if (forceAll || global) {
    suites = [...allSuites];
    if (global && !forceAll) why.push("動到全 repo 共用的輸入(content/ · packages/shared/ · 根設定) ⇒ 每一包都跑");
  } else {
    const touched = allSuites.filter((r) => paths.some((p) => p.startsWith(`${r}/`)));
    suites = [...new Set([...g.alwaysSuites, ...touched])].sort();
    why.push(`只碰到 ${touched.length ? touched.join(" · ") : "(零個包)"} ⇒ 跑它們 ＋ 永遠要跑的 ${g.alwaysSuites.join(",")}`);
  }

  // ⭐ 這支管線**自己的**守衛一律跑：它決定別人跑不跑，⛔ 它自己不可以沒被驗。
  return { serial, typecheck, suites, ownGuards: true, why };
}

/** `gatePlan` → `tools/parallel-gates/ship.mjs` 的旗標（⭐ 由它執行，⛔ 不重寫一份跑閘的程式）。 */
export function gateArgs(plan, { allSuites = packagesWithVitest(ROOT) } = {}) {
  const a = [];
  if (!plan.serial) a.push("--no-sync");
  if (!plan.typecheck) a.push("--no-typecheck");
  if (plan.suites.length !== allSuites.length) a.push("--suites", plan.suites.join(","));
  return a;
}

/**
 * ⭐ **上架的每一步**，含它是不是「會改到別人看得到的東西」。
 *
 * ⚠️ `mutating: true` 的每一步**預設只印不跑**（`--execute` 才真的跑）——
 * 併行 lane 的硬規則：⛔ 不自己 push / gh 寫入 / 部署。
 */
export function deploySteps(tier, { tiers = TIERS, version = "<版號>", notes = "<release note 檔>", message = "<說明>" } = {}) {
  const plan = tiers.plans[tier] ?? tiers.plans[tiers.unknownTier];
  const d = tiers.deploy;
  const target = process.env[d.targetEnv] || d.sshTarget;
  const ssh = (remote) => ["ssh", ["-A", target, `cd ${d.remoteDir} && ${remote}`]];
  const steps = [];
  if (tier === "NOOP") {
    steps.push({ name: "deploy", mutating: false, cmd: null, why: "⛔ 這一批沒有任何會影響出貨的檔案改動 ⇒ 不必部署" });
    return steps;
  }
  steps.push({ name: "release:tag", mutating: true, cmd: ["bash", ["scripts/release.sh", "--tag", message]], why: "⛔ 版號一律走這一支,不要手打 git tag(規則破過 10 天)" });
  steps.push({ name: "push", mutating: true, cmd: ["git", ["push", "origin", "HEAD", "--follow-tags"]], why: "部署走 git pull ⇒ 沒 push 的來源檔會變成「bundle 有而檔案不存在」(2026-08-02)" });
  steps.push({ name: "gh:release", mutating: true, cmd: ["gh", ["release", "create", version, "--notes-file", notes]], why: "每一次 push 都要帶 release note(含逐句對票表)" });
  steps.push({
    name: "deploy",
    mutating: true,
    cmd: plan.ssh ? ssh(plan.remote) : null,
    why: `${tier} —— ${plan.label}｜量到 ~${plan.seconds}s${plan.rebuild ? "(完整重建)" : "(⛔ 不重建映像)"}`,
    manual: plan.ssh ? null : plan.remote,
  });
  steps.push({
    // ⚠️ `mutating: true` **是刻意的**:`--verify-only` 對 host 是唯讀的,
    //    但它仍然是一條**打到正式站**的 ssh ⇒ 一樣要 `--execute` 才准跑。
    name: "smoke",
    mutating: true,
    cmd: plan.ssh ? ssh("bash scripts/host-deploy.sh --verify-only") : null,
    why: `⛔ 一段都不省的: ${plan.keeps.join(" · ") || "(無)"}`,
    manual: "⚠️ 開**全新分頁**讀 console: `[client] content loaded: N champions (cv_…) via bundle`",
  });
  return steps;
}

/** 分級 ＋ 閘 ＋ 步驟，一個物件。 */
export function shipPlan(paths, { tier, protocol = false, tiers = TIERS, ...rest } = {}) {
  const t = tiers.plans[tier] ? tier : tiers.unknownTier;
  return {
    tier: t,
    rebuild: tiers.plans[t].rebuild,
    protocol,
    gates: gatePlan(paths, { tiers }),
    steps: deploySteps(t, { tiers, ...rest }),
    rider: protocol ? tiers.protocolRider : [],
  };
}
