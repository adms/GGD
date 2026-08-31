/**
 * 🔁【週期領域】的**採用阻塞點住在哪一側** —— 兩條對的守衛，組合是空的（失敗形態⑪）。
 *
 * ── 這一支存在的理由（2026-08-29 量到）─────────────────────────────────────
 * GH#648 逐字寫著「43 支『說明宣稱迴圈、JSON 無機制』的**內容批**還沒套用」，而
 * `templateFamiliesAreAdopted.test.ts` 的豁免表也照抄同一句話。⇒ 連續幾輪讀到這一
 * 行的人（包含我）都把它讀成「**只差內容**」。
 *
 * ⛔ 實測不是：`expand()` 對 `periodic-field` **擲錯**
 *   （`template tpl-periodic-field: family "periodic-field" has no P1 expand path`）
 *   ⇒ 任何一支出貨技能只要寫下 `template.ref = "tpl-periodic-field"`，
 *     就會在 `registerAll` 的展開那一步**當場爆**（`templates/resolve.ts` phase="expand"）。
 *   ⇒ ⭐ 阻塞點在**引擎側**（`templates/expand.ts` 的 `FAMILIES` 少一列），
 *     ⛔ 不在內容側。而票文與豁免表兩處都指著內容。
 *
 * ── 為什麼既有的兩條守衛都抓不到 ───────────────────────────────────────────
 *  · `paramsSchema.test.ts:144`  draft ⇒ `isExpandable` 必須 false ……… ✅ 綠（它**要**是 false）
 *  · `templateFamiliesAreAdopted.test.ts` 零引用 ⇒ 豁免表要有理由 …… ✅ 綠（理由欄有字）
 *  ⇒ 兩條各自都對，⛔ 而**沒有人問「那個理由說的是哪一側」**。這一支就問那一題。
 *
 * ── 逐支分類（⭐ 量的，⛔ 不是抄票文）──────────────────────────────────────
 * `scan_shapes.py` 今天的迴圈差集是 **39 支**（票文寫 43 —— 中間 4 支已被別的批次收掉）。
 * 逐支讀說明＋JSON 之後，⭐ **只有 11 支**是 `tpl-periodic-field` 真正的目標：
 *   · **11 支 真週期領域** —— 04-02 炸彈陣×2 · 90-01 飛葉快刀×2 · 92-04 馬勒戈壁 ·
 *     99-04 公主殿下 · 37-03 災難之牆 · 28-04 破滅能量彈 · 18-04 億年樹×2 · 53-01 獸王牙操彈
 *   · **14 支 真週期但是單體/自身 tick** ⇒ 那是 `dot`／自傷 tick，⛔ 不是領域
 *   · **8 支 卡面是誠實的** —— 「每秒回復 N 點」**已經**由 `healthRegen`／`manaRegen`
 *     修正值表達（28-00 無限再生 · 11-00 三刀流×2 · 14-002 魔力激發 · 34-00 靈魂吞噬 ·
 *     76-00 二檔×2 · 71-00 暗夜契約）⇒ ⭐ 差集是**掃描器實作側**看不到 regen，
 *     ⛔ 不是內容缺機制。硬套模板會把同一件事做兩次（第〇·四守則）。
 *   · **6 支 說明的迴圈詞是修辭或否定句** —— 12-02「小周天**循環**」（氣功名詞）×2 ·
 *     06-03「**不斷地**修煉」×2 · 30-02「**不斷**受到灼傷」×2；
 *     ⚠️ 71-00 更直接：「GGD **沒有**日夜**循環**」—— 迴圈詞出現在**否定句**裡。
 *     ⇒ 卡面**沒有說謊**（第一·五守則沒被違反），要修的是宣稱側的 negative 規則。
 * ⇒ ⭐ **39 支裡 28 支的正解不是套這份模板。**「43 支等 tpl-periodic-field」是假前提。
 *
 * ── 這一支驗什麼（⭐ 兩個名詞的**關係**，⛔ 不是一個名詞）──────────────────
 *  ① 承重：**有人引用 ⇒ 展得開**。⛔ 一支引用了展不開家族的技能＝註冊時整支爆掉。
 *  ② 棘輪：把「今天卡在哪一側」釘成一個會**在任一側動的時候變紅**的事實 ——
 *     引擎接上 ⇒ 紅（去把 `status` 翻成 enabled、豁免表那一列刪掉、開始套內容）；
 *     有人先套了內容 ⇒ 紅（那些技能會在註冊時爆，先去接引擎）。
 *
 * ── 突變紀錄（一批一條，最承重的那一條）────────────────────────────────────
 *  · `templates/expand.ts` 的 `FAMILIES` 補一列 `"periodic-field": modelFxFamily`
 *    ⇒ `isExpandable` 變 true ⇒ ②紅，訊息逐字說「引擎側已接上」。改回。
 *  ⚠️ ①的迴圈體今天**跑不到**（零引用），所以它⛔ 不是這一批的突變對象 ——
 *     ⭐ 記在這裡，⛔ 不假裝它被驗過（「突變驗過」本身可能是假的）。
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isExpandable } from "./templates/expand";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const TPL_ID = "tpl-periodic-field";
const FAMILY = "periodic-field";
/** 會引用模板的內容集合（⛔ 不含 champions —— 它是 abilities 的鏡像，會重複計數）。 */
const CONSUMERS = ["content/abilities", "content/items", "content/augments"];

/** 出貨內容裡，`template` 綁定真的指到這份模板的文件 id。 */
function referencingDocs(): string[] {
  const hits: string[] = [];
  for (const dir of CONSUMERS) {
    let files: string[];
    try {
      files = readdirSync(join(REPO, dir));
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const doc: unknown = JSON.parse(readFileSync(join(REPO, dir, f), "utf8"));
      if (JSON.stringify((doc as { template?: unknown }).template ?? null).includes(`"${TPL_ID}"`)) {
        hits.push(f.slice(0, -5));
      }
    }
  }
  return hits.sort();
}

describe("週期領域的採用阻塞點 (periodic-field adoption blocker)", () => {
  it("⭐ 承重：引用了這份模板的技能，它的家族一定要展得開（⛔ 否則註冊時整支爆）", () => {
    const refs = referencingDocs();
    if (refs.length === 0) return; // 今天零引用 —— ⛔ 不假裝這一條被跑過（見檔頭突變紀錄）
    expect(
      isExpandable(FAMILY),
      `⛔ ${refs.length} 份出貨文件引用了 ${TPL_ID}，而 expand.ts 的 FAMILIES 沒有 "${FAMILY}" ——\n` +
        `   這些文件會在 registerAll 的展開那一步擲 ExpandError，整支技能退化：\n   ${refs.join(", ")}\n` +
        `⭐ 先在 templates/expand.ts 補上 FAMILIES["${FAMILY}"]，再套內容。`,
    ).toBe(true);
  });

  it("⭐ 棘輪：卡在哪一側是**量出來的**，任一側動了就要紅（⛔ 不是散文）", () => {
    expect(
      { engineReady: isExpandable(FAMILY), referencedBy: referencingDocs().length },
      `⭐ 這一格記錄的是 GH#648 今天**真正**卡住的那一側。它紅了代表有東西動了：\n` +
        `  · engineReady 變 true ⇒ 引擎側接上了。去把 ${TPL_ID}.json 的 status 翻成 enabled、\n` +
        `    把 templateFamiliesAreAdopted.test.ts 的豁免表那一列刪掉，然後才開始套內容。\n` +
        `  · referencedBy 變大 ⇒ 有人先套了內容。⛔ 引擎還沒接上時那些技能會在註冊時爆 ——\n` +
        `    先接引擎，⛔ 不是放寬這條閘。\n` +
        `⚠️ ⛔ 不要把票文的「內容批還沒套用」讀成「只差內容」：那句話指錯了一側。`,
    // ⭐ 2026-08-30：`engineReady` 翻成 **true** —— 第八批的 lane 把
    //   `FAMILIES["periodic-field"]` 接上了（commit `2f4cca1a5`），
    //   模板 status draft → enabled。
    //
    // ⭐⭐ 2026-08-31：`referencedBy` 0 → **6**（GH#648 內容批終於落地）。
    //   在此之前這一格逐字寫著「仍然是 0，那是刻意的」，並點名**第五個阻塞點**：
    //   `abilityProse.ts` 的 `damageRanks` 不讀 `Scaling.mult`。⇒ 它已經修好了。
    //
    // ⚠️ 而這一輪量到**第六個**，形狀一模一樣：`descriptionClaims.ts` 的
    //   `numbersUnder` 也不乘 `mult` ⇒ 卡面印 250（對的）而對帳表量到 `{0.5, 500}`
    //   ⇒ 一支**正確**的技能被判成「說了但不會發生」。⛔ 那是**誤報**，
    //   而誤報比漏報更貴：它會逼下一個人把正確的技能塞進 baseline ＝ 把守衛關掉。
    //   ⇒ 修法同第五個（`damageNumbersUnder`）。
    //
    // ⭐ 判準留給下一輪：`mult` 是**整份酬載**的倍率，所以**每一個讀傷害量的消費端**
    //   都要乘它。今天量到兩個（印的、對帳的）——⛔ 新增第三個讀端時要先問這一題。
    ).toEqual({ engineReady: true, referencedBy: 5 });
  });
});
