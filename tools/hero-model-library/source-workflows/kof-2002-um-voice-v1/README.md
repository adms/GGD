# KOF 2002 UM voice.dat

`extract_voice_dat.py` losslessly splits the length-prefixed RIFF/WAVE records in the Steam
version's `Data/game/voice.dat`. It retains each original RIFF payload, records offsets and
padding, calculates source and per-file SHA-256 values, and writes audio metadata.

Run it against the read-only mounted source and keep output in `GGD-Asset-Library`:

```bash
python3 tools/hero-model-library/source-workflows/kof-2002-um-voice-v1/extract_voice_dat.py \
  --source '/Volumes/common/The King of Fighters 2002 Unlimited Match/Data/game/voice.dat' \
  --output '<GGD-Asset-Library>/extracted/kof-2002-um-voice-v1'
```

The numeric record order is preserved. Until listening review maps a clip, its language,
speaker, and game event remain `pending-confirmation`; extraction alone does not register or
deploy character voice assets.
