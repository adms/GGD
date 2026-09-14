# Alucard SSM 2.7 native audio

Upstream source `parallel-ns-alucard-ssbu` is CSharpM7's Nintendo Switch **Castlevania Alucard** MOD, using the native `richter` slot. It is separate from Hellsing Alucard. No GGD hero ID is assigned.

The new delivery source is `parallel-ns-alucard-ssbu-audio-decoded-v1`. All source bytes remain unchanged. The full original 7z, three NUS3AUDIO payload banks, three NUS3BANK companions, standalone IDSP, source release record and original extracted manifest are copied into the delivery's `raw/` tree.

Run Python 3.10+ with its standard library:

```sh
python3 decode.py --source-root /absolute/path/to/parallel-ns-alucard-ssbu --output /absolute/path/to/a/new/delivery
python3 freeze.py /absolute/path/to/a/new/delivery
```

The decoder executable is pinned to vgmstream r2117 SHA-256 `d1d9f856163023833a4959feacda78275a0d26e0b8163d8cd4bfd6d5e8aa7e8e`. The default decoder is `/private/tmp/ggd-vgmstream-r2117/cli/vgmstream-cli`; FFmpeg is `/usr/local/bin/ffmpeg`. Both version/hash receipts are saved. The freeze step archives the exact decoder source commit and copies the decoder, FFmpeg and their resolved non-system dylibs, retaining install-path dependencies in the receipt. This is a backup, not a relocated macOS runtime bundle.

Each source stream is decoded once using `-i -w` without repeated loops, appended fades, normalization, gain, resampling or trimming. Native loop/sample/container information is retained per stream. Every PCM master passes declared sample count/rate/channel/payload checks, a full FFmpeg decode and a byte-identical second vgmstream decode. All originals are rehashed before and after conversion.

The completed revision has **135 WAV streams / 151.395021 seconds / 14,142,764 bytes**. Two source entries are intentional one-second stereo **Silence/dummy** placeholders (SE bank streams 24 and 32); they are retained and flagged. The other 133 streams remain unreviewed. The longest is 13.133545 seconds and is kept complete. No stream is confirmed dialogue, character voice, Japanese speech or a GGD skill event. Original bank entry names and decoder stream names are separate fields, since a dummy can retain an original event name.

Source-group labels are SE 94, VC 39, cheer 1 and narration 1. They are **source labels**, not reviewed classification. Every row has language `unknown`, classification `unclassified`, false speaker/language/transcript review, no hero mapping and no synthesis readiness.

The first attempt conservatively stopped at stream 24 after 23 outputs because it allowed only DSP ADPCM. Its files and failure metadata remain in the parent conversion directory. The corrected complete output is `GGD-Asset-Library/conversions/alucard-audio-20260911-v1/revision-02/`; only that revision should be centrally registered. No backend default, accepted voice registration, deployment, AWS upload or remote push is performed by these scripts.
