import test, { before, after, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import { checked, ApiError } from '../client/src/api/http';
import { publicationCommand, acknowledgePublicationCommand } from '../client/src/api/publication-command';

test('HTTP errors preserve the native fallback and structured partial outcomes', async () => {
  const response = new Response(JSON.stringify({ success: false, error: 'Unavailable', nativeUrl: 'https://www.facebook.com/fixture', partial: true, drafts: [{ id: 'saved' }] }), { status: 207 });
  await assert.rejects(checked(response), (error: unknown) => error instanceof ApiError && error.nativeUrl === 'https://www.facebook.com/fixture' && error.body.partial === true);
});

test('uncertain publication identities survive edits and returning to earlier content', async () => {
  const payload = {title:'First pending intent',destinations:[{accountId:'fixture',caption:'Exact owner text'}]};
  const first = await publicationCommand(payload);
  const second = await publicationCommand({title:'Different pending intent'});
  assert.notEqual(first,second);
  assert.equal(await publicationCommand({destinations:[{caption:'Exact owner text',accountId:'fixture'}],title:'First pending intent'}),first);
  acknowledgePublicationCommand(first);
  assert.notEqual(await publicationCommand(payload),first);
  acknowledgePublicationCommand(second);
});

let browser: Browser, bundle: string;
before(async () => {
  const root = path.resolve(__dirname, '..');
  const built = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"test"' }, stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React,{useState} from './client/node_modules/react';
    import {createRoot} from './client/node_modules/react-dom/client';
    import {App} from './client/src/App';
    import {RetainedFeature} from './client/src/features/FeatureActivity';
    import {useCalendar} from './client/src/hooks/useCalendar';
    import {calendarApi} from './client/src/api/calendar';
    import {CreatePlanModal,PreparedPlanModal} from './client/src/views/CalendarView';
    import {RecordObservationModal} from './client/src/components/analytics/RecordObservationModal';
    import {AnalyticsView} from './client/src/views/AnalyticsView';
    import {api} from './client/src/api/client';
    window.requests=[];window.categories=[{id:'original',name:'Original',color:'#123456'}];
    const response=body=>new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
    window.fetch=async(url,init={})=>{
      const p=String(url).split('?')[0];window.requests.push({url:String(url),method:init.method||'GET'});
      if(p==='/api/accounts/categories'&&init.method==='POST'){const c={...JSON.parse(init.body),id:'created'};window.categories.push(c);return response({success:true,category:c});}
      if(p==='/api/accounts/categories/all')return response({categories:window.categories});
      if(p==='/api/accounts')return response({accounts:[]});
      if(p==='/api/publishing/queue')return response({queue:[]});
      if(p==='/api/inbox/comments')return response({comments:[],stats:{total:0,unread_count:0,awaiting_reply_count:0}});
      if(p==='/api/activity')return response({events:[],total:0});
      if(p==='/api/analytics/overview')return response({totals:{},platformComparison:[],categoryComparison:[],accountRankings:[],videoPerformance:[],syncStates:[]});
      if(p.startsWith('/api/operator/pages/'))return response({contextFingerprint:'fixture',accountId:'page'});
      throw new Error('Unexpected fixture request '+url);
    };
    window.EventSource=class{listeners={};constructor(){window.sse=this;setTimeout(()=>this.onopen?.(),0);}addEventListener(n,f){this.listeners[n]=f;}close(){}};
    function Retention(){const [tab,setTab]=useState('edit');return <><button onClick={()=>setTab(tab==='edit'?'other':'edit')}>Switch Feature</button><RetainedFeature name="edit" activeTab={tab}><input aria-label="Retained draft" defaultValue=""/></RetainedFeature><RetainedFeature name="other" activeTab={tab}><p>Other feature</p></RetainedFeature></>;}
    function CalendarHarness(){const c=useCalendar('page');window.calendar=c;return <><p role="status">{c.items.map(i=>i.id).join(',')}</p><p role="alert">{c.error}</p><button onClick={()=>c.refresh()}>Read Calendar</button></>;}
    function Dialogs(){const [kind,setKind]=useState('');return <><button onClick={()=>setKind('create')}>Open Create</button><button onClick={()=>setKind('import')}>Open Import</button><button onClick={()=>setKind('observation')}>Open Observation</button>{kind==='create'&&<CreatePlanModal accountId="page" accountName="Fixture Page" onClose={()=>setKind('')} onCreate={async()=>{await new Promise(resolve=>window.finishCreate=resolve);setKind('');}}/>}{kind==='import'&&<PreparedPlanModal accountId="page" accountName="Fixture Page" onClose={()=>setKind('')} onImported={async()=>{setKind('');}}/>}{kind==='observation'&&<RecordObservationModal isOpen video={{destination_id:'fixture',views:null,likes:null,comments:null,shares:null,account_name:'Fixture Page',platform:'facebook'}} onClose={()=>setKind('')} onSuccess={()=>{}}/>}</>;}
    window.mount=(kind)=>{const root=createRoot(document.getElementById('root'));window.unmount=()=>root.unmount();root.render(kind==='app'?<App/>:kind==='retention'?<Retention/>:kind==='calendar'?<CalendarHarness/>:kind==='analytics'?<AnalyticsView/>:<Dialogs/>);};
    window.failCalendar=false;
    calendarApi.getHealth=async()=>{if(window.failCalendar)throw new Error('Fixture service offline');return {};};
    calendarApi.getCampaigns=async()=>{if(window.failCalendar)throw new Error('Fixture service offline');return {campaigns:[]};};
    calendarApi.getItems=async()=>{if(window.failCalendar)throw new Error('Fixture service offline');return {items:[{id:'saved-item'}]};};
    window.failAnalytics=()=>{api.getAnalyticsOverview=async()=>{throw new Error('Fixture analytics offline');};};
  ` } });
  bundle = built.outputFiles[0].text;
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
});
after(async () => { await browser?.close(); });
async function fixture(t: TestContext, kind: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } }); t.after(() => page.close());
  page.setDefaultTimeout(5000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.abort());
  await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: bundle });
  if (kind === 'analytics') await page.evaluate(() => (window as any).failAnalytics());
  await page.evaluate(value => (window as any).mount(value), kind);
  await page.waitForTimeout(30); assert.deepEqual(errors, []); return page;
}
async function waitFor(t: () => Promise<boolean>) { for (let i=0;i<100;i++) { if(await t())return;await new Promise(resolve=>setTimeout(resolve,20)); } assert.fail('Fixture condition did not settle'); }

test('retained features preserve drafts while hidden content is inert', async t => {
  const page = await fixture(t, 'retention'); await page.getByLabel('Retained draft').fill('Unsaved owner text');
  await page.getByRole('button', { name: 'Switch Feature' }).click();
  assert.equal(await page.locator('[data-feature="edit"]').evaluate(element => (element as HTMLElement).inert), true);
  await page.getByRole('button', { name: 'Switch Feature' }).click();
  assert.equal(await page.getByLabel('Retained draft').inputValue(), 'Unsaved owner text');
});

test('creating a category updates the retained shell without document navigation', async t => {
  const page = await fixture(t, 'app');
  await page.getByRole('button', { name: 'Accounts & Categories', exact: true }).click();
  await page.getByRole('button', { name: 'New Category', exact: true }).click();
  await page.getByLabel('Category Name').fill('Owner category');
  await page.getByRole('button', { name: 'Create Category', exact: true }).click();
  await waitFor(async()=>await page.locator('header option[value="created"]').count()===1);
  assert.equal(page.url(), 'about:blank');
  await page.getByRole('button', { name: 'Activity Feed', exact: true }).click();
  await waitFor(async()=>await page.evaluate(() => (window as any).requests.some((r:any)=>r.url.includes('/activity'))));
  const before = await page.evaluate(() => (window as any).requests.filter((r:any)=>r.url.includes('/activity')).length);
  await page.getByRole('button', { name: 'Accounts & Categories', exact: true }).click();
  await page.waitForTimeout(5300);
  assert.equal(await page.evaluate(() => (window as any).requests.filter((r:any)=>r.url.includes('/activity')).length), before);
});

test('calendar read failure is visible and retains the last successful scope', async t => {
  const page = await fixture(t, 'calendar'); await waitFor(async()=>await page.getByRole('status').textContent()==='saved-item');
  await page.evaluate(() => { (window as any).failCalendar=true; }); await page.getByRole('button',{name:'Read Calendar'}).click();
  await waitFor(async()=>Boolean((await page.getByRole('alert').textContent())?.includes('Fixture service offline')));
  assert.equal(await page.getByRole('status').textContent(),'saved-item');
});

test('analytics first-read failure offers retry instead of indefinite loading', async t => {
  const page = await fixture(t, 'analytics'); await page.getByRole('button',{name:'Retry Analytics'}).waitFor();
  assert.match(await page.getByRole('alert').innerText(),/Fixture analytics offline/);
});

test('calendar and observation dialogs trap focus, restore it and hold pending work', async t => {
  const page = await fixture(t, 'dialogs'); await page.getByRole('button',{name:'Open Create'}).click();
  const dialog = page.getByRole('dialog'); await dialog.waitFor(); await page.keyboard.press('Shift+Tab');
  assert.equal(await dialog.evaluate(element=>element.contains(document.activeElement)),true);
  await page.getByLabel('Campaign Name').fill('Fixture plan'); await page.getByLabel('Manual captions (one per day, one per line)').fill('Owner-entered fixture');
  await page.getByRole('button',{name:'Create 7-Day Plan',exact:true}).click(); await page.keyboard.press('Escape');
  assert.equal(await dialog.count(),1); await page.evaluate(()=>(window as any).finishCreate()); await dialog.waitFor({state:'detached'});
  assert.equal(await page.getByRole('button',{name:'Open Create'}).evaluate(element=>element===document.activeElement),true);
  await page.getByRole('button',{name:'Open Import'}).click(); await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button',{name:'Open Import'}).evaluate(element=>element===document.activeElement),true);
  await page.getByRole('button',{name:'Open Observation'}).click();
  assert.deepEqual(await page.getByRole('dialog').locator('input[type="number"]').evaluateAll(elements=>elements.map(element=>(element as HTMLInputElement).value)),['','','','']);
  await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(),0);
  assert.equal(await page.locator('#root').evaluate(element=>element.querySelectorAll('[inert]').length),0);
});
