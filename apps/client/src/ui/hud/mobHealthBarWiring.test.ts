// @vitest-environment jsdom
/**
 * GH#268 —— 血條的**接線**守衛。owner 兩次回報「殭屍王血量在死之前就消失」。
 *
 * ── 為什麼要一支新的 ───────────────────────────────────────────────────────
 * `mobHealthBar.test.ts` / `bossHealthBar.test.ts` 驗的都是「模型算對了 → markup
 * 畫得出來」。**兩支對 v0.9.28 的缺陷全綠**，因為缺的不是模型：
 *   · `frameBus.mobBars` 沒有任何寫入者（`GameApp` 全檔零個 `mobBars` 參照）；
 *   · `HudRoot` 沒有掛 `<MobHealthBars />`；
 *   · 長血條的 bossId 讀的是一顆**一場只有一個槽**的事件欄位。
 * 也就是說整包功能可以從 repo 刪掉、畫面一個像素都不變（失敗形態 ③），而且是在
 * 已經付掉 `ENTITY_FLAG` 最後一格（32768，不可逆）之後。
 *
 * ── 這裡的兩條守衛 ─────────────────────────────────────────────────────────
 * A（長血條）：**王還活著的整段期間**，別隻精英死掉不會讓它消失。
 *    走的是出貨的整條鏈：真的 `mobBossSpawn` / `mobBossSlain` 事件
 *    → `RoomStore.recordMobBossEvent` → `hud.mobBossLive`
 *    → `frameBus.mobBossMarkerFor`（`GameApp` 每幀呼叫的那一個）
 *    → `bossHealthBarSpec` → `BossHealthBarView` 的 markup。
 *    ⚠️ 「一段時間」不是「一個時點」：所以下面是掃一整條時間線，每一步都讀最終
 *    markup（⑦ 會是在滿血那一點驗一次 `!== null` 就收工）。
 *
 * B（頭上小血條）：**出貨的 `HudRoot` 掛載後，渲染樹上真的有 `data-mob-bar` 節點。**
 *    這就是 v0.9.28 缺的那一條 —— 有它的話那次的假成功當場就會被抓到。
 *    在 jsdom 用 `createRoot` 掛真的 `<HudRoot/>`（做法照抄
 *    `ui/hudBoundaryGroup.test.ts`），因為 `renderToStaticMarkup` 不跑 effect、
 *    也證明不了「這個元件真的在那棵樹上」。
 *
 * ── GameApp 那一段為什麼是源碼掃描（誠實聲明）────────────────────────────
 * `GameApp` 抓 Babylon engine / canvas / socket，headless 起不來；repo 對它的既有
 * 做法就是切方法區塊的源碼掃描（`GameApp.zoneCull.test.ts` 檔頭寫了同樣的理由）。
 * 掃字串本身是失敗形態 ⑥，所以緩解方式跟那一支一樣：**切出方法的大括號區塊**、
 * 斷言呼叫落在哪一個方法裡，而且註解在比對前被剝掉，散文永遠滿足不了任何一條。
 * 真正的行為覆蓋由 A（純函式鏈）與 B（真的 DOM）承擔。
 *
 * ── 突變驗證（2026-08-03，三步都跑過）──────────────────────────────────────
 * ① `RoomStore.recordMobBossEvent` 的 `prev.mobBossLive.bossId === view.bossId`
 *    改成無條件 `null`（＝回到單槽語意）→ A「別隻精英死掉」紅。
 * ② `HudRoot` 的 `<MobHealthBars />` 刪掉 → B 紅（其餘全綠，這正是 v0.9.28）。
 * ③ `GameApp.updateFrameBus` 的 `KIND_MOB` 分支刪掉 → C「寫入者」紅。
 * ④ `frameBus.mobBossMarkerFor` 的 `!row.alive` 拿掉 → A「王死了才消失」紅。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { stripComments } from "@ggd/shared/testkit/stripComments";
import { ENTITY_FLAG, ENTITY_KIND } from "@ggd/shared/protocol/schema";
import { MOB_BOSS_SLAIN_EVENT, MOB_BOSS_SPAWN_EVENT } from "@ggd/shared/sim/mobBoss";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { frameBus, mobBossMarkerFor, type MobBossRow } from "../../frameBus";
import { hudStore, recordMobBossEvent, resetHudStore, type SeatView } from "../../net/RoomStore";
import { HudRoot } from "../HudRoot";
import { BossHealthBarView } from "./BossHealthBar";
import { bossHealthBarSpec } from "./bossHealthBarModel";
import { mobBarAnchorFor, mobBarAnchorY, SHIPPED_MOB_HEALTH_BAR } from "./mobHealthBarModel";

const TAG = "mob-special-visible";

/* ══════════════════════════════════════════════════════════════════════════
   A · 長血條：王還活著的整段期間，別隻精英死掉不會讓它消失
   ══════════════════════════════════════════════════════════════════════════ */

const KING_ID = 900;
const KING_ZONE = 0;
const KING_MAX_HP = 276_944;

/** 一顆真的 `mobBossSpawn`（欄位名照 `sim/mobs.summonMobBoss` 送的那些）。 */
function spawnEvent(id: number, zone: number): EventMessage {
  return {
    type: MOB_BOSS_SPAWN_EVENT,
    data: { id, zone, summonerSeatId: 0, kills: 100, championId: "godie-h001" },
  } as unknown as EventMessage;
}

/** 一顆真的 `mobBossSlain`（#288 之後特殊殭屍也會發，`kind` 區分兩者）。 */
function slainEvent(id: number, kind: "boss" | "special"): EventMessage {
  return {
    type: MOB_BOSS_SLAIN_EVENT,
    data: { id, kind, shares: [], totalGold: 3000, totalXp: 0, totalLevels: 0, killerSeatId: 0 },
  } as unknown as EventMessage;
}

/** 一份最小的「我坐在 KING_ZONE、活著」的 HUD 狀態 —— 長血條的閘要用。 */
function primeLocalSeat(): void {
  resetHudStore();
  hudStore.setState({
    connected: true,
    phase: "combat",
    round: 5,
    localSeatId: 0,
    localEntityId: 7,
    seats: [{ seatId: 0, teamId: 0, zone: KING_ZONE, displayName: "me" } as unknown as SeatView],
  });
}

const VIEWPORT = { width: 1600, height: 900 };

/**
 * 出貨的那條鏈，跑一幀：store → `mobBossMarkerFor` → `bossHealthBarSpec`
 * → `BossHealthBarView` 的 markup（沒有血條就是空字串）。
 *
 * ⚠️ `row === undefined` 代表「王的實體已經不在快照裡」。
 */
function renderBossBar(...rows: (MobBossRow | undefined)[]): string {
  const marker = mobBossMarkerFor(
    hudStore.getState().mobBossLive,
    (bossId) => ({ row: rows.find((r) => r?.id === bossId), world: { x: 3, z: 4 } }),
    KING_ZONE,
  );
  const spec = bossHealthBarSpec(marker, VIEWPORT, {
    touch: false,
    legendUp: false,
    couchPlayers: 1,
    anchor: "top",
    enabled: true,
    // 「召喚那一刻就亮」—— 出貨值。`"sighted"` 會多一道鏡頭距離判斷，那不是這條
    // 守衛要驗的東西（它有自己的測試）。
    reveal: "summon",
    localZone: KING_ZONE,
    camera: null,
  });
  return spec ? renderToStaticMarkup(createElement(BossHealthBarView, { spec })) : "";
}

/** 這一幀王還在快照上的樣子。 */
function kingRow(hp: number, alive = true): MobBossRow {
  return { id: KING_ID, zone: KING_ZONE, alive, hp, maxHp: KING_MAX_HP };
}

/** 隔壁區那隻王在快照上的樣子（同樣活著，只是不在我這一區）。 */
function otherZoneKingRow(): MobBossRow {
  return { id: KING_ID + 1, zone: KING_ZONE + 1, alive: true, hp: 5000, maxHp: 5000 };
}

/** markup 裡那條填充的比例字串（沒畫就是 null）。 */
function fillPct(html: string): string | null {
  return html.match(/data-boss-bar-pct="([\d.]+)"/)?.[1] ?? null;
}

describe("A · 殭屍王的長血條活得跟王一樣久 (GH#268)", () => {
  beforeEach(primeLocalSeat);

  it("★ 王滿血的整段期間，本區/別區的特殊殭屍一隻隻死掉都不會讓血條消失", () => {
    cover(TAG);
    recordMobBossEvent(spawnEvent(KING_ID, KING_ZONE), 1000);
    expect(fillPct(renderBossBar(kingRow(KING_MAX_HP))), "王剛降臨就沒有血條").not.toBeNull();

    // ⚠️ 這就是 owner 看到的那個症狀的成因：自 #288 起**每一隻特殊殭屍死掉也發
    // `mobBossSlain`**，而王滿血站著。特殊殭屍一回合會死好幾隻。
    const seen: (string | null)[] = [];
    let hp = KING_MAX_HP;
    for (let i = 0; i < 6; i++) {
      recordMobBossEvent(slainEvent(3000 + i, "special"), 1100 + i * 50);
      hp -= 20_000; // 王同時在被打，血條必須跟著動
      seen.push(fillPct(renderBossBar(kingRow(hp))));
    }
    expect(
      seen.filter((v) => v === null).length,
      "王還活著的期間血條消失了 —— 長血條又綁回那顆一場只有一個槽的事件了（GH#268 原狀）",
    ).toBe(0);
    // ④ 會是只驗「有畫」：一個畫一次就凍住的實作對那種斷言全綠。
    expect(new Set(seen).size, "血條有畫但數字不動 —— 那是一張截圖不是血條").toBe(seen.length);

    // 別區的王降臨也不可以搶走本區這條（事件是廣播給整場的，而王的每回合上限
    // 預設算「每個戰場」—— 四區可以同時各有一隻）。
    recordMobBossEvent(spawnEvent(KING_ID + 1, KING_ZONE + 1), 1500);
    expect(
      fillPct(renderBossBar(kingRow(hp), otherZoneKingRow())),
      "隔壁區的王一召喚，本區這條就被換掉了 —— 「現在有哪些王」又變回一格了",
    ).not.toBeNull();
    recordMobBossEvent(slainEvent(KING_ID + 1, "boss"), 1600);
    expect(
      fillPct(renderBossBar(kingRow(hp))),
      "別區的王打完了，本區這條就沒了 —— 事件仍然是廣播共用的單槽",
    ).not.toBeNull();
  });

  it("★ 王自己死掉的那一刻，血條才消失（兩條路各自成立）", () => {
    cover(TAG);
    recordMobBossEvent(spawnEvent(KING_ID, KING_ZONE), 1000);
    expect(renderBossBar(kingRow(1))).not.toBe("");

    // ① 快照上那一列翻成 alive:false（結算到之前的那一 tick）
    expect(renderBossBar(kingRow(0, false)), "屍體還掛著長血條").toBe("");
    // ② 王的 `mobBossSlain` 到了 —— 之後就算快照晚一拍才清掉也不再畫
    recordMobBossEvent(slainEvent(KING_ID, "boss"), 1700);
    expect(hudStore.getState().mobBossLive, "王死了，『現在有哪些王』還算它一筆").toEqual([]);
    expect(renderBossBar(kingRow(1)), "王的結算到了，血條還在").toBe("");
    // 分紅面板要的仍然是「最後一則結算」—— 那一格沒有被這次修正動到
    expect(hudStore.getState().mobBoss?.kind).toBe("slain");
    expect(hudStore.getState().mobBoss?.mobKind).toBe("boss");
  });

  it("★ 分紅結算與『現在有沒有王』是兩個問題，不可以合回一格", () => {
    cover(TAG);
    recordMobBossEvent(spawnEvent(KING_ID, KING_ZONE), 1000);
    recordMobBossEvent(slainEvent(4242, "special"), 1100);
    const s = hudStore.getState();
    // 最後一則消息是那隻特殊殭屍的結算（`MobBossOverlay` 要畫的就是它）…
    expect(s.mobBoss?.mobKind).toBe("special");
    // …而場上還有一隻活著的王（長血條要的就是它）。同一格裝不下這兩個答案。
    expect(s.mobBossLive.map((b) => b.bossId)).toEqual([KING_ID]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   B · 出貨的 HudRoot 渲染樹上真的有 mob-bar 節點
   ══════════════════════════════════════════════════════════════════════════ */

let host: HTMLDivElement;
let root: Root;

describe("B · HudRoot 真的畫得出精英小怪的小血條 (v0.9.28 缺的就是這一條)", () => {
  beforeEach(() => {
    primeLocalSeat();
    hudStore.setState({ localMaxHp: 1000, localHp: 900, localAlive: true });
    frameBus.mobBars.length = 0;
    host = document.createElement("div");
    host.id = "hud-root";
    document.body.appendChild(host);
    root = createRoot(host);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    host.remove();
    frameBus.mobBars.length = 0;
    vi.restoreAllMocks();
  });

  /** 一隻特殊殭屍，走的是**出貨的** `mobBarAnchorFor`（判準＝伺服器寫的那一格）。 */
  function pushElite(id: number, hp: number, maxHp: number): void {
    const anchor = mobBarAnchorFor(
      {
        id,
        kind: ENTITY_KIND.MOB,
        flags: ENTITY_FLAG.MOB_ELITE,
        alive: true,
        hp,
        maxHp,
        zone: KING_ZONE,
      },
      { sx: 640, sy: 320, visible: true },
      { x: 1, z: 2 },
    );
    if (anchor) frameBus.mobBars.push(anchor);
  }

  it("★ 掛上真的 <HudRoot/>：frameBus 有精英 → DOM 上真的多了血條節點", () => {
    cover(TAG);
    // 先量「沒有精英」的基準 —— 沒有它，「有節點」可能只是因為它永遠都在。
    flushSync(() => root.render(createElement(HudRoot)));
    expect(
      host.querySelectorAll("[data-hud-slot]").length,
      "健康的 HudRoot 應該畫得出 HUD 槽位；沒有的話這條測試是空的",
    ).toBeGreaterThan(2);
    expect(host.querySelectorAll("[data-mob-bar]").length, "沒有精英卻畫了血條").toBe(0);

    // 這一幀 `GameApp` 寫了兩隻精英進去
    pushElite(12, 3000, 8000);
    pushElite(13, 100, 400);
    flushSync(() => root.unmount());
    root = createRoot(host);
    flushSync(() => root.render(createElement(HudRoot)));

    const bars = [...host.querySelectorAll("[data-mob-bar-entity]")].map((n) =>
      Number(n.getAttribute("data-mob-bar-entity")),
    );
    expect(
      bars,
      "HudRoot 的渲染樹上沒有任何 mob-bar 節點 —— <MobHealthBars /> 沒有被掛上去。" +
        "這正是 v0.9.28 的狀態：伺服器付掉 ENTITY_FLAG 最後一格，客戶端一個像素都沒畫。",
    ).toEqual([12, 13]);
    // 而且畫的是**這一幀的血量**，不是一個佔位符（3000/8000 = 37.5%）。
    // ⚠️ 讀 `style.width` 而不是 innerHTML 的子字串：jsdom 會把 style 重新序列化
    // （`width: 37.5%`，多一個空格），比對字串會在一個跟缺陷無關的理由上紅。
    const fill = host.querySelector<HTMLElement>('[data-mob-bar-entity="12"] [data-mob-bar="fill"]');
    expect(fill?.style.width).toBe("37.5%");
  });

  it("★ 血條在 HudRoot 那棵樹上，而不是自己一個游離的 root", () => {
    cover(TAG);
    pushElite(12, 4000, 8000);
    flushSync(() => root.render(createElement(HudRoot)));
    const bar = host.querySelector("[data-mob-bar-entity]");
    expect(bar, "血條節點根本不在 #hud-root 底下").not.toBeNull();
    // 它必須被 HUD 的 boundary 群組包著（一條血條炸掉不可以帶走整個 HUD）
    expect(host.contains(bar!)).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   C · GameApp 的兩處接線（源碼掃描 —— 上面檔頭已聲明為何只能這樣）
   ══════════════════════════════════════════════════════════════════════════ */

// ⚠️ `__dirname`, NOT `new URL(…, import.meta.url)` —— 這個檔跑在 jsdom 環境，
// 那裡的 `import.meta.url` 不是 `file:` scheme，`fileURLToPath` 會直接丟例外。
const GAME_APP = stripComments(readFileSync(join(__dirname, "../../GameApp.ts"), "utf8"));

/** 切出 `header` 後面那個大括號區塊（不含外層括號）。做法同 GameApp.zoneCull.test.ts。 */
function bodyAfter(header: string): string {
  const at = GAME_APP.indexOf(header);
  if (at < 0) throw new Error(`GameApp.ts no longer contains \`${header}\``);
  const open = GAME_APP.indexOf("{", at + header.length - 1);
  let depth = 0;
  for (let i = open; i < GAME_APP.length; i++) {
    if (GAME_APP[i] === "{") depth++;
    else if (GAME_APP[i] === "}" && --depth === 0) return GAME_APP.slice(open + 1, i);
  }
  throw new Error(`unbalanced braces after \`${header}\``);
}

describe("C · GameApp 是 frameBus 那兩格的寫入者", () => {
  const body = (): string =>
    bodyAfter("private updateFrameBus(state: MatchState, nowMs: number): void");

  it("★ `frameBus.mobBars` 有寫入者，而且用的是出貨的那個判斷", () => {
    cover(TAG);
    const b = body();
    expect(b, "mobBars 又變回一個沒有人寫的空陣列（v0.9.28 原狀）").toContain("frameBus.mobBars");
    expect(b, "掃描沒有清空舊的一幀 —— 血條會愈積愈多").toMatch(/bars\.length = 0/);
    expect(
      b,
      "GameApp 自己判斷誰算精英了 —— 判斷必須只有 mobHealthBarModel 一份（失敗形態 ⑤）",
    ).toContain("mobBarAnchorFor(");
    // `yOffset` 要真的被讀：少了 `mobBarAnchorY` 就是一個寫了沒人讀的後台欄位
    expect(b, "投影高度沒有走 mobBarAnchorY —— 王的血條會掛在牠膝蓋上").toContain(
      "mobBarAnchorY(es.mana",
    );
    // 別區的小怪不進來（波峰一區 50 隻）
    expect(b).toMatch(// ⭐ GH#575 —— 原本是 `\{\s*` 要求**緊接著**,而 2026-08-23 在那兩行之間插進了
    //    `this.vfx.noteGoldBody(...)`（殭屍的身體要在**任何 return 之前**記下來,
    //    否則金幣不生、音效與音階都不播）。
    // ⛔ 「相鄰」不是這條守衛要守的東西 —— 它要守的是「**分區剔除存在,而且用的是
    //    出貨的那個判斷**」。⇒ 放寬相鄰,⛔ 不放寬存在。
    /if \(es\.kind === KIND_MOB\) \{[\s\S]{0,600}?if \(!this\.visibleZones\.has\(es\.zone\)\) return;/);
  });

  it("★ 長血條的 bossId 讀的是『現在有沒有王』，不是那顆單槽的最後一則消息", () => {
    cover(TAG);
    const b = body();
    expect(b, "又回去讀 hud.mobBoss 了 —— 任何一隻精英死掉都會把王的血條打掉").not.toMatch(
      /hud\.mobBoss\b(?!Live)/,
    );
    expect(b).toContain("hud.mobBossLive");
    expect(b, "決策又寫回 GameApp 裡了 —— 那裡沒有任何行為測試搆得到").toContain(
      "mobBossMarkerFor(",
    );
  });
});
