/**
 * ⭐【每次進到房間應該是乾淨的開始】GH#585 · GH#586
 *
 * > owner 2026-08-23：「所以離開 到 進練習模式 也是有問題 沒清理乾淨 因為這都是
 * >  **獨立該檢查清乾淨的地方** 不管是**出口**還是**入口**還是**每回合進商店前**」
 *
 * ── ⚠️ 為什麼既有守衛全綠 ──────────────────────────────────────────────────
 * `castFeedback.test.ts:49` 與 `castAnnounce.test.ts:182` 都在 `beforeEach` 裡
 * 叫 `resetCastFeedback()` —— ⭐ **測試自己替出貨程式做了那件出貨程式不做的事**，
 * 於是模組層的髒狀態在測試裡永遠不存在。
 * `input/abilityRangeGuideWiring.test.ts` 驗「按下去會亮、放開會滅」，
 * ⭐ 它在同一個 `it()` 裡自己把狀態按回去 ⇒「跨越一次卸載」這條路從沒被走過。
 *
 * ── 突變紀錄（實跑）────────────────────────────────────────────────────────
 * 見 `net/roomLifecycleTeardown.test.ts` 檔頭（這一批的承重突變做在 GH#592）。
 * 這一支的突變點：`clientGlobals.ts` 拿掉 `cancelHoverGuide()` ⇒ 第三段紅。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { resetClientGlobals } from "./clientGlobals";
import { getCastNotice, pushCastNotice, CAST_NOTICE_TTL_MS } from "./ui/castFeedback";
import { getHeldAimSlot, setHeldAbility } from "./ui/abilityHold";
import { hoverGuideEnter, ABILITY_RANGE_GUIDE } from "./ui/abilityRangeGuide";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  resetClientGlobals();
});

describe("進到房間是乾淨的開始 (client-globals-boundary-585)", () => {
  it("★ 離場之後，提示、按住的技能格、還沒開火的 hover 計時器全部歸零", () => {
    cover("client-globals-boundary-585");

    // ① GH#585 —— 上一間房那句提示。⚠️ TTL 計時器住在 `CastNotice.tsx` 的
    //    useEffect 裡，卸載時 cleanup 是 clearTimeout ⇒ 卸載＝**取消計時器**，
    //    ⛔ 不是清掉那句話 ⇒ 沒有這一支就永遠沒有人清它。
    pushCastNotice({ slot: "Q", abilityName: "", text: "魔力不足", sfx: null, secondsLeft: 0, seq: 1 });
    vi.advanceTimersByTime(CAST_NOTICE_TTL_MS + 200); // 連 TTL 都過了它還在
    expect(getCastNotice(), "TTL 過了它還在 —— 因為清它的人被卸載了").not.toBeNull();
    resetClientGlobals();
    expect(getCastNotice()).toBeNull();

    // ② GH#586 —— 按住的那一格（`GameApp` 每幀讀它來畫地板上的施法距離圈）。
    //    ⚠️ `clearHeldAbility(slot)` 只清得掉同一格 ⇒ 玩家不去 hover 那一格
    //    它就不會自己消失。
    setHeldAbility("Q");
    resetClientGlobals();
    expect(getHeldAimSlot()).toBeNull();

    // ③ GH#586 的第二條 —— **還沒開火**的 hover 計時器。React 卸載時 ⛔ 不發
    //    `pointerleave`，所以離場之後那顆計時器照樣會把 `held` 設起來：
    //    ⭐ 清乾淨之後**又被弄髒**，而沒有任何人按過任何按鈕。
    hoverGuideEnter("W");
    resetClientGlobals(); // ＝離場（⛔ 沒有 pointerleave）
    vi.advanceTimersByTime(ABILITY_RANGE_GUIDE.hoverDelayMs * 2 + 50);
    expect(
      getHeldAimSlot(),
      "離場之後 hover 計時器才開火 = 新房間地板上憑空亮著上一場那支技能的範圍圈",
    ).toBeNull();
  });
});
