/**
 * 🔌 #669 的第二半：登記的 rollback 開關**必須真的蓋得到它登記的那批技能**。
 *
 * owner 常設指令：「沒做完以前別問我了自己判斷 **但是留後台開關可以簡易 rollback**」
 * ⇒ 一個**翻了沒反應**的開關比沒有開關更糟：它讓「可以回頭」這件事變成謊話，
 *   而 owner 是在**已經上線之後**才會去翻它（#669 是「先上線、後台一鍵否決」）。
 *
 * ## 這條閘為什麼必須存在（2026-08-26 量到的）
 * `register.mjs` 已經驗了「那一格**存不存在**」——⛔ 那是**名詞**。
 * 而缺陷住在**關係**：`modelFxPreset.ts::fillOne()` 是 `if (out[k] === undefined)`
 * ⇒ **節點自己寫的永遠贏**。當天登記的 `tpl-beam-roll → params.modelKey.default`
 * 對它登記的七支技能**一格都蓋不到**（11 個節點逐支自寫 `modelKey`），
 * 而 `register.mjs`、`check.mjs`、所有既有測試**全部是綠的**。
 *
 * ⚠️ 這是同一個病的第三次（配對式後置條件 · visiblePrimitives · 本條）：
 * **閘驗名詞會在關係破掉時保持綠色。**
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
// ⭐ 2026-08-27 —— 讀**材料**那一側（owner 逐字：「批核材料跟批核結果分署不同資料夾」）。
// ⛔ 在此之前這裡讀 `docs/_review/feature-verdicts.json` —— 那是**分署之前**的合併檔，
//    今天只剩 21 批而材料側有 25 批 ⇒ ⭐ **這條閘量的是一份已經不是真相的檔**：
//    我照它的訊息去修材料側，它照樣紅，而訊息一個字都沒變（⛔ 一個看起來已經量過的東西，
//    量的不是你以為的那個）。
// ⚠️ 路徑是從 `tools/review/stores.mjs` 的 `MATERIAL_REL` 抄過來的常數 ——
//    ⭐ 它與寫入端同一個住處的宣告，⛔ 不是我自己編的一條路徑。
const VERDICTS = join(REPO, "docs/_review/material/batches.json");

type Rollback = { configId?: string; field?: string; note?: string };
type Batch = { rollback?: Rollback; abilities?: string[]; title?: string };

/** `params.count.default` → `count`（模板參數槽名）。⛔ 只認這一種形狀，其餘跳過。 */
function templateSlot(field: string | undefined): string | null {
  const m = /^params\.([A-Za-z0-9_]+)\.default$/.exec(field ?? "");
  return m ? m[1]! : null;
}

function abilityDoc(id: string): Record<string, unknown> | null {
  const p = join(REPO, "content/abilities", `${id}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
}

/** 這份技能文件裡，有幾個引用 `preset` 的 spawnModelFx 節點**自己寫了** `slot`。 */
function shadowingNodes(doc: Record<string, unknown>, preset: string, slot: string): number {
  let n = 0;
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const v of node) walk(v);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    if (rec["kind"] === "spawnModelFx" && rec["preset"] === preset && rec[slot] !== undefined) n += 1;
    for (const v of Object.values(rec)) walk(v);
  };
  walk(doc);
  return n;
}

function batches(): Record<string, Batch> {
  const d = JSON.parse(readFileSync(VERDICTS, "utf8")) as { batches?: Record<string, Batch> };
  return d.batches ?? {};
}

describe("#669 rollback 開關的可達性 (rollback-switch-reaches)", () => {
  it("⭐ 登記的模板開關，不可以被它登記的技能逐支覆寫遮蔽", () => {
    const bad: string[] = [];
    for (const [id, b] of Object.entries(batches())) {
      const slot = templateSlot(b.rollback?.field);
      const preset = b.rollback?.configId;
      if (!slot || !preset || !preset.startsWith("tpl-")) continue; // 非模板型開關（config 文件）不在本條管轄
      let shadowed = 0;
      let checked = 0;
      for (const a of b.abilities ?? []) {
        const doc = abilityDoc(a);
        if (!doc) continue;
        checked += 1;
        shadowed += shadowingNodes(doc, preset, slot);
      }
      if (checked > 0 && shadowed > 0) {
        bad.push(
          `${id}: ${preset}.params.${slot}.default —— 它登記的 ${checked} 支技能裡有 ` +
            `**${shadowed} 個節點自己寫了 ${slot}**，而 fillOne() 只在 undefined 時才填 ⇒ 翻這一格沒有作用`,
        );
      }
    }
    expect(
      bad.join("\n"),
      "⛔ 這些批登記了一個**翻了沒反應**的 rollback 開關。\n" +
        "⭐ 修法：改登記一個**沒有被逐支覆寫**的參數槽（實測哪一格蓋得到，⛔ 不要憑印象挑），\n" +
        "   或把那批技能的逐支覆寫拿掉讓家族預設成為唯一住處（第〇·四守則）。\n" +
        "⚠️ 一個翻了沒反應的開關**比沒有更糟** —— owner 是在**已經上線之後**才會去翻它。",
    ).toBe("");
  });

  it("⛔ 登記的技能 id 必須真的存在（打錯字＝那一批在保護空氣）", () => {
    const ghosts: string[] = [];
    for (const [id, b] of Object.entries(batches()))
      for (const a of b.abilities ?? [])
        if (abilityDoc(a) === null && !a.startsWith("godie-") === false && !existsSync(join(REPO, "content/_legacy/abilities", `${a}.json`)))
          ghosts.push(`${id} → ${a}`);
    expect(ghosts.join("\n"), "登記的 abilities 指到不存在的技能文件").toBe("");
  });

  it("⭐ sentinel —— 檢查器本身抓得到一個人造的遮蔽", () => {
    const doc = {
      effects: [
        { kind: "spawnModelFx", preset: "tpl-x", modelKey: "m" },
        { kind: "spawnModelFx", preset: "tpl-x" },
      ],
    } as Record<string, unknown>;
    expect(shadowingNodes(doc, "tpl-x", "modelKey")).toBe(1);
    expect(shadowingNodes(doc, "tpl-x", "count")).toBe(0);
  });
});
