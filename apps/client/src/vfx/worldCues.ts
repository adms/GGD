/**
 * worldCues —— **世界演出**的兩個模板與那一張表的純函式半邊。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 這個檔案存在的理由：⛔ 七個 `case` 是七份會各自腐爛的程式
 * ════════════════════════════════════════════════════════════════════════════
 * 2026-08-23 的窮舉稽核（118 個 `world.emit` 對全部消費端逐欄位比對）留下七筆
 * **同型**的判決 —— 七則事件 sim 都發了、`eventFanout` 白名單都放行了、線路上
 * 真的都送到客戶端了，而 `VfxSystem` 裡**零個消費端**：
 *
 *   `mobSpawn` · `summonSpawn` · `summonDespawn` · `deathWardSpawn` ·
 *   `guardianSleep` · `guardianSpawn` · `damageLine`
 *
 * 這是失敗形態②（算出來了但從沒送到畫面上）—— 而傷害照樣掉血、召喚物照樣站在
 * 場上，所以它看起來**完全正常**。
 *
 * 第零守則⑨逐字：「**N 個同型項目 = K 個模板 + 一張表，⛔ 不是 N 輪**」。
 * ⭐ 這裡的 **K = 2**：
 *
 * | 模板 | 問的問題 | 出貨的列 |
 * |---|---|---|
 * | **點**（`worldCuePoint`） | 「某個東西在**一個座標**出現／消失了」 | 5 |
 * | **線**（`worldCueLine`） | 「某個東西**從 A 掃到 B**」 | 1 |
 *
 * 表住 `content/config/world-cues.json`（第〇·四守則：值在載入時從共用表解析，
 * ⛔ 不烘進程式）。⛔ 這個檔案裡沒有任何一個事件名的 `if` —— 事件名是**表的鍵**，
 * 而分派是一次 `Object.hasOwn`。加第七列不需要動這裡一行。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 座標的兩條來源，順序固定 —— 這是**模板的一部分**，⛔ 不是逐事件的 if
 * ════════════════════════════════════════════════════════════════════════════
 * ① payload 上的 `x` / `z`（六筆裡的五筆）
 * ② payload 只有 `id` 時，從 `entityPos(id)` 解（`guardianSleep` 就是這一種 ——
 *    它的 payload 逐字是 `{ id }`）
 *
 * ⚠️ 兩條都可能給出**非有限**的座標（未插補的實體會回 `{x:NaN,z:NaN}`），
 * 而那正是 #131 的形狀：一團白熱的爆發被 GPU 夾到螢幕角落並且每次都重放。
 * 所以這裡回 `null`，⛔ 不回一個「安全的」`{0,0}`。
 */
import {
  Configs,
  DEFAULT_WORLD_CUES,
  type ConfigWorldCuesDoc,
  type WorldLineCue,
  type WorldPointCue,
} from "@ggd/shared/content";

export { DEFAULT_WORLD_CUES };
export type { ConfigWorldCuesDoc, WorldPointCue, WorldLineCue };

/** 一個平面座標。 */
export interface CuePos {
  x: number;
  z: number;
}

// ─────────────────────────────────────────────────────────── 豁免表 ─────────

/**
 * ⛔ **接上去是錯的**那幾則 —— 每一列都要寫得出一個**能被反駁**的理由。
 *
 * ⚠️ 「還沒收」⛔ 不是理由。判準是：**這個事件接上去，玩家會看到什麼？**
 * 答案是「已經有別的東西在畫它」或「那一刻沒有人在看」時，再放一個演出就是
 * 重複 —— 而重複的演出會與真正要看的那一拍搶畫面預算。
 *
 * ⭐ 閘：`performanceEventsHaveConsumers.test.ts`。一則過線的事件要嘛有消費端、
 * 要嘛在這裡帶著理由，⛔ 兩者皆非就紅。
 */
export const WORLD_CUE_EXEMPTIONS: Readonly<Record<string, string>> = {
  guardianSpawn:
    "守護者是**回合開場就存在**的中立雕像（`GuardianSystem` 在建場時 spawn，⛔ 不是戰鬥中降臨）。" +
    "它的身體下一個快照就會出現並由 `views` 畫出來，所以「出現」這件事本身已經有人在畫。" +
    "⇒ 在**沒有人在看的那一刻**（開場讀秒、鏡頭還在飛）放一團煙，玩家看不到，而它會跟開場演出搶畫面預算。" +
    "⭐ 玩家真正需要看到的那一拍是**甦醒**（`guardianWake`），而那一則今天就有消費端（`VfxSystem`）。" +
    "⚠️ **它什麼時候該失效**：守護者哪天改成回合中途才降臨（例如第 N 回合刷新、或被某支技能召喚出來），" +
    "這條理由當場作廢 —— 那時它就變成一次玩家在看的出現，要接進 `point` 表。",
};

/**
 * ⭐ **2026-08-23 的普查**：`FANNED_OUT_EVENT_TYPES` 上**客戶端零引用**的事件，
 * 這一版沒有納入本次稽核範圍的那幾則。
 *
 * ⚠️ 這**不是**在說它們沒問題 —— 是在說**這條閘不替它們作答**。本次稽核的範圍是
 * **世界演出**（一個座標上的一次性視覺），而下面這幾則的消費端不在視覺層：
 * 它們是商店／HUD／狀態列的資料事件，或屬於別條 lane 的稽核結果。
 *
 * ⭐ 它為什麼仍然是一張**凍結的名單**而不是一句話：名單釘死了「那一天有幾則」。
 * 第 19 則零消費端的事件出現時，`performanceEventsHaveConsumers.test.ts` 會紅，
 * 而修法是**做一個選擇**（接進表、或寫一列豁免），⛔ 不是把名字加進這裡。
 */
export const WORLD_CUE_OUT_OF_SCOPE: readonly string[] = [
  // 07-00 獸化心靈那一族「屬性被永久／暫時改寫」的成對事件 —— 面板數字，⛔ 不是世界演出。
  "attrGrant",
  "attrGrantEnd",
  // 41-002 絕對屏障那一族「這一擊被拒絕了」—— 需要的是打擊點的回饋 + 文字，屬於打擊層。
  "immuneControl",
  "immunityGranted",
  // 商店（買／賣／撤銷／被拒）—— HUD 事件，消費端在 `ui/`。
  "itemBought",
  "itemSold",
  "shopUndone",
  // 位移起跳 —— 高度騎在快照上（`EntityState.h` + AIRBORNE），弧本來就畫得出來；
  // 這一則要的是**起跳那一 tick 的音效**，那是音效層（lane D）的題目。
  "leapStart",
  // 標記安裝衝突 —— 一則「你的操作沒生效」的回話，屬於介面提示層。
  "markInstallConflict",
  // 復活圈結束 —— 圈本身是實體；結束那一拍要不要演出是 #84 那條線的題目。
  "reviveCircleEnd",
  // 被暈眩 —— 狀態層（狀態光環／HUD 圖示），⛔ 不是一個座標上的爆發。
  "stunApplied",
];

// ───────────────────────────────────────────────────── 表的讀取（逐格降級）──

function num(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function readPoint(raw: unknown, d: WorldPointCue): WorldPointCue {
  const c = (raw ?? {}) as Partial<WorldPointCue>;
  return {
    enabled: bool(c.enabled, d.enabled),
    heavy: bool(c.heavy, d.heavy),
    heightY: num(c.heightY, 0, 4, d.heightY),
    tintR: num(c.tintR, 0, 1, d.tintR),
    tintG: num(c.tintG, 0, 1, d.tintG),
    tintB: num(c.tintB, 0, 1, d.tintB),
  };
}

function readLine(raw: unknown, d: WorldLineCue): WorldLineCue {
  const c = (raw ?? {}) as Partial<WorldLineCue>;
  return {
    enabled: bool(c.enabled, d.enabled),
    power: num(c.power, 0.4, 2, d.power),
    lifeMs: Math.round(num(c.lifeMs, 40, 2000, d.lifeMs)),
    heightY: num(c.heightY, 0, 4, d.heightY),
    tintR: num(c.tintR, 0, 1, d.tintR),
    tintG: num(c.tintG, 0, 1, d.tintG),
    tintB: num(c.tintB, 0, 1, d.tintB),
  };
}

/**
 * 把任意輸入解讀成一份表。**逐格**降級（⛔ 不是整份二選一）—— 一份被截斷的
 * override（後台存了一半、或舊版本缺了新欄位）有正確的 `schema` 而少幾格，
 * 整份丟掉會連 owner 存過的那幾格一起丟掉。
 *
 * ⭐ **走訪的是出貨預設的鍵**，⛔ 不是輸入的鍵：一份 override 憑空多出一個
 * `"someTypo"` 不會變成一則沒有人認得的演出，而少一列會拿回出貨值。
 *
 * ⚠️ 每一格在這裡就夾回 schema 的上下界：`Configs.tryGet` 走的是**寬鬆**路徑
 * （沒有跑 Zod），所以一個界外的數字有可能走到這裡。
 */
export function readWorldCues(doc: unknown): ConfigWorldCuesDoc {
  const d = doc as Partial<ConfigWorldCuesDoc> | null | undefined;
  const D = DEFAULT_WORLD_CUES;
  if (!d || typeof d !== "object" || d.schema !== "config.world-cues@1") return D;
  const p = (d.point ?? {}) as Record<string, unknown>;
  const l = (d.line ?? {}) as Record<string, unknown>;
  const point = {} as ConfigWorldCuesDoc["point"];
  for (const key of Object.keys(D.point) as (keyof ConfigWorldCuesDoc["point"])[]) {
    point[key] = readPoint(p[key], D.point[key]);
  }
  const line = {} as ConfigWorldCuesDoc["line"];
  for (const key of Object.keys(D.line) as (keyof ConfigWorldCuesDoc["line"])[]) {
    line[key] = readLine(l[key], D.line[key]);
  }
  return {
    id: D.id,
    schema: "config.world-cues@1",
    zoneIsolation: typeof d.zoneIsolation === "boolean" ? d.zoneIsolation : (D.zoneIsolation ?? true),
    point,
    line,
  };
}

/**
 * 現在生效的表。`read` 是測試／audition 頁的接縫；出貨路徑走
 * `Configs.tryGet("world-cues")`，也就是後台存檔之後**玩家下一次重新整理**
 * 就生效（客戶端開機時載內容覆蓋層）。
 */
export function worldCues(
  read: () => unknown = () => Configs.tryGet("world-cues"),
): ConfigWorldCuesDoc {
  return readWorldCues(read());
}

// ─────────────────────────────────────────────────────────── 兩個模板 ───────

/** 這一則要畫成什麼（點）。 */
export interface ResolvedPointCue {
  at: CuePos;
  /** `layeredPop` 的強度檔 —— 兩檔，⛔ 沒有 `ex`（那是死亡與 EX 施法的亮度）。 */
  intensity: "light" | "heavy";
  tint: [number, number, number];
  heightY: number;
}

/** 這一則要畫成什麼（線）。 */
export interface ResolvedLineCue {
  from: CuePos;
  to: CuePos;
  tint: [number, number, number];
  power: number;
  lifeMs: number;
  heightY: number;
}

function finite(p: { x?: unknown; z?: unknown } | null | undefined): CuePos | null {
  if (!p) return null;
  const { x, z } = p as { x: unknown; z: unknown };
  if (typeof x !== "number" || typeof z !== "number") return null;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { x, z };
}

/**
 * 事件 payload → 一個座標。**兩條來源，順序固定**（見檔頭）。
 *
 * ⛔ 非有限座標回 `null` 而不是一個「安全的」原點：#131 的教訓是一個被夾到螢幕
 * 角落的持久白光，而它每次都重放。
 */
export function cuePosOf(
  data: Record<string, unknown>,
  entityPos: (id: number) => CuePos | null,
): CuePos | null {
  const direct = finite(data as { x?: unknown; z?: unknown });
  if (direct) return direct;
  const id = data.id;
  return typeof id === "number" ? finite(entityPos(id)) : null;
}

/**
 * **模板①（點）** —— 表裡有這一則嗎？有而且開著、而且解得出座標嗎？
 * 三者皆是才回一份「要畫什麼」，否則回 `null`。
 *
 * ⛔ 這支函式裡沒有任何一個事件名。
 */
export function worldCuePoint(
  cues: ConfigWorldCuesDoc,
  type: string,
  data: Record<string, unknown>,
  entityPos: (id: number) => CuePos | null,
): ResolvedPointCue | null {
  const row = (cues.point as Record<string, WorldPointCue | undefined>)[type];
  if (!row || !row.enabled) return null;
  const at = cuePosOf(data, entityPos);
  if (!at) return null;
  return {
    at,
    intensity: row.heavy ? "heavy" : "light",
    tint: [row.tintR, row.tintG, row.tintB],
    heightY: row.heightY,
  };
}

/**
 * **模板②（線）** —— 同上，只是它有**兩端**：payload 的 `x/z` → `x2/z2`。
 *
 * ⭐ 兩端照抄 sim 解算完的那一條，⛔ 不從施法者面向重算（施法者在事件到達之前
 * 已經轉身了，而玩家要看到的是**真的被判定到**的那一條）。
 */
export function worldCueLine(
  cues: ConfigWorldCuesDoc,
  type: string,
  data: Record<string, unknown>,
): ResolvedLineCue | null {
  const row = (cues.line as Record<string, WorldLineCue | undefined>)[type];
  if (!row || !row.enabled) return null;
  const from = finite(data as { x?: unknown; z?: unknown });
  const to = finite({ x: data.x2, z: data.z2 });
  if (!from || !to) return null;
  return {
    from,
    to,
    tint: [row.tintR, row.tintG, row.tintB],
    power: row.power,
    lifeMs: row.lifeMs,
    heightY: row.heightY,
  };
}

/** 表上所有事件名（點 + 線）。守衛與 `VfxSystem` 都從這裡拿，⛔ 不重打一次。 */
export function worldCueEventNames(cues: ConfigWorldCuesDoc = DEFAULT_WORLD_CUES): string[] {
  return [...Object.keys(cues.point), ...Object.keys(cues.line)];
}

/**
 * K3 GH#638 的總開關 —— 後台「世界演出」的「跨場地演出隔離」那一格。
 * true（出貨）＝歸得了戶的演出按 zone 過濾；false ＝ 一鍵 rollback 到 #638 之前
 * （跨 zone 演出全部放行）。缺格／讀不到內容 ＝ true（跟著出貨預設走）。
 */
export function zoneCueIsolationOn(
  read: () => unknown = () => Configs.tryGet("world-cues"),
): boolean {
  const d = read() as { zoneIsolation?: unknown } | null | undefined;
  return typeof d?.zoneIsolation === "boolean" ? d.zoneIsolation : true;
}
