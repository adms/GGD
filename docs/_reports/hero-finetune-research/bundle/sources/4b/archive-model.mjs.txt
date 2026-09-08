// Preserve an already evaluated local model; never promote or execute it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Writable} from 'node:stream';
async function hash(file){const h=crypto.createHash('sha256');await pipeline(fs.createReadStream(file),new Writable({write(chunk,encoding,done){h.update(chunk);done();}}));return h.digest('hex');}
const [receiptPath,source,destination]=process.argv.slice(2);
if(![receiptPath,source,destination].every(x=>x&&path.isAbsolute(x)))throw Error('ABSOLUTE_PATHS_REQUIRED');
const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
if(receipt.status!=='roundtrip-pass')throw Error('ROUNDTRIP_RECEIPT_REQUIRED');
if(fs.existsSync(destination))throw Error('REFUSE_OVERWRITE');
const root=fs.realpathSync(source);
const files=receipt.files.filter(x=>path.dirname(x.path)===root);
if(!files.length||!files.some(x=>x.path.endsWith('model.safetensors')))throw Error('MODEL_RECEIPTS_MISSING');
if(JSON.stringify(fs.readdirSync(root).sort())!==JSON.stringify(files.map(x=>path.basename(x.path)).sort()))throw Error('UNRECORDED_SOURCE_FILE');
for(const f of files){if(!fs.lstatSync(f.path).isFile()||fs.statSync(f.path).size!==f.bytes||await hash(f.path)!==f.sha256)throw Error('SOURCE_HASH_MISMATCH:'+f.path);}
fs.mkdirSync(destination,{recursive:true});
const copied=[];
for(const f of files){const target=path.join(destination,path.basename(f.path));fs.copyFileSync(f.path,target,fs.constants.COPYFILE_EXCL);if(fs.statSync(target).size!==f.bytes||await hash(target)!==f.sha256)throw Error('COPY_HASH_MISMATCH:'+target);copied.push({name:path.basename(target),bytes:f.bytes,sha256:f.sha256});}
const manifest={schema:'ggd-forge-preserved-model@1',status:'byte-verified-research-copy',releaseQualified:false,createdAt:new Date().toISOString(),source:root,receipt:path.resolve(receiptPath),receiptSha256:await hash(receiptPath),files:copied,totalBytes:copied.reduce((n,x)=>n+x.bytes,0),warning:'Research artifact only. Serialization hashes do not prove semantic quality; consult this experiment\'s paired evaluation. Not activated in Editor. 16GB Mac not tested.'};
fs.writeFileSync(path.join(destination,'PRESERVATION.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(manifest));
