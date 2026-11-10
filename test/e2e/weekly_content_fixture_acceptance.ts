/** Browser contract fixtures only: static built assets, intercepted APIs, no SCC runtime or providers. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import type { WeeklyPlan } from '../../client/src/api/weekly-content.js';

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const dist = path.join(root, 'client/dist');
  const artifacts = path.join(root, '.data/test-runs/weekly-content-browser', String(Date.now()));
  await mkdir(artifacts, { recursive: true });
  const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const end = new Date(Date.parse(`${day}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  const target = { accountId: 'fixture-page', graphId: '123456789', name: 'Fixture Developer Page', persona: 'developer' };
  const group = { id: 'fixture-group', name: 'Fixture Developer Group', accountId: target.accountId, rules: 'Original useful programming discussion only.', limitations: ['FIXTURE, owner-entered Group'] };
  const evidence = { id: 'evidence-fixture', kind: 'owner_reference' as const, summary: 'FIXTURE: a small debugging question, not an audience trend.', sourceRef: 'owner:fixture-question', observedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 7 * 86400000).toISOString(), accountId: target.accountId, limitations: 'One synthetic reference, not real audience research.', privacy: 'owner_supplied' as const, relevanceConfirmed: true as const, provenance: 'owner_entered', independentlyVerified: false };
  const idea = { id: 'idea-fixture', accountId: target.accountId, topic: 'Fixture concise debugging question', intendedAudience: 'Developers', evidenceIds: [evidence.id], interestReason: 'A practical question.', originalContribution: 'An original bounded reproduction.', recommendedFormat: 'text' as const, formatReason: 'The value is in the concise question.', factualRequirements: ['Check the reproduction.'], confidence: 'low' as const, limitations: ['Synthetic fixture.'] };
  let plan: WeeklyPlan = { id: 'week-fixture', name: 'FIXTURE weekly plan', revision: 1, startDate: day, endDate: end, timeZone: 'Asia/Bangkok', targetAccountIds: [target.accountId], groupIds: [group.id], evidence: [evidence], ideas: [idea, { ...idea, id: 'idea-group-fixture', groupId: group.id, topic: 'Fixture original Group question' }, { ...idea, id: 'idea-uncertain-fixture', topic: 'Fixture protected uncertain preparation' }], slots: [
    { id: 'slot-existing', ideaId: idea.id, format: 'text', scheduledAt: `${day}T05:00:00.000Z`, draftId: 'draft-fixture-original', preparation: { status: 'prepared', taskId: 'task-fixture-original' } },
    { id: 'slot-group', ideaId: 'idea-group-fixture', format: 'text', scheduledAt: `${day}T08:00:00.000Z`, preparedId: 'gprep-fixture-original', preparation: { status: 'prepared', taskId: 'task-group-original' } },
    { id: 'slot-uncertain', ideaId: 'idea-uncertain-fixture', format: 'text', scheduledAt: `${day}T09:00:00.000Z`, preparation: { status: 'reconciliation_required', intentAt: new Date().toISOString(), hold: 'Original task outcome unknown; do not change or replay.' } },
  ], planningApproval: null, analysisTasks: [], limitations: ['FIXTURE ONLY. Nothing is generated or published.'] };
  const commands: { url: string; body: any }[] = [];
  const checks: string[] = [];
  const pageErrors: string[] = [];
  const withImages=process.argv.includes('--batch-with-images');
  const ownerActions:string[]=[];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) { response.writeHead(500); response.end('API traffic must be intercepted'); return; }
    const file = path.resolve(dist, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(dist + path.sep)) { response.writeHead(403); response.end(); return; }
    try { const bytes = await readFile(file); response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); response.end(bytes); }
    catch { response.writeHead(404); response.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(async error => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    throw error;
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
    page.setDefaultTimeout(10_000);
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      assert.equal(url.hostname, '127.0.0.1', 'External traffic is blocked');
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const request = route.request();
      const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname === '/api/weekly-content') return json({ plans: [plan], targets: [target], groups: [group] });
      if (url.pathname.startsWith('/api/weekly-content/plans/')) {
        if (request.method() === 'GET') return json({ plan });
        const body = request.postDataJSON(); commands.push({ url: url.pathname, body });
        assert.equal(body.revision, plan.revision);
        if(url.pathname.endsWith('/batch-review'))return json({review:{hash:'fixture-exact-week-hash',policy:'Only exact displayed current content; future material requires review.',slotIds:body.slotIds,slots:plan.slots.filter(s=>body.slotIds.includes(s.id)).map(s=>({...s,idea:plan.ideas.find(i=>i.id===s.ideaId),hold:null})),imageHold:null,images:{reviewHash:'fixture-exact-images',concepts:withImages?[{slotId:'fixture-reviewed-image',taskId:'fixture-image-task',count:1,continuity:'Same original subject',frames:[{description:'An original comparison diagram',purpose:'Explain isolation',aspectRatio:'4:5'}]}]:[]},campaigns:[{campaign:{id:'fixture-exact-campaign',name:'Exact selected ready content'},account:{name:target.name},items:[{id:'fixture-exact-item',title:'Exact final fixture text',caption:'Reviewed original fixture text, no invented statistics.',hashtags:'',scheduledAt:plan.slots[0].scheduledAt,media:[]}]}]}});
        if (request.method() === 'PUT') {
          for (const slot of body.slots || []) assert.deepEqual(Object.keys(slot).sort(), ['format', 'id', 'ideaId', 'scheduledAt']);
          if (body.slots) plan.slots = body.slots.map((slot: any) => ({ ...plan.slots.find(item => item.id === slot.id), ...slot }));
          if (body.ideas) plan.ideas = body.ideas;
          plan.planningApproval = null;
        } else if (url.pathname.endsWith('/evidence')) {
          assert.equal(typeof body.evidence.limitations, 'string'); assert.equal(body.evidence.relevanceConfirmed, true);
          if (body.evidence.kind === 'verified_fact') assert.ok(body.evidence.verificationNote.trim());
          plan.evidence.push({ ...body.evidence, id: 'evidence-added', provenance: 'owner_entered', independentlyVerified: false });
        } else if (url.pathname.endsWith('/approve-planning')) plan.planningApproval = { revision: plan.revision + 1, at: new Date().toISOString() };
        else if(url.pathname.endsWith('/authorize-week')){assert.equal(body.expectedHash,'fixture-exact-week-hash');assert.equal(body.confirm,true);assert.deepEqual(body.operations,{prepare:true,materialize:true,publishExact:true});if(withImages)assert.deepEqual(body.imageBudget,{maxTotalImages:1,maxImagesPer24Hours:1,maxPendingItems:1});else assert.equal(body.imageBudget,undefined);plan.authorizations=[{id:'fixture-bounded-week',slotIds:body.slotIds,expiresAt:body.expiresAt,state:{phase:'authorized'}}];}
        else if (url.pathname.endsWith('/schedule-group')) {
          assert.equal(body.slotId, 'slot-group'); assert.equal(body.registryId, 'group-channel:fixture'); assert.equal(body.grantId, 'group-grant:fixture'); assert.equal(body.confirmSchedule, true);
          plan.slots[1].groupSchedule = { status: 'scheduled', destinationId: 'group-destination-fixture', registryId: body.registryId, grantId: body.grantId };
        }
        plan = { ...plan, revision: plan.revision + 1 }; return json({ plan });
      }
      if (url.pathname === '/api/events') return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': fixture\n\n' });
      if (url.pathname === '/api/calendar/health') return json({ status: 'fixture', timezone: 'Asia/Bangkok', activeJobs: 0, scheduledJobs: 0, pausedCampaignsCount: 0, stuckJobsCount: 0, offlineNotice: 'Fixture only' });
      return json({ accounts: [], categories: [], queue: [], comments: [], events: [], campaigns: [], items: [], totals: {}, pagination: { total: 0, hasMore: false } });
    });
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page.getByRole('button', { name: 'Content Calendar', exact: true }).click();
    await page.getByText('Research-first weekly content', { exact: true }).click();
    await page.getByLabel('Saved weekly plan').selectOption(plan.id);
    await page.getByText('Provenance: owner_entered · Independently verified: No', { exact: true }).waitFor();
    checks.push('Owner evidence provenance and lack of independent verification are visible');
    assert.equal(await page.getByLabel('Format for Fixture protected uncertain preparation', { exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel('Publication time for Fixture protected uncertain preparation', { exact: true }).isDisabled(), true);
    const uncertainSlot = page.getByRole('region', { name: 'Seven-day publication plan' }).locator('article').filter({ has: page.getByText('Fixture protected uncertain preparation', { exact: true }) });
    assert.equal(await uncertainSlot.getByRole('button', { name: 'Remove planned item', exact: true }).count(), 0);
    checks.push('Persisted preparation intent locks uncertain originals even without a returned task or draft ID');
    await page.getByText('Add owner research evidence', { exact: true }).click();
    await page.getByLabel('Evidence kind', { exact: true }).selectOption('verified_fact');
    await page.getByLabel('Verification note', { exact: true }).fill('Checked against the supplied fixture reference; no live verification.');
    await page.getByLabel(/^Relevant evidence summary/).fill('Fixture explicitly supplied claim.');
    await page.getByLabel('Source reference', { exact: true }).fill('owner:fixture-verification');
    await page.getByLabel(/^Evidence limitations/).fill('Synthetic claim for contract testing only.');
    await page.getByRole('checkbox', { name: /I confirm this summary/ }).check();
    await page.getByRole('button', { name: 'Save evidence', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Evidence recorded with its source' }).waitFor();
    assert.equal(await page.getByLabel(/^Relevant evidence summary/).inputValue(), 'Fixture explicitly supplied claim.');
    checks.push('Verified-fact note, string limitations and relevance flag match the backend; form content survives refresh');
    await page.getByRole('button', { name: 'Add idea to weekly schedule', exact: true }).first().click();
    assert.equal(await page.getByRole('button', { name: 'Approve planning only', exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel('Saved weekly plan').isDisabled(), true);
    const time = page.getByLabel('Publication time for Fixture concise debugging question', { exact: true }).last();
    const lastDate = new Date(Date.parse(`${end}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    assert.equal(await time.getAttribute('max'), `${lastDate}T23:59`);
    await time.fill(`${day}T15:30`);
    await page.getByRole('button', { name: 'Save weekly schedule', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Schedule saved.' }).waitFor();
    assert.equal(plan.slots.at(-1)?.scheduledAt, `${day}T08:30:00.000Z`);
    checks.push('Unsaved schedule guards, end-exclusive date bound, Bangkok conversion and strict slot projection pass');
    await page.getByRole('button', { name: 'Approve planning only', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Planning revision reviewed.' }).waitFor();
    assert.ok(plan.planningApproval);
    assert.ok(!commands.some(command => /\/publishing\/|\/calendar\/.*approve/.test(command.url)));
    checks.push('Planning approval never calls existing publication approval or queue endpoints');
    await page.getByText('Existing Group grant handoff', { exact: true }).click();
    await page.getByLabel('Existing Group channel registry', { exact: true }).fill('group-channel:fixture');
    await page.getByLabel('Existing exact Group grant', { exact: true }).fill('group-grant:fixture');
    await page.getByRole('checkbox', { name: /I authorize this prepared text/ }).check();
    await page.getByRole('button', { name: 'Queue under existing Group grant', exact: true }).click();
    await page.getByText('Group queue: scheduled · group-destination-fixture', { exact: true }).waitFor();
    checks.push('Existing Group registry and grant identity handoff is explicit; no grant is created');
    await page.getByRole('button',{name:'Review selected week',exact:true}).click();ownerActions.push('Review selected week');
    await page.getByRole('checkbox',{name:/I approve publication and scheduling of only/}).check();ownerActions.push('Approve exact displayed publication snapshots');
    if(withImages){await page.getByRole('checkbox',{name:/Authorize included Codex images only/}).check();ownerActions.push('Select exact weekly image authority');await page.getByLabel('Weekly total image budget',{exact:true}).fill('1');ownerActions.push('Enter total image bound');await page.getByLabel('Weekly daily image budget',{exact:true}).fill('1');ownerActions.push('Enter rolling daily bound');}
    await page.getByLabel('Confirm bounded weekly authorization',{exact:true}).check();ownerActions.push('Confirm bounded week');
    await page.getByRole('button',{name:'Authorize bounded week',exact:true}).click();ownerActions.push('Authorize bounded week');
    await page.getByText(/Authority fixture-bounded-week/).waitFor();assert.equal(ownerActions.length,withImages?7:4);
    checks.push('Measured exact weekly authorization session: '+ownerActions.length+' owner interactions; no repeated unchanged campaign approvals');
    await page.screenshot({ path: path.join(artifacts, 'weekly-desktop-dark.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { document.documentElement.classList.add('light'); document.documentElement.setAttribute('data-theme', 'light'); });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: path.join(artifacts, 'weekly-mobile-light.png'), fullPage: true });
    assert.deepEqual(pageErrors, []);
    checks.push('Desktop dark and mobile light layouts render without horizontal overflow or browser exceptions');
    const report = { status: 'PASS', fixtureOnly: true, ownerRuntimeStarted: false, providersCalled: false, checks, ownerActions, commands: commands.map(command => command.url), artifacts };
    await writeFile(path.join(artifacts, 'result.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
