// Isolated browser acceptance: all API responses are synthetic and all other
// network origins are blocked. No owner application or database is accessed.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
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
    const errors = [], deletes = [];
    let failInventory = false, failDelete = false, blocked = false, releaseDelete;
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
          { type: 'category', id: offset ? 'record-2' : 'record-1', name: offset ? 'Second record' : 'First record', classification: 'unknown', updatedAt: null, protection: 'Owner review required', dependencies: ['No category references'], eligible: true, eligibilityReason: 'No dependencies found' },
          { type: 'account', id: 'protected-1', name: 'Protected account', classification: 'protected', updatedAt: null, protection: 'Externally connected', dependencies: ['Published post'], eligible: false, eligibilityReason: 'Publishing history exists' },
        ];
        return route.fulfill({ json: { records, offset, limit: 20, hasMore: !offset && search !== 'missing' } });
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
    await page.getByText('First record').waitFor();
    const bg = await page.locator('main').evaluate(element => getComputedStyle(element).backgroundColor);
    if (theme === 'dark') backgrounds.set(width, bg); else assert.notEqual(bg, backgrounds.get(width));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.getByRole('button', { name: 'Review Deletion' }).isDisabled(), true);
    assert.equal(await page.getByRole('checkbox', { name: /Protected account/ }).isDisabled(), true);
    await page.getByRole('checkbox', { name: /First record/ }).check();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByText('Second record').waitFor();
    assert.equal(await page.getByText('1 selected (maximum 25)').count(), 1);
    await page.getByRole('button', { name: 'Previous' }).click();
    await page.getByText('First record').waitFor();

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

    await page.getByLabel('Record type').selectOption('category');
    await page.getByLabel('Search name or ID').fill('missing');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByText('No records found for these filters.').waitFor();
    failInventory = true;
    await page.getByLabel('Search name or ID').fill('error');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('alert').getByText(/Synthetic failure/).waitFor();
    failInventory = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.getByText('First record').waitFor();
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${theme} ${width}px: selection, review, focus, cancel, stale/block, confirmed delete, filters and states`);
  }
} finally {
  await browser?.close();
  await server.close();
}
