import { z } from "zod";

export const zConfigWoundsDoc = z
  .object({
    id: z.literal("wounds"),
    schema: z.literal("config.wounds@1"),
    note: z.string().optional(),
    stackMode: z
      .enum(["max", "multiply"])
      .describe(
        "@zh 同時中了兩發重創怎麼算\n" +
        "@note 取最重（出貨值）＝只算打折最兇的那一筆，與「失手率取最大值」一致；相乘＝兩層 0.5 變成 0.25，疊到第三層幾乎等於禁療。引擎自己對「同型效果怎麼疊」沒有一致答案（失手率取最大、護盾相加），所以這一格是留給你決定的，不是一個技術細節。\n" +
        "多筆重創同時在身上時怎麼合成。max = 只算最重的那一筆（與失手率一致，出貨值）；multiply = 相乘，兩層 0.5 變成 0.25，疊到第三層幾乎等於禁療。\n" +
        "@opt max 取最重（出貨值）\n" +
        "@opt multiply 相乘（會疊爆）"
      ),
  })
  .strict()
  // ⭐ 文件層的人話也住這裡（GH#992）：後台那一頁由 `specFromZod()` 整份推導，
  //   ⛔ `apps/admin` 不再有第二份標題／段落／消費端。
  .describe(
    "@title 重創規則\n" +
    "@intro 【重創】= 治療、吸血、自然回復同時打折（owner 2026-08-03：「【減療 / 禁療】=> 用重創代替就好，吸血/治療同時減半」）。\n" +
    "@intro ⚠️ **三格倍率不在這一頁** —— 它們寫在施加重創的那一張卡上（技能／道具的 applyStatus），因為每一支技能的重創本來就該不一樣重。這一頁只管「同時中了兩發重創怎麼算」。\n" +
    "@intro ⚠️ 【禁療】不是第二個機制：它就是三格倍率都填 0 的一份內容文件（content/status-effects/no-heal.json），所以淨化拔得掉它、到期規則也完全一樣。\n" +
    "@intro ⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/wounds.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。\n" +
    "@consumer packages/shared/src/sim/grievousWounds.ts::woundMult（三個讀取點各呼叫一次：combat/restore.ts 的治療、combat/damage.ts 的吸血係數、systems/RegenSystem.ts 的自然回復）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.woundRules\n" +
    "@effect **要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 淨化規則／格擋規則／暴走規則 同一個形態(#278)。",
  );
export type ConfigWoundsDoc = z.infer<typeof zConfigWoundsDoc>;

/** ⚠️ 缺文件 = 這一份，不是空物件（同 `DEFAULT_DISPEL_RULES` 的規矩）。 */
export const SHIPPED_WOUNDS: ConfigWoundsDoc = {
  id: "wounds",
  schema: "config.wounds@1",
  stackMode: "max",
};
