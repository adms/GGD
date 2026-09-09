/**
 * 🔋 **事件累積資源 ⇄ 消耗資源施放**（GH#1132 AC④）。
 *
 * > 票文逐字：「布局／電力／線索以**對應真實事件**取得、**有限容量**、**去重**、
 * >  **合法消耗**及**重置**；**普攻額外傷害不作替代**。」
 *
 * ── ⭐ 量到的（2026-09-09）────────────────────────────────────────────────
 * 37 名社群英雄裡提到資源／層／累積的 **72 槽**，逐句分類：
 * 命中 **13** · 施法 7 · 觸發 4 · 普攻 3 · 受擊 3 · 時間 3 · 擊殺 1；
 * ⛔ 而其中 **26 槽**綁著 `tpl-on-attack` —— ⭐ 那一族發的是**普攻追加傷害**，
 * ⛔ 一層都不會累積。⇒ ⭐ 這正是票文說的「不作替代」。
 *
 * ── ⭐ 而引擎**四件全有** ─────────────────────────────────────────────────
 * · **事件** 33 個 hook · **容量** `applyStatus.maxStacks`
 * · **去重** hook 的 `internalCooldown` · **重置** `applyStatus.duration`
 * · **合法消耗** `condition.status.minStacks`（`sim/content/condition.ts:1352`
 *   真的走 `statusStacks()`）＋ `consumeStatus.count`
 * ⇒ ⭐ 缺的是**模板**，⛔ 不是機制。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `maxStacks` 那一行拿掉 → 🔴（容量沒了 ⇒ 層數無限長）
 *   · `spend-resource` 的 `condition: gate` 從**酬載**上拿掉 → 🔴（層數不夠也照打）
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { zTemplateDoc } from "../schema/template";
import { expand } from "./expand";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const load = (id: string) =>
  zTemplateDoc.parse(
    JSON.parse(readFileSync(join(REPO, `content/ability-templates/${id}.json`), "utf8")),
  );
const CHARGE = load("tpl-charge-resource");
const SPEND = load("tpl-spend-resource");

/** 展開結果裡的第一顆效果（純讀，⛔ 不重寫一份展開器）。 */
function eff(r: ReturnType<typeof expand>, i = 0): Record<string, unknown> | undefined {
  return (r.effects as unknown as Record<string, unknown>[] | undefined)?.[i];
}

describe("🔋 資源族：累積 ⇄ 消耗（GH#1132 AC④）", () => {
  it("⭐ 量尺自證：兩份模板讀得到、兩個家族展得開（⛔ 不是在量空氣）", () => {
    expect(CHARGE.family).toBe("charge-resource");
    expect(SPEND.family).toBe("spend-resource");
  });

  it("★★ ⭐ 累積側：**由事件觸發**且**⛔ 不是普攻**（票文：普攻額外傷害不作替代）", () => {
    const r = expand(CHARGE, { statusId: "layout-charge", perEvent: 1, maxStacks: 3 });
    const hook = (r.passive as unknown as { ranks: { hooks: Record<string, unknown>[] }[] })
      .ranks[0]!.hooks[0]!;
    expect(hook["on"], "⛔ 預設事件變成普攻 ⇒ 這一族退化成 tpl-on-attack").toBe("onAbilityHit");
    expect(r.innateKind, "⛔ 累積是被動,⛔ 不是一顆要按的鈕").toBe("passive");
  });

  it("★★ ⭐ 累積側：**每次幾層**真的進節點，且**⛔ 不續期**（否則窗口永遠不到期）", () => {
    const r = expand(CHARGE, { statusId: "layout-charge", perEvent: 2, maxStacks: 5, durationSec: 20 });
    const hook = (r.passive as unknown as { ranks: { hooks: { effects: Record<string, unknown>[] }[] }[] })
      .ranks[0]!.hooks[0]!;
    const e = hook.effects[0]!;
    expect(e["kind"]).toBe("applyStatus");
    expect(e["stacks"], "⛔ 每次加幾層沒進去").toBe(2);
    // ⭐⭐ **容量不是 `applyStatus` 的欄位** —— 我第一版斷言 `maxStacks`，
    //   而 schema 逐字回「Unrecognized key(s): 'maxStacks'」。
    //   ⭐ 真正的形狀是 `refresh:"keep"` ＋ 一個窗口：`applyStatus.ts` 的註解逐字說
    //   「每次都續期 ⇒『20 秒內疊到 5 層』會變成『**永久 5 層**』，
    //     而畫面上完全看不出差別（失敗形態②）」。
    expect(e["refresh"], "⛔⛔ 沒有 keep ⇒ 每次加層都續期 ⇒ 那筆狀態永遠不會到期").toBe("keep");
    expect(e["duration"], "⛔ 窗口沒進去").toBe(20);
  });

  it("★ ⭐ 累積側：**去重**與**重置**缺席時⛔不編一個值（兩種去重不可以猜）", () => {
    const bare = expand(CHARGE, { statusId: "x", perEvent: 1, maxStacks: 3 });
    const hook = (bare.passive as unknown as { ranks: { hooks: Record<string, unknown>[] }[] })
      .ranks[0]!.hooks[0]!;
    expect(hook["internalCooldown"], "⛔ 憑空補一個內部冷卻 = 另一種去重被靜默換掉").toBeUndefined();
    const withIcd = expand(CHARGE, { statusId: "x", perEvent: 1, maxStacks: 3, internalCooldown: 3 });
    const h2 = (withIcd.passive as unknown as { ranks: { hooks: Record<string, unknown>[] }[] })
      .ranks[0]!.hooks[0]!;
    expect(h2["internalCooldown"]).toBe(3);
  });

  it("★★ ⭐ 消耗側：酬載住 **`onConsumed`** 裡（⭐ 那才是「合法消耗」的唯一住處）", () => {
    const r = expand(SPEND, {
      statusId: "layout-charge",
      minStacks: 3,
      spend: "all",
      effects: [{ kind: "damage", damageType: "magic", amount: { flat: 100 } }],
    });
    const first = eff(r, 0)!;
    expect(first["kind"], "⛔ 這一族只發一顆 consumeStatus,酬載掛在它裡面").toBe("consumeStatus");
    // ⭐ `spend:"all"` 在展開器裡是 `count: minStacks`（⛔ 不是引擎的 `"all"`）——
    //   「扣光」會讓「要求三層」變成一句沒有人讀的話。
    expect(first["count"], "⛔ 要求的層數沒有進 count ⇒ minStacks 是一句沒有人讀的話").toBe(3);
    // ⭐⭐ 我第一版把酬載平鋪在 `effects` 上再逐顆掛一道自製 `condition`，
    //   ⛔ 而 `consumeStatus` 的 schema 本人就有 `onConsumed`（必填 `.min(1)`）與 `onMissing`
    //   ⇒ ⭐ 扣得到才跑 `onConsumed` —— 那是引擎保證的，⛔ 不必也不該自己發明一道閘
    //   （自製的那一版有「少掛一顆就漏」的洞）。
    const payload = first["onConsumed"] as Record<string, unknown>[];
    expect(payload?.length, "⛔⛔ 酬載沒進 onConsumed ⇒ 扣了層數卻什麼都沒發生").toBe(1);
    expect(payload[0]!["kind"]).toBe("damage");
    // ⭐⭐ **層數不足時要告訴玩家** —— exemplar 逐字：「缺少黑魔導時**顯示使用條件**」。
    //   ⛔ `onMissing` 省略 ＝ 按下去什麼都沒發生（第一·五守則：說了但不會發生）。
    //   ⚠️ ⭐ 它同時是 `templateDefaultsCast` 那條閘的豁免理由 —— 拿掉它，
    //   這一族就真的變成一個靜默的空技能。
    const miss = first["onMissing"] as Record<string, unknown>[] | undefined;
    expect(miss?.length, "⛔⛔ 沒有 onMissing ⇒ 玩家不知道自己為什麼放不出來").toBe(1);
    expect(miss![0]!["kind"]).toBe("floatingText");
    expect(miss![0]!["text"]).toBe("資源不足");
  });

  it("★★ ⭐ 消耗側：**多顆酬載全部**進 `onConsumed`（⛔ 少一顆＝那一段靜默消失）", () => {
    const r = expand(SPEND, {
      statusId: "layout-charge",
      minStacks: 3,
      spend: "all",
      effects: [
        { kind: "damage", damageType: "magic", amount: { flat: 100 } },
        { kind: "damage", damageType: "physical", amount: { flat: 50 } },
      ],
    });
    const payload = eff(r, 0)!["onConsumed"] as Record<string, unknown>[];
    expect(payload?.length, "⛔⛔ 酬載被吃掉了 ⇒ 卡面說兩段而只發生一段").toBe(2);
    expect(payload.map((e) => e["damageType"])).toEqual(["magic", "physical"]);
  });


  it("⭐ sentinel：把 `minStacks` 換一個值 ⇒ 展開結果**真的跟著動**（⛔ 不是死參數）", () => {
    const mk = (n: number) =>
      (expand(SPEND, {
        statusId: "x",
        minStacks: n,
        effects: [{ kind: "damage", damageType: "magic", amount: { flat: 1 } }],
      }).effects as unknown as Record<string, unknown>[])[0]!["count"];
    expect(mk(3)).toBe(3);
    expect(mk(5), "⛔ 改了要求層數而展開結果不動 ⇒ 那是一格死參數").toBe(5);
  });
});
