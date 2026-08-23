/**
 * ⛔ **一張寫著「[主動]」的卡，按下去必須真的跑一段效果。**（GH#563）
 *
 * 第四個姊妹閘。它問的是一句話：**這一格按下去，`runEffects` 會不會拿到東西？**
 *
 * ── ⚠️ GH#563 的前提是**錯的**，而錯法本身就是這條閘存在的理由 ──────────────
 *
 * 票上寫「四張上架卡的 `effects` 是空陣列 ⇒ 按下去什麼都不發生」。實測：
 * 那四支的 `effects` 在**磁碟上**是空的，內容住在 `template.ref` 裡，`registerAll`
 * 會把它展開（`content/templates/resolve.ts`）。掃磁碟 JSON 會得到 **69 個假的空技能**
 * ——失敗形態⑤「被測的不是出貨的那個」。⇒ ⭐ 這條閘讀的是**登錄表裡那一份**。
 *
 * ── 為什麼它不能併進既有的三支 ────────────────────────────────────────────
 *
 * | 既有守衛 | 它問的 | 為什麼看不到這一族 |
 * |---|---|---|
 * | `abilityNoOpEffects` | 這支技能**有沒有任何載體**改得動一個數字 | `passive` / `marks` 算載體 ⇒ 一支「主動格裡塞被動」的技能對它是綠的 |
 * | `descriptionClaims` | 卡面的**數字**與效果樹對不對得上 | 它連 `def.passive` 一起攤平 ⇒ 數字都在，只是按鍵讀不到 |
 * | `abilityCastClaims` | 玩家給的**輸入**有沒有人讀 | 它只看 `castType` 與 `[召喚]`，⛔ 不問「按下去跑不跑」 |
 *
 * ⭐ 這條的載體是**「標籤列」與「`effects` 空不空」之間的關係**，而每一半單獨看
 * 都是合法的：`effects: []` 對 Zod 合法、對 `content:build` 合法；`[主動攻擊]`
 * 只是一段中文。⛔ 沒有任何既有的閘會紅（第一·五守則的形狀）。
 *
 * ── 判準：⛔ 保守，寧可漏報不可誤報 ────────────────────────────────────────
 *
 * 只收**證明得出來**的那一種：`sim/abilities/abilitySystem.ts:582`
 * `if (isPassiveOnly(def)) return "passive"` —— `isPassiveOnly` 逐字是
 * 「有 `passive` 區塊而且 `effects.length === 0`」，所以空 `effects` 的那一格
 * **在付出任何成本之前**就被擋掉，按下去連冷卻都不會轉。
 *
 * 標籤集合是**推導**的（`tag.startsWith("主動")`），⛔ 不是一張手寫清單：
 *   · `[主動]` / `[主動攻擊]` / `[主動傷害]` / `[輔助攻擊]`→ 只有 `主動*` 收
 *   · ⛔ `[輔助]`（83 支）刻意不收 —— 出貨內容裡它有兩個讀法，`godie-h02u.passive`
 *     與 `godie-o02p.passive` 是掛著 `[輔助]` 的**天生被動**，收了就是兩筆誤報
 *   · ⛔ `[切換]` 不收 —— 切換技的載體是 `toggle.whileOn`，⛔ 不是 `effects`
 *
 * ⚠️ 剖析之前先剝掉 `「…」`（第〇·六守則②，角色對白不是效果）—— 這裡用
 * `descriptionClaims.mechanicsText`，⛔ 不自己再寫一份正則。
 *
 * ── 棘輪：⛔ 只准降 ────────────────────────────────────────────────────────
 * `KNOWN` 今天是**空的**（全樹 0 支）。冒出新的一支 → 紅；名單上的修好了 → 也紅。
 * ⛔ 要放行新的一列必須先開 issue 並把編號寫在那一列上。
 *
 * 突變紀錄：拿掉 `godie-osam.r` 的 `template`（⇒ 展開後 `effects` 真的空了）
 * → 紅，訊息指名 `godie-osam.r|active-card-nothing-on-press`。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "./registries";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
  championPassive,
} from "../sim/content/registry";
import type { AbilityDef } from "../sim/content/defs";
import { leadTags, mechanicsText } from "./descriptionClaims";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

/** ⛔ 只准變短。一列一個，每一列要有 issue 編號（第零守則⑧）。 */
const KNOWN: readonly { key: string; why: string; issue: string }[] = [];

type Def = AbilityDef & { description?: string };

/** 卡面承諾「按下去會發生事」的標籤 —— 從標籤文字**推導**，⛔ 不是白名單。 */
const promisesPress = (desc: string | undefined): string | undefined =>
  leadTags(mechanicsText(desc ?? "")).find((t) => t.startsWith("主動"));

let hits: { key: string; where: string; why: string }[] = [];

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);

  hits = [];
  for (const cid of Champions.ids().sort()) {
    const c = Champions.get(cid);
    const ex = (c as unknown as { exAbility?: string }).exAbility;
    const slots: Readonly<Record<string, Def | undefined>> = {
      PASSIVE: championPassive(cid) as Def | undefined,
      Q: c.abilities.Q as Def | undefined,
      W: c.abilities.W as Def | undefined,
      E: c.abilities.E as Def | undefined,
      R: c.abilities.R as Def | undefined,
      EX: ex ? (Abilities.tryGet(ex as never) as Def | undefined) : undefined,
    };
    for (const [slot, def] of Object.entries(slots)) {
      if (!def) continue;
      const tag = promisesPress(def.description);
      if (tag === undefined) continue;
      if ((def.effects ?? []).length > 0) continue;
      hits.push({
        key: `${def.id}|active-card-nothing-on-press`,
        where: `${c.name}（${cid}）${slot}`,
        why:
          `卡面標籤列寫著 [${tag}]，而展開後的 effects 是空的 —— ` +
          `abilitySystem.ts 的 isPassiveOnly() 會把這一次施放擋成 "passive"，按下去不會執行任何東西`,
      });
    }
  }
});

describe("一張 [主動] 的卡，按下去必須真的跑一段效果（GH#563）", () => {
  it("⛔ 名單外不可以有新的「按下去什麼都不發生」", () => {
    const allowed = new Set(KNOWN.map((k) => k.key));
    const fresh = hits.filter((h) => !allowed.has(h.key));
    expect(
      fresh.map((h) => `${h.key}  ${h.where}\n    ${h.why}`).join("\n"),
      `${fresh.length} 支上架技能的卡面說「主動」而引擎收不到任何效果`,
    ).toBe("");
  });

  it("⛔ 名單只准變短 —— 修好了就要把那一列劃掉", () => {
    const live = new Set(hits.map((h) => h.key));
    const stale = KNOWN.filter((k) => !live.has(k.key)).map((k) => `${k.key}（${k.issue}）`);
    expect(stale.join("\n"), "這幾列已經修好了，把它們從 KNOWN 刪掉").toBe("");
  });
});
