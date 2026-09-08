import {readFileSync,writeFileSync} from 'node:fs';import {pathToFileURL} from 'node:url';
const repo=process.cwd(),root='/private/tmp/ggd-model-upload-acceptance';
const {captureHeroCatalogVersion}=await import(pathToFileURL(repo+'/apps/content-api/src/catalogVersions.ts').href);
const {ImportStore}=await import(pathToFileURL(repo+'/apps/content-api/src/importStore.ts').href);
const overlay=readFileSync(root+'/data/content-overlay/overlay.json');
const saved=captureHeroCatalogVersion(repo+'/content',new ImportStore({dir:root+'/imports'}),{gameRevision:JSON.parse(readFileSync(root+'/service-current-public.json','utf8')).revision,overlay});
const report={status:'archived',scope:'Initial immutable full catalog baseline only; individual hero selection, activation and automatic revision history still require integration.',workId:saved.record.workId,versionId:saved.record.versionId,snapshotDigest:saved.record.snapshotDigest,heroes:saved.manifest.heroes,fileCount:saved.record.files.length,bytes:saved.bytes,stored:saved.stored,activeChanged:false};
writeFileSync('/private/tmp/ggd-community37-editor-publish/existing-catalog-baseline.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,heroes:report.heroes.length}));
