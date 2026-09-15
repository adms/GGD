/**
 * apCoeffWired.test.ts —— AP 係數公式**真的在載入時生效**（GH#1035，owner 2026-09-06「全部技能接上公式」）。
 *
 * ⛔⛔ 這條閘存在的理由：#942 做了公式、#945 做了「載入時套到文件上」那一層，
 * ⭐ 而**沒有任何一行**在技能註冊時呼叫它 —— 後台那格 `enabled: true` 是一個沒有消費端的開關，
 * 玩家拿到的仍是樹上手填的 125 個 `coeff`（失敗形態⑧ 第二次）。掃字串抓不到這種病：
 * 函式在、開關在、後台頁在，只是沒有人叫。⇒ 這裡**載入出貨內容、跑真的 `registerAll`、讀註冊表**。
 *
 * ⭐ 兩個方向（一把只驗過單邊的尺不算自證過）：
 *   ① 開關**開**（出貨）：註冊表裡的 `coeff` ＝ 公式值，⛔ 不等於 JSON 的字面值。
 *   ② 開關**關**：註冊表裡的 `coeff` ＝ JSON 的字面值（逐位元回到手填 —— 那格就是 rollback）。
 * 靈魂層（傷害數字）⇒ 一次突變（把 `withApCoeff` 從 `withTiers` 拿掉 ⇒ ① 紅），記在 commit 訊息。
 *
 * ⭐ ③④（GH#1260 B4）係數取整 `roundStep`：③ 出貨設定下註冊表每一條 AP 係數都在格子上；
 *   ④ 換成 schema 允許的最細粒度（＝rollback）同一把尺量得到離格的。
 *   突變（2026-09-15）：`resolveApCoeff` 的粒度寫死 0.0001 ⇒ ③ 紅（265 條離格）。
 *
 * ⚠️ 挑的樣本是 06-02 山形修煉-變（`godie-ucrl.w`）：owner 2026-09-06 裁決保留手填 1.0（同編號兩形態一致），
 * 而公式給 0.158 ⇒ 兩個值**刻意不同**，正好能分辨「公式贏」與「字面值贏」。⛔ 不把 0.158 寫死 —— 用同一支
 * `resolveApCoeff` 從**原始文件**算期望值；突變拿掉接線時註冊表回到 1.0，斷言仍然紅。
 */
import { describe, it, expect } from "vitest";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import { registerAll } from "./registries";
import { Abilities } from "../sim/content/registry";
import { apCoeffCooldownFor, apCoeffInputsFrom, forEachApRatio, resolveApCoeff, DEFAULT_AP_COEFFICIENT } from "./apCoefficient";
import { zConfigApCoefficientDoc } from "./schema/config/apCoefficient";

// ⚠️ 2026-09-06 從 06-02 山形修煉-變 換成 42-01 凍結的大地：06-02 照 owner「被動就被動」改成 passive hook，
//   頂層 effects 空了；42-01 是頂層單一 damage 節點，公式值（0.1169）與字面值（0.6）刻意不同，同樣分得出誰贏。
const ID = "godie-n01g.q";

function apCoeffOf(def: unknown): number {
  const eff = (def as { effects: { kind: string; amount?: { ratios?: { stat: string; coeff: number }[] } }[] }).effects;
  const dmg = eff.find((e) => e.kind === "damage");
  const r = dmg?.amount?.ratios?.find((x) => x.stat === "ap");
  if (!r) throw new Error(`${ID} 沒有 ap ratio —— 夾具壞了，⛔ 不是公式壞了`);
  return r.coeff;
}

describe("AP 係數公式在載入時生效（GH#1035）", () => {
  it("① 開關開：註冊表裡的 coeff ＝ 公式值，⛔ 不是 JSON 的字面值；② 開關關：回到字面值", async () => {
    const store = (await new ContentLoader(shippedContentSource()).load()).store;
    const raw = store.get("abilities", ID) as Record<string, unknown> | undefined;
    if (!raw) throw new Error(`出貨內容沒有 ${ID}`);
    const literal = apCoeffOf(raw);
    const cdDoc = store.all<{ schema?: string }>("config").find((c) => c.schema === "config.cooldown-tiers@1") as
      | { seconds?: Record<string, Record<string, number>> }
      | undefined;
    const node = (raw.effects as Record<string, unknown>[]).find((e) => e["kind"] === "damage")!["amount"] as Record<string, unknown>;
    const { mid, sec } = apCoeffCooldownFor(raw, node, cdDoc);
    const expected = resolveApCoeff(apCoeffInputsFrom(raw, node, mid, sec), DEFAULT_AP_COEFFICIENT);
    expect(expected, "公式對這一支要給出一個值（出貨開關是開的）").not.toBeNull();
    expect(expected, "夾具前提：公式值與字面值要**不同**，否則分不出誰贏").not.toBeCloseTo(literal, 6);

    // ① 開關開（出貨設定）
    registerAll(store);
    expect(apCoeffOf(Abilities.get(ID as never)), "⛔ 註冊表裡還是字面值 —— 公式沒接上（失敗形態⑧）").toBeCloseTo(expected!, 6);

    // ② 開關關：把 config 那一格翻成 false，逐位元回到手填
    const cfg = store.all<{ schema?: string; enabled?: boolean }>("config").find((c) => c.schema === "config.ap-coefficient@1");
    expect(cfg, "出貨要有 config.ap-coefficient@1").toBeTruthy();
    const off = { ...cfg!, enabled: false };
    const patched = { ...store, all: <U>(c: string) => (c === "config" ? (store.all<{ schema?: string }>("config").map((d) => (d === cfg ? off : d)) as U[]) : store.all<U>(c as never)) };
    registerAll(patched as never);
    expect(apCoeffOf(Abilities.get(ID as never)), "開關關掉時要逐位元回到 JSON 的字面值（那格就是 rollback）").toBeCloseTo(literal, 6);

    // ⭐⭐ ③④ 係數取整（GH#1260 B4，owner 2026-08-13「最多取小數點兩位就好」）—— 讀**註冊表**，⛔ 不是讀函式。
    //   格子從出貨設定推導（⛔ 不寫死 0.01）；rollback 那一格取 schema 允許的最細粒度（⛔ 也不寫死）。
    //   ⭐ 兩個方向：③ 出貨 ⇒ 每一條都在格子上；④ rollback ⇒ 同一把尺量得到離格的（⛔ 否則③是瞎的）。
    const k = Math.round(1 / (cfg as { roundStep?: number }).roundStep!);
    const offGrid = (): string[] => {
      const out: string[] = [];
      for (const def of Abilities.all())
        forEachApRatio(def as unknown as Record<string, unknown>, (_n, r, _a, key) => {
          const c = r["coeff"];
          if (typeof c === "number" && Math.abs(c * k - Math.round(c * k)) > 1e-9) out.push(`${String((def as { id: unknown }).id)}|${key}=${c}`);
        });
      return out;
    };
    const finest = zConfigApCoefficientDoc.shape.roundStep.unwrap().minValue!;
    const rollback = { ...cfg!, roundStep: finest };
    const rolled = { ...store, all: <U>(c: string) => (c === "config" ? (store.all<{ schema?: string }>("config").map((d) => (d === cfg ? rollback : d)) as U[]) : store.all<U>(c as never)) };
    registerAll(store);
    expect(Abilities.all().length, "夾具前提：註冊表有技能").toBeGreaterThan(0);
    expect(offGrid(), "⛔ ③ 出貨設定下註冊表裡還有沒取整的 AP 係數 ⇒ `roundStep` 沒有人讀（失敗形態⑧）").toEqual([]);
    registerAll(rolled as never);
    expect(offGrid().length, "⛔ ④ rollback（最細粒度）下一條離格的都量不到 ⇒ ③ 那把尺是瞎的").toBeGreaterThan(0);
  });
});
