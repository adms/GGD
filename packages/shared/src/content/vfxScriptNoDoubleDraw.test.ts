/**
 * ⭐⭐ **一份演出腳本不可以畫技能自己已經在畫的東西**（GH#940 ⑤）。
 *
 * ── ⚠️ 這條票文的前提被量測改了**兩次**，兩次都值得記 ──────────────────────
 *
 * | 誰說的 | 說什麼 | 實際 |
 * |---|---|---|
 * | 票文 ⑤ | 「取代機制今天零個，而 **10/10 支真的雙播**」 | ⛔ 材質上錯的 |
 * | 我的第一次量測 | 「**0/10** 重疊 —— script 是刻意的補充」 | ⛔ **也錯**：我用 `vfxKey` 去比 `vfx` 段，⭐ 而那個段的欄位叫 **`vfxId`** |
 * | ⭐ 修正後 | **1/10** —— `godie-udea.r`（65-04 天譴）把 `fx.prim.lightning.nova-lg` 畫了兩次 | ⭐ 而它給得出出處 |
 *
 * ⇒ ⭐ 票文說對的那一半是「**取代機制今天零個**」：
 *   `VfxScriptPlayer.onEvent()` 之後 `switch` **直接往下走**（⛔ 無 early-return、
 *   ⛔ 無旗標）⇒ 兩條路都跑。
 * ⇒ ⛔ 而它說錯的那一半是「所以 10 支都雙播」——
 *   ⭐ 實際上另外 9 份的作者**知道**這件事，note 逐字寫著
 *   「h007/h008/h006 已住 ability 的三個 spawnModelFx 節點 ⇒ ⛔ 這裡不重複」。
 *
 * ── ⭐ 所以真缺口不是「缺一個取代機制」，是「**沒有任何東西在守那個不重疊**」──
 *
 * 今天成立**只因為 10 位作者各自小心**，而那個小心寫在**散文**裡（第三守則）。
 * ⚠️ 而下一份 script 很可能是**外部編輯器**產的 —— ⛔ 它讀不到那幾句 note。
 * ⇒ ⭐ 這一條就是那個契約：⛔ 不是建議，是一條會紅的閘。
 *
 * ⚠️ ⛔ **刻意不做「suppress 欄位」** —— 出貨內容今天**零支需要它**
 * （第零守則：⛔ 不要做一個沒有客戶的機制）。哪天真的有一支 script 想
 * **取代**而不是補充，那時候再做，而**那一天這條閘會指名它**。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { readVfxScriptExpanded, vfxSubtypeResolverFromDir } from "./vfxSubtypes/loadFromDir";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const SCRIPTS = join(CONTENT, "vfx-scripts");
const ABILITIES = join(CONTENT, "abilities");

/** 一個「畫出來的東西」—— 通道 ＋ 它的 key。 */
type Drawn = `${"vfx" | "model"}:${string}`;

/** 技能自己會畫的（⭐ 遞迴 —— `spawnProjectile.onHit` 底下也算）。 */
function abilityDraws(doc: Record<string, unknown>): Set<Drawn> {
  const out = new Set<Drawn>();
  const top = doc["vfxKey"];
  if (typeof top === "string" && top !== "") out.add(`vfx:${top}`);
  const walk = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      if (!n || typeof n !== "object") continue;
      const o = n as Record<string, unknown>;
      if (o["kind"] === "spawnVfx" && typeof o["vfxKey"] === "string") out.add(`vfx:${o["vfxKey"]}`);
      if (o["kind"] === "spawnModelFx" && typeof o["modelKey"] === "string")
        out.add(`model:${o["modelKey"]}`);
      for (const v of Object.values(o)) if (Array.isArray(v)) walk(v);
    }
  };
  walk(doc["effects"]);
  return out;
}

/**
 * 腳本會畫的。
 * ⚠️⚠️ **欄位名不同**：`vfx` 段是 **`vfxId`**（照抄 `spawnVfx` 的欄位），
 * `modelFx` 段是 `modelKey`。⭐ 我第一次量測就是拿 `vfxKey` 去比 `vfx` 段
 * ⇒ 量到 0 個重疊，⛔ 而真相是 1 個。
 */
function scriptDraws(doc: Record<string, unknown>): Set<Drawn> {
  const out = new Set<Drawn>();
  const segs = doc["segments"];
  if (!Array.isArray(segs)) return out;
  for (const s of segs) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    if (o["kind"] === "vfx" && typeof o["vfxId"] === "string") out.add(`vfx:${o["vfxId"]}`);
    if (o["kind"] === "modelFx" && typeof o["modelKey"] === "string")
      out.add(`model:${o["modelKey"]}`);
  }
  return out;
}

// GH#990：8 支腳本現在只剩 `{call}` 段 ⇒ 讀原始 JSON 看不到 modelKey／vfxId，要讀**展開後**的。
const RESOLVER = vfxSubtypeResolverFromDir(join(SCRIPTS, "..", "vfx-subtypes"));
const readScript = (f: string): Record<string, unknown> =>
  readVfxScriptExpanded(join(SCRIPTS, f), RESOLVER) as unknown as Record<string, unknown>;
const SCRIPT_FILES = readdirSync(SCRIPTS).filter((f) => f.endsWith(".json") && !f.startsWith("_"));

describe("演出腳本不可以重畫技能自己畫的東西（GH#940 ⑤）", () => {
  it("⭐ 儀器：出貨真的有腳本，而且它們真的畫了東西（⛔ 否則這條在量空氣）", () => {
    expect(SCRIPT_FILES.length, "⛔ 一份出貨腳本都沒有").toBeGreaterThan(0);
    const drawn = SCRIPT_FILES.map((f) =>
      scriptDraws(readScript(f)),
    ).reduce((n, s) => n + s.size, 0);
    expect(drawn, "⛔ 每一份腳本都不畫東西 ⇒ 下面那條永遠是綠的").toBeGreaterThan(0);
    // ⭐ 同一個儀器問反方向：技能那一側也真的畫了東西。
    const aDrawn = SCRIPT_FILES.map((f) => {
      const p = join(ABILITIES, f);
      return existsSync(p)
        ? abilityDraws(JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>).size
        : 0;
    }).reduce((n, x) => n + x, 0);
    expect(aDrawn, "⛔ 那幾支技能自己都不畫東西 ⇒ 重疊不可能發生").toBeGreaterThan(0);
  });

  it("⭐⭐ 沒有任何一份腳本畫了它的技能已經在畫的那一顆", () => {
    const bad: string[] = [];
    for (const f of SCRIPT_FILES) {
      const script = readScript(f);
      const aid = String(script["abilityId"] ?? script["id"] ?? "");
      const ap = join(ABILITIES, `${aid}.json`);
      if (!existsSync(ap)) continue;
      const ability = JSON.parse(readFileSync(ap, "utf8")) as Record<string, unknown>;
      const overlap = [...scriptDraws(script)].filter((k) => abilityDraws(ability).has(k));
      for (const k of overlap) bad.push(`${aid} → ${k}`);
    }
    expect(
      bad,
      "⛔ 這幾份腳本畫了技能**已經在畫**的東西 ⇒ 同一顆被畫兩次。\n" +
        "   ⚠️ 兩條路都會跑：`VfxScriptPlayer.onEvent()` 之後 `switch` 直接往下走\n" +
        "     （⛔ 無 early-return、⛔ 無旗標）。\n" +
        "   ⇒ ⭐ 修法是把**腳本**那一段拿掉，並在 `notes` 寫下「已住 ability ⇒ 這裡不重複」\n" +
        "     （另外九份都是這樣寫的）。⛔ 不要改這條測試。",
    ).toEqual([]);
  });
});
