/**
 * 🧱 **產生器綁的模板技能：展開 ≡ 來源列寫的 `effects`**（GH#1146）。
 *
 * ── ⛔ 這條閘為什麼非有不可 ────────────────────────────────────────────────
 * 一支 `skillremake:json` 擁有的技能綁上模板之後，同一件事有**兩個住處**：
 *   ① `tools/skill-remake/heroes/<英雄>.py` 的 `effects=[...]` → 產生器寫進文件的 `effects`
 *   ② 同一列的 `template={'ref','params'}`            → 文件的 `template`
 * ⭐ 而 registries 載入時走的是**②**（`resolveTemplateExpansion` → `mergeExpansion`）
 *   ⇒ ⛔ 兩邊一旦不一致，**玩家玩到的是②，而每一份文件、卡面、測試看到的是①**。
 *
 * ⚠️ ⭐ **既有的等價閘蓋不到它們**：`templatizeEquivalence.test.ts` 的母體是
 * `templatize-ledger.json`，而那本帳只記**正規化器轉過的**（＝直接編 JSON 的那半）。
 * 產生器擁有的那 8 支是**改來源列**綁上去的，⛔ 從來沒有進過那本帳。
 * ⇒ 突變驗證量到過這件事：把展開器的視覺槽關掉，`templatizeEquivalence` **仍然全綠**。
 *
 * ── ⛔⛔ 為什麼比的是 `expansion`，⛔ 不是 `merged` ──────────────────────────
 * `mergeExpansion()` 會**保留**文件自己帶的、展開沒產出的那幾種 kind
 * （`templatedEffectsSurvive.test.ts` 是那條規則的守衛）。
 * ⇒ 拿 `merged` 去對文件，**少一格參數會被 merge 補回來** —— 一把在它最需要說話時
 *   沉默的尺（第二守則：一條綠燈的第四種假來源）。⭐ 所以這裡比 **`expansion` 本人**。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `expand.ts` 的 `modelFx` 視覺槽改成 `...(false ? … : [])` → 🔴 指名 3 支
 *   · `expand.ts` 的 `includeOrigin: true` 拿掉 → 🔴 指名全部 8 支
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { zAbilityDoc } from "./schema/ability";
import { zTemplateDoc, type TemplateDoc } from "./schema/template";
import { resolveTemplateExpansion } from "./templates/resolve";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

const TEMPLATES = new Map<string, TemplateDoc>(
  readdirSync(join(REPO, "content/ability-templates"))
    .filter((f) => f.startsWith("tpl-") && f.endsWith(".json"))
    .map((f) => {
      const t = zTemplateDoc.parse(
        JSON.parse(readFileSync(join(REPO, "content/ability-templates", f), "utf8")),
      );
      return [t.id, t] as const;
    }),
);

/**
 * ⭐ 名單是**量出來的**（`sync-io.json` 的 writes），⛔ 不是手寫 ——
 * 手寫的名單會在下一支技能綁上模板時靜靜地漏掉它（第〇·五守則的閘：豁免要能被反駁）。
 */
function generatorOwnedAbilityIds(): string[] {
  const io = JSON.parse(
    readFileSync(join(REPO, "tools/parallel-gates/sync-io.json"), "utf8"),
  ) as { steps: { name: string; writes: string[] }[] };
  const step = io.steps.find((s) => s.name === "skillremake:json");
  if (!step) return [];
  return step.writes
    .filter((w) => w.startsWith("content/abilities/") && w.endsWith(".json") && !w.includes("*"))
    .map((w) => basename(w, ".json"));
}

interface Row {
  readonly id: string;
  readonly doc: Record<string, unknown>;
}

function boundRows(): Row[] {
  const out: Row[] = [];
  for (const id of generatorOwnedAbilityIds()) {
    const p = join(REPO, "content/abilities", `${id}.json`);
    if (!existsSync(p)) continue;
    const doc = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    if (doc["template"] !== undefined && doc["template"] !== null) out.push({ id, doc });
  }
  return out;
}

/** ⭐ 純函式 ⇒ sentinel 餵得進去（⛔ 不必為了自證去動出貨文件）。 */
export function generatorBoundVerdict(id: string, doc: Record<string, unknown>): string | null {
  const res = resolveTemplateExpansion(doc, TEMPLATES);
  if (!res.ok) return `${id}: 展不開（${res.failure.phase}）—— ${res.failure.message}`;
  // ⭐ 兩邊都過**同一個** `zAbilityDoc` 再比 —— ⛔ 不是裸的 `JSON.stringify`：
  //   Zod 解析會照宣告序重排鍵,而**鍵序不是行為**（`abilityScaling.test.ts` 的 fx-19
  //   踩過同一個坑：鍵序不同被讀成「假的 desync」）。
  const expanded = (res.expansion as unknown as Record<string, unknown>)["effects"] ?? [];
  const lhs = zAbilityDoc.safeParse({ ...doc, template: undefined, effects: expanded });
  const rhs = zAbilityDoc.safeParse({ ...doc, template: undefined });
  if (!lhs.success) {
    return `${id}: 展開的 effects 過不了 schema —— ${lhs.error.issues[0]?.message ?? "invalid"}`;
  }
  if (!rhs.success) {
    return `${id}: 來源列寫的 effects 過不了 schema —— ${rhs.error.issues[0]?.message ?? "invalid"}`;
  }
  const a = JSON.stringify((lhs.data as unknown as Record<string, unknown>)["effects"]);
  const b = JSON.stringify((rhs.data as unknown as Record<string, unknown>)["effects"]);
  if (a !== b) {
    return (
      `${id}: 展開的 effects ≠ 來源列寫的 effects\n` +
      `      展開：${a}\n` +
      `      來源：${b}`
    );
  }
  return null;
}

describe("🧱 產生器綁的模板技能等價閘（GH#1146）", () => {
  const rows = boundRows();

  it("⭐ 量尺自證：真的有產生器擁有且綁了模板的技能（⛔ 不是在量空氣）", () => {
    expect(
      rows.length,
      "⛔ 一支都沒有 —— 要嘛 sync-io.json 的 writes 變了，要嘛這條閘在守空集合",
    ).toBeGreaterThan(0);
    expect(TEMPLATES.size).toBeGreaterThan(0);
  });

  it("★ ⭐ **每一支：展開 ≡ 來源列**（一條收齊，⛔ 不是一支一測試）", () => {
    const bad = rows
      .map((r) => generatorBoundVerdict(r.id, r.doc))
      .filter((v): v is string => v !== null);
    expect(
      bad.join("\n"),
      `⛔ ${bad.length}/${rows.length} 支產生器綁的模板技能，展開出來不是來源列寫的那一支。\n` +
        "⭐ 玩家玩到的是**展開**那一份 ⇒ 修 `tools/skill-remake/heroes/<英雄>.py` 那一列的 " +
        "`template={'params':…}`（或 `effects=[...]`）讓兩邊一致，然後 `bash scripts/genrun.sh skillremake:json`。\n" +
        "⛔ 不要改出貨 JSON —— 下一次 sync 會把它蓋回去。",
    ).toBe("");
  });

  it("⭐ sentinel：把一支的 params 清空 ⇒ 檢查器抓得到（⛔ 不然上面那條綠得沒有意義）", () => {
    const row = rows[0]!;
    const ref = (row.doc["template"] as { ref: string }).ref;
    const v = generatorBoundVerdict(row.id, { ...row.doc, template: { ref, params: {} } });
    expect(v, "⛔ params 清空了（展開回到模板預設）而檢查器說等價 —— 這把尺是瞎的").not.toBeNull();
  });
});
