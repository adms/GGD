/**
 * ⭐⭐ **玩家內容的發現入口真的接上了**（GH#908 責任③）。
 *
 * ⛔⛔ 在此之前這條路線是**失敗形態⑧**：伺服器有
 * `GET /submissions/discoverable`、審核走既有流水線、三個住處的開關也齊了
 * ⇒ ⭐ 而客戶端**沒有任何一行去讀它** —— 也就是「做完的東西沒有出口」。
 *
 * ⚠️ ⭐ 這一支釘的是**接縫**（誰讀它、它掛在哪），
 * ⛔ 不是「畫出來好不好看」—— 後者要真渲染，而預設開關是**關的**。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("玩家內容的發現入口（GH#908 ③）", () => {
  it("⭐ 量尺先自證：伺服器那一端真的有這條路線", () => {
    const go = read("apps/platform/internal/submissions/handlers.go");
    expect(
      go.includes('r.Get("/submissions/discoverable"'),
      "⛔ 伺服器沒有這條路線 ⇒ 客戶端讀它是讀空氣",
    ).toBe(true);
  });

  it("★★ ⭐ 客戶端**有一個讀端**（⛔ 零讀端 ＝ 做完的東西沒有出口）", () => {
    const api = read("apps/client/src/ui/platform/api.ts");
    expect(
      api.includes('"/submissions/discoverable"'),
      "⛔ `api.ts` 沒有去打那條路線",
    ).toBe(true);
    expect(api).toContain("export async function discoverableSubmissions");
  });

  it("★★ ⭐ 那個讀端**真的被畫出來的東西用到**（⛔ 不是一個沒有人呼叫的函式）", () => {
    const panel = read("apps/client/src/ui/platform/PlayerContentPanel.tsx");
    expect(panel, "⛔ 面板沒有呼叫讀端").toContain("discoverableSubmissions()");
    const lobby = read("apps/client/src/ui/platform/LobbyScreen.tsx");
    expect(lobby, "⛔ 面板沒有掛進大廳 ⇒ 玩家看不到它").toContain("<PlayerContentPanel />");
  });

  it("⭐⭐ 開關**預設是關的**（⛔ 對外開放的東西不預設開）", () => {
    const cfg = JSON.parse(read("content/config/ui-cues.json")) as {
      playerContent?: { submit?: boolean; discover?: boolean };
    };
    expect(cfg.playerContent, "⛔ 那一格不見了 ⇒ 開關沒有出貨住處").toBeTruthy();
    expect(cfg.playerContent!.submit, "⛔ 投稿預設開了").toBe(false);
    expect(cfg.playerContent!.discover, "⛔ 發現預設開了").toBe(false);
  });

  it("⭐ 關著時**不是 404** —— 兩邊只有一條路（⛔ 不做兩套錯誤處理）", () => {
    const go = read("apps/platform/internal/submissions/handlers.go");
    // ⚠️ 伺服器逐字：「一條會 404 的路線會讓客戶端寫出兩套程式碼」
    const i = go.indexOf("func (h *Handlers) discoverable");
    const body = go.slice(i, i + 500);
    expect(body, "⛔ 關著時回的不是 200 空清單").toContain("StatusOK");
    const panel = read("apps/client/src/ui/platform/PlayerContentPanel.tsx");
    expect(panel, "⛔ 客戶端沒有處理空清單 ⇒ 關著時會畫出一個空框").toContain(
      "rows.length === 0",
    );
  });
});
