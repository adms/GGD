/**
 * 「瞬移」不可以被寫成 dash —— 而且 `mode:"toPoint"` 不可以掛在拿不到 point 的 castType 上（GH#442）。
 *
 * 這一條擋的是**一次批次匯入**造成的整類缺陷，⛔ 不是一支技能的手滑：
 * 2026-08-19 量到 15 支 dash 的 `speed` **全部**是 16、85 支的 `range` 全部是 11.0
 * （= 600 wc3 ÷ 54.5，匯入器讀不到 `cast_range` 時的預設）。分界線乾淨得驚人 ——
 * **`provenance: "owner-spec"` 的瞬移技全對，`"w3x-import"` 的全錯。**
 *
 * ⭐ 而底下那個更深的缺陷才是這條守衛真正的主題：
 * `mode:"toPoint"` 在 `castType:"dash"` 上**結構性拿不到 point**，兩端都不供應 ——
 *   · 伺服器 `sim/abilities/abilitySystem.ts` 的 `case "dash":` **只**設 `direction`
 *     （對照 `case "ground"` 有 `point = add(t.pos, clampLen(...))`）
 *   · 客戶端 `apps/client/src/input/AimResolver.ts` 的 `case "dash":` 回 `{type:"dir"}`
 * ⇒ `sim/effects/dash.ts` 的 `e.mode === "toPoint" && ctx.point ? … : ctx.direction ?? t.facing`
 *   **永遠走 fallback**。那一格是一句「說了但不會發生」的話（第一·五守則）。
 * ⚠️ 同一個推理也適用 `blink{to:"point"}`（`effects/blink.ts::destinationOf` 讀 `ctx.point`，
 *   拿不到就回 null → 整格跳過 = 失敗形態②），所以兩個 kind 一起守。
 *
 * ⛔ 這一條紅了**不要放寬它** —— 要嘛把 castType 改成供得出 point 的
 * （`ground` / `self`+point 那一類），要嘛把 mode 改成誠實的 `forward`。
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DIR = join(REPO, "content/abilities");

/** castType 供不供得出 `ctx.point`。⭐ 從引擎的分派行為推導，⛔ 不是抄一份名單。 */
const CAST_TYPES_WITH_POINT: ReadonlySet<string> = new Set(["ground"]);

interface Hit {
  readonly file: string;
  readonly castType: string;
  readonly what: string;
}

/** 遞迴找出所有需要 `ctx.point` 的 effect（dash toPoint / blink to:point）。 */
function pointDependentEffects(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const n of node) pointDependentEffects(n, out);
    return out;
  }
  if (node === null || typeof node !== "object") return out;
  const o = node as Record<string, unknown>;
  if (o.kind === "dash" && o.mode === "toPoint") out.push('dash mode:"toPoint"');
  if (o.kind === "blink" && o.to === "point") out.push('blink to:"point"');
  for (const v of Object.values(o)) pointDependentEffects(v, out);
  return out;
}

describe("瞬移／位移的 point 相依性（GH#442）", () => {
  it("⛔ 沒有任何技能把「需要施法點」的 effect 掛在拿不到點的 castType 上", () => {
    const broken: Hit[] = [];
    let scanned = 0;
    let pointDependent = 0;
    for (const f of readdirSync(DIR)) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const doc = JSON.parse(readFileSync(join(DIR, f), "utf8")) as Record<string, unknown>;
      scanned++;
      const castType = typeof doc.castType === "string" ? doc.castType : "(none)";
      for (const what of pointDependentEffects(doc.effects)) {
        pointDependent++;
        if (!CAST_TYPES_WITH_POINT.has(castType)) broken.push({ file: f, castType, what });
      }
    }
    // 掃到的量級要合理 —— 夾具壞掉時這一條會先紅，⛔ 不會靜靜地零命中通過
    expect(scanned, "content/abilities 掃不到東西，這條守衛是空的").toBeGreaterThan(300);
    expect(pointDependent, "一支需要施法點的技能都沒有？夾具或偵測壞了").toBeGreaterThan(0);

    expect(
      broken.map((b) => `${b.file}（castType:${b.castType}）${b.what}`),
      "這些 effect 需要 `ctx.point`，而它們的 castType **兩端都不供應** ⇒ " +
        "dash 永遠走 fallback 方向、blink 直接整格跳過（失敗形態②）。\n" +
        "修法：castType 改成 `ground`，或把 mode 改成誠實的 `forward`。⛔ 不要放寬這條守衛。\n" +
        "⚠️⚠️ 上面印的是 content/abilities/<檔名> —— 那 422 份**整個目錄都是產生器的產物**" +
        "(隔離區 chmod 444)。改之前先查是誰的:bash scripts/genguard.sh content/abilities/<那個檔>\n" +
        "  · 91 份由 batch1.py 從 tools/skill-remake/heroes/*.py **整份重建** ⇒ 改 .py;\n" +
        "  · 其餘由 tiers:apply / apconv:build 就地改寫 ⇒ 改來源再 bash scripts/genrun.sh <那一支>。\n" +
        "  ⛔ 直接改出貨 JSON 會被下一次 sync 打回來,而那個「又紅了」看起來像**新的**錯。\n  ",
    ).toEqual([]);
  });
});
