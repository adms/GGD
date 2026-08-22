import { z } from "zod";
import { zId } from "../common";

/** 突變驗證用的假 config —— 刻意**不**掛進 union。 */
export const zConfigMutantProbeDoc = z
  .object({
    id: zId,
    schema: z.literal("config.mutant-probe@1"),
    enabled: z.boolean(),
  })
  .strict();
