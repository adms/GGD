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
import { validateOverlayDoc } from "./contentOverlay";
// 真正的消費端 —— 不是這一頁自己寫的鏡像（第⑤種故障：被測的不是出貨的那個）。
import { phaseConfigFromSeconds } from "../../game-server/src/match/phaseConfig";
import { MAX_STARTING_TEAM_HEALTH } from "../../game-server/src/match/PairedDuels";
import { fireRingRulesFromConfig } from "@ggd/shared/sim/fireRing";
import { LEVEL_CAP } from "@ggd/shared/sim/economy/progression";
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

  it("放不進輸入框的葉子只有已知的那一個（`draft.tierSchedule`）", () => {
    cover(TAG);
    expect(MATCH_DERIVED.unsupported.map((u) => u.path)).toEqual(["draft.tierSchedule"]);
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
  it("32 個數字欄位全部兩邊有界 —— 包含 schema 只給下界的那 24 格", () => {
    cover(TAG);
    let consoleSupplied = 0;
    for (const f of MATCH_FIELDS) {
      const b = matchFieldBounds(f);
      expect(b, f.path).not.toBeNull();
      expect(Number.isFinite(b!.max), `${f.path} 沒有上界`).toBe(true);
      if (b!.maxFromConsole) consoleSupplied++;
    }
    // schema 自己只給了 8 格上界；其餘 24 格由後台補。這個數字會隨 schema 改動而動，
    // 而它一動就代表有人碰了上下界，值得看一眼。
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
    const doc = matchDocFrom(
      SHIPPED_DOC,
      { ...read.values, "match.fireRing.startSec": "30", "match.fireRing.burnPctPerSecEnd": "0.5" },
      true,
    );
    const ring = getAtPath(doc, FIRE_RING_BLOCK) as Parameters<typeof fireRingRulesFromConfig>[0];
    // `dt` = 一個 tick 幾秒，和 MatchRoom 餵給它的是同一個量。
    const rules = fireRingRulesFromConfig(ring, 1 / TICK_HZ, Number(read.values["match.combatMaxSec"]));
    expect(rules.startTicks).toBe(30 * TICK_HZ);
    expect(rules.burnPctPerSecEnd).toBe(0.5);
    // 殭屍王的兩個延長鈕也走得到（它們在 schema 裡是 `.default()`，最容易掉隊）
    expect(rules.bossExtendTicks).toBe(180 * TICK_HZ);
    expect(rules.bossDelayTicks).toBe(180 * TICK_HZ);
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
    // startSec 90 + shrinkSec 20 = 110 > combatMaxSec 100 → 圈還在縮就強制結束
    const doc = matchDocFrom(SHIPPED_DOC, { ...read.values, "match.fireRing.startSec": "90" }, true);
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
