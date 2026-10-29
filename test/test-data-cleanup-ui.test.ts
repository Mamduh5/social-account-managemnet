import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium,type Browser} from 'playwright';

let browser:Browser;
let bundle:string;
before(async()=>{
  const result=await build({
    absWorkingDir:path.resolve(__dirname,'..'),bundle:true,write:false,platform:'browser',format:'iife',
    define:{'process.env.NODE_ENV':'"test"'},
    stdin:{resolveDir:path.resolve(__dirname,'..'),loader:'tsx',contents:`
      import React from './client/node_modules/react';
      import {createRoot} from './client/node_modules/react-dom/client';
      import {TestDataManagerView} from './client/src/views/TestDataManagerView';
      import {api} from './client/src/api/client';
      const master={type:'video',id:'master',name:'Test Animation',classification:'owner_marked_test',source:'manual_upload',status:'library',eligibility:'review',eligible:false,dependencies:[],eligibilityReason:'Select the related local history.',updatedAt:null,protection:''};
      const account={...master,type:'account',id:'owner',name:'Owner Page',eligibility:'protected',eligibilityReason:'Social accounts, credentials and connections are preserved.'};
      window.previewCalls=[];window.deleteCalls=[];window.deleted=false;
      api.getTestData=async()=>({records:window.deleted?[account]:[master,account],hasMore:false,limit:20,offset:0});
      api.previewTestDataDeletion=async records=>{
        window.previewCalls.push(records.map(record=>({...record})));
        const complete=records.length===3;
        return {previewId:'preview-'+window.previewCalls.length,canDelete:complete,total:complete?6:0,
          records:records.map(record=>({...record,name:record.id,eligible:complete,reason:complete?'Reviewed SCC records only':'Select related local history',dependencies:[],rows:complete?[{table:record.type,id:record.id}]:[]})),
          suggestedRecords:complete?[]:[{type:'branded_video',id:'variant',name:'Saved render'},{type:'publishing_post',id:'post',name:'Terminal simulator history'}],
          unchanged:['Social accounts, credentials and connections are retained.','Local media files, Pipeline data and external posts are retained.'],additionalChanges:complete?['One deletion audit retains publication receipts.']:[],reversible:false,confirmationPhrase:'DELETE'};
      };
      api.deleteTestData=async(previewId,confirmation)=>{
        window.deleteCalls.push({previewId,confirmation});
        await new Promise(resolve=>window.finishDeletion=resolve);
        window.deleted=true;return {count:3,deleted:[],auditId:'fixture-audit'};
      };
      createRoot(document.getElementById('root')).render(<TestDataManagerView onBack={()=>{}}/>);
    `},
  });
  bundle=result.outputFiles[0].text;
  browser=await chromium.launch({headless:true,channel:'msedge'});
});
after(async()=>{await browser?.close();});

test('cleanup requires explicit dependency selection and exact confirmation, preserving selection on cancel and blocking duplicate deletion',async()=>{
  const context=await browser.newContext();
  const page=await context.newPage();page.setDefaultTimeout(5000);
  const errors:string[]=[],requests:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
  try {
    await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle});
    const master=page.getByRole('checkbox',{name:'Select Master video Test Animation (master)',exact:true});
    const account=page.getByRole('checkbox',{name:'Select Account Owner Page (owner)',exact:true});
    await master.check();assert.equal(await account.isDisabled(),true);
    const review=page.getByRole('button',{name:'Review Deletion',exact:true});await review.click();
    const dialog=page.getByRole('dialog',{name:'Review deletion',exact:true});await dialog.waitFor();
    await page.getByRole('region',{name:'Required removable dependencies'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Delete selected records',exact:true}).isDisabled(),true);
    assert.deepEqual(await page.evaluate(()=> (window as any).previewCalls[0]),[{type:'video',id:'master'}]);
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal(await master.isChecked(),true,'cancel preserves the owner selection');
    assert.equal(await review.evaluate(element=>element===document.activeElement),true,'cancel restores focus');
    await review.click();
    await page.getByRole('button',{name:'Add listed dependencies and review again',exact:true}).click();
    await page.getByText('Proposed deletion:',{exact:false}).waitFor();
    assert.deepEqual(await page.evaluate(()=> (window as any).previewCalls.at(-1)),[{type:'video',id:'master'},{type:'branded_video',id:'variant'},{type:'publishing_post',id:'post'}]);
    const confirmation=page.getByLabel('Type DELETE to permanently delete these rows', {exact:true});
    await confirmation.fill('delete');
    const remove=page.getByRole('button',{name:'Delete selected records',exact:true});
    assert.equal(await remove.isDisabled(),true,'confirmation is exact and case sensitive');
    await confirmation.fill('DELETE');await remove.click();
    await page.waitForFunction(()=> (window as any).deleteCalls.length===1);
    await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true,'an in-flight deletion cannot be dismissed');
    assert.equal(await page.getByRole('button',{name:'Cancel',exact:true}).isDisabled(),true);
    await page.evaluate(()=> (window as any).finishDeletion());
    await dialog.waitFor({state:'detached'});
    await page.getByText('Deleted 3 selected records.',{exact:true}).waitFor();
    assert.equal(await account.isDisabled(),true);
    assert.equal(await master.count(),0,'removed local records leave the manager list');
    assert.equal((await page.evaluate(()=> (window as any).deleteCalls)).length,1);
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[],'component fixture uses no server or external provider');
  } finally {await context.close();}
});
