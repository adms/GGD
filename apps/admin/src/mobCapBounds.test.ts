/**
 * 殭屍上限的天花板 (owner 2026-07-30 裁定「上限值 500」) —— 四層守衛。
 *
 * ── 這條守的是什麼缺陷 ─────────────────────────────────────────────────────
 * `mobsPerWaveCap` / `maxAlivePerZone` 是整個 `mobWaves` 區塊裡**唯二**只有下界
 * 沒有上界的兩格。GH#206 那一輪替這一頁補 `max` 時漏了它們,結果是
 * 「場上同時上限 5000」在後台合法、在 Zod 合法、寫進耐久覆蓋層也合法 ——
 * 沒有任何一個字提醒操作者,缺陷要到那一場比賽的伺服器開始掉幀才會被發現。
 * 這是 #277(基礎加成負值)的同一個 bug 家族:**只有下界的欄位等於沒有驗證。**
 *
 * ── 為什麼是四層,不是一層 ─────────────────────────────────────────────────
 * 一個欄位的界線要同時落在四個地方,任何一個少掉都是一條真的可以走的繞道:
 *   1. Zod schema      —— 擋住手改 `overlay.json` / 舊主機寫下的文件 / 匯入包
 *   2. 後台基準格       —— `validateField`(`MOB_WAVES_LABELS.max`)
 *   3. 後台逐回合表     —— `validateForm` 裡**手寫**的那段(它不走 validateField,
 *                         GH#206 就是在這裡漏第二次的)
 *   4. 畫面             —— 界線要印出來。擋得住但不講,操作者只能先打錯一次
 * 所以這個檔案的四個 describe 就是這四層,而第 5 個 describe 是把 2/3 和 1 的
 * 數字釘在一起的 drift pin(後台那兩個常數是 RESTATED 的,見 mobWaves.ts 檔頭)。
 *
 * ⚠️ 每一條都成對測「500 過 / 501 不過」。只測「501 不過」的話,一個把上界設成
 * 0 的實作也會全綠 —— 那會把這一頁鎖死,而測試不會有意見(失敗形態 ④)。
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import {
  MOB_ALIVE_CAP_MAX as SCHEMA_ALIVE_MAX,
  MOB_PER_WAVE_CAP_MAX as SCHEMA_PER_WAVE_MAX,
  DEFAULT_MOB_WAVES_CONFIG,
  zMobWavesConfig,
} from "@ggd/shared/content/schema/config";
import {
  MOB_ALIVE_CAP_MAX,
  MOB_PER_WAVE_CAP_MAX,
  MOB_WAVES_LABELS,
  SHIPPED_MOB_WAVES,
  boundsText,
  formFromConfig,
  formValid,
  setField,
  setScheduleCell,
  validateField,
  validateForm,
} from "./mobWaves";
import { MobWavesPage } from "./ui/MobWavesPage";

const COVER = "admin-mob-cap-bounds";

/** A config with the two caps set to whatever the case under test needs. */
function withCaps(perWave: number, alive: number): typeof DEFAULT_MOB_WAVES_CONFIG {
  return { ...DEFAULT_MOB_WAVES_CONFIG, mobsPerWaveCap: perWave, maxAlivePerZone: alive };
}

// ---------------------------------------------------------------- layer 1 ---

describe("層 1 — Zod schema 擋得住 (mob-cap-schema)", () => {
  it("基準兩格:500 過,501 不過", () => {
    cover(COVER);
    expect(zMobWavesConfig.safeParse(withCaps(500, 500)).success, "500 被擋掉了").toBe(true);
    expect(zMobWavesConfig.safeParse(withCaps(501, 15)).success, "每波 501 過了").toBe(false);
    expect(zMobWavesConfig.safeParse(withCaps(5, 501)).success, "場上 501 過了").toBe(false);
  });

  it("逐回合表也擋 —— 它是另一個 z.object(),不會自己繼承基準格的界線", () => {
    cover(COVER);
    const withRow = (perWave: number, alive: number): unknown => ({
      ...DEFAULT_MOB_WAVES_CONFIG,
      schedule: [{ round: 9, mobsPerWaveCap: perWave, maxAlivePerZone: alive }],
    });
    expect(zMobWavesConfig.safeParse(withRow(500, 500)).success).toBe(true);
    expect(zMobWavesConfig.safeParse(withRow(501, 0)).success, "逐回合每波 501 過了").toBe(false);
    expect(zMobWavesConfig.safeParse(withRow(0, 501)).success, "逐回合場上 501 過了").toBe(false);
    // 0 仍然合法 —— 那是出貨版第 10 回合的「乾淨總決賽」,上界不可以順手把它殺掉
    expect(zMobWavesConfig.safeParse(withRow(0, 0)).success, "上界把 0/0 一起擋掉了").toBe(true);
  });

  it("出貨的那份文件仍然過 —— 守衛不可以把現況變成非法", () => {
    cover(COVER);
    expect(zMobWavesConfig.safeParse(DEFAULT_MOB_WAVES_CONFIG).success).toBe(true);
    expect(zMobWavesConfig.safeParse(SHIPPED_MOB_WAVES).success).toBe(true);
  });
});

// ---------------------------------------------------------------- layer 2 ---

describe("層 2 — 後台基準格 validateField 擋得住 (mob-cap-field)", () => {
  it("兩格都是 500 過 / 501 不過,而且訊息說出那個數字", () => {
    cover(COVER);
    for (const key of ["mobsPerWaveCap", "maxAlivePerZone"] as const) {
      expect(validateField(key, "500"), `${key} 把 500 擋掉了`).toBe("");
      const err = validateField(key, "501");
      expect(err, `${key} 沒有上界`).not.toBe("");
      expect(err, `${key} 的訊息沒有講出天花板`).toContain("500");
    }
  });

  it("下界還在 —— 補上界不可以把下界弄丟", () => {
    cover(COVER);
    expect(validateField("maxAlivePerZone", "0")).not.toBe("");
    expect(validateField("mobsPerWaveCap", "0")).not.toBe("");
  });

  it("表單層也真的拒收 —— 儲存按鈕讀的是 formValid,不是 validateField", () => {
    cover(COVER);
    const bad = setField(formFromConfig(SHIPPED_MOB_WAVES), "maxAlivePerZone", "501");
    expect(formValid(bad), "501 的表單仍然可以按儲存").toBe(false);
    const ok = setField(formFromConfig(SHIPPED_MOB_WAVES), "maxAlivePerZone", "500");
    expect(formValid(ok), "500 的表單被鎖住了").toBe(true);
  });
});

// ---------------------------------------------------------------- layer 3 ---

describe("層 3 — 逐回合表的手寫檢查也擋得住 (mob-cap-schedule)", () => {
  /** The shipped schedule's last row (round 10, the 0/0 「乾淨總決賽」). */
  const lastRow = (SHIPPED_MOB_WAVES.schedule ?? []).length - 1;

  it("逐回合的兩格:500 過 / 501 不過", () => {
    cover(COVER);
    for (const cell of ["mobsPerWaveCap", "maxAlivePerZone"] as const) {
      const base = formFromConfig(SHIPPED_MOB_WAVES);
      const bad = setScheduleCell(base, lastRow, cell, "501");
      const rowErr = validateForm(bad).schedule[lastRow];
      expect(rowErr?.[cell], `逐回合 ${cell} 沒有上界`).toBeTruthy();
      expect(rowErr?.[cell], `逐回合 ${cell} 的訊息沒有講出天花板`).toContain("500");
      expect(formValid(bad), `逐回合 ${cell} = 501 仍然可以儲存`).toBe(false);

      const ok = setScheduleCell(base, lastRow, cell, "500");
      expect(validateForm(ok).schedule[lastRow]?.[cell], `逐回合 ${cell} 把 500 擋掉了`).toBeUndefined();
      expect(formValid(ok), `逐回合 ${cell} = 500 的表單被鎖住了`).toBe(true);
    }
  });

  it("0 仍然合法 —— 「那一回合完全沒有殭屍」是出貨設計,不是輸入錯誤", () => {
    cover(COVER);
    const zeroed = setScheduleCell(
      setScheduleCell(formFromConfig(SHIPPED_MOB_WAVES), lastRow, "mobsPerWaveCap", "0"),
      lastRow,
      "maxAlivePerZone",
      "0",
    );
    expect(validateForm(zeroed).schedule[lastRow]).toEqual({});
    expect(formValid(zeroed)).toBe(true);
  });
});

// ---------------------------------------------------------------- layer 4 ---

describe("層 4 — 界線印在畫面上 (mob-cap-visible)", () => {
  const HTML = renderToString(createElement(MobWavesPage));

  it("基準兩格的區間出現在第一次繪製裡", () => {
    cover(COVER);
    // ⚠️ 讀的是**真的頁面**輸出,不是 `boundsText` 的回傳值。上一版就是這樣壞的:
    // `max` 算得出來、也真的會擋,但沒有任何一個元件把它印出來(失敗形態 ②)。
    expect(HTML, "每波數量上限沒有把區間印出來").toContain(
      boundsText(MOB_WAVES_LABELS.mobsPerWaveCap),
    );
    expect(HTML, "場上同時上限沒有把區間印出來").toContain(
      boundsText(MOB_WAVES_LABELS.maxAlivePerZone),
    );
    expect(boundsText(MOB_WAVES_LABELS.maxAlivePerZone)).toBe("範圍 1 ~ 500");
  });

  it("逐回合表的欄頭也寫出上界", () => {
    cover(COVER);
    expect(HTML, "逐回合「每波數量」欄頭沒有上界").toContain(`每波數量（0 ~ ${MOB_PER_WAVE_CAP_MAX}）`);
    expect(HTML, "逐回合「場上上限」欄頭沒有上界").toContain(`場上上限（0 ~ ${MOB_ALIVE_CAP_MAX}）`);
  });

  it("boundsText 對沒有上界的欄位不可以假裝有", () => {
    cover(COVER);
    // 鑑別力:如果 boundsText 無腦印 `範圍 min ~ undefined`,這一條會紅。
    expect(boundsText(MOB_WAVES_LABELS.fromRound)).toBe("範圍 ≥ 1");
    expect(boundsText(MOB_WAVES_LABELS.firstWaveSec)).toBe("範圍 > 0");
    // 非數值欄位沒有區間可講 —— 印出「範圍 undefined」會比不印更糟
    expect(boundsText(MOB_WAVES_LABELS["mob.championSource"])).toBe("");
    expect(boundsText(MOB_WAVES_LABELS["mob.modelKey"])).toBe("");
  });
});

// ------------------------------------------------------------- drift pin ---

describe("drift pin — 後台重寫的常數和 schema 是同一個數字 (mob-cap-drift)", () => {
  it("兩個 500 是同一個 500", () => {
    cover(COVER);
    // mobWaves.ts 刻意 RESTATE 這兩個常數(檔頭:schema 模組在 module scope import
    // zod,而這一頁是正式 bundle 的 eager 成員)。RESTATE 的代價就是會 drift,
    // 所以這裡把它們釘在一起 —— 改一邊忘了改另一邊,這條紅。
    expect(MOB_ALIVE_CAP_MAX).toBe(SCHEMA_ALIVE_MAX);
    expect(MOB_PER_WAVE_CAP_MAX).toBe(SCHEMA_PER_WAVE_MAX);
    // owner 2026-07-30 裁定的那個數字本身。改它要有 owner 的一句話,不是順手。
    expect(MOB_ALIVE_CAP_MAX, "owner 裁定的上限值是 500").toBe(500);
  });

  it("欄位規格上的 max 就是那兩個常數,不是自己抄一遍的字面值", () => {
    cover(COVER);
    expect(MOB_WAVES_LABELS.maxAlivePerZone.max).toBe(SCHEMA_ALIVE_MAX);
    expect(MOB_WAVES_LABELS.mobsPerWaveCap.max).toBe(SCHEMA_PER_WAVE_MAX);
  });
});
