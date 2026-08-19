// adversarial probe — 一個「加了檔卻沒接線」的 kind
import { z } from "zod";
export const zZzprobe = z.object({ kind: z.literal("zzprobe") });
