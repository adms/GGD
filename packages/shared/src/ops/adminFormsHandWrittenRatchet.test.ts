/**
 * 🪜 後台表單「手寫欄位數」的**棘輪**（GH#992 Scope 1）。
 *
 * 票文的驗收條件之一：「手寫表單欄位數的棘輪基準線寫在測試裡並小於今天」。
 * 這裡的「今天」是**當場量的**（2026-09-05，跑 `handWrittenResidue()` 逐份加總），
 * ⛔ 不是引用票文 —— 票文那一列（「16 份 spec 裡只有 3 份引用 Zod」）已經過期。
 *
 * ⭐ 量到的：**71 份 spec（住 17 個檔）· 963 格手寫標籤 · 1,140 個 schema 純量葉**，
 * 而 963 格**全部**欠 `@zh`（今天沒有任何一份 schema 採用那個指令）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼是**雙向**的（變多紅、變少也紅）
 * ════════════════════════════════════════════════════════════════════════════
 * · **變多 → 紅**：一份新設定文件如果照舊逐格手打標籤，這條就會叫。⭐ 那正是它要
 *   問的問題：「這幾格為什麼不是從 Zod 的 `@zh` 推導的？」——⛔ 而不是默默長大。
 * · **變少 → 也紅**：⭐ 帳單付掉了就要**把基準線降下來**，否則這條棘輪會停在一個
 *   早就還完的數字上，然後在下一次退步時**仍然是綠的**（一條爬不動的棘輪＝沒有棘輪）。
 *
 * ⚠️ **這條會與正在新增設定頁的 lane 撞車**，而那是刻意的：撞車的內容就是
 * 「你新增的那幾格是手寫的」。收工時把 `BASELINE` 改成新的量值並在 commit 訊息裡
 * 說一句為什麼，⛔ 不要把斷言改成 `toBeLessThanOrEqual`（那會讓「變少不降線」變成綠的）。
 *
 * ⚠️⚠️ **為什麼是動態 import 而不是普通 import**：`packages/shared/tsconfig.json` 的
 * `rootDir` 是這個套件本身 ⇒ 一行 `import … from "…/apps/admin/…"` 會讓 `tsc` 吐
 * **TS6059**（實測 exit 2，訊息從 `configCurve.ts` 一路列到 17 份 spec）。
 * ⭐ 型別 import 也一樣會（它照樣把檔案拉進 program）。⇒ 執行期載入 + 本檔自帶
 * 最小結構宣告，⛔ 而不是去放寬那個套件的 `rootDir`（那會讓整個 monorepo 的
 * 邊界失效，代價遠大於這條棘輪）。
 */
import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { zConfigSpeedGrowthTiersDoc } from "../content/schema/config";

/** 量到的當下（2026-09-05）。⭐ 只能往下走。 */
// ⚠️⚠️ ⭐ **963 → 999（+36），2026-09-05；999 → 963，2026-09-06（GH#1001 還清）。**
// 一條「只能變少」的棘輪往上調，要有出處 —— 那一筆帳留在這裡：
//
// 那 36 格**不是**有人偷懶逐格手打，是**同一個晚上為了修 CI 的 `unit` 紅**補上的：
//   · `arena-rules.round11` **21 格** —— schema 長出 `round11`（GH#919–#925）而標籤表沒跟上
//     ⇒ `configForms.test.ts` 紅（第三條的 `boundsFor` TypeError 是同一個根因的下游）
//   · `ap-coefficient.frequency.{basicAttack,abilityCast,specialCondition}` × 五級距 **15 格**
//     （GH#939）—— 這一批被第一批**遮住**（那支測試逐 spec fail-fast），修好前一批才露出來
//
// ⭐ 而正確的住處仍然是 Zod 的 `@zh`（本檔上面那一段講的就是這件事）——
// ⛔ 那一晚沒有走那條路，因為修紅的 lane 的路徑柵欄**刻意不含** `packages/shared/src/content/schema/`
// （併行安全：另一條 lane 正在動它）。⇒ ⭐ 那是**排程的結果，⛔ 不是設計的結果**。
//
// ⭐⭐ 2026-09-06 還清的形狀（GH#1001）：那 36 格的人話搬進 Zod 的 `@zh` / `@note`
// （`arenaRules.round11.ts` 逐格 · `apCoefficient.ts` 的 `zByTier(…, describe)` 一個模板 × 五級距），
// admin spec 的 `fields[]` 改成 `schemaToForm()` 推導的 spread —— ⛔ 不是把手寫留著再多一份 `@zh`
// （那是同一句人話的**兩個住處**，第〇·四守則）。同一路也接了 GH#1033 的新格
// `arena-rules.humanSeatsFromRound`（人話只住 Zod ⇒ 這裡不加一）。
// ⭐ 突變（2026-09-06 驗過）：拿掉 `round11.enabled` 的 `@zh` ⇒ +1 ⇒ 紅，逐份欠帳指名 `arena-rules`。
//
// ⚠️⚠️ 2026-09-06 15:45 量到的**另一筆帳（⛔ 不是 #1001 的）**：HEAD 在 963/999 那一筆之後又進了
// **6 格**沒有 `@zh` 的手寫標籤而沒有調基準線 —— `ap-coefficient.multiHit.enabled` ·
// `ap-coefficient.multiHit.decayPerHit` · `ap-coefficient.proseFromFormula`（欠 zh+note）·
// `ap-damage-scaling.apCurveK` · `apCurveP` · `apCurveMaxMult`（欠 zh）。⇒ HEAD 本身的量值是 1005，
// 這條在 HEAD 上就已經紅；#1001 還清 36 之後工作樹量到 **969**。⭐ 這裡刻意留 963（#1001 的帳
// 逐格對得上），那 6 格由它們的票（#1029 / #1035 / #1040）決定：搬去 `@zh`（正解）或帶理由調線。
//
// ⭐⭐ 2026-09-06 第二批（GH#992 Main lane）：**963 → 664**。
// 313 格由一支 TS-AST codemod 搬進 Zod `.describe()`（`@zh`／`@note`／`@opt`；既有的無指令描述
// 與手寫 note 取聯集、複述出貨值的地方換成 `{{出貨值}}`），44 份 spec 的 `fields[]` 改成
// `derivedFields(zod, [覆寫])`（`configForms/schemaToForm.ts`）；覆寫只剩 Zod 給不出的那一半
// （`pattern` 27 格 · 補上下界 33 格）。同一批：wounds / shield / augment-filter / controller-scheme
// 四份**整份** spec 由 `specFromZod()` 從 Zod 根節點的 `@title/@intro/@consumer/@effect/@nav/@preserve` 推導。
// ⚠️ 還沒搬的 664 格分三類，⛔ 不是「沒做」：
//   · Zod **不在柵欄裡**（`schema/config/` 以外：map-spec 34 · displacement-tiers 30 · victory-podium 13 ·
//     ranking 11 · practice 10 · new-hero-checks 9 · icon-style 8 · toggle-ability 5 · audio-mix 3 ·
//     cast-approach 3 · mitigation 1）＝ 127 格；
//   · 標籤由**迴圈／模板**產生，Zod 那一側是 `Object.fromEntries` 或共用子物件 ⇒ 要改成帶 describe
//     模板的產生器（stat-normalization 245 · 五級距家族 76 · ap-coefficient 30 · authoring-rules 29 ·
//     world-cues 39 · range-guide 17 · ambient-vfx 11 · rank-growth 7 · arena-rules 21）；
//   · Zod 給不出的：`pattern` 27（item-card 10 · damage-colors 9 · range-guide 8）· 補上下界 33（arena-rules）。
// ⭐⭐ 2026-09-06 第三批（GH#992 Main lane，同一天的第二輪）：**665 → 362**。
// 分三類還清，⛔ 不是「又跑了一次同一支 codemod」：
//   ① **Zod 住 `schema/` 上一層**（不是 `schema/config/`）—— 同一支 codemod 換一個
//      掃描目錄就吃得到：map-spec 34 · displacement 30 · victory-podium 10 · ranking 11 ·
//      practice 10 · icon-style 8 · toggle-ability 5 · audio-mix 3 · cast-approach 3 ·
//      mitigation 1。⚠️ `new-hero-checks` 的 Zod 住 `content/newHeroChecks.ts`
//      （⛔ 連 `schema/` 都不在）⇒ 那 9 格**沒動**，在柵欄外。
//   ② **迴圈／共用子物件**（票文說的 475 格）—— 正解是把 spec 裡的模板函式搬成
//      **`describe` 模板**：`zPointCue(名稱, 這一則)` × 5（world-cues 30）·
//      `zTierRow(…, 族, tier, 為什麼)`（displacement 20）· `zCooldownSecondsRow(shape)`
//      （cooldown 15）· `zByTier(min, max, describe)`（ap-coefficient 10）·
//      `Object.fromEntries(TIER_NAMES.map(…describe))`（aoe/range/damage/mana/move-speed/
//      cast-time/rank-growth/speed-growth 各 5–22 格）。
//      ⭐ 一併搬走的還有兩張**算出來的**散文表（`DAMAGE_TIER_WHY` · `COOLDOWN_SHAPE_WHY`
//      ＋ `COOLDOWN_TIER_WHY`）—— 它們原本住 `apps/admin`，而它們引用的每一個數字都
//      現算自 `content/`，所以搬家沒有多一份會漂的知識。
//   ③ **`pattern` / 補上下界**（60 格）—— 這一批的 zh/note 也搬進 Zod 了（同一句人話
//      只有一個住處），⛔ 但那兩格 Zod 今天給不出來 ⇒ 它們**仍然算欠帳**，見下。
//
// ⚠️ 剩下的 362 格，逐類都指得出「缺的是什麼」（⛔ 不是「還沒做」）：
//   · **stat-normalization 247** —— ⛔ **刻意沒碰**：GH#1064 的 lane 同一時間在改
//     `schema/config/statNormalization.ts`（併行安全，⛔ 不是做不到）。它的 spec 是
//     `generatedNormalizationFields()` 一個迴圈 ⇒ 正解與②同型，下一輪一次搬完。
//   · **pattern 27**（item-card 8 · range-guide 10 · damage-colors 9）—— Zod **有**
//     `.regex()`，⛔ 而 `walkZod` 的 `UIText` 不帶它（`apps/editor/src/form/uiSchema.ts`，
//     另一條路徑柵欄）。⇒ 缺的標籤是「把 `ZodString` 的 regex check 帶進 IR」。
//   · **補上下界 33**（全部在 arena-rules）—— 正解是把界寫回 Zod，⛔ 而那是**改上下界**，
//     不在 #992 這一輪的柵欄裡（只准加 `.describe()`）。
//   · **new-hero-checks 9** —— Zod 住 `content/newHeroChecks.ts`，柵欄外。
//   · **authoring-rules 27** —— 標籤要引用 `tableForModel()` / `describeProportionalityModels()`
//     那一族推導函式；搬得動，⛔ 但要把那幾支一起帶進 schema，留給下一輪。
//   · **victory-fx 2 · victory-podium 3 · displacement wallBlock 2 · speed-growth 2 · item-card 3**
//     —— 共用子物件（`zVictoryFireworkTier` 用兩次）或 `optionLabels` 由出貨值現算。
//
// ⭐⭐ 2026-09-07 第四批（GH#992 Main lane）：**362 → 37**。
// 這一批把「⛔ 刻意沒碰」與「共用子物件」兩類全部還清，⛔ 沒有放寬任何斷言：
//   ① **stat-normalization 247** —— 上一批因為 GH#1064 的 lane 在同一個檔而跳過，
//      這一批搬完：六族的模板（`zBandsFor` / `zBandsByScaleFor` / `zNormArchetypeBands`
//      / `zNormOriginBands` / `zScaleByOriginRow` / `channel`）＋ owner 裁決那 **31 格**
//      逐字進 `NORM_PROSE`（key ＝ 完整 path）。`apps/admin` 那一側的
//      `generatedNormalizationFields()` 產生器與 `NORM_HAND_WRITTEN` 手寫表**刪掉了**
//      ⇒ ⭐ 這是搬家，⛔ 不是「兩邊都有一份」。
//   ② **arena-rules 補上下界 33** —— ⭐ 正解就是把界寫回 Zod（`.max(…)`），
//      而 `boundsFor()` 本來就在「兩份上界」上丟例外 ⇒ 搬過去的同時**必須**把標籤那一份
//      刪掉，⛔ 沒有「兩邊都留」這個選項。⚠️ 出貨值一格都沒有動（`configForms.test.ts`
//      的「content/ 裡那一份過得了它自己的 schema」會逐份驗）。
//   ③ **authoring-rules 27** —— 冷卻上下界那兩句由 `zCooldownBand(minDesc, maxDesc)` 帶
//      （那個子物件被用兩次：單體／範圍）、十五格 `zMinDamageTierRow(shape)` 帶形狀、
//      相稱性模型的四個選項由 `tableForModel()` **現算**。⭐ 那一族推導函式**本來就已經
//      import 在那個 schema 檔裡** ⇒ 搬過去沒有多一份會漂的知識。
//   ④ **共用子物件那一族 19** —— 全部改成「描述由呼叫端給」：
//      `zTelegraphChannelStyle(prose)`（range-guide 三條通道 × 5 格）·
//      `zVictoryFireworkTier(desc)`（victory-fx 兩層）· `PODIUM_CLIP_OPTS`（頒獎台三格共用）·
//      `WALL_BLOCK_POLICY_OPTS`（displacement 兩格，⭐ 從 `WALL_BLOCK_POLICIES` 逐項展開）·
//      speed-growth 的 `ladder`（兩把梯子的五格數字**現算**）。
//
// ⚠️ 剩下的 37 格，逐類都指得出「缺的是什麼」（⛔ 不是「還沒做」）：
//   · **`pattern` 27**（damage-colors 9 · range-guide 8 · item-card 10）—— Zod **有**
//     `.regex()`，⛔ 而 `walkZod` 的 `UIText` 不帶它（`apps/editor/src/form/{walk,uiSchema}.ts`）。
//     ⇒ 缺的標籤是「把 `ZodString` 的 regex check 帶進 IR」，而那兩個檔在**另一條**
//     路徑柵欄裡 ⇒ 這一批只**指名**它。⛔ 刻意不在 admin 側另寫一支走訪器
//     （那就是第二份「Zod 長什麼樣」的知識）。
//   · **new-hero-checks 9** —— 它的 Zod 住 `packages/shared/src/content/newHeroChecks.ts`
//     （⛔ 連 `schema/` 都不在），柵欄外。
//   · **item-card `unknownCategory` 1** —— 它的四個選項中文與**下面那張 32 列對照表**
//     共用同一份 `ITEM_CARD_CATEGORY_OPTIONS`（`tables[].options` 也吃它）。
//     ⭐ 搬去 Zod 只換得 1 格，代價是那張表要嘛跟著搬、要嘛變成第二份 —— ⛔ 不划算，
//     留給「表格那一半也從 Zod 推導」的那一輪一起。
const BASELINE = 37;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 這條棘輪只需要 spec 的這幾格 —— 完整型別住 `apps/admin`，見檔頭。 */
interface Spec {
  docId: string;
  zod: unknown;
  fields: readonly { path: string }[];
}
type Residue = { path: string; reasons: string[] };

const load = async (rel: string): Promise<Record<string, unknown>> =>
  (await import(/* @vite-ignore */ pathToFileURL(join(ROOT, rel)).href)) as Record<string, unknown>;

async function tools(): Promise<{
  specs: readonly Spec[];
  residue: (s: Spec) => Residue[];
}> {
  const forms = await load("apps/admin/src/configForms.ts");
  const s2f = await load("apps/admin/src/configForms/schemaToForm.ts");
  return {
    specs: forms.CONFIG_DOC_SPECS as readonly Spec[],
    residue: s2f.handWrittenResidue as (s: Spec) => Residue[],
  };
}

describe("後台表單手寫欄位棘輪", () => {
  it("⭐ 手寫欄位數只能變少", async () => {
    const { specs, residue } = await tools();
    // ⚠️ 母體不可以塌掉：註冊表載不進來時加總會誠實地回 0，而 0 < BASELINE
    // 在單向棘輪底下讀起來是「進步」。雙向斷言本來就擋得住，這一行是講清楚為什麼。
    expect(specs.length).toBeGreaterThan(50);
    const now = specs.reduce((n, s) => n + residue(s).length, 0);
    // ⭐ 紅的時候指名**哪一份文件**動了：逐份的欠帳數（只列有欠帳的），下一個人才
    // 對得出是誰多了一格，⛔ 不是拿著一個總數去翻 71 份 spec。
    const perDoc = specs
      .map((s) => `${s.docId}=${residue(s).length}`)
      .filter((row) => !row.endsWith("=0"))
      .join(" · ");
    expect(
      now,
      now > BASELINE
        ? `手寫標籤從 ${BASELINE} 變成 ${now}：新增的那幾格請改成在 Zod 上寫 ` +
          `\`@zh\` / \`@note\` / \`@opt\`（見 apps/admin/src/configForms/schemaToForm.ts 檔頭），` +
          `真的必須手寫就把本檔的 BASELINE 調成 ${now} 並說明為什麼。逐份欠帳：${perDoc}`
        : `帳單付掉了（${BASELINE} → ${now}）⇒ 把本檔的 BASELINE 改成 ${now}，` +
          `否則這條棘輪會停在一個還完的數字上，下一次退步時仍然是綠的。逐份欠帳：${perDoc}`,
    ).toBe(BASELINE);
  });

  /**
   * ⭐ 量尺**兩個方向**都要驗過（CLAUDE.md「一把只驗過單邊的尺，不算自證過」）。
   *
   * ⚠️⚠️ 這一條在 2026-09-07 之前是**反過來寫**的：它拿出貨的 `ladder` 當「已知**有**
   * 欠帳」那一邊。⭐ 而那一格 2026-09-07 被還清了 ⇒ 這條斷言**當場紅**，而它紅的
   * 意思是「帳付掉了」，⛔ 不是「量尺壞了」—— 一條**靠缺陷才綠**的守衛
   * （CLAUDE.md 假綠燈形態⑩）。
   *
   * ⇒ ⭐ 改成**兩邊都由本檔造**：同一顆出貨節點，一邊把描述清空、一邊用出貨那一份。
   * 這樣它量的是「這把尺分不分得出有／沒有」，⛔ 而不是「今天剛好還有誰欠著」。
   */
  it("⭐ 量尺兩個方向都驗過：拿掉 @zh 會多一筆欠帳，貼回去就消失", async () => {
    const { specs, residue } = await tools();
    const spec = specs.find((s) => s.docId === "speed-growth-tiers")!;
    const shipped = zConfigSpeedGrowthTiersDoc.shape.ladder;

    // ① 已知「還完了」那一邊 —— 出貨的 `ladder` 帶著 `@zh` / `@note` / `@opt`。
    const paid = residue(spec);
    expect(paid.find((r) => r.path === "ladder")).toBeUndefined();

    // ② 已知「有欠帳」那一邊 —— 同一顆節點把描述清空，⇒ 欠帳要**正好多一項**，
    //    而且理由要逐條指名（少一種紅、多一種也紅）。
    const stripped = residue({
      ...spec,
      zod: zConfigSpeedGrowthTiersDoc.extend({ ladder: shipped.describe("") }),
    });
    expect(stripped.find((r) => r.path === "ladder")?.reasons).toEqual([
      "zh",
      "note",
      "optionLabels",
    ]);
    expect(stripped.length).toBe(paid.length + 1);
  });
});
