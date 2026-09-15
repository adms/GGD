import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ModelVersions } from '../../apps/content-api/src/modelVersions';
import { zModelVersionCommand } from '../../packages/shared/src/content/schema/championModelVersions';
const root=resolve('content'), manifest=JSON.parse(readFileSync('materials/hero-model-library/workflow-model-options.json','utf8'));
const service=new ModelVersions(root), results:any[]=[];
for(const h of manifest.heroes){
  if(!h.id.startsWith('b2-')&&!h.id.startsWith('community-review-')&&!h.id.startsWith('example:'))continue;
  for(const o of h.options){
    const result:any={heroId:h.id,runtimeHeroId:h.runtimeHeroId,sourceId:o.sourceId,modelKey:o.sourceModelKey};
    try{
      const state=service.state(h.runtimeHeroId);
      const prepared=await service.prepare(h.runtimeHeroId,zModelVersionCommand.parse({action:'register',expectedHash:state.expectedHash,sourceModelKey:o.sourceModelKey,label:o.label,source:o.source,automaticEligible:o.source.kind!=='style-proxy'}));
      result.status='backend-prepare-passed';result.versionCount=prepared.champion.modelVersions?.length;
    }catch(error){result.status='blocked';result.error=String(error);}
    results.push(result);console.log(JSON.stringify(result));
    writeFileSync('/private/tmp/ggd-workflow-backend-inspection.json',JSON.stringify({sourceCommit:manifest.sourceCommit,results},null,2)+'\n');
  }
}
