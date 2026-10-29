// Isolated browser acceptance: all API responses are synthetic and all other
// network origins are blocked. No owner application or database is accessed.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createServer } from '../../client/node_modules/vite/dist/node/index.js';
import react from '../../client/node_modules/@vitejs/plugin-react/dist/index.js';
import { chromium } from 'playwright';

const server = await createServer({ root: 'client', configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  browser = await chromium.launch({ headless: true, ...(existsSync(chromePath) ? { executablePath: chromePath } : {}) });
  const backgrounds = new Map();
  for (const [theme, width] of [['dark', 1280], ['dark', 390], ['light', 1280], ['light', 390]]) {
    const page = await browser.newPage({ viewport: { width, height: 600 } });
    const errors = [], deletes = [], visibilityWrites = [];
    let failInventory = false, failDelete = false, blocked = false, releaseDelete, ownerClassification = 'unknown', pipelineClassification = 'unknown', pipelineHidden = false, legacyHidden = false;
    const fingerprint = 'a'.repeat(64);
    const watchSource = 'b'.repeat(64);
    const watchFiles = [
      {filename:'sample.mp4',fullPath:'C:\\Fixture\\one\\sample.mp4',sizeBytes:1200,modifiedAt:'2026-10-01T00:00:00.000Z',isImported:true,importedVideoId:'master-1',fileId:'c'.repeat(64),sourceFingerprint:watchSource,hidden:false,visibilitySupported:true},
      {filename:'sample.mp4',fullPath:'C:\\Fixture\\two\\sample.mp4',sizeBytes:2500,modifiedAt:'2026-10-02T00:00:00.000Z',isImported:false,fileId:'d'.repeat(64),sourceFingerprint:watchSource,hidden:false,visibilitySupported:true},
      {filename:'unstable.mp4',fullPath:'C:\\Fixture\\unstable.mp4',sizeBytes:0,modifiedAt:'',isImported:false,fileId:null,sourceFingerprint:null,hidden:false,visibilitySupported:false,visibilityReason:'Identity is unavailable.'},
    ];
    const hiddenWatch = new Map([['e'.repeat(64),{filename:'missing.mp4',fullPath:'C:\\Fixture\\old\\missing.mp4',sizeBytes:300,modifiedAt:'2026-09-01T00:00:00.000Z',fileId:'e'.repeat(64),sourceFingerprint:'f'.repeat(64),currentSource:false,present:null}]]);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== `http://127.0.0.1:${address.port}`) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname === '/api/test-data' && request.method() === 'GET') {
        if (failInventory) return route.fulfill({ status: 500, json: { error: 'Synthetic failure' } });
        const offset = Number(url.searchParams.get('offset'));
        const search = url.searchParams.get('search');
        const records = search === 'missing' ? [] : [
          { type: 'category', id: offset ? 'record-2' : 'record-1', name: offset ? 'Second record' : 'First record', classification: offset ? 'unknown' : ownerClassification, source:'unknown', status:'category', eligibility: ownerClassification === 'owner_marked_keep' && !offset ? 'protected' : 'safe', updatedAt: null, protection: 'Owner review required', dependencies: ['No category references'], eligible: ownerClassification !== 'owner_marked_keep' || !!offset, eligibilityReason: ownerClassification === 'owner_marked_keep' && !offset ? 'Owner marked Keep' : 'No dependencies found' },
          { type: 'account', id: 'protected-1', name: 'Protected account', classification: 'unknown', source:'official_api',status:'connected',eligibility:'protected', updatedAt: null, protection: 'Externally connected', dependencies: ['Published post'], eligible: false, eligibilityReason: 'Publishing history exists' },
        ];
        return route.fulfill({ json: { records, offset, limit: 20, hasMore: !offset && search !== 'missing' } });
      }
      if (url.pathname === '/api/test-data/detail' && request.method() === 'GET') {
        const id=url.searchParams.get('id'), type=url.searchParams.get('type');
        return route.fulfill({json:{record:{type,id,name:id==='record-1'?'First record':id,classification:ownerClassification,source:'manual_upload',status:'library',eligibility:ownerClassification==='owner_marked_keep'?'protected':'safe',eligible:ownerClassification!=='owner_marked_keep',eligibilityReason:ownerClassification==='owner_marked_keep'?'Owner marked Keep':'No dependencies found'},evidence:['Original filename: example.mp4','Duration: 10 seconds','Pipeline original: existence not verified'],relationships:['Publishing destinations: 0'],links:[],complete:true}});
      }
      if (url.pathname === '/api/test-data-metadata/classify' && request.method() === 'POST') {
        const data=request.postDataJSON(), next=data.classification==='test'?'owner_marked_test':data.classification==='keep'?'owner_marked_keep':'unknown';
        if (data.type==='pipeline_job') { assert.equal(data.sourceFingerprint,fingerprint); pipelineClassification=next; } else ownerClassification=next;
        return route.fulfill({json:{...data,classification:next}});
      }
      if (url.pathname === '/api/pipeline/jobs' && request.method() === 'GET') {
        assert.equal(url.searchParams.get('includeHidden'),'true');
        return route.fulfill({json:{jobs:[{jobId:'upstream-1',title:'Pipeline sample',displayStatus:'completed',durationSeconds:5,isImported:false,hidden:pipelineHidden||legacyHidden,ownerClassification:pipelineClassification,sourceFingerprint:fingerprint},{jobId:'upstream-2',title:'Pipeline matched',displayStatus:'completed',durationSeconds:5,isImported:true,importedVideoId:'scc-video-2',hidden:false,ownerClassification:'unknown',sourceFingerprint:fingerprint}],count:2,historyComplete:false,incompleteReason:'Fixture partial',page:{hasMore:false,nextCursor:null,limit:20,returned:2}}});
      }
      if (url.pathname === '/api/test-data-metadata/pipeline-hidden' && request.method() === 'GET') return route.fulfill({json:{items:[...(pipelineHidden?[{jobId:'upstream-1',ownerClassification:pipelineClassification,sourceFingerprint:fingerprint,currentSource:true,legacy:false}]:[]),...(legacyHidden?[{jobId:'upstream-1',ownerClassification:'unknown',sourceFingerprint:null,currentSource:false,legacy:true}]:[])],limit:20,offset:0,hasMore:false}});
      if (url.pathname === '/api/test-data-metadata/pipeline-hidden' && request.method() === 'POST') {
        const body=request.postDataJSON(); visibilityWrites.push(body);
        if (body.legacy) {assert.equal(body.sourceFingerprint,null);assert.equal(body.hidden,false);legacyHidden=false;}
        else {assert.equal(body.sourceFingerprint,fingerprint);pipelineHidden=body.hidden;if(body.hidden) legacyHidden=true;}
        return route.fulfill({json:body});
      }
      if (url.pathname === '/api/test-data-metadata/watch-files' && request.method() === 'GET') {
        const visibility=url.searchParams.get('visibility') || 'all';
        const offset=Number(url.searchParams.get('offset') || 0),limit=Number(url.searchParams.get('limit') || 20);
        const filtered=watchFiles.filter(file=>visibility==='all' || (visibility==='visible'&&file.visibilitySupported&&!file.hidden) || (visibility==='hidden'&&file.hidden));
        return route.fulfill({json:{items:filtered.slice(offset,offset+limit),offset,limit,hasMore:offset+limit<filtered.length,sourceAvailable:true,scanIncomplete:true}});
      }
      if (url.pathname === '/api/test-data-metadata/watch-hidden' && request.method() === 'GET') {
        const offset=Number(url.searchParams.get('offset') || 0),limit=Number(url.searchParams.get('limit') || 20);
        const all=[...hiddenWatch.values()];
        return route.fulfill({json:{items:all.slice(offset,offset+limit),offset,limit,hasMore:offset+limit<all.length}});
      }
      if (url.pathname === '/api/test-data-metadata/watch-hidden' && request.method() === 'POST') {
        const body=request.postDataJSON(),file=watchFiles.find(item=>item.fileId===body.fileId && item.sourceFingerprint===body.sourceFingerprint);
        const saved=hiddenWatch.get(body.fileId);
        assert.ok(file || (!body.hidden && saved?.sourceFingerprint===body.sourceFingerprint), 'visibility mutation identifies the exact file and source');
        if(file) file.hidden=body.hidden;
        if(body.hidden) hiddenWatch.set(file.fileId,{...file,currentSource:true,present:true});
        else hiddenWatch.delete(body.fileId);
        return route.fulfill({json:body});
      }
      if (url.pathname === '/api/test-data/preview' && request.method() === 'POST') {
        const { records } = request.postDataJSON();
        const result = records.map(record => ({ ...record, name: record.id === 'record-1' ? 'First record' : 'Second record', eligible: !blocked, reason: blocked ? 'New reference detected' : 'No dependencies found', dependencies: blocked ? ['Related account: new-account'] : [], rows: blocked ? [] : [{ table: 'categories', id: record.id }] }));
        return route.fulfill({ json: { previewId: 'preview-1', records: result, total: blocked ? 0 : result.length, canDelete: !blocked, unchanged: ['Media files and external social content remain unchanged'], additionalChanges: blocked ? [] : ['One deletion history row will be added to activity_events: audit-1'], reversible: false, confirmationPhrase: 'DELETE' } });
      }
      if (url.pathname === '/api/test-data/delete' && request.method() === 'POST') {
        deletes.push(request.postDataJSON());
        if (failDelete) return route.fulfill({ status: 409, json: { error: 'Preview is stale' } });
        await new Promise(resolve => { releaseDelete = resolve; });
        return route.fulfill({ json: { deleted: [{ type: 'category', id: 'record-1' }], count: 1, auditId: 'audit-1' } });
      }
      throw new Error(`Unexpected fixture request ${request.method()} ${url.pathname}`);
    });
    await page.goto(`http://127.0.0.1:${address.port}/test-harness/test-data-manager.html`);
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.classList.toggle('light', theme === 'light'); }, theme);
    await page.getByRole('region',{name:'Records'}).getByRole('heading',{name:'First record'}).waitFor();
    const bg = await page.locator('main').evaluate(element => getComputedStyle(element).backgroundColor);
    if (theme === 'dark') backgrounds.set(width, bg); else assert.notEqual(bg, backgrounds.get(width));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.getByRole('button', { name: 'Review Deletion' }).isDisabled(), true);
    assert.equal(await page.getByRole('checkbox', { name: /Protected account/ }).isDisabled(), true);
    await page.getByRole('button',{name:/Inspect First record/}).click();
    await page.getByText('Original filename: example.mp4').waitFor();
    await page.getByText('Pipeline original: existence not verified').waitFor();
    await page.getByRole('button',{name:'Mark as Keep'}).click();
    await page.getByText('Record marked as Keep by the owner.').waitFor();
    await page.waitForFunction(()=>document.querySelector('input[aria-label^="Select Category First record"]')?.disabled);
    assert.equal(await page.getByRole('button',{name:'Mark as Test'}).isDisabled(),true);
    await page.getByRole('button',{name:'Remove classification'}).click();
    await page.getByText('Owner classification removed.').waitFor();
    await page.getByRole('button',{name:'Mark as Test'}).click();
    await page.getByText('Record marked as Test by the owner.').waitFor();
    assert.ok(await page.getByText('Owner-marked test').count());
    await page.waitForFunction(()=>!document.querySelector('input[aria-label^="Select Category First record"]')?.disabled);
    await page.getByRole('checkbox', { name: /First record/ }).check();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('region',{name:'Records'}).getByRole('heading',{name:'Second record'}).waitFor();
    assert.equal(await page.getByText('1 selected (maximum 25)').count(), 1);
    await page.getByRole('button', { name: 'Previous' }).click();
    await page.getByRole('region',{name:'Records'}).getByRole('heading',{name:'First record'}).waitFor();

    // Opening, reviewing, Escape and Cancel never submit a deletion.
    for (const action of ['Escape', 'Cancel']) {
      await page.getByRole('button', { name: 'Review Deletion' }).click();
      const dialog = page.getByRole('dialog', { name: 'Review deletion' });
      await dialog.getByText('categories: record-1').waitFor();
      assert.equal(await dialog.getByText(/activity_events: audit-1/).count(), 1);
      assert.equal(await dialog.getByText(/cannot be undone/).count(), 1);
      assert.equal(await dialog.getByRole('button', { name: 'Delete selected records' }).isDisabled(), true);
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press(i < 3 ? 'Tab' : 'Shift+Tab');
        assert.equal(await page.evaluate(() => document.querySelector('[role="dialog"]').contains(document.activeElement)), true);
      }
      if (action === 'Escape') await page.keyboard.press('Escape'); else await dialog.getByRole('button', { name: 'Cancel' }).click();
      await dialog.waitFor({ state: 'detached' });
      assert.equal(await page.getByRole('button', { name: 'Review Deletion' }).evaluate(el => el === document.activeElement), true);
    }
    assert.deepEqual(deletes, []);

    blocked = true;
    await page.getByRole('button', { name: 'Review Deletion' }).click();
    await page.getByText(/New reference detected/).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Delete selected records' }).isDisabled(), true);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    blocked = false; failDelete = true;
    await page.getByRole('button', { name: 'Review Deletion' }).click();
    await page.getByLabel(/Type DELETE/).fill('DELETE');
    await page.getByRole('button', { name: 'Delete selected records' }).click();
    await page.getByRole('alert').getByText(/Preview is stale/).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Delete selected records' }).isDisabled(), true);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

    failDelete = false;
    await page.getByRole('button', { name: 'Review Deletion' }).click();
    await page.getByLabel(/Type DELETE/).fill('DELETE');
    await page.getByRole('button', { name: 'Delete selected records' }).click();
    await page.waitForFunction(() => document.querySelector('[aria-busy="true"]'));
    assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).isDisabled(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 1);
    assert.equal(deletes.length, 2);
    assert.deepEqual(deletes[1], { previewId: 'preview-1', confirmation: 'DELETE' });
    releaseDelete();
    await page.getByRole('status').getByText('Deleted 1 selected record.').waitFor();

    await page.getByRole('button',{name:'Pipeline discovery'}).click();
    await page.getByText('Pipeline sample').waitFor();
    await page.getByText(/Discovery is incomplete/).waitFor();
    await page.getByText(/No SCC match by job ID/).waitFor();
    await page.getByText(/SCC job-ID match: scc-video-2 \(source unverified\)/).waitFor();
    const pipelineRow=page.locator('article').filter({hasText:'Pipeline sample'});
    await pipelineRow.getByRole('button',{name:'Mark as Keep'}).click();
    await page.getByText('Pipeline item marked as Keep by the owner.').waitFor();
    await page.getByText(/Owner-marked keep/).waitFor();
    assert.equal(await pipelineRow.getByRole('button',{name:'Mark as Test'}).isDisabled(),true);
    await pipelineRow.getByRole('button',{name:'Hide from SCC'}).click();
    await page.getByText('Pipeline item hidden from SCC. The upstream item was not changed.').waitFor();
    await pipelineRow.getByRole('button',{name:'Review hidden entries'}).click();
    await page.getByText(/Current Pipeline source/).waitFor();
    await page.getByText(/Legacy source unknown/).waitFor();
    assert.equal(visibilityWrites.length,1,'opening the hidden list did not guess a record or restore anything');
    await page.getByText(/Current Pipeline source/).locator('..').getByRole('button',{name:'Restore hidden item'}).click();
    await page.getByText(/Legacy source unknown/).waitFor();
    assert.equal(legacyHidden,true,'restoring the scoped entry preserves the legacy entry');
    await page.getByText(/Legacy source unknown/).locator('..').getByRole('button',{name:'Restore hidden item'}).click();
    await page.getByText('Pipeline item restored to SCC discovery.').waitFor();
    assert.deepEqual(visibilityWrites.slice(1),[{jobId:'upstream-1',hidden:false,sourceFingerprint:fingerprint,legacy:false},{jobId:'upstream-1',hidden:false,sourceFingerprint:null,legacy:true}]);
    await page.getByRole('button',{name:'Watch-directory files'}).click();
    const watchSection=page.getByRole('region',{name:'Watch-directory files'});
    await watchSection.getByText(/C:\\Fixture\\one\\sample.mp4/).waitFor();
    assert.equal(await watchSection.getByText('sample.mp4',{exact:true}).count(),2);
    assert.equal(await watchSection.getByText(/Provenance: Unknown/).count(),3);
    assert.equal(await watchSection.getByText(/content identity is not verified/).count(),1);
    const unsupported=watchSection.locator('article').filter({hasText:'unstable.mp4'});
    assert.equal(await unsupported.getByRole('button',{name:'Hide from SCC'}).isDisabled(),true);
    assert.equal(await unsupported.getByText(/excluded from normal discovery/).count(),1);
    assert.equal(await unsupported.getByText(/Visibility: Unavailable pending identification/).count(),1);
    assert.equal(await watchSection.getByText(/scan was incomplete/).count(),1);
    if(process.env.SCC_WATCH_SCREENSHOT_DIR) {
      mkdirSync(process.env.SCC_WATCH_SCREENSHOT_DIR,{recursive:true});
      await page.screenshot({path:path.join(process.env.SCC_WATCH_SCREENSHOT_DIR,`watch-${theme}-${width}.png`),fullPage:true});
    }
    const firstFile=watchSection.locator('article').filter({hasText:'C:\\Fixture\\one\\sample.mp4'});
    const secondFile=watchSection.locator('article').filter({hasText:'C:\\Fixture\\two\\sample.mp4'});
    await firstFile.getByRole('button',{name:'Hide from SCC'}).click();
    await page.getByText(/entry hidden from SCC/).waitFor();
    await firstFile.getByText(/Visibility: Hidden/).waitFor();
    assert.equal(await secondFile.getByText(/Visibility: Visible/).count(),1);
    await page.getByLabel('Watch visibility').selectOption('visible');
    await watchSection.getByText(/C:\\Fixture\\two\\sample.mp4/).waitFor();
    assert.equal(await watchSection.getByText(/C:\\Fixture\\one\\sample.mp4/).count(),0);
    await page.getByLabel('Watch visibility').selectOption('hidden');
    await watchSection.getByText(/Same observed file is currently present/).waitFor();
    await watchSection.getByText(/Presence could not be checked/).waitFor();
    await watchSection.locator('article').filter({hasText:'C:\\Fixture\\one\\sample.mp4'}).getByRole('button',{name:'Restore',exact:true}).click();
    await watchSection.getByText(/Presence could not be checked/).waitFor();
    await watchSection.locator('article').filter({hasText:'C:\\Fixture\\old\\missing.mp4'}).getByRole('button',{name:'Restore',exact:true}).click();
    await watchSection.getByText(/No hidden watch-directory entries/).waitFor();
    await page.getByLabel('Watch visibility').selectOption('all');
    await watchSection.getByText(/C:\\Fixture\\one\\sample.mp4/).waitFor();
    assert.equal(await watchSection.getByText(/Visibility: Visible/).count(),2);
    await page.getByRole('button',{name:'SCC records'}).click();
    await page.getByRole('region',{name:'Records'}).getByRole('heading',{name:'First record'}).waitFor();

    await page.getByLabel('Record type').selectOption('category');
    await page.getByLabel('Search name or ID').fill('missing');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByText('No records found in this segment for these filters.').waitFor();
    failInventory = true;
    await page.getByLabel('Search name or ID').fill('error');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('alert').getByText(/Synthetic failure/).waitFor();
    failInventory = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.getByRole('region',{name:'Records'}).getByRole('heading',{name:'First record'}).waitFor();
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${theme} ${width}px: selection, review, focus, cancel, stale/block, confirmed delete, filters and states`);
  }
} finally {
  await browser?.close();
  await server.close();
}
