# Infinity Strash Popp and priority audio v1

This workflow closes two omissions in the earlier native-ID extraction without changing that immutable source:

- extract every exact `PN020` PAK member for Popp;
- read the `AkLocalizedMediaAsset` references embedded in the `PN010`, `PN020`, `EN801`, and `EN653` Wwise event packages, then extract the corresponding numeric Media packages.

The `.ubulk` payloads contain one or two Wwise RIFF streams. `build.py` selects the unique RIFF stream whose declared length ends at the payload boundary, retains it as the encoded `.wem` master, and decodes a PCM WAV with the archived `vgmstream` binary. It records absolute local paths, byte counts, SHA-256, event-to-media relations, language, category, and automated WAV properties. A decoded clip remains pending listening review; it is not treated as confirmed speech, speaker identity, accepted game audio, backend registration, or deployment.

`EN801` is Vearn, while `EN653` is MystVearn and remains separate. `EN680` and `EN681` are Baran and are not part of this batch. Vearn's pre/post-transformation form mapping remains pending a successful game-specific mesh export and visual review.

Run `python3 -m unittest -v test_build.py` before building. The completed output is immutable: reruns must use a new source revision instead of replacing `extraction-index.json`.
