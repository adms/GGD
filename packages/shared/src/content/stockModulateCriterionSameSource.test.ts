/**
 * 🔗 **抽取器的 modulate 恆等判準 ＝ 判準⑤ 本人**（GH#711）。
 *
 * ⚠️⚠️ 為什麼要這一條：`tools/w3x-import/extract_stock_vfx.py` 曾經**自己**判
 * 「這支 modulate emitter 是不是恆等」（`WHITE_RGB_MIN = 0.98`，只看文件顏色）。
 * 那份實作與判準⑤ 講的是同一件事，⛔ 但它是第二份 —— 而第二份會漂，
 * **漂掉的那一份不會紅**。它實際造成的：`MarkOfChaosTarget` 的
 * `BlizParticle05white02` / `white03` 被當成「逐位元的零」丟掉，而它們真正的
 * δ = **0.189**（≈ 48× 門檻，看得見的暗煙），於是出貨的 `p00..p03` 編號
 * 建立在一個錯誤的刪除之上 —— 而執行期的窗**固定只有 3 格**。
 *
 * ⭐ 這一條驗的是**同源**，而且是**跑真的東西**驗（⛔ 不是 grep 字串，
 * CLAUDE.md 失敗形態⑥）：
 *   ① 把出貨的兩份 white 文件餵進抽取器實際呼叫的那支 CLI（`modulate_oracle.ts`），
 *      拿回來的 δ 與句子，必須與**這個行程裡** import 判準⑤ 算出來的**逐位元相同**；
 *   ② 那兩支 emitter 必須**真的在出貨樹裡**（＝抽取器沒有再把它們丟掉）。
 *
 * 🧬 突變（做過）：把 `WHITE_RGB_MIN = 0.98` 那條規則加回
 * `extract_stock_vfx.py::invisibility_reasons` 再重跑抽取器 ⇒ 兩份 white 文件消失
 * ⇒ 第②條紅並指名它們。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MODULATE_IDENTITY_DELTA,
  decodePng,
  modulateIdentityReason,
  modulateMaxDelta,
  texStatsFromRgba,
  type Rgba,
} from "./modulateIdentity";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const VFX_DIR = join(REPO, "content", "vfx");
const TSX = join(REPO, "node_modules", ".bin", "tsx");
const ORACLE = join(REPO, "tools", "w3x-import", "modulate_oracle.ts");
const EXTRACTOR = join(REPO, "tools", "w3x-import", "extract_stock_vfx.py");

interface Doc {
  id: string;
  blendMode?: string;
  texture?: string;
  color: { start: Rgba; end: Rgba };
  colorStops?: readonly (readonly [number, Rgba])[];
}

const stops = (d: Doc): Rgba[] =>
  d.colorStops?.length ? d.colorStops.map((s) => s[1]) : [d.color.start, d.color.end];

const shippedModulateDocs = (): Doc[] =>
  readdirSync(VFX_DIR)
    .filter((f) => f.startsWith("fx.w3x.stock.") && f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(VFX_DIR, f), "utf8")) as Doc)
    .filter((d) => d.blendMode === "modulate")
    .sort((a, b) => a.id.localeCompare(b.id));

describe("🔗 抽取器的恆等判準與判準⑤ 同源", () => {
  it("⭐ 跑真的 oracle：出貨 modulate 文件的 δ 與判準⑤ 逐位元相同", () => {
    const docs = shippedModulateDocs();
    // ⛔ 零份掃到 = 這條守衛在對空氣說話
    expect(docs.length, "一份 modulate 的 fx.w3x.stock.* 都沒掃到 —— 守衛失效了").toBeGreaterThan(
      0,
    );
    expect(existsSync(TSX), `${TSX} 不存在 —— 先 pnpm install`).toBe(true);

    const queries = docs.map((d) => ({
      texturePath: join(REPO, "content", ...d.texture!.split("/")),
      colors: stops(d),
    }));
    const proc = spawnSync(TSX, [ORACLE], {
      input: JSON.stringify({ queries }),
      encoding: "utf8",
      cwd: REPO,
    });
    expect(proc.status, `modulate_oracle 非零離開: ${proc.stderr}`).toBe(0);
    const got = JSON.parse(proc.stdout) as {
      threshold: number;
      verdicts: { delta: number; reason: string | null }[];
    };

    // 門檻與逐份的 δ／句子，兩邊必須是**同一份程式**算出來的
    expect(got.threshold).toBe(MODULATE_IDENTITY_DELTA);
    const mine = docs.map((d) => {
      const tex = texStatsFromRgba(
        decodePng(readFileSync(join(REPO, "content", ...d.texture!.split("/")))).rgba,
      );
      return { delta: modulateMaxDelta(stops(d), tex), reason: modulateIdentityReason(stops(d), tex) };
    });
    expect(got.verdicts).toEqual(mine);
  });

  it("⛔ 那兩支被誤丟的 emitter 現在真的在出貨樹裡（GH#711 的承重斷言）", () => {
    const ids = shippedModulateDocs().map((d) => d.id);
    for (const want of [
      "fx.w3x.stock.markofchaostarget.p03", // BlizParticle05white03
      "fx.w3x.stock.markofchaostarget.p04", // BlizParticle05white02
    ]) {
      expect(
        ids,
        `${want} 不在出貨樹裡 —— 抽取器又在用「只看文件顏色」的恆等判準把它丟掉了。` +
          "修在來源側（tools/w3x-import/extract_stock_vfx.py）再重跑，⛔ 不要改這條測試。",
      ).toContain(want);
    }
  });

  it("⛔ 抽取器不可以再長出自己的恆等門檻（第二住處偵測）", () => {
    const src = readFileSync(EXTRACTOR, "utf8");
    const offending = src
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("#") && /WHITE_RGB_MIN\s*=/.test(l));
    expect(
      offending,
      "extract_stock_vfx.py 又定義了自己的 modulate 恆等門檻。" +
        "判準只有一個住處：packages/shared/src/content/modulateIdentity.ts（經 modulate_oracle.ts）。",
    ).toEqual([]);
  });
});
