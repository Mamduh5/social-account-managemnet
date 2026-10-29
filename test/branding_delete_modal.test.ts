import test, { before, after, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';

// Real Branding Studio and native keyboard events with in-memory API fixtures.
// No application server, database, media files, or network is used.
let browser: Browser;
let bundle: string;
before(async () => {
  const root = path.resolve(__dirname, '..');
  const result = await build({
    absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"' },
    stdin: { resolveDir: root, loader: 'tsx', contents: `
      import React from './client/node_modules/react';
      import {createRoot} from './client/node_modules/react-dom/client';
      import {api} from './client/src/api/client';
      import {BrandingStudioView} from './client/src/views/BrandingStudioView';
      const variants = [{id:'variant-1',preset_name:'Fixture preset',movement_preset:'static_corner',watermark_text:'fixture',width:320,height:568,file_size:1048576,previewUrl:'',downloadUrl:''}];
      api.getAccounts=async()=>({accounts:[{id:'account-1',name:'Fixture account',handle:'@fixture',platform:'facebook'}]});
      api.getVideos=async()=>({videos:[{id:'video-1',title:'Fixture master',width:320,height:568,aspect_ratio:'9:16',duration:1}]});
      api.getBrandedVariants=async()=>({variants:[...variants]});
      api.deleteBrandedVariant=async id=>{
        window.deletions.push(id);
        if(window.deferDelete) await new Promise(resolve=>window.finishDelete=resolve);
        if(window.failDelete) throw new Error('Fixture deletion failure');
        variants.splice(variants.findIndex(v=>v.id===id),1);
        return {success:true};
      };
      window.deletions=[];
      createRoot(document.getElementById('root')).render(<BrandingStudioView/>);
    ` },
  });
  bundle = result.outputFiles[0].text;
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
});
after(async () => { await browser?.close(); });

async function component(t: TestContext): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 600 } });
  const page = await context.newPage(); page.setDefaultTimeout(5_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Video and avatar requests are irrelevant and cannot leave this fixture.
  await page.route('**/*', route => route.abort());
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.setContent('<button id="outside">Outside root</button><div id="root"></div>');
  await page.addScriptTag({ content: bundle });
  await page.getByRole('button', { name: 'Delete variant (Master video is preserved)', exact: true }).waitFor();
  return page;
}

async function open(page: Page) {
  await page.getByRole('button', { name: 'Delete variant (Master video is preserved)', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.textContent === 'Cancel');
}

test('confirmation identifies the variant, traps focus, and Cancel or Escape makes no deletion', async t => {
  const page = await component(t);
  for (const action of ['Cancel', 'Escape']) {
    await open(page);
    const dialog = page.getByRole('dialog', { name: 'Delete branded variant?', exact: true });
    assert.equal(await dialog.getAttribute('aria-modal'), 'true');
    assert.match(await dialog.innerText(), /Fixture preset/);
    assert.match(await dialog.innerText(), /Fixture master/);
    assert.match(await dialog.innerText(), /variant-1/);
    assert.match(await dialog.innerText(), /master video is preserved/i);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press(i < 4 ? 'Tab' : 'Shift+Tab');
      assert.equal(await page.evaluate(() => !!document.querySelector('[role="dialog"]')?.contains(document.activeElement)), true);
    }
    if (action === 'Cancel') await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    else await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('button', { name: 'Delete variant (Master video is preserved)', exact: true }).evaluate(el => el === document.activeElement), true);
  }
  assert.deepEqual(await page.evaluate(() => (window as any).deletions), []);
});

test('pending confirmation sends exactly one selected ID and cannot be dismissed or submitted twice', async t => {
  const page = await component(t); await open(page);
  await page.evaluate(() => { (window as any).deferDelete = true; });
  await page.getByRole('button', { name: 'Delete variant', exact: true }).click();
  await page.waitForFunction(() => !!(window as any).finishDelete);
  assert.equal(await page.getByRole('button', { name: 'Deleting...', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Cancel', exact: true }).isDisabled(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 1);
  await page.evaluate(() => (window as any).finishDelete());
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.deepEqual(await page.evaluate(() => (window as any).deletions), ['variant-1']);
  assert.equal(await page.getByRole('button', { name: 'Delete variant (Master video is preserved)', exact: true }).count(), 0);
});

test('failed deletion displays an error and leaves the dialog cancellable', async t => {
  const page = await component(t); await open(page);
  await page.evaluate(() => { (window as any).failDelete = true; });
  await page.getByRole('button', { name: 'Delete variant', exact: true }).click();
  assert.equal(await page.getByRole('alert').innerText(), 'Fixture deletion failure');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('button', { name: 'Delete variant (Master video is preserved)', exact: true }).count(), 1);
});
