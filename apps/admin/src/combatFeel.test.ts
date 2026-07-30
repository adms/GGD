/**
 * 戰鬥手感後台 —— 純邏輯的守衛。
 *
 * ── 這個檔案在守什麼 ────────────────────────────────────────────────────────
 * `config.combat-feel@1` 在這一頁之前是**零後台入口**的四張決策表。做一頁出來
 * 很容易，做一頁「操作者填的值真的會變成遊戲行為」很難，而兩者在畫面上長得
 * 一模一樣。所以這裡的每一條都盯著一個具體的失敗形態：
 *
 *   · 欄位清單抄一份 → 隔壁 lane（GH#216）加一格就漂走 → 用**推導 + 雙向比對**守
 *   · 只檢查下界 → 「50 打成 500」過後台（#277）→ 用**兩邊都試**守
 *   · 後台的界和 sim 的夾限各自漂 → 存 4800、玩 200、畫面顯示 4800 →
 *     用**把界餵給 sim 自己的讀取器**守（不是比對兩個常數表）
 *   · 只寫被改過的區塊 → 覆蓋層把其他三張表凍結在今天的預設值 → 用**數區塊**守
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  COMBAT_FEEL_DOC_ID,
  COMBAT_FEEL_FIELDS,
  COMBAT_FEEL_GROUPS,
  COMBAT_FEEL_LABELS,
  COMBAT_FEEL_SCHEMA,
  COMBAT_FEEL_DERIVED,
  combatFeelFromDoc,
  feelDocFrom,
  fieldBounds,
  fieldsOfGroup,
  shippedValues,
  validateFeelField,
  validateFeelValues,
  valuesFromRules,
} from "./combatFeel";
import { getAtPath, setAtPath } from "./configFields";
import { validateOverlayDoc } from "./contentOverlay";
import { DEFAULT_COMBAT_FEEL } from "@ggd/shared/sim/combatFeel";

const TAG = "adminui-combat-feel";

describe("欄位是從 Zod schema 推導出來的", () => {
  it("推導出來的欄位和標籤表**雙向**吻合 —— 隔壁 lane 加一格就會紅", () => {
    cover(TAG);
    const derived = COMBAT_FEEL_FIELDS.map((f) => f.path).sort();
    const labelled = Object.keys(COMBAT_FEEL_LABELS).sort();
    // → 少一條 = 畫面上有一格只有英文 path、沒有「它影響什麼」
    // ← 多一條 = schema 已經刪了那一格，而後台還留著一段描述它的謊話
    expect(derived).toEqual(labelled);
  });

  it("GH#216 今晚才加的兩格真的被推導到 —— 證明讀的是 schema 不是快照", () => {
    cover(TAG);
    const paths = COMBAT_FEEL_FIELDS.map((f) => f.path);
    expect(paths).toContain("autoEngage.respectLiveSteering");
    expect(paths).toContain("autoEngage.ccPausesStall");
    // 而且是布林 —— 型別也是從 schema 讀的，不是猜的
    expect(COMBAT_FEEL_FIELDS.find((f) => f.path === "autoEngage.ccPausesStall")?.kind).toBe("boolean");
  });

  it("`id` / `schema` 不會變成可編輯的格子", () => {
    cover(TAG);
    const paths = COMBAT_FEEL_FIELDS.map((f) => f.path);
    expect(paths).not.toContain("id");
    expect(paths).not.toContain("schema");
  });

  it("沒有任何一個欄位是頁面放不進輸入框的", () => {
    cover(TAG);
    // `combat-feel` 全部是數字與布林；有一天冒出 record / array 時這裡會紅，
    // 而那正是需要有人決定 UI 長怎樣的時候。
    expect(COMBAT_FEEL_DERIVED.unsupported).toEqual([]);
  });

  it("每一格都落在畫面上的某一個群組裡 —— 沒有格子會從頁面消失", () => {
    cover(TAG);
    const grouped = COMBAT_FEEL_GROUPS.flatMap((g) => fieldsOfGroup(g.key).map((f) => f.path)).sort();
    expect(grouped).toEqual(COMBAT_FEEL_FIELDS.map((f) => f.path).sort());
  });
});

describe("欄位要有上界，不是只有下界 (#277)", () => {
  it("每一個數字欄位都有**有限的**上界與下界", () => {
    cover(TAG);
    for (const f of COMBAT_FEEL_FIELDS) {
      if (f.kind === "boolean") continue;
      const b = fieldBounds(f);
      expect(b, f.path).not.toBeNull();
      expect(Number.isFinite(b!.max), `${f.path} 沒有上界`).toBe(true);
      expect(Number.isFinite(b!.min), `${f.path} 沒有下界`).toBe(true);
      expect(b!.max).toBeGreaterThan(b!.min);
    }
  });

  it("超過上界會被擋下來 —— 「50 打成 500」不會過後台", () => {
    cover(TAG);
    for (const f of COMBAT_FEEL_FIELDS) {
      if (f.kind === "boolean") continue;
      const b = fieldBounds(f)!;
      expect(validateFeelField(f.path, String(b.max + 1)), f.path).toMatch(/不能大於/);
    }
  });

  it("低於下界也會被擋下來", () => {
    cover(TAG);
    for (const f of COMBAT_FEEL_FIELDS) {
      if (f.kind === "boolean") continue;
      const b = fieldBounds(f)!;
      expect(validateFeelField(f.path, String(b.min - 1)), f.path).toBeTruthy();
    }
  });

  it("tick 欄位拒絕小數 —— 半個 tick 的鎖長度是靜默的災難", () => {
    cover(TAG);
    expect(validateFeelField("autoEngage.stallTicks", "30.5")).toBe("必須是整數");
    expect(validateFeelField("facing.followThroughTicks", "2.5")).toBe("必須是整數");
    // 而非整數欄位不受影響
    expect(validateFeelField("knockback.minPct", "0.07")).toBeNull();
  });

  it("空白一律拒絕 —— `Number(\"\")` 是 0，會把「還沒填」變成「我要 0」", () => {
    cover(TAG);
    expect(validateFeelField("autoEngage.seekRadius", "")).toBe("不能空白");
    expect(validateFeelField("autoEngage.seekRadius", "   ")).toBe("不能空白");
  });

  it("布林只收開／關", () => {
    cover(TAG);
    expect(validateFeelField("autoEngage.enabled", "true")).toBeNull();
    expect(validateFeelField("autoEngage.enabled", "false")).toBeNull();
    expect(validateFeelField("autoEngage.enabled", "1")).toBe("只能是開或關");
  });
});

/**
 * 這一組是整份檔案的重點：**後台的界不是一張自己的常數表，而是 sim 真的會夾到
 * 哪裡**。做法是把界的外面一格餵給 sim 自己的 `combatFeelFromDoc`，斷言它回傳
 * 的正好是界本身。
 *
 * 為什麼不是「比對兩個常數」（第⑦種故障：掃屬性代替掃行為）：兩個常數表相等，
 * 不代表 sim 真的有夾；`normalizeAutoEngageRules` 少寫一格的話兩張表照樣相等，
 * 而那一格會原封不動地帶著 4800 進 `queryOverlap`。
 */
describe("後台的界 == 模擬器真的夾到的地方", () => {
  const docWith = (path: string, value: unknown): Record<string, unknown> => {
    const doc = feelDocFrom(shippedValues());
    setAtPath(doc, path, value);
    return doc;
  };

  it("填到上界之外，sim 讀回來正好是上界", () => {
    cover(TAG);
    for (const f of COMBAT_FEEL_FIELDS) {
      if (f.kind === "boolean") continue;
      const b = fieldBounds(f)!;
      const rules = combatFeelFromDoc(docWith(f.path, b.max * 10 + 1000));
      expect(getAtPath(rules, f.path), `${f.path} 的上界和 sim 的夾限對不上`).toBe(b.max);
    }
  });

  it("填到下界之外，sim 讀回來正好是下界", () => {
    cover(TAG);
    for (const f of COMBAT_FEEL_FIELDS) {
      if (f.kind === "boolean") continue;
      const b = fieldBounds(f)!;
      const rules = combatFeelFromDoc(docWith(f.path, b.min - 5000));
      expect(getAtPath(rules, f.path), `${f.path} 的下界和 sim 的夾限對不上`).toBe(b.min);
    }
  });
});

describe("讀值：畫面顯示的是**模擬器讀出來的**，不是文件裡的原始數字", () => {
  it("一份存著 seekRadius 4800 的舊文件，畫面顯示 200（sim 真的在用的那個）", () => {
    cover(TAG);
    const rogue = feelDocFrom(shippedValues());
    setAtPath(rogue, "autoEngage.seekRadius", 4800);
    // 這一行就是頁面 `useEffect` 做的事。改成 `valuesFromRaw(doc)` → 畫面會理直氣壯
    // 地顯示 4800，操作者重整後看得到自己填的數字，而遊戲裡從來不是那樣。
    const shown = valuesFromRules(combatFeelFromDoc(rogue));
    expect(shown["autoEngage.seekRadius"]).toBe("200");
  });

  it("schema 不對的文件 → 顯示出貨預設，不是空表", () => {
    cover(TAG);
    const shown = valuesFromRules(combatFeelFromDoc({ id: "combat-feel", schema: "config@1" }));
    expect(shown).toEqual(shippedValues());
    expect(shown["autoEngage.enabled"]).toBe("true");
  });

  it("出貨預設是從 `DEFAULT_COMBAT_FEEL` 讀出來的，不是打字打進去的", () => {
    cover(TAG);
    const s = shippedValues();
    expect(s["autoEngage.stallTicks"]).toBe(String(DEFAULT_COMBAT_FEEL.autoEngage!.stallTicks));
    expect(s["knockback.minPct"]).toBe(String(DEFAULT_COMBAT_FEEL.knockback.minPct));
    expect(s["standstill.enabled"]).toBe(String(DEFAULT_COMBAT_FEEL.standstill.enabled));
  });
});

describe("存檔的文件", () => {
  it("永遠帶著完整四張子表 —— 只寫被改過的區塊會凍結另外三張", () => {
    cover(TAG);
    const values = { ...shippedValues(), "autoEngage.enabled": "false" };
    const doc = feelDocFrom(values);
    expect(Object.keys(doc).sort()).toEqual(
      ["autoEngage", "facing", "id", "knockback", "schema", "standstill"].sort(),
    );
    expect(doc.id).toBe(COMBAT_FEEL_DOC_ID);
    expect(doc.schema).toBe(COMBAT_FEEL_SCHEMA);
  });

  it("通得過出貨寫入路徑上的那個 Zod 閘（#283 的 validateOverlayDoc）", () => {
    cover(TAG);
    const doc = feelDocFrom(shippedValues());
    expect(validateOverlayDoc("config", COMBAT_FEEL_DOC_ID, doc)).toEqual({ ok: true, validated: true });
  });

  it("每一格都被寫出去了 —— 沒有欄位在組文件時掉隊", () => {
    cover(TAG);
    const doc = feelDocFrom(shippedValues());
    for (const f of COMBAT_FEEL_FIELDS) {
      expect(getAtPath(doc, f.path), `${f.path} 沒有進到文件裡`).not.toBeUndefined();
    }
  });

  it("整張表合法時 `validateFeelValues` 是空的", () => {
    cover(TAG);
    expect(validateFeelValues(shippedValues())).toEqual({});
  });
});

describe("說明文字", () => {
  it("每一格的說明都不是複述欄位名，而且夠長到能講清楚影響", () => {
    cover(TAG);
    for (const [path, label] of Object.entries(COMBAT_FEEL_LABELS)) {
      expect(label.zh.length, `${path} 沒有中文名`).toBeGreaterThan(1);
      expect(label.note.length, `${path} 的說明太短，八成只是複述欄位名`).toBeGreaterThan(30);
    }
  });

  it("每一個布林（決策點）都說得出出貨值是哪一邊、以及為什麼", () => {
    cover(TAG);
    for (const f of COMBAT_FEEL_FIELDS) {
      if (f.kind !== "boolean") continue;
      const d = COMBAT_FEEL_LABELS[f.path]?.decision;
      expect(d, `${f.path} 是決策點但沒有寫「為什麼預設是這一邊」`).toBeTruthy();
      expect(d!.onLabel.length).toBeGreaterThan(1);
      expect(d!.offLabel.length).toBeGreaterThan(1);
      expect(d!.why.length, `${f.path} 的理由太短`).toBeGreaterThan(20);
    }
  });
});
