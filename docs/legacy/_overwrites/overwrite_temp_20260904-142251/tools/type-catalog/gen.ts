#!/usr/bin/env tsx
/**
 * ⭐⭐ 【type 目錄】給 Codex 編輯器的**可挑清單** —— 從出貨的模板**推導**（GH#916）。
 *
 * owner 2026-09-04（逐字）：
 * > 「如果同類特效 你可以用 **type1, type2 ....** 的方式擴充 讓設計者有更多選擇而不是只能靠自己微調」
 * > 「你應該有**非常多 type** 不只 1, 2 尤其常見共用例如**光束砲系列**，
 * >   並且應該建**文件、script 跟 codex編輯器契約**來實現」
 * > 「**整個矩陣是用來微調的**，你的任務是將我們**調好的常用幾種作為 type 積木**
 * >   讓編輯器選用後，可以再用矩陣微調節省時間」
 *
 * ── ⛔ 為什麼是產生器而不是一份手寫清單 ────────────────────────────────
 * CLAUDE.md 第〇·四守則：一份手寫的表**沒有寫入端** ⇒ 它一定會過期，
 * ⭐ 而且**不會有東西紅**。⇒ 這一支從 `content/ability-templates/` 與
 * `content/vfx/` 逐份讀，⛔ 沒有一個名字是手打的。
 *
 * ── ⭐ 它回答 Codex 的三個問題 ─────────────────────────────────────────
 * ① 「我今天可以挑哪些 type？」        → `types[]`（只列 `status: enabled` 且有參數的）
 * ② 「挑完之後可以微調哪幾格？」        → 每個 type 的 `params`（含 default 與來源）
 * ③ 「矩陣有哪些格子今天真的存在？」    → `matrix`（`fx.prim.<元素>.<形狀>` 的實測覆蓋）
 *
 * ⚠️ ⭐ **刻意沒有產生日期**（同 `caps:export` / `anchors:build`）：任何隨時鐘變動的
 * 欄位都會讓逐位元組比對永遠不相等，於是 `--check` 只能被放寬 ——
 * 而一條被放寬的閘等於沒有閘（GH#389 · #426）。
 *
 * 用法：
 *   pnpm tsx tools/type-catalog/gen.ts            # 產生
 *   pnpm tsx tools/type-catalog/gen.ts --check    # 逐位元組比對，過期就回非零
 */
// ggd:writes docs/editor-contract/ggd-type-catalog.json
// ggd:writes docs/editor-contract/ggd-type-catalog.md
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TPL_DIR = join(REPO, "content/ability-templates");
const VFX_DIR = join(REPO, "content/vfx");
const OUT_JSON = join(REPO, "docs/editor-contract/ggd-type-catalog.json");
const OUT_MD = join(REPO, "docs/editor-contract/ggd-type-catalog.md");
const CHECK = process.argv.includes("--check");

interface Slot {
  default?: unknown;
  type?: string;
  values?: unknown[];
}
interface Tpl {
  id: string;
  name?: string;
  description?: string;
  family?: string;
  status?: string;
  gapScore?: number;
  params?: Record<string, Slot>;
  requires?: string[];
  exemplar?: { skill?: string; jass?: string };
}

const jsonFiles = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "_index.json") : [];

const templates: Tpl[] = jsonFiles(TPL_DIR)
  .map((f) => JSON.parse(readFileSync(join(TPL_DIR, f), "utf8")) as Tpl)
  .sort((a, b) => (a.id < b.id ? -1 : 1));

/** ⭐ 誰在用這個 type —— 從出貨技能推導，⛔ 不手數。 */
const abilityBlob = jsonFiles(join(REPO, "content/abilities"))
  .map((f) => readFileSync(join(REPO, "content/abilities", f), "utf8"))
  .join("\n");

/** ⭐ 矩陣的實測覆蓋：`fx.prim.<元素>.<形狀>`（剝掉分片後綴）。 */
function matrix(): { elements: string[]; shapes: string[]; present: string[] } {
  const fams = new Set<string>();
  for (const f of jsonFiles(VFX_DIR)) {
    const id = f.slice(0, -5).replace(/[.\-](p\d\d?|r\d|s\d+)$/, "");
    const m = /^fx\.prim\.([a-z]+)\.(.+)$/.exec(id);
    if (m) fams.add(`${m[1]}.${m[2]}`);
  }
  const els = new Set<string>();
  const shs = new Set<string>();
  for (const k of fams) {
    const i = k.indexOf(".");
    els.add(k.slice(0, i));
    shs.add(k.slice(i + 1));
  }
  return {
    elements: [...els].sort(),
    shapes: [...shs].sort(),
    present: [...fams].sort(),
  };
}

const mx = matrix();
const pickable = templates.filter((t) => t.status === "enabled" && Object.keys(t.params ?? {}).length > 0);
const shells = templates.filter((t) => Object.keys(t.params ?? {}).length === 0);

const catalog = {
  schema: "ggd-type-catalog@1",
  note:
    "⭐ 給編輯器的**可挑 type 清單**，從 content/ability-templates/ 推導。" +
    "⛔ 不要手改這份檔 —— 它是 `typecat:build` 的產物；改模板再重生成。" +
    "⭐ 兩層：挑一個 type（填空白格）→ 再用 params／矩陣微調（節點自己寫的值永遠贏）。",
  counts: {
    templates: templates.length,
    pickable: pickable.length,
    shells: shells.length,
    matrixPresent: mx.present.length,
    matrixTheoretical: mx.elements.length * mx.shapes.length,
  },
  /** ⭐ 今天可以挑的。 */
  types: pickable.map((t) => ({
    id: t.id,
    name: t.name,
    family: t.family,
    description: t.description,
    gapScore: t.gapScore,
    requires: t.requires ?? [],
    exemplar: t.exemplar ?? null,
    usedByAbilities: (abilityBlob.match(new RegExp(`"${t.id}"`, "g")) ?? []).length,
    params: Object.fromEntries(
      Object.entries(t.params ?? {}).map(([k, s]) => [
        k,
        { type: s.type ?? null, default: s.default ?? null, ...(s.values ? { values: s.values } : {}) },
      ]),
    ),
  })),
  /** ⛔ 佔著名字而不能挑的 —— ⭐ 這一批是「做完沒收斂」最值得補的目標。 */
  shells: shells.map((t) => ({ id: t.id, family: t.family, status: t.status, gapScore: t.gapScore })),
  /** ⭐ 微調層：矩陣今天真的有哪些格子。 */
  matrix: mx,
};

function md(): string {
  const L: string[] = [];
  L.push("# GGD type 目錄（給編輯器挑的積木）");
  L.push("");
  L.push("> ⛔ **這份是產生的** —— `pnpm typecat:build`。改它請改 `content/ability-templates/`。");
  L.push("> ⭐ 交付格式與止損協定見 `CODEX_TYPE_HANDOFF.md`。");
  L.push("");
  L.push(
    `**${catalog.counts.pickable} 個可挑 type** · ⛔ ${catalog.counts.shells} 個空殼 · ` +
      `矩陣 ${catalog.counts.matrixPresent}/${catalog.counts.matrixTheoretical} 格`,
  );
  L.push("");
  L.push("## ⭐ 可挑的 type");
  L.push("");
  L.push("| id | 參數 | 已用 | gap | exemplar（這個 type 從哪來） |");
  L.push("|---|---:|---:|---:|---|");
  for (const t of catalog.types) {
    const ex = t.exemplar?.skill ?? "⛔ 未填";
    L.push(
      `| \`${t.id}\` | ${Object.keys(t.params).length} | ${t.usedByAbilities} | ${t.gapScore ?? "?"} | ${ex} |`,
    );
  }
  L.push("");
  L.push("## ⛔ 空殼（佔著名字，今天挑不了）");
  L.push("");
  L.push(catalog.shells.map((s) => `\`${s.id}\``).join(" · "));
  L.push("");
  L.push("⭐ **這一批是「特效做完沒收斂成積木」最值得補的目標** —— 名字都佔好了。");
  L.push("");
  L.push("## ⭐ 微調層：矩陣");
  L.push("");
  L.push(`元素（${mx.elements.length}）：${mx.elements.map((e) => `\`${e}\``).join(" ")}`);
  L.push("");
  L.push(`形狀（${mx.shapes.length}）：${mx.shapes.map((s) => `\`${s}\``).join(" ")}`);
  L.push("");
  L.push(
    `⚠️ **${mx.present.length} / ${mx.elements.length * mx.shapes.length} 個組合今天存在** —— ` +
      "⛔ 不是每一格都有。挑之前先確認 `content/vfx/fx.prim.<元素>.<形狀>.json` 真的在。",
  );
  L.push("");
  return L.join("\n");
}

const nextJson = `${JSON.stringify(catalog, null, 2)}\n`;
const nextMd = md();

if (CHECK) {
  const stale: string[] = [];
  if (!existsSync(OUT_JSON) || readFileSync(OUT_JSON, "utf8") !== nextJson) stale.push(OUT_JSON);
  if (!existsSync(OUT_MD) || readFileSync(OUT_MD, "utf8") !== nextMd) stale.push(OUT_MD);
  if (stale.length > 0) {
    console.error(`⛔ 過期了：\n${stale.map((s) => `   ${s}`).join("\n")}`);
    console.error("   ⭐ 跑：pnpm typecat:build && git add docs/editor-contract/");
    console.error("   ⚠️ ⛔ 不要手改那兩份 —— 它們從出貨模板推導（第〇·四守則）。");
    process.exit(1);
  }
  console.log(`✓ type 目錄是新的（${catalog.counts.pickable} 個可挑 · ${catalog.counts.shells} 個空殼）`);
} else {
  writeFileSync(OUT_JSON, nextJson, "utf8");
  writeFileSync(OUT_MD, nextMd, "utf8");
  console.log(
    `✓ ${catalog.counts.pickable} 個可挑 type · ⛔ ${catalog.counts.shells} 個空殼 · ` +
      `矩陣 ${catalog.counts.matrixPresent}/${catalog.counts.matrixTheoretical}`,
  );
}
