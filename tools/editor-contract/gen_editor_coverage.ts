/**
 * ⭐⭐ **編輯器必須實作什麼** —— 從出貨註冊表推導的**機器可讀清單**。
 *
 * ── 為什麼要這一份（⛔ 而不是一份手寫的追平清單）──────────────────────────
 * owner 2026-08-30：「讓**分工明確有效率又安全**」。
 *
 * ⚠️ ⭐ 而 2026-08-30 量到的問題是：外部編輯器（`feat/ability-review-authoring`）
 * 落後 main **1,186 個 commit**，涵蓋率差 **+149 項**
 * （effectKinds +9 · effectFields +70 · hookEvents +14 · abilityFields +38 · auraFields +8）。
 *
 * ⛔ **一份手寫的追平清單會立刻過期** —— 它是同一份知識的第二個住處（第〇·四守則）。
 * ⇒ ⭐ 這一份**從契約推導**，而契約自己從出貨註冊表推導。
 *   ⇒ 引擎長出一個新機制 ⇒ 這一份自動變長 ⇒ 編輯器那邊的閘自動變紅。
 *
 * ── ⛔ 這一份**不驗**什麼（誠實的界線）──────────────────────────────────
 * ⚠️ ⭐ `apps/editor` **不在 main 上**（它在一條分支上）
 * ⇒ 一條寫在 main 的測試**讀不到它** ⇒ 那會是一條永遠不會紅的閘（失敗形態⑨）。
 *
 * ⇒ ⭐ 所以分工是：
 *   · **這一邊**（main）：產出「必須實作什麼」，並保證它與契約同步（`--check`）
 *   · **那一邊**（編輯器 repo/分支）：讀這一份，驗「我實作了幾項」，⛔ 少一項就紅
 *
 * ⭐ 而「那一邊的閘」必須**兩個方向都驗**：
 *   · 清單有而編輯器沒有 ⇒ 🔴（玩家碰不到那個機制）
 *   · 編輯器有而清單沒有 ⇒ 🔴（⭐ **玩家做出來的東西上線就是死的**）
 *
 *   pnpm editorcov:build      # 重生成
 *   pnpm editorcov:check      # 唯讀對帳
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCapabilityManifest, PLANNED_CAPABILITIES } from "../../packages/shared/src/content/editorCapabilities";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(REPO, "docs/editor-contract/ggd-editor-coverage.json");

/** ⭐ 這一份的形狀：每一個**編輯器必須讓作者填得到**的東西。 */
interface CoverageItem {
  /** `effectKind` / `effectField` / `hookEvent` / `abilityField` / `auraField` / `templateFamily` / `conditionLeaf` */
  group: string;
  name: string;
  /** ⭐ 屬於哪一個 effect kind（欄位才有）—— 編輯器要知道這一格畫在哪一個節點上 */
  owner?: string;
}

export function buildEditorCoverage(): {
  schema: string;
  fingerprint: string;
  required: CoverageItem[];
  /** ⭐ 宣告 unsupported 的，編輯器**刻意不必**實作 —— 帶理由，⛔ 不是靜默省略 */
  notRequired: { name: string; why: string }[];
  counts: Record<string, number>;
} {
  const m = buildCapabilityManifest() as unknown as Record<string, unknown>;
  const required: CoverageItem[] = [];

  const push = (group: string, list: unknown, ownerOf?: (x: Record<string, unknown>) => string | undefined): void => {
    for (const raw of (list as unknown[]) ?? []) {
      const x = (typeof raw === "string" ? { name: raw } : raw) as Record<string, unknown>;
      const name = String(x["name"] ?? x["kind"] ?? x["field"] ?? x["key"] ?? x["id"] ?? "");
      if (name === "") continue;
      const own = ownerOf?.(x);
      required.push(own === undefined ? { group, name } : { group, name, owner: own });
    }
  };

  push("effectKind", m["effectKinds"]);
  push("effectField", m["effectFields"], (x) => {
    const o = x["kind"] ?? x["on"] ?? x["owner"];
    return typeof o === "string" ? o : undefined;
  });
  push("hookEvent", m["hookEvents"]);
  push("hookField", m["hookFields"]);
  push("abilityField", m["abilityFields"]);
  push("auraField", m["auraFields"]);
  push("templateFamily", m["templateFamilies"]);
  push("conditionLeaf", m["conditionLeafKinds"]);
  push("conditionLeafField", m["conditionLeafFields"]);

  // ⭐ 宣告 unsupported 的**不必**實作 —— 而理由要寫得出來（⛔ 不是靜默省略）
  const notRequired: { name: string; why: string }[] = [];
  for (const e of PLANNED_CAPABILITIES) {
    if (e.expected !== "unsupported") continue;
    notRequired.push({
      name: e.key,
      why: (e as unknown as { reason?: string }).reason ?? "契約宣告 unsupported（⛔ 引擎今天做不到）",
    });
  }

  const counts: Record<string, number> = {};
  for (const r of required) counts[r.group] = (counts[r.group] ?? 0) + 1;
  counts["_total"] = required.length;
  counts["_notRequired"] = notRequired.length;

  return {
    schema: "ggd-editor-coverage@1",
    fingerprint: String(m["fingerprint"] ?? ""),
    required: required.sort((a, b) => (a.group + a.name).localeCompare(b.group + b.name)),
    notRequired: notRequired.sort((a, b) => a.name.localeCompare(b.name)),
    counts,
  };
}

const rendered = JSON.stringify(buildEditorCoverage(), null, 2) + "\n";

if (process.argv.includes("--check")) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (cur !== rendered) {
    process.stderr.write(
      "⛔ docs/editor-contract/ggd-editor-coverage.json 過期了。\n" +
        "   ⭐ 跑：pnpm editorcov:build && git add docs/editor-contract/\n" +
        "   ⚠️ ⛔ 不要手改那份 JSON —— 它從出貨註冊表推導（第〇·四守則）。\n",
    );
    process.exit(1);
  }
  process.stdout.write("✓ ggd-editor-coverage.json 是新鮮的\n");
} else {
  writeFileSync(OUT, rendered);
  const c = buildEditorCoverage().counts;
  process.stdout.write(`✓ ${OUT}\n  ${JSON.stringify(c)}\n`);
}
