"""Compose the fixed Git resource entry point without rewriting immutable releases."""
import argparse, json, hashlib, subprocess
from pathlib import Path
from build_palworld_index import model_components
from weapon_components import source_weapon_components
from skinned_components import source_skinned_components
ROOT=Path(__file__).resolve().parents[2]
def read(path):return json.loads(path.read_text())
def verify_component_git_contents(components, repo=ROOT):
    """Check staged blobs, so ignored or unstaged local copies cannot be published."""
    for component in components:
        path = component['gitPath']
        result = subprocess.run(['git', 'show', ':' + path], cwd=repo, capture_output=True)
        if result.returncode:
            raise ValueError('Model component is absent from the Git index: ' + path)
        if len(result.stdout) != component['bytes'] or hashlib.sha256(result.stdout).hexdigest() != component['sha256']:
            raise ValueError('Model component Git blob differs from the catalog: ' + path)


def build():
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
        modelDesignBacklog='materials/hero-model-library/已取得模型待設計英雄.json',
        modelDesignBacklogDocument='materials/hero-model-library/已取得模型待設計英雄.md',
        palworldResourceIndex='materials/hero-model-library/palworld/帕魯三角色素材索引.json',
        palworldResourceDocument='materials/hero-model-library/palworld/帕魯三角色素材索引.md',
        projectSevenJapaneseVoiceIndex='materials/hero-model-library/lol-project-seven/seven-voice-index.json',
        note='Immutable releases, new canonical models and all source alternatives remain available. Registration is separate from production deployment; raw/intermediate sources remain local and S3 legacy.')
    component_path=base/'palworld/帕魯三角色素材索引.json'
    component_data=read(component_path)
    for pin in component_data['inputs']:
        if hashlib.sha256((ROOT/pin['gitPath']).read_bytes()).hexdigest()!=pin['sha256']:
            raise ValueError('Refresh Palworld component index: '+pin['gitPath'])
    components=model_components(component_data,ROOT)
    component_source_path=base/'download-sources.json'
    components.extend(source_weapon_components(read(component_source_path),ROOT))
    components.extend(source_skinned_components(read(component_source_path),ROOT))
    result.update(modelComponents=components,modelComponentCount=len(components),
        modelComponentIndex=dict(gitPath=str(component_path.relative_to(ROOT)),
            sha256=hashlib.sha256(component_path.read_bytes()).hexdigest()),
        modelComponentSourceIndex=dict(gitPath=str(component_source_path.relative_to(ROOT)),
            sha256=hashlib.sha256(component_source_path.read_bytes()).hexdigest()))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify the generated index without writing it.')
    parser.add_argument('--check-git', action='store_true', help='Also require exact component bytes in the Git index.')
    args = parser.parse_args()
    result = build()
    if args.check_git:
        verify_component_git_contents(result['modelComponents'])
    path = ROOT/'materials/asset-library/current-resources.json'
    encoded = json.dumps(result, ensure_ascii=False, indent=2)+'\n'
    if args.check:
        if path.read_text() != encoded:
            raise ValueError('Refresh current resource index: ' + str(path))
    else:
        path.write_text(encoded)
    print('Current resource model sources:', result['modelSourceCount'], 'components:', result['modelComponentCount'])
if __name__=='__main__':main()
