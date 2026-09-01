/**
 * ⭐⭐ 「⛔ **沒有只能改程式才碰得到的角落**」—— main 第一件責任的**量尺**。
 *
 * owner 的大目標逐字：「開放讓玩家自己設計 英雄、技能、特效⋯**所有功能都要可
 * JSON 操作設定**」。⇒ ⭐ 那句話需要一個**數字**，⛔ 否則它永遠只是一句話。
 *
 * ── ⭐ 這條問什麼 ──────────────────────────────────────────────────────
 * 掃 `sim/` 與 `client/game/` 的模組層常數，逐個問：
 * 「**這個值今天在後台碰得到嗎？**」（`content/config/*.json` 的欄位名 ∪
 *  Zod config schema 的欄位 ∪ admin 表單的 `path`）
 *
 * ── ⚠️ 量尺自己被灌大過**兩次**（⭐ 誠實記下，⛔ 這是它最重要的一段）────────
 * · 第一版 **296** —— ⛔ 把 `DEFAULT_*`（Zod 預設，第一守則的住處②）全算進去
 * · 第二版 **149** —— ⛔ 尾段比對忘了轉小寫 ⇒ `situationalAiming` 明明碰得到卻被算成碰不到
 * · ⭐ 修好之後 **132**
 * ⇒ ⭐ 我是**逐個去驗其中三個**才發現的（`situationalAiming` / `followThroughTicks`
 *   在 config 裡查得到）。⛔ 一個沒有被抽驗過的統計，讀起來跟真的一模一樣。
 *
 * ── ⭐ 豁免是**規則**，⛔ 不是一張 132 列的名單（同 `damageTiers` 的判例）─────
 * | 類 | 為什麼不必可調 |
 * |---|---|
 * | 誤打守衛 | `kindLimits.ts` 的檔頭**自陳**：「每一格都是**誤打守衛**（50 打成 500 那一類），⛔ **不是平衡政策**」 |
 * | 上下界柵欄 | 同上：`MAX_`／`MIN_` 是防呆的天花板，⛔ 不是玩法決策 |
 * | 數值容差 | `EPS` / `TOLERANCE` —— 浮點比較的實作細節 |
 * | 協定/位元 | `_BITS` / `_MASK` / `_VERSION` —— ⛔ 改了會 desync，那**不該**可調 |
 *
 * ⇒ ⭐ 剩下的 **70 個「待判」才是真正的候選** —— 每一個都是一個
 *   「owner 想改的時候要改程式」的角落。
 *
 * ── ⛔ 這條**不**要求把 70 個全部搬進後台 ────────────────────────────────
 * 那是一批工作，⛔ 不是一條測試。⭐ 它要求的是**棘輪只能往下**：
 * 新寫一個寫死的決策 ⇒ 紅。⇒ 這個角落**只會變少**。
 *
 * MUTATION LOG（落地前跑過）：
 *   · 在 `sim/manaFloor.ts` 加一個 `const NEW_HARDCODED_DECISION = 7;` → 🔴（母體 +1）
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");

/** ⭐ 棘輪：只能變小。2026-09-01 量到的真值（⛔ 不是第一版的 296，也不是第二版的 149）。 */
const RATCHET = 132;
/** ⭐ 其中「⛔ 待判」的 —— 真正的候選。同樣只能變小。 */
const UNDECIDED_RATCHET = 70;

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else if (p.endsWith(".ts") && !p.includes(".test.")) out.push(p);
  }
  return out;
}

/** ⭐ 後台碰得到的欄位名 —— 三個來源的聯集（⛔ 不是猜路徑）。 */
function reachableNames(): Set<string> {
  const out = new Set<string>();
  const add = (s: string): void => void out.add(s.toLowerCase());
  const walkJson = (n: unknown): void => {
    if (Array.isArray(n)) n.forEach(walkJson);
    else if (n && typeof n === "object") {
      for (const [k, v] of Object.entries(n)) { add(k); walkJson(v); }
    }
  };
  const cfgDir = join(ROOT, "content/config");
  for (const f of readdirSync(cfgDir)) {
    if (!f.endsWith(".json")) continue;
    try { walkJson(JSON.parse(readFileSync(join(cfgDir, f), "utf8"))); } catch { /* 壞檔由別條閘管 */ }
  }
  for (const f of walkFiles(join(ROOT, "packages/shared/src/content/schema/config"))) {
    for (const m of readFileSync(f, "utf8").matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*z\./gm)) add(m[1]!);
  }
  for (const f of walkFiles(join(ROOT, "apps/admin/src"))) {
    for (const m of readFileSync(f, "utf8").matchAll(/path:\s*"([^"]+)"/g)) {
      for (const seg of m[1]!.split(".")) add(seg);
    }
  }
  return out;
}

const PREFIX = /^(DEFAULT|MAX|MIN|SHIPPED)_/;
const DECL = /^(?:export\s+)?const\s+([A-Z][A-Z0-9_]{3,})\s*(?::\s*[^=]+)?=\s*(-?\d+(?:\.\d+)?|true|false)\s*;/gm;

function classify(file: string, name: string): string {
  if (file.endsWith("kindLimits.ts")) return "誤打守衛";
  if (/_(MAX|MIN)_|^(MAX|MIN)_|_(MAX|MIN)$/.test(name)) return "上下界柵欄";
  if (name.includes("EPS") || name.includes("TOLERANCE")) return "數值容差";
  if (/_(BITS?|MASK|FLAG|VERSION|SCHEMA)/.test(name)) return "協定/位元";
  return "待判";
}

function census(): { file: string; name: string; cat: string }[] {
  const known = reachableNames();
  const out: { file: string; name: string; cat: string }[] = [];
  for (const root of ["packages/shared/src/sim", "apps/client/src/game"]) {
    for (const f of walkFiles(join(ROOT, root))) {
      for (const m of readFileSync(f, "utf8").matchAll(DECL)) {
        const name = m[1]!;
        const parts = name.replace(PREFIX, "").toLowerCase().split("_");
        // ⭐ 尾段逐段比對，⭐ **全部小寫**（⛔ 忘了這一步就會把母體灌大 17 個）
        let reachable = false;
        for (let i = 0; i < parts.length; i++) if (known.has(parts.slice(i).join(""))) { reachable = true; break; }
        if (reachable) continue;
        const rel = relative(ROOT, f);
        out.push({ file: rel, name, cat: classify(rel, name) });
      }
    }
  }
  return out;
}

describe("⭐ 沒有只能改程式才碰得到的角落（棘輪）", () => {
  const rows = census();

  it("★ ① 母體**只能變小** —— ⛔ 新寫一個寫死的決策就紅", () => {
    expect(
      rows.length,
      `⛔ 從 ${RATCHET} 變成 ${rows.length}。⭐ 新增的那幾個：\n` +
        rows.slice(RATCHET).map((r) => `  · ${r.file}:${r.name}`).join("\n") +
        `\n⭐ 修法是把它搬進三個住處（\`content/config\` ＋ Zod \`DEFAULT_*\` ＋ admin 欄位），` +
        `\n⛔ 或（⭐ 若它是誤打守衛／上下界／容差／協定）讓名字帶上那一類的記號。` +
        `\n⚠️ 母體變小了 ⇒ 把 RATCHET 改成新的數字（棘輪只准往下）。`,
    ).toBeLessThanOrEqual(RATCHET);
  });

  it("★ ② ⭐ **待判**的那一堆才是真正的角落 —— 同樣只能變小", () => {
    const undecided = rows.filter((r) => r.cat === "待判");
    expect(
      undecided.length,
      `⛔ 從 ${UNDECIDED_RATCHET} 變成 ${undecided.length} —— ⭐ 每一個都是一個` +
        `「owner 想改的時候要改程式」的角落（大目標：**所有功能都要可 JSON 操作設定**）。`,
    ).toBeLessThanOrEqual(UNDECIDED_RATCHET);
  });

  it("⭐ ③ **量尺自證**：已知碰得到的那幾個確實**沒有**被算進來", () => {
    // ⚠️ 這條是被踩出來的：量尺第二版把 `situationalAiming` 算成碰不到（尾段忘了轉小寫），
    //   ⭐ 而我是**逐個抽驗**才發現的。⇒ 把那次抽驗釘成一條測試。
    const names = new Set(rows.map((r) => r.name));
    for (const reachable of [
      "DEFAULT_KING_SITUATIONAL_AIMING", // content/config/arena-rules.json
      "DEFAULT_MOB_BASE_LEVEL", // 同上
    ]) {
      expect(
        names.has(reachable),
        `⛔⛔ \`${reachable}\` 在 \`content/config\` 裡查得到，而量尺說它碰不到\n` +
          `⇒ ⭐ 量尺**灌大了**，而一個灌大的統計讀起來跟真的一模一樣。`,
      ).toBe(false);
    }
  });
});
