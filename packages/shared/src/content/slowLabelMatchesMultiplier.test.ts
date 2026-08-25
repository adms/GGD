/**
 * slowNN 標籤 ↔ 實際減速倍率，必須是同一個數字。
 *
 * `applyStatus` 的**機制**只住在 `moveSpeedMult`（effects/applyStatus.ts 的 `isCc`
 * 是從 moveSpeedMult / root / stun 算的，**從不讀 status 文件**）。`statusId` 只決定
 * 玩家狀態列上那顆圖示的**名字**。兩邊各自可編輯 → 它們會漂開，而漂開的樣子是
 * 「遊戲裡減 50%，圖示寫 Slow (40%)」——⛔ 沒有任何既有守衛會紅，因為每一半都合法。
 *
 * 2026-08-18 量到 25 處（24 支技能 + 老衲的棒子），最極端的是 92-03 消化液掛 slow40
 * 卻只減 20%、四支掛 slow40 卻減 60%。修法是**補齊缺的 slowNN 文件並改指**
 * （owner 選項 A），⛔ 不是改倍率 —— 倍率是設計，標籤只是它的名字。
 *
 * 這條守衛**兩邊都從內容推導**：百分比從 `moveSpeedMult` 算，合法 id 從
 * `content/status-effects/` 的目錄列出來。⛔ 沒有寫死的名單，owner 哪天加一份
 * slow15、或把某支的倍率調掉，守衛自己跟著走。
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
/** 每一個會被 sim 讀到 applyStatus 的集合。status-effects 自己也掃（防手滑貼進去）。 */
const COLLECTIONS = ["abilities", "items", "champions", "augments", "status-effects"] as const;
const SLOW_ID = /^slow(\d+)$/;

type Hit = { file: string; path: string; statusId: string; mult: number };

function walk(node: unknown, path: string, file: string, out: Hit[]): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}/${i}`, file, out));
    return;
  }
  if (node === null || typeof node !== "object") return;
  const rec = node as Record<string, unknown>;
  const sid = rec.statusId;
  const mult = rec.moveSpeedMult;
  if (typeof sid === "string" && SLOW_ID.test(sid) && typeof mult === "number") {
    out.push({ file, path: path || "/", statusId: sid, mult });
  }
  for (const [k, v] of Object.entries(rec)) walk(v, `${path}/${k}`, file, out);
}

function collectHits(): Hit[] {
  const out: Hit[] = [];
  for (const col of COLLECTIONS) {
    const dir = join(CONTENT_DIR, col);
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json") && n !== "_index.json")) {
      walk(JSON.parse(readFileSync(join(dir, f), "utf8")), "", `${col}/${f}`, out);
    }
  }
  return out;
}

/** 出貨的 slow 家族 —— 從目錄推導，⛔ 不是抄來的名單。 */
function shippedSlowIds(): Set<string> {
  return new Set(
    readdirSync(join(CONTENT_DIR, "status-effects"))
      .filter((n) => n.endsWith(".json") && n !== "_index.json")
      .map((n) => n.slice(0, -5))
      .filter((id) => SLOW_ID.test(id)),
  );
}

describe("slowNN 標籤必須等於 moveSpeedMult 換算出來的減速", () => {
  it("每一處 applyStatus 的名字都說出它真的做的事", () => {
    const bad = collectHits()
      .filter((h) => Number(SLOW_ID.exec(h.statusId)![1]) !== Math.round((1 - h.mult) * 100))
      .map((h) => `${h.file}${h.path}: ${h.statusId} 但 moveSpeedMult ${h.mult} = 減 ${Math.round((1 - h.mult) * 100)}%`);
    expect(
      bad,
      `標籤與倍率脫鉤（改 statusId，⛔ 不要改 moveSpeedMult）:\n${bad.join("\n")}\n` +
        `⚠️⚠️ **改之前先查那一份是誰寫的**：bash scripts/genguard.sh content/<上面那個檔>\n` +
        `   · content/abilities/*.json（422 份）與 content/champions/*.json（72 份）**整份都是產物**\n` +
        `     （skillremake:json / tiers:apply / apconv:build 就地重寫，content:build 最後打包）。\n` +
        `     ⇒ 改**來源**（tools/skill-remake/heroes/*.py）再 bash scripts/genrun.sh <step>。\n` +
        `     ⛔ 直接改出貨 JSON 會被下一次 sync 打回來，而那個「又紅了」看起來像**新的**錯。\n` +
        `   · items/augments/status-effects 混著手編檔與產物 —— 逐檔查，⛔ 不要照目錄一概而論。`,
    ).toEqual([]);
  });

  it("指到的 slowNN 文件真的存在（否則狀態列畫不出名字）", () => {
    const shipped = shippedSlowIds();
    const hits = collectHits();
    expect(hits.length).toBeGreaterThan(0); // 掃到 0 筆 = 掃錯路徑，不是全部都對
    const missing = [...new Set(hits.map((h) => h.statusId))].filter((id) => !shipped.has(id));
    expect(missing, `content/status-effects/ 缺這幾份: ${missing.join(", ")}`).toEqual([]);
  });
});
