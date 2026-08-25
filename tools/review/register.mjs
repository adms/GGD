#!/usr/bin/env node
/**
 * `pnpm review:register` —— 把一批**已經上線**的成果登記進 GH#669 的功能級帳本。
 *
 * ⭐ 這支指令的重點不是寫檔，是**擋下寫不出 rollback 開關的那一批**：
 *    owner 常設指令「沒做完以前自己判斷，**但留後台開關可以簡易 rollback**」——
 *    ⛔ 沒有開關的自作主張只是自作主張。所以 --rollback-config / --rollback-field
 *    是必填，而且那一格要**真的解析得到**（出貨文件存在 · 欄位路徑存在）。
 *
 * 用法：
 *   node tools/review/register.mjs \
 *     --id beam_visual-proof_20260824-2240 \
 *     --title "光束砲：原地開火（path:static）" --family beam-roll --issues 673,649 \
 *     --commit 6e4ae847 --abilities godie-ogrh.r,godie-u048.r \
 *     --rollback-config tpl-beam-roll --rollback-field params.path.default \
 *     --live static --rollback-to forward \
 *     --rollback-note "四支經典一起回到舊演出，⛔ 不必動任何一支技能的 JSON"
 *
 * ⚠️ --live / --rollback-to 收的是 **JSON 字面值**（`false` / `1` / `"forward"`），
 *    解析不了就當成字串 —— 這樣 `--rollback-to forward` 也能用。
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { registerBatch, buildFeatureQueue } from "./features.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
  console.log(readUsage());
  process.exit(0);
}

const args = new Map();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("--")) continue;
  const eq = a.indexOf("=");
  if (eq > 0) args.set(a.slice(2, eq), a.slice(eq + 1));
  else args.set(a.slice(2), argv[++i] ?? "");
}

const lit = (s) => {
  if (s === undefined) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};
const list = (s) =>
  s === undefined || s === "" ? undefined : s.split(",").map((x) => x.trim()).filter((x) => x !== "");

const rollback = {
  configId: args.get("rollback-config"),
  field: args.get("rollback-field"),
};
if (args.has("live")) rollback.liveValue = lit(args.get("live"));
if (args.has("rollback-to")) rollback.rollbackValue = lit(args.get("rollback-to"));
if (args.has("rollback-note")) rollback.note = args.get("rollback-note");

try {
  const entry = registerBatch(repoRoot, {
    id: args.get("id"),
    title: args.get("title"),
    family: args.get("family"),
    issues: list(args.get("issues"))?.map((n) => (/^\d+$/.test(n) ? Number(n) : n)),
    abilities: list(args.get("abilities")),
    commit: args.get("commit"),
    rollback,
  });
  const q = buildFeatureQueue(repoRoot);
  console.log(
    `[review:register] 已登記「${entry.title}」\n` +
      `  rollback：${entry.rollback.configId} → ${entry.rollback.field} = ` +
      `${JSON.stringify(entry.rollback.liveValue)} ⇒ ${JSON.stringify(entry.rollback.rollbackValue)}\n` +
      `  帳本現況：共 ${q.counts.total} 批（pending ${q.counts.pending} · 已確認 ${q.counts.confirmed} · ` +
      `已否決 ${q.counts.vetoed} · 未登記 ${q.counts.unregistered}）`,
  );
} catch (err) {
  console.error(`[review:register] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

function readUsage() {
  return `review:register —— 把一批已上線的成果登記進 docs/_review/feature-verdicts.json（GH#669）

  必填：--id <證據目錄名> --rollback-config <config id> --rollback-field <欄位路徑> --rollback-to <還原值>
  選填：--title --family --issues 673,649 --commit <sha> --abilities a,b --live <現值> --rollback-note

  ⭐ 寫不出 rollback 開關（或那一格解析不到）⇒ **拒絕登記**，exit 1。
     審查頁：pnpm dev 起 client 後 http://localhost:5173/feature-review.html`;
}
