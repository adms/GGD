/**
 * ⭐ **出貨展開器的一個 stdout 出口** —— 給 `gen.py`（Python）讀。
 *
 * ```bash
 * tsx tools/w3a-translate/expand_abilities.ts        # → stdout 一份 JSON
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 為什麼這一支存在（GH#1104）
 * ═══════════════════════════════════════════════════════════════════════════
 * `tools/w3a-translate/gen.py` 掃**原始**技能文件找 `radius` / `radiusTier`
 * （`_walk_numbers(doc,"radius",acc)` ＋ `_has_key(doc,"radiusTier")`）。
 * ⛔ 它不展開模板 ⇒ 技能一接上模板，那幾格就搬進 `template.params`。
 *
 * ⭐ 而症狀**不是「數字消失」**（那會被儀器閘抓到），是**數字變成另一個數字**：
 * `godie-hvsh.passive`（48-00 石化之眼）的 `ggdValue` 從 **4.5** 變成 **245.45**
 * —— 兩個都是同一個半徑，4.5 是 GGD 場地單位，245.45 是 `unit:"wc3u"` 的模板參數
 * （`tpl-apply-status.params.radius`）。⇒ 落差表拿一個 **wc3 單位的數字**去跟
 * w3a 的 `area` 比，於是「一致」與「不一致」都是假的。
 *
 * ⇒ ⭐ **這一支不重寫展開邏輯，它把出貨那一支 `resolveTemplateExpansion` 的結果
 * 倒出來。** ⛔ 在 Python 裡重寫一次 `mergeExpansion` 是第〇·四守則的第二個住處，
 * 而它一定會與出貨展開器漂開（單位換算 `toLen()`、`COMPOSABLE_KEYS` 的保留規則、
 * `expandStackOrThrow` 的多卡堆疊 —— 三樣都在動）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ 它**不是產物**
 * ═══════════════════════════════════════════════════════════════════════════
 * 它只寫 stdout，⛔ 不落地任何檔案 ⇒ 不進 `sync-io.json`、不需要 `--check`、
 * 不進隔離區。一份落地的「展開後快照」會變成**第二個住處**（要有人記得重生成，
 * 而它過期時 `gen.py` 讀到的是一個舊世界）——⭐ 直接呼叫比較便宜也比較誠實。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ `template` 一定要拿掉
 * ═══════════════════════════════════════════════════════════════════════════
 * `mergeExpansion` **保留** `template`（#1065 的可組合鍵）⇒ 不拿掉的話同一個量
 * 會被數兩次：一次在展開後的 `radius`（GGD 格），一次在 `template.params.radius`
 * （wc3u）——⭐ 而 `gen.py` 取 `max()`，所以 wc3u 那一份永遠贏。
 * （同一條註解逐字出現在 `tierFlatExclusive.test.ts::expandOne`。）
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTemplateExpansion } from "../../packages/shared/src/content/templates/resolve";
import { zTemplateDoc, type TemplateDoc } from "../../packages/shared/src/content/schema/template";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONTENT = join(ROOT, "content");

const templates = new Map<string, TemplateDoc>(
  readdirSync(join(CONTENT, "ability-templates"))
    .filter((f) => f.startsWith("tpl-") && f.endsWith(".json"))
    .map((f) => {
      const t = zTemplateDoc.parse(
        JSON.parse(readFileSync(join(CONTENT, "ability-templates", f), "utf8")),
      );
      return [t.id, t] as const;
    }),
);

const docs: Record<string, unknown> = {};
const expandedIds: string[] = [];
const failures: { id: string; phase: string; message: string }[] = [];

for (const f of readdirSync(join(CONTENT, "abilities")).sort()) {
  if (!f.endsWith(".json") || f.startsWith("_")) continue;
  const raw = JSON.parse(readFileSync(join(CONTENT, "abilities", f), "utf8")) as Record<
    string,
    unknown
  >;
  const id = String(raw["id"]);
  if (raw["template"] === undefined || raw["template"] === null) {
    // ⭐ 反方向：沒有接模板的文件**一個位元組都不動** —— 這一支對它們是 identity。
    docs[id] = raw;
    continue;
  }
  const res = resolveTemplateExpansion(raw, templates);
  if (!res.ok) {
    // ⛔ 不靜默降級：一支展開不了的技能在 `registerAll()` 也是壞的,
    //    而落差表拿它的 `template.params` 去比會得到一個**看起來合理的假數字**。
    failures.push({ id, phase: res.failure.phase, message: res.failure.message });
    docs[id] = raw;
    continue;
  }
  const { template: _drop, ...merged } = res.merged as Record<string, unknown>;
  docs[id] = merged;
  expandedIds.push(id);
}

process.stdout.write(
  JSON.stringify({
    schema: "ggd-w3a-expanded-abilities@1",
    generatedBy: "tools/w3a-translate/expand_abilities.ts",
    templates: templates.size,
    total: Object.keys(docs).length,
    expandedIds,
    failures,
    docs,
  }),
);
