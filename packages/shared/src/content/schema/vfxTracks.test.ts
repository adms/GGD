/**
 * ⭐⭐ GH#761 AC③ —— **KP2\* 軌進得了 `vfx@1`**（⛔ 不再是只有程式碰得到的角落）。
 *
 * ── ⛔ 在此之前 ────────────────────────────────────────────────────────────
 * 這幾條軌**已經被出貨的執行期驅動**（`W3xEmitterRig` 每幀把 `emissionTrack`
 * 重播到 `ps.emitRate`），⛔ 而它們的型別住在**渲染層的 TS**
 * ⇒ ⭐ `vfx@1` 表達不了 ⇒ **編輯器碰不到**。
 * ⚠️ `w3xEmitter.ts` 的對照表逐字寫著「`KP2*` tracks — **NO equivalent**」。
 *
 * ⇒ ⭐ 這正是 main 的職責①：「引擎的每一個功能都可 JSON 操作 ——
 *   ⛔ 沒有只能改程式才碰得到的角落」。
 *
 * ── ⭐ 形狀必須與渲染層**逐欄一致** ──────────────────────────────────────
 * ⛔ 形狀一分岔，schema 就會收下一份執行期讀不懂的軌 ——
 * 而那是「編輯器做得出來、上線就是死的」那一族。
 *
 * MUTATION LOG：schema 的 `tracks` 拿掉 → ①紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zVfxDoc } from "./vfx";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");

/** 一份最小的合法 `vfx@1`（⭐ 從出貨內容抄一份，⛔ 不自己編）。 */
const shipped = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(REPO, "content/vfx/fx.prim.physical.slash.json"), "utf8")) as Record<
    string,
    unknown
  >;

describe("GH#761 AC③ KP2* 軌進得了 vfx@1", () => {
  it("★ ⭐ 帶一條 `emission` 軌的文件**通得過**", () => {
    const doc = { ...shipped(), tracks: { emission: { keys: [[0, 0], [500, 60], [1000, 0]] } } };
    const r = zVfxDoc.safeParse(doc);
    if (!r.success) {
      expect.fail(`⛔ 帶軌的文件被拒了：${r.error.issues.map((i) => i.path.join(".") + ": " + i.message).join(" | ")}`);
    }
  });

  it("★ ⭐ 缺席 ＝ **今天的行為**（⛔ 599 份出貨檔一份都沒有它）", () => {
    const r = zVfxDoc.safeParse(shipped());
    expect(r.success, "⛔ 沒有 tracks 的出貨檔被拒 ⇒ 這一格必填了").toBe(true);
  });

  it("★ ⭐ 形狀與渲染層**逐欄一致**（⛔ 分岔＝schema 收下執行期讀不懂的軌）", () => {
    const rt = readFileSync(join(REPO, "apps/client/src/render/vfx/w3xEmitter.ts"), "utf8");
    // 渲染層的 `W3xFloatTrack` 三個欄位
    for (const f of ["keys", "interp", "globalSeq"]) {
      expect(rt, `⛔ 渲染層沒有 ${f} —— 形狀漂了`).toContain(f);
    }
    const sc = readFileSync(join(REPO, "packages/shared/src/content/schema/vfx.ts"), "utf8");
    for (const f of ["keys", "interp", "globalSeq"]) {
      expect(sc, `⛔ schema 少了 ${f}`).toContain(f);
    }
  });

  it("⭐ 那句「NO equivalent」不在了（⛔ 一句過期的散文會讓下一輪以為做不到）", () => {
    const rt = readFileSync(join(REPO, "apps/client/src/render/vfx/w3xEmitter.ts"), "utf8");
    const line = rt.split("\n").find((l) => l.includes("`KP2*` tracks"));
    expect(line, "⛔ 對照表那一列不見了").toBeDefined();
    expect(line, "⛔ 它還在說 NO equivalent").not.toContain("NO equivalent");
  });

  it("⭐ 上限 256 個 key（⛔ 超過那個量的「動畫」該是兩個特效）", () => {
    const keys = Array.from({ length: 300 }, (_, i) => [i, 1] as [number, number]);
    expect(zVfxDoc.safeParse({ ...shipped(), tracks: { emission: { keys } } }).success).toBe(false);
  });
});
