import { expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { modelUploadFixture } from '../../packages/shared/src/content/modelUpload/fixtures';
import { encodeUploadGlb } from '../../packages/shared/src/content/modelUpload/glb';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const sha=(data: Uint8Array|string)=>createHash('sha256').update(data).digest('hex');

it('registers every ready source including manual-only proxies and paid aliases, and is idempotent',()=>{
  const root=mkdtempSync(join(tmpdir(),'ggd-library-register-'));
  try {
    const content=join(root,'content'),release=join(root,'release'),report=join(root,'report.json');
    const save=(base:string,path:string,data:string|Uint8Array)=>{const file=join(base,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,data);};
    const fixture=modelUploadFixture();fixture.json.animations![1]!.name='Cast';
    const bytes=encodeUploadGlb(fixture.json,fixture.bin);
    const doc=(id:string)=>({id,schema:'model@1',glbPath:'assets/body.glb',scale:1,collisionRadius:.6,
      clipMap:{idle:'Motion',run:'Motion',attack:'Cast',cast:'Cast',hurt:'Motion',death:'Cast'}});
    const candidate=JSON.stringify(doc('candidate'));
    save(release,'assets/body.glb',bytes);save(release,'models/candidate.json',candidate);
    save(content,'assets/body.glb',bytes);save(content,'models/original.json',JSON.stringify(doc('original')));
    const hero={...JSON.parse(readFileSync(join(repo,'content/champions/sela.json'),'utf8')),id:'source-retention-test',modelKey:'original'};
    save(content,'champions/source-retention-test.json',JSON.stringify(hero));
    const options=[
      {sourceId:'retained-proxy',label:'Manual visual proxy',source:{kind:'style-proxy',tier:'300heroes',character:'proxy',work:'fixture',library:'300heroes',reference:'fixture:proxy'}},
      {sourceId:'paid-v1',label:'Paid delivery v1',source:{kind:'exact',tier:'original',character:'hero',work:'fixture',library:'paid forum',reference:'fixture:paid:v1'}},
      {sourceId:'paid-v2',label:'Paid delivery v2',source:{kind:'exact',tier:'original',character:'hero',work:'fixture',library:'paid forum',reference:'fixture:paid:v2'}},
    ].map(o=>({...o,sourceModelKey:'candidate'}));
    const manifest={schema:'ggd-hero-model-library@1',models:options.map(o=>({id:o.sourceId,modelKey:'candidate',glbPath:'assets/body.glb',sha256:sha(bytes),documentSha256:sha(candidate)})),
      heroes:[{id:hero.id,name:hero.name,options}]};
    save(release,'manifest.json',JSON.stringify(manifest));
    const run=()=>execFileSync(process.execPath,['--import','tsx',join(repo,'tools/hero-model-library/register.mts'),'--release',release,'--content',content,'--report',report],{cwd:repo,encoding:'utf8'});
    run();
    const first=JSON.parse(readFileSync(join(content,'champions/source-retention-test.json'),'utf8'));
    const versions=first.modelVersions;
    expect(versions).toHaveLength(4);
    expect(new Set(versions.map((v:any)=>v.modelKey)).size).toBe(4);
    expect(versions.filter((v:any)=>v.source.library==='paid forum')).toHaveLength(2);
    const proxy=versions.find((v:any)=>v.source.kind==='style-proxy');
    expect(proxy.automaticEligible).toBe(false);
    expect(first.modelKey).not.toBe(proxy.modelKey);
    expect(JSON.parse(readFileSync(report,'utf8')).heroes[0].manualOnly).toEqual(['retained-proxy']);
    run();
    expect(JSON.parse(readFileSync(join(content,'champions/source-retention-test.json'),'utf8'))).toEqual(first);
    for(const version of versions){
      const model=JSON.parse(readFileSync(join(content,'models',version.modelKey+'.json'),'utf8'));
      expect(sha(readFileSync(join(content,model.glbPath)))).toBe(version.binarySha256);
    }
  } finally { rmSync(root,{recursive:true,force:true}); }
},30000);
