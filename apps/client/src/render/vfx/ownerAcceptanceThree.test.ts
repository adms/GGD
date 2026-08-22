/**
 * OWNER 的三支驗收技能 —— 「我說過我要驗收三技能來判斷技能特效動畫是否移植完成」。
 *
 * ⚠️ 這支守衛的存在理由**不是**「再測一次晉升表」（`w3xAbilityArt.test.ts` 已經在做），
 * 而是 GH#450 當場踩到的那個洞：⭐ **驗收被拿去對著下架的分身量。**
 *
 * 04-03 龍破斬 / 42-04 世界終結 各有**兩份**同編號抄本（`godie-h020.e` 與
 * `godie-hjai.e`；`godie-n01g.r` 與 `godie-n003.r`），而 `data/curation/whitelist.json`
 * 裡只有其中一份。`abilityCodeParity.COSMETIC_FIELDS` 把 `vfxKey` 列為「可以不一樣」
 * （owner：改名不是缺陷），所以兩份抄本的特效**本來就會分歧且不會有任何訊號** ——
 * 於是「量下架那一份 → 看到 `fx.prim.*` → 回報『還沒接原作特效』」是一條完全沒有
 * 守衛的錯誤路徑，而它真的發生了。
 *
 * 所以第一條斷言先釘住**身分**（這一份是白名單上那一份、而且它的編號沒被換過），
 * 第二條才問畫面：這一支真的解析得到原作推導出來的特效文件嗎。
 *
 * ⛔ 這裡**不**斷言 `vfxKey` 本身不是 `fx.prim.*`。那是 GH#450 開票時的假設，而它是錯的：
 * 家族列（`fx.fam.*`）的技能，其 `vfxKey` **刻意**留著 `fx.prim.*` 當第 3 級退路
 * （`VfxSystem.playCastVfx` 的四級階梯 + `primitiveFallbackFor`），因為家族文件是
 * 產生內容，`content:build` 沒跑就解不出來。⭐ 真正該問的是**這一次施法會播什麼**，
 * 也就是 `w3xArtFor()` 解出來的那一份。
 */
import { describe, it, expect } from "vitest";
// GH#384 —— 逐技能特效綁定住在 content/；⛔ 少了這一行從 repo 根跑單檔會看到空的綁定。
import "./shippedAbilityArt.testkit";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { zVfxDoc } from "@ggd/shared/content";
import { w3xArtFor } from "./w3xAbilityArt";

const root = (p: string): string => fileURLToPath(new URL(`../../../../../${p}`, import.meta.url));

/** owner 逐字點名的三支。`code` 是 w3x 編號（JASS 對照的 join key，⛔ 不可浮動）。 */
const ACCEPTANCE = [
  { id: "godie-hjai.e", code: "04-03", label: "莉娜因巴斯 龍破斬" },
  { id: "godie-n003.r", code: "42-04", label: "依文潔琳 世界終結" },
  { id: "godie-hart.r", code: "01-04", label: "克勞德 超究武神霸斬" },
] as const;

const whitelist = new Set<string>(
  (JSON.parse(readFileSync(root("data/curation/whitelist.json"), "utf8")) as { champions: string[] })
    .champions,
);

describe("owner 驗收的三支技能特效", () => {
  it("量的是白名單上那一份抄本，而且編號沒被換掉", () => {
    for (const { id, code, label } of ACCEPTANCE) {
      const p = root(`content/abilities/${id}.json`);
      expect(existsSync(p), `${label}: ${id} 不在出貨的 content/abilities`).toBe(true);
      const doc = JSON.parse(readFileSync(p, "utf8")) as { name?: string };
      expect(doc.name ?? "", `${label}: ${id} 的編號漂了 —— 驗收在量別支技能`).toMatch(
        new RegExp(`^${code}\\s`),
      );
      const champion = id.split(".")[0] ?? id;
      expect(
        whitelist.has(champion),
        `${label}: ${champion} 不在 whitelist.json —— 這是下架分身，改它玩家一個位元都看不到`,
      ).toBe(true);
    }
  });

  it("每一支施法時真的播原作推導出來的特效，⛔ 不是通用原型", () => {
    for (const { id, label } of ACCEPTANCE) {
      const art = w3xArtFor(id);
      expect(art, `${label}: ${id} 沒有任何 w3x 藝術列 —— 這一招只剩通用原型`).toBeDefined();
      for (const docId of [art!.primary, ...art!.extra]) {
        expect(
          docId.startsWith("fx.prim."),
          `${label}: 解到 ${docId} —— 通用原型不是原作特效`,
        ).toBe(false);
        // ⚠️ `fx.w3x.stock.*` 是 GH#439 刻意的**候選** id（`stockEmitterIds` 是一條規則，
        // ⛔ 不是一張已抽取清單）：`extract_stock_vfx.py --min-refs` 沒收到的模型
        // 在播放時被 `this.doc()` 跳過，逐位元不影響行為。所以這一格只驗**真的
        // 承諾過會有**的那些 id，⛔ 不把一條刻意的候選規則誤判成缺陷。
        if (docId.startsWith("fx.w3x.stock.")) continue;
        const p = root(`content/vfx/${docId}.json`);
        expect(existsSync(p), `${label}: ${docId} 這份 vfx 文件不存在`).toBe(true);
        expect(zVfxDoc.parse(JSON.parse(readFileSync(p, "utf8"))).id).toBe(docId);
      }
    }
  });
});
