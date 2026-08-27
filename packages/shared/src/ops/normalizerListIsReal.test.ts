/**
 * normalizerListIsReal.test.ts
 * —— ⭐ **正規化器清單裡的每一個名字都要是真的，而且只准有一份。**
 *
 * 2026-08-25：兩份清單都掛著 "prose:apply" —— 這個名字不在 package.json
 * （真名 prose:build / prose:check），也不在 sync-io.json 的步驟裡
 * ⇒ 它**永遠比不中**，而沒有任何測試會紅（owner 點名的「閘自己在說謊」形狀）。
 *
 * ⭐⭐ 2026-08-27（GH#707）**清單搬進 `tools/parallel-gates/normalizers.json`**。
 * 在此之前它有兩份手寫副本（genguard.sh + hook），而這條閘只比對那兩份 ——
 * 於是**第三個消費端**（`scripts/product-quarantine.sh`）連這個概念都沒有，
 * 全綠地把 387 份手編檔 chmod 444。⇒ 第〇·四守則：一份知識一個住處。
 * 這條閘的問題因此從「兩份一不一樣」變成「**有沒有人又自己抄了一份**」。
 *
 * 四條斷言（⛔ 清單不抄進測試 —— 那會是第二個住處）：
 *   ① 唯一住處讀得到，而且非空；每一格帶得出**能被反駁的理由**
 *   ② 每一個名字 ∈ sync-io.json 的 steps[].name（比不中的名字＝幽靈）
 *   ③ 每一個名字 ∈ package.json 的 scripts（訊息叫人跑 `pnpm <名>` 要跑得動）
 *   ④ ⭐ 三個消費端**都引用那份 JSON**，而且⛔ 沒有人自己硬寫一份清單
 *
 * 突變紀錄（2026-08-27 實跑）：往 normalizers.json 塞 {"step":"prose:apply"}
 * → ②③ 同時紅並指名它。改回來。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (f: string): string => readFileSync(join(REPO, f), "utf8");

/** ⭐ 三個消費端 —— 一個都不可以自己抄清單。 */
const CONSUMERS = [
  "scripts/genguard.sh",
  "scripts/preserve-before-overwrite.py",
  "scripts/product-quarantine.sh",
] as const;

const home = JSON.parse(read("tools/parallel-gates/normalizers.json")) as {
  normalizers: { step: string; reason?: string }[];
};
const names = home.normalizers.map((n) => n.step).sort();

const stepNames = new Set(
  (JSON.parse(read("tools/parallel-gates/sync-io.json")) as { steps: { name: string }[] }).steps.map(
    (s) => s.name,
  ),
);
const pkgScripts = new Set(
  Object.keys((JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts),
);

describe("normalizer 清單：一個住處、沒有幽靈名", () => {
  it("① 唯一住處非空，而且每一格寫得出理由", () => {
    expect(names.length, "清單是空的 —— 那會讓每一份被認領的檔都判成 AUTHOR").toBeGreaterThan(0);
    const noReason = home.normalizers.filter((n) => (n.reason ?? "").trim().length < 20);
    expect(
      noReason.map((n) => n.step),
      "⛔ 沒有理由的豁免＝下一輪的我會把它當成證據（CLAUDE.md：要一個能被反駁的理由）",
    ).toEqual([]);
  });

  it("② 每一個名字都是 sync-io.json 真的有的步驟", () => {
    const ghosts = names.filter((n) => !stepNames.has(n));
    expect(ghosts, `幽靈步驟名（不在 sync-io 的 steps[].name ⇒ 永遠比不中）：${ghosts.join(", ")}`)
      .toEqual([]);
  });

  it("③ 每一個名字都是 package.json 跑得動的 script", () => {
    const dead = names.filter((n) => !pkgScripts.has(n));
    expect(dead, `不在 package.json scripts 的名字（訊息叫人跑 pnpm <名> 會失敗）：${dead.join(", ")}`)
      .toEqual([]);
  });

  it("④ 三個消費端都讀那份 JSON，⛔ 沒有人自己硬寫一份", () => {
    for (const f of CONSUMERS) {
      const src = read(f);
      expect(src, `${f} 沒有引用唯一住處 —— 它的裁決會與另外兩支漂開（GH#707 的形狀）`).toContain(
        "parallel-gates/normalizers.json",
      );
      // ⭐ 硬寫的副本長什麼樣：同一行裡出現 ≥2 個已知的步驟名字面值。
      const hardcoded = src
        .split("\n")
        .filter((l) => !l.includes("normalizers.json"))
        .filter((l) => names.filter((n) => l.includes(`"${n}"`) || l.includes(`'${n}'`)).length >= 2);
      expect(hardcoded, `${f} 疑似又硬寫了一份清單：\n${hardcoded.join("\n")}`).toEqual([]);
    }
  });
});
