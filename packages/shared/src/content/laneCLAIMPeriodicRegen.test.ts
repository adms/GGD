/**
 * ⛔ **「每秒 X」這句話，唯一的引擎表達是一格 regen modifier —— 而它對每一支掃描器
 * 都長得像「沒有機制」。**
 *
 * ── 量到的（2026-08-27，GH#648）─────────────────────────────────────────────
 * 出貨技能裡有 46 支的卡面承諾「每 N 秒 …」。逐支對照引擎側之後分成三堆：
 *
 * | 堆 | 引擎側長什麼樣 | 掃描器看得到嗎 |
 * |---|---|---|
 * | 強週期 | `dot` / `delayed(count≥2)` / `onInterval` hook / aura / 模板的 `*IntervalSec` | ✅ |
 * | ⭐ **只有 regen** | `passive.ranks[].modifiers` 上一格 `healthRegen` / `manaRegen` | ⛔ **看不到** |
 * | 什麼都沒有 | —— | ✅（被算成缺口） |
 *
 * 中間那一堆是這條守衛存在的全部理由。`tools/skill-templates/shape_axes.json`
 * 把 `modifiers` 逐字列在 `ignored`（「屬性加成清單（它的期間住在 duration）」）——
 * 那個判斷對**期間**是對的，對**節奏**是錯的：一格 `healthRegen: -10` 就是
 * 「每秒扣 10 點」，它的節奏由引擎的 regen tick 提供。
 *
 * ⇒ 於是 GH#648 的「43 支說明宣稱迴圈、JSON 一格迴圈機制都沒有」把這 7 支
 * **全部算成缺口**，而它們其實是做好的。⚠️ 這正是 CLAUDE.md 的
 * 「⭐ 讀一張表之前，先問**這一欄的分母是什麼**」。
 *
 * ── 這一條紅的時候代表什麼 ─────────────────────────────────────────────────
 * 這 7 支**沒有第二個表達**。任何人把那一格 modifier 清掉、改成 0、或在
 * 「整理無效 modifier」時順手拿掉，卡面上那句「每秒 …」當場變成謊話 ——
 * 而 `content:build`、`skillnorm`、`prose`、`shapes` **一支都不會叫**
 * （shapes 甚至會覺得情況變好了，因為它本來就沒把這一格算進去）。
 * ⇒ 第一·五守則的最終形態：每一個零件都是對的，只有它們的組合是空的。
 *
 * ⛔ 名單是**推導出來的**，⛔ 不是抄的：母體＝「卡面有每秒宣稱」∩「沒有強週期機制」。
 * 哪天有人替其中一支補了真的 `dot`，它就自己離開母體，⛔ 不必改這支測試。
 * ⛔ 也沒有任何出貨數值住在斷言裡（第零守則：數字有三個住處，測試不是第四個）。
 *
 * 突變驗證：`godie-u00n.passive` 的 `healthRegen` 值改成 0 ⇒ 紅並指名它。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mechanicsText } from "./descriptionClaims";

const ABIL = join(dirname(fileURLToPath(import.meta.url)), "../../../../content/abilities");

/** 卡面「每 N 秒 / 每隔」的宣稱面。⛔ 佔位符先剝掉：`{{cd}}秒冷卻` 不是節奏。 */
const CLAIMS_PERIODIC = (desc: string): boolean =>
  /每\s*\d*(?:\.\d+)?\s*秒|每隔/.test(mechanicsText(desc).replace(/\{\{[^}]*\}\}/g, ""));

const nodes = function* (n: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(n)) for (const v of n) yield* nodes(v);
  else if (n !== null && typeof n === "object") {
    yield n as Record<string, unknown>;
    for (const v of Object.values(n)) yield* nodes(v);
  }
};

/** 掃描器看得見的那幾種節奏。 */
const hasStrongPeriodic = (doc: unknown): boolean =>
  [...nodes(doc)].some(
    (n) =>
      n["kind"] === "dot" ||
      (n["kind"] === "delayed" && typeof n["count"] === "number" && n["count"] >= 2) ||
      n["on"] === "onInterval" ||
      (Array.isArray(n["auras"]) && n["auras"].length > 0) ||
      Object.keys(n).some((k) => /IntervalSec$|trailSpacingSec/.test(k)),
  );

/** ⭐ 看不見的那一種：一格會 tick 的 regen。 */
const regenMods = (doc: unknown): Record<string, unknown>[] =>
  [...nodes(doc)].filter((n) => n["stat"] === "healthRegen" || n["stat"] === "manaRegen");

describe("卡面「每秒」的節奏只住在一格 regen modifier 上（GH#648）", () => {
  it("每一支都還帶著那一格，而且它不是 0", () => {
    const broken: string[] = [];
    let covered = 0;
    for (const f of readdirSync(ABIL).filter((x) => x.endsWith(".json") && x !== "_index.json")) {
      const doc = JSON.parse(readFileSync(join(ABIL, f), "utf8")) as Record<string, unknown>;
      if (!CLAIMS_PERIODIC(String(doc["description"] ?? ""))) continue;
      if (hasStrongPeriodic(doc)) continue;
      const mods = regenMods(doc);
      if (mods.length === 0) continue; // 「什麼都沒有」那一堆 —— GH#648 的內容批在管
      covered += 1;
      if (!mods.some((m) => typeof m["value"] === "number" && m["value"] !== 0))
        broken.push(`${String(doc["id"])} —— 卡面說「每秒…」，而唯一的表達 ${String(mods[0]?.["stat"])} 是 0/缺值`);
    }
    expect(covered).toBeGreaterThan(0); // 母體空掉＝這支守衛失明（量尺要先自證）
    expect(broken).toEqual([]);
  });
});
