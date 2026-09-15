# MBA unused native six-state candidate batch

This workflow converts only three already acquired MBA Complete Form 1.60+
character bodies: Naga, Hayate and Vita. It uses the existing MBA atlas/skin
normalizer and the shared GGD upload validator, preserves exactly six named
native clips per body, and builds each result twice to require byte identity.

```sh
python3 tools/hero-model-library/source-workflows/mba-unused-native-batch-v1/run.py --write
python3 tools/hero-model-library/source-workflows/mba-unused-native-batch-v1/run.py --check
```

`--write` creates an immutable local conversion stage beneath
`GGD-Asset-Library/conversions/`; it neither downloads nor changes the source
game files. The committed receipt records local paths and SHA-256 values, but
the products stay unbound candidate material until owner visual approval and a
real GGD hero definition exist. It therefore must not be called a backend
dropdown option or a deployed hero.
