import { appendFileSync } from 'node:fs';
export async function resolve(specifier, context, next) {
  const result = await next(specifier, context);
  if (result.url.startsWith("file:///Users/Takuro/Dropbox/%E6%88%91%E7%9A%84%20Mac%20(Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/") && !result.url.includes('/node_modules/')) throw Error('original workspace source imported: ' + result.url);
  if (result.url.startsWith("file:///private/tmp/ggd-source-execution-ZSb7yE/hero-generator/") && result.url.includes('/packages/shared/src/')) appendFileSync("/private/tmp/ggd-source-execution-ZSb7yE/hero-generator/loaded-sources.txt", result.url + '\n');
  return result;
}