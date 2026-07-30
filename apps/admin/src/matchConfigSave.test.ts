/**
 * 對戰設定 —— **頁面按下去之後真的送出什麼**。
 *
 * `matchConfig.test.ts` 守純函式；那些函式全部正確、而頁面把唯讀欄位畫成可編輯
 * 的輸入框，兩件事完全相容。所以這一支掛真的 `MatchConfigPage`，在真的控制項上
 * 打字，攔下真的 `putOverlayDoc`（只 mock `api.request`，#283 的 Zod 閘是真跑的），
 * 再拿送出去的那份 JSON 餵給 **game-server 自己的** `phaseConfigFromSeconds`。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { cover } from "@ggd/shared/testkit/cover";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { api } from "./api";
import { FIRE_RING_BLOCK, MATCH_DOC_ID, MATCH_FIELDS, isEditable } from "./matchConfig";
import { getAtPath } from "./configFields";
import { MatchConfigPage } from "./ui/MatchConfigPage";
import { mount } from "./testkit/headlessUi";
import { phaseConfigFromSeconds } from "../../game-server/src/match/phaseConfig";
import { TICK_HZ } from "@ggd/shared/constants";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { hookImpls } = await import("./testkit/headlessUi");
  const base = (actual["default"] ?? {}) as Record<string, unknown>;
  return { ...actual, ...hookImpls, default: { ...base, ...hookImpls } };
});

const TAG = "adminui-match-config-save";
const SAVE = "儲存 Save";

const SHIPPED_DOC = JSON.parse(
  readFileSync(join(__dirname, "../../../content/config/config.match.json"), "utf8"),
) as Record<string, unknown>;

const puts: { path: string; doc: Record<string, unknown> }[] = [];
let overlayDoc: unknown = null;
let shippedPresent = true;

beforeEach(() => {
  puts.length = 0;
  overlayDoc = null;
  shippedPresent = true;
  vi.restoreAllMocks();
  vi.spyOn(api, "request").mockImplementation(
    async (path: string, opts?: { method?: string; body?: unknown }): Promise<never> => {
      if (path === "/content-overlay/bundle") {
        return (overlayDoc ? { docs: { [`config/${MATCH_DOC_ID}`]: overlayDoc } } : { docs: {} }) as never;
      }
      if (path.startsWith("/content-overlay/shipped/")) {
        return (shippedPresent
          ? { present: true, hash: "h", doc: JSON.parse(JSON.stringify(SHIPPED_DOC)) }
          : { present: false, hash: "", doc: null }) as never;
      }
      if (opts?.method === "PUT") {
        puts.push({ path, doc: JSON.parse(JSON.stringify(opts.body)) as Record<string, unknown> });
        return { generation: puts.length } as never;
      }
      return {} as never;
    },
  );
});

async function open(): Promise<ReturnType<typeof mount>> {
  const h = mount(createElement(MatchConfigPage));
  await h.flush();
  return h;
}

describe("存下去的值走得到 game-server 的 resolver", () => {
  it("改中場秒數 → 送出的文件餵給 `phaseConfigFromSeconds` 得到新的 tick 數", async () => {
    cover(TAG);
    const h = await open();
    h.type("match.intermissionSec", "45");
    h.click(SAVE);
    await h.flush();

    expect(puts).toHaveLength(1);
    expect(puts[0]!.path).toBe(`/content-overlay/docs/config/${MATCH_DOC_ID}`);
    const cfg = phaseConfigFromSeconds((puts[0]!.doc.match ?? {}) as Record<string, number>);
    expect(cfg.intermissionTicks).toBe(45 * TICK_HZ);
    // 別的階段沒被順手改掉
    expect(cfg.champSelectTicks).toBe(20 * TICK_HZ);
  });

  it("停用火圈 → 送出的文件裡整塊不見（`resolveFireRing` 會回 null）", async () => {
    cover(TAG);
    const h = await open();
    h.type(FIRE_RING_BLOCK, "false");
    h.click(SAVE);
    await h.flush();
    expect(getAtPath(puts[0]!.doc, FIRE_RING_BLOCK)).toBeUndefined();
  });
});

describe("沒有消費端的那 19 格，操作者碰不到", () => {
  it("每一格唯讀欄位在畫面上都是 disabled，打字會被拒絕", async () => {
    cover(TAG);
    const h = await open();
    const readOnly = MATCH_FIELDS.filter((f) => !isEditable(f.path));
    expect(readOnly.length).toBe(19);
    for (const f of readOnly) {
      expect(h.field(f.path).props["disabled"], `${f.path} 竟然可以編輯`).toBe(true);
      expect(() => h.type(f.path, "999")).toThrow(/disabled/);
    }
  });

  it("而且畫面上明說「沒有任何程式讀這一格」以及真正的數字在哪", async () => {
    cover(TAG);
    const h = await open();
    const text = h.text();
    expect(text).toContain("執行期沒有任何程式讀這一格");
    expect(text).toContain("STARTING_GOLD");
    expect(text).toContain("LEVEL_CAP");
    expect(text).toContain("TICK_HZ");
  });

  it("存檔之後那 19 格的值和讀進來的一模一樣", async () => {
    cover(TAG);
    const h = await open();
    h.type("match.combatMaxSec", "150");
    h.click(SAVE);
    await h.flush();
    for (const f of MATCH_FIELDS) {
      if (isEditable(f.path)) continue;
      expect(getAtPath(puts[0]!.doc, f.path), `${f.path} 被動到了`).toEqual(
        getAtPath(SHIPPED_DOC, f.path),
      );
    }
  });
});

describe("這一頁不會說謊", () => {
  it("讀不到現行文件時，儲存是關的 —— 不會用猜出來的內容覆蓋線上", async () => {
    cover(TAG);
    shippedPresent = false;
    const h = await open();
    expect(h.text()).toContain("不會");
    expect(() => h.click(SAVE)).toThrow(/disabled/);
    expect(puts).toHaveLength(0);
  });

  it("跨欄位規則沒過時儲存是關的（火圈收不完就被硬底線砍掉）", async () => {
    cover(TAG);
    const h = await open();
    h.type("match.fireRing.startSec", "90"); // 90 + 20 > combatMaxSec 100
    expect(() => h.click(SAVE)).toThrow(/disabled/);
    expect(h.text()).toContain("跨欄位規則沒過");
    expect(puts).toHaveLength(0);
  });

  it("單格超界時儲存也是關的", async () => {
    cover(TAG);
    const h = await open();
    h.type("match.startingTeamLives", "500"); // 上限 60（MAX_STARTING_TEAM_HEALTH）
    expect(() => h.click(SAVE)).toThrow(/disabled/);
    expect(h.text()).toContain("不能大於 60");
    expect(puts).toHaveLength(0);
  });

  it("現行文件驗不過時，畫面說出「載入器會整份丟掉」", async () => {
    cover(TAG);
    const broken = JSON.parse(JSON.stringify(SHIPPED_DOC)) as Record<string, unknown>;
    (broken.economy as Record<string, unknown>).startingGold = -5;
    overlayDoc = broken;
    const h = await open();
    expect(h.text()).toContain("過不了 schema");
    expect(h.text()).toContain("整份丟掉");
  });

  it("必須寫「要重啟 shard」，而且要點名平台那張表讀的是磁碟上的內容檔", async () => {
    cover(TAG);
    const h = await open();
    const text = h.text();
    expect(text).toContain("重啟");
    expect(text).not.toContain("從下一場開始生效");
    // Go 的 opsenv 直接 os.ReadFile(CONTENT_DIR/config/config.match.json)，不看覆蓋層 ——
    // 在這裡存檔之後兩邊會開始講不同的故事，操作者唯一的線索是這行字。
    expect(text).toContain("磁碟上的內容檔");
  });
});
