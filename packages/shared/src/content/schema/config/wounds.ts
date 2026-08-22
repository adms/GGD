import { z } from "zod";

export const zConfigWoundsDoc = z
  .object({
    id: z.literal("wounds"),
    schema: z.literal("config.wounds@1"),
    note: z.string().optional(),
    stackMode: z
      .enum(["max", "multiply"])
      .describe(
        "多筆重創同時在身上時怎麼合成。max = 只算最重的那一筆（與失手率一致，出貨值）；" +
          "multiply = 相乘，兩層 0.5 變成 0.25，疊到第三層幾乎等於禁療。",
      ),
  })
  .strict();
export type ConfigWoundsDoc = z.infer<typeof zConfigWoundsDoc>;

/** ⚠️ 缺文件 = 這一份，不是空物件（同 `DEFAULT_DISPEL_RULES` 的規矩）。 */
export const SHIPPED_WOUNDS: ConfigWoundsDoc = {
  id: "wounds",
  schema: "config.wounds@1",
  stackMode: "max",
};
