/**
 * 對戰設定後台 —— 純邏輯 + **「這一格真的有人讀嗎」** 的守衛。
 *
 * ── 這一頁最大的風險，和 combat-feel 完全不同 ──────────────────────────────
 * `config.combat-feel@1` 的每一格都有消費端，缺的只是 UI。`config.match@1` 不是：
 * 執行期只有兩個檔讀它（game-server `phaseConfig.ts`、client `fireRingWindow.ts`），
 * 所以 32 個數字欄位裡有 19 格是裝飾。做成可編輯就是這張單要防的缺陷本身。
 *
 * 下面的守衛因此分成兩半：
 *   · 可調的那 13 格 → 一路走到**真正的消費端函式**，證明值到得了
 *   · 唯讀的那 19 格 → 證明存檔**不會動到它們**，而且頁面不讓人編輯
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import {
  BURN_CURVE_SPEC,
  burnCurvePreview,
  validateBurnCurve,
  FIRE_RING_BLOCK,
  MATCH_CONSOLE_MAX,
  MATCH_DERIVED,
  MATCH_DOC_ID,
  MATCH_FIELDS,
  MATCH_FIELD_INFO,
  MATCH_GROUPS,
  MATCH_SCHEMA,
  isEditable,
  matchDocFrom,
  matchDocIssues,
  matchFieldBounds,
  readMatchDoc,
  validateMatchField,
} from "./matchConfig";
import { getAtPath } from "./configFields";
import {
  addCurveRow,
  curveRowsFrom,
  setCurveCell,
  type CurveRowDraft,
} from "./configCurve";
import { validateOverlayDoc } from "./contentOverlay";
// 真正的消費端 —— 不是這一頁自己寫的鏡像（第⑤種故障：被測的不是出貨的那個）。
import { phaseConfigFromSeconds } from "../../game-server/src/match/phaseConfig";
import { MAX_STARTING_TEAM_HEALTH } from "../../game-server/src/match/PairedDuels";
import {
  DEFAULT_MAX_PCT_PER_SEC,
  fireRingRatePerSec,
  fireRingRulesFromConfig,
} from "@ggd/shared/sim/fireRing";
import { LEVEL_CAP } from "@ggd/shared/sim/economy/progression";
// 編輯器「新建一份 config」的種子 —— 出貨那一份的出生值，不是這一頁的鏡像。
import { collectionEntry } from "../../editor/src/collections";
import { TICK_HZ } from "@ggd/shared/constants";

const TAG = "adminui-match-config";

/** 出貨的內容檔 —— 這一頁存檔時的基底，也是這裡的樣本。 */
const SHIPPED_DOC = JSON.parse(
  readFileSync(join(__dirname, "../../../content/config/config.match.json"), "utf8"),
) as Record<string, unknown>;

describe("欄位是從 Zod schema 推導出來的", () => {
  it("推導出來的欄位和說明表**雙向**吻合", () => {
    cover(TAG);
    expect(MATCH_FIELDS.map((f) => f.path).sort()).toEqual(Object.keys(MATCH_FIELD_INFO).sort());
  });

  it("`match` 區塊真的被走進去了 —— 它外面包著兩層 `.refine()`", () => {
    cover(TAG);
    // `zConfigMatchDoc.shape.match` 是 ZodEffects(ZodEffects(ZodObject))。少了
    // 剝 ZodEffects 那一段，整個回合時鐘會被當成「無法編輯的葉子」整塊消失，
    // 而畫面上只會少一個區段、不會有任何錯誤。
    const paths = MATCH_FIELDS.map((f) => f.path);
    expect(paths).toContain("match.combatMaxSec");
    expect(paths).toContain("match.fireRing.startSec");
    expect(paths).toContain("match.fireRing.boss.delayFireRingSec");
  });

  it("放不進輸入框的葉子只有已知的那兩個", () => {
    cover(TAG);
    // `match.fireRing.burnCurve` 是斷點表（陣列），`deriveFields` 走不進去 ——
    // 但它**不是** `draft.tierSchedule` 那種「原封不動帶著走」的分支：它有自己的
    // 編輯路徑（`BURN_CURVE_SPEC` + `configCurve.ts`），驗證在下面的 describe。
    expect(MATCH_DERIVED.unsupported.map((u) => u.path).sort()).toEqual([
      "draft.tierSchedule",
      "match.fireRing.burnCurve",
    ]);
  });

  it("可以整塊拿掉的區塊只有火圈 —— `.default({})` 的 boss 區塊不是", () => {
    cover(TAG);
    // `match.fireRing.boss` 是 `.default({})`：刪掉它 loader 會補回來，所以畫一個
    // 「啟用／停用」開關給它是騙人的。
    expect(MATCH_DERIVED.optionalBlocks).toEqual([FIRE_RING_BLOCK]);
  });

  it("每一格都落在畫面上的某一組裡", () => {
    cover(TAG);
    const grouped = MATCH_GROUPS.flatMap((g) => g.paths).sort();
    expect(grouped).toEqual(MATCH_FIELDS.map((f) => f.path).sort());
  });
});

describe("欄位要有上界，不是只有下界 (#277)", () => {
  it("每一個數字欄位都兩邊有界 —— schema 給的優先，其餘由後台補", () => {
    cover(TAG);
    let consoleSupplied = 0;
    for (const f of MATCH_FIELDS) {
      // 布林沒有上下界可講（`boundsFor` 對它回 null）—— 它的「界」是那兩個具名
      // 狀態，由下面「每一個布林都畫成開關」那一條守。
      if (f.kind === "boolean") continue;
      const b = matchFieldBounds(f);
      expect(b, f.path).not.toBeNull();
      expect(Number.isFinite(b!.max), `${f.path} 沒有上界`).toBe(true);
      if (b!.maxFromConsole) consoleSupplied++;
    }
    // 兩邊都是推導的：`consoleSupplied` 數的是實際走後台那條路的欄位，
    // `MATCH_CONSOLE_MAX` 是宣告。對不上有兩種意思，都值得停下來看：
    //   · console < 宣告 → 有人在 schema 補了上界，這張表多了一格死的（拿掉）
    //   · console > 宣告 → 新欄位兩邊都沒上界，`matchFieldBounds` 會回 null 先紅
    // 2026-08-03 就是第一種：`champSelectSec` 的上界搬進 Zod 了。
    expect(consoleSupplied).toBe(Object.keys(MATCH_CONSOLE_MAX).length);
  });

  it("後台補的上界不是打字打出來的，是釘在真正的常數上", () => {
    cover(TAG);
    // `resolveStartingTeamHealth` 會夾到這個值 —— 後台放行更大的數字，就會出現
    // 「畫面寫 200、實戰跑 60」。
    expect(MATCH_CONSOLE_MAX["match.startingTeamLives"]).toBe(MAX_STARTING_TEAM_HEALTH);
    // `grantLevels` 到 LEVEL_CAP 就停，填得更大不會多出任何一級。
    expect(MATCH_CONSOLE_MAX["progression.levelCap"]).toBe(LEVEL_CAP);
  });

  it("超界的值存不出去（兩個方向）", () => {
    cover(TAG);
    for (const f of MATCH_FIELDS) {
      if (!isEditable(f.path)) continue;
      if (f.kind === "boolean") continue; // 開關沒有「超界」這回事
      const b = matchFieldBounds(f)!;
      expect(validateMatchField(f.path, String(b.max + 1), true), f.path).toMatch(/不能大於/);
      expect(validateMatchField(f.path, String(b.min - 1), true), f.path).toBeTruthy();
    }
  });

  it("選填的格子可以留白，必填的不行", () => {
    cover(TAG);
    expect(validateMatchField("match.fireRing.maxPctPerSec", "", true)).toBeNull();
    expect(validateMatchField("match.combatMaxSec", "", true)).toBe("不能空白");
  });
});

describe("可調的格子真的走得到消費端", () => {
  it("階段秒數 → game-server 自己的 `phaseConfigFromSeconds` 給出不同的 tick 數", () => {
    cover(TAG);
    const read = readMatchDoc(SHIPPED_DOC);
    const before = phaseConfigFromSeconds(
      (getAtPath(SHIPPED_DOC, "match") ?? {}) as Record<string, number>,
    );
    const doc = matchDocFrom(SHIPPED_DOC, { ...read.values, "match.intermissionSec": "45" }, true);
    const after = phaseConfigFromSeconds((doc.match ?? {}) as Record<string, number>);
    expect(after.intermissionTicks).toBe(45 * TICK_HZ);
    expect(after.intermissionTicks).not.toBe(before.intermissionTicks);
    // 沒被碰到的階段不動 —— 存檔不會順手重設別的秒數
    expect(after.champSelectTicks).toBe(before.champSelectTicks);
    expect(after.combatMaxTicks).toBe(before.combatMaxTicks);
  });

  it("火圈 → sim 自己的 `fireRingRulesFromConfig` 給出不同的規則", () => {
    cover(TAG);
    const read = readMatchDoc(SHIPPED_DOC);
    const doc = matchDocFrom(SHIPPED_DOC, { ...read.values, "match.fireRing.startSec": "30" }, true);
    const ring = getAtPath(doc, FIRE_RING_BLOCK) as Parameters<typeof fireRingRulesFromConfig>[0];
    // `dt` = 一個 tick 幾秒，和 MatchRoom 餵給它的是同一個量。
    const rules = fireRingRulesFromConfig(ring, 1 / TICK_HZ, Number(read.values["match.combatMaxSec"]));
    expect(rules.startTicks).toBe(30 * TICK_HZ);
    // 殭屍王的兩個延長鈕也走得到（它們在 schema 裡是 `.default()`，最容易掉隊）
    expect(rules.bossExtendTicks).toBe(180 * TICK_HZ);
    expect(rules.bossDelayTicks).toBe(180 * TICK_HZ);
  });

  it("灼燒曲線改一列 → 出貨的 `fireRingRatePerSec` 在那個秒數上真的變了", () => {
    cover(TAG);
    // ⚠️ 舊版這裡是 `expect(rules.burnPctPerSecEnd).toBe(0.5)` —— 掃屬性代替掃
    // 行為（第⑦種故障）：一個把 rate 硬寫成常數的實作也會通過它。現在問的是
    // 「餵這條曲線，第 40 秒每秒燒多少」。
    const read = readMatchDoc(SHIPPED_DOC);
    const rows = curveRowsFrom(SHIPPED_DOC, BURN_CURVE_SPEC);
    expect(rows).toHaveLength(3); // 出貨三列讀得到（不是空表）

    const rulesOf = (r: CurveRowDraft[]): ReturnType<typeof fireRingRulesFromConfig> => {
      const doc = matchDocFrom(SHIPPED_DOC, read.values, true, r);
      const ring = getAtPath(doc, FIRE_RING_BLOCK) as Parameters<typeof fireRingRulesFromConfig>[0];
      return fireRingRulesFromConfig(ring, 1 / TICK_HZ, 100);
    };
    // ⚠️ 這一段問的秒數刻意在**上限以下**（出貨上限 0.5，第 20 秒的曲線值 0.2）。
    // 問第 40 秒會拿到 0.5 —— 那是天花板不是曲線，一個把 rate 硬寫成 0.5 的實作
    // 也會過（第⑦種故障）。
    expect(fireRingRatePerSec(rulesOf(rows), 20 * TICK_HZ)).toBeCloseTo(0.2, 12);
    // 把第 20 秒那一列的 y 改成 0.1 → 同一個秒數的燒傷跟著掉
    const softened = setCurveCell(rows, 1, "y", "0.1");
    expect(fireRingRatePerSec(rulesOf(softened), 20 * TICK_HZ)).toBeCloseTo(0.1, 12);
    // 出貨的 `maxPctPerSec: 0.5` 是唯一那道牆（owner 2026-08-02「預設最高是50%…
    // 不必到100%」）：曲線最後一列寫 1.0，玩家實際上一秒只掉半條命。
    expect(fireRingRatePerSec(rulesOf(rows), 40 * TICK_HZ)).toBeCloseTo(0.5, 12);
    // 加一列（第 60 秒 2.0）也走得到，但一樣被那道牆壓在 0.5。
    const longer = setCurveCell(setCurveCell(addCurveRow(rows), 3, "x", "60"), 3, "y", "2");
    expect(fireRingRatePerSec(rulesOf(longer), 60 * TICK_HZ)).toBeCloseTo(0.5, 12);

    const ringOf = (v: Record<string, string>): Parameters<typeof fireRingRulesFromConfig>[0] =>
      getAtPath(matchDocFrom(SHIPPED_DOC, v, true, longer), FIRE_RING_BLOCK) as Parameters<
        typeof fireRingRulesFromConfig
      >[0];
    const rateAt60 = (v: Record<string, string>): number =>
      fireRingRatePerSec(fireRingRulesFromConfig(ringOf(v), 1 / TICK_HZ, 100), 60 * TICK_HZ);
    // 把上限這一格調到 1.0 → 同一條曲線真的燒到 1.0。這就是「這一格有消費端」。
    expect(rateAt60({ ...read.values, "match.fireRing.maxPctPerSec": "1" })).toBeCloseTo(1, 12);
    // ⚠️ 留白 **不是**「不設限」，是回到出貨預設 0.5。舊版這裡斷言 2.0（sim 缺席時
    // 填 Infinity），而 Zod 同一格宣告的是有界的 —— 兩層對「上限是多少」給出相差
    // 無限大的答案，那是 drift 不是功能。
    expect(rateAt60({ ...read.values, "match.fireRing.maxPctPerSec": "" })).toBeCloseTo(
      DEFAULT_MAX_PCT_PER_SEC,
      12,
    );
  });

  it("曲線壞掉時**不寫**，而且存檔被擋下來", () => {
    cover(TAG);
    const read = readMatchDoc(SHIPPED_DOC);
    const rows = curveRowsFrom(SHIPPED_DOC, BURN_CURVE_SPEC);
    // 第 2 列的秒數倒退 → 內插的分母會是負的，schema 也會拒絕
    const broken = setCurveCell(rows, 1, "x", "0");
    expect(validateBurnCurve(broken, true).points).toBeNull();
    const doc = matchDocFrom(SHIPPED_DOC, read.values, true, broken);
    // 半張表沒有被寫進文件 —— 基底那一份原封不動（loader 對驗不過的文件是整份丟掉）
    expect(getAtPath(doc, "match.fireRing.burnCurve")).toEqual([
      { sec: 0, pctPerSec: 0.04 },
      { sec: 20, pctPerSec: 0.2 },
      { sec: 40, pctPerSec: 1 },
    ]);
    // 而且超界的 y 會被逐格擋下來（#277：上界和下界一樣重要）
    expect(validateBurnCurve(setCurveCell(rows, 2, "y", "5"), true).points).toBeNull();
    expect(validateBurnCurve(setCurveCell(rows, 2, "y", "-1"), true).points).toBeNull();
  });

  it("後台的預覽走的是出貨函式，而且把「回合第幾秒」一起算出來", () => {
    cover(TAG);
    const rows = curveRowsFrom(SHIPPED_DOC, BURN_CURVE_SPEC);
    const preview = burnCurvePreview(validateBurnCurve(rows, true).points, 60, 1);
    const at40 = preview.find((p) => p.sinceIgniteSec === 40)!;
    // owner 的那一句：點燃後 40 秒 = 回合第 100 秒 = 100 %/秒 = 一秒必死
    expect(at40.roundSec).toBe(100);
    expect(at40.pctPerSec).toBeCloseTo(1, 12);
    // 1.033 s, not a clean 1.000: the preview counts REAL 30 Hz ticks the way the
    // sim does, and `1 - 30 × (1/30)` leaves a float crumb, so the 31st tick is
    // the one that finishes the bar. Showing 1.03 is more honest than showing a
    // closed-form 1.00 the game will not reproduce.
    expect(at40.secondsToDeath).toBeCloseTo(1.033, 2);
    // 起燃那一刻站出去不回來 → 11.6 秒（和 sim 實測同一個數字）
    expect(preview.find((p) => p.sinceIgniteSec === 0)!.secondsToDeath).toBeCloseTo(11.6, 2);
  });

  it("停用火圈 → 文件裡整塊不見 → `resolveFireRing` 那條路會回 null", () => {
    cover(TAG);
    const read = readMatchDoc(SHIPPED_DOC);
    const doc = matchDocFrom(SHIPPED_DOC, read.values, false);
    expect(getAtPath(doc, FIRE_RING_BLOCK)).toBeUndefined();
    // 而且拿掉之後整份文件仍然合法（火圈是 `.optional()` 的純加法）
    expect(matchDocIssues(doc)).toEqual([]);
  });
});

describe("唯讀的格子存檔時原封不動", () => {
  it("改了可調的格子之後，19 格唯讀值和基底逐一相同", () => {
    cover(TAG);
    const read = readMatchDoc(SHIPPED_DOC);
    const doc = matchDocFrom(
      SHIPPED_DOC,
      { ...read.values, "match.combatMaxSec": "180", "match.startingTeamLives": "30" },
      true,
    );
    const readOnly = MATCH_FIELDS.filter((f) => !isEditable(f.path));
    expect(readOnly).toHaveLength(19);
    for (const f of readOnly) {
      expect(getAtPath(doc, f.path), `${f.path} 被動到了`).toEqual(getAtPath(SHIPPED_DOC, f.path));
    }
  });

  it("頁面沒有畫出來的欄位（`draft.tierSchedule`）也原封不動", () => {
    cover(TAG);
    const base = JSON.parse(JSON.stringify(SHIPPED_DOC)) as Record<string, unknown>;
    (base.draft as Record<string, unknown>).tierSchedule = { "2": "gold", "5": "prismatic" };
    const read = readMatchDoc(base);
    const doc = matchDocFrom(base, { ...read.values, "match.resolutionSec": "8" }, true);
    expect(getAtPath(doc, "draft.tierSchedule")).toEqual({ "2": "gold", "5": "prismatic" });
  });

  it("每一格唯讀的都說得出真正的數字住在哪", () => {
    cover(TAG);
    for (const f of MATCH_FIELDS) {
      if (isEditable(f.path)) continue;
      const info = MATCH_FIELD_INFO[f.path]!;
      expect(info.realHome, `${f.path} 沒有寫真正的數字在哪`).toBeTruthy();
      expect(info.realHome!.length).toBeGreaterThan(10);
    }
  });

  it("每一格可調的都說得出誰在讀它", () => {
    cover(TAG);
    for (const f of MATCH_FIELDS) {
      if (!isEditable(f.path)) continue;
      expect(MATCH_FIELD_INFO[f.path]!.live!.length, f.path).toBeGreaterThan(10);
    }
  });
});

describe("跨欄位規則 —— 單格上下界擋不住的那兩條", () => {
  it("火圈收不完就被硬底線砍掉時，存檔被擋下來", () => {
    cover(TAG);
    const read = readMatchDoc(SHIPPED_DOC);
    // 二段制: 拉長**第二段**的收圈到 200 秒 → 整個圈 60 + (30 + 200) = 290 秒，
    // 遠在 combatMaxSec 之外。⚠️ 這裡刻意動的是第二段而不是 `startSec`：
    // 舊的檢查算式是 `startSec + shrinkSec`，只看第一段，對這個改動**完全沒有
    // 反應** —— 也就是說這一條測試如果還在測 `startSec`，它對真正的缺陷是盲的
    // （失敗形態 ④）。
    const doc = matchDocFrom(
      SHIPPED_DOC,
      { ...read.values, "match.fireRing.stage2ShrinkSec": "200" },
      true,
    );
    const issues = matchDocIssues(doc);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join(" ")).toContain("combatMaxSec");
  });

  it("殭屍王延後大過延長時，存檔被擋下來", () => {
    cover(TAG);
    const read = readMatchDoc(SHIPPED_DOC);
    const doc = matchDocFrom(
      SHIPPED_DOC,
      { ...read.values, "match.fireRing.boss.delayFireRingSec": "600" },
      true,
    );
    expect(matchDocIssues(doc).join(" ")).toContain("殭屍王");
  });

  it("出貨的內容檔本身是合法的（沒有它，上面兩條可能只是在測一份壞樣本）", () => {
    cover(TAG);
    expect(matchDocIssues(SHIPPED_DOC)).toEqual([]);
    expect(readMatchDoc(SHIPPED_DOC).parseError).toBeNull();
  });

  /**
   * 閘 B —— **出貨 config 不准跟程式常數說反話**。
   *
   * ⛔ `progression.levelCap: 18` 從 initial commit 就在出貨，而 sim **從來沒讀過
   * 它**（`grantLevels` / `grantXp` 讀的是 `LEVEL_CAP = 99`）。這一頁的檔頭甚至
   * **逐字寫下了這個矛盾**，而沒有任何測試在比對兩者 —— 一句散文替一個出貨的謊
   * 背書了六個月。⭐ 這是「說了但不會發生」的一種：schema 收得下、後台顯示得
   * 出來、`content:build` 全綠、3,500 條測試全綠，而那個數字對任何一場比賽都沒有
   * 意義。它會騙的是**下一個讀這份檔案的人**（含 Codex 編輯器與運維唯讀頁）。
   *
   * ⚠️ 走 `readMatchDoc`（＝出貨的 Zod + `.default()`），⛔ 不是直接讀原始 JSON ——
   * 玩家那一側拿到的是 loader 跑完的那一份，不是磁碟上的位元組。
   */
  it("出貨 config 不跟程式常數說反話 —— `progression.levelCap` === `LEVEL_CAP`", () => {
    cover(TAG);
    const read = readMatchDoc(SHIPPED_DOC);
    expect(read.parseError).toBeNull();
    expect(Number(read.values["progression.levelCap"])).toBe(LEVEL_CAP);
    // ⭐ 兩份「新建一份 config」的種子也釘住 —— 它們是下一份文件的出生值，
    //    抄一個字面量進去就是把同一個謊生一次。
    const seeded = collectionEntry("config").template("seed") as {
      progression: { levelCap: number };
    };
    expect(seeded.progression.levelCap).toBe(LEVEL_CAP);
  });
});

describe("讀值與寫入", () => {
  it("驗不過的文件會被說出來 —— loader 對它是**整份丟掉**", () => {
    cover(TAG);
    const broken = JSON.parse(JSON.stringify(SHIPPED_DOC)) as Record<string, unknown>;
    (broken.economy as Record<string, unknown>).startingGold = -5;
    const read = readMatchDoc(broken);
    expect(read.parseError).toBeTruthy();
    expect(read.parseError).toContain("startingGold");
  });

  it("`.default()` 會被套用，因為 loader 也會套", () => {
    cover(TAG);
    const noBoss = JSON.parse(JSON.stringify(SHIPPED_DOC)) as Record<string, unknown>;
    delete ((noBoss.match as Record<string, unknown>).fireRing as Record<string, unknown>).boss;
    const read = readMatchDoc(noBoss);
    // 缺席的 boss 區塊 loader 會補成 180/180 —— 畫面必須顯示 180，不是空白。
    expect(read.values["match.fireRing.boss.extendCombatSec"]).toBe("180");
  });

  it("送出去的文件通得過出貨寫入路徑上的 Zod 閘", () => {
    cover(TAG);
    const read = readMatchDoc(SHIPPED_DOC);
    const doc = matchDocFrom(SHIPPED_DOC, { ...read.values, "match.champSelectSec": "35" }, true);
    expect(doc.id).toBe(MATCH_DOC_ID);
    expect(doc.schema).toBe(MATCH_SCHEMA);
    expect(validateOverlayDoc("config", MATCH_DOC_ID, doc)).toEqual({ ok: true, validated: true });
  });
});
