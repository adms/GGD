/**
 * 閘②（GH#1030）：技能傷害的解析入口**必須明確接收 rank**，⛔ 不可以被假設成 1。
 *
 * 假前提 #2（2026-09-05）：算式版拿 `flat`（＝第 1 欄）算技能傷害 ⇒ 低估 2.2–6.3 倍
 * （神滅斬算 3,018、126 場實測 19,155）。⭐ 出貨的共用入口是
 * `sim/effects/effect.ts::resolveScaling(finalStats, sc, rank, attrs)`：`perRank[rank-1]`
 * 就在它裡面，所以「傳了幾」決定「算出幾」。這裡掃**出貨原始碼**，三件事：
 *   ① 簽章裡 `rank` 沒有預設值、不是選填（加了 `= 1` 就紅）
 *   ② 每一個非測試呼叫點傳的第三個引數不是數字字面值（寫 `1` 就紅並指名檔案）
 *   ③ 非測試原始碼裡沒有 `perRank[0]` 這種「直接讀第 1 欄」的手算
 * 量尺先自證：合成一段 `resolveScaling(a, b, 1, c)` 要抓得到，`ctx.rank` 要放行，
 * 而真的掃描必須找到 `sim/effects/damage.ts` 那一站（找不到 = 掃描器壞了，⛔ 不是全綠）。
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ROOTS = ["apps", "packages", "tools"];
const SOURCE = /\.(ts|tsx|mts)$/;
const SKIP_DIR = /^(node_modules|\.venv|venv|__pycache__|\.git|dist|coverage|out|__fixtures__|testkit)$/;
const IS_TEST = /\.test\.(ts|tsx|mts)$/;
const ENTRY = "packages/shared/src/sim/effects/effect.ts";
/** 已知且帶理由的例外（今天是空的 —— 加一筆就要寫得出「為什麼這一站沒有 rank」）。 */
const KNOWN: Record<string, string> = {};

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIR.test(e.name)) yield* walk(join(dir, e.name)); }
    else if (e.isFile() && SOURCE.test(e.name) && !IS_TEST.test(e.name)) yield join(dir, e.name);
  }
}
/** 去掉整行註解與行尾 `//`，讓 JSDoc 裡的範例不算呼叫點。 */
const code = (src: string): string =>
  src.split("\n").map((l) => (/^\s*(\*|\/\/|\/\*)/.test(l) ? "" : l.replace(/\/\/.*$/, ""))).join("\n");

/** 每一個 `resolveScaling(` 呼叫的**第三個**頂層引數（跨行也切得對）。 */
export function rankArgs(src: string): string[] {
  const out: string[] = [];
  const s = code(src);
  const re = /(?<!function\s)resolveScaling\(/g;
  for (let m = re.exec(s); m !== null; m = re.exec(s)) {
    const args: string[] = [];
    let depth = 0, cur = "";
    for (let i = m.index + m[0].length; i < s.length; i++) {
      const ch = s[i]!;
      if (ch === "(" || ch === "[" || ch === "{") depth++;
      if (ch === ")" || ch === "]" || ch === "}") { if (depth === 0) { args.push(cur); break; } depth--; }
      if (ch === "," && depth === 0) { args.push(cur); cur = ""; continue; }
      cur += ch;
    }
    out.push((args[2] ?? "").trim());
  }
  return out;
}
const isLiteral = (arg: string): boolean => /^\d+(\.\d+)?$/.test(arg) || arg === "";

describe("閘②：技能傷害解析不可以假設 rank = 1（GH#1030 假前提 #2）", () => {
  it("量尺先自證：字面值抓得到、ctx.rank 放行", () => {
    expect(rankArgs("x = resolveScaling(a, b, 1, c);").map(isLiteral)).toEqual([true]);
    expect(rankArgs("x = resolveScaling(a, f(b, 2), ctx.rank, c);").map(isLiteral)).toEqual([false]);
    expect(rankArgs("// resolveScaling(a, b, 1, c)\n/** resolveScaling(a, b, 1, c) */")).toEqual([]);
  });

  it("① 共用入口的簽章：rank 必填、沒有預設值", () => {
    const src = readFileSync(join(REPO, ENTRY), "utf8");
    const sig = /export function resolveScaling\(([\s\S]*?)\)\s*:/.exec(src)?.[1] ?? "";
    expect(sig, `${ENTRY} 找不到 resolveScaling 的簽章 —— 入口搬家了就把 ENTRY 跟著搬`).not.toBe("");
    expect(sig, "rank 參數必須是 `rank: number`，⛔ 不可以是 `rank?:` 或 `rank = 1`").toMatch(/\brank\s*:\s*number\s*,/);
    expect(sig).not.toMatch(/\brank\s*(\?|=)/);
  });

  it("② 每一個出貨呼叫點都傳了 rank；③ 沒有人直接讀 perRank[0]", () => {
    const literal: string[] = [];
    const firstCol: string[] = [];
    let sites = 0;
    for (const root of ROOTS) for (const f of walk(join(REPO, root))) {
      const rel = relative(REPO, f);
      const src = readFileSync(f, "utf8");
      if (src.includes("resolveScaling(") && rel !== ENTRY)
        for (const a of rankArgs(src)) { sites++; if (isLiteral(a) && !(rel in KNOWN)) literal.push(`${rel} ← rank=${a || "（缺）"}`); }
      if (/perRank\s*(\?\.|!)?\s*\[\s*0\s*\]/.test(code(src)) && !(rel in KNOWN)) firstCol.push(rel);
    }
    expect(sites, "掃描器一個呼叫點都沒找到 —— 它壞了，這不是全綠").toBeGreaterThan(5);
    expect(literal, "這些站把技能等級寫死成字面值 —— 算出來的傷害只對 1 級成立").toEqual([]);
    expect(firstCol, "直接讀 perRank[0] 就是「技能是 1 級」這個假前提的程式版").toEqual([]);
  });
});
