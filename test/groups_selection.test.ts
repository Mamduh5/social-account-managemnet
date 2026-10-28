import test, { after, before, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createGroupsRequestGuard, emptyGroupDraft } from '../client/src/hooks/groups-selection.js';
import { GroupsWorkspaceView } from '../client/src/views/GroupsWorkspaceView';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import type { GroupPlanDto } from '../server/src/domain/groups.js';

const clientRequire = createRequire(path.resolve(__dirname, '../client/package.json'));
const { createElement } = clientRequire('react');
const { renderToStaticMarkup } = clientRequire('react-dom/server');

// One disposable headless process, no app/server/profile and no provider calls.
// Bundle in memory so these tests exercise the real editable component and hook.
let browser: Browser;
let componentBundle: string;
before(async () => {
  const result = await build({
    absWorkingDir: path.resolve(__dirname, '..'), bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"' },
    stdin: { resolveDir: path.resolve(__dirname, '..'), loader: 'tsx', contents: `
      import React from './client/node_modules/react';
      import { createRoot } from './client/node_modules/react-dom/client';
      import { GroupsWorkspaceView } from './client/src/views/GroupsWorkspaceView';
      import { groupsApi } from './client/src/api/content-workspace';
      import { api } from './client/src/api/client';
      window.groupsApi = groupsApi; window.coreApi = api;
      window.mountGroups = () => createRoot(document.getElementById('root')).render(React.createElement(GroupsWorkspaceView));
    ` },
  });
  componentBundle = result.outputFiles[0].text;
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
});
after(async () => { await browser?.close(); });

function fixture(id: string, account = 'page-a'): GroupPlanDto {
  return { id, name: `Group ${id}`, url: `https://www.facebook.com/groups/${id}/`, identity_type: 'page', account_id: account,
    membership: 'unknown', category: '', notes: '', rules: '', rules_reviewed_at: null, created_at: '2026-10-27T00:00:00.000Z', updated_at: '2026-10-27T00:00:00.000Z',
    canonicalKey: `slug:${id}`, canonicalUrl: `https://www.facebook.com/groups/${id}/`, originalUrl: `https://www.facebook.com/groups/${id}/`, actingPageId: account,
    shortlisted: false, archivedAt: null, reviewedAt: null, revision: 1, legacyDuplicate: false,
    eligibility: { pagesCanJoin: 'unknown', promotionalRestrictions: '', questions: [], participationApproval: 'unknown', postModeration: 'unknown' },
    membershipObservations: [], readiness: { state: 'needs_review', reasons: [], membershipAllowsParticipation: false, publishingPermission: 'owner_review_required', verified: false },
    permissionVerified: false, source: 'owner_entered', automationSupported: false };
}
const groupA = fixture('group-a'), groupB = fixture('group-b', 'page-b');
async function component(t: TestContext, groups = [groupA, groupB]): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(5_000);
  const errors: string[] = [], outbound: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { outbound.push(route.request().url()); return route.abort(); });
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); assert.deepEqual(outbound, [], 'all APIs are mocked in memory'); });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: componentBundle });
  await page.evaluate((initialGroups) => {
    const w = window as any;
    w.testGroups = initialGroups;
    w.listCalls = [];
    w.groupsApi.list = async (filters: any = {}) => {
      w.listCalls.push(filters);
      return { groups: w.testGroups.filter((g: any) =>
        (!filters.query || `${g.name} ${g.url}`.toLowerCase().includes(filters.query.toLowerCase())) &&
        (!filters.accountId || g.account_id === filters.accountId) &&
        (!filters.membership || g.membership === filters.membership) &&
        (!filters.category || g.category === filters.category) &&
        (filters.shortlisted === undefined || g.shortlisted === filters.shortlisted) &&
        (filters.archived === undefined || !!g.archivedAt === filters.archived)) };
    };
    w.groupsApi.reminders = async () => ({ reminders: [] });
    w.groupsApi.review = async (id: string) => ({ group: initialGroups.find(g => g.id === id), prepared: [], publicationVerified: false });
    w.groupsApi.prepared = async () => ({ prepared: [] });
    w.coreApi.getAccounts = async () => ({ accounts: [
      { id: 'page-a', name: 'Page A', platform: 'facebook', account_type: 'page', archived_at: null, is_demo: false },
      { id: 'page-b', name: 'Page B', platform: 'facebook', account_type: 'page', archived_at: null, is_demo: false },
    ] });
    w.coreApi.getImages = async () => ({ images: [] }); w.coreApi.getVideos = async () => ({ videos: [] });
    w.originalGroupsApi = { ...w.groupsApi };
    w.deferred = {};
    w.hold = (method: string) => {
      w.deferred[method] = [];
      w.groupsApi[method] = (...args: unknown[]) => new Promise((resolve, reject) => w.deferred[method].push({ args, resolve, reject }));
    };
    w.mountGroups();
  }, groups);
  await settled(page);
  return page;
}
async function settled(page: Page) {
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(button => button.textContent === 'Save group plan' && !button.disabled));
}
async function hold(page: Page, method: string) { await page.evaluate(method => (window as any).hold(method), method); }
async function pending(page: Page, method: string, length = 1) {
  await page.waitForFunction(({ method, length }) => (window as any).deferred[method]?.length >= length, { method, length });
}
async function resolve(page: Page, method: string, value: unknown, index = 0) {
  await pending(page, method, index + 1);
  await page.evaluate(({ method, value, index }) => {
    const w = window as any;
    if ((method === 'save' || method === 'membership') && (value as any)?.group) {
      const group = (value as any).group, oldIndex = w.testGroups.findIndex((g: any) => g.id === group.id);
      if (oldIndex >= 0) w.testGroups[oldIndex] = group; else w.testGroups.push(group);
    }
    w.deferred[method].splice(index, 1)[0].resolve(value);
  }, { method, value, index });
}
async function reject(page: Page, method: string, message: string, index = 0) {
  await pending(page, method, index + 1);
  await page.evaluate(({ method, message, index }) => (window as any).deferred[method].splice(index, 1)[0].reject(new Error(message)), { method, message, index });
}
async function select(page: Page, id = groupA.id) { await page.getByLabel('Saved group plan', { exact: true }).selectOption(id); }

test('a slow Group selection cannot replace the newer Group or its package', async () => {
  const guard = createGroupsRequestGuard();
  let completeFirst: (value: string) => void = () => {};
  let selected = '';
  const first = guard.begin();
  const firstLoad = new Promise<string>(resolve => { completeFirst = resolve; }).then(value => { if (guard.current(first)) selected = value; });
  const second = guard.begin();
  await Promise.resolve('Group B').then(value => { if (guard.current(second)) selected = value; });
  completeFirst('Group A');
  await firstLoad;
  assert.equal(selected, 'Group B');
  guard.invalidate();
  assert.equal(guard.current(second), false, 'New plan and unmount invalidate outstanding work');
});

test('a package response is discarded after selection changes even if it finished last', async () => {
  const selection = createGroupsRequestGuard(), packages = createGroupsRequestGuard();
  const selectedToken = selection.begin(), packageToken = packages.begin();
  let finish: (value: string) => void = () => {};
  let visiblePackage: string | null = 'Old package';
  const loading = new Promise<string>(resolve => { finish = resolve; }).then(value => {
    if (selection.current(selectedToken) && packages.current(packageToken)) visiblePackage = value;
  });
  selection.begin(); packages.invalidate(); visiblePackage = null;
  finish('Stale Group A package'); await loading;
  assert.equal(visiblePackage, null);
});

test('selecting or saving a Group resets reply targets and all dependent draft fields', () => {
  const previous = { ...emptyGroupDraft(), kind: 'reply', threadUrl: 'https://www.facebook.com/groups/a/posts/1', content: 'Old Group reply', selectedMedia: ['video:a'] };
  const next = emptyGroupDraft();
  assert.equal(previous.kind, 'reply');
  assert.equal(next.kind, 'post');
  assert.equal(next.threadUrl, '');
  assert.equal(next.content, '');
  assert.deepEqual([...next.selectedMedia], []);
  next.selectedMedia.push('image:b');
  assert.deepEqual(emptyGroupDraft().selectedMedia, [], 'reset objects never share media state');
});

test('Groups Planning renders manual discovery and review controls offline without Facebook requests', () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (() => { requests += 1; throw new Error('No network is allowed during offline render'); }) as typeof fetch;
  try {
    const html = renderToStaticMarkup(createElement(GroupsWorkspaceView));
    assert.match(html, /href="https:\/\/www\.facebook\.com\/search\/groups\/"/);
    assert.match(html, /Open Facebook Group search/);
    assert.match(html, /Resume Review/);
    assert.match(html, /Shortlisted only/);
    assert.match(html, /Archived Groups/);
    assert.match(html, /Membership approval does not grant permission to post/);
    for (const label of ['Request pending', 'Request rejected', 'Request withdrawn', 'Participation restricted']) assert.ok(html.includes(label));
    assert.equal(requests, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('actual review response preserves newer same-Group edits and refreshes untouched fields', async t => {
  const page = await component(t);
  await hold(page, 'review'); await select(page); await pending(page, 'review');
  await page.getByLabel('Group name', { exact: true }).fill('New owner name');
  await page.getByLabel('Owner-supplied group rules').fill('New owner rules');
  await resolve(page, 'review', { group: { ...groupA, name: 'Server name', rules: 'Server rules', category: 'Fresh category', revision: 2 }, prepared: [] });
  await settled(page);
  assert.equal(await page.getByLabel('Group name', { exact: true }).inputValue(), 'New owner name');
  assert.equal(await page.getByLabel('Owner-supplied group rules').inputValue(), 'New owner rules');
  assert.equal(await page.getByLabel('Category', { exact: true }).inputValue(), 'Fresh category');
  await hold(page, 'save'); await page.getByRole('button', { name: 'Save group plan', exact: true }).click(); await pending(page, 'save');
  assert.equal(await page.evaluate(() => (window as any).deferred.save[0].args[0].revision), 2);
});

test('actual review response still refreshes the editable form when there are no newer edits', async t => {
  const page = await component(t);
  await hold(page, 'review'); await select(page);
  await resolve(page, 'review', { group: { ...groupA, name: 'Fresh server name', notes: 'Fresh server notes', revision: 2 }, prepared: [] });
  await settled(page);
  assert.equal(await page.getByLabel('Group name', { exact: true }).inputValue(), 'Fresh server name');
  assert.equal(await page.getByLabel(/^Notes/).inputValue(), 'Fresh server notes');
  assert.equal(await page.getByRole('button', { name: 'Resume Review', exact: true }).isEnabled(), true);
});

test('actual save response preserves subsequent form and handoff-draft edits', async t => {
  const page = await component(t); await select(page); await settled(page);
  await page.getByLabel('Group name', { exact: true }).fill('Submitted name');
  await hold(page, 'save'); await page.getByRole('button', { name: 'Save group plan', exact: true }).click(); await pending(page, 'save');
  await page.getByLabel('Group name', { exact: true }).fill('Later owner name');
  await page.getByLabel('Prepared group text', { exact: true }).fill('Later owner draft');
  await resolve(page, 'save', { group: { ...groupA, name: 'Submitted name', category: 'Saved category', revision: 2 } });
  await settled(page);
  assert.equal(await page.getByLabel('Group name', { exact: true }).inputValue(), 'Later owner name');
  assert.equal(await page.getByLabel('Category', { exact: true }).inputValue(), 'Saved category');
  assert.equal(await page.getByLabel('Prepared group text', { exact: true }).inputValue(), 'Later owner draft');
  await hold(page, 'save'); await page.getByRole('button', { name: 'Save group plan', exact: true }).click(); await pending(page, 'save');
  assert.equal(await page.evaluate(() => (window as any).deferred.save[0].args[0].revision), 2);
});

test('actual membership response refreshes membership while preserving newer registry edits', async t => {
  const page = await component(t); await select(page); await settled(page);
  await page.getByLabel('Membership/admin (unverified)', { exact: true }).selectOption('member');
  await page.getByLabel('Observation date', { exact: true }).fill('2026-10-27');
  await hold(page, 'membership'); await page.getByRole('button', { name: 'Record owner membership observation', exact: true }).click(); await pending(page, 'membership');
  assert.equal(await page.getByLabel('Membership/admin (unverified)', { exact: true }).isEnabled(), false);
  assert.equal(await page.getByLabel('Observation date', { exact: true }).isEnabled(), false);
  assert.equal(await page.getByLabel(/^Membership observation notes/).isEnabled(), false);
  await page.getByLabel(/^Notes/).fill('Written during membership request');
  await resolve(page, 'membership', { group: { ...groupA, membership: 'member', revision: 2 } });
  await settled(page);
  assert.equal(await page.getByLabel(/^Notes/).inputValue(), 'Written during membership request');
  assert.equal(await page.getByLabel('Membership/admin (unverified)', { exact: true }).inputValue(), 'member');
  assert.equal(await page.getByLabel('Membership/admin (unverified)', { exact: true }).isEnabled(), true);
  assert.equal(await page.getByLabel('Observation date', { exact: true }).isEnabled(), true);
  assert.equal(await page.getByLabel(/^Membership observation notes/).isEnabled(), true);
  await hold(page, 'save'); await page.getByRole('button', { name: 'Save group plan', exact: true }).click(); await pending(page, 'save');
  const submitted = await page.evaluate(() => (window as any).deferred.save[0].args[0]);
  assert.equal(submitted.membership, 'member'); assert.equal(submitted.revision, 2);
});

test('actual preparation refresh cannot clear draft edits made during the final fetch', async t => {
  const page = await component(t); await select(page); await settled(page);
  await page.getByLabel('Prepared group text', { exact: true }).fill('Submitted draft');
  await hold(page, 'prepare'); await hold(page, 'prepared');
  await page.getByRole('button', { name: 'Save manual handoff', exact: true }).click(); await pending(page, 'prepare');
  await resolve(page, 'prepare', { prepared: {} }); await pending(page, 'prepared');
  await page.getByLabel('Prepared content type').selectOption('reply');
  await page.getByLabel('Native thread URL (required)').fill('https://www.facebook.com/groups/group-a/posts/200');
  await page.getByLabel('Prepared group text', { exact: true }).fill('New unsaved reply');
  await page.getByLabel('Group content relevance', { exact: true }).fill('New relevance');
  await resolve(page, 'prepared', { prepared: [] }); await settled(page);
  assert.equal(await page.getByLabel('Prepared content type').inputValue(), 'reply');
  assert.equal(await page.getByLabel('Native thread URL (required)').inputValue(), 'https://www.facebook.com/groups/group-a/posts/200');
  assert.equal(await page.getByLabel('Prepared group text', { exact: true }).inputValue(), 'New unsaved reply');
  assert.equal(await page.getByLabel('Group content relevance', { exact: true }).inputValue(), 'New relevance');
});

test('actual preparation still clears the submitted draft when no newer edits exist', async t => {
  const page = await component(t); await select(page); await settled(page);
  await page.getByLabel('Prepared content type').selectOption('reply');
  await page.getByLabel('Native thread URL (required)').fill('https://www.facebook.com/groups/group-a/posts/200');
  await page.getByLabel('Prepared group text', { exact: true }).fill('Submitted reply');
  await hold(page, 'prepare'); await page.getByRole('button', { name: 'Save manual handoff', exact: true }).click();
  await resolve(page, 'prepare', { prepared: {} }); await settled(page);
  assert.equal(await page.getByLabel('Prepared group text', { exact: true }).inputValue(), '');
  assert.equal(await page.getByLabel('Prepared content type').inputValue(), 'post');
  assert.equal(await page.getByLabel('Native thread URL (optional)').inputValue(), '');
});

test('actual rapid switching ignores stale failures and responses without leaving loading stuck', async t => {
  const page = await component(t); await hold(page, 'review');
  await select(page, groupA.id); await pending(page, 'review');
  await select(page, groupB.id); await pending(page, 'review', 2);
  await resolve(page, 'review', { group: groupB, prepared: [] }, 1);
  await page.getByLabel(/^Notes/).fill('Group B edits');
  await reject(page, 'review', 'Old Group A error'); await settled(page);
  assert.equal(await page.getByLabel('Group name', { exact: true }).inputValue(), groupB.name);
  assert.equal(await page.getByLabel(/^Notes/).inputValue(), 'Group B edits');
  assert.equal(await page.getByRole('alert').count(), 0);
  await select(page, groupA.id); await pending(page, 'review');
  await page.getByRole('button', { name: 'New group plan', exact: true }).click();
  await page.getByLabel('Group name', { exact: true }).fill('New unsaved Group');
  await resolve(page, 'review', { group: groupA, prepared: [] }); await settled(page);
  assert.equal(await page.getByLabel('Group name', { exact: true }).inputValue(), 'New unsaved Group');
});

test('actual current-request errors preserve edits and release loading for a successful retry', async t => {
  const page = await component(t); await hold(page, 'review'); await select(page);
  await page.getByLabel(/^Notes/).fill('Keep through failure');
  await reject(page, 'review', 'Review unavailable'); await settled(page);
  assert.equal(await page.getByRole('alert').textContent(), 'Review unavailable');
  assert.equal(await page.getByLabel(/^Notes/).inputValue(), 'Keep through failure');
  await page.evaluate(() => { const w = window as any; w.groupsApi.review = w.originalGroupsApi.review; });
  await hold(page, 'save'); await page.getByRole('button', { name: 'Save group plan', exact: true }).click();
  await resolve(page, 'save', { group: { ...groupA, notes: 'Keep through failure', revision: 2 } }); await settled(page);
  assert.equal(await page.getByRole('alert').count(), 0);
  assert.equal(await page.getByLabel(/^Notes/).inputValue(), 'Keep through failure');
});

test('actual identity-change save keeps server approval and answer resets while rebasing a newer restriction edit', async t => {
  const original: GroupPlanDto = { ...groupA, membership: 'member', reviewedAt: '2026-10-27T00:00:00.000Z',
    eligibility: { pagesCanJoin: 'yes', promotionalRestrictions: 'Old restriction', participationApproval: 'approved', postModeration: 'not_required', questions: [{ question: 'Why join?', answer: 'Page A answer' }] } };
  const page = await component(t, [original, groupB]); await select(page); await settled(page);
  await page.getByLabel('Group intended Page', { exact: true }).selectOption('page-b');
  await hold(page, 'save'); await page.getByRole('button', { name: 'Save group plan', exact: true }).click(); await pending(page, 'save');
  await page.getByLabel(/^Promotional restrictions/).fill('New owner restriction');
  await resolve(page, 'save', { group: { ...original, account_id: 'page-b', actingPageId: 'page-b', membership: 'unknown', reviewedAt: null, revision: 2,
    eligibility: { ...original.eligibility, participationApproval: 'unknown', questions: [{ question: 'Why join?', answer: '' }] } } });
  await settled(page);
  assert.equal(await page.getByLabel(/^Promotional restrictions/).inputValue(), 'New owner restriction');
  assert.equal(await page.getByLabel(/^Participation approval/).inputValue(), 'unknown');
  assert.equal(await page.getByLabel(/^Owner answer 1/).inputValue(), '');
  await hold(page, 'save'); await page.getByRole('button', { name: 'Save group plan', exact: true }).click(); await pending(page, 'save');
  const submitted = await page.evaluate(() => (window as any).deferred.save[0].args[0]);
  assert.equal(submitted.reviewedAt, null); assert.equal(submitted.eligibility.participationApproval, 'unknown');
  assert.equal(submitted.eligibility.questions[0].answer, '');
});

test('actual identity-change save preserves an explicitly newer answer without restoring untouched answers', async t => {
  const original: GroupPlanDto = { ...groupA, eligibility: { ...groupA.eligibility, participationApproval: 'approved', questions: [
    { question: 'Why join?', answer: 'Page A old answer' }, { question: 'What fits?', answer: 'Another Page A old answer' },
  ] } };
  const page = await component(t, [original, groupB]); await select(page); await settled(page);
  await page.getByLabel('Group intended Page', { exact: true }).selectOption('page-b');
  await hold(page, 'save'); await page.getByRole('button', { name: 'Save group plan', exact: true }).click(); await pending(page, 'save');
  assert.equal(await page.getByRole('button', { name: 'Add membership question', exact: true }).isEnabled(), false);
  assert.equal(await page.getByRole('button', { name: 'Remove question 1', exact: true }).isEnabled(), false);
  assert.equal(await page.getByLabel(/^Owner answer 1/).isEditable(), true);
  await page.getByLabel(/^Owner answer 1/).fill('Explicit new Page B answer');
  await resolve(page, 'save', { group: { ...original, account_id: 'page-b', actingPageId: 'page-b', revision: 2,
    eligibility: { ...original.eligibility, participationApproval: 'unknown', questions: original.eligibility.questions.map(q => ({ ...q, answer: '' })) } } });
  await settled(page);
  assert.equal(await page.getByLabel(/^Owner answer 1/).inputValue(), 'Explicit new Page B answer');
  assert.equal(await page.getByLabel(/^Owner answer 2/).inputValue(), '');
  assert.equal(await page.getByLabel(/^Participation approval/).inputValue(), 'unknown');
  assert.equal(await page.getByRole('button', { name: 'Add membership question', exact: true }).isEnabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Remove question 1', exact: true }).isEnabled(), true);
});

test('actual stale mutation failure cannot replace the new Group error state or leave loading stuck', async t => {
  const page = await component(t); await select(page); await settled(page);
  await page.getByLabel('Prepared group text', { exact: true }).fill('Group A draft');
  await hold(page, 'prepare'); await page.getByRole('button', { name: 'Save manual handoff', exact: true }).click(); await pending(page, 'prepare');
  await select(page, groupB.id);
  await page.getByLabel('Group name', { exact: true }).fill('Group B edited');
  await reject(page, 'prepare', 'Old Group A prepare error'); await settled(page);
  assert.equal(await page.getByRole('alert').count(), 0);
  assert.equal(await page.getByLabel('Group name', { exact: true }).inputValue(), 'Group B edited');
});

test('actual membership failure releases observation controls and retains their unsaved values', async t => {
  const page = await component(t); await select(page); await settled(page);
  await page.getByLabel('Membership/admin (unverified)', { exact: true }).selectOption('member');
  await page.getByLabel('Observation date', { exact: true }).fill('2026-10-27');
  await page.getByLabel(/^Membership observation notes/).fill('Retain this failed observation');
  await hold(page, 'membership'); await page.getByRole('button', { name: 'Record owner membership observation', exact: true }).click(); await pending(page, 'membership');
  assert.equal(await page.getByLabel('Membership/admin (unverified)', { exact: true }).isEnabled(), false);
  assert.equal(await page.getByLabel('Observation date', { exact: true }).isEnabled(), false);
  assert.equal(await page.getByLabel(/^Membership observation notes/).isEnabled(), false);
  await page.getByLabel(/^Notes/).fill('Registry editing remains available');
  await reject(page, 'membership', 'Observation save failed'); await settled(page);
  assert.equal(await page.getByLabel('Membership/admin (unverified)', { exact: true }).isEnabled(), true);
  assert.equal(await page.getByLabel('Observation date', { exact: true }).isEnabled(), true);
  assert.equal(await page.getByLabel(/^Membership observation notes/).isEnabled(), true);
  assert.equal(await page.getByLabel('Observation date', { exact: true }).inputValue(), '2026-10-27');
  assert.equal(await page.getByLabel(/^Membership observation notes/).inputValue(), 'Retain this failed observation');
  assert.equal(await page.getByLabel(/^Notes/).inputValue(), 'Registry editing remains available');
});

test('empty registry explains registration instead of claiming filters hid saved Groups', async t => {
  const page = await component(t, []);
  assert.equal(await page.getByText('No Groups registered yet', { exact: true }).count(), 1);
  assert.equal(await page.getByText('No matching Groups', { exact: true }).count(), 0);
  assert.match(await page.getByRole('status').innerText(), /Register your first Group/);
  assert.equal(await page.getByLabel('Group name', { exact: true }).inputValue(), '');
});

test('no matching Groups is announced and keyboard Clear Filters preserves selection and newer drafts', async t => {
  const page = await component(t); await select(page); await settled(page);
  await page.getByLabel('Group name', { exact: true }).fill('Unsaved registry name');
  await page.getByLabel('Prepared group text', { exact: true }).fill('Unsaved handoff');
  await page.getByLabel('Search saved Groups', { exact: true }).fill('no match');
  await page.getByRole('combobox', { name: 'Acting Page', exact: true }).selectOption('page-b');
  await page.getByRole('combobox', { name: 'Membership filter', exact: true }).selectOption('admin');
  await page.getByLabel('Category filter', { exact: true }).fill('missing category');
  await page.getByRole('combobox', { name: 'Archive status', exact: true }).selectOption('archived');
  await page.getByLabel('Shortlisted only', { exact: true }).check();
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click(); await settled(page);
  assert.match(await page.getByRole('status').innerText(), /No matching Groups.*current search and filter combination returned no results/s);
  assert.equal(await page.getByLabel('Saved group plan', { exact: true }).inputValue(), groupA.id, 'filtered-out selected Group remains available');
  await page.getByRole('button', { name: 'Clear Filters', exact: true }).press('Enter'); await settled(page);
  assert.deepEqual(await page.evaluate(() => (window as any).listCalls.at(-1)), {});
  assert.equal(await page.getByLabel('Search saved Groups', { exact: true }).inputValue(), '');
  assert.equal(await page.getByRole('combobox', { name: 'Acting Page', exact: true }).inputValue(), '');
  assert.equal(await page.getByRole('combobox', { name: 'Membership filter', exact: true }).inputValue(), '');
  assert.equal(await page.getByLabel('Category filter', { exact: true }).inputValue(), '');
  assert.equal(await page.getByRole('combobox', { name: 'Archive status', exact: true }).inputValue(), 'all');
  assert.equal(await page.getByLabel('Shortlisted only', { exact: true }).isChecked(), false);
  assert.equal(await page.getByText('No matching Groups', { exact: true }).count(), 0);
  assert.equal(await page.getByLabel('Saved group plan', { exact: true }).inputValue(), groupA.id);
  assert.equal(await page.getByLabel('Group name', { exact: true }).inputValue(), 'Unsaved registry name');
  assert.equal(await page.getByLabel('Prepared group text', { exact: true }).inputValue(), 'Unsaved handoff');
  assert.equal(await page.getByLabel('Saved group plan', { exact: true }).locator('option').count(), 3);
});

test('Clear Filters preserves an unsaved new Group form and handoff draft', async t => {
  const page = await component(t);
  await page.getByLabel('Group name', { exact: true }).fill('Unsaved new Group');
  await page.getByLabel('Prepared group text', { exact: true }).fill('New draft');
  await page.getByLabel('Search saved Groups', { exact: true }).fill('no match');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click(); await settled(page);
  await page.getByRole('button', { name: 'Clear Filters', exact: true }).click(); await settled(page);
  assert.equal(await page.getByLabel('Group name', { exact: true }).inputValue(), 'Unsaved new Group');
  assert.equal(await page.getByLabel('Prepared group text', { exact: true }).inputValue(), 'New draft');
  assert.equal(await page.getByLabel('Saved group plan', { exact: true }).inputValue(), '');
});

test('archived-only registry is not called unregistered and clearing includes archived Groups', async t => {
  const archived = { ...groupA, archivedAt: '2026-10-27T01:00:00.000Z' };
  const page = await component(t, [archived]);
  assert.equal(await page.getByText('No matching Groups', { exact: true }).count(), 1);
  assert.equal(await page.getByText('No Groups registered yet', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Clear Filters', exact: true }).press('Space'); await settled(page);
  assert.equal(await page.getByRole('combobox', { name: 'Archive status', exact: true }).inputValue(), 'all');
  assert.match(await page.getByLabel('Saved group plan', { exact: true }).innerText(), /Archived/);
  assert.equal(await page.getByText('No matching Groups', { exact: true }).count(), 0);
});

test('loading and failed filters never claim that no Groups are registered', async t => {
  const page = await component(t);
  await hold(page, 'list');
  await page.getByLabel('Search saved Groups', { exact: true }).fill('no match');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click(); await pending(page, 'list');
  assert.equal(await page.getByText('No matching Groups', { exact: true }).count(), 0);
  assert.equal(await page.getByText('No Groups registered yet', { exact: true }).count(), 0);
  await reject(page, 'list', 'Fixture filter failure'); await settled(page);
  assert.equal(await page.getByRole('alert').innerText(), 'Fixture filter failure');
  assert.equal(await page.getByText('No Groups registered yet', { exact: true }).count(), 0);
  assert.equal(await page.getByLabel('Saved group plan', { exact: true }).locator('option').count(), 3);
});
