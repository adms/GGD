import {pathToFileURL} from 'node:url';import path from 'node:path';
const {buildServer}=await import(pathToFileURL(path.join(process.cwd(),'apps/content-api/src/server.ts')));
const app=buildServer({contentDir:'/private/tmp/ggd-lol-forge-preview/content',repoRoot:process.cwd(),backupDir:'/private/tmp/ggd-lol-forge-preview/backups',reviewDir:'/private/tmp/ggd-lol-forge-preview/reviews',watch:true,logger:true,editorOrigins:['http://127.0.0.1:5199','http://127.0.0.1:60800']});
await app.listen({port:8799,host:'127.0.0.1'});
