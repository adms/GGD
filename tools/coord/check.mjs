#!/usr/bin/env node
/**
 * 📦 `pnpm coord:check` —— Main↔Codex packet 協定的 lint（GH#985）。
 *
 * ⭐ 它做的事只有一件：**讓「完整思考」的那一半變成機器擋得住的東西** ——
 * 每一個宣稱帶著一行可重跑的指令與它的離開碼，而接收方（CI）**真的重跑**。
 * ⛔ 其餘（狀態機、通知、去重、回覆）由 GitHub 的 PR 提供，⛔ 這支不重蓋一份。
 *
 * 用法：
 *   node tools/coord/check.mjs                  # 掃 docs/editor-contract/coordination/*.json
 *   node tools/coord/check.mjs --dir <路徑>      # 掃別的目錄（測試的哨兵用）
 *   node tools/coord/check.mjs --run-repro      # ⭐ 只在 CI：逐條**真的執行** repro.command
 *
 * 離開碼：0 ＝ 全過 · 1 ＝ 有缺（**逐檔逐條**列出缺什麼，照 `scripts/ticket-lint.sh` 的形狀）。
 * ⚠️ 讀不到 `origin/main`（淺 clone）時**明說「沒驗到」**再跳過 —— ⛔ 安靜的跳過與全過長得一樣。
 */
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "./schema.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const DIR = resolve(REPO, opt("--dir", S.PACKET_DIR));
const RUN_REPRO = flag("--run-repro");

const warnings = [];
const isStr = (v) => typeof v === "string" && v.trim() !== "";

/** 契約指紋的分母 —— ⭐ 從**檔案**算，⛔ 不抄一個字面值。 */
function contractFingerprint() {
  const p = join(REPO, S.CONTRACT_FILE);
  if (!existsSync(p)) return null;
  return createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, S.FINGERPRINT_LEN);
}

/** `origin/main` 上同名 packet 的內容（＝「這一題已經問過而且併進去了」）。 */
function mergedPacket(key) {
  try {
    const raw = execFileSync("git", ["show", `origin/main:${S.PACKET_DIR}/${key}.json`], {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function hasOriginMain() {
  try {
    execFileSync("git", ["rev-parse", "--verify", "origin/main"], {
      cwd: REPO,
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

/** `unblocks[]` 的 id 母體 ＋ 每一列的 `MISSING_VISUAL_BRICK` 帶哪些 `brickId`。 */
function acceptanceRows() {
  const p = join(REPO, S.ACCEPTANCE_FILE);
  if (!existsSync(p)) return null;
  const rows = JSON.parse(readFileSync(p, "utf8")).rows ?? [];
  const brickIds = new Map();
  let anyMachineIssues = false;
  for (const r of rows) {
    const issues = r.machineIssues ?? [];
    if (issues.length > 0) anyMachineIssues = true;
    const ids = issues
      .filter((i) => (typeof i === "string" ? i : i?.code ?? i?.issue) === S.BRICK_ISSUE_CODE)
      .map((i) => (typeof i === "string" ? null : i?.[S.BRICK_ID_FIELD]))
      .filter(Boolean);
    brickIds.set(r.id, ids);
  }
  return { ids: new Set(rows.map((r) => r.id)), brickIds, anyMachineIssues };
}

/** ⭐ 指令是**逐 token** 執行的（⛔ 不經過 shell），所以白名單才是真的邊界。 */
function commandProblem(cmd) {
  if (!isStr(cmd)) return "repro.command 缺少或不是字串";
  const bad = S.COMMAND_FORBIDDEN.find((c) => cmd.includes(c));
  if (bad) return `repro.command 含 shell 元字元 ${JSON.stringify(bad)}（安全邊界：CI 會真的執行它）`;
  if (!S.COMMAND_PREFIXES.some((p) => cmd.startsWith(p)))
    return `repro.command 前綴不在白名單（${S.COMMAND_PREFIXES.join(" · ")}）：${cmd}`;
  return null;
}

function checkClaims(packet, err) {
  const claims = packet.claims;
  if (!Array.isArray(claims) || claims.length === 0) {
    err("claims[] 必須是**非空**陣列（一個宣稱都沒有的 packet 沒有東西可以重跑）");
    return;
  }
  claims.forEach((c, i) => {
    const at = `claims[${i}]`;
    if (c === null || typeof c !== "object") return err(`${at} 不是物件`);
    for (const f of S.CLAIM_REQUIRED) if (!isStr(c[f])) err(`${at} 缺 ${f}`);
    if (isStr(c.kind) && !S.CLAIM_KINDS.includes(c.kind))
      err(`${at}.kind「${c.kind}」不在 ${S.CLAIM_KINDS.join(" / ")}`);
    const repro = c.repro;
    if (repro === null || typeof repro !== "object") return err(`${at} 缺 repro（⭐ 沒有可重跑的證據就不是宣稱）`);
    for (const f of S.REPRO_REQUIRED) if (repro[f] === undefined) err(`${at}.repro 缺 ${f}`);
    const problem = commandProblem(repro.command);
    if (problem) err(`${at}.${problem}`);
    if (repro.expectedExit !== undefined && !Number.isInteger(repro.expectedExit))
      err(`${at}.repro.expectedExit 不是整數`);
    for (const e of c.evidence ?? [])
      if (!isStr(e) || !existsSync(join(REPO, e))) err(`${at}.evidence 路徑不存在：${e}`);
  });
}

function checkUnblocks(packet, err, accept) {
  const list = packet.unblocks ?? [];
  if (packet.kind !== "brick-request") {
    if (list.length > 0 && !accept) warnings.push(`讀不到 ${S.ACCEPTANCE_FILE} ⇒ unblocks[] **沒驗到**`);
    if (list.length > 0 && accept) for (const id of list) if (!accept.ids.has(id)) err(`unblocks 的 id 不在驗收包裡：${id}`);
    return;
  }
  if (list.length < S.UNBLOCKS_MIN)
    return err(
      `brick-request 的 unblocks[] 少於 ${S.UNBLOCKS_MIN} 筆（現在 ${list.length}）——` +
        ` **1 支 ＝ 專屬積木，不做**（GH#916 的判準）`,
    );
  if (!accept) return warnings.push(`讀不到 ${S.ACCEPTANCE_FILE} ⇒ unblocks[] 的 id **沒驗到**`);
  for (const id of list) {
    if (!accept.ids.has(id)) {
      err(`unblocks 的 id 不在 ${S.ACCEPTANCE_FILE} 裡：${id}`);
      continue;
    }
    // ⚠️ GH#986 落地前：驗收包還沒有 machineIssues ⇒ 這一格只驗 id 存在，
    //    ⭐ 而且**明說沒驗到**（⛔ 安靜的跳過與全過長得一樣）。
    if (!accept.anyMachineIssues) continue;
    const ids = accept.brickIds.get(id) ?? [];
    if (ids.length === 0) err(`unblocks 的 ${id} 那一列沒有 ${S.BRICK_ISSUE_CODE}（⇒ 它沒有被積木擋住）`);
    else if (packet.brickId && !ids.includes(packet.brickId))
      err(`unblocks 的 ${id} 的 ${S.BRICK_ID_FIELD} ${JSON.stringify(ids)} 不含 ${packet.brickId}`);
  }
  if (accept.anyMachineIssues && list.length >= S.UNBLOCKS_MIN) {
    const shared = list.map((id) => accept.brickIds.get(id) ?? []);
    const common = shared.reduce((a, b) => a.filter((x) => b.includes(x)), shared[0] ?? []);
    if (common.length === 0) err(`unblocks 的每一列必須被**同一個** ${S.BRICK_ID_FIELD} 擋住（現在沒有交集）`);
  }
}

function checkPacket(file, fingerprint, accept, originMain) {
  const errs = [];
  const err = (m) => errs.push(m);
  let packet;
  try {
    packet = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    return [`⛔ 讀不進來（不是合法 JSON）：${e.message}`];
  }
  if (packet === null || typeof packet !== "object" || Array.isArray(packet)) return ["⛔ 頂層不是物件"];

  for (const f of S.FORBIDDEN)
    if (f in packet) err(`⛔ 不可以有 \`${f}\` 欄位 —— 狀態住在 PR（第〇·四守則：⛔ 不要第二個住處）`);
  for (const f of S.REQUIRED)
    if (packet[f] === undefined || (typeof packet[f] === "string" && packet[f].trim() === ""))
      err(`缺必填欄位 \`${f}\``);
  if (packet.schema !== undefined && packet.schema !== S.SCHEMA_ID)
    err(`schema 應該是 "${S.SCHEMA_ID}"，現在是 ${JSON.stringify(packet.schema)}`);
  if (packet.kind !== undefined && !S.KINDS.includes(packet.kind))
    err(`kind「${packet.kind}」不在 ${S.KINDS.join(" / ")}`);

  const key = packet.dedupeKey;
  if (isStr(key)) {
    if (!S.DEDUPE_KEY_RE.test(key)) err(`dedupeKey 格式不合（小寫 kebab ＋ \`.\`，⛔ 不可以有 \`/\`）：${key}`);
    if (basename(file) !== `${key}.json`) err(`檔名要等於 \`${key}.json\`，現在是 ${basename(file)}`);
    if (isStr(packet.kind) && !key.startsWith(`${packet.kind}.`))
      err(`dedupeKey 要以 \`${packet.kind}.\` 開頭（AGENTS.md §3：\`<kind>.<主題-kebab>\`）`);
    const merged = originMain ? mergedPacket(key) : null;
    // ⛔⛔ **第一版是一個永遠不會綠的閘**（CLAUDE.md 失敗形態⑨）：packet 併進 main 之後
    //   檔案**本來就會留在樹上**，而它把「檔案還在」讀成「同一題重問」
    //   ⇒ 每一次 CI 都紅，而訊息叫人去改一個沒有錯的東西。
    // ⭐ 判準是**兩份的關係**，⛔ 不是「有沒有一份併進去了」：
    //   內容一模一樣 ⇒ 這就是那一份（歷史），放行；
    //   內容變了而 key 與指紋都沒變 ⇒ **那才是重問**，紅。
    const sameAsMerged = merged !== null && JSON.stringify(merged) === JSON.stringify(packet);
    if (merged && !sameAsMerged && merged.contractFingerprint === packet.contractFingerprint)
      err(
        `⛔ 同一題重問：\`${key}\` 已經併進 origin/main，而 contractFingerprint 沒變` +
          `（${packet.contractFingerprint}）⇒ 契約沒動就不要重開舊題。` +
          `⭐ 真的要接續就換一個 dedupeKey，或先把契約改掉讓指紋跟著動`,
      );
  }

  if (fingerprint && isStr(packet.contractFingerprint) && packet.contractFingerprint !== fingerprint)
    err(`contractFingerprint 對不上（packet ${packet.contractFingerprint} ≠ 現在 ${fingerprint}）⇒ 契約已變，重算它`);

  if (isStr(packet.baseCommit)) {
    if (!originMain) warnings.push("讀不到 origin/main ⇒ baseCommit 的祖先關係**沒驗到**（CI 要 fetch-depth: 0）");
    else {
      const r = spawnSync("git", ["merge-base", "--is-ancestor", packet.baseCommit, "origin/main"], { cwd: REPO });
      if (r.status !== 0) err(`baseCommit ${packet.baseCommit} 不是 origin/main 的祖先`);
    }
  }

  checkClaims(packet, err);
  checkUnblocks(packet, err, accept);

  for (const [i, q] of (packet.ownerQuotes ?? []).entries()) {
    for (const f of S.OWNER_QUOTE_REQUIRED) if (!isStr(q?.[f])) err(`ownerQuotes[${i}] 缺 ${f}`);
    if (isStr(q?.date) && !S.DATE_RE.test(q.date)) err(`ownerQuotes[${i}].date 不是 YYYY-MM-DD：${q.date}`);
  }
  for (const e of packet.evidence ?? [])
    if (!isStr(e) || !existsSync(join(REPO, e))) err(`evidence 路徑不存在：${e}`);

  if (RUN_REPRO && errs.length === 0) errs.push(...runRepro(packet));
  return errs;
}

/** ⭐ 接收方**獨立重建證據** —— ⛔ 不是「相信摘要」。 */
function runRepro(packet) {
  const errs = [];
  for (const [i, c] of (packet.claims ?? []).entries()) {
    const cmd = c?.repro?.command;
    if (commandProblem(cmd)) continue; // 上面已經紅過了
    const parts = cmd.split(/\s+/);
    const r = spawnSync(parts[0], parts.slice(1), {
      cwd: REPO,
      encoding: "utf8",
      timeout: S.REPRO_TIMEOUT_SEC * 1000,
      env: { ...process.env, CI: "1" },
    });
    const got = r.status === null ? `signal ${r.signal ?? "timeout"}` : r.status;
    if (got !== c.repro.expectedExit) {
      const log = `${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").slice(-20).join("\n");
      errs.push(`claims[${i}].repro 重跑對不上：expectedExit ${c.repro.expectedExit}，實得 ${got}\n--- log 尾 20 行 ---\n${log}`);
    }
  }
  return errs;
}

function main() {
  const files = existsSync(DIR)
    ? readdirSync(DIR)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => join(DIR, f))
    : [];
  const fingerprint = contractFingerprint();
  if (!fingerprint) warnings.push(`讀不到 ${S.CONTRACT_FILE} ⇒ contractFingerprint **沒驗到**`);
  const accept = acceptanceRows();
  const originMain = hasOriginMain();

  let bad = 0;
  for (const f of files) {
    const errs = checkPacket(f, fingerprint, accept, originMain);
    const rel = f.startsWith(`${REPO}/`) ? f.slice(REPO.length + 1) : f;
    if (errs.length === 0) console.log(`✅ ${rel}`);
    else {
      bad++;
      console.log(`⛔ ${rel}`);
      for (const e of errs) console.log(`   · ${e}`);
    }
  }
  for (const w of [...new Set(warnings)]) console.log(`⚠️  ${w}`);
  console.log(`\ncoord:check —— ${files.length} 份 packet，${bad} 份有缺${RUN_REPRO ? "（含 --run-repro）" : ""}`);
  process.exit(bad === 0 ? 0 : 1);
}

main();
