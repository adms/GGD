# External model evaluation boundary

This archive is coordinator-only historical material. It is not a safe model
input directory. The clean handoff deliberately omits the former public prompt
export and keeps all model-answer, teacher, compiled-output, evidence, log, and
large-payload bytes out of Git.

The second-batch reference was validated historically at commit
`0e001412a32ae1dddffb64e3528cfff923bf6cf6`, build hash
`5117955476f4fd14832936836a3b1c1633905fd8d0cd1edb32cfe5bb731c308c`,
and engine `ed547549fb453f6652f53bd7ed9548b0ccef3a36`. Those identifiers are
provenance, not current-engine or model-quality evidence.

Before an evaluation, the coordinator must create a separate input-only
directory containing exactly the 37 public prompts, `catalog.json`, the public
tram GLB, and `INPUT-ONLY.json`. Record the path and SHA-256 of every visible
input. Do not expose this repository, the restored archive, private packages,
teacher designs, compiled references, review evidence, or historical model
outputs to either evaluated model.

Confirm both models' checkpoint, adapter, and tokenizer paths and hashes before
generation. Keep chat template, context limit, output-token limit, system prompt,
temperature, seeds, tool access, prompt order, and retrieval rules fixed. Do not
choose an unspecified checkpoint and do not train or modify weights as part of
this evaluation.

Store every model's raw answer and failure. Send each model-produced
`HeroProject` through the schema, generator/compiler, numeric mirror, reference,
behavior, and package checks from the current fixed engine. Re-running a teacher
generator is not evidence about the evaluated model. Report first-attempt and
repaired results separately, keep timeouts and truncations in the denominator,
and preserve regressions where the base model passes but the fine-tuned model
fails.

No claim of fine-tune improvement, blind-test qualification, complete hero
generation, or game readiness is supported until actual model outputs pass that
fixed comparison. Material restore success establishes only byte delivery.
