/**
 * ⛔ **卡面說「每 N 秒 …，持續 M 秒」而 JSON 一格節奏都沒有 —— 這張名單只能變短。**
 *
 * ── 為什麼這一支要存在（GH#648 第七輪）────────────────────────────────────────
 * 這張票從 2026-08-26 起連續六輪回報「內容批 0/43 → 0/40 → 0/39」，⭐ 而每一輪
 * 都是**人跑一支 python 掃描器、把數字貼進留言**。⛔ 沒有任何東西會紅：
 *   · `shapes:check` 驗的是**產物新鮮度與覆蓋率**，⛔ 不問「差集有沒有變大」
 *   · `laneCLAIMPeriodicRegen.test.ts` 只管**有 regen 那一堆**（它自己逐字寫著
 *     「什麼都沒有那一堆 —— GH#648 的內容批在管」）⇒ ⭐ **那一堆沒有人管**
 * ⇒ 一支新技能今天可以帶著「每秒 …持續 …」的謊話上架，而全套測試全綠。
 * 這正是元規則「判準 0/4 全破，只有閘有用」——⭐ 第七輪該補的是閘，⛔ 不是第七份報告。
 *
 * ── 兩側都是**推導**的，⛔ 沒有一個樣式或欄位名住在這個檔案裡（第〇·四守則）──
 * | 側 | 唯一住處 |
 * |---|---|
 * | 宣稱（卡面哪一句算「每 N 秒」「持續 M 秒」） | `tools/skill-templates/prose_markers.json` |
 * | 機制（JSON 哪一格算「迴圈」） | `tools/skill-templates/shape_axes.json` |
 * | 剝掉角色對白 `「…」`（第〇·六守則②） | `./descriptionClaims` 的 `mechanicsText` |
 * ⇒ owner 哪天在那兩張表上加一條，這條閘**自動**跟著走。
 *
 * ── ⭐ 兩條軸的**交集**，⛔ 不是「迴圈」單獨一條 ────────────────────────────
 * `迴圈` 的樣式收得下「循環／不斷／反覆／週期」這些**修辭**，而掃描器的 39 支差集
 * 裡有一批是誤報：12-02 仙氣．採藥「利用身體小周天**循環**」是道家比喻、
 * 06-03「**不斷**地修煉強化系能力」是文案、71-00 逐字寫「GGD **沒有**日夜**循環**」
 * ——⭐ 三張卡都**沒有說謊**。⇒ 這裡要求**同時**命中「持續」軸：
 * 「每 N 秒 … 持續 M 秒」是**量化**的節奏承諾，⛔ 修辭句配不出這個組合。
 * 實測：這一條把母體從 39 收到 29，而掉出去的正是那批修辭句。
 *
 * ── 這條紅了怎麼辦 ─────────────────────────────────────────────────────────
 * · **多一支**：那支技能的卡面在說謊。三條出路（第一·五守則）——換成做得到的機制
 *   （`dot` / `delayed(count≥2)` / `onInterval` hook）、把描述改成只講真的會發生的事、
 *   或升級成 owner 的裁決。⛔ 不要往名單裡加一列。
 * · **少一支**：修好了 ⇒ ⭐ 把那一行**刪掉**（棘輪只能變短）。
 *
 * ── 突變驗證（三次，⭐ 前兩次**沒有咬**，逐字記下來因為那才是有用的部分）──────
 * | # | 改壞什麼 | 結果 |
 * |---|---|---|
 * | 1 | `hasLoopMechanism` 的 `FIELD` 那一條 ⇒ `false && …` | 🔴 紅，⛔ **但指名的是 `godie-efur.passive`／`godie-ogld.ex`**，⛔ 不是本輪改的 `godie-huth.r` —— 它的 `dot` 帶 `stacking`，被 `BY_KIND` 那條接住了 |
 * | 2 | `godie-huth.r` 的 `intervalSec`／`stacking` 改名 | 🟢 **綠 —— 沒有咬**。⭐ 因為 `amountPerTick` 自己就在 `FIELD` 裡 ⇒ 節奏仍然成立（⛔ 這不是漏洞，是三條判準彼此獨立） |
 * | 3 | 把整個 `dot` 節點拿掉（＝**回捲本輪的內容改動**） | 🔴 紅，訊息逐字 `⛔ 新的謊話　godie-huth.r` ✅ |
 * ⇒ ⭐ 承重的那一條是 **③**：這條閘與本輪的內容修復是**同一件事的兩面**。
 * ⚠️ ①②留在表上是因為它們證明了一件事：**這三條判準不是互為備份，是互相獨立的**
 * ——拿掉任何一條，母體都會少一批而**不是**全部。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mechanicsText } from "./descriptionClaims";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ABIL = join(REPO, "content/abilities");
const readJson = (p: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(REPO, p), "utf8")) as Record<string, unknown>;

const MARKERS = readJson("tools/skill-templates/prose_markers.json")["markers"] as Record<
  string,
  { patterns: string[]; negative: string[] }
>;
const AXES = readJson("tools/skill-templates/shape_axes.json") as unknown as {
  fields: Record<string, string[]>;
  conditional: Record<string, { axes: string[]; minValue: number }>;
  byKind: Record<string, string[]>;
  hookOn: Record<string, string[]>;
  templateParams: { axes: Record<string, string[]> };
};

const LOOP = "迴圈";
const keysFor = (t: Record<string, string[]>): Set<string> =>
  new Set(Object.entries(t).flatMap(([k, v]) => (v.includes(LOOP) ? [k] : [])));
/** `intervalSec` / `amountPerTick` / `everyNth` / `steps` … ＋ 模板參數側的同義格。 */
const FIELD = new Set([...keysFor(AXES.fields), ...keysFor(AXES.templateParams.axes)]);
/** `count`/`jumps` 要 ≥ minValue 才算節奏（`count:1` 是純延遲）。 */
const COND = Object.entries(AXES.conditional).filter(([, v]) => v.axes.includes(LOOP));
/** `dot.stacking` → kind `dot` 上的 `stacking`。 */
const BY_KIND = [...keysFor(AXES.byKind)].map((k) => k.split(".", 2) as [string, string]);
const HOOK_ON = keysFor(AXES.hookOn);

/**
 * 卡面命中某一條軸（先剝對白，再剝 `{{…}}` 佔位 —— `{{cd}}秒冷卻` ⛔ 不是節奏）。
 * ⚠️ `negative` 是**把那段字挖掉**再比對，⛔ 不是「出現就整句作廢」——
 * 與 `scan_shapes.py::declared_axes` 逐字同構（它用 `text.replace(neg, "")`）。
 * ⛔ 讀成「否決」會讓「持續」軸整批消失：每一張卡的表頭都有「秒冷卻時間」。
 */
const claims = (desc: string, axis: string): boolean => {
  let t = mechanicsText(desc).replace(/\{\{[^}]*\}\}/g, "");
  const m = MARKERS[axis]!;
  for (const n of m.negative) t = t.split(n).join("");
  return m.patterns.some((p) => new RegExp(p).test(t));
};

function* nodes(n: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(n)) for (const v of n) yield* nodes(v);
  else if (n !== null && typeof n === "object") {
    yield n as Record<string, unknown>;
    for (const v of Object.values(n)) yield* nodes(v);
  }
}

const hasLoopMechanism = (doc: unknown): boolean =>
  [...nodes(doc)].some(
    (n) =>
      Object.keys(n).some((k) => FIELD.has(k)) ||
      COND.some(([k, v]) => typeof n[k] === "number" && (n[k] as number) >= v.minValue) ||
      BY_KIND.some(([kind, f]) => n["kind"] === kind && f in n) ||
      HOOK_ON.has(String(n["on"])) ||
      // ⭐ 一格會 tick 的 regen 也是節奏 —— 那一堆由 laneCLAIMPeriodicRegen.test.ts 管，
      //    ⛔ 這裡只負責把它們讓出去（兩支都叫＝同一支技能被記兩次）。
      n["stat"] === "healthRegen" ||
      n["stat"] === "manaRegen",
  );

/**
 * ⭐ 今天卡面在說謊的 24 支。⛔ **只能刪，不能加。**
 * 前置（⛔ 都在 GH#648 的柵欄外）：`tpl-periodic-field` 的家族接線缺在
 * `content/templates/expand.ts`（`FAMILIES` 裡 `"periodic-field"` 出現 0 次），
 * 而 30/39 是變身對子 ⇒ 動它們要重生成 `abilityCodeParityForms.baseline.json`。
 */
const KNOWN_LYING: ReadonlySet<string> = new Set([
  "godie-h01o.ex", "godie-h020.w", "godie-h02r.passive", "godie-h02r.q",
  "godie-h02u.q", "godie-h02u.r", "godie-hgam.passive", "godie-hgam.q",
  "godie-hjai.w", "godie-n00p.r", "godie-n00p.w", "godie-nsjs.r",
  "godie-nsjs.w", "godie-o00x.q", "godie-o030.e",
  "godie-o030.w", "godie-ogld.w", "godie-ogrh.q", "godie-orkn.e",
  "godie-orkn.w", "godie-u034.ex", "godie-ubal.w", "godie-ucrl.ex",
]);

describe("卡面宣稱「每 N 秒…持續 M 秒」的技能，JSON 裡要有節奏（GH#648）", () => {
  it("⭐ 說謊名單只能變短 —— 多一支＝新的謊話，少一支＝把那行刪掉", () => {
    const lying: string[] = [];
    let scanned = 0;
    for (const f of readdirSync(ABIL).filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
      const doc = JSON.parse(readFileSync(join(ABIL, f), "utf8")) as Record<string, unknown>;
      const desc = String(doc["description"] ?? "");
      scanned += 1;
      if (!claims(desc, LOOP) || !claims(desc, "持續")) continue;
      if (hasLoopMechanism(doc)) continue;
      lying.push(String(doc["id"]));
    }
    // ⭐ 量尺先自證（兩個方向）：母體不可以空，樣式表也不可以整張讀不到。
    expect(scanned).toBeGreaterThan(400);
    expect(FIELD.size).toBeGreaterThan(0);

    const added = lying.filter((id) => !KNOWN_LYING.has(id)).sort();
    const fixed = [...KNOWN_LYING].filter((id) => !lying.includes(id)).sort();
    expect(
      [
        ...added.map((id) => `⛔ 新的謊話　${id} —— 卡面說「每 N 秒…持續 M 秒」，JSON 一格節奏都沒有`),
        ...fixed.map((id) => `✅ 修好了　${id} —— 把它從 KNOWN_LYING 刪掉`),
      ].join("\n"),
      "⭐ 這是第一·五守則的閘：卡片上不可以有「說了但不會發生」的字。\n" +
        "　 新增一支 ⇒ 換成做得到的機制（dot / delayed(count≥2) / onInterval hook）、\n" +
        "　 或把描述改成只講真的會發生的事。⛔ 不要往 KNOWN_LYING 加一列。",
    ).toBe("");
  });
});
