import { performance } from "node:perf_hooks";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkpointSourceRegeneration } from "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/apps/content-api/src/editorSourceRecovery";
const root = "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge";
const start = performance.now();
const checkpoint = checkpointSourceRegeneration(root, "tools/skill-remake/heroes/godie-e00s.py", "skillremake:json", JSON.parse(readFileSync(join(root, "tools/parallel-gates/sync-io.json"), "utf8")));
try {
  const manifest = JSON.parse(readFileSync(join(checkpoint.directory, "recovery.json"), "utf8"));
  if (!checkpoint.unchanged()) throw new Error("real workspace changed during read-only checkpoint");
  const result = { operation: "checkpoint and compare only; no generator or restore executed", files: manifest.files.length,
    bytes: manifest.files.reduce((n: number, file: { backup: string }) => n + statSync(join(checkpoint.directory, file.backup)).size, 0),
    elapsedMs: Math.round(performance.now() - start), unchanged: true };
  writeFileSync("/private/tmp/ggd-source-recovery-proof/checkpoint-proof.json", JSON.stringify(result, null, 2) + "\n");
  console.log(result);
} finally { checkpoint.dispose(); }
