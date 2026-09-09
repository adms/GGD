// Offline report layout/interaction checks; no model, network or GPU work.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';

const {values} = parseArgs({options: {
  report: {type: 'string'}, out: {type: 'string'}, playwright: {type: 'string'},
}});
assert(values.report && values.out && values.playwright, '--report --out --playwright required');
const report = path.resolve(values.report), out = path.resolve(values.out);
assert(fs.statSync(report).isFile());
assert(!fs.existsSync(out), 'REFUSE_OVERWRITE');
const {chromium} = createRequire(import.meta.url)(values.playwright);
fs.mkdirSync(out, {recursive: true});
const browser = await chromium.launch({headless: true, channel: 'chrome', args: ['--disable-gpu']});
const results = [];
try {
  for (const width of [360, 736, 1024]) for (const colorScheme of ['light', 'dark']) {
    const page = await browser.newPage({viewport: {width, height: 950}, colorScheme, deviceScaleFactor: 1});
    const errors = [], externalRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/https?:\/\//, route => {externalRequests.push(route.request().url()); return route.abort();});
    await page.goto(pathToFileURL(report).href);
    const metrics = await page.evaluate(() => ({
      bodyWidth: document.documentElement.scrollWidth, viewport: innerWidth,
      sections: document.querySelectorAll('main > section').length,
      heroRows: document.querySelectorAll('main > section:nth-of-type(5) tbody tr').length,
      bars: document.querySelectorAll('.bar').length,
      unknownWarning: document.body.innerText.includes('未測，不能當 0'),
      unresolved: document.body.innerText.includes('{{'),
    }));
    await page.screenshot({path: path.join(out, `${width}-${colorScheme}.png`), fullPage: true});
    const detail = page.locator('details').last();
    await detail.locator('summary').click();
    const detailOpened = await detail.evaluate(element => element.open);
    await detail.locator('summary').click();
    results.push({width, colorScheme, ...metrics, errors, externalRequests, detailOpened});
    await page.close();
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(results, null, 2) + '\n', {flag: 'wx'});
assert(results.every(r => r.errors.length === 0 && r.externalRequests.length === 0 &&
  r.bodyWidth <= r.viewport && r.sections === 6 && r.heroRows === 17 && r.bars === 3 &&
  r.unknownWarning && !r.unresolved && r.detailOpened), 'REPORT_VISUAL_CHECK_FAILED');
console.log(JSON.stringify(results));
