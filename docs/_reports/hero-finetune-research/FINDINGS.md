# Findings and limits

## What finished

The fixed local workflow performed baseline inference, eight-record synthetic masked LoRA training, adapter reload verification, paired inference on the same six requests, unchanged automated assessment, verification of all eleven original model files, and report/model-artifact production. No dataset, prompt, scorer or checkpoint was selected after seeing the result. The report is a negative experiment, not a successful hero-generation model.

## What the raw evidence shows

- Base: five of six outputs parsed as JSON; none passed IR. First recorded errors include an invalid first-delay bound, passive cast timing, a zero attack-speed field and an incompatible line delivery.
- LoRA: one of six outputs parsed; the other five ended with malformed JSON. All six record `finishReason: stop`, with 685–767 generated tokens against an 8192-token limit. This is not evidence of exhausting the output budget. The sole parsable output still failed `PASSIVE_CAST_TIMING`.
- Source-facet totals only cover outputs that parsed: 277/310 before and 55/57 after. **Do not call this an accuracy increase**: the surviving cases and denominators differ. The unchanged hero-level denominator is six, with zero engineering passes on both sides.
- No compiler/runtime execution was admitted for these model outputs. `behaviorAttempted: 0` means not reached, not six runtime failures. Separately verified hand-authored controls validate the harness, not the model.
- Adapter reload was verified and base hashes were unchanged. These checks establish artifact integrity, not that the chosen training objective or data composition is suitable.

Evidence paths after extraction: `outputs/hero-forge-12b-restart-20260908/ir5-base-v1-assessment/cases.json`, `ir5-lora-v1-assessment/cases.json`, `ir5-lora-v1/whole_hero-raw.json`, and `ir5-workflow-v1/result.json`. Original bytes and hashes are in `bundle/manifest.json`; no malformed output was repaired for this experiment's scores.

## What is not established

This run does not establish that 12B is intrinsically too weak, that fine-tuning generally fails, or that collecting more of the same synthetic records will work. Eight examples from one shared-wording family and two exposed real controls cannot support those conclusions. A mechanism-field loss decrease can coexist with invalid serialization and incorrect cross-field choices. The causal contribution of loss masking, data diversity and training settings has not been isolated.

## Next experiment, only if separately resumed

1. Keep this baseline and scorer frozen. Make one bounded, preregistered serialization-objective control, checking complete assistant JSON and end-of-turn token supervision, alongside the current masking policy. Do not silently append braces or count repaired content as raw generation success.
2. Separately construct reviewed neutral-name, mixed-slot-timing and independently worded source examples across mechanism families. Maintain original evidence, unknown values, capability gaps and exclusions. Do not substitute an arbitrary record-count target for quality review.
3. Split by hero/source/mechanism family before training. Report whole-hero success, dangerous accepts and correct refusals separately. Preserve all invalid outputs in the denominator.
4. Set a fixed time/step budget and a single chosen checkpoint before generation. Stop and publish a negative result when the preset gate fails; do not expand training because train loss is low.

These are proposed follow-ups, not work silently queued by this delivery. No additional GPU run is scheduled. Full-source identity accuracy, independent generalization, visual quality and 16GB deployment remain unqualified.
