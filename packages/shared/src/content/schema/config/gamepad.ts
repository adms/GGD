import { z } from "zod";

/**
 * ⭐【`config.gamepad@1`】—— **手把手感**（GH#520）。
 *
 * 五個決定「手把摸起來是什麼感覺」的數字，在這一份文件出現之前**全部是
 * `apps/client/src/input/GamepadInput.ts` 的 module-level `export const`** ——
 * 也就是 owner 想把死區調鬆一格，要改程式 + 重建 client 映像 + 重新部署。
 * 而死區太緊／太鬆是每一個手把玩家**第一天**就會抱怨的東西（第一守則）。
 *
 * ⭐ 形狀抄的是同一支檔案已經示範過的那一條：`aimAssistMobPenalty()` 從
 * `config.combat-feel@1` **每次呼叫都重讀**。這裡也一樣 ——
 * `activeGamepadFeel()` 讀 `Configs.tryGet(GAMEPAD_DOC_ID)`，
 * 和 `CameraRig` 讀 `config.camera@1` 同一條路。⇒ 後台存檔、玩家重整一次分頁就生效。
 *
 * ⚠️ **為什麼不是六格** —— `GROUND_CAST_MAX`（原稽核列的第五格）**刻意不在這裡**。
 * GH#512 已經把手把的地面型夾限換成 `padCastReach()`（從技能自己的 `range` ×
 * 出貨 `abilityRange` 推導），所以那個常數對手把**一格都不影響**了；
 * 它今天只剩觸控的拖曳瞄準在用。把它放進「手把手感」會是一格
 * **存了但手把上什麼都不會發生**的欄位（第一·五守則）。觸控那一條要調的話，
 * 它該長在觸控自己的文件上，⛔ 不是借住這一份。
 */
export const GAMEPAD_DOC_ID = "gamepad";

export const zConfigGamepadDoc = z
  .object({
    id: z.literal(GAMEPAD_DOC_ID),
    schema: z.literal("config.gamepad@1"),
    note: z.string().optional(),
    /**
     * **死區** —— 搖桿要推過這個比例（0..1 的徑向長度）才算有推。
     *
     * 調小＝更靈敏，代價是**鬆手之後角色還會自己走**（老舊手把的靜止漂移
     * 量得到 0.05–0.1）。調大＝要推很深才動得了，微調瞄準會整段消失。
     * 上界 0.6 是保險絲：再高的話搖桿一半以上的行程是死的。
     */
    deadzone: z.number().min(0.01).max(0.6),
    /**
     * **移動前導距離** —— 左搖桿把移動指令下在角色前方多遠的那一點。
     *
     * ⚠️ 它不是速度：角色永遠跑自己的移速，這一格決定的是「指令重下的頻率
     * 感覺起來順不順」。太短＝每一幀都在重下很近的點，轉向黏；
     * 太長＝鬆手之後角色還會往前滑一段（放開**不會**停，見檔頭）。
     */
    moveLead: z.number().min(0.5).max(30),
    /** **attack-move 前導距離**（LT）。同上，但那是一條會邊走邊打的路線。 */
    attackMoveLead: z.number().min(0.5).max(30),
    /**
     * **基本攻擊的搜敵半徑**（RT）—— 按下去時往這個半徑內找最近的敵人。
     *
     * ⚠️ 它是**手把幫你挑目標**的範圍，⛔ 不是英雄真的打得到的距離
     * （那是英雄自己的攻擊距離，伺服器判）。調得比英雄射程大很多＝
     * 按 RT 會鎖上一個要先跑過去的人；調太小＝站在射程邊緣按 RT 沒反應。
     */
    basicAttackRange: z.number().min(1).max(60),
    /**
     * **長按門檻（毫秒）** —— 按住 A/B/X/Y 多久算「升級／看說明」。
     *
     * 兩個真實的邊界：戰鬥中一次刻意的重按輕鬆超過 200ms（所以調太低會在
     * 打架時**誤加技能點**，而點數花掉不能退），而超過 ~500ms 玩家已經斷定
     * 「沒反應」放手了。⚠️ 施放**永遠不會被延後** —— 長按同時也放了那一招。
     */
    longPressMs: z.number().min(120).max(2000),

    /**
     * **螢幕小鍵盤**（GH#502）—— 手把焦點停在文字欄且按確認時要不要浮出鍵盤。
     *
     * ⚠️ 這是 owner 說的「支援手把**直接操作到底**」的第一個 blocker:在此之前
     * `PadFocusNav` 對 `<input>` 只做 `click()` —— 焦點進得去、⛔ **一個字元都打不出來**,
     * 於是登入／註冊／改密碼／房名／邀請碼／聊天／搜尋**全部**走不下去。
     * ⛔ 關掉它 = 純手把玩家在**第一個畫面**就卡住,所以預設 true。
     */
    keyboardEnabled: z.boolean(),

    /**
     * **虛擬游標**（GH#502，owner:「類比搖桿可以代替對應滑鼠的功能」）。
     *
     * ⭐ 只在**選單場合**啟用,戰鬥中自動停用 —— 游標式瞄準在動作中太慢
     * (業界一致:Steam Big Picture / Wii U 指標 / Xbox 無障礙指標都是「焦點導覽為主、游標為輔」)。
     */
    cursorEnabled: z.boolean(),

    /** 虛擬游標速度（像素／秒，搖桿推到底時）。低於 ~300 過不了一個 1080p 螢幕。 */
    cursorSpeed: z.number().min(100).max(4000),

    /**
     * 虛擬游標的**加速曲線指數** —— 1 = 線性（近距離難微調），愈大愈「輕推很慢、推到底很快」。
     * 超過 ~3 會讓中段速度塌掉,變成只有「不動」與「飛出去」兩檔。
     */
    cursorAccel: z.number().min(1).max(4),

    /** 切換虛擬游標的按鈕索引（標準 Gamepad 映射；10 = 左搖桿按下 L3）。 */
    cursorToggleButton: z.number().int().min(0).max(19),
  })
  .strict();

export type ConfigGamepadDoc = z.infer<typeof zConfigGamepadDoc>;

/** 去掉 id/schema/note 的殼之後,手把真正讀的那一份。 */
export type GamepadFeelPolicyDoc = Omit<ConfigGamepadDoc, "id" | "schema" | "note">;

/**
 * 出貨預設（＝內容載不到時的保險絲）。
 *
 * ⭐ **五格逐字等於 GH#520 之前那五個 TS 常數**：這一份文件上線的那一天，
 * 手把的手感**一個位元都沒有變**。機制上線，數值一格沒動 ——
 * 於是「後台調得到了」與「手感被我偷偷改掉了」不會混在同一次部署裡。
 *
 * ⚠️ `apps/client/src/input/GamepadInput.ts` 匯出的
 * `GAMEPAD_DEADZONE` / `MOVE_LEAD` / `ATTACK_MOVE_LEAD` / `BASIC_ATTACK_RANGE` /
 * `GAMEPAD_LONG_PRESS_MS` 現在**全部從這一份推導**，⛔ 不再各自寫一個字面值 ——
 * 少了那一步就是第四個住處，而第四個住處一定會過期。
 */
export const DEFAULT_GAMEPAD_FEEL_POLICY: GamepadFeelPolicyDoc = {
  deadzone: 0.15,
  moveLead: 4,
  attackMoveLead: 5,
  basicAttackRange: 12,
  longPressMs: 400,
  // GH#502 —— 兩個開關預設 **on**:它們修的是「純手把走不下去」,⛔ 不是一個口味選項。
  keyboardEnabled: true,
  cursorEnabled: true,
  cursorSpeed: 1100,
  cursorAccel: 1.8,
  cursorToggleButton: 10,
};

/**
 * 文件 → 政策。缺席／壞掉一律回退到出貨預設。
 *
 * ⚠️ 這裡**沒有**「載不到就把手把關掉」這個選項：一份載不到的內容文件是
 * 2026-08-01 骨架事故那一條路，而在那條路上把手把靜靜關掉，會讓「內容全毀」
 * 長得跟「手把壞了」一模一樣 —— 兩個都只會得到一句「我的手把沒反應」。
 */
export function resolveGamepadFeel(
  doc: ConfigGamepadDoc | null | undefined,
): GamepadFeelPolicyDoc {
  if (!doc) return DEFAULT_GAMEPAD_FEEL_POLICY;
  return {
    deadzone: doc.deadzone,
    moveLead: doc.moveLead,
    attackMoveLead: doc.attackMoveLead,
    basicAttackRange: doc.basicAttackRange,
    longPressMs: doc.longPressMs,
    keyboardEnabled: doc.keyboardEnabled,
    cursorEnabled: doc.cursorEnabled,
    cursorSpeed: doc.cursorSpeed,
    cursorAccel: doc.cursorAccel,
    cursorToggleButton: doc.cursorToggleButton,
  };
}
