/**
 * GH#682/#683 —— 詠唱>1秒清單 ＋ 移速加成清單的薄守衛（體驗層，⛔ 不開對抗輪）。
 *
 * 三個方向，全部用**掃出來的動態樣本**，⛔ 不硬編任何技能 id：
 *   ① 詠唱清單非空，且含一支磁碟上就 >門檻 的技能（門檻突變 1→999 ⇒ 清單空 ⇒ 紅）
 *   ② 模板技守衛：ms 修飾**只**住在 `template.params` 裡的技能（生 JSON 掃不到）
 *      必須出現在清單裡 —— 產生器改成自己 parse 生檔（漏掉模板展開）⇒ 紅
 *   ③ speedlists:check 綠 —— 三份產物（JSON + 兩份 md）與產生器逐位元組一致
 *
 * 突變驗證（一批一條，最承重）：gen.mjs 門檻 >1 改 >999 → build → ①③ 紅 → 還原。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import lists from "../../../tools/skill-lists/lists.json";

const TAG = "adminui-skill-lists";
const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const ABILITIES = join(REPO, "content/abilities");

const rawDocs = (): Record<string, unknown>[] =>
  readdirSync(ABILITIES)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(join(ABILITIES, f), "utf8")) as Record<string, unknown>);

/** node 樹裡有沒有正向 ms modifier（`skipTemplate` = 剝掉 template 子樹再掃）。 */
const hasPositiveMs = (node: unknown, skipTemplate: boolean): boolean => {
  if (node === null || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some((v) => hasPositiveMs(v, skipTemplate));
  const o = node as Record<string, unknown>;
  if (o["stat"] === "ms" && typeof o["value"] === "number" && (o["value"] as number) > 0 &&
      ["flat", "pctAdd", "pctMult"].includes(o["op"] as string)) return true;
  return Object.entries(o).some(
    ([k, v]) => !(skipTemplate && k === "template") && hasPositiveMs(v, skipTemplate),
  );
};

describe("技能清單（GH#682/#683）", () => {
  it("① 詠唱清單非空，且含磁碟上就超過門檻的技能（動態樣本）", () => {
    cover(TAG);
    expect(lists.cast.length, "詠唱清單是空的 —— 門檻或掃描器壞了").toBeGreaterThan(0);
    const diskOver = new Set(
      rawDocs()
        .filter((d) => typeof d["castTimeSec"] === "number" && (d["castTimeSec"] as number) > lists.castThresholdSec)
        .map((d) => d["id"]),
    );
    expect(diskOver.size, "磁碟上一支 >門檻 的技能都掃不到 —— 讀取器壞了").toBeGreaterThan(0);
    const listed = lists.cast.filter((r) => diskOver.has(r.id));
    expect(listed.length, "磁碟上明明有超過門檻的技能，清單卻一支都沒收").toBeGreaterThan(0);
  });

  it("② 模板技的 ms 修飾要被算到（掃描器必須走展開後的註冊表，⛔ 不是生 JSON）", () => {
    cover(TAG);
    // 動態樣本：ms 修飾**只**住在 template.params 裡的技能 —— 生 JSON（剝掉
    // template 子樹）掃不到它，出貨行為卻有（expandStack 在註冊時展開）。
    const candidates = rawDocs()
      .filter((d) => d["template"] !== undefined && d["template"] !== null)
      .filter((d) => hasPositiveMs(d["template"], false) && !hasPositiveMs(d, true))
      .map((d) => d["id"] as string);
    if (candidates.length === 0) return; // 今天的內容量不到這個前提 ⇒ 沒東西可斷言
    const listed = candidates.filter((id) => lists.ms.some((r) => r.id === id));
    expect(
      listed.length,
      `這些技能的移速加成只寫在模板參數裡（${candidates.join(", ")}），清單卻一支都沒收 —— 掃描器漏掉模板展開`,
    ).toBeGreaterThan(0);
  });

  it("③ speedlists:check 綠 —— JSON 與兩份 md 和產生器逐位元組一致", () => {
    cover(TAG);
    // 過期時 execFileSync 擲非零，錯誤訊息裡有哪一份過期與重生成指令。
    execFileSync("pnpm", ["-s", "speedlists:check"], { cwd: REPO, stdio: "pipe", timeout: 240_000 });
  });
});
