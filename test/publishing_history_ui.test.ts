import test, { before, after, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';

let browser: Browser, bundle: string;
before(async () => {
  const root = path.resolve(__dirname, '..');
  const built = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"test"' }, stdin: {
    resolveDir: root, loader: 'tsx', contents: `
      import React,{useState} from './client/node_modules/react';
      import {createRoot} from './client/node_modules/react-dom/client';
      import {QueueTable} from './client/src/components/publishing/QueueTable';
      import {PublishingView} from './client/src/views/PublishingView';
      import {FeatureActivity} from './client/src/features/FeatureActivity';
      import {publishingHistoryApi} from './client/src/api/publishing-history';
      import {api} from './client/src/api/client';
      import {invalidateResources} from './client/src/api/resource-events';
      window.coreApi=api;window.historyApi=publishingHistoryApi;window.historyReads=[];window.retryIds=[];window.activeReads=0;
      const row=(id)=>({id,post_id:'post',account_id:'page',account_name:'Synthetic Page',account_handle:'page',platform:'facebook',caption:'',hashtags:'',apply_branding:0,status:'failed',progress:0,error_message:'Synthetic failure',retry_count:0,max_retries:3,verification_status:'unverified',created_at:'2026-10-28 09:00:00',updated_at:'2026-10-29 10:00:00',post_title:id});
      window.historyRow=row;
      publishingHistoryApi.history=async(filters,offset)=>{window.historyReads.push({...filters,offset});return {items:[row('destination-'+offset)],total:41,offset,limit:filters.limit,hasMore:offset<40,timestamp:filters.timestamp,direction:filters.direction,startAt:null,endAt:null};};
      publishingHistoryApi.active=async()=>{window.activeReads++;return {queue:[],total:0,limit:100,hasMore:false};};
      window.mountHistory=()=>createRoot(document.getElementById('root')).render(<QueueTable queue={[]} onRefresh={()=>{}} onRetry={id=>{window.retryIds.push(id);invalidateResources(['publishing']);}} onCancel={()=>{}}/>);
      let root;
      function PublishingHarness(){const [active,setActive]=useState(true);window.setFeatureActive=setActive;return <FeatureActivity active={active}><PublishingView/></FeatureActivity>;}
      window.mountPublishing=()=>{root=createRoot(document.getElementById('root'));root.render(<PublishingHarness/>);};
    `,
  } });
  bundle = built.outputFiles[0].text;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => { await browser?.close(); });

async function pageFor(t: TestContext): Promise<Page> {
  const context = await browser.newContext(); const page = await context.newPage(); page.setDefaultTimeout(6000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.abort());
  await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: bundle });
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  return page;
}

test('history defaults newest-first and retains page and filters after an exact destination retry', async t => {
  const page = await pageFor(t); await page.evaluate(() => (window as any).mountHistory());
  assert.equal(await page.getByLabel('History order').inputValue(), 'desc');
  await page.getByLabel('History platform').selectOption('tiktok');
  await page.getByRole('button', { name: 'Next history page' }).click();
  await page.getByText('destination-20', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Retry Destination', exact: true }).click();
  await page.waitForFunction(() => (window as any).historyReads.filter((r: any) => r.offset === 20).length >= 2);
  assert.deepEqual(await page.evaluate(() => (window as any).retryIds), ['destination-20']);
  assert.equal(await page.getByLabel('History platform').inputValue(), 'tiktok');
  assert.equal(await page.getByText('destination-20', { exact: true }).count(), 1);
  const last = await page.evaluate(() => (window as any).historyReads.at(-1));
  assert.equal(last.offset, 20); assert.equal(last.platform, 'tiktok');
  assert.match(await page.getByText(/^Created: \d/).innerText(), /28\/10\/2026/);
  await page.getByLabel('History timestamp').selectOption('updated');
  await page.getByText(/^Updated: \d/).waitFor();
  assert.match(await page.getByText(/^Updated: \d/).innerText(), /29\/10\/2026/);
});

test('late filtered history responses cannot replace a newer query and errors retain last good history', async t => {
  const page = await pageFor(t); await page.evaluate(() => (window as any).mountHistory());
  await page.getByText('destination-0', { exact: true }).waitFor();
  await page.evaluate(() => {
    const win = window as any; win.pendingHistory = [];
    win.historyApi.history = (filters: any, offset: number) => new Promise((resolve, reject) => win.pendingHistory.push({ filters, offset, resolve, reject }));
  });
  await page.getByLabel('History outcome').selectOption('failed');
  await page.waitForFunction(() => (window as any).pendingHistory.length === 1);
  await page.getByLabel('History timestamp').selectOption('updated');
  await page.waitForFunction(() => (window as any).pendingHistory.length === 2);
  await page.evaluate(() => { const win = window as any; win.pendingHistory[1].resolve({items:[win.historyRow('newer-query')],total:1,offset:0,limit:20,hasMore:false}); });
  await page.getByText('newer-query', { exact: true }).waitFor();
  await page.evaluate(() => { const win = window as any; win.pendingHistory[0].resolve({items:[win.historyRow('stale-query')],total:1,offset:0,limit:20,hasMore:false}); });
  assert.equal(await page.getByText('stale-query', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Refresh history', exact: true }).click();
  await page.waitForFunction(() => (window as any).pendingHistory.length === 3);
  await page.evaluate(() => (window as any).pendingHistory[2].reject(new Error('Synthetic history unavailable')));
  await page.getByRole('alert').filter({hasText:'Synthetic history unavailable'}).waitFor();
  assert.equal(await page.getByText('newer-query', { exact: true }).count(), 1);
});

test('date, week, month and custom filters use explicit owner dates without resetting unrelated filters', async t => {
  const page = await pageFor(t); await page.evaluate(() => (window as any).mountHistory());
  await page.getByLabel('History timestamp').selectOption('scheduled');
  await page.getByText('Scheduled: Not scheduled',{exact:true}).waitFor();
  for (const period of ['date','week','month']) {
    await page.getByLabel('History date period').selectOption(period);
    await page.getByLabel('History date', { exact: true }).fill('2026-12-01');
    await page.waitForFunction(p => (window as any).historyReads.at(-1).period === p && (window as any).historyReads.at(-1).date === '2026-12-01', period);
  }
  await page.getByLabel('History date period').selectOption('custom');
  await page.getByLabel('History from date').fill('2026-12-01'); await page.getByLabel('History through date').fill('2026-12-31');
  await page.waitForFunction(() => (window as any).historyReads.at(-1).toDate === '2026-12-31');
  const last = await page.evaluate(() => (window as any).historyReads.at(-1));
  assert.equal(last.timestamp, 'scheduled'); assert.equal(last.fromDate, '2026-12-01'); assert.equal(last.offset, 0);
});

test('general-post edits survive internal tabs and Reel switching; queue polling leaves media/accounts alone and suspends while inactive', async t => {
  const page = await pageFor(t);
  await page.evaluate(() => {
    const win = window as any; win.videoReads = 0; win.accountReads = 0;
    win.coreApi.getVideos = async () => {win.videoReads++;return {videos:[]};};
    win.coreApi.getAccounts = async () => {win.accountReads++;return {accounts:[]};};
    win.coreApi.getPipelineStatus = async () => ({files:[],jobs:[],historyComplete:true});
    win.coreApi.getPublishingDrafts = async () => ({drafts:[]}); win.coreApi.getImages = async () => ({images:[]});
    win.mountPublishing();
  });
  await page.getByLabel('Post type').selectOption('text');
  await page.getByLabel('Draft title').fill('Unsaved owner text');
  await page.getByRole('button', {name:'Publishing Queue',exact:false}).click();
  await page.getByRole('button', {name:'Compose & Publish',exact:false}).click();
  assert.equal(await page.getByLabel('Draft title').inputValue(), 'Unsaved owner text');
  await page.getByLabel('Post type').selectOption('reel'); await page.getByLabel('Post type').selectOption('text');
  assert.equal(await page.getByLabel('Draft title').inputValue(), 'Unsaved owner text');
  await page.waitForFunction(() => (window as any).activeReads >= 2, undefined, {timeout:8000});
  assert.equal(await page.evaluate(() => (window as any).videoReads), 1); assert.equal(await page.evaluate(() => (window as any).accountReads), 1);
  await page.evaluate(() => (window as any).setFeatureActive(false));
  const reads = await page.evaluate(() => (window as any).activeReads); await page.waitForTimeout(5200);
  assert.equal(await page.evaluate(() => (window as any).activeReads), reads);
});
