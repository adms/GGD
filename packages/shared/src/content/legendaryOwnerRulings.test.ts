/**
 * owner 2026-08-01 的三支數值裁決,釘在**出貨的文件**上。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 裁決原文(逐字)
 *
 *   朗基努斯之槍 i018 … => 取消攻速加成
 *   炎神弩       i06i … => 冷卻1 秒
 *   熾天使之弓   i012 … => 3% 就可以了,冷卻1秒
 *
 * 這三條全部是**內容改動**:sim 一行都沒動。攻速加成是 `modifiers` 的一列,
 * 內部冷卻是 `HookDef.internalCooldown`(節奏閘早就在 sim/effects/hooks.ts,
 * 用的是絕對 tick 比較 `world.tick - hookLastFired < icdTicks`)。所以這個檔
 * 讀的是 `content/items/*.json` 的位元組,不是任何手寫的 fixture ——
 * CLAUDE.md 失敗形態 ⑤(「被測的不是出貨的那個」)。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼要有自己的一個檔,而不是塞進既有的守衛
 *
 * 既有的兩條各自只看見一半:
 *   · `legendary49OwnerText.test.ts` 只比對 **description 的位元組**,不看資料。
 *     把 i012 的 `pctCurrentMana` 改回 0.05 而文案留在 3%,它照樣綠。
 *   · `sim/economy/legendaryClaims.test.ts` 比對**未加標籤的數值行** ⇔ modifiers。
 *     它抓得到 i018(「攻擊速度+55%」是 `LABEL_RULES` 的 攻擊速度 規則),但抓
 *     不到 i012 —— 那個 3% 寫在一行 `[On-Hit]` **機制行**裡,而那整族是它
 *     刻意不讀的(見該檔 header 的 SCOPE 段)。內部冷卻兩件都抓不到,因為 ICD
 *     不是文案上的任何一個字。
 *
 * 所以這個檔補的是那兩塊空白:**數值裁決本身**,加上 §D 那條「機制行裡的
 * 百分比也要被兌現」的通用守衛。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zItemDoc, type ItemDoc } from "./schema/item";
import { HOOK_INTERNAL_COOLDOWN_MAX_SEC } from "./schema/effect";
import { zHookDef } from "./schema/effect";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");

/** 出貨的位元組,而且真的通得過 authoring schema(含新的 ICD 上界)。 */
function doc(id: string): ItemDoc {
  const raw = JSON.parse(
    readFileSync(join(CONTENT_DIR, "items", `${id}.json`), "utf-8"),
  ) as unknown;
  return zItemDoc.parse(raw);
}

const LONGINUS = "godie-i018"; // 朗基努斯之槍
const SERAPH = "godie-i012"; // 熾天使之弓
const FLAME_BOW = "godie-i06i"; // 炎神弩

/** owner 兩處都說「1 秒」,所以這是一個數字,不是三個。 */
const RULED_ICD_SEC = 1;

// ═══════════════════════════════════════════════════════════════════════════
// §A 朗基努斯之槍 —— 「取消攻速加成」
// ═══════════════════════════════════════════════════════════════════════════
describe("§A 朗基努斯之槍 godie-i018 —— owner「取消攻速加成」", () => {
  it("一條 attackSpeed modifier 都不剩(而且整份文件沒有 modifiers)", () => {
    const d = doc(LONGINUS);
    const mods = d.modifiers ?? [];
    expect(
      mods.filter((m) => m.stat === "as"),
      "攻速加成又回來了 —— owner 2026-08-01 明說「取消攻速加成」",
    ).toEqual([]);
    // 它本來**只有**那一條,所以「取消」之後這份文件的 modifiers 是空的。
    // 寫成整體斷言而不是只看 as,是為了讓「順手塞一條別的 stat 進去」也紅:
    // 三選一卡片上的每一個數字都必須有文案在承諾它。
    expect(mods, "i018 現在不該帶任何 modifier").toEqual([]);
  });

  it("文案裡也沒有「攻擊速度+N%」那一行了 —— 資料與文字一起走", () => {
    // 只刪資料留文案 = 卡片承諾一個玩家拿不到的數字(這一批存在的理由)。
    // 只刪文案留資料 = 玩家拿到一個卡片沒講的數字(legendaryClaims 的另一向)。
    const desc = doc(LONGINUS).description ?? "";
    expect(desc, "文案還留著攻速那一行").not.toMatch(/攻擊速度/);
    // 這一支被砍掉的只有攻速:三圍與 [On-Hit] 那一行必須原封不動。
    expect(desc).toContain("力量+12");
    expect(desc).toContain("敏捷+12");
    expect(desc).toContain("(總敏捷)% 機率性造成等同 (總力量) 之閃電傷害");
  });

  it("觸發率**沒有**被順手一起削 —— owner 只動了攻速", () => {
    // 這條守的是我自己:量到「後期接近必定觸發」很容易讓人「順便」把
    // chanceFrom 也調弱,而 owner 沒有裁決那一項。
    const hook = doc(LONGINUS).passive?.[0];
    expect(hook?.chanceFrom).toEqual({
      attr: "agi",
      basis: "total",
      coeff: 0.01,
      min: 0,
      max: 1,
    });
    expect(hook?.internalCooldown, "i018 沒有被裁決要冷卻").toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §B/§C 兩支的內部冷卻 —— 「冷卻1 秒」
// ═══════════════════════════════════════════════════════════════════════════
describe("§B/§C 內部冷卻 —— owner「冷卻1 秒」", () => {
  for (const [id, name] of [
    [FLAME_BOW, "炎神弩"],
    [SERAPH, "熾天使之弓"],
  ] as const) {
    it(`${name} ${id} 的 onBasicAttack hook 帶著 internalCooldown ${RULED_ICD_SEC}`, () => {
      const hooks = doc(id).passive ?? [];
      expect(hooks.length, `${name} 的 passive 不見了`).toBeGreaterThan(0);
      for (const h of hooks) {
        expect(h.on, `${name} 的 hook 掛錯事件了`).toBe("onBasicAttack");
        expect(
          h.internalCooldown,
          `${name} 的內部冷卻不見了 —— owner 2026-08-01 裁定「冷卻1秒」,` +
            "沒有它這一發回到「每一次普攻都打」",
        ).toBeCloseTo(RULED_ICD_SEC, 6);
      }
    });
  }

  it("熾天使之弓 的削魔是 3%,而且文案上的那個 3% 是同一個 3%", () => {
    const d = doc(SERAPH);
    const burn = (d.passive?.[0]?.effects ?? []).find((e) => e.kind === "spendMana");
    expect(burn, "spendMana 效果不見了").toBeDefined();
    expect(
      (burn as { pctCurrentMana?: number }).pctCurrentMana,
      "owner 2026-08-01 裁定 5% → 3%",
    ).toBeCloseTo(0.03, 6);
    expect(
      (burn as { applyTo?: string }).applyTo,
      "削的是**敵方**的魔;applyTo 掉了會變成削自己",
    ).toBe("target");
    expect(d.description ?? "").toContain("削去敵方英雄現存 MP 3%");

    // ⚠️ 同一句話裡有**兩個 3%**,而它們是不同的東西。這一條把另一個釘住,
    // 免得下一次有人「統一」它們:燒傷是每秒最大生命 3%,owner 沒有動它。
    const dot = (d.passive?.[0]?.effects ?? []).find((e) => e.kind === "dot");
    expect((dot as { resourcePct?: { perRank: number[] } }).resourcePct?.perRank).toEqual([0.03]);
    expect(d.description ?? "").toContain("每秒燃燒3%最大生命");
  });

  it("炎神弩 的 10 / 1000 / (0~10) 沒有被冷卻順手改掉", () => {
    // owner 給的是冷卻,不是傷害。這一條讓「加冷卻的同時偷偷調 far」變成紅的。
    const e = (doc(FLAME_BOW).passive?.[0]?.effects ?? [])[0];
    expect((e as { distanceScale?: unknown }).distanceScale).toEqual({
      atRange: 10,
      near: 10,
      far: 1000,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §BOUNDS internalCooldown 的兩端
// ═══════════════════════════════════════════════════════════════════════════
describe("§BOUNDS HookDef.internalCooldown 兩端都有界", () => {
  const hook = (icd: unknown): unknown => ({
    on: "onBasicAttack",
    ...(icd === undefined ? {} : { internalCooldown: icd }),
    effects: [{ kind: "damage", damageType: "magic", amount: { flat: 10 } }],
  });

  it("留空 / 0 合法 —— 「沒有冷卻」是一個真的設計,不是缺值", () => {
    expect(zHookDef.safeParse(hook(undefined)).success).toBe(true);
    expect(zHookDef.safeParse(hook(0)).success).toBe(true);
    expect(zHookDef.safeParse(hook(RULED_ICD_SEC)).success).toBe(true);
  });

  it("負數載不進來", () => {
    expect(zHookDef.safeParse(hook(-1)).success).toBe(false);
  });

  it(`上界 ${HOOK_INTERNAL_COOLDOWN_MAX_SEC} 秒 —— 把「1 秒」打成「1000(毫秒)」要載不進來`, () => {
    // 這正是 owner 這兩條裁決最可能被打錯的方式:欄位的單位是**秒**,而
    // 「冷卻 1 秒」在很多引擎裡寫成 1000。沒有上界時 1000 會安靜地通過,
    // 把一個每秒一次的 proc 變成一場一次,而卡片照樣寫著那個效果。
    expect(zHookDef.safeParse(hook(HOOK_INTERNAL_COOLDOWN_MAX_SEC)).success).toBe(true);
    expect(zHookDef.safeParse(hook(HOOK_INTERNAL_COOLDOWN_MAX_SEC + 1)).success).toBe(false);
    expect(zHookDef.safeParse(hook(1000)).success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §D 機制行裡的百分比也要被兌現 —— 這一節補的是既有守衛的空白
// ═══════════════════════════════════════════════════════════════════════════
/**
 * `legendaryClaims.test.ts` 讀的是**未加標籤**的數值行(「攻擊速度+55%」那一族),
 * 「[標籤] …」的機制行整族被它排除在外。於是 i012 的「削去…MP 5%」被改成資料
 * 0.03 而文案留 5% 這種漂移,在這個檔出現之前**沒有任何測試看得到**。
 *
 * 這一節只做一件事,而且刻意只做這一件:把每一支傳說的**機制行**裡出現的
 * 「魔力/MP 的百分比」讀出來,跟資料上真的付得出那個百分比的欄位對照,兩個方向
 * 都要相等(集合相等)。
 *
 * ── 它讀得到什麼 ────────────────────────────────────────────────────────────
 *   文案側:含 `[標籤]` 的行裡的 「MP N%」/「魔力 N%」/「N%MP」/「N%魔力」
 *   資料側:passive/auras 的 hook 效果裡
 *            · `spendMana.pctCurrentMana` / `spendMana.pctMaxMana`
 *            · `restore.manaPct`
 *            · `damage.resourcePct` 且 `resource === "mana"` 的 perRank
 *            · `amount.ratios` 裡 `stat === "maxMana"` 的 coeff
 *
 * ── 它讀不到什麼(誠實地列出來,免得這條守衛被當成比它更強) ────────────────
 *   · 比的是**集合**不是逐句配對。一行講了兩個 10%、資料只付一個 10%,
 *     它是綠的。(死之王的長槍 godie-i01d 現在正是這個形狀:「敵方現存 MP 10%
 *     傷害」那一半根本沒有實作,只有「回復敵方最大 MP 10%」在。那是一個
 *     **缺效果**的問題,不是數字對不上,歸 tools/legendary-status/status.py 管。)
 *   · 它比**數字**,不比 basis。光魔杖 godie-i027 的文案寫「自己現存 MP 5%」而
 *     資料是 `pctMaxMana 0.05` —— 數字對得上、讀法對不上,所以這條守衛是綠的
 *     而那個分歧是真的。列在這裡,不是被忽略,是被記錄。
 */
/**
 * ⚠️ 2026-08-18（#356）：這裡本來只讀 `legendary-weapons.json`。EX 兩階上線之後
 * 那張池從 49 縮到 29，帶魔力百分比的樣本掉到 3 支，於是下面的空轉哨兵（寫死的
 * `>= 4`）用「這條守衛在空轉」的訊息紅了 —— 而真相是樣本搬到隔壁池去了。
 * ⇒ 掃 `content/loot-tables/` 底下**每一張**池的聯集。⛔ 不抄檔名。
 */
function unionPoolIds(): string[] {
  const out: string[] = [];
  for (const f of readdirSync(join(CONTENT_DIR, "loot-tables"))) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const doc = JSON.parse(readFileSync(join(CONTENT_DIR, "loot-tables", f), "utf-8")) as {
      entries?: { itemId: string }[];
    };
    for (const e of doc.entries ?? []) out.push(e.itemId);
  }
  return [...new Set(out)].sort();
}

/**
 * 一行機制行裡的每一個「魔力百分比」,以 0..1 表示。
 *
 * ⚠️ 2026-08-18（#356）：`%` 與「魔力」之間**允許一個限定詞**（最大／現存／目前）。
 * 母體從單一 `legendary-weapons` 擴到三張池的聯集之後，這個缺口才浮出來 ——
 * 「立即回復 50% **最大**魔力」（流星之戒）與「回復 25% **最大**魔力」（噬魂者）
 * 都被舊的正則讀成「文案沒有講魔力」，於是資料側那一半被回報成
 * 「卡片上看不到的強度」。⛔ 那是**掃描器瞎了**，不是內容有缺陷 ——
 * 而它報出來的訊息與真的缺陷長得一模一樣（第三守則：註解／訊息會說謊）。
 */
function manaPctInProse(description: string): Set<number> {
  const out = new Set<number>();
  const QUALIFIER = "(?:最大|現存|目前)?";
  for (const raw of description.split("\n")) {
    const line = raw.replace(/％/g, "%").replace(/\s+/g, "");
    if (!/\[[^\]]+\]/.test(line)) continue; // 機制行才算 —— 數值行是 legendaryClaims 的地盤
    for (const m of line.matchAll(new RegExp(`(?:MP|魔力)(\\d+(?:\\.\\d+)?)%`, "g"))) {
      out.add(Number(m[1]) / 100);
    }
    for (const m of line.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)%${QUALIFIER}(?:MP|魔力)`, "g"))) {
      out.add(Number(m[1]) / 100);
    }
  }
  return out;
}

/** 這份文件的資料**真的付得出來**的每一個魔力百分比。 */
function manaPctInData(node: unknown, out: Set<number> = new Set()): Set<number> {
  if (Array.isArray(node)) {
    for (const v of node) manaPctInData(v, out);
    return out;
  }
  if (node === null || typeof node !== "object") return out;
  const o = node as Record<string, unknown>;
  if (o["kind"] === "spendMana") {
    for (const k of ["pctCurrentMana", "pctMaxMana"]) {
      if (typeof o[k] === "number" && (o[k] as number) > 0) out.add(o[k] as number);
    }
  }
  // ⚠️ 2026-08-18（#356）：`revive` 也付魔力（再誕之淚珠「以 100%生命、100%魔力復活」）。
  // 它在 2026-08-18 才第一次被內容採用，而這支讀取器只認得 `restore` ——
  // 於是文案講的 100% 被回報成「資料付不出來」。⛔ 掃描器的盲點，不是內容缺陷。
  if (
    (o["kind"] === "restore" || o["kind"] === "revive") &&
    typeof o["manaPct"] === "number" &&
    (o["manaPct"] as number) > 0
  ) {
    out.add(o["manaPct"] as number);
  }
  const rp = o["resourcePct"] as { resource?: string; perRank?: number[] } | undefined;
  if (rp?.resource === "mana") for (const v of rp.perRank ?? []) if (v > 0) out.add(v);
  const ratios = o["ratios"] as { stat?: string; coeff?: number }[] | undefined;
  if (Array.isArray(ratios)) {
    for (const r of ratios) {
      if (r.stat === "maxMana" && typeof r.coeff === "number" && r.coeff > 0) out.add(r.coeff);
    }
  }
  for (const v of Object.values(o)) manaPctInData(v, out);
  return out;
}

describe("§D 機制行承諾的魔力百分比,資料真的付得出來", () => {
  const poolIds = unionPoolIds();

  it("每一支的「文案的魔力 %」與「資料的魔力 %」是同一個集合", () => {
    const broken: string[] = [];
    let exercised = 0;
    for (const id of poolIds) {
      const d = doc(id);
      const prose = manaPctInProse(d.description ?? "");
      // 資料側只掃 hook 承載的部分(passive / auras),不掃 modifiers ——
      // modifiers 是數值行的地盤,已經由 legendaryClaims 逐條比對過。
      const data = manaPctInData([d.passive, d.auras]);
      if (prose.size === 0 && data.size === 0) continue;
      exercised++;
      const fmt = (s: Set<number>): string => [...s].sort((a, b) => a - b).join(", ");
      const missing = [...prose].filter((p) => ![...data].some((q) => Math.abs(p - q) < 1e-9));
      const unannounced = [...data].filter((q) => ![...prose].some((p) => Math.abs(p - q) < 1e-9));
      if (missing.length > 0) {
        broken.push(
          `${d.name} (${id}) 的文案講了魔力 ${missing.map((v) => `${v * 100}%`).join("/")},` +
            `資料付得出來的是 [${fmt(data)}] —— 玩家抽到會拿不到那個數字`,
        );
      }
      if (unannounced.length > 0) {
        broken.push(
          `${d.name} (${id}) 的資料付 ${unannounced.map((v) => `${v * 100}%`).join("/")} 的魔力,` +
            `文案的機制行寫的是 [${fmt(prose)}] —— 卡片上看不到的強度`,
        );
      }
    }
    expect(broken, "傳說的機制行講了一個數字,資料沒有付").toEqual([]);
    // 一個什麼都沒掃到的掃描器是綠的,而且會一直綠下去(失敗形態 ③)。
    //
    // ⚠️ 2026-08-18：這裡本來寫死 `>= 4`,而那是一個**出貨策展的計數**住在測試裡
    //    (第二守則的「第四個住處」)。EX 兩階把 49 支拆成三張池之後,單張池裡帶
    //    魔力百分比的樣本剩 3 支 —— 於是它用「這條守衛在空轉」這句**假話**紅了,
    //    真相只是樣本搬去隔壁池。⛔ 改成 `>= 3` 只是把同一個錯誤再犯一次。
    // ⭐ 真正防空轉的是下面那條「活體樣本」:它把同一組讀取器對著一份改壞的文件
    //    跑,證明它們**真的會紅**。所以這裡只需要問「迴圈有沒有跑到東西」。
    expect(poolIds.length, "一張獎池都讀不到 —— 這條守衛在空轉").toBeGreaterThan(0);
    expect(exercised, "整個獎池聯集裡沒有任何一支帶魔力百分比 —— 這條守衛在空轉").toBeGreaterThan(
      0,
    );
  });

  it("熾天使之弓 是這條守衛的活體樣本:把資料改回 5% 會被抓到", () => {
    // 不是模擬,是把同一組讀取器對著「壞掉的那一份」跑一次 —— 這樣「§D 真的
    // 會紅」不必靠人相信,也不會隨著 i012 被再次改動而失效。
    const d = doc(SERAPH);
    const prose = manaPctInProse(d.description ?? "");
    expect(prose).toEqual(new Set([0.03]));
    const mutated = JSON.parse(JSON.stringify([d.passive, d.auras])) as unknown[];
    const spend = (mutated[0] as { effects: Record<string, unknown>[] }[])[0]!.effects.find(
      (e) => e["kind"] === "spendMana",
    )!;
    spend["pctCurrentMana"] = 0.05;
    const mutatedData = manaPctInData(mutated);
    // 讀取器看到的是 5%(燒傷那 3% 是 health 不是 mana,所以不在這個集合裡 ——
    // 這一點本身也被釘住了:如果哪天 dot 的 resource 被改成 mana,這裡會紅)。
    expect(mutatedData, "讀取器沒有看到被改壞的那個 5%").toEqual(new Set([0.05]));
    // …而那正好就是上面那條測試判定「文案講 3%、資料付 5%」為紅的條件。
    expect(mutatedData, "改壞了資料卻還跟文案的 3% 相符 —— §D 不會紅").not.toEqual(prose);
  });
});
