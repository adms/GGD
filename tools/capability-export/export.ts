/**
 * 把引擎的能力清單匯出成**外部技能編輯器專案**可以直接讀的兩份檔案。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① 為什麼要有這一支（而不是把 `editorCapabilities.ts` 貼過去）
 *
 * `main_load_editor_plan.md` §2.1.1 的規則是硬的：
 *
 *   「遊戲端沒有對應 capability 時必須回 `unsupported-runtime`，
 *     **不可降級成相似但不同的效果**」
 *
 * 對面**現在**就要知道引擎支援什麼，否則會做出一整批上線就是死的技能。
 * 但對面**沒有這個 repo** —— 它讀不到 TypeScript，也 import 不到
 * `EFFECT_HANDLERS`。所以能力清單必須以**檔案**的形式跨出去。
 *
 * ⚠️ 一份跨專案的清單只要能過期，它就一定會過期，而且過期的方式最貴：
 * 對面照著一份舊清單做了三十支技能，上線才發現 capability 不存在。
 * 所以這支的核心不是 export，是 `--check` —— 它讓「清單過期」變成一條**紅燈**，
 * 而不是一個發現得很晚的事實。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② ⛔ 刻意沒有時間戳
 *
 * 交付物裡不寫「產生於 2026-08-08」。理由是 `--check`：任何隨時鐘變動的欄位都會
 * 讓「重新產生 → 逐位元組比對」永遠不相等，於是 `--check` 只能被放寬成模糊比對，
 * 而一條被放寬的閘等於沒有閘。指紋（`fingerprint`）已經是比日期更有用的身分：
 * 它只在**引擎事實真的變了**的時候變。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③ ⛔ 交付物不得夾帶只有我們看得懂的東西
 *
 * 對方看不懂我們的批次編號、交接文件路徑、部署主機。`assertNoInternalLeaks()`
 * 在寫檔前掃一遍，命中就回非零 —— 這是閘不是判準（CLAUDE.md 的元規則）。
 * 保留的內部字串只有兩類，而且兩類在 Markdown 開頭都有明文說明：
 *   · `§` 章節 → 指的是雙方共有的《main_load_editor_plan.md》
 *   · `#數字` → GGD **遊戲端**的 GitHub issue，與編輯器專案的編號無關
 *   · `packages/...` 檔案路徑 → 只作為**佐證**欄，說明本身不依賴它
 *
 * 用法：
 *   npx tsx tools/capability-export/export.ts            # 產生／更新交付物
 *   npx tsx tools/capability-export/export.ts --check    # 過期就回非零（CI 閘）
 *   npx tsx tools/capability-export/export.ts --out-dir <dir>   # 改輸出位置（測試用）
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCapabilityManifest,
  type RuntimeCapabilityManifest,
} from "../../packages/shared/src/content/editorCapabilities";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");

/** 交付物的預設位置。⛔ 不可以放進 `content/` —— 那裡的東西會被 `content:build` 掃進 bundle。 */
export const DEFAULT_OUT_DIR = join(REPO, "docs/editor-contract");
export const JSON_NAME = "ggd-runtime-capabilities.json";
export const MD_NAME = "ggd-runtime-capabilities.md";

/**
 * ⛔ 不可以出現在交付物裡的內部字串。命中 = 匯出失敗。
 *
 * 這張表是**決策點**（哪些字算內部），所以它是一份可加減的資料而不是散在程式裡的 if。
 */
export const INTERNAL_TOKENS: readonly string[] = [
  "CLAUDE.md",
  "_execution-batches",
  "_session-handover",
  "_requirements-audit",
  "ggd.adms.ai",
  "host-deploy",
  "/private/tmp",
  "scratchpad",
  "批次",
];

export function assertNoInternalLeaks(text: string, label: string): string[] {
  return INTERNAL_TOKENS.filter((t) => text.includes(t)).map(
    (t) => `${label} 夾帶了內部字串「${t}」—— 對方看不懂它，不可以出現在交付物裡`,
  );
}

// ---------------------------------------------------------------------------
// 產生
// ---------------------------------------------------------------------------

/** JSON 交付物。鍵序由 `buildCapabilityManifest()` 固定，內容已排序過，可 hash。 */
export function renderJson(m: RuntimeCapabilityManifest): string {
  return JSON.stringify(m, null, 2) + "\n";
}

/** 表格單格：跳脫會撞爛 Markdown 表格的字元（caveat 裡真的有 `raw|mitigated|hpLost`）。 */
function cell(s: string | undefined): string {
  return (s ?? "—").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

const STATE_LABEL: Record<string, string> = {
  supported: "✅ 支援",
  partial: "⚠️ 部分支援",
  unsupported: "⛔ 不支援",
};

/** 人看的交付物。⭐ 必須自足 —— 對方沒有這個 repo。 */
export function renderMarkdown(m: RuntimeCapabilityManifest): string {
  const L: string[] = [];
  L.push(`# GGD 遊戲端執行期能力清單（\`${m.schema}\`）`);
  L.push("");
  L.push(`**指紋 \`${m.fingerprint}\`** —— 編輯器用它 pin base。指紋只在引擎事實真的改變時才會變。`);
  L.push("");
  L.push("## 這份文件是什麼");
  L.push("");
  L.push(
    "它回答**一個**問題：GGD 遊戲端的執行期引擎現在做得到哪些事。" +
      "每一格都從**出貨的註冊表推導**（effect 處理器表、Zod 的 hook 事件列舉、模板展開器本人），不是手打的清單。",
  );
  L.push("");
  L.push(
    "⛔ **最重要的規則**：遊戲端沒有對應 capability 時會回 `unsupported-runtime`，" +
      "**不會降級成相似但不同的效果**。所以編輯器不可以產出用到「不支援」清單裡任何一項的內容 —— " +
      "產出了也不會上線，只會被拒絕。",
  );
  L.push("");
  L.push("讀法上的三個約定：");
  L.push("");
  L.push("- `§` 開頭的章節編號指的是雙方共有的計畫文件《main_load_editor_plan.md》。");
  L.push("- `#` 加數字是 **GGD 遊戲端的 GitHub issue 編號**，跟編輯器專案自己的編號無關。");
  L.push(
    "- 「佐證」欄是 GGD repo 裡的檔案路徑，只用來讓我們自己被查核；" +
      "**說明欄本身已經自足**，不需要那個 repo 也讀得懂。",
  );
  L.push("");
  L.push("## 1. 計畫點名的 capability 逐筆狀態");
  L.push("");
  L.push("狀態有三種：✅ 現在就做得到 · ⚠️ 主要路徑可用但有明講的限制 · ⛔ 做不到。");
  L.push("");
  L.push("| 能力 | 狀態 | 出處章節 | 說明（限制／為什麼還沒有） | 佐證 |");
  L.push("|---|---|---|---|---|");
  for (const p of m.planned) {
    L.push(
      `| \`${p.key}\` | ${STATE_LABEL[p.state] ?? p.state} | ${cell(p.plan)} | ` +
        `${cell(p.caveat ?? p.reason)} | ${cell(p.evidence)} |`,
    );
  }
  L.push("");
  L.push("## 2. ⛔ 不可使用清單");
  L.push("");
  L.push("編輯器產出的內容只要用到下列任何一項，遊戲端就會回 `unsupported-runtime`：");
  L.push("");
  for (const k of m.unsupported) L.push(`- \`${k}\``);
  L.push("");
  L.push("## 3. 可以編譯到的 effect 種類");
  L.push("");
  L.push("這是引擎執行期**真的有處理器**的全部種類；不在這張表上的名稱一律會被拒絕。");
  L.push("");
  L.push(m.effectKinds.map((k) => `\`${k}\``).join(" · "));
  L.push("");
  L.push("## 4. 可以掛的 hook 事件");
  L.push("");
  L.push(m.hookEvents.map((k) => `\`${k}\``).join(" · "));
  L.push("");
  L.push("## 5. 可展開的技能模板家族");
  L.push("");
  L.push(
    "模板是「參數化的技能骨架」：填參數就展開成一組 effect。" +
      "下列家族已在遊戲端出貨且可展開（清單由展開器本人過濾，所以不會宣稱一個展不開的家族）。",
  );
  L.push("");
  L.push(m.templateFamilies.map((k) => `\`${k}\``).join(" · "));
  L.push("");
  L.push("## 6. 模擬器能力旗標");
  L.push("");
  L.push("| 能力 | 可用 | 限制 |");
  L.push("|---|---|---|");
  for (const k of Object.keys(m.simCapabilities)) {
    const c = m.simCapabilities[k]!;
    L.push(`| \`${k}\` | ${c.available ? "✅" : "⛔"} | ${cell(c.caveat)} |`);
  }
  L.push("");
  L.push("---");
  L.push("");
  L.push(
    "這份檔案由 GGD repo 的匯出工具產生，並由一條 CI 閘（`--check`）保證它跟引擎同步：" +
      "引擎改了而清單沒重新產生，建置就會紅。所以**清單過期**這件事不會靜悄悄地發生。",
  );
  L.push("");
  return L.join("\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export interface RunResult {
  readonly code: number;
  readonly messages: readonly string[];
}

export function run(argv: readonly string[]): RunResult {
  const check = argv.includes("--check");
  const oi = argv.indexOf("--out-dir");
  const outDir = oi >= 0 && argv[oi + 1] ? resolve(argv[oi + 1]!) : DEFAULT_OUT_DIR;

  const m = buildCapabilityManifest();
  const want: Record<string, string> = {
    [join(outDir, JSON_NAME)]: renderJson(m),
    [join(outDir, MD_NAME)]: renderMarkdown(m),
  };

  const leaks = Object.entries(want).flatMap(([p, t]) => assertNoInternalLeaks(t, p));
  if (leaks.length > 0) return { code: 2, messages: leaks };

  if (check) {
    const stale: string[] = [];
    for (const [p, text] of Object.entries(want)) {
      if (!existsSync(p)) stale.push(`缺少交付物：${p}`);
      else if (readFileSync(p, "utf8") !== text) stale.push(`交付物已過期：${p}`);
    }
    if (stale.length > 0) {
      return {
        code: 1,
        messages: [
          ...stale,
          "引擎的能力變了但清單沒重新產生。跑 `pnpm caps:export` 並把產物一起 commit。",
        ],
      };
    }
    return { code: 0, messages: [`能力清單是最新的（指紋 ${m.fingerprint}）`] };
  }

  mkdirSync(outDir, { recursive: true });
  for (const [p, text] of Object.entries(want)) writeFileSync(p, text);
  return {
    code: 0,
    messages: Object.keys(want).map((p) => `已寫入 ${p}`).concat(`指紋 ${m.fingerprint}`),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const r = run(process.argv.slice(2));
  for (const msg of r.messages) (r.code === 0 ? console.log : console.error)(msg);
  process.exit(r.code);
}
