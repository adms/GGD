const fs=require('fs'),path=require('path');
const validator=require('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-hero-model-options/node_modules/.pnpm/gltf-validator@2.0.0-dev.3.10/node_modules/gltf-validator');
const root='/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/psp-cloud-native-motion-batch4';
const file='converted/cloud-native-13-motions.glb';
(async()=>{
  const report=await validator.validateBytes(new Uint8Array(fs.readFileSync(path.join(root,file))),{uri:file,maxIssues:0});
  fs.writeFileSync(path.join(root,'analysis/khronos-validation-unlimited.json'),JSON.stringify({validator:'gltf-validator@2.0.0-dev.3.10',options:{maxIssues:0},report},null,2)+'\n');
  console.log(JSON.stringify({errors:report.issues.numErrors,warnings:report.issues.numWarnings,infos:report.issues.numInfos,hints:report.issues.numHints,truncated:report.issues.truncated,animationCount:report.info.animationCount}));
  if(report.issues.numErrors||report.issues.truncated)process.exitCode=1;
})();
