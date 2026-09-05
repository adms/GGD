/**
 * GH#479 ① 的閘：**變身對子的兩半要一起改**。
 *
 * 界線與「為什麼 `abilityCodeParity` 擋不住」寫在 `abilityCodeParityForms.ts` 檔頭。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔⛔ GH#854 —— 這條閘**曾經自己重寫基準線**，所以它不是一條閘
 * ─────────────────────────────────────────────────────────────────────────────
 * H5（2026-08-23）給了它一個「兩邊一起動＝自動吸收成新基準」的分支：發現差異 →
 * `writeFileSync(BASELINE, …)` → 綠。⇒ ⭐ **它把自己的證據改掉然後宣告通過。**
 *
 * ⚠️ 那正是 CLAUDE.md 失敗形態⑩（守衛是靠缺陷才綠的）：
 *   · 「兩邊一起動」聽起來像正常的技能改動，⛔ 但它同時是**兩邊各自被推開**的樣子 ——
 *     `deriveCastTimes.ts --write` 照**每一份文件自己的機制**算 `castTimeSec`，
 *     本體被規格重寫、變身態沒有來源停在 w3x 匯入值 ⇒ 同一個公式給出兩個答案，
 *     **兩個指紋一起變** ⇒ 落進吸收分支 ⇒ 靜默寫回基準線 ⇒ 綠。
 *   · 2026-08-29 量到的後果：`castTimeSec` 兩形態不同的比例，
 *     **本體有產生器來源的 14/36（39%）** vs 其餘手編對子 **5/84（6%）**，
 *     例：12-04 龍氣爆發 `godie-ewar` 1.0s ／ `godie-e007` 2.033s。
 *     ⇒ 一路推開了六個對子，而這條閘**從頭到尾是綠的**。
 *   · 帳本自己也記著：commit `a8641eeb` 逐字寫「重生成變身對子基準線 —— 這是**吸收**，
 *     ⛔ 不是修好」。⇒ 吸收發生過，而且發生的時候沒有人被擋下來。
 *
 * ⭐ 現在：**斷言路徑一行都不寫檔。** 任何對不上基準線的東西都紅，
 *    重生成是一個**明示的、另一條路**（下面的 dump 分支 `return`，⛔ 不做斷言），
 *    跟這個 repo 每一條 `--check` 棘輪同一個形狀：紅 → 人看 diff → 重生成 → `git add`。
 *
 *    GGD_FORM_PAIR_DUMP=1 npx vitest run packages/shared/src/content/abilityCodeParityForms.test.ts
 *    git add packages/shared/src/content/abilityCodeParityForms.baseline.json
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
} from "./abilityCodeParityForms";

const HERE = dirname(fileURLToPath(import.meta.url));
const ABILITY_DIR = join(HERE, "../../../../content/abilities");
/**
 * ⚠️ 可以被 `GGD_FORM_PAIR_BASELINE` 指到別處 —— **只為了讓守衛餵得進一份假基準線**
 * （`packages/shared/src/ops/formPairGateNeverWritesBaseline.test.ts`）。
 * ⛔ 它**不是**逃生口：換掉路徑之後斷言照跑，⛔ 沒有任何一條分支會因此變綠。
 * ⭐ 同一個做法的前例：`deriveCastTimes.ts` 的 `GGD_CONTENT_DIR`。
 */
const BASELINE = process.env.GGD_FORM_PAIR_BASELINE ?? join(HERE, "abilityCodeParityForms.baseline.json");

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

/** ⭐ 單邊改動＝ owner 描述的那個缺陷；兩邊一起動＝要人看過才准進基準線。 */
function isOneSided(f: FormPairFinding): boolean {
  if (f.kind === "base-only" || f.kind === "alternate-only") return true;
  // added：只有一邊長出這個編號 = 同一個缺陷的「新增」形狀。
  return f.kind === "added" && (f.state.base === null || f.state.alternate === null);
}

describe("變身對子的技能同步", () => {
  const { shipped, halfMigrated } = splitFormPairsByShipping();

  it("⭐ 對不上基準線就紅（本體 ⇄ 變身態逐支對帳；⛔ 這條閘自己不寫基準線）", () => {
    cover("form-pair-ability-parity");
    const states = scanFormPairAbilities(shipped, abilitiesByChampion());

    // ⭐⭐ 重生成是**另一條路**，而且它 `return` —— 斷言路徑因此**結構上**寫不了檔。
    //    ⛔ 不要把它改回「發現差異就順手寫回去」：那一版看起來只是少打一個指令，
    //    實際上是這條閘唯一的一次失效（GH#854，見檔頭）。
    if (process.env.GGD_FORM_PAIR_DUMP) {
      const before = JSON.parse(readFileSync(BASELINE, "utf8")) as FormPairBaseline;
      const absorbing = diffAgainstBaseline(states, before);
      writeFileSync(BASELINE, JSON.stringify(toBaseline(states), null, 2) + "\n", "utf8");
      // ⚠️ 重生成會把**單邊改動也一起洗白** —— 所以它要被念出來，⛔ 不可以安靜
      //    （fail-open 沒錯，靜默才是缺陷）。
      const oneSided = absorbing.filter(isOneSided);
      console.log(`[dump] ${states.length} 個編號 → ${BASELINE}（吸收 ${absorbing.length} 筆）`);
      for (const f of oneSided) console.log(`[dump] ⚠️ 連同這筆**單邊**改動一起吸收：${formatFinding(f)}`);
      if (oneSided.length > 0) {
        console.log(`[dump] ⛔ 上面 ${oneSided.length} 筆是 GH#479 要抓的缺陷本身 —— 確認過再 git add。`);
      }
      return;
    }

    const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as FormPairBaseline;
    // ⚠️ 空基準線 = 檔案壞了或被清空，⛔ 不是「沒有對子」——那會讓這條守衛
    //    在最需要它的時候安靜地全綠（fail-open 沒錯，靜默才是缺陷）。
    expect(Object.keys(baseline).length).toBeGreaterThan(50);

    const findings = diffAgainstBaseline(states, baseline);
    const oneSided = findings.filter(isOneSided);
    const together = findings.filter((f) => !isOneSided(f));
    const lines = [
      ...oneSided.map((f) => `⛔ 單邊　${formatFinding(f)}`),
      ...together.map((f) => `⚠️ 兩邊　${formatFinding(f)}`),
    ];

    expect(
      lines.join("\n"),
      `⛔ ${findings.length} 個編號對不上基準線（單邊 ${oneSided.length}／兩邊 ${together.length}）。\n` +
        `⭐ **「⛔ 單邊」是缺陷**：有變身的英雄在內容樹裡是**兩份文件**，本體改了、變身態沒改\n` +
        `   ⇒ 玩家變身之後用的是舊的那一份（全套測試會全綠）。照訊息去把另一邊補上。\n` +
        `⚠️ **「⚠️ 兩邊」不會自動變成新基準**（GH#854）—— 兩邊一起動也可能是**兩邊一起被推開**：\n` +
        `   \`deriveCastTimes.ts --write\` 照每一份文件**自己的**機制算 castTimeSec，兩形態的機制\n` +
        `   一旦不同，它就給出兩個答案而**兩個指紋一起變**。所以這裡要人看過 diff 才准進基準線。\n` +
        `⚠️⚠️ **補之前先查那一邊是誰的**：bash scripts/genguard.sh content/abilities/<id>.json\n` +
        `   · 產生器的產物 ⇒ 改**來源**（tools/skill-remake/heroes/*.py）再 bash scripts/genrun.sh <step>。\n` +
        `     ⛔ 直接改出貨 JSON 會被下一次 sync 打回來，而那個「又紅了」看起來像**新的**錯。\n` +
        `   · ⚠️ 變身態**沒有產生器**（六個對子逐一的理由在 tools/skill-remake/form_counterparts.py）\n` +
        `     ⇒ 那一邊是手編的，改它就是改 content/abilities/<變身態 id>.<slot>.json 本人。\n` +
        `   · ⚠️ 同一支技能在內容樹裡有**兩份**：standalone content/abilities/ ＋\n` +
        `     內嵌 content/champions/<hero>.json 的 abilities.<SLOT> —— **兩份都要動**。\n` +
        `確認過 diff 之後才重生成基準線（⛔ 這條測試自己不會做這件事）：\n` +
        `   GGD_FORM_PAIR_DUMP=1 npx vitest run packages/shared/src/content/abilityCodeParityForms.test.ts\n` +
        `   git add packages/shared/src/content/abilityCodeParityForms.baseline.json`,
    ).toBe("");
  });

  /**
   * ⭐ 今天**兩形態的 `castTimeSec` 就是不一樣**的編號 —— 一條只准變短的棘輪。
   *
   * ⚠️ 上面那條閘問的是「有沒有人只改一邊」，⛔ 它問不出「**已經**不一樣的有幾個」——
   *    一旦一組差異進了基準線，它就是新的正常。而 GH#854 的症狀正是這一種：
   *    `deriveCastTimes.ts --write` 照每一份文件**自己的**機制算 castTimeSec，
   *    本體有產生器來源、變身態沒有（`tools/skill-remake/form_counterparts.py`）
   *    ⇒ 同一個公式對兩邊給出兩個答案，而沒有任何東西數過它。
   *
   * ⭐ 2026-08-29 量到（⛔ 不是估的）：**本體有產生器來源的 14/36（39%）**，
   *    其餘手編對子 **5/84（6%）** —— **6.5 倍**。最貴的一筆是
   *    12-04 龍氣爆發：`godie-ewar` 1.0s ／ `godie-e007` 2.033s（差 1.033 秒）。
   *
   * ⛔ 這裡刻意**不裁決哪一邊是對的**（第〇·六守則）：79 卍解那一對的定義就是
   *    「技能換一套」，兩形態的詠唱本來就該不同。所以它是**棘輪**不是等式 ——
   *    只准變短，⛔ 不准變長。
   */
  // ⭐ GH#836：`12-04` 於 2026-08-29 離開這張表 —— ⛔ 不是「手填了一個值」，是**機制對齊**
  //    （變身態的 castType／effects／cooldown／描述鏡射了本體的 owner 規格）⇒
  //    `deriveCastTime()` 對兩份文件讀到同一組輸入，自然給出同一個答案（2.033 → 1）。
  // ⛔⛔ 而它**回來過一次**（GH#854，同一天）：`ddbd65199` 對齊、33 分鐘後
  //    `936cda27b`（產物重生成）把說明與 `ap` 係數**還原成 w3x 匯入版** ⇒ 又變成 1.233。
  //    ⭐ 兇手是 `tools/ap-conversion/claims.json` 裡 `godie-e007.r` 的**換算前凍結快照**：
  //    `apply.py::apply_doc()` 第一行就是 `out["description"] = entry["description"]`
  //    ⇒ 那兩個欄位的作者是 **apconv**，⛔ 不是內容樹。刪掉那筆過期條目才是修好
  //    （⛔ 改 content 只會撐到下一次 sync；逐支理由見 form_counterparts.py）。
  // ⚠️ `12-03` 刻意留著：那一格是 w3x 的 Metamorphosis 本身（`A02W`, base=`AEIl`），
  //    owner 2026-08-12 明說 B-4 不裁決 ⇒ 兩形態的機制**現在**就不該一樣。
  const CAST_TIME_DRIFT = [
    "08-02", "09-03", "12-03", "18-03", "25-04", "58-04", "70-03",
    "77-00", "77-002", "77-01", "77-03", "77-04", "79-002", "79-01", "79-03",
    "92-002", "92-01",
  ] as const;

  it("⭐ 兩形態詠唱不同的編號只准變少（⛔ 新的一筆＝又被推開了一支）", () => {
    const now = new Set(
      scanFormPairAbilities(shipped, abilitiesByChampion())
        .filter((s) => s.driftFields.includes("castTimeSec"))
        .map((s) => s.code),
    );
    const known = new Set<string>(CAST_TIME_DRIFT);
    const grew = [...now].filter((c) => !known.has(c)).sort();
    const fixed = CAST_TIME_DRIFT.filter((c) => !now.has(c));
    expect(
      [
        ...grew.map((c) => `⛔ 新增　${c}　兩形態的 castTimeSec 被推開了`),
        ...fixed.map((c) => `✅ 修好　${c}　把它從 CAST_TIME_DRIFT 拿掉（棘輪只能變短）`),
      ].join("\n"),
      `⛔ 兩形態詠唱不同的編號從 ${CAST_TIME_DRIFT.length} 變成 ${now.size}（GH#854）。\n` +
        `⭐ **castTimeSec 是推導的**（\`deriveCastTimes.ts --write\` 讀那份文件自己的\n` +
        `   castType／effects／cooldown）⇒ ⛔ 手寫一個值進 JSON **修不好它**，下一次\n` +
        `   sync 就會照舊算回去。要對齊詠唱，要對齊的是**機制**。\n` +
        `⚠️ 新增一筆通常代表：本體被規格重寫了，而變身態那一份沒有人跟著改\n` +
        `   （變身態逐一的作者與理由在 tools/skill-remake/form_counterparts.py）。`,
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
