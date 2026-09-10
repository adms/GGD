# Hero74 action v4: scalar-leaf protocol

This directory is a deterministic, local projection of the committed
`hero74-compact-v8` teachers. It is intentionally not committed: its expanded
JSONL/JSON copies are about 117 MB and contain no new teacher, label, or manual
edit. Regenerate it from the repository root:

```sh
node tools/editor-acceptance/hero-distillation-action.mjs \
  docs/_reports/hero-finetune-research/hero74-compact-v8 \
  docs/_reports/hero-finetune-research/hero74-action-v4
```

The projection preserves the 59-hero train / 15-hero internal-dev split and
replays every teacher configuration. It changes only the inference contract:
objects and arrays are script-owned `shape` actions and the model may supply
only one scalar leaf value per `value` action. The script derives the frontier,
validates every action, and rejects nested model values under
`scalar-leaves@1`.

The real tokenizer preflight for this exact projection recorded 12,480 train
tasks (8,657,927 tokens) and 3,917 dev tasks (2,834,587 tokens), with a 2,570
token maximum sequence. The real eight-stratum GPU probe measured 55,985.4
seconds as the conservative full-epoch bound and about 14.67 GB peak Metal
memory. These are resource-admission measurements, not quality or E2E proof.

The local generated projection report records 377 as the maximum dependent
actions in one tree, below the explicit 512 limit. That multiplier makes this
version a controlled experiment, not a claimed quality improvement: final
full-hero success still requires zero invalid decisions, assembly, compiler,
import, and gameplay evidence.
