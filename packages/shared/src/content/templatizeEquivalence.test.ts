/**
 * 🧱 **templatize 的等價閘**（GH#993 Scope 4）—— 每一支被 `tools/skill-remake/templatize.py`
 * 從手寫 `effects[]` 換成 `template:{ref,params}` 的技能，**展開出來要與轉換前逐位元相同**。
 *
 * > owner 2026-08-05：「我**最推崇的方案[模板化/模組化]**　不是到處改改改」
 *
 * ── ⭐ 為什麼裁判是這裡，⛔ 不是正規化器 ─────────────────────────────────────
 * 正規化器是 Python，它的比對規則是**提案**；⭐ 真正決定「這一支還是不是同一支技能」的
 * 是**出貨的**那條路：`resolveTemplateExpansion()`（＝ registries 載入時走的那一支）
 * → `mergeExpansion()` → `zAbilityDoc`。⇒ 這裡把每一支重新展開，與帳本裡的「轉換前」比。
 * ⛔ 不是再寫一份展開器（第〇·四守則：那會是第二個住處，而且它會自己漂）。
 *
 * ── ⭐ 比的是 **Zod 解析後**的行為欄位 ─────────────────────────────────────────
 * 兩邊都過同一個 `zAbilityDoc`，所以「schema 預設值」不會被算成差異，
 * ⭐ 而 schema **拒絕**展開結果（例：PASSIVE+active 的文件 `effects:[]` 會被拒）也會紅 ——
 * 那正是 registries 會把它**降級成沒有效果**的那一種文件（失敗形態⑤：被測的要是出貨的那個）。
 *
 * ── 帳本（`tools/skill-remake/templatize-ledger.json`）────────────────────────────
 * 每一筆記 `ref` / `params` / `before`（轉換前的 castType / effects / radius / range /
 * castTimeSec / targetsEnemies / innateKind / passive / marks）。⛔ 它不是第二份技能資料：
 * 改技能請改 `content/`；帳本只回答「當初換掉的那一段是什麼」，⭐ 而這條閘就是拿它當證據。
 * ⚠️ 有意改一支模板技能的行為（例：後台把 duration 從 6 改成 8）⇒ 這條會紅並指名那一支，
 * 正解是**同一個 commit 裡**更新帳本那一筆的 `before`（或把它從帳本刪掉 —— 它從此不再是
 * 「逐位元等價轉換」的一員，而是一支有意設計的模板技能）。
 *
 * ⛔ 一支一測試是浪費（第零守則⑦）：一條 `it` 收齊全部違規再一次報。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { zAbilityDoc } from "./schema/ability";
import { zTemplateDoc, type TemplateDoc } from "./schema/template";
import { resolveTemplateExpansion } from "./templates/resolve";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const LEDGER_PATH = "tools/skill-remake/templatize-ledger.json";

interface LedgerEntry {
  readonly ref: string;
  readonly params: Record<string, unknown>;
  readonly before: Record<string, unknown>;
}
const LEDGER = JSON.parse(readFileSync(join(REPO, LEDGER_PATH), "utf8")) as {
  entries: Record<string, LedgerEntry>;
};

const TEMPLATES = new Map<string, TemplateDoc>(
  readdirSync(join(REPO, "content/ability-templates"))
    .filter((f) => f.startsWith("tpl-") && f.endsWith(".json"))
    .map((f) => {
      const t = zTemplateDoc.parse(JSON.parse(readFileSync(join(REPO, "content/ability-templates", f), "utf8")));
      return [t.id, t] as const;
    }),
);

/**
 * 行為欄位 ＝ `expand.ts` 的 `SHAPE_KEYS`（castType／effects／radius）＋ `COMPOSABLE_KEYS`
 * （castTimeSec／targetsEnemies／innateKind／passive／marks／range）—— #1065 之後可組合鍵在展開沒發時
 * 由文件的值站著，⛔ 不再被刪；這裡兩邊都比，所以「站著」與「被刪」分得出來。
 */
const BEHAVIOUR_KEYS = [
  "castType",
  "effects",
  "radius",
  "range",
  "castTimeSec",
  "targetsEnemies",
  "innateKind",
  "passive",
  "marks",
] as const;

/** 深層鍵排序 —— 比的是**值**，⛔ 不是 JSON 裡的鍵序。 */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, canon(o[k])]));
  }
  return v;
}

/** 行為欄位的正規化字串；頂層 `effects` **忽略順序**（票文：deep-equal，忽略順序）。 */
function behaviour(parsed: Record<string, unknown>): string {
  const out: Record<string, unknown> = {};
  for (const k of BEHAVIOUR_KEYS) if (parsed[k] !== undefined) out[k] = canon(parsed[k]);
  if (Array.isArray(out["effects"])) {
    out["effects"] = (out["effects"] as unknown[]).map((e) => JSON.stringify(e)).sort();
  }
  return JSON.stringify(out);
}

function readAbility(id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(REPO, "content/abilities", `${id}.json`), "utf8")) as Record<string, unknown>;
}

/** ⭐ 判定是純函式 —— sentinel 餵得進去（⛔ 不必為了自證去動出貨文件）。 */
export function templatizeVerdict(id: string, doc: Record<string, unknown>, entry: LedgerEntry): string | null {
  const binding = doc["template"] as { ref?: unknown } | undefined;
  if (binding === undefined || binding === null || binding.ref !== entry.ref) {
    return `${id}: 文件沒有接 ${entry.ref}（帳本說它轉了）—— 帳本與文件其中一邊過期`;
  }
  const res = resolveTemplateExpansion(doc, TEMPLATES);
  if (!res.ok) return `${id}: 展不開（${res.failure.phase}）—— ${res.failure.message}`;
  const merged = zAbilityDoc.safeParse(res.merged);
  if (!merged.success) {
    return `${id}: 展開後 schema 拒絕 —— ${merged.error.issues[0]?.message ?? "invalid"}（registries 會把它降級成沒有效果）`;
  }
  const original: Record<string, unknown> = { ...doc };
  delete original["template"];
  for (const k of BEHAVIOUR_KEYS) delete original[k];
  Object.assign(original, entry.before);
  const parsedBefore = zAbilityDoc.safeParse(original);
  if (!parsedBefore.success) {
    return `${id}: 帳本的「轉換前」本身不合 schema —— ${parsedBefore.error.issues[0]?.message ?? "invalid"}`;
  }
  const after = behaviour(merged.data as unknown as Record<string, unknown>);
  const before = behaviour(parsedBefore.data as unknown as Record<string, unknown>);
  if (after !== before) return `${id}: 展開 ≠ 轉換前\n      展開：${after}\n      轉前：${before}`;
  return null;
}

describe("🧱 templatize 等價閘（GH#993）", () => {
  const entries = Object.entries(LEDGER.entries);

  it("⭐ 量尺自證：帳本裡真的有東西、模板真的讀得到（⛔ 不是在量空氣）", () => {
    expect(entries.length, "⛔ 帳本是空的 —— 正規化器一支都沒轉，這條閘就沒有在守任何東西").toBeGreaterThan(0);
    expect(TEMPLATES.size).toBeGreaterThan(0);
  });

  it("★ ⭐ **每一支被轉的技能：出貨展開 ≡ 轉換前**（一條收齊，⛔ 不是一支一測試）", () => {
    const bad = entries
      .map(([id, entry]) => templatizeVerdict(id, readAbility(id), entry))
      .filter((v): v is string => v !== null);
    expect(
      bad.join("\n"),
      `⛔ ${bad.length}/${entries.length} 支模板技能展開出來不是轉換前那一支。\n` +
        "⭐ 兩條路：①這是無意的（模板家族／params 被改壞）⇒ 修回去；" +
        "②這是有意的設計改動 ⇒ 同一個 commit 更新帳本那一筆的 before（或把它從帳本刪掉）。",
    ).toBe("");
  });

  it("⭐ sentinel：把一支的 params 清空 ⇒ 檢查器抓得到（⛔ 不然上面那條綠得沒有意義）", () => {
    const [id, entry] = entries.find(([, e]) => Object.keys(e.params).length > 0)!;
    const doc = readAbility(id);
    const tampered = { ...doc, template: { ref: entry.ref, params: {} } };
    const v = templatizeVerdict(id, tampered, entry);
    expect(v, "⛔ params 清空了（展開回到模板預設）而檢查器說等價 —— 這把尺是瞎的").not.toBeNull();
    // ⭐ 另一個方向：沒動過的文件要是綠的（上一條已經逐支證明；這裡只釘 sentinel 用的那一支）。
    expect(templatizeVerdict(id, doc, entry)).toBeNull();
  });
});
