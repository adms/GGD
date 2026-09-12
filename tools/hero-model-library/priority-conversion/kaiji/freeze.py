"""Pin the reviewed Kaiji delivery and append its reproducible runtime input."""
from pathlib import Path
import hashlib,json,shutil

ROOT=Path(__file__).resolve().parents[4]
BASE=ROOT/'materials/hero-model-library'
SOURCE=ROOT.parent/'GGD-Asset-Library/intake/public-models-20260911/parallel-kaiji-source-audit'
CONVERSION=ROOT.parent/'GGD-Asset-Library/intake/conversions-20260911/kaiji-community-body-v1'
RUNTIME=CONVERSION/'runtime-v2'
EVIDENCE=BASE/'priority-evidence/kaiji-community'
CID='kaiji-holya-procedural-six-state-v1'
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,obj):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
def copy(source,target):
    target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists():assert target.read_bytes()==source.read_bytes(),target
    else:shutil.copyfile(source,target)

def main():
    prepared=read(RUNTIME/'receipt.json');doc=read(RUNTIME/'model.json')
    run=read(CONVERSION/'animated-webgl-v2/run.json');render=read(CONVERSION/'animated-webgl-v2/proof.json')
    assert sha(RUNTIME/'body.glb')==prepared['sha256']==run['sourceSha256']=='9a52fa1e9a122bc0ac37cd0819bed82d36b468cccfeec88dc4b012241765595a'
    assert prepared['sharedPreparePassed'] and prepared['sharedVerifyPassed']
    assert prepared['khronos']==dict(errors=0,warnings=0,infos=0)
    assert run['complete'] and not run['errorExists'] and len(render['shots'])==36
    assert all(s['finite'] for s in render['shots'])
    # These are small final validation receipts; native arrays remain in the preserved intake.
    for origin,name in [
        (RUNTIME/'receipt.json','preparation.json'),(RUNTIME/'khronos.json','khronos.json'),
        (CONVERSION/'animated-v1/animation.json','animation.json'),
        (CONVERSION/'animated-webgl-v2/proof.json','render-proof.json'),
        (CONVERSION/'animated-webgl-v2/run.json','render-run.json'),
        (CONVERSION/'animated-webgl-v2/contact.png','contact.png'),
        (Path('/private/tmp/ggd-kaiji-conversion-preflight.json'),'native-preflight.json'),
        (Path('/private/tmp/ggd-kaiji-source-s3-backup.json'),'source-s3-backup.json'),
        (Path('/private/tmp/ggd-png-sar-fix-receipt.json'),'png-sar-fix.json'),
        (Path('/private/tmp/ggd-kaiji-runtime-v2-independent-check.json'),'independent-check.json'),
        (SOURCE/'public-source-entry.json','original-source-entry.json')]:copy(origin,EVIDENCE/name)
    limitations=[
        '六段皆為 GGD 程序化基本動作，非來源原生動畫或重定向動作；原包動畫、音效、語音、特效均為零。',
        '完整原生 1766 頂點／2176 三角、33 骨、三材質及全部權重保留。高解析原圖另存，成品縮圖為256×256、256×256及256×128。',
        '已抽查36個時間點及視角；程序化跑步、伸手攻擊及側倒不代表原作招式，未包含腳部IK、布料模擬、技能時序或完整實戰驗收。',
        '每幀接地修正在30Hz關鍵格計算；抽查插值最低約0.39毫米穿地，轉場仍需遊戲驗收。',
        '作者命名的開司社群模型；原包未附獨立散布授權聲明，保留來源原文與權利狀態。',
        '技術模型驗收及後台登記與正式站部署分開記錄。']
    item=dict(candidateId=CID,heroId='b2-kaiji',name='伊藤開司',label='伊藤開司｜holya 社群模型＋GGD 基本六態',
        localRuntimeRoot=str(RUNTIME),sha256=prepared['sha256'],documentSha256=sha(RUNTIME/'model.json'),
        source=dict(kind='exact',tier='original',selectionClass='community-mod',library='Lethal Company MOD／holya',character='伊藤開司',work='賭博默示錄',reference='https://thunderstore.io/c/lethal-company/p/holya/kaiji_suit_2/'),
        nativeAnimationCount=0,proceduralAnimationCount=6,validation='shared-prepare-verify-khronos-and-36-sample-babylon-render-passed',limitations=limitations)
    inputs=read(BASE/'priority-runtime-inputs.json');existing=[x for x in inputs['entries'] if x['candidateId']==CID]
    if existing:assert existing==[item]
    else:inputs['entries'].append(item);write(BASE/'priority-runtime-inputs.json',inputs)
    receipt=dict(schema='ggd-kaiji-runtime-delivery@1',candidateId=CID,heroId='b2-kaiji',sourceId='thunderstore-holya-kaiji-suit2',sourceUrl=item['source']['reference'],
        localSourceRoot=str(SOURCE),localConversionRoot=str(CONVERSION),runtimeModelKey=doc['id'],glbPath='content/'+doc['glbPath'],sha256=prepared['sha256'],bytes=prepared['bytes'],documentSha256=item['documentSha256'],
        nativeAnimationCount=0,proceduralAnimationCount=6,audioCount=0,vfxCount=0,visualSamples=36,
        visualReview='Front, side, all six midpoint states, quarter-cycle run and terminal death inspected; recognizable face, complete clothing textures and body retained. Generic gestures only.',
        readiness='runtime-verified-awaiting-registration',productionDeployed=False,limitations=limitations,
        evidence=[dict(path=p.relative_to(ROOT).as_posix(),sha256=sha(p)) for p in sorted(EVIDENCE.iterdir()) if p.name!='receipt.json'])
    write(EVIDENCE/'receipt.json',receipt)
    # A one-hero manifest lets the existing service register only this reviewed option.
    release=CONVERSION/'registration-release';release.mkdir(exist_ok=True)
    copy(RUNTIME/'body.glb',release/doc['glbPath']);copy(RUNTIME/'model.json',release/'models'/(doc['id']+'.json'))
    write(release/'manifest.json',dict(schema='ggd-hero-model-library@1',models=[dict(modelKey=doc['id'],glbPath=doc['glbPath'],sha256=item['sha256'],documentSha256=item['documentSha256'])],
        heroes=[dict(id='b2-kaiji',name=item['name'],options=[dict(sourceId='runtime:'+CID,sourceModelKey=doc['id'],label=item['label'],source=item['source'])],pending=[])]))
    print(json.dumps(dict(runtimeModelKey=doc['id'],release=str(release),evidence=str(EVIDENCE))))

if __name__=='__main__':main()
