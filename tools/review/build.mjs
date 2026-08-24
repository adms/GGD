#!/usr/bin/env node
/** `pnpm review:build` —— 重生成 docs/_review/queue.json（GH#664 HITL 佇列）。 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeQueue, QUEUE_REL } from "./triage.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const q = writeQueue(repoRoot);
console.log(
  `[review:build] ${QUEUE_REL} 已重生成 —— 資產 ${q.counts.assets}` +
    `（Tier0 機器閘 ${q.counts.tier0} · 已審 ${q.counts.reviewed} · pending ${q.counts.pending}）`,
);
