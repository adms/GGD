/**
 * 把一個**手把操作方案**（`config.controller-scheme@1`）翻成派送查表（GH#863）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 為什麼要有這一層
 * ─────────────────────────────────────────────────────────────────────────────
 * 在此之前 `GamepadInput.ts` 有**兩張手寫表**（`SLOT_BY_BUTTON` 與
 * `RANK_BY_LONG_PRESS`）加上一串 `else if (b === BTN.LT)`。owner 2026-08-28 要
 * 「v4 後台可切換的其中一種手把操作版本」⇒ 那些位置必須是**資料**。
 *
 * ⛔ 而且這一層**拿不到方案的名字** —— 它只吃解析後的物件。
 * ⇒ 結構上寫不出 `if (scheme === "v4")`（第〇·五守則）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐⭐ 長按升級表是**推導**的，⛔ 不是第二張手寫表
 * ─────────────────────────────────────────────────────────────────────────────
 * 出貨的 `RANK_BY_LONG_PRESS` 把 A/B/X/Y 寫死成 Q/W/E/R。v4 把 B 與 X/Y 換了位置
 * ⇒ 那張表會**靜默錯位**（長按 B 加點加到 W，而 B 現在是 R）——
 * ⚠️ 而畫面上完全看得過去：確實有一格技能升了，只是不是你按的那一格。
 * ⇒ 這裡從 `slotByButton` 推導它，⛔ 兩張表不可能再分岔。
 */
import { isCoreAbilitySlot, type CastableSlot, type CoreAbilitySlot } from "@ggd/shared/sim/intents";
import type {
  ControllerAction,
  ControllerButton,
  ControllerSchemeEntry,
} from "@ggd/shared/content";
import { BTN } from "./GamepadInput";

/**
 * 方案裡的按鍵名 → 這個 repo 的按鍵索引。⭐ 唯一一處把兩套名字接起來的地方。
 *
 * ⚠️ **刻意是函式，⛔ 不是模組頂層的常數**：`GamepadInput` 會 import 這個檔，
 * 而這個檔要 `BTN` ⇒ 循環。頂層常數在循環解析順序不利時會撞 TDZ
 * （`BTN` 還是 undefined），而症狀是**每一顆鍵都不見了**、⛔ 不是一個錯誤。
 * 放進函式體 ⇒ 它在第一次呼叫時才讀，那時兩個模組都初始化完了。
 */
function indexByName(): Record<ControllerButton, number> {
  return {
    A: BTN.A,
    B: BTN.B,
    X: BTN.X,
    Y: BTN.Y,
    LB: BTN.LB,
    RB: BTN.RB,
    LT: BTN.LT,
    RT: BTN.RT,
    L3: BTN.L3,
    R3: BTN.R3,
  };
}

export interface PadActionTable {
  /** 按鍵索引 → 語意動作。⛔ 沒有列出來的鍵（BACK/START/十字鍵）不歸方案管。 */
  readonly actionByButton: ReadonlyMap<number, ControllerAction>;
  /** 按鍵索引 → 可施放槽位（六格技能）。 */
  readonly slotByButton: ReadonlyMap<number, CastableSlot>;
  /** ⭐ **從 `slotByButton` 推導**：只有四個可加點的槽位進得來。 */
  readonly rankByLongPress: ReadonlyMap<number, CoreAbilitySlot>;
  /** 哪一顆是「玩家專注」。null = 這一版沒有這個功能（v3）。 */
  readonly pvpFocusButton: number | null;
  /** 哪一顆是 attack-move。null = 這一版沒有（v4 把 LT 給了玩家專注）。 */
  readonly attackMoveButton: number | null;
  /** 哪一顆是手動普攻。 */
  readonly basicAttackButton: number | null;
}

const ABILITY_PREFIX = "ability:";

/**
 * ⚠️ **純函式，⛔ 不快取。** 一個方案物件在一場比賽裡不會變（它是載入時解析的），
 * 呼叫端自己記住結果就好；在這裡放一個 module-level 快取會讓測試互相污染，
 * 而那種污染的症狀是「單獨跑綠、一起跑紅」。
 */
export function padActionTable(scheme: ControllerSchemeEntry): PadActionTable {
  const actionByButton = new Map<number, ControllerAction>();
  const slotByButton = new Map<number, CastableSlot>();
  const rankByLongPress = new Map<number, CoreAbilitySlot>();
  let pvpFocusButton: number | null = null;
  let attackMoveButton: number | null = null;
  let basicAttackButton: number | null = null;

  const idxByName = indexByName();
  for (const [name, action] of Object.entries(scheme.bindings) as [
    ControllerButton,
    ControllerAction,
  ][]) {
    const idx = idxByName[name];
    if (idx === undefined || action === "none") continue;
    actionByButton.set(idx, action);
    if (action.startsWith(ABILITY_PREFIX)) {
      const slot = action.slice(ABILITY_PREFIX.length) as CastableSlot;
      slotByButton.set(idx, slot);
      // ⭐ 推導,⛔ 不是第二張表:EX 與天生技沒有可以加的階,長按它們一律落到說明。
      if (isCoreAbilitySlot(slot)) rankByLongPress.set(idx, slot);
    } else if (action === "pvpFocus") pvpFocusButton = idx;
    else if (action === "attackMove") attackMoveButton = idx;
    else if (action === "basicAttack") basicAttackButton = idx;
  }

  return {
    actionByButton,
    slotByButton,
    rankByLongPress,
    pvpFocusButton,
    attackMoveButton,
    basicAttackButton,
  };
}
