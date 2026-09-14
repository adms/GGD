/**
 * 🧮 出身表試算（GH#1260 B2）的唯一守衛 —— 兩個方向一起讀（量尺要自證兩邊）：
 *   ① 傳「反解用的那一套」係數 ⇒ 參考等級上「套現行係數」＝「出身表」，**逐列相等**
 *      （兩欄算的是**同一張反解後的卡**，差只能來自係數）
 *   ② 係數換掉（從程式預設 ×2 推導，⛔ 不抄出貨值）⇒ 每一項**至少一列真的動了**
 *      （那一欄真的讀了傳進來的係數，⛔ 不是恆等式）
 * ⛔ 不驗任何數字（出貨係數是 owner 的旋鈕，第二守則）。
 * 突變（2026-09-15，實跑）：`championStatBase(…, liveEnv)` 拿掉 liveEnv → ② 紅
 *   （「armor：換了係數卻一列都沒動」）。① 針對「live 改讀未反解的原卡」，⚠️ 那一條沒有實跑突變。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_COMBAT_ENV } from "@ggd/shared/sim/combatEnv";
import { TRIAL_STATS, originTrial } from "./originTrial";

const CONTENT = join(__dirname, "../../../content");
const bundle = JSON.parse(readFileSync(join(CONTENT, "bundle.json"), "utf-8")) as {
  collections: { champions: { entries: { doc: Record<string, unknown> }[] } };
};
const champions = bundle.collections.champions.entries.map((e) => e.doc);
const norm: unknown = JSON.parse(readFileSync(join(CONTENT, "config/stat-normalization.json"), "utf-8"));

describe("出身表試算：只顯示，兩欄的差只來自屬性係數", () => {
  it("① 反解那一套係數 ⇒ 參考等級上兩欄逐列相等", () => {
    const t = originTrial(champions, norm, {});
    expect(t.rows.length, "一列都沒有 ⇒ 這條守衛什麼都沒驗").toBeGreaterThan(0);
    const off = t.rows.flatMap((r) =>
      TRIAL_STATS.filter((s) => Math.abs(r.cells[s].live[t.referenceLevel]! - r.cells[s].table) > 1e-9).map((s) => `${r.id}.${s}`),
    );
    expect(off, "同一套係數下兩欄不相等 ⇒ 兩欄算的不是同一張反解後的卡").toEqual([]);
  });

  it("② 係數換掉 ⇒ 套現行係數那一欄真的跟著動", () => {
    const env = {
      agiToArmor: DEFAULT_COMBAT_ENV.agiToArmor * 2,
      strToAttackDamage: DEFAULT_COMBAT_ENV.strToAttackDamage * 2,
    };
    const t = originTrial(champions, norm, env);
    for (const s of TRIAL_STATS) {
      const moved = t.rows.filter((r) => Math.abs(r.cells[s].live[t.referenceLevel]! - r.cells[s].table) > 1e-6);
      expect(moved.length, `${s}：換了係數卻一列都沒動 ⇒ 那一欄沒有讀傳進來的係數`).toBeGreaterThan(0);
    }
  });
});
