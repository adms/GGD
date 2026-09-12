const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const validator = require(path.resolve(process.argv[2]));
(async()=>{
 const file=path.join(root,'decoded/cattiva-quantization-declared.glb');
 const r=await validator.validateBytes(new Uint8Array(fs.readFileSync(file)),{uri:'cattiva.glb',maxIssues:10000});
 fs.writeFileSync(path.join(root,'analysis/gltf-validation-quantization.json'),JSON.stringify(r,null,2)+'\n');
 console.log(JSON.stringify(r.issues));
 process.exitCode=r.issues.numErrors?1:0;
})();
