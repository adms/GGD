#!/usr/bin/env python3
"""Run the Popp VFX publication, content-index, evidence and report pipeline."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent


def run(*args: str) -> None:
    subprocess.run(args, cwd=ROOT, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    py = sys.executable
    publish = str(HERE / "publish_vfx_runtime.py")
    review = str(HERE / "build_review.py")
    report = str(HERE / "update_four_day_report.py")
    current = str(ROOT / "tools/hero-model-library/current_resource_index.py")
    if args.write:
        run(py, publish, "--write")
        run("pnpm", "--filter", "@ggd/shared", "content:build")
        run(py, review)
        run(py, report, "--write")
        run(py, current)
    run(py, publish)
    run("pnpm", "content:validate")
    run("pnpm", "vfxbind:check")
    run(py, review, "--check")
    run(py, report)
    run(py, current, "--check")
    run(
        py,
        "-m",
        "unittest",
        str(HERE / "test_publish_vfx_runtime.py"),
        str(HERE / "test_build_review.py"),
        str(HERE / "test_update_four_day_report.py"),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
