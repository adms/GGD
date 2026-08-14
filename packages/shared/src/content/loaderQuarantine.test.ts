/**
 * ⭐【GH#326 —— 一份壞文件不再殺掉整份內容】
 *
 * owner 2026-08-14：「應該改為**不同部分各自 check 載入成功**」「**quarantine 當預設**」。
 *
 * ⚠️ 這條守的是**機制**不是數字（第二守則）：驗「壞的那一份有沒有被隔離、好的那些
 * 有沒有進來」，⛔ 不驗任何出貨數量 —— 那些住在 config + Zod + admin 三個地方，
 * 已經有 drift 測試在守，抄第四份必然過期。
 *
 * ⚠️ 照第〇·六守則「測試只做**預設啟動**的那一邊」——
 * 只測 `quarantine`（出貨預設）。`fail-closed` 是為了能回頭而存在的舊行為，⛔ 不測。
 * 唯一的例外是 `maxQuarantined` 溢位：那**改變了預設路徑本身**（預設路徑在超過上限
 * 時會轉向），所以它算「新的預設」而不是「開關的另一邊」。
 *
 * 夾具刻意挑最便宜的兩個集合（第零守則⑤：先讀型別）：
 *   · `config`  —— 純量文件，做「壞的隔離／好的照跑」
 *   · `skins`   —— 六個欄位、兩個硬參照，做「傳染」；⛔ 不用 champion，
 *                  它的 Q/W/E/R 每格都是完整內嵌技能，寫一份夾具比被測的程式還長
 *
 * 突變紀錄（一批一條，挑最承重的那一線）：
 *   把 loader.ts 的 `if (policy === "fail-closed" || overBudget)` 改回無條件
 *   `if (errors.length > 0) throw` → 第一條與第三條同時紅（訊息直接說整份載入
 *   被一份壞文件殺掉）。改回來即綠。
 */
import { describe, it, expect } from "vitest";
import { ContentLoader } from "./loader";
import { DEFAULT_CONTENT_LOAD_DOC } from "./schema/config";
import type { CollectionName } from "./schema/index";
import type { CollectionIndex, ContentSource, IndexEntry, Manifest } from "./types";

type Doc = Record<string, unknown>;

/** 記憶體 ContentSource —— 只給這條測試用，⛔ 不碰真的 content/ 樹。 */
class FakeSource implements ContentSource {
  constructor(private readonly docs: Partial<Record<CollectionName, Doc[]>>) {}

  async readManifest(): Promise<Manifest> {
    const collections: Manifest["collections"] = {};
    for (const [name, list] of Object.entries(this.docs)) {
      collections[name as CollectionName] = { hash: "0".repeat(12), count: list.length, path: "" };
    }
    return { contentVersion: "cv_000000000000", collections };
  }

  async readIndex(collection: CollectionName): Promise<CollectionIndex> {
    return {
      collection,
      hash: "0".repeat(12),
      entries: (this.docs[collection] ?? []).map((d) => ({
        id: String(d["id"]),
        path: "",
        hash: "0".repeat(12),
        size: 0,
      })),
    };
  }

  async readObject(collection: CollectionName, entry: IndexEntry): Promise<unknown> {
    return (this.docs[collection] ?? []).find((d) => String(d["id"]) === entry.id);
  }
}

/** 出貨政策文件（quarantine）＋ 可覆寫的欄位。 */
const policyDoc = (over: Doc = {}): Doc => ({ ...DEFAULT_CONTENT_LOAD_DOC, ...over });

/** 少了 `minSeconds` ⇒ Zod 一定拒絕。 */
const brokenConfig = (id: string): Doc => ({ id, schema: "config.cooldown-rules@1", enabled: true });

describe("內容載入:一份壞文件不會殺掉整份內容 (GH#326)", () => {
  it("⭐ 壞的被隔離、好的照樣載入 —— 而且說得出是哪一份、為什麼", async () => {
    const result = await new ContentLoader(
      new FakeSource({ config: [policyDoc(), brokenConfig("cooldown-rules")] }),
    ).load();

    expect(result.policyUsed).toBe("quarantine");
    // 好的那一份在（⛔ 不斷言數量 —— 那是出貨值，住在別的地方）
    expect(result.store.has("config", "content-load")).toBe(true);
    // ⛔ 壞的不在：半成品文件進登錄表比整份失敗更糟
    expect(result.store.has("config", "cooldown-rules")).toBe(false);

    // ⚠️ 隔離**必須說得出話** —— 一個沒有人知道的隔離比整份失敗更糟。
    expect(result.quarantined).toHaveLength(1);
    expect(result.quarantined[0]).toMatchObject({
      collection: "config",
      id: "cooldown-rules",
      reason: "schema",
    });
    expect(result.quarantined[0]!.detail.length).toBeGreaterThan(0);
  });

  it("⚠️ 隔離超過上限時退回 fail-closed —— 「少幾份」與「整份不相容」是兩件事", async () => {
    const load = new ContentLoader(
      new FakeSource({
        config: [
          policyDoc({ maxQuarantined: 1 }),
          brokenConfig("a"),
          brokenConfig("b"),
          brokenConfig("c"),
        ],
      }),
    ).load();

    await expect(load).rejects.toThrow(/maxQuarantined/);
  });

  it("⭐ 隔離會傳染:硬參照斷掉的文件自己也被拿掉,⛔ 不留半個世界", async () => {
    const orphanSkin: Doc = {
      id: "ghost-skin",
      schema: "skin@1",
      championId: "no-such-champion",
      name: "幽靈造型",
      mcoinPrice: 0,
      modelKey: "no-such-model",
    };
    const result = await new ContentLoader(
      new FakeSource({ config: [policyDoc()], skins: [orphanSkin] }),
    ).load();

    // 政策文件沒被牽連
    expect(result.store.has("config", "content-load")).toBe(true);
    // 參照死掉的那一份被拿掉，而不是留下一個指向虛空的造型
    expect(result.store.has("skins", "ghost-skin")).toBe(false);
    expect(result.quarantined.map((q) => q.reason)).toContain("dangling-ref");
  });
});
