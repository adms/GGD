# KOF 3D source audit generator

This source workflow rebuilds a narrow, evidence-backed inventory for KOF XIV,
KOF XV and the Maximum Impact series. KOF 2002 UM is deliberately emitted in a
separate 2D section. It does not acquire or decode protected content.

Run from the repository root:

```sh
python3 tools/hero-model-library/source-workflows/kof-3d-sources-v1/build_inventory.py \
  --repo . --workspace ..
python3 tools/hero-model-library/source-workflows/kof-3d-sources-v1/build_inventory.py \
  --repo . --workspace .. --check
python3 -m unittest \
  tools/hero-model-library/source-workflows/kof-3d-sources-v1/test_build_inventory.py
```

The generated report re-hashes every extracted KOF XIV file listed in the
existing frozen `files.jsonl.gz`, re-hashes every KOF XV model artifact that has
an expected SHA-256, and parses the complete QuickBMS WAD listing into native
directory counts. A WAD path entry remains metadata until its bytes are copied.

The Ash XV budget experiment uses the existing project optimiser. The 7,000
request is intentional because meshoptimizer produced 8,575 triangles from a
7,900 request; the lower request produced 7,869/7,868-triangle candidates:

```sh
pnpm --dir ../GGD-pr1152-next modelbudget:optimize \
  /absolute/kof-open3dlab-ash-xv-material-repair-v2/converted/left-hair/body.glb \
  --role champion --geometry --tex-edge 256 --tris-target 7000 --apply \
  --out /absolute/GGD-Asset-Library/conversions/kof-xv-ash-material-v2-budget-v2/left-hair \
  --babylon-verify --json
```

Repeat with `right-hair`. The optimiser proved rig survival and Babylon loading,
but both outputs retain 18 draw calls. Its atlas stage rejected the source due to
non-mergeable primitive/transform structure, so neither derivative is promoted
to Git runtime assets or a backend option. The complete six-file candidate tree
is preserved under S3 `legacy/conversion-stages/` with full GET and member hash
verification; the URI and hashes are generated into the inventory report.

Register this non-runtime derivative source, then rebuild the normal central
generators. The integration is idempotent and does not change any default:

```sh
python3 tools/hero-model-library/source-workflows/kof-3d-sources-v1/integrate.py \
  --repo . --workspace ..
python3 tools/hero-model-library/inventory.py --workspace ..
python3 tools/hero-model-library/build_model_design_backlog.py --workspace ..
python3 tools/hero-model-library/build_palworld_index.py --workspace .. \
  --git-link-root ../GGD-pr1152-next
python3 tools/hero-model-library/current_resource_index.py \
  --git-link-root ../GGD-pr1152-next
```

`--git-link-root` only controls clickable absolute Git links in generated
evidence. In the integration checkout it may be omitted; an isolated worktree
must point it at the long-lived integration checkout so removing the temporary
worktree does not leave dead local links.
