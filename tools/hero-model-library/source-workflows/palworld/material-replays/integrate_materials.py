"""Integrate the frozen 2026-09-11 Palworld material batch; retain prior candidates.

Run from the GGD checkout with the verified review JSON as the only argument.
Use --check to verify component admissions without writing files. The current
contract audit must match each selected model and this checkout's contract code.
Original conversions stay local/S3. Only three verified components enter Git;
no hero IDs, model@1 docs, six-state maps or defaults are invented.
"""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import tarfile

AUDIT_PATH = 'materials/hero-model-library/priority-evidence/palworld-materials/current-contract-audit.json'
REQUIRED_CODE_PINS = {
    'packages/shared/src/content/schema/model.ts',
    'packages/shared/src/content/modelUpload/inspect.ts',
    'packages/shared/src/content/modelUpload/glb.ts',
    'packages/shared/src/content/modelUpload/heroModel.ts',
    'packages/shared/src/content/modelUpload/heroModelSchema.ts',
    'packages/shared/src/content/modelUpload/budget.ts',
    'apps/content-api/src/modelVersions.ts',
    'packages/shared/src/content/heroForge/bodyModels.ts',
}
# IDs, rather than input order, define this frozen batch's labels and admissions.
CANDIDATE_SPECS = {
    'opgg-palworld-jetragon.material-bound-native-res-v1': ('jetragon', '原解析度材質版／29動作', False),
    'opgg-palworld-jetragon.material-bound-256-v1': ('jetragon', '256px材質元件／29動作', True),
    'opgg-palworld-astralym-2026081102.full58': ('astralym', '原解析度材質版／完整58動作', False),
    'opgg-palworld-astralym-2026081102.idle-walk-hd': ('astralym', '原解析度材質版／待機與行走', False),
    'opgg-palworld-astralym-2026081102.idle-walk-256': ('astralym', '256px材質元件／待機與行走', True),
    'palworld-cattiva-opgg-materials-v1': ('cattiva', '原解析度材質版／33動作', False),
    'palworld-cattiva-opgg-materials-256-v1': ('cattiva', '256px材質元件／33動作', True),
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_component_admission(review, audit, repo):
    """Read-only admission gate; false readiness flags cannot promote reserves."""
    repo = Path(repo).resolve()
    require(audit.get('schema') == 'ggd-palworld-model-candidate-contract-audit@1', 'Unexpected contract audit schema')
    pins = audit.get('codeInputs', [])
    pin_paths = [pin['path'] for pin in pins]
    require(len(set(pin_paths)) == len(pin_paths), 'Duplicate contract code pin')
    require(REQUIRED_CODE_PINS.issubset(pin_paths), 'Missing required contract code pin')
    for pin in pins:
        path = (repo / pin['path']).resolve()
        require(path.is_relative_to(repo), 'Contract code pin outside checkout: ' + pin['path'])
        require(path.is_file() and sha(path) == pin['sha256'], 'Stale contract code pin: ' + pin['path'])

    candidates = review.get('candidates', [])
    ids = [candidate['id'] for candidate in candidates]
    require(len(ids) == len(set(ids)) and set(ids) == set(CANDIDATE_SPECS), 'Unexpected frozen candidate set')
    rows = audit.get('rows', [])
    row_ids = [row['id'] for row in rows]
    require(len(row_ids) == len(set(row_ids)) and set(row_ids) == {'jetragon', 'astralym', 'cattiva'}, 'Unexpected component audit rows')
    by_id = {row['id']: row for row in rows}
    for candidate in candidates:
        key, _, eligible = CANDIDATE_SPECS[candidate['id']]
        require(candidate.get('is256Candidate') is eligible, 'Invalid component flag: ' + candidate['id'])
        model = candidate['model']
        path = Path(model['path'])
        require(path.is_file() and path.stat().st_size == model['bytes'] and sha(path) == model['sha256'], 'Changed candidate model: ' + candidate['id'])
        require(candidate.get('allSelectedNativeTrackSamplesIdenticalToFrozenSource') is True, 'Native sample preservation not verified: ' + candidate['id'])
        if not eligible:
            continue
        row = by_id[key]
        expected_git_path = 'content/assets/models/community/' + model['sha256'] + '.glb'
        require(row.get('inspectPassed') is True, 'Component inspection failed: ' + candidate['id'])
        require(isinstance(row.get('budget'), dict) and row['budget'].get('errors') == [], 'Component budget failed: ' + candidate['id'])
        require(row.get('sha256') == model['sha256'] and row.get('bytes') == model['bytes'], 'Component audit model pin mismatch: ' + candidate['id'])
        require(Path(row['path']).resolve() == path.resolve(), 'Component audit source path mismatch: ' + candidate['id'])
        require(row.get('proposedGitPath') == expected_git_path, 'Component audit Git path mismatch: ' + candidate['id'])
    return sum(spec[2] for spec in CANDIDATE_SPECS.values())


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('review', type=Path)
    parser.add_argument('--audit', type=Path, default=Path(AUDIT_PATH))
    parser.add_argument('--check', action='store_true', help='Validate component admissions without modifying files')
    args = parser.parse_args(argv)
    R = Path.cwd()
    review_path = args.review.resolve()
    audit_path = args.audit.resolve()
    review = json.loads(review_path.read_text())
    audit = json.loads(audit_path.read_text())
    count = validate_component_admission(review, audit, R)
    if args.check:
        print(f'Component admission current: {count} verified models; no files changed.')
        return
    W = R.parent
    L = W / 'GGD-Asset-Library'
    B = R / 'materials/hero-model-library'
    E = B / 'priority-evidence/palworld-materials'
    E.mkdir(parents=True, exist_ok=True)
    T = R / 'tools/hero-model-library/source-workflows/palworld/material-replays'
    def write(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
    def copy(s,d):
     d.parent.mkdir(parents=True,exist_ok=True)
     assert not d.exists() or sha(s)==sha(d),str(d)
     if not d.exists():shutil.copyfile(s,d)
     return dict(path=str(d.relative_to(R)) if d.is_relative_to(R) else str(d),sha256=sha(d),bytes=d.stat().st_size)
    def append(rows,new):
     found=next((x for x in rows if x['id']==new['id']),None)
     if found is None:rows.append(new)
     else:assert found==new,new['id']
    paths={key:B/name for key,name in [('downloads','download-sources.json'),('archives','public-source-files.json'),('supplement','design-backlog/sources-supplemental.json')]}
    docs={k:json.loads(p.read_text()) for k,p in paths.items()};inputs=[dict(path=str(p.relative_to(R)),sha256=sha(p)) for p in paths.values()]
    sources={s['id']:s for s in docs['downloads']['publicSources']};identities={s['id']:s for s in docs['supplement']['characters']};byroot={};copies=[];saved=[]
    for b in review['backups']:
     root=Path(b['sourceRoot']);archive=Path(b['archive']['path']);back=Path(b['existingFullGetReadback']['path'])
     assert sha(archive)==sha(back)==b['archive']['sha256']
     assert b['recordedFullGetVerified'] and b['allTarMembersMatchCurrentLocalBytes']
     entries=[]
     with tarfile.open(back,'r:gz') as tf:
      files=[m for m in tf.getmembers() if m.isfile()]
      assert len(files)==b['archiveFileCount']
      prefix='' if all((root/m.name).is_file() for m in files) else root.name
      for m in files:
       name=Path(m.name);rel=name.relative_to(prefix) if prefix else name
       assert not rel.is_absolute() and '..' not in rel.parts
       p=root/rel;payload=tf.extractfile(m).read();digest=hashlib.sha256(payload).hexdigest()
       assert p.is_file() and p.stat().st_size==len(payload) and sha(p)==digest
       entries.append(dict(path=rel.as_posix(),bytes=len(payload),sha256=digest))
     durable=L/'archives/palworld-materials-integrated-20260911'/root.name
     cp=durable/'source.tar.gz';rp=durable/'readback.tar.gz';copy(archive,cp);copy(back,rp)
     sid='conversion-'+root.name
     record=dict(id=sid,localPath=root.relative_to(W).as_posix(),localArchive=str(cp),s3Uri=b['s3Uri'],bytes=archive.stat().st_size,sha256=sha(archive),archiveFormat='tar-gzip',archiveMemberRoot=prefix,readbackVerified=True,fullReadbackVerified=True,readbackPath=str(rp),resourceRole='model-conversion-backup',files=entries)
     append(docs['archives']['sources'],record);byroot[root]=record;saved.append({k:v for k,v in record.items() if k!='files'})
     copies.append(copy(Path(b['receipt']['path']),E/'backups'/f'{root.name}.json'))
     for p in sorted(root.rglob('*')):
      if not p.is_file():continue
      rel=p.relative_to(root)
      if (rel.parts[0]=='tools' and p.suffix in {'.py','.js','.mjs','.cjs','.mts','.ts','.sh','.html'}) or rel.as_posix()=='README.md':copies.append(copy(p,T/root.name/rel))
      elif len(rel.parts)==1 and p.suffix=='.json' and any(x in p.stem for x in ['manifest','candidates','receipt','files-sha']):copies.append(copy(p,E/'controls'/root.name/rel))
    limits={
     'jetragon':['原生29條目／28種不同內容；未提供Death與六態映射。','次表面散射與眼睛／晶體透明深度細節仍與原作著色器有差異。'],
     'astralym':['256px元件只含Idle／Walk；完整58條目另存，含57段變動與1個固定姿勢。','23928面、435動畫通道接近限制；眼睛透明、塗層與原作著色仍待驗收。','未提供Death及六態映射。'],
     'cattiva':['保留原生33動作；未提供Death及六態映射。','眼嘴透明、深度偏移與互動表情UV尚未完全對應原作。']}
    new=[]
    for c in review['candidates']:
     p=Path(c['model']['path']);assert sha(p)==c['model']['sha256'] and p.stat().st_size==c['model']['bytes']
     key,label,component=CANDIDATE_SPECS[c['id']]
     source_id={'jetragon':'opgg-palworld-jetragon','astralym':'opgg-palworld-astralym-2026081102','cattiva':'palworld-cattiva-opgg'}[key]
     identity=identities['community:palworld-'+key];source=sources[source_id];root=next(root for root in byroot if p.is_relative_to(root));a=byroot[root]
     entry=dict(id=c['id'],candidateId=c['id'],label=identity['name']+'／'+label,character=identity['name'],library='public-community',path=str(p),**{k:c['model'][k] for k in ['bytes','sha256']},format='glb',readiness='material-bound-component-pending-hero-binding' if component else 'material-bound-reserve-pending-ggd-limits-and-hero-binding',existsLocal=True,resourceRole='character-body',sourceId=source_id,sourceUrl=source['url'],sourceWork='幻獸帕魯／Palworld',heroIds=[],defaultEligible=False,automaticEligible=False,componentReady=component,runtimeSelectable=False,boneCount=sum(c['bones']),nativeAnimationCount=c['timeChangingClipCount'],animationClipCount=c['storedAnimationEntries'],uniqueAnimationContentCount=c['uniqueTrackSignatureCount'],staticPoseClipCount=len(c['staticClips']),animationScope=c['animationScope'],animationNames=c['animationNames'],proceduralAnimationCount=0,sourceSamplePreservationVerified=c['allSelectedNativeTrackSamplesIdenticalToFrozenSource'],backupArchiveId=a['id'],s3ArchiveUri=a['s3Uri'],s3ArchiveMember=((a['archiveMemberRoot']+'/') if a['archiveMemberRoot'] else '')+p.relative_to(root).as_posix(),limitations=limits[key],ggdValidationEvidence='materials/hero-model-library/priority-evidence/palworld-materials/current-contract-audit.json')
     if component:
      entry['gitPath']='content/assets/models/community/'+entry['sha256']+'.glb'
      copies.append(copy(p,R/entry['gitPath']))
     append(identity['modelCandidates'],entry);append(source['modelCandidates'],entry)
     delivery=dict(id=a['id'],role='material-conversion',backupArchiveId=a['id'],localPath=a['localPath'],s3Uri=a['s3Uri'],sha256=a['sha256'],readbackVerified=True,modelCandidateIds=[x['id'] for x in review['candidates'] if Path(x['model']['path']).is_relative_to(root)])
     append(source.setdefault('supplementalDeliveries',[]),delivery);new.append(entry)
    assert len(new)==7 and sum(c['componentReady'] for c in new)==3
    assert sum(len(identities['community:palworld-'+key]['modelCandidates']) for key in ['jetragon','astralym','cattiva'])==22
    for k,p in paths.items():write(p,docs[k])
    write(E/'integration.json',dict(schema='ggd-palworld-material-integration@1',sourceInputPins=inputs,sourceReviewPath=str(review_path),sourceReviewSha256=sha(review_path),componentAdmissionAudit=dict(path=str(audit_path),sha256=sha(audit_path)),newCandidates=new,archives=saved,gitCopies=copies,originalCandidatesPreserved=15,totalPreservedCandidates=22,newComponentCount=3,heroDefinitionsCreated=0,runtimeRegistrationComplete=False))
    print('Integrated 7 variants, 3 Git components, 4 archives; preserved 15 prior variants.')


if __name__ == "__main__":
    main()
