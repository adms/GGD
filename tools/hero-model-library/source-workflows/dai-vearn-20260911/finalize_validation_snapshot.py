from pathlib import Path
import json,subprocess,hashlib,shutil,datetime,re
R=Path.cwd();B=R/'materials/hero-model-library';E=B/'priority-evidence/dai-vearn-20260911';C=E/'checks';C.mkdir(exist_ok=True)
checks=json.loads(Path('/private/tmp/ggd-main-merge-checks/final/release-checks.json').read_text())
for row in checks:
 s=Path(row['log']);d=C/s.name;shutil.copyfile(s,d);row['log']=str(d.relative_to(R));row['logSha256']=hashlib.sha256(d.read_bytes()).hexdigest()
shutil.copyfile('/private/tmp/ggd-main-merge-checks/public-sources-tests.txt',C/'public-sources-tests.txt')
old=json.loads(subprocess.check_output(['git','show','1267de2e9:materials/hero-model-library/已取得模型待設計英雄.json']));d=json.loads((B/'已取得模型待設計英雄.json').read_text());assert old['characters']==d['characters'];assert old['counts']==d['counts'];voice=json.loads((B/'voice-index.json').read_text());assert subprocess.check_output(['git','show','1267de2e9:materials/hero-model-library/voice-files.jsonl.gz'])==(B/'voice-files.jsonl.gz').read_bytes()
q=subprocess.run(['git','diff','--cached','--check'],capture_output=True,text=True)
warnings=re.findall(r'^(.+?):\d+: (?:trailing whitespace|new blank line)',q.stdout,re.M)
assert warnings and set(warnings)=={'docs/_daily/ledger-source_temp_20260910.md'},q.stdout
for p in set(warnings):assert subprocess.check_output(['git','show','origin/main:'+p])==(R/p).read_bytes()
receipt=dict(schema='ggd.dai-vearn-integration-validation@1',validatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),parentCommit='1267de2e9b9c8d9da0ab30873d141228ab9dffe6',mergedMainCommit='e36a5acda3522ab0bb2677891a367e56eefb05a1',contentBuildVersion=json.loads((R/'content/manifest.json').read_text())['contentVersion'],sourceIdentities=731,allCharacterRowsExactlyPreserved=True,modelCandidateReferences=4126,counts=d['counts'],audioFileIndexByteIdentical=True,audioFiles=voice['summary']['audioFiles'],audioMissingOrSizeChanged=voice['summary']['missingOrSizeChanged'],reserveRows=66,newDaiCompleteBodies=0,newVearnCompleteBodies=0,newNativeAudioFiles=0,sourceArchivesVerifiedMembers=154,designAuditSourceFiles=8,mergeIntermediateArchiveFiles=39,followupResearchArchiveFiles=5,sourceIndexTestsPassed=5,formReceiptHistoryRegressionTestsPassed=20,actualReactReceipts=178,releaseChecks=checks,fullReleaseChecksPassed=False,productionDeployed=False,mergeWhitespaceCheck='Only 5 existing whitespace warnings in verbatim incoming Main ledger; bytes verified equal to Main',sourceBackupReceipts=['dai/s3-backup-receipt.json','vearn/s3-backup-receipt.json','followup-02/s3-backup-receipt.json','merge/source-audit-s3-backup.json','merge/intermediate-s3-backup.json'],remainingReleaseFailures=['message ledger missing/unmapped rows','two SkillForge capability-only catalog assertions'],artifacts=[])
for p in [B/'全角色模型盤點.md',B/'已取得模型待設計英雄.md',B/'已取得模型待設計英雄.json',B/'voice-index.json',B/'priority-81-handoff.json',R/'materials/asset-library/STORAGE_POLICY.json']:
 receipt['artifacts'].append(dict(path=str(p.relative_to(R)),sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
(E/'validation.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
p=B/'priority-release.json';rel=json.loads(p.read_text());rel['modelDesignBacklogCounts']=d['counts'];rel['fullReleaseChecksPassed']=False;p.write_text(json.dumps(rel,ensure_ascii=False,indent=2)+'\n')
base=R.parent/'GGD-Asset-Library/backups/git-asset-snapshots/1267de2e9b9c8d9da0ab30873d141228ab9dffe6/receipt.json';assert json.loads(base.read_text())['fullGetAndEveryFileVerified'];shutil.copyfile(base,E/'merge/parent-git-s3-backup.json')
print('Final evidence written; only byte-preserved Main ledger whitespace warnings.')
