/**
 * valhallaSandboxRules — 英靈殿技能試放空間的**後台可調規則表** (GH#254)。
 *
 * owner 原話：
 *   「英靈殿 多一個施展技能小模擬空間(但人不會移動，鏡頭永遠跟著人)
 *     以及一個生命 10,000 的假人 (生命歸零3秒後自動補滿)」
 *
 * ---------------------------------------------------------------------------
 * 為什麼這一份是獨立檔而不是直接寫進 `schema/config.ts`
 * ---------------------------------------------------------------------------
 * CLAUDE.md 第一守則說一個欄位要同時落在三個地方（`content/config/*.json` /
 * `packages/shared/src/content/schema/config.ts` 的 Zod + DEFAULT_* /
 * `apps/admin/src/*.ts` 的 SHIPPED_* + 欄位 union + 順序 + 標籤 + 分組 +
 * `configFromForm`）。那三個檔是**跨 lane 共用檔**，這一輪同時有別人在改，
 * 直接動會撞車。
 *
 * ⛔ 所以這一份是**欄位定義的來源**，三個落點**還沒接**。整合者要做的事寫在
 * {@link VALHALLA_SANDBOX_ADMIN_FIELDS} 的註解裡：那個陣列已經帶好 key、
 * 出貨值、上下界、標籤與說明文字，照抄進 schema 與 admin 即可。
 * 在那之前，執行時吃的是 {@link DEFAULT_VALHALLA_SANDBOX}，也就是出貨值本身，
 * 所以行為正確、只是**還不能從後台改**。這一點必須誠實地寫在交接裡。
 *
 * ---------------------------------------------------------------------------
 * 每一格都是一個「決策點」，不是一個數字
 * ---------------------------------------------------------------------------
 * CLAUDE.md：「如果我在寫程式時心裡出現『這裡要選 A 還是 B』，那就是一個決策點」。
 * 這個沙盒總共冒出七個那樣的瞬間，七個都在下面變成了一格，預設值一律選 owner
 * 明說的那一側；owner 沒說的，預設值旁邊寫的是**為什麼選這一側**，不是辯護。
 */

/** 一個 tick 是 1/30 秒（`@ggd/shared/constants` 的 TICK_HZ）。 */
export interface ValhallaSandboxRules {
  /** 假人的生命上限。owner 明說 10,000。 */
  readonly dummyHealth: number;
  /** 假人歸零之後幾秒補滿。owner 明說 3 秒。 */
  readonly dummyRespawnSec: number;
  /**
   * 假人站在英雄正前方幾公尺。
   *
   * ⚠️ owner 沒說。3.2 是**近戰打得到、遠程不必走過去**的距離：出貨內容近戰
   * `range` 多半是 1.6，加上兩個 0.6/0.9 半徑之後 `reachTo` 大約 3.1，所以 3.2
   * 讓近戰站著就能揮到，而技能的 `range` 全部都比這個大。放遠一點近戰就會
   * 「什麼都打不到」，而在一個**不能走路**的房間裡那等於功能壞掉。
   */
  readonly dummyDistance: number;
  /**
   * 沙盒要不要套用線上的 combat-env 全域倍率表。
   *
   * ⚠️ owner 沒說。預設 **true**，理由是 #125 那條已經立過的規矩：畫面上出現的
   * 每一個數字都要是**乘完之後**的最終值。試放空間如果用未乘的原始值，玩家在
   * 這裡背下來的傷害/冷卻到了真的比賽會全部對不上 —— 那正是「預覽不可以說謊」。
   * false 那一側留著是為了讓設計者看**內容本身**的裸值。
   */
  readonly applyCombatEnv: boolean;
  /**
   * 「人不會移動」要做到多硬。
   *
   *  · `"anchor"`（出貨值，owner 字面）—— 每一 tick 結束把英雄的座標寫回原點、
   *    速度歸零。**不管是誰想推他**：走位指令、卡住自動接敵、擊退、衝刺，全部
   *    無效。唯一的例外是**跳躍中**（`isAirborne`）—— 跳躍技的拋物線本身就是
   *    要看的特效，落地那一 tick 就會被拉回原點。
   *  · `"input"` —— 只吃掉移動指令，技能造成的位移照走。
   *
   * 為什麼預設是比較硬的那一邊：owner 說的是「人不會移動」，不是「玩家不能走」。
   * 只吃輸入的話，`autoEngage`（卡住就接敵）或任何一發擊退都能把英雄推出鏡頭。
   */
  readonly movementLock: "anchor" | "input";
  /**
   * 進場就把六格技能全部開好（W/E/R 升到 1 級、EX 解鎖）。
   *
   * ⚠️ owner 沒說。預設 **true**：這個房間的名字叫「技能試放空間」，而
   * `spawnChampion` 出來的英雄只有 Q 是 rank 1，其餘三格 rank 0 = `not-learned`，
   * EX 要等比賽的解鎖點。預設 false 的話玩家按 W 只會得到一聲「還沒學」，
   * 六格裡有五格是死的。
   */
  readonly unlockAllSlots: boolean;
  /**
   * 魔力不消耗。
   *
   * ⚠️ owner 沒說。預設 **true**：試放空間是要「一直放」的，而出貨內容的
   * `manaCost` 動輒 200–300、`maxMana` 500 上下，第三發就會變成 `no-mana`，
   * 而那個結果看起來跟「技能壞掉」一模一樣。false = 照真實魔力跑。
   */
  readonly infiniteMana: boolean;
}

/** 出貨值。owner 明說的兩格照抄；其餘五格的理由寫在型別上。 */
export const DEFAULT_VALHALLA_SANDBOX: ValhallaSandboxRules = Object.freeze({
  dummyHealth: 10_000,
  dummyRespawnSec: 3,
  dummyDistance: 3.2,
  applyCombatEnv: true,
  movementLock: "anchor",
  unlockAllSlots: true,
  infiniteMana: true,
});

/**
 * 上下界。**上界不是可選的** —— CLAUDE.md：`validateField` 在 2026-07-29 之前
 * 只檢查 `min`，所以 50 打成 500 會過後台、在下游才被拒或被靜默夾掉。
 */
export const VALHALLA_SANDBOX_BOUNDS = Object.freeze({
  /** 1 = 一下就死的紙人；1,000,000 = 比 #263 的塔還厚，再上去就只是打不完 */
  dummyHealth: { min: 1, max: 1_000_000 },
  /** 0 = 立刻補滿（也是合法的玩法）；60 = 一分鐘，超過就等於沒有復活 */
  dummyRespawnSec: { min: 0, max: 60 },
  /** 0.5 = 貼身；30 = 競技場半徑 24 之外就沒有意義了 */
  dummyDistance: { min: 0.5, max: 30 },
} as const);

/** 夾到界內。**回傳夾過的值**，不是靜默吃掉（#279 的教訓）。 */
export function clampSandboxRules(raw: ValhallaSandboxRules): ValhallaSandboxRules {
  const b = VALHALLA_SANDBOX_BOUNDS;
  const clamp = (v: number, lo: number, hi: number): number =>
    !Number.isFinite(v) ? lo : v < lo ? lo : v > hi ? hi : v;
  return {
    ...raw,
    dummyHealth: clamp(raw.dummyHealth, b.dummyHealth.min, b.dummyHealth.max),
    dummyRespawnSec: clamp(raw.dummyRespawnSec, b.dummyRespawnSec.min, b.dummyRespawnSec.max),
    dummyDistance: clamp(raw.dummyDistance, b.dummyDistance.min, b.dummyDistance.max),
  };
}

/** 一格後台欄位的完整描述 —— key / 型別 / 出貨值 / 上下界 / 標籤 / 它影響什麼。 */
export interface ValhallaSandboxAdminField {
  readonly key: keyof ValhallaSandboxRules;
  readonly kind: "number" | "boolean" | "enum";
  readonly shipped: number | boolean | string;
  readonly min?: number;
  readonly max?: number;
  readonly options?: readonly string[];
  /** 後台顯示的中文標籤 */
  readonly label: string;
  /** 說明文字 —— 寫「它影響什麼」，不是複述欄位名（CLAUDE.md） */
  readonly help: string;
}

/**
 * 整合者要接的東西，一次列完。
 *
 * 這個陣列**不是**後台頁面 —— 它是給 integrator 抄的清單。三個落點：
 *   1. `content/config/valhalla-sandbox.json`（新集合）—— `shipped` 那一欄
 *   2. `packages/shared/src/content/schema/config.ts` —— Zod（`min`/`max` 都要）
 *      + `DEFAULT_VALHALLA_SANDBOX`
 *   3. `apps/admin/src/valhallaSandbox.ts` —— `SHIPPED_*` + 欄位 union + 順序
 *      + 標籤（`label`）+ 分組（建議「英靈殿」）+ `configFromForm`
 *
 * 順序就是這個陣列的順序：owner 明說的兩格在最前面。
 */
export const VALHALLA_SANDBOX_ADMIN_FIELDS: readonly ValhallaSandboxAdminField[] = Object.freeze([
  {
    key: "dummyHealth",
    kind: "number",
    shipped: DEFAULT_VALHALLA_SANDBOX.dummyHealth,
    min: VALHALLA_SANDBOX_BOUNDS.dummyHealth.min,
    max: VALHALLA_SANDBOX_BOUNDS.dummyHealth.max,
    label: "假人生命上限",
    help: "假人被打到 0 才會重生。調低＝一發大招就打穿，看不到後續傷害數字；調高＝可以量一整套連段打掉多少。",
  },
  {
    key: "dummyRespawnSec",
    kind: "number",
    shipped: DEFAULT_VALHALLA_SANDBOX.dummyRespawnSec,
    min: VALHALLA_SANDBOX_BOUNDS.dummyRespawnSec.min,
    max: VALHALLA_SANDBOX_BOUNDS.dummyRespawnSec.max,
    label: "假人補滿等待秒數",
    help: "假人生命歸零之後，過幾秒才把生命補回上限。這段空窗期沒有標靶，範圍技會打不到任何東西。",
  },
  {
    key: "dummyDistance",
    kind: "number",
    shipped: DEFAULT_VALHALLA_SANDBOX.dummyDistance,
    min: VALHALLA_SANDBOX_BOUNDS.dummyDistance.min,
    max: VALHALLA_SANDBOX_BOUNDS.dummyDistance.max,
    label: "假人距離（公尺）",
    help: "假人站在英雄正前方多遠。因為英雄不會移動，這個距離就決定了近戰的普攻打不打得到；放太遠近戰會完全空揮。",
  },
  {
    key: "applyCombatEnv",
    kind: "boolean",
    shipped: DEFAULT_VALHALLA_SANDBOX.applyCombatEnv,
    label: "套用戰鬥系統倍率",
    help: "開＝試放空間顯示的傷害與冷卻和真的比賽一致（戰鬥系統全域倍率表）。關＝顯示內容檔裡的裸值，適合設計者對數值，但會和實戰不同。",
  },
  {
    key: "movementLock",
    kind: "enum",
    shipped: DEFAULT_VALHALLA_SANDBOX.movementLock,
    options: ["anchor", "input"],
    label: "定身方式",
    help: "anchor＝英雄永遠釘在原點（連擊退、衝刺、自動接敵都推不動，跳躍技落地也會被拉回）。input＝只吃掉走位指令，技能造成的位移照走。",
  },
  {
    key: "unlockAllSlots",
    kind: "boolean",
    shipped: DEFAULT_VALHALLA_SANDBOX.unlockAllSlots,
    label: "六格技能全開",
    help: "開＝進場就把 W/E/R 升到 1 級並解鎖 EX，六格都能按。關＝照比賽規則，只有 Q 和天生技能用，其餘會回「還沒學」。",
  },
  {
    key: "infiniteMana",
    kind: "boolean",
    shipped: DEFAULT_VALHALLA_SANDBOX.infiniteMana,
    label: "魔力不消耗",
    help: "開＝魔力每 tick 補滿，可以一直放。關＝照真實魔力消耗，多數英雄放兩三發就會因為魔力不足而按不動。",
  },
]);
