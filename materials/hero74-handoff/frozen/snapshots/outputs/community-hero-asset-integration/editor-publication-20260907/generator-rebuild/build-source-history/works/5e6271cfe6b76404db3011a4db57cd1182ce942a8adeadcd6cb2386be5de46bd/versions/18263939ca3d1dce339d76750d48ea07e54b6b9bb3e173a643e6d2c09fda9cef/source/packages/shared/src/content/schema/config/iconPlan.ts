import { z } from "zod";
import { zId } from "../common";

/**
 * config.icon-plan@1 — WHICH content entries get a generated icon
 * (`config/icon-plan.json`, task #72), written by
 * `tools/icon-gen/src/plan.py --write` and read by the codex's broken-data
 * table and the 圖示覆蓋率 bar.
 *
 * PURELY DESCRIPTIVE. Nothing in the sim, the client renderer or the platform
 * reads it: it explains a gap, it never creates one. An entry the plan calls
 * "dropped" still ships, still appears in the codex, still works in a match —
 * the only consequence is that the paid image batch skips it.
 *
 * IT LIVES HERE, IN A SCHEMA-VALIDATED COLLECTION, ON PURPOSE. An unregistered
 * doc under `content/config/` loads fine until someone runs `content:build`,
 * which indexes every .json in the directory — and then the ContentLoader
 * throws on the unknown discriminator and the whole content load fails. Adding
 * the union member is the cost of putting a file here; the alternative is
 * `content/assets/`, which is served verbatim and validated by nobody.
 *
 * The rule keys (`recipe-book`, `third-party-ip`, …) are DATA, not schema: the
 * planner adds and retires rules as content changes, and a schema that
 * enumerated them would have to be edited in lockstep with a tool in another
 * language. So the buckets are a record, and each carries its own human
 * justification — that note is what the codex renders next to the entry.
 */
const zIconPlanBucket = z
  .object({
    /** short label for the group header */
    label: z.string(),
    /** why these entries are excluded — shown verbatim to the reader */
    note: z.string(),
    ids: z.array(z.string()),
  })
  .strict();

export const zConfigIconPlanDoc = z
  .object({
    id: zId,
    schema: z.literal("config.icon-plan@1"),
    /** the prompt-template version the batch would run with */
    templateVersion: z.string(),
    /** fingerprint of the content the plan was derived from */
    contentDigest: z.string(),
    counts: z
      .object({
        total: z.record(z.string(), z.number()),
        byFamily: z.record(z.string(), z.record(z.string(), z.number())),
      })
      .strict(),
    /** importer resolution -> how many icon-less entries came from it */
    provenance: z.record(z.string(), z.number()),
    /** rule key -> the entries deliberately never generated */
    dropped: z.record(z.string(), zIconPlanBucket),
    /** rule key -> the entries held pending a human decision */
    blocked: z.record(z.string(), zIconPlanBucket),
    generate: z
      .object({
        tier1: z.array(z.object({ id: z.string(), family: z.string() }).strict()),
        tier2: z.array(z.object({ id: z.string(), family: z.string() }).strict()),
      })
      .strict(),
    /** ids a live surface protects from ever being dropped */
    vetoed: z.array(z.string()),
    /** live-surface files the planner could not find (a too-narrow veto) */
    missingSurfaceFiles: z.array(z.string()),
  })
  .strict();
export type ConfigIconPlanDoc = z.infer<typeof zConfigIconPlanDoc>;
