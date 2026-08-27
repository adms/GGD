/**
 * 殭屍身分的**最後一吋**真的接在 GameApp 上 (GH#191/GH#192) —— 稽核補的 (verifier).
 *
 * ── 兩條存活的突變 ─────────────────────────────────────────────────────────
 * 交付的守衛把兩個決定抽成了純函式並測得很紮實
 * (`render/mobSizeWiring.test.ts`:`entityTintFor` 的分支、`mobModelSizeOverride`
 * 的乘法、真的 registry 的體型與染黑)。但**出貨的那個檔案** `GameApp.ts` 只有
 * 兩行把它們接上,而那兩行改回缺陷原狀之後 client 套件 **346 檔 / 4117 條全綠**:
 *
 *   (a) `championTintFor: (e) => championTintForId(this.championIdForSeat(e.seatId))`
 *       —— 也就是 GH#192 之前的樣子。殭屍的 `seatId` 是 -1,所以解析回
 *       `undefined`(「還解析不出來」),registry 每一幀重試、永遠不上色:場上十二隻
 *       跟玩家自己選的英雄**同色同形**,正是 owner 點名要避免的那件事。
 *       ⚠️ `typecheck` 也擋不住 —— 我實測過,`tsc --noEmit` 一樣過。
 *
 *   (b) `e.mobScale = undefined;`(不再從 `es.mana` 解碼)—— 體型倍率整條死掉,
 *       王、特殊殭屍、一般殭屍在畫面上同一個大小,#217 的 0.68 與 owner 的 10 倍
 *       同時消失。
 *
 * 兩條都是失敗形狀 ②:算出來了、送上線了、客戶端沒接。
 *
 * ── 為什麼是「切方法區塊」的源碼守衛(而不是 grep) ─────────────────────────
 * 掃字串是失敗形狀 ⑥,這裡明說。`GameApp` 抓 Babylon engine / canvas / socket,
 * headless 起不來;這個 repo 對這個檔案的既有做法就是切出方法區塊再比對
 * (`GameApp.frameWiring.test.ts`、`GameApp.batch1Wiring.test.ts`,兩支都寫明了
 * 同一個理由)。這一支照抄那個做法:註解先被 `stripComments` 拿掉(所以散文永遠
 * 滿足不了任何一條),斷言「在這個方法裡有」與「不是那個舊寫法」成對出現。
 *
 * 唯一不是源碼比對的一條在最後:`KIND_MOB` 這個在三個檔案裡各寫一次的常數,
 * 直接跟協定的 `ENTITY_KIND.MOB` 對數值 —— 那個漂移不需要靠掃字串抓。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { stripComments } from "@ggd/shared/testkit/stripComments";
import { ENTITY_KIND } from "@ggd/shared/protocol/schema";
import { KIND_MOB } from "./render/overheadAnchors";

const SRC = stripComments(
  readFileSync(fileURLToPath(new URL("./GameApp.ts", import.meta.url)), "utf8"),
);

/** Cut the brace-matched `{ … }` block after `header`; throws if it moved. */
function bodyAfter(header: string): string {
  const at = SRC.indexOf(header);
  if (at < 0) throw new Error(`GameApp.ts no longer contains \`${header}\``);
  const open = SRC.indexOf("{", at + header.length - 1);
  if (open < 0) throw new Error(`no block after \`${header}\``);
  let depth = 0;
  for (let i = open; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return SRC.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces after \`${header}\``);
}

const HOOKS = "this.views = new EntityViewRegistry(this.renderer.scene, this.assets, {";
const COLLECT = "private collectEntities(state: MatchState): EntityViewState[]";

describe("殭屍染黑真的接在 registry 的 tint 接縫上 (GH#192)", () => {
  it("championTintFor 走的是 entityTintFor(e, 上線的染黑強度, thunk),不是英雄解析器本身", () => {
    cover("mob-special-visible");
    const hooks = bodyAfter(HOOKS);
    expect(
      hooks,
      "championTintFor 沒有接 entityTintFor —— 殭屍會用玩家英雄的原色渲染 (GH#192)",
    ).toMatch(/championTintFor:\s*\(e\)\s*=>\s*entityTintFor\(\s*e,\s*this\.mobVisual\.tintStrength,/);
    // 而且不是 GH#192 之前的那一行 —— 兩條互補,搬回舊寫法會同時打破
    expect(
      hooks,
      "championTintFor 退回了 GH#192 之前的英雄解析器 —— 殭屍永遠不上色",
    ).not.toMatch(/championTintFor:\s*\(e\)\s*=>\s*championTintForId\(/);
    // 染黑強度必須是**上線的那份表**,不是常數:寫死 0.65 的話後台調不動
    expect(hooks).toContain("this.mobVisual.tintStrength");
  });

  it("MatchState.mobVisualJson 真的被解析進 this.mobVisual,而且在讀 entities 之前", () => {
    cover("mob-special-visible");
    const collect = bodyAfter(COLLECT);
    expect(collect).toMatch(
      /if \(state\.mobVisualJson !== this\.mobVisualJson\)[\s\S]{0,200}parseMobVisualJson\(state\.mobVisualJson\)/,
    );
    // 順序是載重的:先更新表,再走 entities。反過來的話一場比賽的第一波殭屍
    // 會用上一份(或預設)的染黑強度上色,而 applyTint 是每個實體只解析一次的。
    const parseAt = collect.indexOf("parseMobVisualJson(");
    // ⭐ 2026-08-27：`state.entities.forEach` → `entitiesOf(state).forEach`
    //   （GH#614/#760 `4d5a5417`）。⭐ 這一條守的是**順序**，
    //   ⛔ 不是「實體集合怎麼取」—— 所以只找「開始走 entities」那一刻。
    const forEachAt = Math.max(
      collect.indexOf("entitiesOf(state).forEach("),
      collect.indexOf("state.entities.forEach("),
    );
    expect(parseAt).toBeGreaterThanOrEqual(0);
    expect(forEachAt).toBeGreaterThanOrEqual(0);
    expect(parseAt, "mobVisualJson 在走完 entities 之後才解析").toBeLessThan(forEachAt);
  });
});

describe("殭屍體型倍率真的從 EntityState.mana 解碼出來 (GH#192)", () => {
  it("collectEntities 把 mob 的 mana 讀進 e.mobScale,並替其他 kind 清乾淨", () => {
    cover("mob-special-visible");
    const collect = bodyAfter(COLLECT);
    expect(
      collect,
      "e.mobScale 不再從 es.mana 解碼 —— 三種殭屍會在畫面上同一個大小 (GH#192/#262)",
    ).toMatch(/e\.mobScale\s*=\s*es\.kind\s*===\s*KIND_MOB\s*\?\s*es\.mana\s*:\s*undefined/);
    // 「其他 kind 要清成 undefined」不是潔癖:entityPool 是跨幀重用的,一個被
    // 王用過的槽位若把 10× 留給下一幀的英雄,那位英雄會突然變成巨人。
    expect(collect).toContain("es.mana : undefined");
  });

  it("KIND_MOB 這個各寫一次的常數跟協定對得上 —— 漂移會讓兩條解碼同時失效", () => {
    cover("mob-special-visible");
    expect(KIND_MOB).toBe(ENTITY_KIND.MOB);
  });
});
