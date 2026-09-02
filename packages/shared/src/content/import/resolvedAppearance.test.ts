/**
 * ⭐⭐ **P1-3 §3 —— 遊戲與 Editor 對同一 champion id 解到相同 model key。**
 *
 * ── ⛔ 交接文件逐字要的 ─────────────────────────────────────────────────
 * 「遊戲與 Editor 必須呼叫**同一 resolver** 或用**同一批 golden vectors**
 *   證明輸出一致。」
 *
 * ⭐ 這一支跑**出貨內容**（⛔ 不是夾具）：載入真的 `champion@1` / `model@1`，
 * 對每一位英雄跑 resolver，證明它解出的 `modelKey` 逐字等於**註冊表**
 * （＝遊戲真的會用的那一份）給的那一個。
 *
 * MUTATION LOG（落地前真的跑過）：
 *   · `isStandIn` 改成永遠 false → 🔴 ③
 *   · `resolveAppearance` 的 `modelKey` 改成回 model 文件的 `id` → 🔴 ②
 *   · `modelDocDigest` 改成只 hash `glbPath` → 🔴 ④
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { STAND_IN_MODEL_KEYS } from "../voxelSkin/types";

import {
  resolveAppearance,
  appearanceResolverFingerprint,
  RESOLVED_APPEARANCE_SCHEMA,
  type AppearanceModel,
} from "./resolvedAppearance";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");

interface Champ {
  id: string;
  name?: string;
  modelKey?: string;
}

let champs: Champ[] = [];
let models: Map<string, AppearanceModel & { id: string }> = new Map();

beforeAll(() => {
  champs = readdirSync(join(CONTENT, "champions"))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(join(CONTENT, "champions", f), "utf8")) as Champ);
  models = new Map(
    readdirSync(join(CONTENT, "models"))
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => JSON.parse(readFileSync(join(CONTENT, "models", f), "utf8")))
      .filter((m: { id?: string }) => typeof m.id === "string")
      .map((m: AppearanceModel & { id: string }) => [m.id, m]),
  );
});

describe("resolved-appearance@1", () => {
  it("★★ ⭐ ① 出貨的每一位英雄都解得出來（⛔ 沒有一位落進失敗分支）", () => {
    expect(champs.length, "儀器：一位英雄都沒讀到").toBeGreaterThan(50);
    const failed: string[] = [];
    for (const c of champs) {
      const r = resolveAppearance(c.id, c, models.get(String(c.modelKey)));
      if (!r.ok) failed.push(`${c.id}: ${r.failure.kind}`);
    }
    expect(
      failed,
      "⛔ 這幾位英雄解不出外觀 ⇒ ⭐ 外部編輯器對他們只能畫一個方塊",
    ).toEqual([]);
  });

  it("★★ ⭐⭐ ②′ 與**註冊表**（＝遊戲真的用的那一份）逐字一致", async () => {
    // ⛔⛔ 上一版讀的是**磁碟上的 JSON** —— ⭐ 而遊戲用的是**註冊表**
    //   （`Champions.get(id).modelKey`，由 snapshot 的 `e.key` 送到客戶端）。
    // ⚠️ 兩者之間隔著模板展開與級距解析 ⇒ ⭐ 只驗磁碟檔是**失敗形態⑤**
    //   （被測的不是出貨的那個）。⇒ 這一條問註冊表。
    const { registerAll } = await import("../registries");
    const { ContentLoader } = await import("../loader");
    const { shippedContentSource } = await import("../__fixtures__/shippedContent");
    const { Champions } = await import("../../sim/content/registry");
    registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);

    const mismatched: string[] = [];
    let checked = 0;
    for (const c of champs) {
      const reg = Champions.get(c.id as never) as unknown as { modelKey?: string } | undefined;
      if (reg === undefined) continue;
      checked += 1;
      const r = resolveAppearance(c.id, c, models.get(String(c.modelKey)));
      if (r.ok && r.appearance.modelKey !== reg.modelKey) {
        mismatched.push(`${c.id}: resolver=${r.appearance.modelKey} 註冊表=${reg.modelKey}`);
      }
    }
    expect(checked, "儀器：註冊表裡一位英雄都沒讀到 ⇒ 這條在量空氣").toBeGreaterThan(50);
    expect(
      mismatched,
      "⛔⛔ resolver 與**註冊表**解出不同的 modelKey ⇒\n" +
        "   ⭐ 遊戲畫一顆、外部編輯器預覽另一顆，而兩邊都覺得自己是對的。",
    ).toEqual([]);
  }, 120_000);

  it("★★ ⭐⭐ ② 解出的 `modelKey` 逐字等於**遊戲會用的**那一個", () => {
    // ⭐ 遊戲那一側讀的就是 `champion@1.modelKey`（`EntityViewRegistry` 的
    //   `Champions.get(championId).modelKey`）⇒ 這條證明 resolver **沒有改寫它**。
    // ⛔ 一個「順手正規化 id」的 resolver 會讓 Editor 預覽另一顆模型，
    //   而兩邊都覺得自己是對的。
    const mismatched: string[] = [];
    for (const c of champs) {
      const r = resolveAppearance(c.id, c, models.get(String(c.modelKey)));
      if (r.ok && r.appearance.modelKey !== c.modelKey) {
        mismatched.push(`${c.id}: ${c.modelKey} → ${r.appearance.modelKey}`);
      }
    }
    expect(mismatched, "⛔⛔ resolver 改寫了 modelKey ⇒ 遊戲與 Editor 會畫不同的模型").toEqual(
      [],
    );
    // ⚠️ ⭐ 上面那一段**掃出貨內容分不出來** —— 突變驗過：把 `modelKey` 改成回
    //   `model.id` 之後它**仍然綠**，因為出貨內容裡兩者本來就相等（ref 就是這樣接的）。
    //   ⇒ ⭐ 用一個**兩者刻意不同**的夾具，斷言才真的在問「resolver 用了哪一個」。
    const r = resolveAppearance(
      "c",
      { id: "c", modelKey: "英雄卡指的那一顆" },
      { id: "模型文件自己的 id", glbPath: "assets/x.glb" },
    );
    expect(
      r.ok && r.appearance.modelKey,
      "⛔⛔ resolver 回的是**模型文件自己的 id**，⛔ 不是英雄卡指的那一個 ⇒\n" +
        "   ⭐ 一份 id 與檔名不一致的 model@1 會讓 Editor 預覽另一顆模型。",
    ).toBe("英雄卡指的那一顆");
  });

  it("★★ ⭐⭐ ③ 站在**共用替身**上的英雄被明講出來（⛔ 不是靜默）", () => {
    const standIns = champs
      .map((c) => ({ c, r: resolveAppearance(c.id, c, models.get(String(c.modelKey))) }))
      .filter((x) => x.r.ok && x.r.appearance.isStandIn)
      .map((x) => `${x.c.id} (${x.c.modelKey})`);
    // ⭐ 儀器：如果一個都沒有，這條在量空氣（⛔ 或者 `isStandIn` 壞了）。
    expect(
      standIns.length,
      "⛔ 一位共用替身英雄都沒標出來 —— ⭐ 2026-09-02 量到有 4 位 ⇒ `isStandIn` 壞了",
    ).toBeGreaterThan(0);
    // ⭐⭐ 2026-09-02 —— 這裡本來寫死 `godie-e00r`（引發 GH#933 的那一位）。
    // ⛔ 而修好它的**那一次改動**（初號機拿到自己的 satyrtrickster 網格）
    // 就讓這條夾具紅了 —— 失敗形態⑩的形狀：**守衛是靠缺陷才綠的**。
    //
    // ⇒ ⭐ 改成從**另一個住處**推導，⛔ 不點名任何一位：
    //   · `isStandInModel()` 用的是**前綴**（`champ.`）
    //   · `STAND_IN_MODEL_KEYS` 是**逐顆列名**的四具 rig
    //   兩者是獨立的兩份知識 ⇒ 拿後者驗前者，任一邊漂掉都會紅。
    //
    // ⚠️ ⛔ **「共用同一顆 modelKey」不是這條的判準** —— 量到 17 個共用 key，
    // 其中 14 個是 `imported.*`（英雄與它的變體刻意共用**同一顆真的角色模型**，
    // 例：`godie-h02v`/`godie-h02u` 草泥馬兩兄弟）⇒ 那些預覽是**對的**。
    // ⭐ 「站在通用 rig 上」才是會讓編輯器預覽出錯角色的那一種。
    const onGenericRig = champs.filter((c) =>
      STAND_IN_MODEL_KEYS.includes(String(c.modelKey)),
    );
    expect(
      onGenericRig.length,
      "⛔ 一位都沒站在四具通用 rig 上 ⇒ 這條在量空氣（或 STAND_IN_MODEL_KEYS 空了）",
    ).toBeGreaterThan(0);
    for (const c of onGenericRig) {
      expect(
        standIns.some((s) => s.startsWith(`${c.id} `)),
        `⛔ ${c.id} 站在通用替身 ${String(c.modelKey)} 上卻沒被標出來 ` +
          "⇒ 外部編輯器會忠實預覽出一個**錯的角色**",
      ).toBe(true);
    }
    // ⭐⭐ **反方向**（⛔ 一頭不算 —— 形態⑫）：
    // 上面那個迴圈只走「列名 ⇒ 有標」，所以把一顆 key 從 `STAND_IN_MODEL_KEYS`
    // 拿掉只會讓迴圈**變短**，⛔ 不可能紅（突變驗過，第一版就是綠的）。
    // ⇒ ⭐ 反過來再走一次：**被標成替身的，一定要在列名表裡**。
    //   兩頭都走，兩個住處任一邊漂掉都會紅。
    for (const id of standIns) {
      const key = id.slice(id.indexOf("(") + 1, id.lastIndexOf(")"));
      expect(
        STAND_IN_MODEL_KEYS.includes(key),
        `⛔ ${id} 被標成替身，而 ${key} 不在 STAND_IN_MODEL_KEYS 裡 ` +
          "⇒ 前綴判斷與列名表漂開了（兩份知識只剩一份是對的）",
      ).toBe(true);
    }
  });

  it("★★ ⭐ ④ `modelDocDigest` 對**整份**文件（⛔ 不是只有 glbPath）", () => {
    const base: AppearanceModel & { id: string } = {
      id: "m",
      glbPath: "assets/models/x.glb",
      scale: 1,
      collisionRadius: 0.5,
    };
    const a = resolveAppearance("c", { id: "c", modelKey: "m" }, base);
    // ⭐ 只改 `scale`（⛔ 沒動 glbPath）⇒ digest 必須變。
    const b = resolveAppearance("c", { id: "c", modelKey: "m" }, { ...base, scale: 2 });
    expect(a.ok && b.ok).toBe(true);
    expect(
      a.ok && b.ok && a.appearance.modelDocDigest === b.appearance.modelDocDigest,
      "⛔⛔ 只 hash 了 `glbPath` ⇒ 縮放／附著點／動畫對應改了，預覽**不知道自己過期**",
    ).toBe(false);
  });

  it("★ ⭐ ⑤ 三種失敗**分得出來**（⛔ 不是一律 null）", () => {
    expect(resolveAppearance("x", undefined, undefined)).toMatchObject({
      ok: false,
      failure: { kind: "no-champion" },
    });
    expect(resolveAppearance("x", { id: "x" }, undefined)).toMatchObject({
      ok: false,
      failure: { kind: "no-model-key" },
    });
    expect(resolveAppearance("x", { id: "x", modelKey: "m" }, undefined)).toMatchObject({
      ok: false,
      failure: { kind: "no-model-doc", modelKey: "m" },
    });
  });

  it("★ ⭐ ⑥ 契約指紋穩定且釘住**欄位集合**", () => {
    const fp = appearanceResolverFingerprint();
    expect(fp).toHaveLength(12);
    expect(fp).toBe(appearanceResolverFingerprint());
    const r = resolveAppearance("c", { id: "c", modelKey: "m" }, { id: "m", glbPath: "assets/x" });
    expect(r.ok && r.appearance.schema).toBe(RESOLVED_APPEARANCE_SCHEMA);
    expect(r.ok && r.appearance.resolverFingerprint).toBe(fp);
  });
});
