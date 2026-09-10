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

## Runtime guard cadence

The training supervisor keeps process liveness and per-step deadline checks
short, but reads battery/RAM/swap sensors only once every 180 seconds.  This
three-minute resource cadence is frozen into a newly prepared run manifest;
an already-running older supervisor retains its recorded cadence and is not
silently rewritten in memory.

## Frozen local projection receipt

The run admitted on 2026-09-10 uses this deterministic source manifest:
`1d58be824bd5a211aa93c3e02f3eabb0147cbce30811b3cd512077120de6f785`.
The generated local files must hash exactly as follows before a replay:

| File | SHA-256 |
| --- | --- |
| `examples.json` | `b61c71b9ec1adc1a067763aff2923e3e4c2f6676ac29c50bc521bc5a8e2e3459` |
| `train.jsonl` | `df3c376ff7375a57fe037116535e2f23c900a563f5fb5a46e6adf3cc86eb9eaf` |
| `dev.jsonl` | `e403a58fac25342dab8f0696bafce5855a07c3197f7c198b3ef5bf64acf9d74d` |
| `metrics.json` | `a3678ee83bdace8b9a524564bf34f2c90ddee67ee8663d85f911fd46d3c533c3` |
| `projection-report.json` | `e8616d96ba115932a91e5ab33a660681c620f052648efa9497b0b1e5061202f5` |
