/**
 * ⭐ 社群施法提示退路的承重守衛（`communityCueFallback.ts`，lane lol-vfx 2026-09-15）。
 *
 * 跑的是**出貨的東西**：出貨內容 → 出貨載入器 → 出貨註冊接縫（`registerAll`）→ 註冊表。
 * 問三件事，⭐ 分母一起印出來（⛔ 不是只回一個「綠」）：
 *   ① 規則的母體（單卡模板技 × 施法格 × 作者沒挑特效）裡，**每一支**都讀得懂 —— 讀不懂的逐支指名
 *   ② 規則挑中的每一支，註冊表上的 `vfxKey` 就是規則的答案（接縫真的接上，⛔ 不是只有函式對）
 *   ③ 那一份特效**存在**，而且**不是必不可見**（粒子會噴、會活、有面積、看得到 alpha）
 * 突變（記在 commit）：`content/config/vfx-scripts.json` 的 `communityCueFallback` 改 false
 * ⇒ `apps/client/src/render/vfx/bindings.test.ts` 紅，逐支指名 35 支。
 */
import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { FsContentSource } from "./node/FsContentSource";
import { registerAll, VfxDefs } from "./registries";
import { Abilities } from "../sim/content/registry";
import type { AbilityId } from "../ids";
import type { TemplateDoc } from "./schema/template";
import { communityCueFallbackFor } from "./communityCueFallback";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const CAST_SLOTS = new Set(["Q", "W", "E", "R", "EX"]);

describe("community cue fallback — 作者沒挑施法特效的社群技能（載入時）", () => {
  it("母體每一支都讀得懂、註冊表拿到規則的答案、那份特效存在且看得到", async () => {
    const { store } = await new ContentLoader(new FsContentSource(CONTENT)).load();
    registerAll(store);
    const templates = new Map(store.all<TemplateDoc>("ability-templates").map((t) => [t.id, t]));

    const filled: string[] = [];
    const unreadable: string[] = [];
    for (const raw of store.all<Record<string, unknown>>("abilities")) {
      const id = String(raw["id"]);
      const authored = Boolean(raw["vfxKey"]) || (Array.isArray(raw["vfxLayers"]) && raw["vfxLayers"].length > 0);
      if (!CAST_SLOTS.has(String(raw["slot"])) || authored || !raw["template"]) continue;
      const pick = communityCueFallbackFor(raw, templates);
      if (!pick) {
        unreadable.push(id);
        continue;
      }
      const def = Abilities.tryGet(id as AbilityId) as { vfxKey?: string; vfxLayers?: { vfxKey: string }[] } | undefined;
      expect(def?.vfxKey, `${id}：註冊表沒有拿到規則的答案（接縫沒接上）`).toBe(pick.vfxKey);
      expect(def?.vfxLayers?.map((l) => l.vfxKey)).toEqual([pick.vfxKey]);
      const vfx = VfxDefs.tryGet(pick.vfxKey);
      expect(vfx, `${id} → ${pick.vfxKey}：content/vfx 裡沒有這一份`).toBeDefined();
      const emits = vfx!.mode === "burst" ? (vfx!.burstCount ?? 0) : (vfx!.rate ?? 0);
      const peakSize = Math.max(vfx!.size.start, ...(vfx!.sizeStops ?? []).map((s) => s[1]));
      const colors = vfx!.colorStops?.length ? vfx!.colorStops.map((s) => s[1]) : [vfx!.color.start, vfx!.color.end];
      const peakAlpha = Math.max(...colors.map((c) => c[3]));
      expect({ id, emits: emits > 0, lives: vfx!.lifetimeSec.max > 0, size: peakSize > 0, alpha: peakAlpha > 0.05 }).toEqual({
        id, emits: true, lives: true, size: true, alpha: true,
      });
      filled.push(`${id}→${pick.vfxKey}${pick.unexpressed.length ? `（表達不了：${pick.unexpressed.join("、")}）` : ""}`);
    }
    console.info(`[communityCueFallback] 規則補上 ${filled.length} 支：\n  ${filled.join("\n  ")}`);
    // ⛔ 母體塌了（規則一支都沒補）＝ 這條守衛結構上永遠綠 —— 先自證。
    expect(filled.length, "規則一支都沒補 —— 母體或接縫壞了（量尺自證）").toBeGreaterThan(0);
    expect(unreadable, "⛔ 這些施法技沒有作者特效，而社群施法提示規則讀不懂它們（多卡／被動家族／命中時才播）").toEqual([]);
  }, 120_000);
  it("只補編輯器產生的技能 —— 其他層（owner-spec／JASS／w3x）漏綁照樣交給 bindings.test 紅", async () => {
    const { store } = await new ContentLoader(new FsContentSource(CONTENT)).load();
    const templates = new Map(store.all<TemplateDoc>("ability-templates").map((t) => [t.id, t]));
    const sample = store.all<Record<string, unknown>>("abilities").find((a) => a["id"] === "lol-karthus.e")!;
    expect(communityCueFallbackFor(sample, templates)).not.toBeNull();
    for (const provenance of ["owner-spec", "jass-verified", "w3x-tooltip", "w3x-import", undefined]) {
      expect(communityCueFallbackFor({ ...sample, provenance }, templates)).toBeNull();
    }
  });
});
