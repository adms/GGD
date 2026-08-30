import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalizeJcs, SHA256_PREFIX } from "./import/jcs";
import { sha256Hex } from "./sha256";

/**
 * ⭐⭐ **一格存了雜湊卻沒有人對它，比沒有這一格更糟。**
 *
 * `zAbilityTemplateCard.contentSha256`（2026-08-31 加的）記下
 * 「我當初綁的是**哪一份**模板」。⭐ 而這條閘是它的**另一半**：
 * ⛔ 沒有對帳的話，那一格只會讓人**以為**釘住了。
 *
 * ── ⭐ 為什麼需要「釘住」這個概念 ────────────────────────────────────
 * `expand.ts` 的設計是**模板改了，84 支引用它的技能全部跟著動** ——
 * ⭐ 那是刻意的（模板升級自動傳播），⛔ 不是缺陷。
 *
 * ⚠️ ⭐ 而它的代價是：**作者不知道自己綁的那一版變了**。
 * 2026-08-26 的實例：`tpl-beam-roll.params.count.default` 是一個**憑空來的 6**，
 * 而它服務了七支技能；逐支覆寫 `count:1` 只證明了被檢查的那一支
 * —— ⛔ 家族預設繼續服務另外六支。
 *
 * ⇒ ⭐ 填了 `contentSha256` 的引用 ＝ 「我要知道它變了」。
 *   ⛔ 沒填的照舊跟著最新的（**那是多數情況下對的行為**）。
 *
 * ── ⚠️ 這條閘刻意**不要求**任何人去填它 ──────────────────────────────
 * 出貨的 84 支一格都沒填 ⇒ ⭐ 這條閘今天**什麼都不擋**。
 * 它在**有人填了之後**才開始說話 —— ⛔ 那是「一個永遠不會紅的閘」的解法：
 * 讓它在**前提改變的那一刻**才要求。
 */

const REPO = join(import.meta.dirname, "../../../..");
const TPL = join(REPO, "content/ability-templates");

/** ⭐ 一份模板的內容雜湊 —— 與 `packageDigest` 同一條路（JCS ＋ sha256 ＋ 前綴）。 */
const templateDigest = (doc: unknown): string => SHA256_PREFIX + sha256Hex(canonicalizeJcs(doc));

/** 掃出貨內容裡每一個帶 `contentSha256` 的模板引用。 */
const pinnedRefs = (): { file: string; ref: string; pin: string }[] => {
  const out: { file: string; ref: string; pin: string }[] = [];
  const walk = (n: unknown, file: string): void => {
    if (Array.isArray(n)) return void n.forEach((v) => walk(v, file));
    if (n === null || typeof n !== "object") return;
    const rec = n as Record<string, unknown>;
    if (typeof rec["ref"] === "string" && typeof rec["contentSha256"] === "string") {
      out.push({ file, ref: rec["ref"], pin: rec["contentSha256"] });
    }
    for (const v of Object.values(rec)) walk(v, file);
  };
  for (const dir of ["content/abilities", "content/champions", "content/items", "content/augments"]) {
    for (const f of readdirSync(join(REPO, dir))) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      walk(JSON.parse(readFileSync(join(REPO, dir, f), "utf8")), `${dir}/${f}`);
    }
  }
  return out;
};

describe("模板的精確引用鎖必須誠實", () => {
  it("⭐ 量尺先自證：雜湊算得出來，而且兩份不同的模板算出不同的值", () => {
    const files = readdirSync(TPL).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
    expect(files.length, "一份模板都讀不到 —— 路徑過期").toBeGreaterThan(10);
    const a = JSON.parse(readFileSync(join(TPL, files[0]!), "utf8")) as unknown;
    const b = JSON.parse(readFileSync(join(TPL, files[1]!), "utf8")) as unknown;
    // ⭐ 正方向：同一份算兩次一樣（決定性）
    expect(templateDigest(a)).toBe(templateDigest(a));
    // ⭐ 反方向：不同的兩份⛔不可以算出同一個值
    expect(templateDigest(a)).not.toBe(templateDigest(b));
    // ⭐ 格式與 schema 的 regex 對得上
    expect(templateDigest(a)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("★ 每一個填了 `contentSha256` 的引用，都要對得上那份模板今天的內容", () => {
    const pins = pinnedRefs();
    const bad: string[] = [];
    for (const p of pins) {
      const file = join(TPL, `${p.ref}.json`);
      let doc: unknown;
      try {
        doc = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        bad.push(`${p.file} 釘住了 \`${p.ref}\`，⛔ 而那份模板讀不到（${file}）`);
        continue;
      }
      const now = templateDigest(doc);
      if (now !== p.pin) {
        bad.push(
          `${p.file}\n      釘住的：${p.pin}\n      今天的：${now}\n` +
            `      ⇒ ⭐ \`${p.ref}\` 的內容**變了**，而這一支的引用還釘在舊的那一版`,
        );
      }
    }

    expect(
      bad,
      [
        "⛔⛔ 這幾個精確引用鎖**對不上**：",
        ...bad.map((b) => `   · ${b}`),
        "",
        "⭐ 兩條出路，⛔ 沒有第三條：",
        "   ① **接受新版**：把 `contentSha256` 更新成今天的值",
        "      ⇒ ⚠️ 而更新之前**先看那個模板改了什麼** —— 釘住它的理由多半還在",
        "   ② **不要釘了**：把 `contentSha256` 整格拿掉 ⇒ 這一支永遠跟著最新的模板",
        "",
        "⛔ **不要**把這條閘放寬 —— 一格存了雜湊卻沒有人對它，",
        "   比沒有這一格更糟（它會讓人以為釘住了）。",
      ].join("\n"),
    ).toEqual([]);
  });
});
