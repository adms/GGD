import {File} from 'megajs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pipeline} from 'node:stream/promises';
const root=process.argv[2];
const entries=[['mai-xiv-original','https://mega.nz/#!m4cXSbiR!eq3BcrAIJwgslOHWxYV-OfGVt5xdby2BXoiy2ppeM0k'],['iori-xiv-original','https://mega.nz/#!T4diRTpS!seKAOGjWAJJ4lyGzzXgNN5HC3XXH9AXtiUHposCmHe8']];
File.defaultHandleRetries=(tries,error,cb)=>cb(error);
for (const [id,url] of entries) {
 const dir=path.join(root,id);fs.mkdirSync(dir,{recursive:true});const receipt={sourceId:id,publicShareUrl:url,auth:'anonymous public author share',startedAt:new Date().toISOString()};
 const timer=setTimeout(()=>{receipt.error='300 second batch ceiling';fs.writeFileSync(path.join(dir,'download-receipt.json'),JSON.stringify(receipt,null,2));process.exit(1)},300000);
 try { const file=File.fromURL(url); await file.loadAttributes(); receipt.filename=file.name;receipt.expectedBytes=file.size;
 console.log(JSON.stringify({id,name:file.name,bytes:file.size}));
 if(!file.name || path.basename(file.name)!==file.name || file.size>200000000)throw Error('invalid filename or package above 200 MB batch limit');
 const dest=path.join(dir,file.name),part=dest+'.part';if(fs.existsSync(dest)||fs.existsSync(part))throw Error('refuse overwriting prior files');
 await pipeline(file.download({maxConnections:1,handleRetries:(tries,error,cb)=>cb(error)}),fs.createWriteStream(part,{flags:'wx'}));
 const bytes=fs.statSync(part).size;if(bytes!==file.size)throw Error('size mismatch');const hash=crypto.createHash('sha256');for await(const b of fs.createReadStream(part))hash.update(b);receipt.bytes=bytes;receipt.sha256=hash.digest('hex');fs.renameSync(part,dest);receipt.path=dest;receipt.status='downloaded-file';
 }catch(e){receipt.status='failed';receipt.error=String(e.message)}finally{clearTimeout(timer);receipt.completedAt=new Date().toISOString();fs.writeFileSync(path.join(dir,'download-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));}
}
