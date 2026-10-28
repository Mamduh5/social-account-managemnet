import test, { before, after, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';

// Real React components and native keyboard events; no app, server, DB or network.
let browser: Browser;
let bundle: string;
before(async () => {
  const result = await build({
    absWorkingDir: path.resolve(__dirname, '..'), bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"' },
    stdin: { resolveDir: path.resolve(__dirname, '..'), loader: 'tsx', contents: `
      import React, {useState} from './client/node_modules/react';
      import {createRoot} from './client/node_modules/react-dom/client';
      import {CreateCategoryModal} from './client/src/components/accounts/CreateCategoryModal';
      function Harness() {
        const [open,setOpen]=useState(false), [showTrigger,setShowTrigger]=useState(true);
        const [form,setForm]=useState({name:'',description:'',color:'#D95D39'}), [error,setError]=useState('');
        window.removeTrigger=()=>setShowTrigger(false);
        window.closeFromParent=()=>setOpen(false);
        return <>
          {showTrigger && <button onClick={()=>setOpen(true)}>New Category</button>}
          <button id="background-button">Background action</button>
          <input aria-label="Background input" />
          <p role="status">{error}</p>
          <CreateCategoryModal isOpen={open} onClose={()=>{window.closes++;setOpen(false);}}
            formData={form} setFormData={setForm} onSubmit={async e=>{
              e.preventDefault();window.submissions.push({...form});
              if(window.deferSubmit) await new Promise(resolve=>window.finishSubmit=resolve);
              if(window.failSubmit){setError('Fixture validation failure');return;}
              setOpen(false);
            }} />
        </>;
      }
      window.closes=0;window.submissions=[];
      const root=createRoot(document.getElementById('root'));
      window.unmount=()=>root.unmount();root.render(<Harness/>);
    ` },
  });
  bundle = result.outputFiles[0].text;
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
});
after(async () => { await browser?.close(); });

async function component(t: TestContext): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage(); page.setDefaultTimeout(5_000);
  const errors: string[] = [], requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); assert.deepEqual(requests, []); });
  await page.setContent('<button id="outside">Outside root</button><div id="already-inert" inert>Previously inert</div><div id="root"></div>');
  await page.addScriptTag({ content: bundle });
  await page.getByRole('button', { name: 'New Category', exact: true }).waitFor();
  return page;
}
async function open(page: Page) {
  await page.getByRole('button', { name: 'New Category', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.id === 'new-category-name');
}
async function closed(page: Page) {
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('button', { name: 'New Category', exact: true }).evaluate(el => el === document.activeElement), true);
}

test('category dialog is named, focuses its input, and typing does not recapture focus on rerender', async t => {
  const page = await component(t); await open(page);
  const dialog = page.getByRole('dialog', { name: 'Create Content Category', exact: true });
  assert.equal(await dialog.getAttribute('aria-modal'), 'true');
  await page.getByLabel('Category Name', { exact: true }).fill('Fixture category');
  await page.getByLabel('Description', { exact: true }).fill('Retain focus while updating controlled inputs');
  assert.equal(await page.getByLabel('Description', { exact: true }).evaluate(el => el === document.activeElement), true);
  assert.equal(await page.getByLabel('Category Name', { exact: true }).inputValue(), 'Fixture category');
});

test('native Tab and Shift+Tab wrap inside category dialog and cannot reach the background', async t => {
  const page = await component(t); await open(page);
  await page.getByLabel('Category Name', { exact: true }).press('Shift+Tab');
  assert.equal(await page.getByRole('button', { name: 'Close modal', exact: true }).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.getByRole('button', { name: 'Create Category', exact: true }).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('button', { name: 'Close modal', exact: true }).evaluate(el => el === document.activeElement), true);
  for (let index = 0; index < 16; index++) {
    await page.keyboard.press(index < 8 ? 'Tab' : 'Shift+Tab');
    assert.equal(await page.evaluate(() => !!document.querySelector('[role="dialog"]')?.contains(document.activeElement)), true);
  }
  assert.equal(await page.locator('#background-button').evaluate(el => !!el.closest('[inert]')), true);
  await page.evaluate(() => document.getElementById('background-button')!.focus());
  assert.equal(await page.evaluate(() => !!document.querySelector('[role="dialog"]')?.contains(document.activeElement)), true);
});

test('Escape, Cancel and close button restore trigger focus across repeated openings and remove the trap', async t => {
  const page = await component(t);
  for (const action of ['Escape', 'Cancel', 'Close modal']) {
    await open(page);
    if (action === 'Escape') await page.keyboard.press('Escape');
    else await page.getByRole('button', { name: action, exact: true }).click();
    await closed(page);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#background-button').evaluate(el => el === document.activeElement), true, 'background keyboard navigation returns after closing');
    assert.equal(await page.locator('#already-inert').evaluate(el => (el as HTMLElement).inert), true, 'pre-existing inert state survives');
    assert.equal(await page.locator('#outside').evaluate(el => (el as HTMLElement).inert), false);
  }
  assert.equal(await page.evaluate(() => (window as any).closes), 3);
});

test('required validation and successful keyboard form submission retain category payload and focus restoration', async t => {
  const page = await component(t); await open(page);
  await page.getByLabel('Category Name', { exact: true }).press('Enter');
  assert.equal(await page.getByRole('dialog').count(), 1);
  assert.equal(await page.evaluate(() => (window as any).submissions.length), 0, 'native validation blocks the empty required name');
  await page.getByLabel('Category Name', { exact: true }).fill('Keyboard category');
  await page.getByLabel('Description', { exact: true }).fill('Description preserved');
  await page.getByLabel('Category Name', { exact: true }).press('Enter');
  await closed(page);
  assert.deepEqual(await page.evaluate(() => (window as any).submissions), [{ name: 'Keyboard category', description: 'Description preserved', color: '#D95D39' }]);
});

test('Escape and dismiss controls cannot close during a pending submit; success releases focus', async t => {
  const page = await component(t); await open(page);
  await page.evaluate(() => { (window as any).deferSubmit = true; });
  await page.getByLabel('Category Name', { exact: true }).fill('Pending category');
  await page.getByRole('button', { name: 'Create Category', exact: true }).click();
  await page.waitForFunction(() => !!(window as any).finishSubmit);
  for (const name of ['Cancel', 'Close modal', 'Create Category']) assert.equal(await page.getByRole('button', { name, exact: true }).isDisabled(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 1);
  await page.evaluate(() => (window as any).finishSubmit());
  await closed(page);
  assert.equal(await page.evaluate(() => (window as any).submissions.length), 1);
});

test('failed category validation retains entered values and permits safe Cancel afterwards', async t => {
  const page = await component(t); await open(page);
  await page.evaluate(() => { (window as any).failSubmit = true; });
  await page.getByLabel('Category Name', { exact: true }).fill('Keep this category');
  await page.getByRole('button', { name: 'Create Category', exact: true }).click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(el => el.textContent?.trim() === 'Cancel' && !el.disabled));
  assert.equal(await page.getByLabel('Category Name', { exact: true }).inputValue(), 'Keep this category');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await closed(page);
});

test('removed trigger and external close leave background usable without a lingering focus trap', async t => {
  const page = await component(t); await open(page);
  await page.evaluate(() => (window as any).removeTrigger());
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.locator('#background-button').focus(); await page.keyboard.press('Tab');
  assert.equal(await page.getByLabel('Background input', { exact: true }).evaluate(el => el === document.activeElement), true);
});

test('external close and unmount restore inert branches and remove keyboard listeners', async t => {
  const page = await component(t); await open(page);
  await page.evaluate(() => (window as any).closeFromParent()); await closed(page);
  await open(page); await page.evaluate(() => (window as any).unmount());
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.locator('#outside').evaluate(el => (el as HTMLElement).inert), false);
  await page.locator('#outside').focus(); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') === null), true);
});
