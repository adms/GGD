/**
 * ⭐⭐ GH#1025 的**承重**守衛 —— 驗收案例第 4 條逐字：
 *
 *   **「按下通過並發布之後，那隻英雄在下一場（社群）房裡選得到。」**
 *
 * ⚠️ ⭐ 它刻意寫成**跨越整條路**的一句話（票文 [思考策略]）：今天這條路上的
 * 每一段都「有東西」（有審核頁 · 有覆蓋層 · 有匯流排 · 有房間快照），
 * ⛔ 而 2026-09-07 之前**接縫上沒有人站**（失敗形態⑪）。
 *
 * ⭐ 而且它跑的是**出貨的那條路**（⛔ 不是自造 payload —— 失敗形態⑤）：
 * 真的 `content/` 樹 · 真的 `ContentLoader` · 真的 `registerAll` ·
 * 真的 `MatchController.selectChampion`（那正是伺服器對選角的權威閘）。
 *
 * MUTATION LOG（落地前跑過）：
 *   - `applyOverlayAdditions` 的 `registerAll(result.store)` 拿掉 → 🔴
 *     （「發布之後新開的房選得到」）
 *   - 「把開機那一份原封寫回去」那一行（`restore(...)`）拿掉 → 🔴
 *     （「修改既有內容不會被熱套用」）⇒ ⭐ 那一行就是「對局不中途換版」。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { Champions } from "@ggd/shared/sim/content/registry";
import { FsContentSource } from "@ggd/shared/content/node";
import { asSeatId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "../match/MatchController";
import { DEFAULT_ARENA_RULES } from "../match/arenaRules";
import { Whitelist } from "../curation/whitelist";
import { applyOverlayAdditions } from "./contentHotApply";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const FAST = { champSelectTicks: 5, intermissionTicks: 40, combatMaxTicks: 1200, resolutionTicks: 5 };
const NEW_ID = "ugc-hot-apply-hero";
const seats = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: i !== 0 }));

/** 白名單裡**已經**有那隻新英雄（平台的 curation 那一半今天就是熱的）。 */
const wl = (ids: string[]): Whitelist =>
  new Whitelist({ version: 1, champions: ids, items: [], abilities: [] }, false);

/** 開房：`MatchRoom.buildMatch` 做的事 —— 快照白名單 ＋ 現在的登錄表。 */
const openRoom = (id: string, allowed: string[]): MatchController =>
  new MatchController(id, 1234, seats(), FAST, 3, DEFAULT_ARENA_RULES, undefined, wl(allowed));

/** 一份**新**英雄文件：從出貨的 sela 複製再改 id（⭐ 它一定過得了嚴格 Zod）。 */
function newHeroDoc(): Record<string, unknown> {
  const doc = JSON.parse(readFileSync(join(CONTENT_DIR, "champions/sela.json"), "utf8"));
  doc.id = NEW_ID;
  doc.name = "投稿英雄（熱套用測試）";
  return doc;
}

const overlayWith = (docs: Record<string, unknown>) =>
  async () => ({ generation: 1, docs, deleted: {} as Record<string, boolean> });

describe("GH#1025 —— 發布之後，那隻英雄在下一場房裡選得到", () => {
  beforeAll(async () => {
    // 開機那一趟（`index.ts` 的 loadContent 沒有覆蓋層的那一半）。
    const r = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
    registerAll(r.store);
  }, 60_000);

  it("⭐ 熱套用之前選不到、之後**下一場**選得到（⛔ 而且不必重啟）", async () => {
    // ── 儀器：發布前，就算白名單放行，登錄表也沒有它 ⇒ 選不到 ────────────
    expect(Champions.tryGet(NEW_ID as never)).toBeUndefined();
    const before = openRoom("m-before", ["sela", NEW_ID]);
    expect(before.selectChampion(asSeatId(0), NEW_ID)).toEqual({
      ok: false,
      reason: "unknown-champion",
    });

    // ── 平台公告 content-overlay（promote 剛剛寫進去的那一份） ───────────
    const res = await applyOverlayAdditions({
      contentDir: CONTENT_DIR,
      fetchOverlay: overlayWith({ [`champions/${NEW_ID}`]: newHeroDoc() }),
      log: () => {},
    });
    expect(res.ok, `熱套用失敗：${res.reason}`).toBe(true);
    expect(res.added).toContain(NEW_ID);
    expect(res.withheld).toEqual([]);

    // ── ⭐⭐ 承重的那一句：**下一場**開的房選得到它 ───────────────────────
    const next = openRoom("m-next", ["sela", NEW_ID]);
    expect(next.selectChampion(asSeatId(0), NEW_ID)).toEqual({ ok: true });

    // ── ⭐ 而**已經在跑的那一場**沒有被動到（⛔ 這一半不可以放寬） ─────────
    expect(before.whitelist.snapshotChampions().sort()).toEqual([NEW_ID, "sela"].sort());
    expect(before.phase.phase).toBe("champSelect");
  }, 60_000);

  it("⛔ **修改**既有內容不會被熱套用 —— 它被指名列出來，而定義一個位元組都沒動", async () => {
    const sameObjectBefore = Champions.get("sela" as never);
    const tampered = JSON.parse(readFileSync(join(CONTENT_DIR, "champions/sela.json"), "utf8"));
    tampered.name = "⛔ 這個名字不可以出現在跑著的登錄表裡";

    const res = await applyOverlayAdditions({
      contentDir: CONTENT_DIR,
      fetchOverlay: overlayWith({ "champions/sela": tampered }),
      log: () => {},
    });

    // ⭐ fail-loud：ok=false ＋ 逐份指名（⛔ 不是一行沒有人讀的 log）。
    expect(res.ok).toBe(false);
    expect(res.withheld).toContain("champions/sela");
    expect(res.reason ?? "").toContain("champions/sela");

    // ⭐⭐ 而登錄表裡的那一份是**同一個物件**（⛔ 不只是「長得一樣」）——
    //    一場正在打的比賽握著的就是它。
    expect(Champions.get("sela" as never)).toBe(sameObjectBefore);
    expect(Champions.get("sela" as never).name).not.toContain("不可以出現");
  }, 60_000);
});
