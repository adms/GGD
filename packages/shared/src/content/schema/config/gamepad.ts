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
    deadzone: z.number().min(0.01).max(0.6).describe(
      "@zh 搖桿死區\n" +
      "@note 搖桿要推過這個比例（0..1 的徑向長度）才算「有推」。出貨 {{出貨值}}。調小＝更靈敏，代價是**鬆手之後角色還會自己走** —— 老舊手把的靜止漂移量得到 0.05–0.1，死區低於它就等於角色一直被輕輕推著。調大＝要推很深才動得了，微調瞄準那一段行程會整個消失。⚠️ 兩根搖桿共用這一格（移動與瞄準），⛔ 沒有分開的兩格。",
    ),
    /**
     * **移動前導距離** —— 左搖桿把移動指令下在角色前方多遠的那一點。
     *
     * ⚠️ 它不是速度：角色永遠跑自己的移速，這一格決定的是「指令重下的頻率
     * 感覺起來順不順」。太短＝每一幀都在重下很近的點，轉向黏；
     * 太長＝鬆手之後角色還會往前滑一段（放開**不會**停，見檔頭）。
     */
    moveLead: z.number().min(0.5).max(30).describe(
      "@zh 移動前導距離\n" +
      "@note 左搖桿把移動指令下在角色**前方多遠**的那一點（世界單位）。⚠️ 它**不是速度** —— 角色永遠跑自己的移速，這一格決定的是指令重下的節奏感。調太小＝每一幀都在重下一個很近的點，轉向會黏；調太大＝**鬆手之後角色還會往前滑一段**（手把刻意跟滑鼠一樣：放開不等於停，最後那個點會走完）。",
    ),
    /** **attack-move 前導距離**（LT）。同上，但那是一條會邊走邊打的路線。 */
    attackMoveLead: z.number().min(0.5).max(30).describe(
      "@zh attack-move 前導距離\n" +
      "@note LT（攻擊移動）把指令下在前方多遠。同上，差別是那是一條**會邊走邊打**的路線，所以它通常比純移動前導再遠一點點 —— 走得太短會讓角色一直停下來重新找目標。⛔ 這一格不影響普通移動。",
    ),
    /**
     * **基本攻擊的搜敵半徑**（RT）—— 按下去時往這個半徑內找最近的敵人。
     *
     * ⚠️ 它是**手把幫你挑目標**的範圍，⛔ 不是英雄真的打得到的距離
     * （那是英雄自己的攻擊距離，伺服器判）。調得比英雄射程大很多＝
     * 按 RT 會鎖上一個要先跑過去的人；調太小＝站在射程邊緣按 RT 沒反應。
     */
    basicAttackRange: z.number().min(1).max(60).describe(
      "@zh 基本攻擊搜敵半徑\n" +
      "@note 按 RT 時往這個半徑內找最近的敵人。⚠️ 它是**手把幫你挑目標**的範圍，⛔ 不是英雄真的打得到的距離（那是英雄自己的攻擊距離，由伺服器判）。調得比英雄射程大很多＝按 RT 會鎖上一個**要先跑過去**的人；調太小＝站在射程邊緣按 RT 完全沒反應。",
    ),
    /**
     * **長按門檻（毫秒）** —— 按住 A/B/X/Y 多久算「升級／看說明」。
     *
     * 兩個真實的邊界：戰鬥中一次刻意的重按輕鬆超過 200ms（所以調太低會在
     * 打架時**誤加技能點**，而點數花掉不能退），而超過 ~500ms 玩家已經斷定
     * 「沒反應」放手了。⚠️ 施放**永遠不會被延後** —— 長按同時也放了那一招。
     */
    longPressMs: z.number().min(120).max(2000).describe(
      "@zh 長按門檻（毫秒）\n" +
      "@note 按住 A/B/X/Y 多久算「升級這一格技能」（沒有技能點時則是「顯示說明」）。出貨 {{出貨值}}，落在兩個真實的邊界之間：戰鬥中一次刻意的重按輕鬆超過 200，**調得比它低會在打架時誤加技能點**（而點數花掉不能退）；超過 500 左右玩家已經斷定「沒反應」而放手。⚠️ 施放**永遠不會被延後** —— 長按的同時那一招已經放出去了，這一格只決定「多久之後**額外**觸發升級／說明」。",
    ),

    /**
     * **螢幕小鍵盤**（GH#502）—— 手把焦點停在文字欄且按確認時要不要浮出鍵盤。
     *
     * ⚠️ 這是 owner 說的「支援手把**直接操作到底**」的第一個 blocker:在此之前
     * `PadFocusNav` 對 `<input>` 只做 `click()` —— 焦點進得去、⛔ **一個字元都打不出來**,
     * 於是登入／註冊／改密碼／房名／邀請碼／聊天／搜尋**全部**走不下去。
     * ⛔ 關掉它 = 純手把玩家在**第一個畫面**就卡住,所以預設 true。
     */
    keyboardEnabled: z.boolean().describe(
      "@zh 螢幕小鍵盤\n" +
      "@note 手把焦點停在文字欄、按下確認鍵時，要不要浮出小鍵盤。出貨 {{出貨值}}。⚠️ **這一格修的是「純手把玩家在第一個畫面就走不下去」**：在 GH#502 之前，焦點導覽對 `<input>` 只做 click() —— 焦點進得去、**一個字元都打不出來**，於是登入／註冊／改密碼／房名／邀請碼／聊天／搜尋全部是死路。⛔ 關掉它等於把那七條路一起關掉，所以它是**修復**不是口味選項。⚠️ 小鍵盤只吃英數與符號，中文輸入仍要實體鍵盤。",
    ),

    /**
     * **虛擬游標**（GH#502，owner:「類比搖桿可以代替對應滑鼠的功能」）。
     *
     * ⭐ 只在**選單場合**啟用,戰鬥中自動停用 —— 游標式瞄準在動作中太慢
     * (業界一致:Steam Big Picture / Wii U 指標 / Xbox 無障礙指標都是「焦點導覽為主、游標為輔」)。
     */
    cursorEnabled: z.boolean().describe(
      "@zh 虛擬游標（選單）\n" +
      "@note 左搖桿在**選單與面板**裡當滑鼠用（owner：「類比搖桿可以代替對應滑鼠的功能」）。出貨 {{出貨值}}。⭐ 它是焦點導覽的**退路**，⛔ 不是取代它 —— 有些控制項（自由排版的清單、地圖、拖曳把手）不可能全部收進焦點集合，游標是那些地方唯一的出路。⚠️ **戰鬥中一律停用**，⛔ 不受這一格影響：拿游標去點地板在動作中太慢，戰鬥走的是直接操控＋軟鎖定（Steam Big Picture／Wii U 指標／Xbox 無障礙指標三家的結論都一樣：焦點導覽為主、游標為輔）。",
    ),

    /** 虛擬游標速度（像素／秒，搖桿推到底時）。低於 ~300 過不了一個 1080p 螢幕。 */
    cursorSpeed: z.number().min(100).max(4000).describe(
      "@zh 虛擬游標速度\n" +
      "@note 搖桿推到底時游標每秒移動幾個像素。出貨 {{出貨值}}。低於 ~300 在 1080p 上橫越螢幕要三秒以上，玩家會直接放棄改用鍵盤；高於 ~2500 就變成「輕輕一碰就飛過目標」，按鈕再也對不準。⚠️ 這一格與死區互相影響：死區調大之後有效行程變短，同樣的速度會顯得更跳。",
    ),

    /**
     * 虛擬游標的**加速曲線指數** —— 1 = 線性（近距離難微調），愈大愈「輕推很慢、推到底很快」。
     * 超過 ~3 會讓中段速度塌掉,變成只有「不動」與「飛出去」兩檔。
     */
    cursorAccel: z.number().min(1).max(4).describe(
      "@zh 虛擬游標加速曲線\n" +
      "@note 搖桿推的深度 → 速度的**指數**。出貨 {{出貨值}}。1 = 線性（近距離微調很難，因為輕推也有可觀速度）；愈大愈「輕推很慢、推到底才快」，微調變容易。⚠️ 超過 3 左右中段速度會塌掉 —— 實際上只剩「幾乎不動」與「衝出去」兩檔，中間那段可用行程消失。",
    ),

    /** 切換虛擬游標的按鈕索引（標準 Gamepad 映射；10 = 左搖桿按下 L3）。 */
    cursorToggleButton: z.number().int().min(0).max(19).describe(
      "@zh 游標切換鍵\n" +
      "@note 按哪一顆按鈕開關虛擬游標（標準 Gamepad 映射的按鈕索引）。出貨 {{出貨值}} ＝ **L3（左搖桿按下）**。⚠️ 改這一格之前先確認那顆鍵在選單裡沒有別的用途 —— 撞到的話玩家會在按那顆鍵時同時觸發兩件事，而且**畫面上不會有任何錯誤**。⚠️ 說明卡（ControlLegend）會跟著這一格顯示，⛔ 不要改成一顆沒有標示的鍵。",
    ),
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
