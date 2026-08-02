/**
 * victoryFxPage.test.ts — 「勝利煙火那一格真的**掛在後台**上」的守衛。
 *
 * ── 為什麼要這一支（它補的是一個量到的洞）─────────────────────────────
 *
 * owner 2026-08-02：「請你直接取消煙火(變成後台開關)」。
 * 三個地方都做了：`content/config/victory-fx.json`（出貨兩格都關）、
 * `packages/shared/.../config.ts`（Zod + `DEFAULT_VICTORY_FX`）、
 * 以及這裡的 `VICTORY_FX_SPEC`。
 *
 * ⚠️ 但**後台那一半原本沒有任何守衛**。我實測過：把
 * `CONFIG_DOC_SPECS` 裡的 `VICTORY_FX_SPEC,` 那一行刪掉（＝這一頁從後台整個
 * 消失，owner 再也打不開那兩把開關），整個 `apps/admin` 套件
 * **一條都沒有多紅**（76 檔 1036 條，紅的是既有的那 2 條，刪不刪都紅）。
 *
 * 原因是 `configForms.test.ts` 的每一條都是 `for (const spec of CONFIG_DOC_SPECS)`
 * —— 它驗的是「名單上的每一份都合格」，對「名單上少了一份」結構性免疫。
 * 那正是失敗形態 ③（可以從樹裡刪掉而測試全綠）。這一支指名道姓地驗它在。
 *
 * ── 這一支**不**驗什麼 ────────────────────────────────────────────────
 *
 * 不驗「煙火真的沒放出來」—— 那是行為，由
 * `apps/client/src/vfx/victoryFxPolicy.test.ts` 拿 NullEngine 跑真的 `sync()`
 * 去數場上多出幾個粒子系統。這一支只守「後台這一半還在」。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { zConfigVictoryFxDoc } from "@ggd/shared/content";
import { CONFIG_DOC_SPECS, applyEdits, fieldRows, specForPage } from "./configForms";
import { pageRequiresSession } from "./store";

const TAG = "adminui-victory-fx-page";
const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");

/** 兩把開關的完整路徑 —— 少一把就等於 owner 只關得掉一半。 */
const SWITCHES = ["roundVolley.enabled", "matchChicken.enabled"] as const;

describe("勝利煙火後台頁 (#93 / #235, owner 2026-08-02)", () => {
  it("★ 這一頁真的註冊在 CONFIG_DOC_SPECS 上", () => {
    cover(TAG);
    const spec = specForPage("victoryFx");
    expect(
      spec,
      "後台的勝利煙火頁不見了 —— owner 打不開那兩把開關，「變成後台開關」這句話就沒兌現。" +
        "⚠️ configForms.test.ts 的每一條都是 `for (const spec of CONFIG_DOC_SPECS)`，" +
        "對「名單上少了一份」結構性免疫，所以它不會替你抓到這件事。",
    ).not.toBeNull();
    expect(spec?.docId).toBe("victory-fx");
    expect(spec?.schemaTag).toBe("config.victory-fx@1");
    expect(CONFIG_DOC_SPECS.some((s) => s.page === "victoryFx")).toBe(true);
  });

  it("★ 兩把開關都畫得出來，而且都有中文標籤與說明", () => {
    cover(TAG);
    const spec = specForPage("victoryFx");
    expect(spec).not.toBeNull();
    const doc = JSON.parse(read("content/config/victory-fx.json")) as unknown;
    const rows = fieldRows(spec!, doc, new Map());
    for (const path of SWITCHES) {
      const row = rows.find((r) => r.path === path);
      expect(row, `${path} 沒有出現在表單上 —— 那一格關不掉`).toBeTruthy();
      expect(row!.label.zh.length, `${path} 沒有中文標籤`).toBeGreaterThan(1);
      // 說明要寫「它影響什麼」，尤其是**關掉之後玩家失去什麼**（#93 花了七次迭代）。
      expect(row!.label.note.length, `${path} 的說明太短，說不出它影響什麼`).toBeGreaterThan(40);
    }
  });

  it("★ 這一頁掛進導覽與路由，而且需要 session", () => {
    cover(TAG);
    // 存檔走 putOverlayDoc，沒有 session 一律 401 —— 不 gate 的話操作者會填完才吃錯。
    expect(pageRequiresSession("victoryFx")).toBe(true);
    const app = read("apps/admin/src/ui/App.tsx");
    expect(app, "導覽列沒有這一頁 —— 頁面存在但點不到").toContain('page: "victoryFx"');
  });

  it("★ 出貨值是**關**的，而且過得了它自己的 Zod", () => {
    cover(TAG);
    const raw = JSON.parse(read("content/config/victory-fx.json")) as unknown;
    const parsed = zConfigVictoryFxDoc.safeParse(raw);
    expect(parsed.success, "出貨的 victory-fx.json 不合 schema").toBe(true);
    const doc = parsed.success ? parsed.data : null;
    // owner 的裁決：「請你直接取消煙火」。開關可調，但**出貨值必須是關**。
    expect(doc?.roundVolley?.enabled, "回合小煙火出貨值不是關的 —— 違反 owner 的裁決").toBe(false);
    expect(doc?.matchChicken?.enabled, "烤雞煙火出貨值不是關的 —— 違反 owner 的裁決").toBe(false);
  });

  it("★ 後台打勾之後存出去的還是一份合法文件（開關真的能被打開）", () => {
    cover(TAG);
    const base = JSON.parse(read("content/config/victory-fx.json")) as unknown;
    const edited = applyEdits(
      base,
      new Map<string, unknown>([
        ["roundVolley.enabled", true],
        ["matchChicken.enabled", true],
      ]),
    );
    const parsed = zConfigVictoryFxDoc.safeParse(edited);
    expect(parsed.success, "後台把兩格打開之後產生的文件不合 schema —— 開關是死的").toBe(true);
    expect(parsed.success && parsed.data.roundVolley?.enabled).toBe(true);
    expect(parsed.success && parsed.data.matchChicken?.enabled).toBe(true);
  });
});
