/**
 * ⭐⭐ GH#974 —— **段落沒播的時候要說得出「是哪一支的哪一段、為什麼」。**
 *
 * ── 📏 為什麼有這條（2026-09-04 逐行讀出來的）────────────────────────────
 * owner 回報「超多特效都消失了」，而分母正好是**有 script 的那 10 支**。
 * 逐行追下去，`VfxScriptPlayer.fire()` 這條路上有**三個靜默 `return`**：
 *   ① `casterPos ?? frame.point` 都沒有
 *   ② `insts.length === 0`
 *   ③ `anchor:"target"` ⇒ `frame.targetPos ?? frame.point` 解不出來（⇒ 落進②）
 *
 * ⚠️ ⭐ 而 `strike` 那條路的 frame，`point` 與 `targetPos` **兩個都只從同一個來源來**
 * （`comboStrike` 事件的 `d.x`/`d.z`），⛔ 而 sim 那一端它們是**選填**的
 * （`delayed.ts`：`at = vp ?? point`，型別註解逐字說 victim「**全滅時缺席**」）。
 * ⇒ ⭐⭐ sim 沒送座標 ⇒ `anchor:"target"` 的每一段整批消失，⛔ 而沒有人會知道。
 *
 * ── ⭐ 這條守衛驗什麼 ────────────────────────────────────────────────
 * ⛔ **不驗「特效好不好看」**（那要 HITL）。⭐ 驗的是**帳本說不說話** ——
 * 也就是把「特效回來了」從一個**要用眼睛看的宣稱**，換成一個**數得出來的量**。
 * ⚠️ CLAUDE.md 逐字：「fail-open 沒錯，**靜默**才是缺陷」。
 *
 * ── ⚠️⚠️ 一個我自己先推錯、被突變揪出來的地方（留著當反例）──────────────
 * 我原本以為「`anchor:"target"` 解不出錨 ⇒ 段落消失」。⛔ **那是錯的**：
 * `modelFxPlacement.ts` 的錨點解析是**逐層退化**的（`target → point → self`），
 * ⭐ 所以只要施法者位置還在，它會**退到施法者腳下** ——
 * ⇒ 症狀是「**畫在錯的地方**」，⛔ 不是「消失」。
 *
 * ⭐ 真正會讓整批消失的是出口①：`casterPos` 與 `frame.point` **兩個都沒有**。
 * ⇒ 也就是「**施法者自己不在畫面上**」的那一刻（實體不在快照裡）。
 *
 * ── ⭐ 兩個方向（⛔ 單邊校準過的尺不算自證過）────────────────────────────
 * ① 已知**會掉**：施法者不在畫面上 ＋ 事件沒帶座標 ⇒ 帳本要指名它，
 *    ⭐ 而且 `reason` 要精準是 `no-origin`
 * ② 已知**不會掉**：frame **帶著座標** ⇒ 帳本不可以有 `no-anchor`
 *    ⚠️ 少了這一邊，一個「永遠都記一筆」的帳本也會讓①通過。
 *
 * MUTATION LOG（落地前實跑）：
 *   · ⛔ **第一次沒打中**：我改壞出口②，而守衛照樣綠 ——
 *     ⭐ 因為方向①走的其實是出口①。那次的「沒紅」正是上面那個推理錯誤的證據。
 *   · ⭐ 打真的承重線：出口① 的 `return drop("no-origin")` 改回 `return;`
 *     → 方向① 紅。還原後複驗綠。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VfxScriptPlayer, takeScriptSegmentDrops } from "./VfxScriptPlayer";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPTS = join(REPO, "content/vfx-scripts");

/** ⭐ 出貨的 script（⛔ 不是我編的夾具 —— 失敗形態⑤）。 */
function shippedScripts(): Record<string, unknown>[] {
  return readdirSync(SCRIPTS)
    .filter((f) => f.endsWith(".json") && f !== "_index.json")
    .map((f) => JSON.parse(readFileSync(join(SCRIPTS, f), "utf8")) as Record<string, unknown>);
}

/** 造一個播放器：`entityPos` 回 null（＝實體不在畫面上），script 走出貨那一份。 */
function playerFor(doc: Record<string, unknown>, casterPos: { x: number; z: number } | null) {
  const dispatched: { type: string }[] = [];
  return {
    dispatched,
    player: new VfxScriptPlayer({
      enabled: () => true,
      entityPos: () => casterPos,
      scriptFor: (id: string) => (doc["abilityId"] === id ? (doc as never) : undefined),
      dispatch: (ev: { type: string }) => void dispatched.push(ev),
    } as never),
  };
}

describe("script 段落掉了要說話（GH#974）", () => {
  beforeEach(() => void takeScriptSegmentDrops());

  it("★★ ⭐ 出貨的 10 份 script 都在，而 `anchor:\"target\"` 是主要形狀", () => {
    const docs = shippedScripts();
    expect(docs.length, "⛔ 掃不到出貨 script —— 量尺壞了，⛔ 不是真的沒有").toBe(10);

    // ⭐ 母體推導自出貨內容，⛔ 不抄 id：`anchor:"target"` 的段有多少？
    const segs = docs.flatMap((d) => (d["segments"] as Record<string, unknown>[] | undefined) ?? []);
    const targetAnchored = segs.filter((s) => s["anchor"] === "target");
    expect(
      targetAnchored.length,
      "⛔ 出貨 script 裡一段 `anchor:\"target\"` 都沒有 ⇒ 這條守衛在驗一個不存在的形狀",
    ).toBeGreaterThan(0);
  });

  it("★★ ⭐ 方向①【已知會掉】—— 施法者不在畫面上 ⇒ 帳本指名它，reason 精準是 `no-origin`", () => {
    const doc = shippedScripts().find(
      (d) =>
        ((d["segments"] as Record<string, unknown>[] | undefined) ?? []).some(
          (s) => s["kind"] === "modelFx" && s["anchor"] === "target",
        ),
    );
    expect(doc, "⛔ 出貨裡找不到一份帶 `anchor:\"target\"` 的 modelFx script").toBeDefined();

    const { player } = playerFor(doc!, null); // ⛔ casterPos 也沒有 ⇒ 走到底
    // ⭐ 真的餵一則 `comboStrike`，⛔ 而且**故意不帶 x/z** —— 那正是 sim
    //   在「全滅」時送出來的形狀（`delayed.ts` 的 `at = vp ?? point`）。
    player.onEvent(
      {
        type: "comboStrike",
        tick: 1,
        data: { caster: 1, origin: `ability:${String(doc!["abilityId"])}`, index: 1, count: 1 },
      } as never,
      0,
    );
    player.update?.(10_000);

    const drops = takeScriptSegmentDrops();
    expect(
      drops.length,
      "⛔⛔ 段落沒播，⛔ 而帳本是空的 —— ⭐ 這正是 owner 看到「超多都消失了」而\n" +
        "  ⛔ 沒有任何一行 log 說過話的那個狀態（三個靜默 return）。",
    ).toBeGreaterThan(0);

    expect(
      drops.every((d) => d.abilityId === doc!["abilityId"]),
      "⛔ 帳本說不出是**哪一支**技能 ⇒ 驗收要的「10 支逐支確認」做不到",
    ).toBe(true);

    // ⭐⭐ **理由要精準** —— ⛔ 不是「有記一筆」就算。
    //   ⚠️ 這一條是被一次**沒打中的突變**逼出來的：我原本只斷言 `drops.length > 0`，
    //   而那對出口①②哪一個開的**都成立** ⇒ 改壞出口②它照樣綠。
    //   ⇒ ⭐ 一次沒打中的突變問的不只是「守衛夠不夠」，
    //     也是「**我以為的那條承重線是不是真的承重**」。
    expect(
      drops.map((d) => d.reason),
      "⛔ 這個情境（施法者不在畫面上 ＋ 事件沒帶座標）走的是出口① `no-origin`",
    ).toContain("no-origin");
  });

  it("★★ ⭐ 方向②【已知不會掉】—— frame **帶著座標** ⇒ 帳本要是空的", () => {
    const doc = shippedScripts().find(
      (d) =>
        ((d["segments"] as Record<string, unknown>[] | undefined) ?? []).some(
          (s) => s["kind"] === "modelFx" && s["anchor"] === "target",
        ),
    );
    const { player } = playerFor(doc!, { x: 0, z: 0 });
    player.onEvent(
      {
        type: "comboStrike",
        tick: 1,
        // ⭐ 這一次帶 x/z（＝ sim 解得出落點的正常情況）
        data: { caster: 1, origin: `ability:${String(doc!["abilityId"])}`, index: 1, count: 1, x: 3, z: 4 },
      } as never,
      0,
    );
    player.update?.(10_000);

    expect(
      takeScriptSegmentDrops().filter((d) => d.reason === "no-anchor"),
      "⛔⛔ 座標**在**而段落仍然被記成掉了 ⇒ ⭐ 這個帳本對每一次都喊，\n" +
        "  它證明不了任何事（⛔ 一把只驗過單邊的尺）。",
    ).toEqual([]);
  });
});
