/**
 * 🚪 GH#773 —— dev-only 後台入口的閘（體驗層薄守衛）。
 *
 * #732 把 #259 的空間混音試聽頁接上 hub，⭐ 並且**刻意**只在 `mode === "dev"` push
 * （ConsoleHub 把整張表畫出來，無條件 push = 在正式站控制台掛一張調參工作台的卡）。
 * ⚠️ 而那條 lane 自己量到：把那一行改成 `mode === "prod"`，**兩支既有守衛 12/12 全綠**
 * ⇒ 這條路徑上一個閘都沒有。「閘不是判準」—— 缺的是這個檔，⛔ 不是再讀一次程式碼。
 *
 * ── 突變紀錄 ────────────────────────────────────────────────────────────
 *  · `config.ts` 的 `mode === "dev"` 改成 `"prod"` → ① 紅，訊息指名外洩到正式站的頁。
 *  · `AudioAuditionPage` 的 `byKey("voiceSpatialAudition")` 打錯一個字 → ② 紅
 *    （今天那是**靜默的空白畫面**：`?? ""` → 頁面只畫一句中文，沒有人回非零）。
 */
import { describe, expect, it } from "vitest";
import { resolveHubLinks } from "./config";
import { buildAudioTabs } from "./ui/AudioAuditionPage";

/** 宣告為 dev-only 的入口 —— 每一筆都是「調參工作台」，⛔ 不是出貨面。 */
const DEV_ONLY = ["voiceSpatialAudition", "assetReview", "featureReview"] as const;

const keys = (mode: "dev" | "prod"): Set<string> =>
  new Set(resolveHubLinks({}, mode).map((l) => l.key));

describe("後台 hub 的 dev-only 入口 (#773)", () => {
  it("① dev 有、prod ⛔ 沒有 —— 這幾頁不可以出現在正式站控制台", () => {
    const dev = keys("dev");
    const prod = keys("prod");
    const missing = DEV_ONLY.filter((k) => !dev.has(k));
    expect(missing, `這幾個 dev-only 入口在 dev 也不見了 ⇒ 後台點不進去：${missing.join(", ")}`).toEqual(
      [],
    );
    const leaked = DEV_ONLY.filter((k) => prod.has(k));
    expect(
      leaked,
      `⛔ 這幾頁外洩到**正式站**的控制台（ConsoleHub 會把整張表畫出來）：${leaked.join(", ")} ` +
        `—— 檢查 config.ts 的 \`mode === "dev"\` 那一行`,
    ).toEqual([]);
    // 出貨面那幾張兩邊都要在，否則上面兩條可以靠「整張表空掉」造假地綠。
    expect(prod.has("client") && prod.has("admin")).toBe(true);
  });

  it("② 音訊素材頁的每一個分頁都查得到網址（byKey 打錯 = 靜默空白畫面）", () => {
    const blank = buildAudioTabs({}, "dev")
      .filter((t) => t.url === "")
      .map((t) => t.key);
    expect(
      blank,
      `這幾個分頁點下去是**空白**（byKey 查不到 hub 的 key，而頁面只會畫一句中文）：${blank.join(", ")}`,
    ).toEqual([]);
    // ⚠️ 這一頁 dev-only by construction：prod 下 spatial 那格本來就會空 —— 那是
    // 正確的降級（正式 build 根本不 emit 這一頁），⛔ 不是缺陷，所以只驗 dev。
    expect(buildAudioTabs({}, "dev").length).toBeGreaterThanOrEqual(4);
  });
});
