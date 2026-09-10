import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const repo=process.cwd();
const base=process.argv[2]??'/private/tmp/ggd-lol-models';
const {readGlb,measureGlb,sha256}=await import(pathToFileURL(path.join(repo,'tools/model-budget/glb.ts')));
const {pruneAnimations,pruneDiff}=await import(pathToFileURL(path.join(repo,'tools/model-budget/trimClips.ts')));
const source=JSON.parse(fs.readFileSync(path.join(base,'conversion-manifest.json'),'utf8'));
const selection=JSON.parse(fs.readFileSync(path.join(base,'clip-selection.json'),'utf8'));
const models=[];fs.mkdirSync(path.join(base,'ggd-selected'),{recursive:true});
for(const row of source.models){
 const file=path.join(base,row.file),keep=selection.models[row.character];
 const output=path.join(base,'ggd-selected',row.character+'.glb');
 const data=pruneAnimations(readGlb(file),keep);fs.writeFileSync(output,data);
 const diff=pruneDiff(file,output,keep);if(diff!==null)throw new Error(row.character+': '+diff);
 const metric=measureGlb(output);
 models.push({...row,file:path.relative(base,output),animations:keep,bytes:data.length,sha256:sha256(data),sourceSha256:row.sha256,nonAnimationDataIdentical:true,metrics:metric});
 console.log(JSON.stringify({character:row.character,clips:metric.clips,bytes:data.length,channels:metric.channelsPerFrame,nonAnimationDataIdentical:true}));
}
fs.writeFileSync(path.join(base,'ggd-selected-manifest.json'),JSON.stringify({schema:'ggd-lol-selected-models@1',models},null,2)+'\n');
