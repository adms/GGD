/**
 * normalizerListIsReal.test.ts
 * —— ⭐ **genguard 兩份腳本的正規化器清單，每一個名字都要是真的。**
 *
 * 2026-08-25：兩份清單都掛著 "prose:apply" —— 這個名字不在 package.json
 * （真名 prose:build / prose:check），也不在 sync-io.json 的 38 個步驟裡
 * ⇒ 它**永遠比不中**，而沒有任何測試會紅（owner 點名的「閘自己在說謊」形狀）。
 *
 * 三條斷言（⛔ 清單不抄進測試 —— 那是第〇·四守則說的第二個住處，
 * 一律用 regex 從腳本**原文**抽）：
 *   ① 兩份腳本抽出來的清單**集合相等**（hook 放行而 genguard 擋 = 散文說謊）
 *   ② 每一個名字 ∈ sync-io.json 的 steps[].name（比不中的名字＝幽靈）
 *   ③ 每一個名字 ∈ package.json 的 scripts（訊息叫人跑 `pnpm <名>` 要跑得動）
 *
 * 突變紀錄（2026-08-25 實跑）：往 genguard.sh 的 NORMALIZERS 塞 'prose:apply'
 * → ① 紅（指名兩邊不等）。改回來。⚠️ ②③ 掃的是**兩份清單的聯集** ——
 * 幽靈塞進單邊被 ① 抓，塞進兩邊 ① 綠但聯集必含它 ⇒ ②③ 抓，沒有第三種塞法。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 從腳本原文抽清單；regex 比不到就**大聲失敗**（變數改名不可以讓這條閘靜默變空）。 */
function extract(file: string, re: RegExp): string[] {
  const src = readFileSync(join(REPO, file), "utf8");
  const m = src.match(re);
  expect(m, `${file}: 找不到正規化器清單（變數改名了？連這條閘一起改）`).not.toBeNull();
  return [...m![1]!.matchAll(/["']([^"']+)["']/g)].map((q) => q[1]!).sort();
}

const hookList = extract(
  "scripts/preserve-before-overwrite.py",
  /NORMALIZER_STEPS\s*=\s*frozenset\(\{([^}]*)\}\)/,
);
const genguardList = extract("scripts/genguard.sh", /const NORMALIZERS\s*=\s*new Set\(\[([^\]]*)\]\)/);

const stepNames = new Set(
  (JSON.parse(readFileSync(join(REPO, "tools/parallel-gates/sync-io.json"), "utf8")) as {
    steps: { name: string }[];
  }).steps.map((s) => s.name),
);
const pkgScripts = new Set(
  Object.keys(
    (JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as { scripts: Record<string, string> })
      .scripts,
  ),
);

/** ②③ 掃聯集：幽靈同時塞進兩份清單時 ① 是綠的，聯集仍然抓得到它。 */
const union = [...new Set([...hookList, ...genguardList])].sort();

describe("normalizer 清單裡沒有幽靈名", () => {
  it("① hook 與 genguard.sh 的清單集合相等", () => {
    expect(genguardList, "兩份腳本的裁決必須逐字一致 —— 一邊放行一邊擋就是散文在說謊").toEqual(
      hookList,
    );
    expect(hookList.length, "清單抽出來是空的 —— regex 壞了或清單真的被清空").toBeGreaterThan(0);
  });

  it("② 每一個名字都是 sync-io.json 真的有的步驟", () => {
    const ghosts = union.filter((n) => !stepNames.has(n));
    expect(
      ghosts,
      `幽靈步驟名（不在 sync-io 的 steps[].name ⇒ 永遠比不中）：${ghosts.join(", ")}`,
    ).toEqual([]);
  });

  it("③ 每一個名字都是 package.json 跑得動的 script", () => {
    const dead = hookList.filter((n) => !pkgScripts.has(n));
    expect(
      dead,
      `不在 package.json scripts 的名字（訊息叫人跑 pnpm <名> 會失敗）：${dead.join(", ")}`,
    ).toEqual([]);
  });
});
