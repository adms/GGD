# J-STARS PS3 decoder/toolchain audit

This workflow records why the public DRV3 SRD toolchains cannot be treated as
a complete J-STARS converter, and makes the PS3 big-endian structural findings
reproducible against the retained Killua sample.

```bash
python3 audit.py --output ../../../../materials/hero-model-library/source-inventories/jstars-ps3-toolchain-audit-v1/audit.json
python3 -m unittest test_audit.py test_acquire_public_rigged.py
```

`audit.py` reads retained samples only. `acquire_public_rigged.py` is an
optional network step for six author-enabled public downloads. It does not log
in; an unavailable anonymous download is recorded as blocked instead of being
bypassed. Neither script emits a GLB or changes runtime registration.

## Verified result

- The 131-byte minimum sample is a `$CLH` wrapper around `$CH0`. The
  QuickBMS/DRV3 paths audited here do not implement that entropy stage.
- QuickBMS produced 322,198 bytes from Killua's model package, while the outer
  package declares 534,592 decoded bytes. This remains a partial output.
- The exact RAM-dumped Killua SRD exposes 22 `$VTX`, 22 `$MSH`, 1 `$SKL`,
  12 `$MAT`, 19 `$TXR` and 20 `$TXI` top-level blocks. All discovered SRDI
  resource ranges are in bounds.
- Its first VTX is mesh type `0x0702`, 920 vertices, and a derived 104-byte
  vertex stride. Public DRV3 readers use little-endian payloads and different
  mesh layouts, so this is structural evidence rather than a converted model.
- All six JosouKitsune pages advertise author-enabled 7-zip downloads, but the
  anonymous file requests returned HTTP 404 on 2026-09-17. No login or access
  workaround was attempted.
