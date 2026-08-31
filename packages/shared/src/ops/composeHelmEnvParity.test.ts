/**
 * ⭐⭐ GH#813 C —— **compose 轉得到的旋鈕，helm 轉不到**。
 *
 * ── 票文逐字 ─────────────────────────────────────────────────────────────
 * 「⭐ **helm 沒有對應的旋鈕直通，而且沒有 compose ↔ helm 的 env parity 閘** ——
 *   這是 #724 那個缺口的**下一次**：修好 compose 不代表 helm 也轉得到」
 *
 * ── 2026-08-31 量到 ──────────────────────────────────────────────────────
 * compose（`compose.yaml` ＋ `compose.family.yaml`）宣告 **94** 個 env key；
 * helm 全樹提到 188 個名字，⭐ 而 compose 有而 helm **沒有**的是 **74** 個。
 *
 * ── ⛔ 這條閘刻意**不是**「兩邊必須一樣」 ────────────────────────────────
 * 那會逼人把 74 個 key 抄進 helm，⭐ 而它們大多是 **compose-only 的開發旋鈕**
 *（`GGD_CONTENT_CACHE_DIR` 那一族）—— ⛔ 抄過去只會造出 74 個沒有人讀的欄位。
 *
 * ⭐ 它是一條**棘輪 ＋ 豁免表**：
 *   · 差距**只能變小**（⛔ 加一個新的 compose-only 旋鈕而不做選擇 ⇒ 紅）
 *   · 每一個豁免要寫得出**一個能被反駁的理由**（⛔ 不是「還沒排到」）
 *
 * ⚠️ ⭐ 而它擋的正是那個「**下一次**」：有人在 compose 加一格 rollback 開關、
 * 線上跑的是 helm ⇒ ⛔ 那格開關在正式環境**轉不到**，
 * ⭐ 而 compose 那一側每一項檢查都是綠的（CLAUDE.md：只驗名詞抓不到關係故障）。
 *
 * MUTATION LOG（落地前跑過）：
 *   · 在 `compose.family.yaml` 加一個 `GGD_FAKE_KNOB:` → 「差距只能變小」紅並指名它
 *   · 把 `BASELINE` 調高 → 「⛔ 不要調高基準線」紅
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const read = (p: string): string => readFileSync(resolve(ROOT, p), "utf8");

/** compose 宣告的 env key（⭐ `services.*.environment` 底下那一層）。 */
function composeEnvKeys(): Set<string> {
  const src = read("docker/compose.yaml") + read("docker/compose.family.yaml");
  return new Set([...src.matchAll(/^\s{6,}([A-Z][A-Z0-9_]{2,}):/gm)].map((m) => m[1]!));
}

/** helm 全樹提到的名字（⭐ 含 templates / values / files —— ⛔ 不只 values.yaml）。 */
function helmNames(): Set<string> {
  const out = new Set<string>();
  const walk = (d: string): void => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else for (const m of readFileSync(p, "utf8").matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) out.add(m[1]!);
    }
  };
  walk(resolve(ROOT, "deploy/helm"));
  return out;
}

/**
 * ⭐ 棘輪基準線 —— 2026-08-31 量到的差距。**只能變小。**
 * ⛔ 它變大時**不要調高這個數字** —— 去問「這一格新旋鈕，線上要不要轉得到？」
 */
const BASELINE = 74;

describe("GH#813 C compose ↔ helm 的旋鈕 parity", () => {
  const ce = composeEnvKeys();
  const he = helmNames();
  const missing = [...ce].filter((k) => !he.has(k)).sort();

  it("量尺先自證：兩邊都解析得出東西（⛔ 空的會讓差距假性歸零）", () => {
    expect(ce.size, "⛔ compose 一個 env key 都沒解析到").toBeGreaterThan(50);
    expect(he.size, "⛔ helm 一個名字都沒解析到").toBeGreaterThan(50);
    // ⭐ 已知兩邊都有的那幾個要真的對得上 —— ⛔ 否則「差距」量的是解析失敗
    for (const k of ["APP_ENV", "DATA_DIR", "GGD_PLATFORM_URL"]) {
      expect(ce.has(k) && he.has(k), `⛔ ${k} 兩邊都該有`).toBe(true);
    }
  });

  it("★ ⭐ **差距只能變小** —— 新增一個 compose-only 旋鈕就要做選擇", () => {
    expect(
      missing.length,
      `⛔ compose 有而 helm 轉不到的旋鈕從 ${BASELINE} 變成 ${missing.length}。\n` +
        `⭐ 新增的那幾個：${missing.slice(0, 8).join(", ")}\n` +
        `⇒ 問一句：**這一格在線上（helm）要不要轉得到？**\n` +
        `   要 ⇒ 在 helm 開一格；⛔ 不要 ⇒ 它是 compose-only 的開發旋鈕，把基準線調**低**不了，\n` +
        `   ⭐ 那就在這裡加一行豁免並寫下**為什麼**（⛔ 不是「還沒排到」）。\n` +
        `⛔⛔ **不要調高 BASELINE** —— 那正是這條閘要擋的動作。`,
    ).toBeLessThanOrEqual(BASELINE);
  });

  it("⭐ 出貨的 rollback 開關那一族**必須**在 helm 轉得到", () => {
    // ⚠️ ⭐ 這一條是上面那條棘輪的**下限**：一個 `*_ENABLED` / `*_BYPASS` 形狀的
    //   旋鈕存在的理由就是「線上出事時一鍵回頭」⇒ ⛔ 它在線上轉不到等於沒有。
    const rollback = [...ce].filter((k) => /_(ENABLED|BYPASS|OFF|DISABLE)$/.test(k));
    const dead = rollback.filter((k) => !he.has(k));
    expect(
      dead,
      "⛔ 這幾格是 rollback 開關，而它們在 helm（線上）轉不到 —— 出事時回不了頭",
    ).toEqual([]);
  });
});
