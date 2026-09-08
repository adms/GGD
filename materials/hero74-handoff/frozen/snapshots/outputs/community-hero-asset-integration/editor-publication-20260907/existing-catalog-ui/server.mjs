import {pathToFileURL} from 'node:url';
const {buildServer}=await import(pathToFileURL(process.cwd()+'/apps/content-api/src/server.ts'));
const app=buildServer({contentDir:'/private/tmp/ggd-existing-catalog-save-acceptance/content',backupDir:'/private/tmp/ggd-existing-catalog-save-acceptance/backups',repoRoot:process.cwd(),watch:false,logger:false,editorOrigins:['http://127.0.0.1:60805']});
await app.listen({host:'127.0.0.1',port:8810});console.log('Isolated existing catalog API ready :8810');
