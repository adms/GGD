# Final prepush classification

All three commands exited 1; the batch source snapshot remained unchanged. These are not a green repository release gate.

- **skills:check — sparse environment blocker.** `spec:check` differs from the tracked markdown by exactly one row: `audio-manifests | 9`. Nine non-indexed JSON inputs (175,869 bytes) exist in HEAD but are absent from the worktree. The generator recursively counts them even though ContentLoader does not list the collection. No other markdown difference; the ability-prose JSON check passed first.
- **editor:accept:release — preexisting generated advisory mismatch.** 185 Skill Forge no-code tests, receipts, real Sim routes, human review packet, and chronological image sheets passed. The subsequent Codex advisory check reports stale `review.json`. Its five fixed JSON inputs, generator, pure helper, and stored outputs are all present, unchanged from merge-base, and byte-equal to HEAD. This is not caused by remaining sparse inputs. The existing runner invokes advisory again after its earlier machine-only skip. Full Editor release stages after Skill Forge were not reached.
- **coord:check — preexisting historical packet mismatch.** The batch2 packet passes. The remaining failure is `claim.editor-form-receipts` with its old contract fingerprint; the nine missing historical evidence logs have already been restored from HEAD.

Adding the nine audio-manifest JSON files may let skills advance, but global release will still encounter the unrelated stale advisory. No out-of-scope generated document or gate was changed.

Original root/shared node_modules symlinks were restored as the original objects with exact original link strings. All six monitored external cache snapshots were byte-identical before and after. Temporary local caches remain archived under `/private/tmp/batch2-prepush-final/repair/`.

Evidence: `spec-readonly-analysis.json`, `spec-missing-inputs.json`, `baseline-input-oids.json`, `node-cache-restored.json`, `external-cache-comparison.json`, and the original stdout/stderr logs beside this file.
