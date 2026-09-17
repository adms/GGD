#!/usr/bin/env python3
"""Preserve the conversion stages and materialize only verified local dependencies."""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from run import REPO, STAGE, SOURCE, SOURCE_DOC, geometry_vendor

p=argparse.ArgumentParser(); p.add_argument('--upload',action='store_true'); args=p.parse_args()
backup_root=REPO.parent/'GGD-Asset-Library/backups/kenshiro-ou99-decimation-v1'
prepared=backup_root/'materialized-v1'
vendor=geometry_vendor().resolve()
# Validate every link before copying. No arbitrary filesystem traversal.
for root in [STAGE,vendor]:
    for path in root.rglob('*'):
        if path.is_symlink():
            target=path.resolve(strict=True)
            if not (target.is_relative_to(STAGE.resolve()) or target.is_relative_to(vendor)):
                raise ValueError('Unapproved dependency link: '+str(path))
if not prepared.exists():
    prepared.mkdir(parents=True)
    shutil.copytree(STAGE,prepared/'stages',symlinks=False)
    (prepared/'original').mkdir()
    shutil.copy2(SOURCE,prepared/'original'/SOURCE.name)
    shutil.copy2(SOURCE_DOC,prepared/'original'/SOURCE_DOC.name)
    (prepared/'source-map.json').write_text(json.dumps(dict(
        stage=str(STAGE),originalGlb=str(SOURCE),originalDocument=str(SOURCE_DOC),
        materializedDependency=str(vendor),
        boundary='Stage, source GLB/document and geometry dependencies only; committed scripts and evidence use the commit snapshot.'),ensure_ascii=False,indent=2)+'\n')
command=[sys.executable,str(REPO/'tools/hero-model-library/backup_intake.py'),
    '--source',str(prepared),'--prefix','legacy/conversion-stages/kenshiro-ou99-decimation-v1',
    '--output',str(backup_root/'verified')]
if args.upload:
    subprocess.run(command,check=True)
    shutil.copy2(backup_root/'verified/latest-receipt.json',Path(__file__).parent/'evidence/stage-backup.json')
else: print(json.dumps(dict(prepared=str(prepared),uploadCommand=command),ensure_ascii=False))
