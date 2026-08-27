/**
 * ⏱ **`trace.mjs` 的解析層**（GH#804/#810）—— 鏈的每一節⛔ 不一定是「pnpm <script 名>」。
 *
 * 舊版把每一節 `replace(/^pnpm\s+/,"")` 之後 `spawn("pnpm",[那一節])`。
 * 它只對 `skills:sync` 成立（38 節**剛好**全是 `pnpm x:y`），對另外兩種形狀
 * **靜默地量出一個假的答案**（`ok:false · writes:[]`）——⚠️ 而 trace 的收尾訊息
 * 還說「沙盒裡紅了 N 支(⛔ 不影響 I/O 量測)」，把人指去查權限與探針。
 *
 * ⭐ 這條閘用**出貨的 package.json** 當母體（⛔ 不是自造字串）：
 * 每一節都要解析成一個**跑得動**的東西，⛔ 一個幽靈 script 名都不准有。
 *
 * ⚠️ 載 `tools/**` 的 .mjs 一律用 `import.meta.url` 當 base ——
 * `file://${join(REPO,"x")}` 在 ship:check 的 vitest root 底下會解析成絕對根而 fail。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const { parseChain, ghostSteps } = await import(
  new URL("../../../../tools/parallel-gates/chainSteps.mjs", import.meta.url).href
);
const scripts = (JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
}).scripts;

describe("trace.mjs 的鏈解析：三種形狀都要跑得動", () => {
  it("① 出貨的每一支 script，每一節都解析成跑得動的東西（⛔ 零幽靈）", () => {
    const broken: string[] = [];
    for (const [name, chain] of Object.entries(scripts)) {
      const ghosts = ghostSteps(parseChain(chain, name), scripts);
      if (ghosts.length) broken.push(`${name} ⇒ ${ghosts.join(", ")}`);
    }
    expect(broken, "這些節會被 spawn 成不存在的 script ⇒ 量出 ok:false · writes:[] 的假答案")
      .toEqual([]);
  });

  it("② 葉子（沒有 pnpm 前綴）⇒ 跑 `pnpm <SCRIPT>` 本人，⛔ 不是把它拆開", () => {
    const [s] = parseChain("tsx apps/client/x.ts", "vfxfam:build");
    // ⛔ 拆開自己跑 = 把 pnpm 架 node_modules/.bin 的工作重做一遍 ⇒ 實測 exit 127
    expect(s, "葉子被拆成 bash ⇒ tsx 不在 PATH 上（第一版就是這樣 127 的）").toEqual({
      label: "vfxfam:build",
      cmd: "pnpm",
      args: ["vfxfam:build"],
      raw: false,
    });
  });

  it("③ 多 token 的一節要切成 argv，⛔ 不是整串當一個 script 名", () => {
    const [s] = parseChain("pnpm --filter @ggd/shared content:build && pnpm spec:build", "content:build");
    expect(s.args, "整串當成一個名字 ⇒ pnpm Command not found").toEqual([
      "--filter",
      "@ggd/shared",
      "content:build",
    ]);
    expect(s.label, "標籤要取得出那個帶冒號的步驟名").toBe("content:build");
  });
});
