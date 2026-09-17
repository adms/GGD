"""Portable current counts, delegated to the project's authoritative TS reader."""
import json
from pathlib import Path
import subprocess


def read_current_roster(root: Path):
    return json.loads(subprocess.check_output(
        ['node', '--import', 'tsx', str(root / 'tools/hero-model-library/current_roster.mts')],
        cwd=root, text=True))


def roster_input_paths(root: Path):
    return [root / path for path in (
        'tools/hero-model-library/current_roster.py',
        'tools/hero-model-library/current_roster.mts',
        'packages/shared/testkit/balancePopulation.ts',
        'packages/shared/testkit/starterRoster.ts',
        'apps/platform/internal/curation/starter.go',
        'content/config/roster.json',
    )]
