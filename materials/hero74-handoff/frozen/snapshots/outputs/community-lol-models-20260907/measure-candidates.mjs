import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const base=process.argv[2]??'/private/tmp/ggd-lol-models';
const {measureGlb,sha256}=await import(pathToFileURL(path.join(process.cwd(),'tools/model-budget/glb.ts')));
const m=JSON.parse(fs.readFileSync(path.join(base,'ggd-runtime-candidate-manifest.json'),'utf8'));
const models=m.models.map(row=>{const file=path.join(base,row.file),bytes=fs.readFileSync(file),metrics=measureGlb(file);if(sha256(bytes)!==row.sha256||metrics.channelsPerFrame!==row.maxChannels||metrics.clips!==6)throw Error('candidate drift '+row.character);return{character:row.character,file:row.file,sha256:row.sha256,metrics,withinChannelBudget:metrics.channelsPerFrame<=160};});
const result={schema:'ggd-lol-runtime-candidate-metrics@1',channelLimit:160,models,totalBytes:models.reduce((n,m)=>n+m.metrics.fileBytes,0),withinChannelBudget:models.filter(m=>m.withinChannelBudget).length};fs.writeFileSync(path.join(base,'runtime-candidate-metrics.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({models:models.length,totalBytes:result.totalBytes,withinChannelBudget:result.withinChannelBudget}));
