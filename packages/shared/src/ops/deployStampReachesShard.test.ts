/**
 * ⭐ GH#949 —— **版本戳要真的到得了 game shard。**
 *
 * ⛔⛔ 在此之前它沒有：`docker/compose.yaml` 的
 * `GGD_BUILD_STAMP: "${GGD_BUILD_STAMP:-}"` 讀的是 **`up` 那一刻的 shell env**，
 * ⛔ 不是 build arg —— 而兩支部署腳本都**只在 `build` 那一行**給了 stamp。
 * ⇒ `buildStamp()` 的 ① 落空 → 容器裡沒有 checkout（②落空）→ ⭐ **`"dev"`**。
 *
 * ⚠️ 而它的代價是一條**靜默死掉的柵欄**：同一顆值寫進每一份錄影的 header，
 * 而 `Player.ts` 拿它比對 ⇒ 兩份都是 `"dev"` ⇒ **任兩份永遠判「相同版本」**。
 *
 * ⭐ **這條守衛為什麼讀腳本的文字**：那兩行是 shell，
 * ⛔ 沒有任何 tsc / vitest 會因為漏掉一個環境變數而紅。
 * ⚠️ 而它刻意**不是**「有沒有提到 `GGD_BUILD_STAMP`」——
 * 那條永遠綠（兩支腳本的註解裡就有一堆），⇒ 它問的是
 * **`up` 那一行自己帶不帶**，以及**帶的是不是同一顆變數**（第〇·四守則）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");

/** ⭐ 只留**真的會執行**的行 —— ⛔ 註解裡的 `up -d` 不算。 */
function codeLines(src: string): string[] {
  return src
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
}

/** 每一行真的會跑 `compose … up -d` 的（⛔ 不含 `--scale caddy=0` 那種輔助路徑）。 */
function upLines(src: string): string[] {
  return codeLines(src).filter((l) => /docker compose .*\bup -d\b/.test(l));
}

describe("部署的版本戳到得了 game shard（GH#949）", () => {
  it("⭐ mini-deploy 的 `up -d` 帶著版本戳，⛔ 而且是 build 用的**同一顆變數**", () => {
    const src = read("scripts/mini-deploy.sh");

    // ⭐ 儀器：先確認我們真的找到了那兩行。⛔ 找不到 ⇒ 這條在量空氣。
    const build = codeLines(src).filter((l) => /docker compose .*\bbuild\b/.test(l));
    expect(build.length, "⛔ 找不到 `docker compose … build` —— 這條守衛在量空氣").toBe(1);

    // build 那一行用哪個變數？
    const m = /GGD_BUILD_STAMP='\$(\w+)'/.exec(build[0]!);
    expect(m, `⛔ build 那一行沒有帶 GGD_BUILD_STAMP：\n${build[0]}`).not.toBeNull();
    const varName = m![1]!;

    // ⭐ deploy 那條路的 `up -d` 必須帶**同一顆**。
    const ups = upLines(src);
    expect(ups.length, "⛔ 一行 `up -d` 都沒有").toBeGreaterThan(0);
    const deployUp = ups.filter((l) => /compose\.family\.yaml/.test(l));
    expect(deployUp.length, "⛔ 找不到 deploy 那條路的 up").toBeGreaterThan(0);
    for (const line of deployUp) {
      expect(
        line.includes(`GGD_BUILD_STAMP='$${varName}'`),
        "⛔ 這一行 `up -d` 沒有帶 build 用的同一顆版本戳 ⇒ game 容器的 " +
          "`process.env.GGD_BUILD_STAMP` 會是空的 ⇒ buildStamp() 退回 \"dev\" " +
          `⇒ ⭐ 錄影的版本柵欄靜默關閉。\n   那一行：${line}`,
      ).toBe(true);
    }
  });

  it("⭐ host-deploy 的**每一行** `up -d` 之前都有人設過版本戳", () => {
    const src = read("scripts/host-deploy.sh");
    const lines = codeLines(src);

    // ⭐⭐ 這條**刻意不錨在「第一個 export」上**。
    // ⚠️ 第一版就是那樣寫的，而它當場量錯：修好回滾分支之後那裡**多了一個
    // export**，於是 `findIndex` 錨到新的那一個 ⇒ 它前面自然沒有 `up -d`
    // ⇒ 守衛變成「量空氣」而且**看起來是綠的**。
    // ⇒ ⭐ 改成問**關係**：每一行 `up -d`，它**之前**有沒有人設過這顆變數。
    //   ⛔ 不是「腳本裡有沒有 export」（那條永遠綠）。
    const ups = lines
      .map((l, i) => [l, i] as const)
      .filter(([l]) => /docker compose .*\bup -d\b/.test(l));
    expect(ups.length, "⛔ 一行 `up -d` 都沒有 —— 這條在量空氣").toBeGreaterThan(1);

    for (const [line, i] of ups) {
      const set = lines
        .slice(0, i)
        .some((l) => /^\s*(export\s+)?GGD_BUILD_STAMP=/.test(l));
      expect(
        set,
        "⛔ 這一行 `up -d` 之前**沒有人設過** GGD_BUILD_STAMP ⇒ 那條路上的 " +
          "game shard 拿不到版本戳 ⇒ buildStamp() 退回 \"dev\" " +
          "⇒ ⭐ 錄影的版本柵欄靜默關閉。\n" +
          `   那一行（第 ${i} 條可執行行）：${line}`,
      ).toBe(true);
    }
  });
});
