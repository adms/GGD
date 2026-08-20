/**
 * 閘 A —— **平衡推導裡不准出現字面等級**。
 *
 * owner 2026-08-20（逐字，對 #447 的更正）：
 * > 「我的錨點有講過是 **LV 30/50/99 三個**，至少要滿足 **30(hard limit)**，
 * >  能 **50 比較好(soft limit)**, **99 是極限**」
 *
 * ⛔ 而在此之前，「18」有**九個住處**，其中最壞的一個是
 * `statCapsAreFences.test.ts` 的 `championStatBase(d, stat, 18)` ——
 * **一條綠燈的守衛正在替一個過期的錨點背書**。那正是元規則講的那件事：
 * 判準（「記得用錨點」）治不了，因為出事的當下沒有人在讀散文，只有測試在跑。
 *
 * ⭐ 所以這一條問的不是「數字對不對」（那是平衡，不歸測試管），而是
 * **「這個等級是從哪裡來的」**：從 `BALANCE_ANCHOR_LEVELS` 來 → 過；
 * 打在原始碼裡 → 紅，而且指名檔案與行號。
 *
 * ⚠️ 只掃**可執行**的位元組：註解與字串一律先塗掉。⛔ 不塗的話這個檔自己的
 * 檔頭（上面那個「18」）就會讓它紅，而那是一個沒有人修得動的假陽性。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "../../testkit/cover";
import { BALANCE_ANCHOR_LEVELS } from "./balanceAnchors";
import {
  DEFAULT_STAT_CAPS,
  MEDIAN_X200_CAPPED_STATS,
  capFor,
} from "../sim/statCaps";
import type { Stat } from "../sim/stats/statTypes";

const TAG = "balance-anchor-levels";
const REPO = join(__dirname, "../../../..");

/** 平衡推導的來源集：這幾個檔裡的等級**決定出貨數值**。 */
const SOURCES = [
  "packages/shared/src/content/damageTiers.ts",
  "packages/shared/src/sim/statCaps.ts",
  "packages/shared/src/sim/manaEconomy.ts",
  "packages/shared/src/sim/statCapsAreFences.test.ts",
  "tools/mana-audit/gen_mana_audit.ts",
] as const;

/**
 * ⛔ **還沒重算的舊基準** —— `檔:常數` → 為什麼它還在。
 *
 * ⚠️ 這是**名單**不是豁免（同 `statCapsAreFences.test.ts` 的 `KNOWN_OVER`）：
 * 每一筆都帶著一個**能被反駁的理由**，而且下面有反向斷言 ——
 * 重算完之後這一筆會變成過期項目而紅，⛔ 不會靜靜留著。
 */
const LEGACY_ANCHORS: Readonly<Record<string, string>> = Object.freeze({
  "packages/shared/src/sim/statCaps.ts:STAT_CAP_ANCHOR_LEVEL":
    "13 條硬上限裡有 7 條是「L18 母體中位 × 200」烘死的**字面值**；重算會動到出貨平衡 ⇒ 那是 owner 的決定，⛔ 不由程式順手做",
});

/** 塗掉註解與字串（含跨行 block 與樣板字面），保留行號。 */
function code(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];
    const eat = (end: string, esc: boolean): void => {
      let j = i + (esc ? 1 : end.length);
      while (j < s.length) {
        if (esc && s[j] === "\\") { j += 2; continue; }
        if (s.startsWith(end, j)) { j += end.length; break; }
        j++;
      }
      out += s.slice(i, j).replace(/[^\n]/g, " ");
      i = j;
    };
    if (c === "/" && n === "*") { eat("*/", false); continue; }
    if (c === "/" && n === "/") {
      const j = s.indexOf("\n", i) < 0 ? s.length : s.indexOf("\n", i);
      out += " ".repeat(j - i);
      i = j;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { eat(c!, true); continue; }
    out += c;
    i++;
  }
  return out;
}

const lineOf = (src: string, at: number): number => src.slice(0, at).split("\n").length;
const scan = (src: string, re: RegExp, group: number): { line: number; n: number; hit: string }[] => {
  const out: { line: number; n: number; hit: string }[] = [];
  re.lastIndex = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    out.push({ line: lineOf(src, m.index), n: Number(m[group]), hit: m[0].trim() });
  }
  return out;
};

describe("平衡推導裡的等級只能來自錨點", () => {
  const anchors = new Set<number>(BALANCE_ANCHOR_LEVELS);

  it("⛔ 沒有任何一支推導拿字面等級去問英雄卡", () => {
    cover(TAG);
    const bad: string[] = [];
    for (const rel of SOURCES) {
      const src = code(readFileSync(join(REPO, rel), "utf-8"));
      // 三種**可執行**的等級位置。⛔ 不掃裸數字 —— 那會把 `× 200` 也抓進來。
      const found = [
        ...scan(src, /championStatBase\s*\([^()]*?,\s*(\d+)\s*[,)]/g, 1),
        ...scan(src, /\bstatAt\s*\([^()]*?,\s*(\d+)\s*\)/g, 1),
        ...scan(src, /\blevel\s*:\s*(\d+)\b/g, 1),
      ];
      for (const f of found) {
        if (!anchors.has(f.n)) bad.push(`${rel}:${f.line} → ${f.hit}（${f.n} ∉ ${[...anchors]}）`);
      }
    }
    expect(bad, "改成 import `BALANCE_ANCHOR_LEVELS`（或具名的舊基準常數）").toEqual([]);
  });

  it("具名的等級常數要嘛是錨點，要嘛在名單上帶著理由", () => {
    cover(TAG);
    const stale = new Set(Object.keys(LEGACY_ANCHORS));
    const bad: string[] = [];
    for (const rel of SOURCES) {
      const src = code(readFileSync(join(REPO, rel), "utf-8"));
      for (const m of src.matchAll(/\b([A-Z][A-Z0-9_]*_LEVELS?)\b[^=\n]*=\s*(\d+)\b/g)) {
        const key = `${rel}:${m[1]}`;
        if (anchors.has(Number(m[2]))) continue;
        if (stale.delete(key)) continue;
        bad.push(`${rel}:${lineOf(src, m.index)} → ${m[1]} = ${m[2]}`);
      }
    }
    expect(bad, "不是錨點就要進 LEGACY_ANCHORS 並寫下為什麼還沒重算").toEqual([]);
    // ⭐ 反向：名單上的必須真的還在。重算完就要刪掉那一筆，⛔ 不留成沒人讀的豁免。
    expect([...stale], "LEGACY_ANCHORS 有過期的項目").toEqual([]);
  });

  it("「哪幾條上限錨在舊基準」是一份清單，不是一段散文", () => {
    cover(TAG);
    const listed = new Set<Stat>(MEDIAN_X200_CAPPED_STATS);
    expect(listed.size).toBe(MEDIAN_X200_CAPPED_STATS.length);
    for (const stat of listed) {
      const cap = capFor(DEFAULT_STAT_CAPS, stat);
      // 單層＝owner 只給了一個倍率（見 statCaps.ts）。兩層代表它另有來歷，不該在清單裡。
      expect(cap.base, `${stat} 不在 DEFAULT_STAT_CAPS 裡`).toBeLessThan(Infinity);
      expect(cap.unlocked, `${stat} 是兩層的，它不是 200× 那一批`).toBe(cap.base);
    }
    // 反向：名單外的那幾條**不可以**也是「200× 推導」——它們各自有 owner 的裁決。
    const outside = (Object.keys(DEFAULT_STAT_CAPS) as Stat[]).filter((s) => !listed.has(s));
    expect(outside.length, "整張表都被歸給 200× 了，那清單就沒有意義").toBeGreaterThan(0);
  });
});
