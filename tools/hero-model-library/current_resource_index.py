"""Compose the fixed Git resource entry point without rewriting immutable releases."""
import json, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def read(path):return json.loads(path.read_text())
def main():
    base=ROOT/'materials/hero-model-library';sources=[];models={};registered={}
    reviewPath=base/'post-registration-review.json'
    review=read(reviewPath) if reviewPath.exists() else {'affectedSources':[]}
    reviewByKey={key:item for item in review['affectedSources'] for key in item['modelKeys']}
    for p in (ROOT/'content/champions').glob('*.json'):
        if p.name.startswith('_'):continue
        c=read(p)
        for v in c.get('modelVersions',[]):registered.setdefault(v['sourceModelKey'],[]).append(c['id'])
    for name in ['manifest.json','workflow-model-options.json','priority-runtime-options.json']:
        path=base/name;data=read(path)
        sources.append(dict(gitPath=str(path.relative_to(ROOT)),sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
        for m in data['models']:
            item=dict(m,registeredFor=sorted(set(registered.get(m['modelKey'],[]))))
            item['runtimeDropdownRegistered']=bool(item['registeredFor'])
            if m['modelKey'] in reviewByKey:item['pendingGeometryReview']=reviewByKey[m['modelKey']]
            item['gitPath']='content/'+m['glbPath']
            item['modelDocumentGitPath']='content/models/'+m['modelKey']+'.json'
            for rel,digest in [(item['gitPath'],m['sha256']),(item['modelDocumentGitPath'],m['documentSha256'])]:
                if hashlib.sha256((ROOT/rel).read_bytes()).hexdigest()!=digest:raise ValueError('Changed resource: '+rel)
            models[m['id']]=item
    result=dict(schema='ggd-current-resource-index@1',immutableRelease='materials/asset-library/git-release.json',
        modelInventory='materials/hero-model-library/inventory.json',postRegistrationReview='materials/hero-model-library/post-registration-review.json',sourceManifests=sources,
        modelSourceCount=len(models),models=list(models.values()),
        voiceIndex='materials/hero-model-library/voice-index.json',
        projectSevenJapaneseVoiceIndex='materials/hero-model-library/lol-project-seven/seven-voice-index.json',
        note='Immutable releases, new canonical models and all source alternatives remain available. Registration is separate from production deployment; raw/intermediate sources remain local and S3 legacy.')
    (ROOT/'materials/asset-library/current-resources.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print('Current resource model sources:',len(models))
if __name__=='__main__':main()
