/**
 * 覆蓋層寫入前的 Zod 驗證 (task #283).
 *
 * ⚠️ 這一支守的是一句寫在程式碼裡的**假話**。`packages/shared/src/content/
 * overlay.ts` 的檔頭說 overlay docs 「由 admin console 在存檔前驗證」,
 * game-server 的 config/contentOverlay.ts 也照抄了那個假設。實際上
 * `putOverlayDoc` 直接 PUT,平台端也不驗,`parseDocInput` 只看「是不是一個
 * JSON 物件」。一份壞文件會同時落到 shard 與每一個瀏覽器上。
 *
 * 斷言的是**出貨的寫入路徑**(`putOverlayDoc`),不是一個新的 helper:
 * 九個頁面共用那一支函式,守在別處等於沒守。每一條都要求 fetch **完全沒有
 * 發生** —— 「送出去之後平台回 400」和「根本沒送出去」是兩種不同的結果,
 * 而只有後者能保證壞位元組沒有落地。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { api, putOverlayDoc } from "./api";
import { VALIDATED_COLLECTIONS, validateOverlayDoc } from "./contentOverlay";

const calls: string[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.spyOn(api, "request").mockImplementation(async (path: string) => {
    calls.push(path);
    return { generation: 1 } as never;
  });
});

const GOOD_BONUS = {
  id: "base-bonus",
  schema: "config.base-bonus@1",
  bonus: { maxHealth: 300 },
};

describe("putOverlayDoc 驗證 (overlay-zod-gate)", () => {
  it("一份合法的 config 文件照樣寫得出去", async () => {
    cover("overlay-zod-gate");
    await expect(putOverlayDoc("config", "base-bonus", GOOD_BONUS)).resolves.toBeTruthy();
    expect(calls).toHaveLength(1);
  });

  it("負的基礎加成被擋在網路之前 —— 連一個 byte 都沒送出去", async () => {
    cover("overlay-zod-gate");
    await expect(
      putOverlayDoc("config", "base-bonus", {
        id: "base-bonus",
        schema: "config.base-bonus@1",
        bonus: { maxHealth: -9999 },
      }),
    ).rejects.toThrow(/拒絕寫入/);
    expect(calls, "壞文件已經送到平台了").toHaveLength(0);
  });

  it("缺欄位的 champion 文件被擋下(schema 真的跑了,不是只看 id)", async () => {
    cover("overlay-zod-gate");
    await expect(
      putOverlayDoc("champions", "thorne", { id: "thorne", schema: "champion@1" }),
    ).rejects.toThrow(/champions 的 schema/);
    expect(calls).toHaveLength(0);
  });

  it("認不得的 schema tag 被擋下 —— 打錯 discriminator 不會靜靜落地", async () => {
    cover("overlay-zod-gate");
    await expect(
      putOverlayDoc("config", "base-bonus", {
        id: "base-bonus",
        schema: "config.base-bonuss@1", // 多打一個 s
        bonus: { maxHealth: 300 },
      }),
    ).rejects.toThrow(/拒絕寫入/);
    expect(calls).toHaveLength(0);
  });

  /**
   * 誠實的邊界:collection schema 是 `config` 這一整族的**聯集**,所以一份
   * 合法的 combat-env 文件存到 `config/base-bonus` 這個 key 上是**驗得過**的
   * —— 兩者都是合法的 config@1 家族成員,只有 key↔variant 的對應關係是這一層
   * 看不到的資訊。這條測試把那個限制釘住,免得將來有人以為這道閘擋得比實際多。
   */
  it("同一族內存錯 variant 是這道閘看不到的 —— 記錄這個限制,不要假裝擋得住", async () => {
    cover("overlay-zod-scope");
    await expect(
      putOverlayDoc("config", "base-bonus", {
        id: "base-bonus",
        schema: "config.combat-env@1",
        version: 1,
        multipliers: { damageDealt: 0.5 },
      }),
    ).resolves.toBeTruthy();
  });

  it("文件的 id 和寫入的 key 不一致 → 擋下(schema 兩邊都合法,只有這裡看得到)", async () => {
    cover("overlay-zod-gate");
    await expect(
      putOverlayDoc("config", "base-bonus", { ...GOOD_BONUS, id: "someone-else" }),
    ).rejects.toThrow(/id 是 "someone-else"/);
    expect(calls).toHaveLength(0);
  });
});

describe("哪些 collection 驗得到 (overlay-zod-scope)", () => {
  it("有 schema 的 collection 回報 validated: true", () => {
    cover("overlay-zod-scope");
    expect(validateOverlayDoc("config", "base-bonus", GOOD_BONUS)).toEqual({
      ok: true,
      validated: true,
    });
  });

  it("沒有 schema 的 collection **明說**這次寫入未經驗證(不假裝全部都驗了)", () => {
    cover("overlay-zod-scope");
    const v = validateOverlayDoc("experiments", "thing", { id: "thing", anything: 1 });
    expect(v.ok).toBe(true);
    expect(v.ok && v.validated).toBe(false);
    expect(v.ok && !v.validated && v.reason).toMatch(/沒有對應的 schema/);
  });

  it("能驗的清單就是內容表本身 —— 不是一份會漂走的手抄名單", () => {
    cover("overlay-zod-scope");
    for (const c of ["champions", "abilities", "items", "config", "arenas", "vfx"]) {
      expect(VALIDATED_COLLECTIONS, `${c} 不在可驗清單裡`).toContain(c);
    }
    expect(VALIDATED_COLLECTIONS).not.toContain("experiments");
  });
});
