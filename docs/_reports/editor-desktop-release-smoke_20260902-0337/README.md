# Editor Desktop 0.1.0 release smoke — 2026-09-02 03:37（Asia/Taipei）

Branch: `feat/vfx-forge-codex`

Main baseline: `origin/main@b8420abe`

Scope: Desktop packaging only. This report does not claim that Main's production importer exists.

## Renderer isolation

Desktop Vite output was moved from the web applications' `dist/` trees to
`apps/editor-desktop/dist/renderer/{editor,admin}`. A production web build was
hashed before and after `pnpm --filter @ggd/editor-desktop build:renderer`:

| Tree | Before | After |
|---|---|---|
| `apps/editor/dist` | `55fbf06f8492acab3c339e0640d22b7c7da56b5a470984032a5d0337cf516333` | same |
| `apps/admin/dist` | `2e981f0b145d760865fccca8983d0427c87b5e960c23ade241c68e003462aac3` | same |

This proves a root/parallel Desktop build no longer overwrites the production
web renderer with a Desktop-authority build.

## macOS universal output

Built with:

```bash
pnpm --filter @ggd/editor-desktop dist:mac
```

The packaged executable is a universal Mach-O containing both `x86_64` and
`arm64`. `Contents/Resources/editor/index.html`, `admin/index.html`, and the
GGD-derived `icon.icns` are present. Bundle id is
`tw.ggd.ability-vfx-editor`, version `0.1.0`.

| Artifact | Size | SHA-256 |
|---|---:|---|
| `GGD Ability & VFX Editor-0.1.0-universal.dmg` | 198 MB | `fc413c3d4e0a80c4161a9a8d84c5125f1517fd25107233127392eaa31468f15c` |
| `GGD Ability & VFX Editor-0.1.0-universal-mac.zip` | 198 MB | `8be82c40b391a337fa8210e1df42bba4bd0763724d5e630b650b76ee6ccfbb3f` |

The final packaged app was executed with `--smoke-test` against the public
read-only source `https://ggd.adms.ai`. It exited `0`, reported source state
`current`, pinned `cv_88cbb6486bf2` / profile `3f8d4687566f`, and received HTTP
200 for all five checks:

- `/editor/`
- `/admin/`
- `/content-api/manifest`
- `/content-api/desktop-source`
- `/content-api/desktop-target-profile`

At 2026-09-02 03:43（Asia/Taipei）, the cross-platform runner was also executed
against this same universal package:

```bash
pnpm --filter @ggd/editor-desktop smoke:packaged
```

It returned both `ggd-editor-desktop-smoke@1` and
`ggd-editor-packaged-smoke-runner@1`, preserved the same source/profile
receipts, and exited `0`. The first sandboxed attempt aborted in AppKit before
application startup; it produced no receipt and the runner correctly failed.
The recorded passing result was run with normal GUI-launch authority.

## Windows x64 output

Built with:

```bash
pnpm --filter @ggd/editor-desktop dist:win
```

`win-unpacked/GGD Ability & VFX Editor.exe` is a PE32+ x86-64 application and
contains the packaged Editor/Admin resources. The macOS host has no Wine, so
this proves the Windows package/resource closure but not Windows process launch;
the same smoke must be run on a real Windows host before a public release. After
building on that host, the deterministic command is:

```bash
pnpm --filter @ggd/editor-desktop smoke:packaged
```

The runner locates the unpacked platform executable, uses isolated temporary
user-data, and fails unless the packaged process emits a valid
`ggd-editor-desktop-smoke@1` receipt with successful route checks. An installed
or separately unpacked executable can be selected with
`--executable="C:\\path\\to\\GGD Ability & VFX Editor.exe"`.

| Artifact | Size | SHA-256 |
|---|---:|---|
| `GGD Ability & VFX Editor Setup 0.1.0.exe` | 94 MB | `b8c1f4029582426415fea19645f6b9769465f2ada8f1619a8186332415966218` |
| `GGD Ability & VFX Editor 0.1.0.exe` (portable) | 94 MB | `0d68f73e72224b46a79f1c915bc0f60a01a8f424c33772cc19484541d50c004e` |

## Release limitations kept explicit

- The macOS build is not Developer-ID signed or notarized because this machine
  has no valid Developer ID Application identity. It is a local acceptance
  build, not a frictionless public download.
- Windows signing was not independently verified on a Windows host.
- Main still advertises only `bootstrap`; G2 validate/apply/rollback, exact
  active Base, source adapter, production review/Promote, asset manifest and
  effective VFX-limit receipts remain Main-owned blockers.
