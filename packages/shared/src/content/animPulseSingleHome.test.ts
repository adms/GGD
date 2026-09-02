/**
 * ⭐⭐ **動作脈衝的詞彙表只有一個住處**（GH#940 的地基）。
 *
 * ⛔⛔ 在此之前 `"attack" | "cast" | "hurt"` 手抄在**五個住處**，
 * 其中只有一個是真的 type ⇒ ⭐ **加一塊動作積木漏改任一處，⛔ 不會有任何 tsc 紅**
 * ——第〇·七守則點名的「**一行接線**」病。
 *
 * ⚠️ 這條守衛刻意**掃出貨原始碼**，⛔ 不是「有沒有 import 那個型別」：
 * 一個新的手抄本會**照樣通過型別檢查**（它結構上等價），
 * ⇒ ⭐ 只有掃字面值才看得見它。
 *
 * ⚠️ ⛔ 而它也**不是**單向的：只掃「有沒有手抄本」漏得掉反方向
 * （詞彙表長出一格而 `PULSE_MS`／`z.enum` 沒跟上）——
 * ⭐ 那一半由 `Record<AnimPulse, number>` 與 `z.enum(ANIM_PULSES)` 讓 **tsc** 接住，
 * 而下面第三條**驗那個保證還在**。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ANIM_PULSES, PULSE_MS, isAnimPulse, ANIM_STATES } from "./animPulse";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** ⭐ 出貨原始碼 —— ⛔ 不含測試檔（一份夾具寫死字面值是合理的）。 */
function shippedSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) shippedSources(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.|\.spec\./.test(name)) out.push(full);
  }
  return out;
}

/**
 * ⭐⭐ 手抄本長什麼樣 —— **一串字面值，其成員集合正好等於某個詞彙表**。
 *
 * ⛔⛔ 第一版是一條「任意三個成員相鄰」的正則，而它**當場報了五個誤報**：
 * `["idle","run","attack","cast","hurt","death"]` 這個**六格狀態表**裡
 * 就含著 `attack,cast,hurt` 三格相鄰 ⇒ 被判成脈衝的手抄本。
 * ⭐ 那不是同一個詞彙表 —— 狀態含 `idle`／`run`／`death`（由移動與死亡驅動），
 * ⛔ 沒有人「pulse 一個 idle」。
 *
 * ⇒ ⭐ 改成**解析整串再比集合**：把相鄰的字面值全部收下來，
 * 只有**集合完全相等**才算手抄本 ⇒ 六格表不會再誤報，
 * ⛔ 而真的三格手抄本一個都跑不掉。
 */
function handCopiesOf(code: string, vocab: readonly string[]): boolean {
  const want = [...vocab].sort().join(",");
  // 連續的 "a" | "b" | "c" 或 "a", "b", "c"（⭐ 分隔符不可混用 —— 混用不是聯集也不是陣列）
  const RUN = /(["'])([a-zA-Z][\w-]*)\1(?:\s*([|,])\s*(["'])([a-zA-Z][\w-]*)\4)+/g;
  for (const m of code.matchAll(RUN)) {
    const members = [...m[0].matchAll(/(["'])([a-zA-Z][\w-]*)\1/g)].map((x) => x[2]!);
    if ([...new Set(members)].sort().join(",") === want) return true;
  }
  return false;
}

describe("動作脈衝的詞彙表只有一個住處（GH#940）", () => {
  it("⭐ 出貨原始碼裡沒有第二份手抄的脈衝聯集", () => {
    const HOME = join(ROOT, "packages/shared/src/content/animPulse.ts");
    const offenders: string[] = [];
    for (const dir of ["apps", "packages"]) {
      for (const file of shippedSources(join(ROOT, dir))) {
        if (file === HOME) continue; // ⭐ 唯一住處自己當然寫得出來
        const src = readFileSync(file, "utf8");
        // ⛔ 註解裡提到它是**允許的**（這份文件自己就到處在講）
        const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        if (handCopiesOf(code, ANIM_PULSES)) offenders.push(relative(ROOT, file));
      }
    }
    expect(
      offenders,
      "⛔ 這些檔又手抄了一份脈衝詞彙表 ⇒ ⭐ 加一塊動作積木時漏改它們**不會有 tsc 紅**。\n" +
        "   ⇒ 改成 `import type { AnimPulse } from \"@ggd/shared/content/animPulse\"`，\n" +
        "     或 `z.enum(ANIM_PULSES)`。",
    ).toEqual([]);
  });

  it("⭐⭐ **狀態格**那一軸也只有一個住處（2026-09-02 剛從六個收成一個）", () => {
    // ⚠️ 這一條與上面那條是**同一個病的上下兩層**：
    //   脈衝（3 格）＝ 外面打進來的一次性事件；狀態（6 格）＝ 狀態機的格子。
    // ⭐ 而狀態那一軸在 2026-09-02 量到手抄在**六個住處**：
    //   `voxel/clips.ts` 的 `CLIP_STATES`（⭐ 唯一住處 —— 它與 `zClipMap` 的
    //   `.strict()` 綁著，那個綁定是承重的）· `AnimationStateMachine.ts` ·
    //   `championModelAudition.ts` · `blizzardOverlay.ts` 行內 ·
    //   `WhirlwindFx.ts` · `apps/editor/preview3d/clips.ts` 的**第二個** `CLIP_STATES`。
    const HOME = join(ROOT, "packages/shared/src/voxel/clips.ts");
    const offenders: string[] = [];
    for (const dir of ["apps", "packages"]) {
      for (const file of shippedSources(join(ROOT, dir))) {
        if (file === HOME) continue;
        const code = readFileSync(file, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        if (handCopiesOf(code, ANIM_STATES)) offenders.push(relative(ROOT, file));
      }
    }
    expect(
      offenders,
      "⛔ 這些檔又手抄了一份**六格狀態**詞彙表 ⇒ 加一格狀態時漏改它們不會有 tsc 紅。\n" +
        '   ⇒ 改成 `import { ANIM_STATES } from "@ggd/shared/content/animPulse"`。',
    ).toEqual([]);
  });

  it("⭐ 儀器：這條掃描抓得到一份**蓄意**的手抄本（⛔ 否則它在量空氣）", () => {
    // ⚠️ 沒有這一條，上面那條在正則寫壞時會**永遠是綠的** ——
    // 而那正是 CLAUDE.md 的形態⑨（一個永遠不會紅的閘）。
    const P = ANIM_PULSES;
    expect(handCopiesOf('kind: "attack" | "cast" | "hurt",', P)).toBe(true);
    expect(handCopiesOf('z.enum(["hurt", "attack", "cast"])', P), "順序換過也要抓得到").toBe(true);
    expect(handCopiesOf('const x = "attack";', P), "⛔ 單獨一個字不該誤報").toBe(false);
    // ⭐⭐ 反誤報：**六格狀態表**含著 attack/cast/hurt 相鄰，⛔ 但它不是脈衝表。
    // ⚠️ 第一版的正則在這一行上回 true，於是報了五個誤報。
    expect(
      handCopiesOf('["idle", "run", "attack", "cast", "hurt", "death"]', P),
      "⛔ 六格狀態表被誤判成脈衝手抄本 —— 兩個詞彙表刻意不同",
    ).toBe(false);
  });

  it("⭐ 加一格詞彙而忘了給窗 ⇒ **tsc 紅**（這條驗那個保證還在）", () => {
    // ⭐ `Record<AnimPulse, number>` 是那個保證的本體。
    // 這裡用執行期把它量出來：兩邊的 key 集合必須逐字相等。
    expect(Object.keys(PULSE_MS).sort()).toEqual([...ANIM_PULSES].sort());
    for (const p of ANIM_PULSES) {
      expect(PULSE_MS[p], `${p} 沒有剪輯窗`).toBeGreaterThan(0);
    }
  });

  it("⭐ 執行期收窄跟著詞彙表走（⛔ 不是另一份 if）", () => {
    for (const p of ANIM_PULSES) expect(isAnimPulse(p)).toBe(true);
    expect(isAnimPulse("dodge"), "⛔ 還沒進詞彙表的積木不可以被放行").toBe(false);
    expect(isAnimPulse(undefined)).toBe(false);
  });
});
