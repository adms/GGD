/**
 * GH#479 ① 的閘：**變身對子的兩半要一起改**。
 *
 * 界線與「為什麼 `abilityCodeParity` 擋不住」寫在 `abilityCodeParityForms.ts` 檔頭。
 *
 * ⭐ 基準線**不用手動重生成**（H5，2026-08-23）：
 *   · **兩邊一起動**（both／兩邊同時新增／兩邊同時消失）＝ 正常的技能改動
 *     ⇒ 這條測試自己把基準線改寫成新現況（訊息會提醒 `git add` .baseline.json）。
 *   · **只動一邊** ⇒ 紅 —— 那才是這條閘要抓的缺陷。⛔ 判準沒有變弱：
 *     單邊改動**永遠**紅，而且不會被自動吸收進基準線。
 *   · 刻意的**單邊**形態差異（極少數，要能講出理由）才需要手動：
 *     GGD_FORM_PAIR_DUMP=1 npx vitest run packages/shared/src/content/abilityCodeParityForms.test.ts
 *     → 直接覆寫 abilityCodeParityForms.baseline.json，然後 `git add` 它
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { splitFormPairsByShipping } from "../../testkit/formPairShipping";
import {
  diffAgainstBaseline,
  formatFinding,
  scanFormPairAbilities,
  toBaseline,
  type FormPairBaseline,
  type FormPairFinding,
  type SideFingerprint,
} from "./abilityCodeParityForms";

const HERE = dirname(fileURLToPath(import.meta.url));
const ABILITY_DIR = join(HERE, "../../../../content/abilities");
const BASELINE = join(HERE, "abilityCodeParityForms.baseline.json");

/** 直接讀檔，⛔ 不經 ContentLoader —— 這條要在 `content:build` 之前也能跑。 */
function abilitiesByChampion(): Map<string, Record<string, unknown>[]> {
  const out = new Map<string, Record<string, unknown>[]>();
  for (const f of readdirSync(ABILITY_DIR).sort()) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const champ = f.slice(0, f.indexOf("."));
    const doc = JSON.parse(readFileSync(join(ABILITY_DIR, f), "utf8")) as Record<string, unknown>;
    const bucket = out.get(champ);
    if (bucket) bucket.push(doc);
    else out.set(champ, [doc]);
  }
  return out;
}

describe("變身對子的技能同步", () => {
  const { shipped, halfMigrated } = splitFormPairsByShipping();

  /**
   * 「兩邊一起動」＝ 不是這條閘要抓的缺陷，是正常的技能改動。
   * ⛔ 單邊改動（base-only / alternate-only / 只有一邊長出新編號）永遠不算。
   */
  function movedTogether(f: FormPairFinding): boolean {
    if (f.kind === "both" || f.kind === "removed") return true;
    // added：兩邊**同時**出現才算一起動；只有一邊有 = 同一個缺陷的「新增」形狀。
    if (f.kind === "added") return f.state.base !== null && f.state.alternate !== null;
    return false;
  }

  it("⭐ 只改到一邊就會紅（本體 ⇄ 變身態逐支對帳；兩邊一起動＝自動新基準）", () => {
    cover("form-pair-ability-parity");
    const states = scanFormPairAbilities(shipped, abilitiesByChampion());

    if (process.env.GGD_FORM_PAIR_DUMP) {
      writeFileSync(BASELINE, JSON.stringify(toBaseline(states), null, 2) + "\n", "utf8");
      console.log(`[dump] ${states.length} 個編號 → ${BASELINE}`);
    }

    const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as FormPairBaseline;
    // ⚠️ 空基準線 = 檔案壞了或被清空，⛔ 不是「沒有對子」——那會讓這條守衛
    //    在最需要它的時候安靜地全綠（fail-open 沒錯，靜默才是缺陷）。
    expect(Object.keys(baseline).length).toBeGreaterThan(50);

    const findings = diffAgainstBaseline(states, baseline);
    const absorbed = findings.filter(movedTogether);
    const oneSided = findings.filter((f) => !movedTogether(f));

    // ⭐ 兩邊一起動的自動吸收成新基準（H5）。⛔ **逐筆**合併，不整份覆寫 ——
    //    整份覆寫會把同一輪紅著的單邊改動一起洗白，那就是把閘弄弱。
    if (absorbed.length > 0) {
      const merged: Record<string, readonly [SideFingerprint, SideFingerprint]> = { ...baseline };
      const byCode = new Map(states.map((s) => [s.code, s]));
      for (const f of absorbed) {
        const now = byCode.get(f.state.code);
        if (now) merged[f.state.code] = [now.base, now.alternate];
        else delete merged[f.state.code]; // removed：兩邊同時消失
      }
      const sorted = Object.fromEntries(
        Object.keys(merged)
          .sort()
          .map((k) => [k, merged[k]]),
      );
      writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + "\n", "utf8");
      console.log(
        `[auto-baseline] ${absorbed.length} 個編號兩邊一起動，基準線已更新 → 記得 git add ${BASELINE}`,
      );
    }

    expect(
      oneSided.map((f) => formatFinding(f)).join("\n"),
      `⛔ ${oneSided.length} 支技能只動了一邊。有變身的英雄在內容樹裡是**兩份文件**，` +
        `本體改了、變身態沒改 ⇒ 玩家變身之後用的是舊的那一份（全套測試會全綠）。\n` +
        `⭐ 照訊息去把另一邊補上（補上之後兩邊一起動，下一次跑會自動變成新基準）。\n` +
        `MUTATION\n` +
        `   · ⚠️ 同一支技能在內容樹裡有**兩份**：standalone content/abilities/<id>.json ＋\n` +
        `     內嵌 content/champions/<hero>.json 的 abilities.<SLOT> —— **兩份都要動**。\n` +
        `確認過是**刻意的單邊形態差異**才手動重生成：\n` +
        `   GGD_FORM_PAIR_DUMP=1 npx vitest run packages/shared/src/content/abilityCodeParityForms.test.ts`,
    ).toBe("");
  });

  it("⛔ 對子不可以只搬一半（半邊進 _legacy = 變身當下房間會炸）", () => {
    expect(
      halfMigrated.join("\n"),
      "⛔ 變身對子必須**整組**搬動：本體留在 content/ 而變身態進了 _legacy（或反過來）時，" +
        "玩家按下變身，`Registry.get()` 會在每秒 30 次的 snapshot 裡丟例外，整個房間掛掉。",
    ).toBe("");
  });
});
