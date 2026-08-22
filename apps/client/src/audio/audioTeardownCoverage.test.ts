/**
 * GH#584 —— **「進到房間是乾淨的開始」不可以是一句散文。**
 *
 * > owner 2026-08-22:「每次進到房間應該是**乾淨的開始**才對」
 * > owner 2026-08-23:「你**寧願多次清理乾淨開始回合 也不要漏清到**」
 *
 * `main.tsx` 的 `startMatch()` 在 GH#584 之前對音訊**一行都沒有**,而既有守衛全綠的
 * 理由很單純:**沒有任何東西在驗一個不存在的函式** —— E3 那一格連個具名的落點都沒有。
 *
 * ⭐ 所以這裡要的不是一條斷言,是**共用清單 ＋ 閘**（GH#560 / 第零守則⑨的形狀）:
 * `audio/` 與 `beat/` 底下**每一個 export 出去的單例**,只要它的 class 有
 * `reset()` / `cancel()` / `dispose()`,就必須要嘛出現在 `resetAudioForNewMatch()`
 * 的原始碼裡,要嘛在下面的豁免表裡**帶著一個能被反駁的理由**。
 * 新增第十個會發聲的單例而不做選擇 → 紅,而且訊息指名它。
 *
 * ⚠️ 為什麼掃原始碼而不是跑行為(失敗形態⑥):這條驗的是**清單的完整性** ——
 * 「有沒有漏掉一層」本來就是一個關於**程式碼文字**的性質,⛔ 不是任何一次執行看得到的
 * 東西(漏掉的那一層在執行時什麼都不做,而那正是它看起來正常的原因)。
 * 每一層自己的行為由它自己的守衛驗(`AudioSystem.test.ts` / `nameVoice.test.ts`)。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { stripComments } from "@ggd/shared/testkit/stripComments";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIRS = [HERE, join(HERE, "../beat")];

/**
 * 豁免 = 「這個單例身上**沒有任何東西**會在新房間裡被聽到或看到」。
 * ⛔ 理由要具體到能被反駁；⛔ 不接受「它跟音訊無關」這種同義反覆。
 */
const NOT_MATCH_SCOPED: Record<string, string> = {
  audioSettings:
    "⛔ **玩家自己的**音量／靜音設定(持久化的)。每次進房間 reset 它 = 把玩家調好的音量" +
    "打回預設值 —— 那是缺陷,不是清理。",
  contextualVoice:
    "它的播放全部走 `audioSystem.playClip`,已經被 `stopAllVoices()` 掐掉;in-flight 的" +
    "去重登記由 `playClip` 的 `onEnded` 釋放(停掉／取消解碼**兩條路**都會 fire)。" +
    "⛔ 叫它的 `reset()` 會連 voice pack 快取一起丟掉 ⇒ 新房間第一句語音白白多一次網路往返。",
  championVoice:
    "同上(走 `playClip`)。它的 `reset()` 只丟 manifest/pack 快取與選角冷卻," +
    "⛔ 沒有任何**正在響**的東西住在裡面 —— 選角語音也不會跨房間存活。",
  shopPerformVoice:
    "它自己不播任何東西(轉發給 `contextualVoice`),`reset()` 清的是「上一句講了哪一位」" +
    "這個**輪替記憶** —— 保留它反而讓新房間第一次進商店不會重複上一場的同一句。",
};

/** `audio/` + `beat/` 底下的出貨模組（⛔ 不含測試與 testkit）。 */
function shippedSources(): Map<string, string> {
  const out = new Map<string, string>();
  for (const dir of DIRS) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".ts") || f.includes(".test.") || f.includes(".testkit.")) continue;
      out.set(join(dir, f), readFileSync(join(dir, f), "utf8"));
    }
  }
  return out;
}

/** 這個 class 有沒有一支收尾方法（`reset` / `cancel` / `dispose`）。 */
function hasTeardown(cls: string, sources: Map<string, string>): boolean {
  for (const src of sources.values()) {
    const at = src.search(new RegExp(`class ${cls}\\b`));
    if (at < 0) continue;
    return /\n {2}(reset|cancel|dispose)\s*\(/.test(src.slice(at));
  }
  return false;
}

describe("GH#584 進房間的音訊清場涵蓋每一層 (audio-teardown-coverage)", () => {
  it("每個會發聲的單例，不是被 resetAudioForNewMatch 收了就是列在 NOT_MATCH_SCOPED", () => {
    cover("audio-teardown-coverage");
    const sources = shippedSources();

    const index = stripComments(readFileSync(join(HERE, "index.ts"), "utf8"));
    const at = index.indexOf("export function resetAudioForNewMatch");
    expect(at, "audio/index.ts 找不到 resetAudioForNewMatch —— 錨點被改名了").toBeGreaterThan(0);
    const open = index.indexOf("{", at);
    let depth = 0;
    let body = "";
    for (let i = open; i < index.length; i++) {
      if (index[i] === "{") depth++;
      else if (index[i] === "}" && --depth === 0) {
        body = index.slice(open + 1, i);
        break;
      }
    }
    expect(body.length, "resetAudioForNewMatch 的大括號沒配對").toBeGreaterThan(0);

    const singletons: string[] = [];
    for (const src of sources.values()) {
      for (const m of src.matchAll(/export const (\w+) = new (\w+)\(/g)) {
        if (hasTeardown(m[2]!, sources)) singletons.push(m[1]!);
      }
    }
    expect(singletons.length, "一個單例都沒抓到 —— 抽取壞了").toBeGreaterThan(5);

    const missed = singletons.filter(
      (n) => !new RegExp(`\\b${n}\\.`).test(body) && !(n in NOT_MATCH_SCOPED),
    );
    expect(
      missed,
      `這幾層在新房間裡收不到 —— 在 resetAudioForNewMatch 裡叫它們的收尾方法，` +
        `或連同**能被反駁的理由**加進 NOT_MATCH_SCOPED：${missed.join(", ")}`,
    ).toEqual([]);
  });
});
