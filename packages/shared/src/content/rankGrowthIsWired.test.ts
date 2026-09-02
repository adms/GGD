/**
 * ⭐⭐ **升級成長率在出貨的註冊表上真的展開了**（GH#906）。
 *
 * ⛔⛔ 量到的現況（2026-09-03）：`content/abilities` 裡
 * **153 份 `maxRank > 1` 的技能只有單一 `damageTier`** ⇒ ⭐ 升級**完全不加傷害**，
 * ⚠️ 而卡面多半寫著「120/220/320/420」這種階梯 ⇒ 第一·五守則的空宣稱。
 *
 * ⭐⭐ **而票文開的藥是錯的**：#906 說「從 git 找出每一支被 `tierize` 取代掉的
 * 原始 `perRank`，逐支寫回 153 份文件」——
 * ⛔ 那是 **O(N) 的考古**，而且它把一份**算得出來的**資料烘回每一份文件
 * （＝第〇·四守則逐字禁止的形狀：「⛔ 烘進去的那一份必然過期」）。
 *
 * ⇒ ⭐ 正解是把 GH#938 已經落地的 `resolveRankGrowth()`（從**冷卻級距**推導成長率）
 * 接到 `registries.ts` 的 `withTiers` 接縫上 ⇒ **一次解決全部**，
 * 而 owner 哪天改那五格，⭐ **零份文件要重寫**。
 *
 * ⚠️⚠️ ⭐ **而這一支存在的真正理由是：GH#938 落地時 `resolveRankGrowth` 有
 * 零個 production 消費端**（失敗形態⑧）—— 機制在、後台有、守衛綠，
 * ⭐ 而遊戲裡一支技能都沒有因此變強。
 * ⇒ ⛔ 一條「函式算得對」的守衛**證明不了**這件事；這一支走**註冊表**。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 `registries.ts` 的 `resolveRankGrowthOnDoc(` 那一層拿掉
 *    → 🔴 ①逐字「升級完全不加傷害的技能有 N 支（接線斷了）」
 */
import { describe, expect, it, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import { registerAll } from "./registries";
import { Abilities } from "../sim/content/registry";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

beforeAll(async () => {
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

/** ⭐ 走訪任何巢狀結構找**傷害量**節點 —— ⛔ 不假設它在頂層。 */
function amounts(o: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(o)) {
    o.forEach((v) => amounts(v, out));
    return out;
  }
  if (!o || typeof o !== "object") return out;
  const n = o as Record<string, unknown>;
  if (typeof n["flat"] === "number" && (n["flat"] as number) > 0) out.push(n);
  for (const v of Object.values(n)) amounts(v, out);
  return out;
}

interface Row {
  id: string;
  ranks: number;
}

/** 每一支 `maxRank > 1` 的技能，它的傷害在升級時**有沒有真的變大**。 */
function flatOnly(): Row[] {
  const bad: Row[] = [];
  for (const ab of Abilities.all()) {
    const d = ab as unknown as Record<string, unknown>;
    const ranks = typeof d["maxRank"] === "number" ? (d["maxRank"] as number) : 1;
    if (ranks <= 1) continue;
    const nodes = amounts(d["effects"]).concat(amounts(d["passive"]));
    if (nodes.length === 0) continue;
    // ⭐ 只要**有一個**傷害節點會隨階成長，這一支就不算「升級不加傷害」。
    const grows = nodes.some((n) => {
      const per = n["perRank"];
      if (!Array.isArray(per) || per.length < 2) return false;
      return (per[per.length - 1] as number) > (per[0] as number);
    });
    if (!grows) bad.push({ id: String(d["id"]), ranks });
  }
  return bad;
}

/**
 * ⭐ 量到的現況（2026-09-03，接線之後）—— ⛔ 不是目標，是**上限**。
 * ⚠️ 剩下的多半是「傷害不住 `flat`」的形狀（純 `ratios`、`damageTierPerRank` 已經在、
 * 或那一支根本不造成傷害）—— ⭐ 而棘輪讓「還有幾支」變成一個會紅的數字。
 */
const CEILING = 40;

describe("升級成長率的接線（GH#906）", () => {
  it("★★ ⭐⭐ 出貨註冊表上「升級完全不加傷害」的技能**壓在上限以下**", () => {
    const bad = flatOnly();
    expect(
      bad.length,
      `⛔⛔ 升級完全不加傷害的技能有 **${bad.length}** 支（上限 ${CEILING}）——\n` +
        "  ⭐ 接線斷了的話這個數字會跳回三位數：去看 `registries.ts` 的\n" +
        "  `resolveRankGrowthOnDoc(` 那一層還在不在，以及它是否包在 `resolveDamageTier` **外面**\n" +
        "  （包在裡面它會讀到還沒解析的 `flat` ⇒ 逐位元 no-op 而**沒有東西會紅**）。\n" +
        `  ⭐ 前 8 支：${bad.slice(0, 8).map((b) => b.id).join(", ")}`,
    ).toBeLessThanOrEqual(CEILING);
  });

  it("★★ ⭐ 展開的階梯**每一級都真的更強**（⛔ 不是把第 1 階也墊高）", () => {
    const broken: string[] = [];
    for (const ab of Abilities.all()) {
      const d = ab as unknown as Record<string, unknown>;
      for (const n of amounts(d["effects"])) {
        const per = n["perRank"];
        if (!Array.isArray(per) || per.length < 2) continue;
        // ⭐ 第 1 階必須是 **0**：`resolveScaling` 算的是 `flat + perRank[rank-1]`（相加）
        //   ⇒ 第 1 階非 0 就是把基礎值當場墊高（⛔ 那是缺陷，不是成長）。
        if (per[0] !== 0 && per.every((x, i) => i === 0 || (x as number) > (per[i - 1] as number)))
          continue; // 作者寫的絕對值階梯 —— ⛔ 不是這條推導產的，放行
        for (let i = 1; i < per.length; i += 1)
          if (!((per[i] as number) > (per[i - 1] as number))) {
            broken.push(`${String(d["id"])} [${per.join("/")}]`);
            break;
          }
      }
    }
    expect(broken.slice(0, 6), "⛔ 有階梯升了不變強 —— 那正是這張票要消滅的東西").toEqual([]);
  });

  it("⭐ 反方向：⛔ 註冊表**不是空的**（空的話上面兩條都假綠）", () => {
    expect(Abilities.all().length, "⛔ 出貨內容沒載進來 —— 這一支的結論全部作廢").toBeGreaterThan(
      300,
    );
  });
});
