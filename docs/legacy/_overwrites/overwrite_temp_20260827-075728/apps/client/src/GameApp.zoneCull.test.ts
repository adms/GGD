/**
 * L3 · GameApp 真的把 zone 剔除接上去了嗎(zone-cull-wiring)。
 *
 * ── 為什麼需要這一支 ────────────────────────────────────────────────────────
 * `net/zoneVisibility.test.ts` 用真的 `InterpolationBuffer` 證明了**零件**是對的
 * —— 但零件對了不代表玩家拿得到。這個 repo 已經吃過失敗形態 ③/⑤ 兩次：
 * `...voicePlayOptions(mix)` 整行刪掉、3,563 條測試全綠；#281/#282 的修正從
 * `GameApp.ts` 改回缺陷原狀、4,093 條測試全綠。剔除只有寫在**出貨的**
 * `GameApp.ts` 上才算數。
 *
 * ── 為什麼是源碼掃描 ────────────────────────────────────────────────────────
 * 掃字串本身是失敗形態 ⑥，這裡明說。`GameApp` 抓 Babylon engine / canvas /
 * socket，headless 起不來；repo 對這個檔案的既有做法就是源碼掃描
 * (`GameApp.frameWiring.test.ts`、`GameApp.batch1Wiring.test.ts`、
 * `architecture.test.ts`)。緩解的方式跟那幾支一樣：**切出方法的大括號區塊**，
 * 斷言每一行落在**哪一個方法裡**、以及**先後順序**，而不是「整個檔案有沒有出現
 * 這個字」。註解在比對前被 `stripComments` 拿掉，所以散文永遠滿足不了任何一條。
 *
 * ── 突變驗證(2026-07-30) ────────────────────────────────────────────────────
 * · `collectEntities` 的 `if (!this.visibleZones.has(es.zone)) return;` 刪掉
 *   → 「view 同步這一層有剔除」紅。
 * · `updateFrameBus` 的兩行剔除各刪一行 → 「血條錨點」/「復活圈」各紅一條。
 * · `renderFrame` statusFx 迴圈那一行刪掉 → 「狀態光環/CC 語音」紅。
 * · `refreshVisibleZones` 的 `zones.add(this.spectateZoneByPlayer.get(p))` 刪掉
 *   → 「觀戰的 zone 要進得來」紅(這是最容易做壞的一條)。
 * · `zones.add(this.ownZoneOf(p, state))` 刪掉 → 「自己那一區永遠留著」紅。
 * · `refreshVisibleZones(state)` 移到 `ingestZonedTransforms` 之後
 *   → 「順序」紅。
 * · `syncHudFromState` 移回 ingest 之後 → 「HUD 先同步」紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stripComments } from "@ggd/shared/testkit/stripComments";

/**
 * ⭐ GH#716 —— 掃描面 = `GameApp.ts` **＋** 從它拆出去的投影模組。
 *
 * ⚠️ 少了第二個檔，這一支會在拆檔之後**安靜地變成空的**：`updateFrameBus` 還在
 * （它是 prototype-bound 的轉發），而剔除那兩行搬到了 `game/frameBusProjection.ts`
 * ⇒ 「掃不到 ⇒ 沒有東西可以違反 ⇒ 全綠」正是這一支檔頭在罵的那個形狀。
 *
 * ⭐ `d.` → `this.` 是**還原搬家時唯一的那個機械代換**（見 frameBusProjection 檔頭），
 * 這樣底下每一條斷言的字串都**逐字不動** —— 拆檔沒有偷偷放寬任何一條。
 */
const SRC = stripComments(
  readFileSync(fileURLToPath(new URL("./GameApp.ts", import.meta.url)), "utf8") +
    "\n" +
    readFileSync(
      fileURLToPath(new URL("./game/frameBusProjection.ts", import.meta.url)),
      "utf8",
    ).replace(/\bd\./g, "this."),
);

/** 切出 `header` 後面那個大括號區塊(不含外層括號)。找不到就丟例外。 */
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

/** 這一行剔除的出貨寫法 —— 四個消費點共用同一個述詞。 */
const CULL = "if (!this.visibleZones.has(es.zone)) return;";

describe("L3 · 可見 zone 集合是怎麼算出來的", () => {
  it("每個本地玩家都貢獻『自己的區』和『觀戰的區』，而且兩者並存", () => {
    const body = bodyAfter("private refreshVisibleZones(state: MatchState): void");
    // 分割畫面也算 —— 不是只有 player 0
    expect(body).toMatch(/for \(let p = 0; p < this\.viewports\.count; p\+\+\)/);
    expect(
      body,
      "自己那一區不見了 —— 小地圖推不出 localZone、復活圈橫幅、結算特寫全會壞",
    ).toContain("zones.add(this.ownZoneOf(p, state));");
    expect(
      body,
      "觀戰的 zone 沒有進集合 —— 按下「前往觀戰」之後畫面會是一座空競技場",
    ).toContain("zones.add(this.spectateZoneByPlayer.get(p));");
    // 而且是「並存」不是「取代」：兩個 add 都在同一個迴圈裡，中間沒有 else
    expect(body).toMatch(
      /zones\.add\(this\.ownZoneOf\(p, state\)\);\s*zones\.add\(this\.spectateZoneByPlayer\.get\(p\)\);/,
    );
    // 每次重算都要先清空再封裝，否則集合只會單向長大 / 永遠不會 fail-open
    expect(body).toContain("zones.begin();");
    expect(body).toContain("zones.end();");
  });
});

describe("L3 · 四個消費點都真的剔除了", () => {
  it("插值緩衝：走的是 ingestZonedTransforms，而且 zone 集合先算好", () => {
    const body = bodyAfter("private onStatePatch(state: MatchState): void");
    expect(body).toMatch(
      /ingestZonedTransforms\(\s*state\.entities,\s*this\.visibleZones,\s*state\.tick,\s*this\.interp,\s*this\.interpSeen,?\s*\)/,
    );
    // 缺陷原狀：不分 zone 的 forEach + interp.push 不可以再存在
    expect(
      /state\.entities\.forEach\([\s\S]{0,120}this\.interp\.push\(/.test(body),
      "onStatePatch 回到了不分 zone 的 interp.push —— 剔除被撤銷了",
    ).toBe(false);
    // 順序：HUD 先同步(localEntityId 才是這一份快照的) → 算 zone → 再 ingest
    const hud = body.indexOf("syncHudFromState(state,");
    const refresh = body.indexOf("this.refreshVisibleZones(state);");
    const ingest = body.indexOf("ingestZonedTransforms(");
    expect(hud).toBeGreaterThanOrEqual(0);
    expect(refresh).toBeGreaterThan(hud);
    expect(ingest).toBeGreaterThan(refresh);
  });

  it("view 同步 / 環境特效 / 遠端腳步：collectEntities 剔除別區", () => {
    const body = bodyAfter("private collectEntities(state: MatchState): EntityViewState[]");
    expect(body, "別區的實體又開始建 view 了").toContain(CULL);
    // 剔除必須在**取 pool slot 之前**，否則 pool 會被別區的實體佔掉索引
    expect(body).toMatch(/if \(!this\.visibleZones\.has\(es\.zone\)\) return;\s*let e = this\.entityPool\[i\];/);
  });

  it("狀態光環 + CC 語音：renderFrame 的 statusFx 迴圈剔除別區", () => {
    const body = bodyAfter("private renderFrame(nowMs: number): void");
    // 剔除 → kind/alive → posOf → statusFx.set，四者相鄰。順序是刻意的：
    // #39 的守衛(GameApp.batch1Wiring.test.ts)盯的是 kind/alive 緊接 posOf，
    // 所以剔除只能放在**最前面**。
    expect(body).toMatch(
      /if \(!this\.visibleZones\.has\(es\.zone\)\) return;\s*if \(es\.kind !== KIND_CHAMPION \|\| !es\.alive\) return;\s*const p = this\.views\.posOf\(es\.id\)[\s\S]{0,120}this\.vfx\.statusFx\.set\(/,
    );
  });

  it("血條錨點與復活圈：updateFrameBus 兩個迴圈都剔除別區", () => {
    const body = bodyAfter("private updateFrameBus(state: MatchState, nowMs: number): void");
    // 錨點迴圈：在 hasOverheadBar 之後、在**做任何工作之前**。
    // ⚠️ 2026-07-31 從「緊鄰」放寬成「之後 + 在 seen.add 之前」,而且這是修正
    //    不是放水:原本的 `\s*` 要求兩行**字面相鄰**,而 #85 的匿蹤血條判斷
    //    合法地插進了中間 —— 守衛因此紅在一個跟剔除完全無關的理由上
    //    (CLAUDE.md 失敗形態④:斷言方向跟缺陷無關)。
    //    真正要守的性質是**順序**:剔除必須早於 `seen.add(es.id)`,
    //    否則別區的實體會進到 seen 集合、拿到血條錨點。
    const anchorGate = body.indexOf("if (!hasOverheadBar(es.kind)) return;");
    const anchorCull = body.indexOf(CULL, anchorGate);
    const anchorWork = body.indexOf("seen.add(es.id)", anchorGate);
    expect(anchorGate, "hasOverheadBar 這一關不見了").toBeGreaterThanOrEqual(0);
    expect(anchorCull, "血條錨點迴圈完全沒有剔除別區").toBeGreaterThan(anchorGate);
    expect(anchorCull, "剔除排在 seen.add 之後 —— 別區實體照樣拿到血條錨點").toBeLessThan(anchorWork);
    // 復活圈迴圈：接在 kind 判斷之後
    expect(body).toMatch(/if \(es\.kind !== KIND_REVIVE_CIRCLE\) return;\s*if \(!this\.visibleZones\.has\(es\.zone\)\) return;/);
    // 兩處都在 = 至少兩次
    expect(body.split(CULL).length - 1).toBeGreaterThanOrEqual(2);
  });

  /**
   * 第五個消費點(2026-07-31 補)。前四個是「畫出來的東西」,這一個是
   * 「打得到的東西」—— 而它原本沒有剔除。
   *
   * 為什麼這不只是省算力:`enemyUnitsFor` 的結果餵給
   *   · `pickEnemyAt` —— 滑鼠點擊選敵
   *   · TouchController 的 `enemyUnits` —— 手機自動接敵
   *   · `pickNearestUnit(from, …, maxRange, aimDir)` —— 手把瞄準輔助
   * 別區的英雄沒有 view,所以 `this.views.posOf(es.id)` 落空、退回快照原始
   * x/z,於是它們**帶著真座標**進了可選取清單。今天兩個 zone 相距 80u
   * (SKELETON_ARENA: x=±40, r=24),射程搆不到 —— 但那是幾何巧合,不是不變量。
   * 不變量是「玩家看不到的東西不可以是目標」。
   */
  it("可選取的敵人清單:enemyUnitsFor 也剔除別區", () => {
    const body = bodyAfter("private enemyUnitsFor(myTeam: number): PickableUnit[]");
    expect(body, "別區的英雄/守衛又回到可選取清單了 —— 手把瞄準會鎖上看不見的目標").toContain(CULL);
    // 順序:剔除必須早於 kind 判斷與 `units.push`,否則別區的實體照樣入列
    const cull = body.indexOf(CULL);
    const push = body.indexOf("units.push(");
    expect(cull, "enemyUnitsFor 完全沒有剔除").toBeGreaterThanOrEqual(0);
    expect(push).toBeGreaterThan(cull);
  });
});

describe("L3 · 沒有動到伺服器 / 協定 / 預測", () => {
  it("剔除只在客戶端的四個消費點，沒有任何一行送回伺服器", () => {
    // 可見集合不是輸入訊息的一部分 —— 這一支的前提就是零協定變更
    expect(/this\.sessions\.[a-zA-Z]+\([^)]*visibleZones/.test(SRC)).toBe(false);
    expect(/send\([^)]*visibleZones/.test(SRC)).toBe(false);
  });

  it("本地英雄的權威樣本仍然直接讀 state，不經過剔除", () => {
    const body = bodyAfter("private onStatePatch(state: MatchState): void");
    // 自己的 reconcile 輸入永遠拿得到，就算 zone 集合算錯也一樣
    expect(body).toContain("state.entities.get(String(hud.localEntityId))");
  });
});
