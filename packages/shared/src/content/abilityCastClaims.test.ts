/**
 * ⛔ **技能不可以向玩家要一個它不會讀的輸入，也不可以掛一個它沒有的機制。**
 * （GH#405 / GH#404，owner 2026-08-19）
 *
 * 第三個姊妹閘。⛔ 刻意不住進 `abilityNoOpEffects` / `noOpModifierClaims`：
 * 那兩支的合約逐字是「有沒有可能**改變任何一個數字**」，而這一族**每個數字都動得到**
 * —— 壞的是「玩家給的輸入」與「卡片上的標籤」。硬塞進去＝放寬那條合約。
 *
 *   ① #405 `castType:"ground"` 要玩家指定地點，而 `randomArea` 的圓心是
 *      `world.transform.get(who==="target" ? ctx.targets[0] : ctx.caster)`
 *      （`sim/effects/randomArea.ts`）—— **`ctx.point` 一次都沒被讀** ⇒ 瞄哪都一樣。
 *   ② #404 標籤列的 `[召喚]` 承諾「場上會多出身體」，而效果樹裡沒有 `summon`。
 *
 * ⚠️ 讀**登錄表裡那一份**（真的 `ContentLoader` + `registerAll`），⛔ 不是磁碟 JSON
 * —— 一百多支技能的內容住在 `template.ref` 裡（失敗形態⑤）。
 * ⛔ 斷言裡一個出貨數字都沒有（第二守則：驗機制不驗數字）。
 * 突變紀錄：`godie-efur.r.castType` self→ground → 紅（指名該支 + 規則①）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { FsContentSource } from "./node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "./registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../sim/content/registry";
import type { AbilityDef } from "../sim/content/defs";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

/**
 * 已知缺口，一列一個。⛔ 不是「這樣寫沒關係」的清單，是「今天壞的、修它不歸這一輪」
 * 的帳（第零守則⑧）。修好必須刪列，否則 stale 斷言會紅（名單只能變短）。
 */
/**
 * ⭐ 2026-08-20（GH#479）**名單清空了**，而清空它的不是「修好了」，是
 * `godie-nplh`（通靈人 - 麻倉葉，2026-08-16 下架）連同技能檔搬進了
 * `content/_legacy/` —— 唯一一列 `godie-nplh.e|summon-tag-no-body`
 * （16-04 劍之精靈：標籤寫[召喚]、展開的卻是 tpl-single-strike）因此不再出貨。
 * ⚠️ 那個缺陷**沒有被修好**，只是不再有玩家碰得到；哪天麻倉葉重新上架，
 * 下面的掃描會立刻把它報回來（⛔ 到時候不要重新加進這張表，去修它）。
 */
const KNOWN: readonly { key: string; why: string }[] = [];

/** 效果樹裡所有節點（含巢狀 onHit / branches / onEnd …）。 */
function* walk(n: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(n)) {
    for (const v of n) yield* walk(v);
  } else if (n && typeof n === "object") {
    yield n as Record<string, unknown>;
    for (const v of Object.values(n as Record<string, unknown>)) yield* walk(v);
  }
}

/** 標籤只讀**第一行** —— 內文的 `[MP]`／`[定身]` 是強調不是機制承諾。 */
const leadTags = (d: string | undefined): string[] =>
  [...(d ?? "").split("\n")[0]!.matchAll(/\[([^[\]]+)]/g)].map((m) => m[1]!);

const promisesSummon = (d: string | undefined): boolean =>
  leadTags(d).some((t) => t.includes("召喚") || t.includes("招喚"));

type Def = AbilityDef & { description?: string };
let defs: Def[] = [];
let hits: { key: string; why: string }[] = [];

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);

  defs = Abilities.ids()
    .sort()
    .map((id) => Abilities.get(id) as Def);
  hits = [];
  for (const def of defs) {
    const nodes = [...walk(def.effects ?? [])];
    // ① ⭐ 可以**證明**的，⛔ 不是「看起來可疑」：randomArea 的錨點解析式裡沒有
    //    `ctx.point`，而 ground 施法存在的唯一理由就是那個 point。
    if (
      def.castType === "ground" &&
      nodes.some((n) => n.kind === "randomArea" && (n.who ?? "self") !== "target")
    ) {
      hits.push({
        key: `${def.id}|ground-cast-point-ignored`,
        why: "ground 施法要玩家指定地點，但落點來自 randomArea{who:\"self\"}（讀施法者，⛔ 不讀 ctx.point）",
      });
    }
    // ② 標籤承諾了身體，效果樹裡沒有身體。
    if (promisesSummon(def.description) && !nodes.some((n) => n.kind === "summon")) {
      hits.push({
        key: `${def.id}|summon-tag-no-body`,
        why: "標籤列帶 [召喚]，效果樹裡沒有 summon —— 場上一具身體都不會多出來",
      });
    }
  }
});

describe("GH#405 / GH#404 — 技能不可以要一個沒人讀的輸入，或掛一個沒有的機制", () => {
  it("ground 技的落點真的被讀；[召喚] 標籤真的有身體", () => {
    const known = new Set(KNOWN.map((k) => k.key));
    expect(
      hits.filter((h) => !known.has(h.key)).map((h) => `${h.key} —— ${h.why}`),
      "⛔ 修法是換成做得到的機制（加 summon／改成讀 point），或把 castType/標籤改成符合內文" +
        "（第〇·六守則細則①：內文 > 標籤）—— ⛔ 不是加進 KNOWN。",
    ).toEqual([]);
  });

  it("KNOWN 名單上沒有已修好的殘留，而且兩條規則都不是空掃", () => {
    const live = new Set(hits.map((h) => h.key));
    expect(KNOWN.filter((k) => !live.has(k.key)).map((k) => k.key), "修好了就刪列").toEqual([]);
    // ⛔ 不釘出貨支數。這只擋「beforeAll 靜默失敗 / 規則的母體整個消失」——
    // 母體空了的話上面那條會假綠。
    expect(defs.length).toBeGreaterThan(Champions.ids().length * 4);
    expect(defs.filter((d) => [...walk(d.effects ?? [])].some((n) => n.kind === "randomArea")).length)
      .toBeGreaterThan(0);
    // ⭐ 2026-08-20（GH#479）：這一行本來要求「出貨樹裡至少有一支 [召喚]」。
    // 麻倉葉 godie-nplh 搬進 `_legacy` 之後那個數字**合法地**變成 0（僅存的五支
    // [召喚] 全在封存區），於是它擋的東西從「掃描器壞了」變成「內容剛好沒有」。
    // ⛔ 反貧化不可以就這樣刪掉 —— 改成驗**謂詞本身**還活著：它認得 [召喚]／[招喚]，
    // 而且⛔ 只讀第一行（內文的 `[召喚]` 是強調不是機制承諾）。
    // 哪天有人做了一支 [召喚] 技能，上面那條真掃描立刻接手。
    expect(promisesSummon("[召喚][AP加成] 叫出一具身體")).toBe(true);
    expect(promisesSummon("[招喚] 舊字")).toBe(true);
    expect(promisesSummon("[物理] 一發傷害\n然後 [召喚] 一具身體")).toBe(false);
  });
});
