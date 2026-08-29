/**
 * ⛔⛔ **每一格 Zod 認得的欄位，`EffectVariant` 也要認得**（GH#608）。
 *
 * ── ⚠️ 它驗的**不是**「這一格會不會生效」（那個前提我一開始寫錯了）────────────
 * 第一版的訊息寫「variant 看不到 ⇒ 不可能被轉發」。那句話對 `screenFlash` 這種
 * **逐格列舉**的 handler 成立，⛔ 對 `applyBuff` 這種 `...sourceGrants(e)`
 * **整包轉發**的 handler **不成立** —— 實測那 5 格在執行期全部是活的。
 * ⭐ 真正的代價是**作者與測試在 TS 裡寫不出那一格**：2026-08-10 `flight` 漏掉時，
 * `authGatesWave1.test.ts` **編譯不過**，main 上 `pnpm typecheck` 是紅的。
 * ⇒ 這條守衛驗的是「**兩個住處對得起來**」（第〇·四），⛔ 不是「它會不會發生」。
 *
 * ── 為什麼這條守衛必須存在 ──────────────────────────────────────────────────
 * 每個 effect kind 有**兩個住處**：出貨的 Zod（`schema/effects/<kind>.ts`）與
 * 手寫的 TS 介面（`sim/effects/variants/<kind>.ts`）。前者決定「內容檔收不收」，
 * 後者決定「**handler 看不看得到**」。兩者分岔的那一天長這樣：
 *
 *   `zScreenFlash` 有 `scripted` → 內容作者填得下去、`content:build` 綠、卡面寫得出
 *   `ScreenFlashVariant` **沒有** `scripted` → `apply(e, ctx)` 的 `e` **看不到它**
 *   ⇒ 它不可能被轉發 ⇒ owner 裁決的「1 秒全黑」在畫面上從來沒有發生過
 *
 * ── ⭐ 而型別層**檢查不到**它（這是重點）──────────────────────────────────
 * `content/compat.test.ts` 已經有一條 `Extends<EffectDef, z.infer<typeof zEffectDef>>`，
 * 而它對這個缺陷是**綠的**，因為：
 *   · TypeScript 的結構指派**允許多餘屬性**（超額檢查只管物件**字面值**）
 *     ⇒ `{…, scripted}` 指派給 `{…}` 合法。
 *   · 反方向也不行 —— 漏掉的是一格 **optional**，少一個 optional 仍然可指派。
 * ⇒ ⭐ **兩個方向都放行**，所以這件事只能在**執行期**問 Zod 自己的 `.shape`。
 *
 * ── 兩邊都從「出貨的東西」推導，⛔ 沒有手抄的 kind 名單 ────────────────────
 *  · Zod 那一半：`zEffectDefUnion.options[i].shape` —— **真的那個物件**，
 *    含 `EFFECT_COMMON_SHAPE` 展開進去的每一格。
 *  · variant 那一半：只能掃原始碼 —— TS 的型別在執行期**不存在**，
 *    這不是「用掃字串代替行為」（失敗形態⑥），是那一半**沒有**行為可問。
 *
 * ── 突變紀錄 ────────────────────────────────────────────────────────────────
 *  · 把 `sim/effects/variants/screenFlash.ts` 的 `scripted?: boolean;` 刪掉
 *      → 紅：「screenFlash: Zod 收得下但 variant 看不到 → scripted」
 *  · 把 `ApplyBuffVariant` 的 `extends SourceGrantFields` 拿掉
 *      → 紅並列出 11 格授予（＝ 2026-08-23 之前的真實狀態）
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import { zEffectDefUnion } from "./index";

const SIM_EFFECTS = join(dirname(fileURLToPath(import.meta.url)), "../../../sim/effects");
const VARIANTS_DIR = join(SIM_EFFECTS, "variants");

/**
 * ⭐ **作者欄位**：註冊期被解析成另一格（`radiusTier`→`radius`、`distanceTier`→`speed`/`distance`）。
 *
 * ⚠️ 它們在解析之後**仍然留在物件上**（`content/registries.ts::withTiers` 只加不刪，
 * 實測註冊後 39 個節點仍帶 `radiusTier` 且都有解析好的 `radius`），
 * ⭐ 但 `sim/` 底下**沒有任何 handler 讀它們** —— 而那正是要的：
 * variant 不宣告 ⇒ 「handler 讀了級距字面值」變成一個**型別錯誤**（第〇·四守則）。
 *
 * ⛔ 這是一條**規則**不是一張名單：任何 `*Tier` 結尾的作者欄位自動適用，
 * ⛔ 不需要有人記得往清單裡加第 16 個。
 * ⭐ 可反駁：哪一天有 handler **真的**需要讀級距名（例如要把它印在卡面上），
 * 那一格就該宣告在 variant 上，而這條規則就該收窄成一張帶理由的表。
 */
const AUTHORING_TIER_FIELD = /Tier$/;

/** `EffectDef = EffectVariant & EffectCommon` —— 交集那一半的欄位（`condition` 那一族）。 */
function commonProps(): Set<string> {
  const src = readFileSync(join(SIM_EFFECTS, "effect.ts"), "utf8");
  const body = /export interface EffectCommon\s*\{([\s\S]*?)\n\}/.exec(src)?.[1] ?? "";
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const out = new Set<string>();
  let depth = 0;
  for (const line of clean.split("\n")) {
    if (depth === 0) {
      const p = /^\s*(?:readonly\s+)?(\w+)\??\s*:/.exec(line);
      if (p?.[1]) out.add(p[1]);
    }
    depth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
  }
  return out;
}

/** kind → 那個介面宣告的頂層屬性名（⛔ 巢狀物件裡的不算）。 */
function variantProps(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const f of readdirSync(VARIANTS_DIR)) {
    if (!f.endsWith(".ts") || f.includes(".test.")) continue;
    const src = readFileSync(join(VARIANTS_DIR, f), "utf8");
    // ⚠️ `\{` 之前要吃掉可能的 `extends X` —— `ApplyBuffVariant extends SourceGrantFields`
    //    在 2026-08-23 出現，而第一版的正則會**整個跳過它**（然後靜靜少驗一個 kind）。
    for (const m of src.matchAll(/export interface \w*Variant(?:\s+extends\s+[\w, ]+)?\s*\{([\s\S]*?)\n\}/g)) {
      const body = m[1] ?? "";
      const kind = /kind:\s*"([\w-]+)"/.exec(body)?.[1];
      if (!kind) continue;
      const clean = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      const props = new Set<string>();
      let depth = 0;
      for (const line of clean.split("\n")) {
        if (depth === 0) {
          const p = /^\s*(?:readonly\s+)?(\w+)\??\s*:/.exec(line);
          if (p?.[1]) props.add(p[1]);
        }
        depth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
      }
      out.set(kind, props);
    }
  }
  return out;
}

describe("effect kind 的兩個住處要對得起來（GH#608）", () => {
  it("⛔ Zod 收得下的每一格，handler 都看得到", () => {
    const variants = variantProps();
    const common = commonProps();
    expect(common.size, "掃不到 EffectCommon —— effect.ts 搬家了").toBeGreaterThan(0);

    /**
     * ⭐ `ApplyBuffVariant extends SourceGrantFields` —— 掃描器讀不到 `extends`
     * 帶進來的欄位（那要一個真的 TS 解析器）。⇒ 把被繼承那一份也讀進來。
     * ⛔ 這是一條**從原始碼推導**的規則，不是豁免：介面不再 extends 的那一天，
     * 這裡也就自動不再放行。
     */
    /**
     * ⭐ 在 `sim/` 樹裡找一個 `export interface <名字>` 的 body。
     * ⛔ 刻意**不**寫死路徑或名字 —— 寫死正是上一版只認得 `SourceGrantFields` 的原因。
     */
    const findInterfaceBodies = (name: string): string[] => {
      const out: string[] = [];
      const re = new RegExp(
        "export interface " + name + "(?:\\s+extends\\s+[\\w, ]+)?\\s*\\{([\\s\\S]*?)\\n\\}",
      );
      const walk = (dir: string): void => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, e.name);
          if (e.isDirectory()) { walk(full); continue; }
          if (!e.name.endsWith(".ts") || e.name.includes(".test.")) continue;
          const hit = re.exec(readFileSync(full, "utf8"));
          if (hit?.[1] !== undefined) out.push(hit[1]);
        }
      };
      walk(join(SIM_EFFECTS, ".."));
      return out;
    };

    const inherited = new Map<string, Set<string>>();
    for (const f of readdirSync(VARIANTS_DIR)) {
      if (!f.endsWith(".ts") || f.includes(".test.")) continue;
      const src = readFileSync(join(VARIANTS_DIR, f), "utf8");
      const m = /export interface \w*Variant\s+extends\s+([\w, ]+)\s*\{([\s\S]*?)\n\}/.exec(src);
      if (!m) continue;
      const kind = /kind:\s*"([\w-]+)"/.exec(m[2] ?? "")?.[1];
      if (!kind) continue;
      const extra = new Set<string>();
      for (const base of (m[1] ?? "").split(",").map((x) => x.trim())) {
        // ⛔⛔ **⛔ 不可以寫死被繼承那一份的名字**（2026-08-30 踩到）——
        //   上一版只跟 `SourceGrantFields` 走,於是
        //   `FloatingTextVariant extends FloatingTextDriftSpec` 帶進來的 4 格 `drift*`
        //   掃不到 ⇒ 報「Zod 收得下但 variant 看不到」,
        //   ⛔ **而 variant 是對的** —— 它刻意 extends,正是為了不要第二個住處。
        //   ⇒ ⭐ 這條閘當時在**指控一份照著第〇·四守則寫的程式碼**。
        //
        // ⭐ 改成通用解析。⚠️ 判準是「**掃不到就紅**」,⛔ 不是「掃不到就放行」——
        //   後者會讓一個打錯字的 base 名字靜默通過,而那正是這條閘要擋的東西。
        const bodies = findInterfaceBodies(base);
        expect(
          bodies.length,
          "⛔ 掃不到被繼承的介面 `" + base + "`（" + f + "）—— 它搬家了,或名字打錯了。" +
            "⭐ 修法:把它移回 sim/ 樹底下,或更正 extends 的名字。" +
            "⛔ 不要在這裡加豁免 —— 掃不到就代表這條閘對那幾格是瞎的。",
        ).toBeGreaterThan(0);
        for (const body of bodies) {
          const cg = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
          let d = 0;
          for (const line of cg.split("\n")) {
            if (d === 0) {
              const pp = /^\s*(?:readonly\s+)?(\w+)\??\s*:/.exec(line);
              if (pp?.[1]) extra.add(pp[1]);
            }
            d += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
          }
        }
      }
      inherited.set(kind, extra);
    }
    expect(variants.size, "掃不到任何 variant 介面 —— 正則或資料夾搬家了").toBeGreaterThan(30);

    const gaps: string[] = [];
    const unmapped: string[] = [];
    for (const opt of zEffectDefUnion.options as readonly z.AnyZodObject[]) {
      const shape = opt.shape as Record<string, unknown>;
      const lit = (shape["kind"] as { _def?: { value?: string } } | undefined)?._def?.value;
      if (typeof lit !== "string") continue;
      const props = variants.get(lit);
      if (!props) {
        unmapped.push(lit);
        continue;
      }
      const seen = new Set([...props, ...common, ...(inherited.get(lit) ?? [])]);
      const missing = Object.keys(shape).filter(
        (k) => k !== "kind" && !seen.has(k) && !AUTHORING_TIER_FIELD.test(k),
      );
      if (missing.length > 0) gaps.push(`${lit}: Zod 收得下但 variant 看不到 → ${missing.join(", ")}`);
    }

    // ⚠️ 對不到 variant 的 kind 也要紅 —— 那代表這條守衛**對它是瞎的**，
    //    而一條看不見一半標本的守衛比沒有守衛更危險（它讓人以為有人在看）。
    expect(unmapped, "這些 kind 在 variants/ 裡找不到對應介面 —— 守衛對它們是瞎的").toEqual([]);
    expect(
      gaps,
      "⛔ Zod 收得下而 TS 那一份看不到 ⇒ 作者/測試在 TS 裡寫不出這一格" +
        "（第〇·四守則:同一份知識的兩個住處漂了）。⚠️ 加一格到 variant，" +
        "⛔ 不要放寬這條測試。",
    ).toEqual([]);
  });
});
