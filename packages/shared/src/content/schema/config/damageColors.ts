import { z } from "zod";
import { zId } from "../common";
import { zColorHex } from "./_shared";

/**
 * config.damage-colors@1 — 傷害數字與受擊閃光的**四向配色**
 * (`config/damage-colors.json`).
 *
 * owner 2026-08-01, verbatim:
 *   「真實傷害目前在畫面上看不出來 => 顯示白色傷害數字(紅物理; 紫魔法; 白真實;
 *     綠治療)」
 *
 * Before this doc the client branched on `=== "magic"` in TWO places
 * (`ui/combatText.combatTextStyle` and `render/combatFeedback.flashColorFor`),
 * so 真實傷害 was pixel-identical to 物理傷害 in both the floating number and
 * the victim body flash. The only channel that already told them apart was the
 * impact spark (`vfx/vfxPresets.IMPACT_TINTS`, three-way since task #33) and the
 * hit SFX (`audio/combatSfx`, `hit` / `hitMagic` / `hitTrue`) — which is why the
 * defect reads as 「看不出來」 rather than 「完全沒反應」.
 *
 * ── WHY THIS IS A CONFIG DOC AND NOT FOUR CONSTANTS IN THE RENDERER ──────────
 * The owner has now overruled this exact palette TWICE IN TWO DAYS (2026-07-31
 * 「魔法傷害(AP) 跳出來的數字應該是紫色系」, then this). A hex literal in
 * `apps/client/**` is baked into the image at BUILD time, so each of those two
 * words cost a full rebuild + container restart; `content/` is the live
 * bind-mount, so this doc costs a save. That is CLAUDE.md 第一守則's stated
 * reason, and the seam already exists — `ContentDb.load` pushes gore / stealth /
 * vfx-families / model-lod into the render layer the same way.
 *
 * ── WHY `text` AND `flash` CARRY DIFFERENT VALUES FOR THE SAME SCHOOL ────────
 * They are not the same physical channel and 「白」 is only achievable in one of
 * them. The floating number is DOM text drawn over a hard black ring, so pure
 * white is its most legible possible fill (21:1 against the ring). The victim
 * flash is a Babylon overlay drawn with ALPHA_COMBINE
 * (`out = base·(1−a) + flash·a`), where a white overlay can only push channels
 * UP — measured against the real w3x tints in `config/unit-tints.json` it moves
 * a pale model by ΔRGB 0.03–0.09, i.e. it is INVISIBLE on exactly the models the
 * complaint is about. So the flash's 真實 entry is the palest colour that still
 * moves a pale model (a cyan-white), and `damagePalette.test.ts` measures it.
 * Same AXIS in both channels — three schools, three answers — different values,
 * on purpose, and both are yours to change.
 */
export const zDamageTextAxis = z.enum(["damageType", "relation"]);

/**
 * 哪些飄字算「我被打」,也就是要換外框的那一組 (owner 2026-08-01
 * 「加第二個通道，不動色相 => ok」)。
 *
 * `off` ＝ 這個功能出現之前的行為(全部同一個外框)。
 * `taken` ＝ 只有真的掉血的那個數字換框。
 * `incoming` ＝ 所有「朝我來的」都換框:掉血、被盾吃掉(GUARD)、閃掉(閃避)。
 *
 * 為什麼這是一個欄位而不是寫死: 「閃避」是不是「我被打」在字面上兩邊都說得通
 * (它是朝我來的一擊,但我沒被打到)。`ui/combatText` 自己的檔頭說 dodge
 * 「occupies the same slot in the player's attention」,所以出貨值選 `incoming`;
 * 覺得太吵就切 `taken`,不必改程式。
 */
export const zCombatTextOutlineMode = z.enum(["off", "taken", "incoming"]);

export const zConfigDamageColorsDoc = z
  .object({
    id: zId,
    schema: z.literal("config.damage-colors@1"),
    note: z.string().optional(),
    /**
     * What a DAMAGE number's hue means. `damageType` is owner's ruling and the
     * shipped default; `relation` is the pre-ruling behaviour (hue = 受到/造成,
     * damage school shown only as a violet accent on magic) kept expressible
     * because it is a genuine trade-off, not a bug — see the admin page's note.
     */
    textAxis: zDamageTextAxis,
    /** Floating-number fills. `heal` applies on both axes; the rest only on `damageType`. */
    text: z
      .object({
        physical: zColorHex,
        magic: zColorHex,
        true: zColorHex,
        heal: zColorHex,
      })
      .strict(),
    /** Victim body-flash overlay colours (three schools; heal never flashes a body). */
    flash: z
      .object({
        physical: zColorHex,
        magic: zColorHex,
        true: zColorHex,
      })
      .strict(),
    /**
     * ── 第二個通道:外框 (owner 2026-08-01 「加第二個通道，不動色相 => ok」) ──
     *
     * `textAxis: "damageType"` 的代價是「我打人」與「我被打」同一個色相。這一組
     * 把那個分別放回去,**不動色相**:填色繼續講傷害屬性,外框講「這個數字是誰
     * 的血」。兩個通道互不搶。
     *
     * ⚠️ 這裡調的是**外圈**,不是那圈黑框。硬黑框是 #164「傷害數字看起來是黑色」
     * 留下來的辨識度地板,而且它**沒有餘裕可以換色** —— 實測:黑框對土色地面
     * (#6d6250) 只有 3.51:1,而物理傷害的填色 #FF5900 在同一個地面只有 1.90:1,
     * 也就是說那個地面完全靠黑框撐。把黑框換成任何一個看得出來是紅色的顏色
     * (#5A0000 → 2.45:1)就會掉到 3.0 以下,整個數字在土地上糊掉。
     *
     * 所以外圈是**多畫一層**,畫在黑框後面、比黑框大 `widthMult` 倍:黑框原封不
     * 動(地板還在),外圈提供顏色。`outgoing` 的出貨值就是黑色,而**與黑框同色的
     * 外圈不會被畫出來**(在黑框後面畫一圈黑只是多花畫素),所以「我打人」那一
     * 組的 CSS 和這個功能出現之前一字不差。
     */
    outline: z
      .object({
        /** 哪些飄字算「我被打」。`off` = 這個功能出現之前的行為。 */
        mode: zCombatTextOutlineMode,
        /** 「我打人」(以及所有第三方飄字)的外圈色。出貨黑 = 看不到外圈。 */
        outgoing: zColorHex,
        /** 「我被打」的外圈色。出貨深紅 #5A0000。 */
        incoming: zColorHex,
        /**
         * 外圈半徑 ÷ 黑框半徑。1.9 → 30px 的受傷數字得到一圈約 1.8px 的深紅。
         * 下界 1.1:等於 1 就完全被黑框蓋住,那是第二個關閉開關。
         * 上界 3:黑框 2px × 3 = 6px,再大就不是描邊而是一團色塊了。
         */
        widthMult: z.number().min(1.1).max(3),
      })
      .strict(),
  })
  .strict();
export type DamageTextAxis = z.infer<typeof zDamageTextAxis>;
export type CombatTextOutlineMode = z.infer<typeof zCombatTextOutlineMode>;
export type ConfigDamageColorsDoc = z.infer<typeof zConfigDamageColorsDoc>;

/**
 * 出貨預設 —— `content/config/damage-colors.json` 不存在(舊部署 / 內容掛掉)時,
 * `applyDamageColorsDoc` 回退到的就是這一份。
 *
 * ⚠️ 每一格都要和 `content/config/damage-colors.json` 一字不差 ——
 * `apps/client/src/render/damagePalette.test.ts` 的 drift 斷言在守。
 * 兩份存在的理由不同:JSON 是**出貨值**(操作者會改),這份是**程式的保險絲**。
 *
 * 每一個 hex 都是**量出來的**,不是挑好看的。判準與 `ui/combatText` 檔頭同一套
 * (那是 #164 「傷害數字看起來是黑色」修好之後留下的規則),四個地面取樣自
 * `apps/client/src/ui/combatTextContrast.test.ts`:
 *
 *   text.physical `#FF5900` — 就是 `taken` 原本那一格。從 833 個同時滿足
 *     「每個地面 fill-或-ring ≥ 3.0」「fill 對自己的黑框 ≥ 3.0」「離四個隊伍色
 *     ΔE > 25」的候選裡挑出來最紅的一個(團隊色 ΔE 31.0 / 對黑框 6.68:1 /
 *     最差地面 3.14:1)。純紅 `#FF0000` 在暗土上只有 2.47:1,所以「紅」不等於
 *     `#FF0000`。
 *   text.magic `#B872FF` — 團隊色 ΔE 31.7、對黑框 6.89:1、暗土 fill 3.24:1,
 *     而且離 `dodge` 的薰衣草 `#C9A7FF` ΔE 34.5(場上另一個紫,必須分得開)。
 *     ⚠️ 更深的紫 `#9D4EDD` / `#A855F7` / `#8B5CF6` 全部**過不了暗土**
 *     (2.15 / 2.49 / 2.33),因為黑框在暗土上只有 2.13:1 —— 那個地面是這一格
 *     真正的限制條件,不是團隊色。
 *   text.true `#FFFFFF` — 對黑框 21:1,團隊色 ΔE 73.6。白岩地面 fill 只有
 *     1.19:1,由黑框(17.62:1)扛,這正是「框扛辨識度、色扛語意」的設計。
 *   text.heal `#00FF00` — RO 的 `(0,1,0)`,原本就在表上,團隊色 ΔE 55.5。
 *
 *   flash.* 是**另一條物理**(ALPHA_COMBINE 疊加,不是文字),所以值不同 ——
 *     見 `zConfigDamageColorsDoc` 的檔頭。`#FF2626` / `#FF59E6` 是原本寫死的
 *     `[1,.15,.15]` / `[1,.35,.9]` 的 8-bit 表示(差 <0.002,肉眼不可能分辨);
 *     `#33FFFF` = `[0.2,1,1]` 是新的一格,它在七個真實 w3x tint 上的
 *     ΔRGB 都 > 0.35(白色只有 0.06)。
 *
 *   outline.incoming `#5A0000` — 「我被打」的外圈。同樣是量出來的,但**約束條件
 *     和上面那七格不同**,因為它畫在黑框後面,不必扛地面辨識度(黑框還在原位)。
 *     它要滿足的是三件事:①離黑色夠遠,否則這個通道等於沒加(ΔE 48.1);
 *     ②離四個隊伍色夠遠,否則會被讀成隊伍標示而不是「我被打」(最近 ΔE 45.9,
 *     隊伍紅 #e5483f);③對每一個可能被它包住的填色都 ≥ 4.5:1,否則外圈會和
 *     數字糊在一起 —— 最差的一格是物理 #FF5900 的 4.66:1,其餘 4.80(魔法)/
 *     14.64(真實)/8.12(GUARD 灰)/7.29(閃避薰衣草)。它對物理受擊閃光
 *     #FF2626 也有 3.87:1,所以在數字誕生的那一下閃光上仍然看得見。
 *   outline.outgoing `#000000` — 就是黑框本身的顏色,所以外圈不會被畫出來,
 *     「我打人」的 CSS 與這個功能出現之前逐位元相同。
 *   outline.widthMult `1.9` — 8 個方向的位移是把整個字形往外膨脹,不是點光源,
 *     所以 8 個方向的近似誤差只有 `r × (1 − cos 22.5°) = 0.076 r`(1.9 × 2px
 *     時是 0.29px),不會出現扇貝邊。
 */
export const DEFAULT_DAMAGE_COLORS: ConfigDamageColorsDoc = {
  id: "damage-colors",
  schema: "config.damage-colors@1",
  textAxis: "damageType",
  text: {
    physical: "#FF5900",
    magic: "#B872FF",
    true: "#FFFFFF",
    heal: "#00FF00",
  },
  flash: {
    physical: "#FF2626",
    magic: "#FF59E6",
    true: "#33FFFF",
  },
  outline: {
    mode: "incoming",
    outgoing: "#000000",
    incoming: "#5A0000",
    widthMult: 1.9,
  },
};
