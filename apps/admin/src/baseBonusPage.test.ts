/**
 * 基礎加成頁 —— 第 3 層守衛,而且是**驅動真的頁面** (tasks #277 / #279).
 *
 * ⚠️ 為什麼不能只測 `../baseBonus` 的純函式。上一輪就是那樣做的:`baseBonus.ts`
 * 有 9 條綠燈,而頁面把 -9999 原封不動送進耐久覆蓋層。純函式測到的是「函式會
 * 算出什麼」,操作者按到的是「頁面讓不讓他按」—— 那是兩件事(失敗形狀 ⑤:
 * 受測的東西不是出貨的東西)。
 *
 * 所以這一支和 `mobWavesSave.test.ts` 同一個做法:用 `testkit/headlessUi` 掛載
 * **真的 BaseBonusPage**,打真的字、按真的按鈕,斷言送進 `putOverlayDoc` 的
 * 那個物件、以及畫面上讀得到的文字。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { cover } from "@ggd/shared/testkit/cover";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { BaseBonusPage } from "./ui/BaseBonusPage";
import { BONUS_COLLECTION, BONUS_DOC_ID } from "./baseBonus";
import { mount, textOf, type HostNode } from "./testkit/headlessUi";

const bus = vi.hoisted(() => ({
  puts: [] as Array<{ collection: string; id: string; doc: Record<string, unknown> }>,
  reverts: [] as Array<{ collection: string; id: string }>,
  overlayDoc: null as unknown,
  generation: 0,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { hookImpls } = await import("./testkit/headlessUi");
  const base = (actual["default"] ?? {}) as Record<string, unknown>;
  return { ...actual, ...hookImpls, default: { ...base, ...hookImpls } };
});

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    getOverlayDoc: async (): Promise<unknown> => bus.overlayDoc,
    getShippedDoc: async (): Promise<{ present: boolean; hash: string; doc: unknown }> => ({
      present: false,
      hash: "",
      doc: null,
    }),
    putOverlayDoc: async (
      collection: string,
      id: string,
      doc: Record<string, unknown>,
    ): Promise<{ generation: number }> => {
      bus.puts.push({
        collection,
        id,
        doc: JSON.parse(JSON.stringify(doc)) as Record<string, unknown>,
      });
      return { generation: ++bus.generation };
    },
    revertOverlayDoc: async (collection: string, id: string): Promise<{ generation: number }> => {
      bus.reverts.push({ collection, id });
      bus.overlayDoc = null;
      return { generation: ++bus.generation };
    },
  };
});

/** What the shard currently has: the operator has set health +300 and AD +5. */
const LIVE_DOC = (): Record<string, unknown> => ({
  id: BONUS_DOC_ID,
  schema: "config.base-bonus@1",
  bonus: { maxHealth: 300, ad: 5 },
});

beforeEach(() => {
  bus.puts.length = 0;
  bus.reverts.length = 0;
  bus.generation = 0;
  bus.overlayDoc = LIVE_DOC();
});

async function open(): Promise<ReturnType<typeof mount>> {
  const h = mount(createElement(BaseBonusPage));
  await h.flush();
  return h;
}

/** A button by its `data-field` (rows share the label 「儲存」). */
function button(h: ReturnType<typeof mount>, field: string): HostNode {
  const hit = h.hosts().find((n) => n.type === "button" && n.props["data-field"] === field);
  if (!hit) throw new Error(`no button carries data-field="${field}"`);
  return hit;
}
function press(h: ReturnType<typeof mount>, field: string): void {
  const b = button(h, field);
  if (b.props["disabled"] === true) throw new Error(`button "${field}" is disabled`);
  (b.props["onClick"] as () => void)();
}
function isDisabled(h: ReturnType<typeof mount>, field: string): boolean {
  return button(h, field).props["disabled"] === true;
}
function bonusOf(nth = 0): Record<string, number> {
  const call = bus.puts[nth];
  if (!call) throw new Error(`no PUT #${nth} was made`);
  return call.doc["bonus"] as Record<string, number>;
}

describe("基礎加成頁 —— 負值擋在頁面上 (basebonus-page-bounds)", () => {
  it("打進 -9999 → 紅字、儲存鎖住,而且什麼都沒送出去", async () => {
    cover("basebonus-page-bounds");
    const h = await open();
    h.type(`bonus-${Stat.MaxHealth}`, "-9999");
    // 訊息在畫面上讀得到(操作者要知道為什麼按不下去)
    const err = h.fieldOrNull(`bonus-error-${Stat.MaxHealth}`);
    expect(err, "負值沒有任何錯誤訊息").not.toBeNull();
    expect(textOf([err!])).toMatch(/不能是負數/);
    // 而且 aria-invalid 真的標了(不是只有顏色)
    expect(h.field(`bonus-${Stat.MaxHealth}`).props["aria-invalid"]).toBe(true);
    // 儲存不可按 —— 這是「頁面即時擋下」而不是「存檔時才擋」
    expect(isDisabled(h, `save-${Stat.MaxHealth}`), "負值時儲存還是可以按").toBe(true);
    expect(() => press(h, `save-${Stat.MaxHealth}`)).toThrow(/disabled/);
    expect(bus.puts, "頁面把負值送出去了").toHaveLength(0);
  });

  it("超過上限一樣擋 —— 上限訊息說出那個數字", async () => {
    cover("basebonus-page-bounds");
    const h = await open();
    h.type(`bonus-${Stat.MaxHealth}`, "999999");
    expect(textOf([h.field(`bonus-error-${Stat.MaxHealth}`)])).toMatch(/上限 20000/);
    expect(isDisabled(h, `save-${Stat.MaxHealth}`)).toBe(true);
    expect(bus.puts).toHaveLength(0);
  });

  it("合法的值照樣存得下去 —— 守衛不可以把這一頁鎖死", async () => {
    cover("basebonus-page-bounds");
    const h = await open();
    h.type(`bonus-${Stat.MaxHealth}`, "450");
    expect(h.fieldOrNull(`bonus-error-${Stat.MaxHealth}`)).toBeNull();
    press(h, `save-${Stat.MaxHealth}`);
    await h.flush();
    expect(bus.puts).toHaveLength(1);
    expect(bus.puts[0]!.collection).toBe(BONUS_COLLECTION);
    expect(bonusOf(0)).toMatchObject({ maxHealth: 450, ad: 5 });
  });

  it("每一列都顯示自己的合法區間", async () => {
    cover("basebonus-page-bounds");
    const h = await open();
    const all = h.text();
    expect(all, "生命上限那一列沒有寫出區間").toContain("範圍 0 ~ 20000");
    expect(all, "攻速那一列沒有寫出區間").toContain("範圍 0 ~ 3.8");
  });
});

describe("基礎加成頁 —— clamp 會吃掉數字這件事有講出來 (basebonus-page-clamp)", () => {
  it("六個有上限的 stat 各自帶警告,沒上限的沒有", async () => {
    cover("basebonus-page-clamp");
    const h = await open();
    for (const s of [
      Stat.AttackSpeed,
      Stat.MoveSpeed,
      Stat.CooldownReduction,
      Stat.CritChance,
      Stat.Lifesteal,
      Stat.Evasion,
    ]) {
      const note = h.fieldOrNull(`bonus-clamp-${s}`);
      expect(note, `${s} 沒有說出最終值上限,操作者填的數字會被靜默吃掉`).not.toBeNull();
      expect(textOf([note!])).toMatch(/最終值夾在/);
    }
    // 沒有 clamp 的不可以憑空長出警告(否則這條測試對錯兩種實作沒有鑑別力)
    expect(h.fieldOrNull(`bonus-clamp-${Stat.MaxHealth}`)).toBeNull();
    expect(h.fieldOrNull(`bonus-clamp-${Stat.AttackDamage}`)).toBeNull();
  });

  it("攻速那一列講的是真正的上下界 0.2 ~ 4", async () => {
    cover("basebonus-page-clamp");
    const h = await open();
    expect(textOf([h.field(`bonus-clamp-${Stat.AttackSpeed}`)])).toContain("0.2 ~ 4");
  });
});

describe("基礎加成頁 —— 「清除」的語意 (basebonus-page-zero)", () => {
  it("按一下不會直接寫入 —— 先問「歸零後是 0,不是出貨預設 650」", async () => {
    cover("basebonus-page-zero");
    const h = await open();
    press(h, `zero-${Stat.MaxHealth}`);
    expect(bus.puts, "第一下就寫進去了,沒有確認").toHaveLength(0);
    expect(h.text()).toMatch(/歸零後這一列是 0,不是出貨預設 650/);
    // 按鈕的字說的是它真正做的事,不是「清除」
    expect(h.text()).not.toContain("清除");
  });

  it("確認之後才寫入,而且寫的是「這一列不見了」", async () => {
    cover("basebonus-page-zero");
    const h = await open();
    press(h, `zero-${Stat.MaxHealth}`);
    press(h, `zero-confirm-${Stat.MaxHealth}`);
    await h.flush();
    expect(bus.puts).toHaveLength(1);
    const bonus = bonusOf(0);
    expect(bonus.maxHealth, "歸零應該把這個 key 拿掉").toBeUndefined();
    expect(bonus.ad, "歸零不可以碰別的列").toBe(5);
  });

  it("取消就是取消 —— 一個字都不會寫出去", async () => {
    cover("basebonus-page-zero");
    const h = await open();
    press(h, `zero-${Stat.MaxHealth}`);
    press(h, `zero-cancel-${Stat.MaxHealth}`);
    await h.flush();
    expect(bus.puts).toHaveLength(0);
    expect(h.text()).not.toMatch(/確定歸零/);
  });
});

describe("基礎加成頁 —— 「回到預設」接的是平台的 revert (basebonus-page-revert)", () => {
  it("還原出貨版走 revertOverlayDoc,而且不是寫一份空文件", async () => {
    cover("basebonus-page-revert");
    const h = await open();
    press(h, "revert");
    expect(bus.reverts, "還沒確認就送出去了").toHaveLength(0);
    press(h, "revert-confirm");
    await h.flush();
    expect(bus.reverts).toEqual([{ collection: BONUS_COLLECTION, id: BONUS_DOC_ID }]);
    // 關鍵鑑別:還原**不是** PUT 一份 bonus:{} —— 那會讓生命加成變 0 而不是 650
    expect(bus.puts, "還原被實作成寫入一份空文件").toHaveLength(0);
  });

  it("還原之後畫面回到出貨預設 650,不是 0", async () => {
    cover("basebonus-page-revert");
    const h = await open();
    press(h, "revert");
    press(h, "revert-confirm");
    await h.flush();
    // 覆蓋層沒了 → 重新載入時讀不到任何文件 → 每一格顯示出貨預設
    expect(h.field(`bonus-${Stat.MaxHealth}`).props["value"]).toBe("650");
  });
});
