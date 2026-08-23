/**
 * ⭐ GH#649 —— Saber 持劍的金粉閃爍（`persistentVfx` @ hand,right）。
 *
 * 原作逐字（war3map.j:32306，Trig_Excalibur_Actions）：第一次施放 E 時
 * `AddSpecialEffectTargetUnitBJ("handright", u, "Magical_Sword.mdx")`，掛上後
 * 從不 DestroyEffect ⇒ 常駐武器金粉。GGD 側 = 20-03 的 `persistentVfx`
 * （`when` 缺席 = E 學到就掛著，GH#603 的學習閘）。
 *
 * 薄守衛（⛔ 不驗任何顏色/速率/尺寸數字 —— 那些是 vfx 文件自己的調校）：
 *  ① 出貨的 E（standalone 與 champion 內嵌鏡射**兩份**）都帶這一格，且客戶端
 *     今天算得出來（`when` 缺席）—— 產生器來源那一行拿掉，這裡當場紅。
 *  ② vfxKey 指向的文件真的存在、過嚴格 Zod（lane 期間 content:build 上鎖，
 *     這裡就是這份手寫文件唯一會當場響的驗證），而且掛在骨頭上（anchorBone）。
 *  ③ ⛔ 文件不可以帶 `ambient: true`：ambient+continuous+anchorBone 三件齊 =
 *     `isSwingTrailDoc`（apps/client/src/vfx/swingTrailMath.ts）⇒ 刀光預算的
 *     揮劍閘把站著不動的金粉壓到近零 —— 與「沒做」在畫面上長得一模一樣
 *     （第二守則失敗形態②）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { zVfxDoc } from "./schema/vfx";

const CONTENT = join(__dirname, "../../../../content");
const read = (p: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(CONTENT, p), "utf-8")) as Record<string, unknown>;

interface Pv {
  vfxKey?: unknown;
  when?: unknown;
}

function pvOf(ability: Record<string, unknown>): Pv[] {
  const pv = ability["persistentVfx"];
  expect(Array.isArray(pv), "20-03 的 persistentVfx 不見了（產生器來源那一行被拿掉了？）").toBe(
    true,
  );
  return pv as Pv[];
}

describe("Saber 武器金粉常駐特效 (GH#649)", () => {
  const standalone = read("abilities/godie-e002.e.json");
  const champion = read("champions/godie-e002.json");
  const embedded = (champion["abilities"] as Record<string, Record<string, unknown>>)["E"]!;

  it("standalone 與 champion 鏡射的 E 都掛著同一份、客戶端今天算得出來的常駐特效", () => {
    for (const ability of [standalone, embedded]) {
      const specs = pvOf(ability);
      expect(specs.length).toBeGreaterThan(0);
      // `when` 缺席 = 客戶端（persistentVfxKeysFor）今天就算得出來的那一批
      expect(specs.every((s) => s.when === undefined)).toBe(true);
    }
    expect(pvOf(embedded)).toEqual(pvOf(standalone));
  });

  it("vfxKey 指向的金粉文件存在、過嚴格 Zod、掛在骨頭上、而且不會被揮劍閘藏起來", () => {
    const key = String(pvOf(standalone)[0]!.vfxKey);
    const raw = read(`vfx/${key}.json`); // 不存在 ⇒ ENOENT 當場紅（場上永遠是空的）
    const parsed = zVfxDoc.safeParse(raw);
    expect(parsed.success, JSON.stringify(parsed.success ? "" : parsed.error.issues)).toBe(true);
    if (!parsed.success) return;
    const doc = parsed.data;
    // 常駐的武器微粒：跟著骨頭（⛔ 不是腳下 root），一直噴（⛔ 不是一發 burst）
    expect(doc.mode).toBe("continuous");
    expect(doc.anchorBone).toBeDefined();
    // ⛔ ambient+continuous+anchorBone = isSwingTrailDoc ⇒ 站著不動時被壓到近零
    expect(doc.ambient, "ambient:true 會讓金粉吃揮劍閘 —— 靜止時整個看不見").not.toBe(true);
  });
});
