/**
 * ⭐⭐【驗收 · 批6 **變身與鏡像**】—— GH#964 的**一套治具**（⛔ 不是 3 條測試）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * owner 2026-09-02（逐字，經 #964 / #953 轉述）
 * ─────────────────────────────────────────────────────────────────────────────
 * > 「**玩家要能做的出來**，並且**自動化機制檢查合理性及推薦組合**」
 * > 「⇒ 建議一條新守衛涵蓋全部 26 對變身英雄。**=> ok**」（#944，共同規則 C 的由來）
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 前提回驗（2026-09-03 量到，⛔ 不是抄票文）
 * ─────────────────────────────────────────────────────────────────────────────
 * 票文說「**26 對**」。⭐ 而 `CHAMPION_FORM_PAIRS` **宣告** 26 對是對的，
 * ⛔ **今天驗得到的只有 20 對** —— 另外 6 對整組躺在 `content/_legacy/`
 * （owner 2026-08-13 的下架），引擎看不到、玩家碰不到。
 * ⇒ ⭐ 這一支跑 `splitFormPairsByShipping().shipped`，⛔ 不寫死 26 也不寫死 20：
 *    一位英雄重新上架，這條守衛自己就長回去。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐⭐ 為什麼要**兩頭都走**（CLAUDE.md 失敗形態⑫）
 * ─────────────────────────────────────────────────────────────────────────────
 * 一條只從**本體**那一頭走的掃描，迴圈是 `for (const code of base.keys())` ——
 * ⭐ **變身態獨有的技能編號永遠不會進迴圈** ⇒ 它對那一族**結構上失明**，
 * 而且它會一直是綠的。⇒ 這裡兩個方向各有一條**自己的**斷言：
 *   · `alternate-only` ⇒ **硬零**（⛔ 只有反方向走得到它）
 *   · `base-only`      ⇒ 棘輪（正方向）
 * 並且量尺**兩個方向都校準**（已知有的量得到 ＋ 已知沒有的量不到）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 界線
 * ─────────────────────────────────────────────────────────────────────────────
 * · ⛔ **不讀** `abilityCodeParityForms.baseline.json` —— 那是另一條閘的柵欄，
 *   這一支的每一個數字都是**自己當場量的**（⛔ 沒有第二個住處要維護）。
 * · ⛔ **不裁決**哪一邊是對的（第〇·六守則）；它只說「這兩份不同步了」。
 * · 「卡面說增幅而傷害節點逐位元組相同」由 `formAmplifyClaims.test.ts`（#944）
 *   管，⛔ 這裡不重寫第二份。
 * · 本批的 3 個 id **⛔ 沒有抄進這個檔**（第〇·四守則）——
 *   下面四條規則都是**全庫掃描**，那 3 份是被**推導**進分母的：
 *   `godie-e001.r` / `godie-h01n.r` 有 `championForm`、`godie-emfr.e` 有兩條傷害觸發器。
 *
 * ── 突變紀錄（實跑，`scripts/edit-or-die.py` 改壞 → 🔴 → 還原）────────────────
 * M1 `godie-h01n.r` 的 `applyBuff.duration` 8.0 → 6.0
 *    ⇒ 🔴 ⑤「變身期間的增減益」3 → 4，訊息逐字指名 `godie-h01n.r buff=6 form=8`。
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { splitFormPairsByShipping } from "../../testkit/formPairShipping";
import { scanFormPairAbilities } from "../content/abilityCodeParityForms";
import { originInScope } from "../sim/combat/damageTypeOverride";

const ROOT = join(__dirname, "../../../..");
const ABILITY_DIR = join(ROOT, "content/abilities");

type Doc = Record<string, unknown>;

/** 直接讀出貨檔，⛔ 不經 ContentLoader —— 這條要在 `content:build` 之前也能跑。 */
function shippedAbilities(): { all: Doc[]; byChampion: Map<string, Doc[]> } {
  const all: Doc[] = [];
  const byChampion = new Map<string, Doc[]>();
  for (const f of readdirSync(ABILITY_DIR).sort()) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(ABILITY_DIR, f), "utf8")) as Doc;
    all.push(doc);
    const champ = f.slice(0, f.indexOf("."));
    const bucket = byChampion.get(champ);
    if (bucket) bucket.push(doc);
    else byChampion.set(champ, [doc]);
  }
  return { all, byChampion };
}

/** 樹裡每一個符合 `pred` 的節點（effects 是任意深的巢狀）。 */
function nodes(root: unknown, pred: (o: Record<string, unknown>) => boolean): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (pred(o)) out.push(o);
    for (const x of Object.values(o)) walk(x);
  };
  walk(root);
  return out;
}

const kindIs = (k: string) => (o: Record<string, unknown>) => o["kind"] === k;

/** 秒數攤平成**逐等級**（純量 → 重複；短陣列 → 末項延伸）。⛔ 不比字面值。 */
function perRank(v: unknown, ranks: number): number[] | null {
  if (v === undefined || v === null) return null;
  const at = (i: number): number =>
    Number(Array.isArray(v) ? (v[Math.min(i, v.length - 1)] as number) : (v as number));
  const out: number[] = [];
  for (let i = 0; i < ranks; i++) {
    const n = at(i);
    if (!Number.isFinite(n)) return null;
    out.push(Number(n.toFixed(6)));
  }
  return out;
}

/** 傷害類 effect kind —— 「這條觸發器會不會打人」。 */
const DAMAGE_KINDS = new Set(["damage", "damageArea", "damageLine", "damageCone", "dot"]);

describe("驗收批6 · 變身與鏡像（GH#964）", () => {
  const { all, byChampion } = shippedAbilities();
  const { shipped, archived, halfMigrated } = splitFormPairsByShipping();
  const states = scanFormPairAbilities(shipped, byChampion);
  const baseOnly = states.filter((s) => s.alternate === null);
  const altOnly = states.filter((s) => s.base === null);
  const drifting = states.filter(
    (s) => s.base !== null && s.alternate !== null && s.driftFields.length > 0,
  );

  it("★★ ⭐ 量尺先自證 —— **兩個方向**都校準過（⛔ 單邊校準的尺會在最需要說話時沉默）", () => {
    expect(all.length, "⛔ 一份出貨技能都沒讀到 ⇒ 底下每一條都在量空氣").toBeGreaterThan(300);
    expect(shipped.length, "⛔ 一組出貨對子都沒有 ⇒ 鏡像那一半是空的").toBeGreaterThan(0);
    expect(
      halfMigrated,
      "⛔⛔ 一組對子只搬了一半 ⇒ 玩家一按變身，`Registry.get()` 在每 tick 的 snapshot 裡擲例外",
    ).toEqual([]);
    // ⭐ 前提回驗留在斷言裡：宣告 26、出貨 20、下架 6 —— ⛔ 三個數字要對得起來。
    expect(shipped.length + archived.length, "⛔ 出貨＋下架 ≠ 宣告的對子數").toBe(26);

    // ⭐ 校準①【已知**有**的量得到】—— 而且是**反方向**那一種：變身態獨有的編號。
    const probe = [{ heroNumber: "99", baseId: "zz-base", alternateId: "zz-alt" }];
    const fake = new Map<string, Doc[]>([
      ["zz-base", [{ name: "99-01 相同", cooldown: [1] }]],
      [
        "zz-alt",
        [
          { name: "99-01 相同", cooldown: [1] },
          { name: "99-02 只有變身態有", cooldown: [1] },
        ],
      ],
    ]);
    const probed = scanFormPairAbilities(probe, fake);
    expect(
      probed.filter((s) => s.base === null).map((s) => s.code),
      "⛔⛔ 量尺看不到**變身態獨有**的編號 ⇒ 下面那條硬零是假的綠燈（失敗形態⑫）",
    ).toEqual(["99-02"]);
    // ⭐ 校準②【已知**沒有**的量不到】—— 兩邊逐位元組相同時，⛔ 不可以報出漂移。
    expect(
      probed.find((s) => s.code === "99-01")?.driftFields,
      "⛔ 兩份一模一樣卻報出漂移 ⇒ 這把尺會用噪音淹掉真的訊號",
    ).toEqual([]);
  });

  it("★★ ⭐⭐ **反方向**：變身態獨有的技能編號 ⇒ **0**（⛔ 一頭走的掃描永遠看不到它）", () => {
    expect(
      altOnly.map((s) => `${s.hero} ${s.code}（${s.alternateId} 有、${s.baseId} 沒有）`),
      "⛔⛔ 變身態長出了本體沒有的編號 ——\n" +
        "  ⭐ 那代表**只改了變身態那一份**，而本體是玩家真正選到的那一隻 ⇒\n" +
        "  卡面（本體）與變身後拿到的東西從此不是同一件事。\n" +
        "  ⚠️ ⭐ 這一列**只有從變身態那一頭走**才數得到 —— 從本體走的迴圈對它結構上失明。",
    ).toEqual([]);
  });

  it("★★ ⭐ **正方向**：本體獨有的技能編號（棘輪 ≤ 1）", () => {
    const named = baseOnly.map((s) => `${s.hero} ${s.code}（${s.baseId} 有、${s.alternateId} 沒有）`);
    expect(
      named.length,
      `⭐ 本體有而變身態缺的編號：${named.join(" · ")}\n` +
        "  ⚠️ 變多 ⇒ 有人只在本體加了一支技能，玩家變身之後那一格是空的。\n" +
        "  ⭐ 變少 ⇒ 把上限調下來。（已知的 1 筆：70-002，紮根是 toggle 型變身）",
    ).toBeLessThanOrEqual(1);
  });

  it("★★ ⭐⭐ 鏡像**逐欄**比較的棘輪 —— 兩份文件在**機制欄位**上分歧多少（#953 規則 C）", () => {
    const worst = [...drifting]
      .sort((a, b) => b.driftFields.length - a.driftFields.length)
      .slice(0, 6)
      .map((s) => `${s.hero} ${s.code} → ${s.driftFields.join(",")}`);
    const fieldPairs = drifting.reduce((n, s) => n + s.driftFields.length, 0);
    const why =
      `\n⭐ 出貨對子 ${shipped.length} 組 / 技能編號 ${states.length} 個；` +
      `分歧的編號 ${drifting.length} 個、(編號,欄位) ${fieldPairs} 筆。\n` +
      `  最嚴重的幾筆：\n    ${worst.join("\n    ")}\n` +
      "  ⚠️ **為什麼這一格重要**：一位有變身的英雄在內容樹裡是**兩份完整的技能檔**。\n" +
      "  ⭐ 改了本體、忘了變身態 ⇒ **玩家變身之後用的是舊的那一份，而全套測試會全綠**。\n" +
      "  ⚠️ 變多 ⇒ 有人單邊改了東西；⭐ 變少 ⇒ 有人把一對對齊了，把上限調下來。\n" +
      "  ⛔ 這條**不裁決**哪一邊是對的（第〇·六守則）—— 它只說這兩份不同步了。";
    expect(drifting.length, `⛔ 分歧的技能編號變多了${why}`).toBeLessThanOrEqual(56);
    expect(fieldPairs, `⛔ 分歧的欄位筆數變多了${why}`).toBeLessThanOrEqual(217);
  });

  it("★★ ⭐⭐ 變身期間的增減益要**與變身同時結束**（⛔ 不留永久屬性）", () => {
    // ⭐ `godie-e001.r`（22-04）與 `godie-h01n.r`（79-04）就是靠這一條被驗到的：
    //   卡面說「持續 7 秒 / 8 秒」而 buff 與 `championForm` 各有一個秒數欄位 ——
    //   ⛔ 兩格不一樣時，短的那一邊先結束而卡面照樣寫著長的那個數字。
    const bad: string[] = [];
    for (const doc of all) {
      const ranks = Math.max(1, Number(doc["maxRank"] ?? 1));
      const forms = nodes(doc["effects"], kindIs("championForm"))
        .map((f) => perRank(f["durationSec"], ranks))
        .filter((f): f is number[] => f !== null);
      // ⛔ 沒有秒數 = toggle 型變身（20-01 風王結界 / 70-00 紮根）—— 它不在這條的分母裡。
      const form = forms[0];
      if (form === undefined) continue;
      for (const buff of nodes(doc["effects"], kindIs("applyBuff"))) {
        const ranksOf = (o: Record<string, unknown>): number[] | null =>
          perRank(o["duration"] ?? buff["duration"], ranks);
        const pr = buff["perRank"];
        const got = Array.isArray(pr) && pr.length > 0
          ? (() => {
              const out: number[] = [];
              for (let i = 0; i < ranks; i++) {
                const v = ranksOf(pr[Math.min(i, pr.length - 1)] as Record<string, unknown>);
                const n = v?.[i];
                if (n === undefined) return null;
                out.push(n);
              }
              return out;
            })()
          : perRank(buff["duration"], ranks);
        if (got === null) continue;
        if (got.join() !== form.join())
          bad.push(`${String(doc["id"])} buff=${got.join("/")} form=${form.join("/")}`);
      }
    }
    expect(
      bad.length,
      `⭐ 變身秒數與增減益秒數對不起來的：${bad.join(" · ")}\n` +
        "  ⚠️ **buff 比外觀長** ⇒ 變回本體之後屬性還掛著（owner 逐字：⛔ 不留永久屬性）；\n" +
        "  ⚠️ **buff 比外觀短** ⇒ 變身還在而加成已經沒了，卡面那句「持續 N 秒」在中途變成謊話。\n" +
        "  ⭐ 已知的 3 筆（`godie-hgam.ex` 6/18 · `godie-hjai.ex` 6/20 · `godie-n003.ex` 6/7）——\n" +
        "  ⛔ 它們**可能是刻意的**（增幅窗刻意短於外觀），所以這是棘輪⛔不是硬零：\n" +
        "  ⭐ 變多 ⇒ 有人新開了一個對不起來的秒數；變少 ⇒ 把上限調下來。",
    ).toBeLessThanOrEqual(3);
  });

  it("★★ ⭐ 變身期間改**冷卻規則**的：今天沒有任何一條規則可以在變身結束時「恢復」", () => {
    const both = all.filter(
      (d) =>
        nodes(d["effects"], kindIs("championForm")).length > 0 &&
        nodes(d["effects"], kindIs("modifyCooldown")).length > 0,
    );
    expect(
      both.map((d) => String(d["id"])),
      "⭐ 這幾支同時有 `championForm` 與 `modifyCooldown`：\n" +
        "  ⚠️ ⭐ `modifyCooldown` 是**一次性**的（`sim/effects/modifyCooldown.ts`：\n" +
        "     `basis` 預設 `remaining`，把 `cooldownRemainingTicks` 往前搬一次就結束）——\n" +
        "     ⛔ 它**不是**一條「這 N 秒內冷卻減半」的規則，所以也**沒有東西可以恢復**。\n" +
        "  ⇒ ⭐ 兩個實際後果：① 施放當下那一格若**不在冷卻中**，這一發一格都不會動；\n" +
        "     ② 變身結束後也不會有任何規則被收回（⛔ 卡面的「持續 N 秒」對它不成立）。\n" +
        "  ⚠️ ⭐ 這是 **Main 的 primitive 缺口**（缺「限時的逐槽位冷卻規則」），\n" +
        "     ⛔ 不是這幾份 JSON 寫錯 —— 補積木前這一格只能登記，⛔ 不能靜默通過。",
    ).toHaveLength(1);
  });

  it("★★ ⭐⭐ 事件來源**不可互相誤觸** ⇒ 硬零（⛔ 一條沒有來源過濾的 onDamageDealt 會打自己）", () => {
    const offenders: string[] = [];
    for (const doc of all) {
      const hooks = nodes(doc["effects"], (o) => "on" in o && Array.isArray(o["effects"]));
      const damaging = hooks.filter(
        (h) => nodes(h["effects"], (o) => DAMAGE_KINDS.has(String(o["kind"]))).length > 0,
      );
      if (damaging.length < 2) continue; // 只有一條會打人的觸發器 ⇒ 沒有「互相」可言
      for (const h of damaging) {
        const src = h["damageSource"];
        if (h["on"] === "onDamageDealt" && (src === undefined || src === "any"))
          offenders.push(`${String(doc["id"])} 的 on:onDamageDealt（damageSource=${String(src)}）`);
      }
    }
    expect(
      offenders,
      "⛔⛔ 一份文件同時掛了兩條會打人的觸發器，而 `onDamageDealt` 那條**沒有限定來源** ⇒\n" +
        "  ⭐ 它自己排出去的那一發傷害會再把它自己叫起來（15-03 獄炎煉我就是這個形狀：\n" +
        "  普攻附火傷 ＋ 技能命中引爆爆炎 —— 兩條**必須**分得開）。\n" +
        "  ⭐ 正解是在 `onDamageDealt` 上寫 `damageSource:\"ability\"`（⛔ 不是靠 hook 的內部冷卻壓住它）。",
    ).toEqual([]);
    // ⭐ 而「分得開」是**引擎那一半**在保證的，所以這裡連引擎一起驗（⛔ 只驗 JSON 是驗一半的路）：
    //   `sim/effects/hooks.ts` 給觸發器排出的效果打的是 `origin: "hook:<srcId>"`，
    //   而 `damageSource:"ability"` 走 `originInScope(origin,"ability")`。
    expect(
      originInScope("hook:godie-emfr.e", "ability"),
      "⛔⛔ 觸發器排出的傷害開始被算成「技能傷害」⇒ ⭐ 上面那條 `damageSource:\"ability\"` 的過濾\n" +
        "  會開始放行它**自己**排出去的那一發 ⇒ 普攻火傷會把爆炎叫起來，而 JSON 一個字都沒改。",
    ).toBe(false);
    expect(
      originInScope("ability:godie-emfr.q", "ability"),
      "⛔ 真正的技能傷害不再被算成技能傷害 ⇒ 那條過濾變成永遠不通過（一個必定沉默的機制）",
    ).toBe(true);
  });
});
