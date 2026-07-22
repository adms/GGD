# w3x icon extraction — GoDieEX22s (task #33, docs/todo/icons.md)

`extract_icons.py` re-read raw/war3map.{w3u,w3a,w3t} (`uico`/`aart`/`iico`) —
the parsed/*.json inventory had dropped unit+ability icon fields. An icon is
ORIGINAL only when its path resolves INSIDE GoDieEX22s.w3x (membership test,
not path prefix — custom art sits at stock-looking CommandButtons\ paths).
Stock paths get NO `icon` field: the client keeps its fallback rendering.

## Coverage

| kind | docs | with icon (archive art) | stock fallback | no art field | no wc3 source | convert failed |
| --- | --- | --- | --- | --- | --- | --- |
| champions (portraits) | 111 | 85 | 16 | 10 | 0 | 0 |
| abilities (Q/W/E/R + EX) | 546 | 13 | 423 | 94 | 16 | 0 |
| items | 208 | 15 | 145 | 48 | 0 | 0 |

- `no art field`: the WC3 object never overrides its base ability/unit icon →
  Blizzard stock default → fallback (same client treatment as `stock`).
- PNGs are written PER DOC ID under `content/assets/icons/…` even when several
  docs share one source BLP — every `icon` ref resolves by construction.

## Most-referenced STOCK paths (not in archive — intentionally not shipped)

- `ReplaceableTextures\PassiveButtons\PASBTNUnholyAura.blp` × 14
- `ReplaceableTextures\PassiveButtons\PASBTNReincarnation.blp` × 10
- `ReplaceableTextures\CommandButtons\BTNFireForTheCannon.blp` × 8
- `ReplaceableTextures\PassiveButtons\PASBTNPillage.blp` × 7
- `ReplaceableTextures\CommandButtons\BTNBerserkForTrolls.blp` × 7
- `ReplaceableTextures\CommandButtons\BTNTornado.blp` × 7
- `ReplaceableTextures\CommandButtons\BTNTheBlackArrow.blp` × 6
- `ReplaceableTextures\CommandButtons\BTNAntiMagicShell.blp` × 6
- `ReplaceableTextures\CommandButtons\BTNEarthquake.blp` × 6
- `ReplaceableTextures\CommandButtons\BTNPhaseShift.blp` × 6
- `ReplaceableTextures\CommandButtons\BTNHeartOfAszune.blp` × 6
- `ReplaceableTextures\CommandButtons\BTNManaFlare.blp` × 6
- `ReplaceableTextures\CommandButtons\BTNTransmute.blp` × 6
- `ReplaceableTextures\CommandButtons\BTNRavenForm.blp` × 6
- `ReplaceableTextures\CommandButtons\BTNWispSplode.blp` × 5

## BLP/TGA conversion failures

(none)
