# Hero74 Action V4 Training Stop Record — 2026-09-10

## Terminal evidence

| Item | Evidence |
| --- | --- |
| Run | `outputs/hero-forge-12b-restart-20260908/hero74-action-v4-sampling3m` |
| Train state | `stopped-or-failed` |
| Worker result | `RuntimeError: BATTERY_BELOW_FLOOR` (`WORKER_EXIT:1`) |
| Last recorded action step | 7,826 / 12,480 (62.7%) |
| Last durable checkpoint | `checkpoint-7488` |
| Checkpoint adapter SHA-256 | `de7aa9a450d7ed12ee0d8dd838b155a1ff74449dc0bf03d303fa655b5dd1cea4` |
| Final adapter / round-trip receipt | Not produced |

The supervisor's three-minute resource samples remained on AC and last displayed
40 percent. The worker separately checks guards before every action step; its
subsequent live battery read was strictly below the authorized 40-percent floor,
so it terminated before processing step 7,827.

## Guard verification

`hero-distillation-train.test.py` passed 14 tests on 2026-09-10. Its absolute
battery-floor contract permits exactly 40 percent and rejects only values below
40 percent. This stop is therefore not evidence that the guard treats `40` as
`< 40` or `<= 40` incorrectly.

## Consequence

This partial training trace is not a model result. It cannot support claims about
hero-generation quality, base-versus-LoRA comparison, adapter reload, compile,
import, or gameplay. No automatic restart was performed. A resumed or fresh
authorized run must preserve the frozen data/recipe and re-establish the resource
admission conditions before it can produce a valid result.
